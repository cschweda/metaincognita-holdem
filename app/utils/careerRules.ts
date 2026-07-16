/**
 * Career mode — pure movement/settlement rules over a plain state shape.
 * No storage, no Vue: the Pinia store binds these to config + localStorage.
 * Rules (see the spec): promote at promoteBuyIns of the NEXT stake AND
 * promoteMinHands at the current tier; forced down below demoteBuyIns of
 * the CURRENT stake; bust below one tier-1 buy-in. Session-end only.
 */

export interface CareerConfig {
  startingBankroll: number
  buyInBB: number
  promoteBuyIns: number
  promoteMinHands: number
  demoteBuyIns: number
  playerCount: number
  tiers: Record<number, string[]>
}

export interface StakeLevel { level: number; bb: number; sb: number }

export type SessionEnd = 'leave' | 'felted' | 'timeout' | 'abandoned'

export interface CareerSessionRecord {
  tier: number
  buyIn: number
  cashOut: number
  hands: number
  endedBy: SessionEnd
  at: string
}

export interface ArchivedRun {
  startedAt: string
  endedAt: string
  peakBankroll: number
  peakTier: number
  totalHands: number
  sessionCount: number
  endedBy: 'bust' | 'retired'
}

export interface CareerState {
  version: 1
  bankroll: number
  currentTier: number
  handsAtTier: number
  totalHands: number
  peakBankroll: number
  peakTier: number
  runStartedAt: string
  sessions: CareerSessionRecord[]
  archivedRuns: ArchivedRun[]
  pendingSession: { tier: number; buyIn: number; startedAt: string } | null
}

export function freshCareer(cfg: CareerConfig, now: string, archivedRuns: ArchivedRun[] = []): CareerState {
  return {
    version: 1,
    bankroll: cfg.startingBankroll,
    currentTier: 1,
    handsAtTier: 0,
    totalHands: 0,
    peakBankroll: cfg.startingBankroll,
    peakTier: 1,
    runStartedAt: now,
    sessions: [],
    archivedRuns,
    pendingSession: null,
  }
}

export function buyInFor(tier: number, cfg: CareerConfig, stakes: StakeLevel[]): number {
  const stake = stakes.find(s => s.level === tier)
  if (!stake) throw new Error(`Unknown stake tier ${tier}`)
  return stake.bb * cfg.buyInBB
}

export function startSession(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[], now: string): CareerState {
  if (state.pendingSession) throw new Error('A career session is already in progress')
  const buyIn = buyInFor(state.currentTier, cfg, stakes)
  if (state.bankroll < buyIn) throw new Error('Bankroll cannot cover the buy-in')
  return {
    ...state,
    bankroll: state.bankroll - buyIn,
    pendingSession: { tier: state.currentTier, buyIn, startedAt: now },
  }
}

export function settleSession(state: CareerState, cashOut: number, hands: number, endedBy: SessionEnd, now: string): CareerState {
  const pending = state.pendingSession
  if (!pending) throw new Error('No career session to settle')
  const bankroll = state.bankroll + cashOut
  return {
    ...state,
    bankroll,
    peakBankroll: Math.max(state.peakBankroll, bankroll),
    handsAtTier: state.handsAtTier + hands,
    totalHands: state.totalHands + hands,
    sessions: [...state.sessions, { tier: pending.tier, buyIn: pending.buyIn, cashOut, hands, endedBy, at: now }],
    pendingSession: null,
  }
}

export function evaluateMovement(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[]): { state: CareerState; moved: 'up' | 'down' | null } {
  const maxTier = Math.max(...stakes.map(s => s.level))
  if (state.currentTier < maxTier) {
    const nextBuyIn = buyInFor(state.currentTier + 1, cfg, stakes)
    if (state.bankroll >= cfg.promoteBuyIns * nextBuyIn && state.handsAtTier >= cfg.promoteMinHands) {
      const tier = state.currentTier + 1
      return {
        moved: 'up',
        state: { ...state, currentTier: tier, handsAtTier: 0, peakTier: Math.max(state.peakTier, tier) },
      }
    }
  }
  if (state.currentTier > 1) {
    const floor = cfg.demoteBuyIns * buyInFor(state.currentTier, cfg, stakes)
    if (state.bankroll < floor) {
      return {
        moved: 'down',
        state: { ...state, currentTier: state.currentTier - 1, handsAtTier: 0 },
      }
    }
  }
  return { state, moved: null }
}

export function isBust(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[]): boolean {
  return state.bankroll < buyInFor(1, cfg, stakes)
}

export function archiveRun(state: CareerState, cfg: CareerConfig, endedBy: 'bust' | 'retired', now: string): CareerState {
  const run: ArchivedRun = {
    startedAt: state.runStartedAt,
    endedAt: now,
    peakBankroll: state.peakBankroll,
    peakTier: state.peakTier,
    totalHands: state.totalHands,
    sessionCount: state.sessions.length,
    endedBy,
  }
  return freshCareer(cfg, now, [...state.archivedRuns, run])
}

/**
 * Validate a persisted (user-editable) payload into a usable CareerState.
 * Returns null when the money/tier core is unusable (caller starts fresh);
 * repairs non-critical fields and filters malformed history entries so a
 * bad byte in localStorage can never crash-loop a page.
 */
export function sanitizeCareerState(raw: unknown, stakes: StakeLevel[], now: string): CareerState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return null

  const nonNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
  const tierValid = (t: unknown): t is number =>
    typeof t === 'number' && Number.isFinite(t) && stakes.some(s => s.level === t)

  if (!nonNeg(r.bankroll)) return null
  if (!tierValid(r.currentTier)) return null
  const bankroll = r.bankroll
  const currentTier = r.currentTier

  const SESSION_ENDS: SessionEnd[] = ['leave', 'felted', 'timeout', 'abandoned']
  const sessions = (Array.isArray(r.sessions) ? r.sessions : []).filter((s): s is CareerSessionRecord => {
    if (typeof s !== 'object' || s === null) return false
    const e = s as Record<string, unknown>
    return typeof e.tier === 'number' && Number.isFinite(e.tier)
      && nonNeg(e.buyIn) && nonNeg(e.cashOut) && nonNeg(e.hands)
      && SESSION_ENDS.includes(e.endedBy as SessionEnd)
      && typeof e.at === 'string'
  })

  const archivedRuns = (Array.isArray(r.archivedRuns) ? r.archivedRuns : []).filter((a): a is ArchivedRun => {
    if (typeof a !== 'object' || a === null) return false
    const e = a as Record<string, unknown>
    return typeof e.startedAt === 'string' && typeof e.endedAt === 'string'
      && nonNeg(e.peakBankroll) && typeof e.peakTier === 'number' && Number.isFinite(e.peakTier)
      && nonNeg(e.totalHands) && nonNeg(e.sessionCount)
      && (e.endedBy === 'bust' || e.endedBy === 'retired')
  })

  const p = r.pendingSession as Record<string, unknown> | null | undefined
  const pendingSession = (typeof p === 'object' && p !== null
    && tierValid(p.tier) && nonNeg(p.buyIn) && p.buyIn > 0 && typeof p.startedAt === 'string')
    ? { tier: p.tier, buyIn: p.buyIn, startedAt: p.startedAt }
    : null

  return {
    version: 1,
    bankroll,
    currentTier,
    handsAtTier: nonNeg(r.handsAtTier) ? r.handsAtTier : 0,
    totalHands: nonNeg(r.totalHands) ? r.totalHands : 0,
    peakBankroll: nonNeg(r.peakBankroll) ? Math.max(r.peakBankroll, bankroll) : bankroll,
    peakTier: tierValid(r.peakTier) ? Math.max(r.peakTier, currentTier) : currentTier,
    runStartedAt: typeof r.runStartedAt === 'string' ? r.runStartedAt : now,
    sessions,
    archivedRuns,
    pendingSession,
  }
}

export function refundAbandoned(state: CareerState, now: string): CareerState {
  const pending = state.pendingSession
  if (!pending) return state
  return {
    ...state,
    bankroll: state.bankroll + pending.buyIn,
    sessions: [...state.sessions, { tier: pending.tier, buyIn: pending.buyIn, cashOut: pending.buyIn, hands: 0, endedBy: 'abandoned', at: now }],
    pendingSession: null,
  }
}
