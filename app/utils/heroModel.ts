/**
 * Nemesis — the persistent "book" on the hero. Decay-weighted aggregates of
 * the same signals the in-session window tracks, plus a per-persona
 * familiarity ledger. Pure functions; the Pinia store binds storage.
 * Storage is O(1) regardless of hands played.
 */
import type { HeroProfile } from './botDecision'
import type { HeroHandRecord } from '~/stores/heroProfile'

export interface NemesisConfig {
  halfLifeHands: number
  minHandsForReads: number
  famDivisor: number
  famFull: number
  blendDiv: number
  blendCap: number
}

interface DecayedRate { num: number; den: number }

export interface PersistentHeroModel {
  version: 1
  effectiveHands: number
  vpip: DecayedRate
  foldTo3Bet: DecayedRate
  foldToCbet: DecayedRate
  aggression: { raises: number; calls: number }
  sizing: { strongSum: number; strongN: number; weakSum: number; weakN: number }
  familiarity: Record<string, number>
}

export function emptyModel(): PersistentHeroModel {
  return {
    version: 1,
    effectiveHands: 0,
    vpip: { num: 0, den: 0 },
    foldTo3Bet: { num: 0, den: 0 },
    foldToCbet: { num: 0, den: 0 },
    aggression: { raises: 0, calls: 0 },
    sizing: { strongSum: 0, strongN: 0, weakSum: 0, weakN: 0 },
    familiarity: {},
  }
}

const rate = (r: DecayedRate, fallback = 0) => (r.den > 0 ? r.num / r.den : fallback)

/** Fold one hand into the book: decay everything, then add the observation. */
export function decayAndRecord(
  model: PersistentHeroModel,
  record: HeroHandRecord,
  opponents: string[],
  cfg: NemesisConfig,
): PersistentHeroModel {
  const λ = Math.pow(2, -1 / cfg.halfLifeHands)
  const d = (r: DecayedRate, addNum: number, addDen: number): DecayedRate => ({
    num: r.num * λ + addNum,
    den: r.den * λ + addDen,
  })
  const familiarity: Record<string, number> = {}
  for (const [name, h] of Object.entries(model.familiarity)) {
    const decayed = h * λ
    if (decayed > 0.01) familiarity[name] = decayed
  }
  for (const name of opponents) familiarity[name] = (familiarity[name] ?? 0) + 1

  return {
    ...model,
    effectiveHands: model.effectiveHands * λ + 1,
    vpip: d(model.vpip, record.enteredPot ? 1 : 0, 1),
    foldTo3Bet: d(model.foldTo3Bet, record.foldedTo3Bet ? 1 : 0, record.faced3Bet ? 1 : 0),
    foldToCbet: d(model.foldToCbet, record.foldedToCbet ? 1 : 0, record.facedCbet ? 1 : 0),
    aggression: {
      raises: model.aggression.raises * λ + record.raiseCount,
      calls: model.aggression.calls * λ + record.callCount,
    },
    sizing: {
      strongSum: model.sizing.strongSum * λ,
      strongN: model.sizing.strongN * λ,
      weakSum: model.sizing.weakSum * λ,
      weakN: model.sizing.weakN * λ,
    },
    familiarity,
  }
}

/** A classified showdown sizing sample (already averaged over the hand). */
export function recordSizing(model: PersistentHeroModel, avgSizing: number, wasStrong: boolean): PersistentHeroModel {
  return {
    ...model,
    sizing: wasStrong
      ? { ...model.sizing, strongSum: model.sizing.strongSum + avgSizing, strongN: model.sizing.strongN + 1 }
      : { ...model.sizing, weakSum: model.sizing.weakSum + avgSizing, weakN: model.sizing.weakN + 1 },
  }
}

function sizingTell(model: PersistentHeroModel): HeroProfile['betSizingTell'] {
  const { strongSum, strongN, weakSum, weakN } = model.sizing
  if (strongN < 4 || weakN < 4) return undefined
  const strongAvgSizing = strongSum / strongN
  const weakAvgSizing = weakSum / weakN
  if (Math.abs(strongAvgSizing - weakAvgSizing) < 0.15) {
    return { hasTell: false, bigWithValue: false, strongAvgSizing, weakAvgSizing }
  }
  return { hasTell: true, bigWithValue: strongAvgSizing > weakAvgSizing, strongAvgSizing, weakAvgSizing }
}

export function modelToHeroProfile(model: PersistentHeroModel, cfg: NemesisConfig): HeroProfile | null {
  if (model.effectiveHands < cfg.minHandsForReads) return null
  const { raises, calls } = model.aggression
  return {
    vpip: rate(model.vpip),
    foldTo3Bet: rate(model.foldTo3Bet),
    foldToCbet: rate(model.foldToCbet),
    aggression: calls > 0 ? raises / calls : raises > 0 ? 2.0 : 0,
    handsTracked: Math.round(model.effectiveHands),
    betSizingTell: sizingTell(model),
  }
}

/** 0 for strangers → 1 at famFull hands faced; log curve. */
export function familiarityOf(model: PersistentHeroModel, personaName: string, cfg: NemesisConfig): number {
  const h = model.familiarity[personaName] ?? 0
  if (h <= 0) return 0
  return Math.min(1, Math.log(1 + h / cfg.famDivisor) / Math.log(1 + cfg.famFull / cfg.famDivisor))
}

/** Sample-size-weighted mean of the live session window and the book. */
export function blendProfiles(
  session: HeroProfile | undefined,
  book: HeroProfile | null,
  cfg: NemesisConfig,
): HeroProfile | undefined {
  if (!book) return session
  if (!session) return book
  const wS = session.handsTracked
  const wP = Math.min(book.handsTracked / cfg.blendDiv, cfg.blendCap)
  const total = wS + wP
  if (total <= 0) return undefined
  const mix = (a: number, b: number) => (a * wS + b * wP) / total
  return {
    vpip: mix(session.vpip, book.vpip),
    foldTo3Bet: mix(session.foldTo3Bet, book.foldTo3Bet),
    foldToCbet: mix(session.foldToCbet, book.foldToCbet),
    aggression: mix(session.aggression, book.aggression),
    handsTracked: Math.max(session.handsTracked, book.handsTracked),
    // The sharper read wins the tell: session tell if present, else the book's
    betSizingTell: session.betSizingTell ?? book.betSizingTell,
  }
}

/**
 * Human-readable scouting report. Triggers on the SAME thresholds
 * applyHeroAdaptation acts on (fold-to-3bet > 0.60, VPIP > 0.40,
 * aggression < 0.5, sizing tell) — the panel never claims an exploit the
 * engine isn't applying. foldToCbet is tracked in the model for the
 * coaching pillar but the engine has no c-bet counter-exploit yet, so no
 * read line for it.
 */
export function describeReads(model: PersistentHeroModel, cfg: NemesisConfig): string[] {
  const p = modelToHeroProfile(model, cfg)
  if (!p) return []
  const reads: string[] = []
  if (p.foldTo3Bet > 0.60) {
    reads.push(`Folds to 3-bets ${(p.foldTo3Bet * 100).toFixed(0)}% → 3-betting you wider`)
  }
  if (p.vpip > 0.40) {
    reads.push(`Plays ${(p.vpip * 100).toFixed(0)}% of hands → bluffing you less, value-betting thinner`)
  }
  if (p.aggression < 0.5) {
    reads.push(`Rarely raises (AF ${p.aggression.toFixed(2)}) → betting into you more`)
  }
  if (p.betSizingTell?.hasTell) {
    reads.push(p.betSizingTell.bigWithValue
      ? 'Sizing tell: your big bets mean strength → folding to them, calling your small bets lighter'
      : 'Sizing tell: your big bets are bluffs → calling them down lighter')
  }
  return reads
}
