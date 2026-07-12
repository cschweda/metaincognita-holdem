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
