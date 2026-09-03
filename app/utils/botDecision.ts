/**
 * Bot decision engine — makes preflop and postflop betting decisions based on persona config.
 * Includes a tilt system that modifies bot behavior after consecutive losses or big pots lost.
 *
 * Each decision is probabilistic, driven by the bot's VPIP, PFR, aggression,
 * bluffFreq, and creativeFreq stats. Over many hands, a bot's observed
 * behavior should statistically match its config. The tilt system widens ranges
 * and boosts aggression proportionally to a per-bot tiltMultiplier.
 *
 * Card-aware mode: when holeCards/community are provided in the context,
 * decisions are weighted by actual hand strength (chen score preflop,
 * hand rank + draws postflop). A bot with VPIP 0.30 plays the TOP 30%
 * of hands, not a random 30%.
 */
import type { Card } from './cards'
import { chenScore, chenPlusScore, bestHand, detectDraws, type DrawInfo } from './handAnalysis'
import { handRankIndex, handPercentile, handCategory, holeCardsToNotation, type HandCategory } from './ranges'
import type { Rng } from './rng'
import type { TableReads } from './tableReads'
import config from '../../holdem.config'

// Strategy constants — single source of truth in holdem.config.ts (see the
// strategy block there for tuning rules; changes require a probe re-run)
const STRAT = config.strategy

export interface BotProfile {
  vpip: number        // 0.10–0.50 — probability of voluntarily entering a pot
  pfr: number         // 0.05–0.40 — probability of raising preflop (subset of vpip)
  aggression: number  // 0.30–2.00 — multiplier on bet/raise frequency postflop
  bluffFreq: number   // 0.03–0.30 — probability of betting/raising with nothing
  creativeFreq: number // 0.01–0.15 — probability of unorthodox plays
  threeBetFreq?: number // 0.03–0.25 — probability of 3-betting when facing an open
  fourBetFreq?: number  // 0.01–0.15 — probability of 4-betting when facing a 3-bet
  fiveBetFreq?: number  // 0.005–0.03 — probability of 5-betting when facing a 4-bet
  donkBetFreq?: number  // 0.00–0.25 — probability of leading into the preflop raiser (non-pro leak)
  limpFreq?: number     // 0–1 — chance to open-limp (vs fold) hands in the PFR–VPIP band first-in
  styleBias?: Partial<Record<HandCategory, number>> // percentile shift per hand category (negative = plays it wider)
  betSizeMult?: number  // sizing personality: <1 small-ball, >1 big-bet (default 1.0)
  overbetFreq?: number  // chance to overbet (1.2–1.5x pot) river value/bluffs (default 0.03)
}

/**
 * A configured bot persona — BotProfile plus the identity/meta fields the
 * holdem.config personas carry. holdem.config.ts annotates its personas
 * array with this type, so field-name typos fail typecheck instead of
 * silently reading as undefined.
 */
export interface Persona extends BotProfile {
  name: string
  tiltMultiplier?: number
  consistency?: number
  leak?: string
}

// ─── Hero Adaptation ──────────────────────────────────────────

export interface HeroProfile {
  vpip: number           // hero's observed VPIP (0–1)
  foldTo3Bet: number     // how often hero folds to 3-bets (0–1)
  foldToCbet: number     // how often hero folds to c-bets (0–1)
  aggression: number     // hero's observed aggression factor
  handsTracked: number   // total hands in the tracking window
  readStrength?: number  // 0..1 — how much of the adaptation this bot has earned (nemesis familiarity); absent = 1
  betSizingTell?: {      // detected bet-sizing pattern (after 8+ showdown hands)
    hasTell: boolean
    bigWithValue: boolean  // true = hero bets big with strong, small with bluffs
    strongAvgSizing: number
    weakAvgSizing: number
  }
}

// ─── Tilt System ───────────────────────────────────────────────

export interface TiltState {
  consecutiveLosses: number  // running count of losses in a row
  tilted: boolean            // currently in tilt
  severity: number           // 0 = none, 0.5 = mild, 1.0 = full
  handsRemaining: number     // hands until tilt decays to 0
}

export function createTiltState(): TiltState {
  return { consecutiveLosses: 0, tilted: false, severity: 0, handsRemaining: 0 }
}

/**
 * Call after each hand with the result. Updates tilt state.
 * `participated` = the bot voluntarily put chips in (or reached showdown).
 * Folding preflop is NOT a loss — it neither tilts nor calms a player.
 */
export function updateTilt(
  state: TiltState,
  won: boolean,
  lostBigPot: boolean,
  config: {
    consecutiveLosses: number
    bigLossThreshold: number
    mildTiltThreshold: number
    fullTiltThreshold: number
    decayHands: [number, number]
  },
  tiltMultiplier: number = 1.0,
  participated: boolean = true,
  rng: Rng = Math.random,
): void {
  if (!participated) return
  if (won) {
    state.consecutiveLosses = 0
    return
  }

  state.consecutiveLosses++

  // Tilt-prone bots (high multiplier) trigger faster
  // Phellmuth (2.5x) tilts after just 1-2 losses; Pvey (0.3x) needs 10+
  const effectiveThreshold = Math.max(1, Math.round(config.consecutiveLosses / tiltMultiplier))
  const shouldTilt =
    lostBigPot ||
    state.consecutiveLosses >= effectiveThreshold

  if (shouldTilt && !state.tilted) {
    state.tilted = true
    const [min, max] = config.decayHands
    state.handsRemaining = min + Math.floor(rng() * (max - min + 1))
  }

  // Scale severity
  if (state.tilted) {
    const effectiveFull = Math.max(1, Math.round(config.fullTiltThreshold / tiltMultiplier))
    const effectiveMild = Math.max(1, Math.round(config.mildTiltThreshold / tiltMultiplier))
    if (lostBigPot || state.consecutiveLosses >= effectiveFull) {
      state.severity = 1.0
    } else if (state.consecutiveLosses >= effectiveMild) {
      state.severity = 0.5
    }
    if (state.consecutiveLosses > effectiveFull) {
      state.handsRemaining = Math.max(state.handsRemaining, 3)
    }
  }
}

/**
 * Call at the start of each hand to decay tilt.
 */
export function decayTilt(state: TiltState): void {
  if (!state.tilted) return
  state.handsRemaining--
  if (state.handsRemaining <= 0) {
    state.tilted = false
    state.severity = 0
  }
}

/**
 * Returns a tilt-modified copy of the base profile. The original is not mutated.
 * tiltMultiplier scales how severely tilt affects this specific bot:
 *   - Phellmuth (2.5): massive tilt swings
 *   - Pvey (0.3): barely affected
 *   - Default (1.0): standard tilt
 */
export function applyTilt(
  base: BotProfile,
  tilt: TiltState,
  boosts: { aggressionBoost: number; vpipWiden: number; bluffBoost: number; pfrBoost: number },
  tiltMultiplier: number = 1.0,
): BotProfile {
  if (!tilt.tilted) return base
  const s = tilt.severity * tiltMultiplier
  // Cap tilt VPIP widening at +50% of base (a 20% player goes to 30% max, not 65%)
  // This prevents tilt-prone players like Phellmuth from becoming unrecognizable
  const maxVpip = Math.min(base.vpip * 1.5, 0.50)
  const maxPfr = Math.min(base.pfr * 1.5, 0.40)
  return {
    vpip: Math.min(base.vpip + boosts.vpipWiden * s, maxVpip),
    pfr: Math.min(base.pfr + boosts.pfrBoost * s, maxPfr),
    aggression: Math.min(base.aggression + boosts.aggressionBoost * s, 3.0),
    bluffFreq: Math.min(base.bluffFreq + boosts.bluffBoost * s, 0.50),
    creativeFreq: Math.min(base.creativeFreq + 0.03 * s, 0.25),
    threeBetFreq: base.threeBetFreq !== undefined ? Math.min(base.threeBetFreq + 0.04 * s, 0.35) : undefined,
    fourBetFreq: base.fourBetFreq !== undefined ? Math.min(base.fourBetFreq + 0.02 * s, 0.20) : undefined,
    fiveBetFreq: base.fiveBetFreq !== undefined ? Math.min(base.fiveBetFreq + 0.01 * s, 0.05) : undefined,
    donkBetFreq: base.donkBetFreq,
    limpFreq: base.limpFreq,
    styleBias: base.styleBias,
    betSizeMult: base.betSizeMult,
    overbetFreq: base.overbetFreq,
  }
}

/**
 * Generate a random off-strategy action — the "brain fart" play.
 * Real pro mistakes are wrong folds, loose calls, and mis-sized stabs —
 * not random escalation. Raises here are rare and small so a misplay
 * doesn't cascade into a fake raise war.
 */
function generateRandomAction(ctx: DecisionContext, strongMade: boolean = false): BotAction {
  const rng = ctx.rng ?? Math.random
  const r = rng()
  if (ctx.toCall === 0) {
    // Not facing a bet: check (80%) or a smallish stab (20%).
    // A checked monster is just a slowplay, so no special-casing needed here.
    if (r < 0.80) return { type: 'check' }
    const betSize = Math.round(ctx.pot * (0.3 + rng() * 0.2))
    return { type: 'raise', amount: Math.min(Math.max(betSize, ctx.bb), ctx.chips) }
  }
  // Facing a big bet (>10bb or >30% of stack), a brain fart is almost always
  // a wrong fold — nobody "accidentally" calls off 100bb with a random hand.
  // But nobody punts the nuts by accident either: a strong made hand (two pair+)
  // calls rather than folding, so a misplay is never a folded monster.
  if (ctx.toCall > ctx.bb * 10 || ctx.toCall > ctx.chips * 0.3) {
    if (strongMade) return { type: 'call' }
    return r < 0.92 ? { type: 'fold' } : { type: 'call' }
  }
  // Facing a normal bet: a strong made hand never folds (call, occasionally raise).
  if (strongMade) {
    if (r < 0.85) return { type: 'call' }
    return { type: 'raise', amount: Math.min(Math.round(ctx.currentBet * 1.5), ctx.chips + ctx.playerBet) }
  }
  // Weak/unknown hand: fold (45%), call (50%), min-raise-ish (5%)
  if (r < 0.45) return { type: 'fold' }
  if (r < 0.95) return { type: 'call' }
  const raiseSize = Math.round(ctx.currentBet * 1.5)
  return { type: 'raise', amount: Math.min(raiseSize, ctx.chips + ctx.playerBet) }
}

export interface DecisionContext {
  street: 'preflop' | 'flop' | 'turn' | 'river'
  toCall: number       // amount needed to call (0 = no bet facing)
  pot: number
  currentBet: number
  playerBet: number    // what this player has already put in this round
  chips: number        // player's remaining stack
  bb: number
  numActivePlayers: number
  raiseLevel?: number  // preflop escalation: 1=open, 2=3-bet, 3=4-bet, 4=5-bet (default 1)
  position?: string          // table position (UTG, MP, CO, BTN, SB, BB)
  holeCards?: [Card, Card]  // bot's hole cards (for card-aware decisions)
  community?: Card[]        // community cards (for card-aware postflop)
  rng?: Rng                 // injectable random source (default Math.random) — seeded in sims/tests
  // Street awareness — what this bot did on earlier streets
  wasPreflopRaiser?: boolean  // was this bot the last preflop aggressor?
  preflopCallers?: number     // how many players called preflop (multiway pot?)
  checkedThisStreet?: boolean // did this bot already check this street? (for check-raise detection)
  streetHistory?: {           // this bot's action on each prior street
    flop?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
    turn?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
  }
  // Table Flow — dynamic adjustments based on recent results
  tableDynamics?: {
    dominantPlayerId?: number   // who is on a heater (most wins in window)
    dominantWinRate: number     // their win rate in the window (0-1)
    myRecentWinRate: number     // this bot's win rate in the window (0-1)
    avgStackDepth: number       // average stack in BB across the table
    handsInWindow: number       // how many hands are in the tracking window
  }
  // Table reads — public, table-wide (see utils/tableReads.ts)
  tableReads?: TableReads
}

export interface BotAction {
  type: 'fold' | 'check' | 'call' | 'raise'
  amount?: number      // total raise-to amount (only for raise)
}

/**
 * Make a bot decision based on persona config and game context.
 * Includes a small consistency check — inconsistent bots occasionally
 * make a random off-strategy play (fold when they should call, raise
 * with nothing, etc.). Fires rarely: 1-3% for disciplined pros,
 * up to 8-10% for loose cannons.
 */
export function decideBotAction(profile: BotProfile, ctx: DecisionContext, consistency?: number, heroProfile?: HeroProfile): BotAction {
  // Information hygiene: callers may hold the full runout (dealt up-front),
  // but a bot may only see the board its street allows. Slice here, at the
  // single entry point, so no caller can leak future cards.
  if (ctx.community && ctx.community.length > 0) {
    const visible = ctx.street === 'flop' ? 3 : ctx.street === 'turn' ? 4 : ctx.street === 'river' ? 5 : 0
    if (ctx.community.length > visible) {
      ctx = { ...ctx, community: visible > 0 ? ctx.community.slice(0, visible) : undefined }
    }
  }

  const rng = ctx.rng ?? Math.random
  const { street } = ctx

  // ─── Consistency check: occasional off-strategy play ─────
  if (consistency !== undefined && consistency < 1.0) {
    const missplayChance = 1.0 - consistency // e.g., 0.97 consistency = 3% chance
    if (rng() < missplayChance) {
      // A brain-fart must never fold a strong made hand (two pair+) — real pro
      // mistakes are wrong folds of marginal hands, loose calls, and mis-sized
      // stabs, not punting the nuts.
      const strongMade = !!(ctx.holeCards && ctx.community && ctx.community.length >= 3
        && postflopHandStrength(ctx.holeCards, ctx.community) >= 0.55)
      return generateRandomAction(ctx, strongMade)
    }
  }

  // ─── Apply hero adaptation if enough data ─────
  // readStrength (nemesis familiarity) scales the adaptation delta:
  // a stranger plays the hero straight, a regular plays the full exploit.
  const readStrength = heroProfile?.readStrength ?? 1
  let adaptedProfile = heroProfile && heroProfile.handsTracked >= 10 && readStrength > 0
    ? lerpProfiles(profile, applyHeroAdaptation(profile, heroProfile), readStrength)
    : profile

  // ─── Table Flow: adjust for table dynamics ─────
  adaptedProfile = applyTableDynamics(adaptedProfile, ctx.tableDynamics)

  const rand = rng()

  // ─── Preflop ───────────────────────────────────────────────
  if (street === 'preflop') {
    return decidePreflopAction(adaptedProfile, ctx, rand)
  }

  // ─── Postflop ──────────────────────────────────────────────
  return decidePostflopAction(adaptedProfile, ctx, rand, heroProfile)
}

/**
 * Adjust bot profile based on observed hero tendencies.
 * Returns a modified copy — original is not mutated.
 */
/** Lerp every numeric field from base toward full by t (nemesis familiarity). */
function lerpProfiles(base: BotProfile, full: BotProfile, t: number): BotProfile {
  if (t >= 1) return full
  if (t <= 0) return base
  const out: BotProfile = { ...full }
  for (const k of Object.keys(full) as (keyof BotProfile)[]) {
    const b = base[k]
    const f = full[k]
    if (typeof b === 'number' && typeof f === 'number') {
      ;(out as unknown as Record<string, unknown>)[k as string] = b + (f - b) * t
    }
  }
  return out
}

function applyHeroAdaptation(base: BotProfile, hero: HeroProfile): BotProfile {
  const adapted = { ...base }

  // Hero folds to 3-bets a lot → bot 3-bets more aggressively
  if (hero.foldTo3Bet > 0.60) {
    const boost = (hero.foldTo3Bet - 0.60) * 1.5 // up to ~0.6 boost at 100% fold rate
    if (adapted.threeBetFreq !== undefined) {
      adapted.threeBetFreq = Math.min(adapted.threeBetFreq * (1 + boost), 0.35)
    }
    if (adapted.fourBetFreq !== undefined) {
      adapted.fourBetFreq = Math.min(adapted.fourBetFreq * (1 + boost * 0.5), 0.20)
    }
  }

  // Hero is very loose (VPIP > 40%) → bot reduces bluffs, tightens value range
  if (hero.vpip > 0.40) {
    const tighten = (hero.vpip - 0.40) * 2.0 // up to ~0.2 factor at 50% vpip
    adapted.bluffFreq = adapted.bluffFreq * (1 - tighten * 0.5)
  }

  // Hero is passive (low aggression) → bot bluffs more
  if (hero.aggression < 0.5) {
    const boost = (0.5 - hero.aggression) * 0.5 // up to ~0.25 factor at 0 aggression
    adapted.bluffFreq = Math.min(adapted.bluffFreq * (1 + boost), 0.40)
  }

  return adapted
}

// ─── Table Flow: Table Dynamics ───────────────────────────────
/**
 * Adjusts bot profile based on table flow — the shifting momentum of the game.
 * Real players adapt when someone is running hot or the table shifts.
 *
 * - When a dominant player is on a heater: tighten up, trap more, bluff less
 * - When this bot is running cold: widen slightly to avoid being blinded out
 * - When this bot is running hot: tighten slightly (protect the lead)
 * - Deep stacks: play more speculative hands; short stacks: tighten up
 */
function applyTableDynamics(
  base: BotProfile,
  dynamics?: DecisionContext['tableDynamics'],
): BotProfile {
  if (!dynamics || dynamics.handsInWindow < 10) return base

  const adapted = { ...base }

  // Someone is dominating the table (win rate > 28% in recent window)
  if (dynamics.dominantWinRate > 0.28) {
    const dominance = (dynamics.dominantWinRate - 0.28) * 3 // 0–0.5 scale
    // Tighten value range and reduce bluffs vs the heater
    adapted.bluffFreq = adapted.bluffFreq * (1 - dominance * 0.4)
    // But increase aggression when we do play — trap and punish
    adapted.aggression = Math.min(adapted.aggression * (1 + dominance * 0.3), 2.5)
  }

  // This bot is running cold (win rate < 10% over window)
  if (dynamics.myRecentWinRate < 0.10 && dynamics.handsInWindow >= 15) {
    const coldness = (0.10 - dynamics.myRecentWinRate) * 5 // 0–0.5 scale
    // Widen slightly to stay active — real players loosen when card-dead
    adapted.vpip = Math.min(adapted.vpip * (1 + coldness * 0.15), 0.55)
    adapted.pfr = Math.min(adapted.pfr * (1 + coldness * 0.10), 0.45)
  }

  // This bot is running hot (win rate > 25%)
  if (dynamics.myRecentWinRate > 0.25) {
    const hotness = (dynamics.myRecentWinRate - 0.25) * 3 // 0–0.5 scale
    // Tighten slightly to protect the lead — real winners get cautious
    adapted.vpip = adapted.vpip * (1 - hotness * 0.10)
    adapted.bluffFreq = adapted.bluffFreq * (1 - hotness * 0.25)
  }

  return adapted
}

// ─── Card-Aware Helpers ───────────────────────────────────────

/**
 * Maps a chen score to an approximate hand percentile (0 = best, 1 = worst).
 * A percentile of 0.15 means this hand is in the top 15% of starting hands.
 */
function chenToPercentile(chen: number): number {
  // Maps chen score to the actual % of starting hands at or above this strength.
  // Calibrated empirically against all 1326 unique hold'em starting hands.
  if (chen >= 20) return 0.005  // AA (6 combos = 0.5%)
  if (chen >= 16) return 0.009  // KK
  if (chen >= 14) return 0.014  // QQ, AKs
  if (chen >= 12) return 0.021  // JJ, AQs, AKo
  if (chen >= 10) return 0.044  // TT, AJs+, KQs
  if (chen >= 8)  return 0.107  // 99, broadways
  if (chen >= 7)  return 0.178  // 88, suited connectors
  if (chen >= 6)  return 0.255  // 77, suited one-gappers
  if (chen >= 5)  return 0.433  // 66, suited connectors
  if (chen >= 4)  return 0.517  // 55, suited gappers
  if (chen >= 3)  return 0.671  // 44, low suited
  if (chen >= 2)  return 0.789  // 33, 22
  if (chen >= 1)  return 0.882  // low suited junk
  return 1.0                     // absolute garbage
}

/**
 * Returns a hand strength score 0-1 for postflop decisions.
 * 0 = nothing, 1 = monster. Includes draw equity.
 */
function postflopHandStrength(holeCards: [Card, Card], community: Card[], knownDraws?: DrawInfo[]): number {
  if (community.length < 3) return 0.5

  const result = bestHand(holeCards, community)
  if (!result) return 0

  // Base strength from hand rank (0-8 → 0-1)
  let strength = 0
  switch (result.rank) {
    case 0: strength = 0.08; break  // high card
    case 1: strength = 0.30; break  // one pair
    case 2: strength = 0.55; break  // two pair
    case 3: strength = 0.70; break  // trips
    case 4: strength = 0.80; break  // straight
    case 5: strength = 0.85; break  // flush
    case 6: strength = 0.92; break  // full house
    case 7: strength = 0.97; break  // quads
    case 8: strength = 1.00; break  // straight flush
  }

  // High card with overcards to the board — two overcards are much stronger than one
  // (Fix 7: AK on a low board has ~6 outs to top pair = ~24% equity, not just 12%)
  if (result.rank === 0) {
    const boardMax = Math.max(...community.map(c => c.rank))
    const overcards = holeCards.filter(c => c.rank > boardMax).length
    if (overcards === 1) strength = 0.15
    if (overcards === 2) {
      // Two overcards with suited/connected have more equity (pair + backdoors)
      const suited = holeCards[0].suit === holeCards[1].suit
      strength = suited ? 0.25 : 0.22
    }
  }

  // Kicker-aware pair strength (Fix 4: top pair ace kicker vs top pair deuce kicker)
  if (result.rank === 1) {
    const boardRanks = community.map(c => c.rank)
    const boardMax = Math.max(...boardRanks)
    const pairRank = result.score[1]
    const holeRanks = holeCards.map(c => c.rank).sort((a, b) => b - a)

    // Determine kicker: the hole card that didn't make the pair
    let kickerRank = holeRanks[0]
    if (holeRanks[0] === pairRank && holeRanks[1] !== pairRank) kickerRank = holeRanks[1]
    else if (holeRanks[1] === pairRank && holeRanks[0] !== pairRank) kickerRank = holeRanks[0]

    if (pairRank >= boardMax) {
      // Top pair: 0.38 (deuce kicker) to 0.48 (ace kicker)
      const kickerBonus = (kickerRank - 2) / 12 * 0.10
      strength = 0.38 + kickerBonus
    } else if (pairRank >= boardMax - 2) {
      // Second/third pair: 0.28 to 0.35
      strength = 0.28 + (kickerRank - 2) / 12 * 0.07
    }
    // Otherwise stays at base one-pair = 0.30

    // Overpair bonus (pocket pair higher than all board cards)
    if (holeRanks[0] === holeRanks[1] && holeRanks[0] > boardMax) {
      strength = Math.max(strength, 0.48 + (holeRanks[0] - 10) / 4 * 0.05) // AA overpair ~0.53
    }
  }

  // ─── Board-relative discounts ─────────────────────────────
  // A hand is only as good as its improvement OVER the board. "Two pair" where
  // one pair sits on the board is really one pair; board trips are everyone's
  // trips; on the river, playing the board exactly is near-worthless.
  const boardCounts = new Map<number, number>()
  for (const bc of community) boardCounts.set(bc.rank, (boardCounts.get(bc.rank) ?? 0) + 1)
  const holeRankPair = holeCards.map(c => c.rank)
  const boardMaxRank = Math.max(...community.map(c => c.rank))

  if (result.rank === 2) { // two pair
    const pairHigh = result.score[1]!
    const pairLow = result.score[2]!
    const boardHasHigh = (boardCounts.get(pairHigh) ?? 0) >= 2
    const boardHasLow = (boardCounts.get(pairLow) ?? 0) >= 2
    if (boardHasHigh && boardHasLow) {
      strength = 0.15 // double-paired board — we play the board plus a kicker
    } else if (boardHasHigh || boardHasLow) {
      // One of "our" pairs is the board's: this is one pair on a paired board
      const ourPair = boardHasHigh ? pairLow : pairHigh
      if (holeRankPair[0] === holeRankPair[1] && holeRankPair[0]! > boardMaxRank) strength = 0.50 // overpair
      else if (ourPair >= boardMaxRank) strength = 0.46  // top pair equivalent
      else strength = 0.34                               // mid/bottom pair equivalent
    }
  }

  if (result.rank === 3) { // trips
    const tripRank = result.score[1]!
    if ((boardCounts.get(tripRank) ?? 0) >= 3) {
      // Board trips — our hand is a kicker, not a made monster
      const kick = Math.max(...holeRankPair) as number
      strength = 0.30 + (kick - 2) / 12 * 0.12
    }
  }

  if (community.length === 5) {
    // River: if our best five IS the board (no improvement), we have nothing
    const boardOnly = bestHand([], community)
    if (boardOnly && boardOnly.rank === result.rank) {
      let sameScore = true
      for (let i = 0; i < Math.min(result.score.length, boardOnly.score.length); i++) {
        if (result.score[i] !== boardOnly.score[i]) { sameScore = false; break }
      }
      if (sameScore) strength = Math.min(strength, 0.12)
    }
  }

  // Nut-awareness on paired boards: a flush or straight loses value when the
  // board is paired, because a full house (or better) is now possible. Without
  // this, a bot stacks off a non-nut flush into a likely boat on a paired board.
  if (result.rank === 4 || result.rank === 5) {
    const boardMaxCount = Math.max(...boardCounts.values())
    const boardPairs = [...boardCounts.values()].filter(c => c >= 2).length
    if (boardMaxCount >= 3 || boardPairs >= 2) {
      strength *= 0.62 // trips / two-pair board — a full house is very likely against us
    } else if (boardPairs === 1) {
      strength *= 0.82 // single paired board — proceed with caution, don't auto-commit
    }
  }

  // Add draw equity with draw-type-specific blocker discounts
  // Flush draws: 9 outs, ~5% blocked on average → 0.95 discount
  // OESD: 8 outs, ~10% blocked → 0.90 discount
  // Gutshot: 4 outs, ~15-20% blocked → 0.82 discount (fewer outs = blockers matter more)
  const draws = knownDraws ?? detectDraws(holeCards, community)
  for (const draw of draws) {
    if (draw.type.includes('Flush draw')) strength = Math.max(strength, 0.33 * 0.95)
    if (draw.type.includes('Open-ended')) strength = Math.max(strength, 0.28 * 0.90)
    if (draw.type.includes('Gutshot')) strength = Math.max(strength, 0.18 * 0.82)
  }

  return strength
}

/** Pot-fraction bet size with persona sizing personality (betSizeMult) applied. */
function sizedBet(pot: number, baseFrac: number, profile: BotProfile, bb: number): number {
  return Math.max(Math.round(pot * baseFrac * (profile.betSizeMult ?? 1.0)), bb)
}

/**
 * Roll for a river overbet (1.2-1.5x pot) — the polarized big-bet line.
 * Overbettors (Dwan) use this for both value and bluffs. Returns size or null.
 */
function maybeOverbet(pot: number, profile: BotProfile, bb: number, rng: Rng = Math.random): number | null {
  const freq = (profile.overbetFreq ?? 0.03) * (profile.aggression >= 1.3 ? 1.5 : 1.0)
  if (rng() >= freq) return null
  return Math.max(Math.round(pot * (1.2 + rng() * 0.3)), bb)
}

/**
 * Thin value bet on the river with a strong-but-not-monster made hand
 * (top pair / overpair, strength ~0.42–0.55). Small sizing (~30–40% pot) that
 * gets called by worse and folds out nothing — the value the old logic left on
 * the table by check-calling every non-monster river. Returns size or null.
 */
function maybeThinValueRiver(
  pot: number,
  profile: BotProfile,
  bb: number,
  strength: number,
  isMultiway: boolean,
  isInPosition: boolean,
  tableMult: number = 1.0,   // station table: value-bet thinner
  rng: Rng = Math.random,
): number | null {
  if (strength < 0.42 || strength >= 0.55) return null
  // The table-read boost applies OUTSIDE the frequency cap — otherwise an
  // aggressive persona (whose uncapped base is already near/at 0.6) gets its
  // boost clipped away almost entirely (Fix wave 2026-09-03, item 1).
  const base =
    0.35
      * (isMultiway ? 0.5 : 1.0)   // multiway, someone has us beat more often
      * (isInPosition ? 1.15 : 0.9)
      * profile.aggression
  const freq = Math.min(base, 0.6) * tableMult
  if (rng() >= freq) return null
  return sizedBet(pot, 0.30 + rng() * 0.12, profile, bb)
}

function decidePreflopAction(profile: BotProfile, ctx: DecisionContext, rand: number): BotAction {
  const rng = ctx.rng ?? Math.random
  const { toCall, chips, bb, currentBet, playerBet } = ctx
  const raiseLevel = ctx.raiseLevel ?? 1
  const stackBB = chips / bb

  // ─── Short-stack push/fold mode (<25BB) ────────────────
  // Fix 5: Position-aware push/fold — late position shoves wider
  if (stackBB < 25 && toCall > 0 && ctx.holeCards) {
    const handPct = handRankIndex(ctx.holeCards) >= 0
      ? handPercentile(ctx.holeCards)
      : chenToPercentile(chenPlusScore(ctx.holeCards, ctx.position ?? '', { vpip: profile.vpip, aggression: profile.aggression }))
    const latePos = ['BTN', 'D', 'D/BTN', 'CO', 'D/SB'].includes(ctx.position ?? '')
    // Late position shoves wider; desperate stacks (<10BB) shove widest
    const shoveThreshold = stackBB < 10
      ? (latePos ? 0.35 : 0.28) // desperate: wide in LP, moderate in EP
      : (latePos ? 0.25 : 0.18) // short: standard LP vs EP thresholds
    if (handPct < shoveThreshold) {
      return { type: 'raise', amount: chips + playerBet } // all-in
    }
    return { type: 'fold' }
  }

  // ─── Effective ranges ──────────────────────────────────
  // Position is handled by Chen+ (which adjusts hand strength by seat).
  // Profile VPIP/PFR are used directly as the threshold.
  const effectiveVpip = profile.vpip
  const effectivePfr = profile.pfr

  // ─── Card-aware hand strength (uses Chen+ for position/style context) ──
  // Pre-computed range lookup: convert hole cards to percentile via the ranked 169-hand list
  // Position adjustment shifts the percentile (late position = hands rank higher)
  let handPct = rand
  let rawHandPct = rand // percentile without position shift/jitter — for equity-driven jam decisions
  if (ctx.holeCards) {
    const idx = handRankIndex(ctx.holeCards)
    if (idx >= 0) {
      // Combo-weighted percentile: "handPct < VPIP" plays VPIP% of dealt hands
      handPct = handPercentile(ctx.holeCards)
      rawHandPct = handPct
      // Position shift: late position makes hands more playable
      // D/SB = button in heads-up; table lives in config.strategy.posShift
      handPct = Math.max(0, Math.min(1, handPct + (STRAT.posShift[ctx.position ?? ''] ?? 0)))
      // Per-persona range shape: Negreanu's suited connectors, Hellmuth's big cards
      if (profile.styleBias) {
        const bias = profile.styleBias[handCategory(holeCardsToNotation(ctx.holeCards))] ?? 0
        handPct = Math.max(0, Math.min(1, handPct + bias))
      }
      // Small jitter for variety (premium hands jitter less)
      const jitter = handPct < 0.10 ? 0.01 : handPct < 0.25 ? 0.03 : 0.05
      handPct = Math.max(0, Math.min(1, handPct + (rng() - 0.5) * jitter))
    } else {
      // Fallback to Chen+ for any edge case
      const chenMax = chenPlusScore(ctx.holeCards, ctx.position ?? '', { vpip: profile.vpip, aggression: profile.aggression })
      handPct = chenToPercentile(chenMax)
      rawHandPct = handPct
    }
  }

  if (toCall === 0) {
    // Modern poker: open-raise or fold. Limping is almost never correct.
    // Use VPIP as the opening range (not just PFR) — if you're playing the hand, raise it.
    // PFR/VPIP ratio should be ~0.80+ for TAGs, ~0.65+ for loose players.
    if (handPct < effectiveVpip) {
      const latePosOpen = ['BTN', 'D', 'D/BTN', 'D/SB', 'CO'].includes(ctx.position ?? '')
      const openMult = (latePosOpen ? 2.2 : 2.5) + (profile.aggression - 1) * 0.4
      const raiseSize = Math.round(bb * openMult * (profile.betSizeMult ?? 1.0))
      return { type: 'raise', amount: Math.min(raiseSize + playerBet, chips + playerBet) }
    }
    return { type: 'check' }
  }

  // Completing the SB or defending the BB — modern poker: raise-heavy defense
  // BB gets a discount so defends wider, but still 3-bets aggressively
  // SB should mostly 3-bet or fold (worst postflop position)
  if (toCall <= bb && raiseLevel <= 1) {
    const isBB = ctx.position === 'BB'
    const isSB = ctx.position === 'SB' || ctx.position === 'D/SB'

    // Non-blind first-in (or over limpers): modern raise-or-fold. The PFR–VPIP
    // gap only open-limps for personas with limpFreq (Hellmuth, loose-passives);
    // everyone else folds those hands rather than limping them.
    // First-in opens use a widened threshold (×1.6, capped at VPIP): overall
    // observed PFR averages first-in opens with the much rarer 3-bet spots,
    // so the open range must run wider than the headline PFR to realize it.
    // Narrow-gap TAGs cap at VPIP = pure raise-or-fold first-in.
    if (!isBB && !isSB) {
      const openRange = Math.min(effectivePfr * 1.6, effectiveVpip)
      if (handPct < openRange) {
        const raiseSize = Math.round(currentBet * (2.5 + (profile.aggression - 1) * 0.5) * (profile.betSizeMult ?? 1.0))
        return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
      }
      if (handPct < effectiveVpip && rng() < (profile.limpFreq ?? 0)) {
        return { type: 'call' } // open-limp / over-limp
      }
      return { type: 'fold' }
    }

    const isHeadsUp = ctx.numActivePlayers <= 2
    const defenseRange = isHeadsUp
      ? Math.min(effectiveVpip * 2.5, 0.85) // heads-up: defend ~85% of hands
      : isBB ? Math.min(effectiveVpip * 1.25, 0.70) : effectiveVpip

    // SB: 3-bet or fold strategy (very little flatting from worst position)
    // BB: 3-bet strong range, flat with discount hands
    const raiseThreshold = isSB
      ? defenseRange * 0.70   // SB raises 70% of defense range
      : defenseRange * 0.45   // BB raises 45% of defense range (has positional discount)

    if (handPct < defenseRange) {
      if (handPct < raiseThreshold) {
        const raiseSize = Math.round(currentBet * (2.5 + (profile.aggression - 1) * 0.5) * (profile.betSizeMult ?? 1.0))
        return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
      }
      return { type: 'call' }
    }
    return { type: 'fold' }
  }

  // ─── Facing a raise — value + bluff 3-bet split ─────────
  // Value 3-bets: card quality driven (handPct < threshold)
  // Bluff 3-bets: persona randomness driven (rng draw < threshold)

  // ─── Raise-size awareness (applies to all facing-raise levels) ──
  // A 2.5bb open and a 25bb jam are different worlds: defense ranges shrink
  // continuously with size, and jam-like raises get premium-only continues.
  const openSizeBB = currentBet / bb
  const sizePenalty = openSizeBB <= 3 ? 1.0 : Math.pow(3 / openSizeBB, STRAT.preflop.sizePenaltyExp)
  const jamLike = toCall >= chips * STRAT.preflop.jamToCallStackRatio || (raiseLevel <= 1 && toCall >= bb * STRAT.preflop.jamOpenBBThreshold)

  if (jamLike) {
    // Vs a jam the continue range is equity-driven (raw percentile) and
    // narrows with the jam SIZE: a 15-25bb shove gets called by ~top 4.5%
    // (TT+/AQs+/AKo — short stacks shove wide), but a 100bb open-jam
    // represents only premiums, so it gets called by ~KK+ (top ~1%).
    // Without this, a hero jamming only QQ+/AK prints money off TT/AQ calls.
    // Facing a RERAISE-jam (raiseLevel 2+, we're in a raised pot) the table
    // must collectively defend wide enough that any-two jamming loses, so the
    // shrink is floored there — but the floor itself must decay with jam size,
    // or it pays off premium-only reraise-jammers: a flat 0.85 floor called
    // 100bb 3-bet jams with top ~3.4% (TT/AQ) per player, ~20%+ of jams
    // table-wide, which is exactly the nit-value exploit. A 20-40bb reraise
    // jam still gets the full wide defense; at 100bb the floor works out to
    // ~top 2% (QQ+/AK), at several hundred bb effectively KK+.
    const jamBB = toCall / bb
    const sizeShrink = Math.min(1, Math.pow(20 / Math.max(jamBB, 15), STRAT.preflop.jamSizeShrinkExp))
    const reraiseJamFloor = STRAT.preflop.reraiseJamFloorBase * Math.sqrt(Math.min(1, 40 / Math.max(jamBB, 1)))
    const jamSizeFactor = raiseLevel >= 2 ? Math.max(sizeShrink, reraiseJamFloor) : sizeShrink
    const continueRange = Math.max(profile.fourBetFreq ?? 0.025, STRAT.preflop.jamContinueFloor) * jamSizeFactor
    if (rawHandPct < continueRange * STRAT.preflop.jamRaisePortion && chips > toCall) {
      return { type: 'raise', amount: chips + playerBet }
    }
    if (rawHandPct < continueRange) return { type: 'call' }
    return { type: 'fold' }
  }

  if (raiseLevel <= 1) {
    // Modern preflop defense: 3-bet or fold is dominant strategy, cold-calling is rare.
    // 3-bet range = value (premiums) + bluffs (suited connectors, suited aces).
    // Cold-call range is very narrow — only in position with hands too weak to 3-bet but too strong to fold.
    const reraiseFreq = profile.threeBetFreq ?? (profile.pfr * 0.45 * profile.aggression)
    const valueFreq = reraiseFreq * 0.55 * Math.sqrt(sizePenalty)   // top hands by card quality
    const bluffRate = (reraiseFreq * 0.45) / Math.max(effectiveVpip, 0.15) * Math.pow(sizePenalty, STRAT.preflop.bluffSizePenaltyExp)

    const ipPositions = ['BTN', 'D', 'D/BTN', 'D/SB', 'CO']
    const inPosition = ipPositions.includes(ctx.position ?? '')
    const isHeadsUp = ctx.numActivePlayers <= 2

    // Cold-call range vs a raise is much narrower than VPIP. The persona's
    // VPIP-PFR gap IS its calling range: wide-gap players (stations, loose
    // gamblers) flat far more of their range than narrow-gap raise-or-fold
    // TAGs. IP defends wider than OOP. Heads-up defends widest.
    const gapRatio = Math.max(0, (effectiveVpip - effectivePfr) / Math.max(effectiveVpip, 0.01))
    // Very loose players (VPIP > 30%) call wider still — by definition
    const looseBonus = Math.max(0, effectiveVpip - 0.30) * 1.5
    const ipFlat = 0.40 + gapRatio * 0.55 + looseBonus
    const flatCallFreq = (isHeadsUp
      ? Math.min(effectiveVpip * 1.5, 0.65)     // heads-up: wide defense
      : inPosition
        ? effectiveVpip * ipFlat                  // IP cold-call
        : effectiveVpip * ipFlat * 0.65           // OOP cold-call
    ) * sizePenalty

    // Multiway/squeeze discount: with callers already between the opener and us,
    // value tightens and bluff 3-bets shrink fast (squeezes are rarer than 3-bets)
    const playersIn = Math.max(ctx.preflopCallers ?? 0, 0)
    let squeezeMod = playersIn >= 1 ? Math.pow(0.6, playersIn) : 1.0
    // Full-ring discount: configured 3-bet freqs are 6-max numbers; with more
    // players behind, real 3-bets shrink (more risk of running into a hand)
    if (ctx.numActivePlayers > 5) squeezeMod *= Math.max(5 / ctx.numActivePlayers, 0.6)

    // Position-based 3-bet sizing — IP 3.0x, OOP 3.5x (matches real poker sizing)
    const threeBetMult = inPosition ? 3.0 : 3.5

    // Value 3-bet with premium hands — RAW percentile (hand quality is not
    // position-shifted; the positional component lives in the bluff portion)
    if (rawHandPct < valueFreq * Math.sqrt(squeezeMod) && chips > currentBet * 3) {
      const raiseSize = Math.round(currentBet * (threeBetMult + (profile.aggression - 1) * 0.3) * (profile.betSizeMult ?? 1.0))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    // Bluff 3-bet — persona-driven random, needs a playable hand
    if (handPct < effectiveVpip && rng() < bluffRate * squeezeMod && chips > currentBet * 3) {
      const raiseSize = Math.round(currentBet * (threeBetMult + (profile.aggression - 1) * 0.3) * (profile.betSizeMult ?? 1.0))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    if (handPct < flatCallFreq) {
      return { type: 'call' }
    }
    return { type: 'fold' }
  }

  if (raiseLevel === 2) {
    const reraiseFreq = profile.fourBetFreq ?? (profile.pfr * 0.15 * profile.aggression)
    const valueFreq = reraiseFreq * 0.6
    const bluffRate4 = (reraiseFreq * 0.4) / Math.max(effectiveVpip, 0.15)
    // Facing 3-bet: tighter defense but still wide by modern standards
    const flatCallFreq4 = effectiveVpip * 0.45

    // 4-bet value is raw hand quality, not position-shifted
    if (rawHandPct < valueFreq && chips > currentBet * 2.5) {
      const raiseSize = Math.round(currentBet * 2.5)
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    if (handPct < effectiveVpip && rng() < bluffRate4 && chips > currentBet * 2.5) {
      const raiseSize = Math.round(currentBet * 2.5)
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    if (handPct < flatCallFreq4) {
      return { type: 'call' }
    }
    return { type: 'fold' }
  }

  if (raiseLevel === 3) {
    // Facing 4-bet: pure hand value territory — raw percentile, no position shift
    const reraiseFreq = profile.fiveBetFreq ?? 0.01
    const flatCallFreq5 = effectiveVpip * 0.20

    if (rawHandPct < reraiseFreq) {
      return { type: 'raise', amount: chips + playerBet }
    }
    if (rawHandPct < reraiseFreq + flatCallFreq5) {
      return { type: 'call' }
    }
    return { type: 'fold' }
  }

  // Facing 5-bet+
  if (rawHandPct < 0.01) return { type: 'call' }
  return { type: 'fold' }
}

// ─── Board Texture Analysis ──────────────────────────────────

interface BoardTexture {
  highCard: number         // highest board card rank (2-14)
  isAceHigh: boolean       // board has an ace
  isBroadwayHeavy: boolean // 2+ cards >= Jack
  isLow: boolean           // all cards <= 9
  isDry: boolean           // no flush/straight draws, unpaired
  isWet: boolean           // flush draw + straight draw possible
  isPaired: boolean        // board has a pair
  isMonotone: boolean      // 3+ cards same suit
  hasTwoTone: boolean      // exactly 2 cards of one suit (flush draw possible)
  connectedness: number    // 0-1: how connected the board is (straight draw density)
  suitedness: number       // max cards of one suit / total cards
}

function analyzeBoardTexture(community: Card[]): BoardTexture {
  if (community.length < 3) {
    return { highCard: 0, isAceHigh: false, isBroadwayHeavy: false, isLow: true, isDry: true, isWet: false, isPaired: false, isMonotone: false, hasTwoTone: false, connectedness: 0, suitedness: 0 }
  }

  const ranks = community.map(c => c.rank).sort((a, b) => b - a)
  const highCard = ranks[0]
  const isAceHigh = highCard === 14
  const broadwayCount = ranks.filter(r => r >= 11).length
  const isBroadwayHeavy = broadwayCount >= 2
  const isLow = highCard <= 9

  // Paired board
  const rankCounts = new Map<number, number>()
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1)
  const isPaired = [...rankCounts.values()].some(c => c >= 2)

  // Suit analysis
  const suitCounts = new Map<string, number>()
  for (const c of community) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1)
  const maxSuit = Math.max(...suitCounts.values())
  const isMonotone = maxSuit >= 3
  const hasTwoTone = maxSuit === 2
  const suitedness = maxSuit / community.length

  // Connectedness: count how many 2-card gaps <= 2 exist
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b)
  let connectedPairs = 0
  let totalPairs = 0
  for (let i = 0; i < uniqueRanks.length; i++) {
    for (let j = i + 1; j < uniqueRanks.length; j++) {
      totalPairs++
      if (uniqueRanks[j] - uniqueRanks[i] <= 3) connectedPairs++
    }
  }
  const connectedness = totalPairs > 0 ? connectedPairs / totalPairs : 0

  const isDry = !isMonotone && !hasTwoTone && connectedness < 0.4 && !isPaired
  const isWet = (isMonotone || hasTwoTone) && connectedness >= 0.4

  return { highCard, isAceHigh, isBroadwayHeavy, isLow, isDry, isWet, isPaired, isMonotone, hasTwoTone, connectedness, suitedness }
}

/**
 * Estimate range advantage based on board texture and preflop action.
 * Returns a multiplier: >1 = we have range advantage, <1 = opponent does.
 * The preflop raiser's range is weighted toward big cards and premium pairs.
 * The caller's range is weighted toward suited connectors and small pairs.
 */
function rangeAdvantage(board: BoardTexture, isPreflopRaiser: boolean): number {
  let advantage = 1.0

  if (isPreflopRaiser) {
    // Raiser has more big cards → advantage on high/broadway boards
    if (board.isAceHigh) advantage += 0.20
    if (board.isBroadwayHeavy) advantage += 0.15
    // Disadvantage on low connected boards (caller has more suited connectors)
    if (board.isLow && board.connectedness > 0.5) advantage -= 0.15
  } else {
    // Caller has more speculative hands → advantage on low/connected/suited boards
    if (board.isLow) advantage += 0.10
    if (board.connectedness > 0.5) advantage += 0.10
    if (board.isMonotone) advantage += 0.10
    // Disadvantage on ace-high dry boards
    if (board.isAceHigh && board.isDry) advantage -= 0.20
  }

  return advantage
}

function decidePostflopAction(profile: BotProfile, ctx: DecisionContext, _rand: number, heroProfile?: HeroProfile): BotAction {
  const rng = ctx.rng ?? Math.random
  const { toCall, pot, chips, bb, currentBet, playerBet, numActivePlayers } = ctx

  // ─── Card-aware hand strength ──────────────────────────
  // When no cards provided (backward compat / tests), use pure probabilistic mode
  const cardAware = !!(ctx.holeCards && ctx.community && ctx.community.length >= 3)
  // Detect draws once — postflopHandStrength and the decision logic below
  // share the same scan (it used to run twice per decision)
  const decisionDraws: DrawInfo[] = cardAware ? detectDraws(ctx.holeCards!, ctx.community!) : []
  const strength = cardAware
    ? postflopHandStrength(ctx.holeCards!, ctx.community!, decisionDraws)
    : -1 // sentinel: use old probabilistic logic

  // ─── Board texture analysis ───────────────────────────
  const board = cardAware ? analyzeBoardTexture(ctx.community!) : null
  const rangeAdv = board ? rangeAdvantage(board, ctx.wasPreflopRaiser ?? false) : 1.0

  // ─── Table reads (public signals; see utils/tableReads.ts) ─────
  const TR = STRAT.tableReads
  const stationTable = !!(ctx.tableReads?.passive && ctx.tableReads?.showdownHeavy)
  const weakTightTable = !!(ctx.tableReads?.passive && ctx.tableReads?.showdownLight)
  const thinValueMult = stationTable ? TR.thinValueBoost : 1.0
  const riverBluffMult = stationTable ? TR.riverBluffPenalty : 1.0
  const probeMult = weakTightTable ? TR.probeBoost : 1.0

  // ─── Probabilistic fallback (no cards provided) ─────
  if (!cardAware) {
    if (toCall === 0) {
      if (rng() < profile.bluffFreq) {
        const bluffSize = sizedBet(pot, 0.33 + rng() * 0.22, profile, bb)
        return { type: 'raise', amount: bluffSize + playerBet }
      }
      if (rng() < 0.22 * profile.aggression) {
        const betSize = Math.round(pot * (0.45 + profile.aggression * 0.2 + rng() * 0.15))
        return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
      }
      return { type: 'check' }
    }
    const potOddsFb = toCall / (pot + toCall)
    if (rng() < profile.bluffFreq * 0.5 * profile.aggression && chips > currentBet * 2) {
      const rs = Math.round(currentBet * (2.2 + rng() * 0.8))
      return { type: 'raise', amount: Math.min(rs, chips + playerBet) }
    }
    if (toCall / Math.max(pot, 1) > 0.75 && rng() > profile.vpip * 1.5) return { type: 'fold' }
    if (rng() < 0.10 * profile.aggression && chips > currentBet * 2.5) {
      const rs = Math.round(currentBet * (2.0 + profile.aggression * 0.5))
      return { type: 'raise', amount: Math.min(rs, chips + playerBet) }
    }
    if (rng() < profile.vpip * 1.3 * (1 - potOddsFb)) return { type: 'call' }
    return { type: 'fold' }
  }

  // ─── Card-aware postflop logic with street awareness ──

  // Position awareness — acting last is the biggest postflop advantage
  const ipPositionsPost = ['BTN', 'D', 'D/BTN', 'D/SB', 'CO']
  const isInPosition = ipPositionsPost.includes(ctx.position ?? '')
  // IP multiplier: bet/raise more in position, check/call more OOP
  const ipAggBoost = isInPosition ? 1.25 : 0.85

  // SPR (stack-to-pot ratio) — affects commitment decisions
  const effectiveStack = chips + playerBet
  const spr = pot > 0 ? effectiveStack / pot : 10
  const isShallowSPR = spr < 4   // committed — play straightforward, bet/fold
  const isDeepSPR = spr > 12     // deep — be cautious committing, more positional play

  // Explicit draw detection (not inferred from strength ranges — fixes bucket overlap)
  const draws: DrawInfo[] = decisionDraws
  const hasFlushOrStraightDraw = draws.some(d =>
    d.type.includes('Flush') || d.type.includes('straight'))

  // Made hand classification — draws and made hands are independent axes
  const hasMonster = strength >= STRAT.postflop.monsterStrength
  const hasStrongHand = strength >= STRAT.postflop.strongStrength
  // A draw is a DRAWING hand (flush/straight draw) that isn't already strong
  const hasDraw = hasFlushOrStraightDraw && !hasStrongHand
  // Weak made hands: bottom pair, weak kicker, etc. — NOT draws
  const hasWeakMade = !hasFlushOrStraightDraw && strength >= STRAT.postflop.weakMadeStrength && strength < STRAT.postflop.strongStrength
  // Nothing: no made hand AND no draw
  const hasNothing = strength < STRAT.postflop.weakMadeStrength && !hasFlushOrStraightDraw

  // Street awareness context
  const isPreflopRaiser = ctx.wasPreflopRaiser ?? false
  const isMultiway = (ctx.preflopCallers ?? 1) >= 2
  const betOnFlop = ctx.streetHistory?.flop === 'bet' || ctx.streetHistory?.flop === 'raise'
  const calledOnFlop = ctx.streetHistory?.flop === 'call'
  const betOnTurn = ctx.streetHistory?.turn === 'bet' || ctx.streetHistory?.turn === 'raise'

  // Opponent reads — if opponents are passive, bluff more; if aggressive, tighten up

  if (toCall === 0) {
    // ─── Not facing a bet ──────────────────────────────

    // C-bet: preflop raiser should bet the flop most of the time
    // Board texture matters: bet more on dry ace-high boards (range advantage),
    // less on wet low boards (opponent has more sets/straights/flushes)
    if (isPreflopRaiser && ctx.street === 'flop') {
      const textureMod = board
        ? (board.isDry ? 1.15 : 1.0)         // dry boards = bet more (fewer draws to give free cards)
          * (board.isAceHigh ? 1.15 : 1.0)    // ace-high = raiser range advantage
          * (board.isWet ? 0.80 : 1.0)         // wet boards = check more (opponent can have draws/sets)
          * (board.isLow ? 0.90 : 1.0)         // low boards = less raiser range advantage
          * rangeAdv
        : 1.0
      // Scale c-bet by board texture, opponent count, and SPR
      const opponentCount = Math.max(numActivePlayers - 1, 1)
      // Multiway discount: inverse to hand strength (monsters discount less, bluffs discount more)
      const baseMultiDiscount = opponentCount <= 1 ? 1.0 : opponentCount === 2 ? 0.65 : 0.40
      const multiDiscount = hasMonster ? Math.min(baseMultiDiscount + 0.20, 1.0)
        : hasStrongHand ? baseMultiDiscount
        : hasNothing ? Math.max(baseMultiDiscount - 0.15, 0.15) // bluff less multiway
        : baseMultiDiscount

      // Paired board adjustment: check more with overcards/air, bet more with trips+
      const pairedMod = board?.isPaired
        ? (hasMonster ? 1.20 : hasStrongHand ? 0.90 : 0.50) // big hands bet more, air checks
        : 1.0

      // SPR adjustment: shallow = bet more (committed), deep = be cautious
      const sprMod = isShallowSPR ? 1.15 : isDeepSPR ? 0.85 : 1.0

      const cbetRate = (hasStrongHand ? (board?.isDry ? STRAT.cbet.strongDry : board?.isWet ? STRAT.cbet.strongWet : STRAT.cbet.strongNeutral)
        : hasDraw ? STRAT.cbet.drawBase + profile.aggression * 0.10
        : hasWeakMade ? (board?.isDry ? STRAT.cbet.weakMadeDry : STRAT.cbet.weakMadeOther)
        : (STRAT.cbet.airBase + profile.bluffFreq * 0.5)) * textureMod * multiDiscount * pairedMod * sprMod * ipAggBoost
      if (rng() < cbetRate) {
        // Size based on texture: bigger on wet boards (charge draws), smaller on dry
        const sizeMult = board?.isWet ? 0.65 : board?.isDry ? 0.35 : 0.50
        const betSize = sizedBet(pot, sizeMult + profile.aggression * 0.12 + rng() * 0.12, profile, bb)
        return { type: 'raise', amount: betSize + playerBet }
      }
      return { type: 'check' }
    }

    // Fix 8: Improved turn barrel — considers whether turn card helped/hurt raiser's range
    if (betOnFlop && ctx.street === 'turn') {
      // Turn card analysis: did the 4th card help the raiser or the caller?
      const turnCard = ctx.community && ctx.community.length >= 4 ? ctx.community[3] : null
      let turnCardHelpsRaiser = 1.0
      if (turnCard && board) {
        // High cards (A, K, Q) help the raiser's range (they have more big cards)
        if (turnCard.rank >= 12) turnCardHelpsRaiser = 1.15
        // Low cards help the caller's range (sets, two pairs from speculative hands)
        else if (turnCard.rank <= 7) turnCardHelpsRaiser = 0.85
        // Flush-completing cards = slow down (opponent might have hit)
        if (board.hasTwoTone || board.isMonotone) {
          const turnSuit = turnCard.suit
          const flushCount = ctx.community!.filter(c => c.suit === turnSuit).length
          if (flushCount >= 3) turnCardHelpsRaiser *= 0.60 // flush likely completed
        }
      }
      const turnTexture = board
        ? (board.isDry ? 1.10 : 1.0)
          * (board.isAceHigh ? 1.10 : 1.0)
          * (board.isMonotone ? 0.70 : 1.0)
          * rangeAdv * turnCardHelpsRaiser
        : 1.0
      // Multiway discount on turn too
      const turnMulti = isMultiway ? 0.70 : 1.0
      const barrelRate = (hasMonster ? STRAT.barrel.turnMonster
        : hasStrongHand ? STRAT.barrel.turnStrong
        : hasDraw ? STRAT.barrel.turnDrawBase + profile.aggression * 0.10
        : hasNothing ? profile.bluffFreq * 0.5 * profile.aggression
        : STRAT.barrel.turnDefault) * turnTexture * turnMulti * ipAggBoost
      if (rng() < barrelRate) {
        const betSize = sizedBet(pot, 0.50 + profile.aggression * 0.15 + rng() * 0.15, profile, bb)
        return { type: 'raise', amount: betSize + playerBet }
      }
      return { type: 'check' }
    }

    // Fix 8: Improved river barrel — considers whether river completed draws
    if (betOnTurn && ctx.street === 'river') {
      const riverCard = ctx.community && ctx.community.length >= 5 ? ctx.community[4] : null
      let riverScareCard = 1.0
      if (riverCard && board) {
        // Flush-completing river = scary (slow down unless we have it)
        const riverSuit = riverCard.suit
        const flushCount = ctx.community!.filter(c => c.suit === riverSuit).length
        if (flushCount >= 3 && !hasMonster) riverScareCard *= 0.55
        // Straight-completing river (connected card near the board)
        const boardRanks = ctx.community!.slice(0, 4).map(c => c.rank)
        const minGap = Math.min(...boardRanks.map(r => Math.abs(r - riverCard.rank)))
        if (minGap <= 2 && !hasMonster) riverScareCard *= 0.75
      }
      const riverBluffBoost = board
        ? (board.isAceHigh && board.isDry ? 1.5 : 1.0)
          * (board.isWet ? 1.3 : 1.0) // wet board that bricked = "missed draw" bluff
          * (board.isPaired ? 0.7 : 1.0)
          * rangeAdv * riverScareCard
        : 1.0
      // River polarization: only bet monsters (value) and air (bluffs).
      // Medium-strength hands check to avoid value-owning themselves.
      // IP bluffs more on the river (last to act = maximum fold equity information)
      const barrelRate = hasMonster ? 0.85
        : hasNothing ? profile.bluffFreq * 0.45 * profile.aggression * riverBluffBoost * ipAggBoost
        : 0  // strong hands and weak made hands CHECK the river (polarization)
      if (rng() < barrelRate) {
        const betSize = maybeOverbet(pot, profile, bb, rng)
          ?? sizedBet(pot, 0.55 + profile.aggression * 0.15 + rng() * 0.15, profile, bb)
        return { type: 'raise', amount: betSize + playerBet }
      }
      const thin = maybeThinValueRiver(pot, profile, bb, strength, isMultiway, isInPosition, thinValueMult, rng)
      if (thin !== null) return { type: 'raise', amount: thin + playerBet }
      return { type: 'check' }
    }

    // River polarization for non-raiser: only bet monsters (value) or bluffs
    if (ctx.street === 'river') {
      if (hasMonster) {
        const betSize = maybeOverbet(pot, profile, bb, rng)
          ?? sizedBet(pot, 0.55 + profile.aggression * 0.15 + rng() * 0.15, profile, bb)
        return { type: 'raise', amount: betSize + playerBet }
      }
      // Weak-tight table: this air bluff-bet is the river leg of the probe/stab
      // boost (the two `ctx.street === 'river'` blocks above and here both
      // return before the IP/OOP probe section, so this is the only place a
      // river probeMult can apply — Fix wave 2026-09-03, item 2).
      if (hasNothing && rng() < profile.bluffFreq * 0.35 * profile.aggression * probeMult) {
        const bluffSize = maybeOverbet(pot, profile, bb, rng)
          ?? sizedBet(pot, 0.55 + rng() * 0.20, profile, bb)
        return { type: 'raise', amount: bluffSize + playerBet }
      }
      const thin = maybeThinValueRiver(pot, profile, bb, strength, isMultiway, isInPosition, thinValueMult, rng)
      if (thin !== null) return { type: 'raise', amount: thin + playerBet }
      return { type: 'check' } // medium hands check the river
    }

    // Not the preflop raiser — position determines whether to lead (OOP donk) or probe (IP)
    const callerRangeAdv = board ? rangeAdvantage(board, false) : 1.0
    const donkFreq = profile.donkBetFreq ?? 0

    // IP probe bet: when checked to us in position, bet aggressively
    // This is one of the most profitable spots in poker — information + fold equity
    if (isInPosition) {
      const probeBase = hasMonster ? 0.85
        : hasStrongHand ? 0.55 + profile.aggression * 0.15
        : hasDraw ? 0.40 + profile.aggression * 0.15
        : hasWeakMade ? 0.25 + profile.aggression * 0.10
        : profile.bluffFreq * profile.aggression * 0.40
      const probeTexture = callerRangeAdv
        * (board?.isDry ? 1.20 : 1.0)     // dry boards = more fold equity
        * (board?.isAceHigh ? 1.15 : 1.0) // represent the ace
        * (board?.isWet ? 0.85 : 1.0)     // wet = opponent has more draws
      // Weak-tight boost is for air/weak-made probes only — a monster or a
      // strong hand isn't "probing," it's value betting, so it shouldn't be
      // scaled by a read meant to push more bluffs (Fix wave 2026-09-03, item 5).
      const probeScale = (hasMonster || hasStrongHand) ? 1.0 : probeMult
      if (rng() < probeBase * probeTexture * probeScale) {
        const sizeMult = board?.isWet ? 0.55 : board?.isDry ? 0.35 : 0.45
        const betSize = sizedBet(pot, sizeMult + profile.aggression * 0.12 + rng() * 0.12, profile, bb)
        return { type: 'raise', amount: betSize + playerBet }
      }
      return { type: 'check' }
    }

    // OOP lead (donk bet) — should be rare for pros, more frequent for fictional bots
    // Donk bet with strong hands — non-pro players lead into the raiser frequently
    if (hasStrongHand) {
      const leadRate = donkFreq > 0
        ? donkFreq + profile.aggression * 0.15 // fictional: use their donk freq
        : (0.15 + profile.aggression * 0.15) * callerRangeAdv // pro: rare, texture-based
      if (rng() < leadRate) {
        const betSize = sizedBet(pot, 0.45 + profile.aggression * 0.15 + rng() * 0.15, profile, bb)
        return { type: 'raise', amount: betSize + playerBet }
      }
    }

    // Donk bet with draws (semi-bluff lead) — OOP only
    if (hasDraw) {
      const drawLeadRate = donkFreq > 0
        ? donkFreq * 0.7
        : (profile.bluffFreq + profile.aggression * 0.08) * callerRangeAdv
      if (rng() < drawLeadRate) {
        const betSize = sizedBet(pot, 0.40 + rng() * 0.20, profile, bb)
        return { type: 'raise', amount: betSize + playerBet }
      }
    }

    // OOP probe/donk with air — reduced vs IP version
    {
      const probeRate = donkFreq > 0
        ? donkFreq * 0.4
        : profile.bluffFreq * profile.aggression * 0.18
          * (board?.isAceHigh ? 1.5 : 1.0)
          * (board?.isDry ? 1.4 : 1.0)
          * (board?.isLow ? 1.2 : 1.0)
      if (hasNothing && rng() < probeRate * probeMult) {
        const bluffSize = sizedBet(pot, 0.33 + rng() * 0.22, profile, bb)
        return { type: 'raise', amount: bluffSize + playerBet }
      }
      if (hasWeakMade && (board?.isAceHigh || donkFreq > 0.10) && rng() < probeRate * probeMult * 0.8) {
        const betSize = sizedBet(pot, 0.30 + rng() * 0.20, profile, bb)
        return { type: 'raise', amount: betSize + playerBet }
      }
    }

    return { type: 'check' }
  }

  // ─── Facing a bet ──────────────────────────────────────
  const potOdds = toCall / (pot + toCall)
  const betToPotRatio = toCall / Math.max(pot, 1)

  // Minimum Defense Frequency: prevents exploitable over-folding to big bets
  // MDF = 1 - (bet / (pot + bet)) — the % of range we must defend.
  // MDF is a HEADS-UP concept: multiway, the defense duty splits across the
  // remaining players, so each defends a much smaller share.
  const mdfDefenders = Math.max(numActivePlayers - 1, 1)
  const mdf = (1 - potOdds) / mdfDefenders
  // Estimate hand's position in range: strength 0.55+ = top ~20%, 0.35+ = top ~40%, etc.
  const handRangePos = 1 - Math.min(strength / 0.70, 1.0)
  const isWithinMDF = handRangePos <= mdf

  // Street pressure: later streets require stronger hands to continue
  // Flop = 1.0, Turn = 0.75, River = 0.55 (much harder to call river bets)
  // Passive players (low aggression) call MORE — that's their identity.
  // Aggressive players fold or raise — they don't flat-call as much.
  const baseStreetFactor = ctx.street === 'river' ? 0.55
    : ctx.street === 'turn' ? 0.75
    : 1.0
  const passiveBoost = Math.max(0.8, 1.6 - profile.aggression * 0.6)
  // Carl (agg 0.60): boost 1.24x — calls down more. Twan (agg 1.50): boost 0.80x — folds or raises.
  // Hero bet-sizing exploitation: if hero has a sizing tell, adjust call/raise willingness
  let sizingExploit = 1.0
  if (heroProfile?.betSizingTell?.hasTell && (heroProfile.readStrength ?? 1) >= 0.4) {
    const currentSizing = toCall / Math.max(pot, 1)
    const tell = heroProfile.betSizingTell
    if (tell.bigWithValue) {
      // Hero bets big = value → fold more; small = bluff → call more
      if (currentSizing > tell.strongAvgSizing * 0.9) sizingExploit = 0.70
      else if (currentSizing < tell.weakAvgSizing * 1.1) sizingExploit = 1.40
    } else {
      // Reverse tell: small = value, big = bluff
      if (currentSizing < tell.strongAvgSizing * 1.1) sizingExploit = 0.70
      else if (currentSizing > tell.weakAvgSizing * 0.9) sizingExploit = 1.40
    }
  }

  const streetFactor = baseStreetFactor * passiveBoost * sizingExploit

  // SPR auto-commit: very shallow SPR (< 2) = shove with strong+ hands.
  // Flop/turn only — committing there denies equity; on the river there is
  // nothing to protect against, so one-pair hands call or fold (polarization),
  // they don't raise-jam.
  if (isShallowSPR && spr < 2 && hasStrongHand && ctx.street !== 'river') {
    return { type: 'raise', amount: chips + playerBet }
  }

  // Check-raise: board-texture aware — dry boards = check-raise more, wet = less
  // Monsters on dry boards should almost always check-raise for value
  const crTextureMod = board
    ? (board.isDry ? 1.4 : 1.0) * (board.isWet ? 0.6 : 1.0) * (board.isPaired ? 1.3 : 1.0)
    : 1.0
  const checkRaiseBoost = ctx.checkedThisStreet ? 0.25 * crTextureMod : 0

  // Monster hands — raise for value (very likely if check-raising on dry board)
  if (hasMonster) {
    const monsterRaiseRate = (0.20 + profile.aggression * 0.30 + checkRaiseBoost) * ipAggBoost
    // Shallow SPR: just shove with monsters
    if (isShallowSPR && chips <= pot * 1.5) {
      return { type: 'raise', amount: chips + playerBet }
    }
    if (rng() < monsterRaiseRate && chips > currentBet * 2) {
      const raiseSize = Math.round(currentBet * (2.2 + rng() * 0.8))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
  }

  // Strong hands — raise more often (especially IP), check-raise OOP for balance
  if (hasStrongHand) {
    // Bet-size sensitivity: non-monster made hands fold to big bets at a rate
    // rising with size and falling with strength. Top pair calls normal bets
    // but folds to overbet shoves most of the time. Monsters and river handled elsewhere.
    if (!hasMonster && (ctx.street === 'flop' || ctx.street === 'turn') && betToPotRatio > 0.7) {
      const sizePressure = Math.min((betToPotRatio - 0.7) / 1.3, 1)        // 1.0 at 2x pot
      const strengthShield = Math.max(0, Math.min((strength - 0.30) / 0.25, 1))
      const streetWeight = ctx.street === 'turn' ? 1.0 : 0.8
      const foldProb = Math.min(sizePressure * (1 - strengthShield * 0.65) * streetWeight, 0.92)
      if (rng() < foldProb) return { type: 'fold' }
    }

    // Call-down discipline: marginal made hands (top pair, mid pair) continue
    // less often vs normal-sized bets on later streets — real players fold
    // second-best hands to sustained pressure; passives call down more.
    if (!hasMonster && toCall > 0 && ctx.street !== 'flop') {
      const marginShield = Math.max(0, Math.min((strength - 0.35) / 0.20, 1)) // 0 at 0.35 → 1 at 0.55
      const baseContinue = ctx.street === 'turn'
        ? 0.55 + marginShield * 0.45
        : 0.35 + marginShield * 0.50
      const continueProb = Math.min(baseContinue * passiveBoost, 1.0)
      if (rng() > continueProb) return { type: 'fold' }
    }

    // Multiway flop discipline: a bet into 3+ players is much stronger than
    // a heads-up c-bet — marginal made hands fold some of the time
    if (!hasMonster && toCall > 0 && ctx.street === 'flop' && numActivePlayers >= 3) {
      const marginShield = Math.max(0, Math.min((strength - 0.35) / 0.20, 1))
      const continueProb = Math.min((0.72 + marginShield * 0.28) * passiveBoost, 1.0)
      if (rng() > continueProb) return { type: 'fold' }
    }
    // Check-raise with strong hands OOP — texture-aware frequency
    if (ctx.checkedThisStreet && rng() < checkRaiseBoost * profile.aggression && chips > currentBet * 2.5) {
      const raiseSize = Math.round(currentBet * (2.5 + rng() * 0.5))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    // IP raises strong hands more — extract value with position advantage
    const strongRaiseRate = profile.aggression * (isInPosition ? 0.22 : 0.12)
    if (rng() < strongRaiseRate && chips > currentBet * 2.5) {
      const raiseSize = Math.round(currentBet * (2.0 + profile.aggression * 0.5))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    // Fold top pair to pot-sized+ bets on the river (could be beaten)
    if (ctx.street === 'river' && betToPotRatio > 0.8 && strength < 0.50 && rng() > profile.vpip) {
      return { type: 'fold' }
    }
    return { type: 'call' }
  }

  // Draws — semi-bluff raise more often in position (fold equity + draw equity)
  if (hasDraw && ctx.street !== 'river') {
    // IP semi-bluff is one of the most profitable plays in poker
    const semiBluffRate = profile.bluffFreq * profile.aggression * (isInPosition ? 0.75 : 0.40)
    if (rng() < semiBluffRate && chips > currentBet * 2) {
      const raiseSize = Math.round(currentBet * (2.2 + rng() * 0.8))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    // Need decent pot odds to call a draw
    if (betToPotRatio < 0.4) return { type: 'call' }
    if (isWithinMDF) return { type: 'call' } // MDF: must defend this hand
    if (rng() < profile.vpip * 0.5 * streetFactor) return { type: 'call' }
    return { type: 'fold' }
  }

  // Weak made hands — call small bets on flop, tighten on later streets
  if (hasWeakMade) {
    if (betToPotRatio < 0.4 && rng() < profile.vpip * 0.7 * streetFactor) return { type: 'call' }
    if (isWithinMDF && rng() < 0.80) return { type: 'call' } // MDF defense (some mixing)
    if (rng() < profile.vpip * 0.2 * streetFactor) return { type: 'call' }
    return { type: 'fold' }
  }

  // Nothing — mostly fold. Rare bluff raise, very rare float.
  // IP bluff-raises are more credible (acting last). OOP bluff-raises are rare.
  const bluffRaiseMult = ctx.street === 'river' ? riverBluffMult : 1.0
  if (rng() < profile.bluffFreq * (isInPosition ? 0.25 : 0.12) * profile.aggression * bluffRaiseMult && chips > currentBet * 2) {
    const raiseSize = Math.round(currentBet * (2.5 + rng()))
    return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
  }

  // Float: call with nothing to steal on later streets
  // IP floats are much more profitable (can bet when checked to on turn/river)
  // OOP floats are rare and only vs tiny bets
  if (ctx.street === 'flop') {
    const floatRate = isInPosition
      ? betToPotRatio < 0.5 ? profile.vpip * 0.35 : profile.vpip * 0.15
      : betToPotRatio < 0.3 ? profile.vpip * 0.15 : 0
    if (rng() < floatRate) return { type: 'call' }
  }

  // MDF defense even with air — sometimes must defend to stay unexploitable
  if (isWithinMDF && ctx.street !== 'river' && rng() < 0.25) {
    return { type: 'call' }
  }

  return { type: 'fold' }
}

/**
 * Deal a shuffled 52-card deck (Fisher-Yates) for the stat simulators.
 */
function shuffledDeckForSim(rng: Rng = Math.random): Card[] {
  const deck: Card[] = []
  for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as const) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit })
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

const SIM_POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']

/**
 * Simulate N preflop + postflop decisions for a bot profile and return observed stats.
 * Deals real cards and rotates positions so it exercises the same card-aware
 * decision path as the live game (not the probabilistic fallback).
 */
export function simulateBotStats(
  profile: BotProfile,
  numHands: number = 1000,
  rng: Rng = Math.random,
): {
  vpip: number       // observed VPIP (0–1)
  pfr: number        // observed PFR (0–1)
  foldRate: number   // how often bot folds (0–1)
  raiseRate: number  // how often bot raises postflop (0–1)
  bluffRate: number  // how often bot bets into no-bet postflop (proxy for bluffing)
} {
  let voluntaryPlays = 0
  let preflopRaises = 0
  let preflopHands = 0
  let postflopFolds = 0
  let postflopCalls = 0
  let postflopRaises = 0
  let postflopChecks = 0
  let postflopBetsIntoNoBet = 0
  let postflopNoBetSituations = 0

  const bb = 2

  for (let i = 0; i < numHands; i++) {
    const deck = shuffledDeckForSim(rng)
    const holeCards: [Card, Card] = [deck[0]!, deck[1]!]
    const position = SIM_POSITIONS[i % SIM_POSITIONS.length]!

    // Simulate preflop decision (facing a raise ~60% of the time)
    const facingRaise = rng() < 0.6
    const preflopCtx: DecisionContext = {
      rng,
      street: 'preflop',
      toCall: facingRaise ? bb * 2.5 : bb,
      pot: bb * 1.5,
      currentBet: facingRaise ? bb * 2.5 : bb,
      playerBet: 0,
      chips: 200,
      bb,
      numActivePlayers: 5,
      raiseLevel: facingRaise ? 1 : 0,
      position,
      holeCards,
    }
    preflopHands++
    const preflopAction = decideBotAction(profile, preflopCtx)

    if (preflopAction.type === 'call' || preflopAction.type === 'raise') {
      voluntaryPlays++
    }
    if (preflopAction.type === 'raise') {
      preflopRaises++
    }

    // If didn't fold preflop, simulate a postflop decision
    if (preflopAction.type !== 'fold') {
      // ~50% of the time face a bet, ~50% checked to
      const facingBet = rng() < 0.5
      const postPot = bb * 6

      const postCtx: DecisionContext = {
      rng,
        street: 'flop',
        toCall: facingBet ? Math.round(postPot * 0.6) : 0,
        pot: postPot,
        currentBet: facingBet ? Math.round(postPot * 0.6) : 0,
        playerBet: 0,
        chips: 180,
        bb,
        numActivePlayers: 3,
        position,
        holeCards,
        community: [deck[2]!, deck[3]!, deck[4]!],
      }

      if (!facingBet) postflopNoBetSituations++

      const postAction = decideBotAction(profile, postCtx)

      if (postAction.type === 'fold') postflopFolds++
      else if (postAction.type === 'call') postflopCalls++
      else if (postAction.type === 'raise') {
        postflopRaises++
        if (!facingBet) postflopBetsIntoNoBet++
      }
      else if (postAction.type === 'check') postflopChecks++
    }
  }

  const totalPostflop = postflopFolds + postflopCalls + postflopRaises + postflopChecks

  return {
    vpip: voluntaryPlays / preflopHands,
    pfr: preflopRaises / preflopHands,
    foldRate: postflopFolds / Math.max(totalPostflop, 1),
    raiseRate: postflopRaises / Math.max(totalPostflop, 1),
    bluffRate: postflopBetsIntoNoBet / Math.max(postflopNoBetSituations, 1),
  }
}

/**
 * Simulate escalation-specific stats: how often a bot 3-bets, 4-bets, 5-bets,
 * and how often it folds to each escalation level.
 */
export function simulateEscalationStats(
  profile: BotProfile,
  numHands: number = 50000,
  rng: Rng = Math.random,
): {
  threeBetRate: number
  fourBetRate: number
  fiveBetRate: number
  foldTo3Bet: number
  foldTo4Bet: number
  callTo3Bet: number
  callTo4Bet: number
} {
  const bb = 2
  let threeBets = 0, threeBetOpps = 0
  let fourBets = 0, fourBetOpps = 0
  let fiveBets = 0, fiveBetOpps = 0
  let foldsTo3Bet = 0, foldsTo3BetOpps = 0
  let foldsTo4Bet = 0, foldsTo4BetOpps = 0
  let callsTo3Bet = 0, callsTo4Bet = 0

  for (let i = 0; i < numHands; i++) {
    const deck = shuffledDeckForSim(rng)
    const holeCards: [Card, Card] = [deck[0]!, deck[1]!]
    const position = SIM_POSITIONS[i % SIM_POSITIONS.length]!

    // Test 3-bet: facing an open raise (raiseLevel=1)
    threeBetOpps++
    const ctx3: DecisionContext = {
      rng,
      street: 'preflop', toCall: bb * 2.5, pot: bb * 4,
      currentBet: bb * 2.5, playerBet: 0, chips: 200, bb, numActivePlayers: 5,
      raiseLevel: 1, position, holeCards,
    }
    const action3 = decideBotAction(profile, ctx3)
    if (action3.type === 'raise') threeBets++

    // Test facing a 3-bet (raiseLevel=2)
    foldsTo3BetOpps++
    const ctx3bet: DecisionContext = {
      rng,
      street: 'preflop', toCall: bb * 7.5, pot: bb * 12,
      currentBet: bb * 7.5, playerBet: 0, chips: 200, bb, numActivePlayers: 4,
      raiseLevel: 2, position, holeCards,
    }
    const action3bet = decideBotAction(profile, ctx3bet)
    if (action3bet.type === 'fold') foldsTo3Bet++
    else if (action3bet.type === 'raise') fourBets++
    else if (action3bet.type === 'call') callsTo3Bet++
    fourBetOpps++

    // Test facing a 4-bet (raiseLevel=3)
    foldsTo4BetOpps++
    const ctx4bet: DecisionContext = {
      rng,
      street: 'preflop', toCall: bb * 20, pot: bb * 30,
      currentBet: bb * 20, playerBet: 0, chips: 200, bb, numActivePlayers: 3,
      raiseLevel: 3, position, holeCards,
    }
    const action4bet = decideBotAction(profile, ctx4bet)
    if (action4bet.type === 'fold') foldsTo4Bet++
    else if (action4bet.type === 'raise') fiveBets++
    else if (action4bet.type === 'call') callsTo4Bet++
    fiveBetOpps++
  }

  return {
    threeBetRate: threeBets / threeBetOpps,
    fourBetRate: fourBets / fourBetOpps,
    fiveBetRate: fiveBets / fiveBetOpps,
    foldTo3Bet: foldsTo3Bet / foldsTo3BetOpps,
    foldTo4Bet: foldsTo4Bet / foldsTo4BetOpps,
    callTo3Bet: callsTo3Bet / foldsTo3BetOpps,
    callTo4Bet: callsTo4Bet / foldsTo4BetOpps,
  }
}
