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
import { chenScore, chenPlusScore, bestHand, detectDraws } from './handAnalysis'

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
}

// ─── Hero Adaptation ──────────────────────────────────────────

export interface HeroProfile {
  vpip: number           // hero's observed VPIP (0–1)
  foldTo3Bet: number     // how often hero folds to 3-bets (0–1)
  foldToCbet: number     // how often hero folds to c-bets (0–1)
  aggression: number     // hero's observed aggression factor
  handsTracked: number   // total hands in the tracking window
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
): void {
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
    state.handsRemaining = min + Math.floor(Math.random() * (max - min + 1))
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
  return {
    vpip: Math.min(base.vpip + boosts.vpipWiden * s, 0.65),
    pfr: Math.min(base.pfr + boosts.pfrBoost * s, 0.55),
    aggression: Math.min(base.aggression + boosts.aggressionBoost * s, 3.0),
    bluffFreq: Math.min(base.bluffFreq + boosts.bluffBoost * s, 0.50),
    creativeFreq: Math.min(base.creativeFreq + 0.03 * s, 0.25),
    threeBetFreq: base.threeBetFreq !== undefined ? Math.min(base.threeBetFreq + 0.04 * s, 0.35) : undefined,
    fourBetFreq: base.fourBetFreq !== undefined ? Math.min(base.fourBetFreq + 0.02 * s, 0.20) : undefined,
    fiveBetFreq: base.fiveBetFreq !== undefined ? Math.min(base.fiveBetFreq + 0.01 * s, 0.05) : undefined,
  }
}

/**
 * Generate a random off-strategy action — the "brain fart" play.
 * Weighted so it's not completely insane: folds and calls are more
 * common than random raises.
 */
function generateRandomAction(ctx: DecisionContext): BotAction {
  const r = Math.random()
  if (ctx.toCall === 0) {
    // Not facing a bet: check (60%) or random bet (40%)
    if (r < 0.60) return { type: 'check' }
    const betSize = Math.round(ctx.pot * (0.3 + Math.random() * 0.5))
    return { type: 'raise', amount: Math.min(Math.max(betSize, ctx.bb), ctx.chips) }
  }
  // Facing a bet: fold (40%), call (40%), raise (20%)
  if (r < 0.40) return { type: 'fold' }
  if (r < 0.80) return { type: 'call' }
  const raiseSize = Math.round(ctx.currentBet * (1.5 + Math.random()))
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
  // Street awareness — what this bot did on earlier streets
  wasPreflopRaiser?: boolean  // was this bot the last preflop aggressor?
  preflopCallers?: number     // how many players called preflop (multiway pot?)
  streetHistory?: {           // this bot's action on each prior street
    flop?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
    turn?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
  }
  // Bot memory — observed opponent tendencies
  opponentReads?: {
    avgAggression: number   // how aggressive opponents at this table have been (0-2)
    recentBluffRate: number // how often opponents showed down weak hands (0-1)
    tableIsPassive: boolean // true if table has been check-heavy
  }
  // Table Flow — dynamic adjustments based on recent results
  tableDynamics?: {
    dominantPlayerId?: number   // who is on a heater (most wins in window)
    dominantWinRate: number     // their win rate in the window (0-1)
    myRecentWinRate: number     // this bot's win rate in the window (0-1)
    avgStackDepth: number       // average stack in BB across the table
    handsInWindow: number       // how many hands are in the tracking window
  }
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
  const { street } = ctx

  // ─── Consistency check: occasional off-strategy play ─────
  if (consistency !== undefined && consistency < 1.0) {
    const missplayChance = 1.0 - consistency // e.g., 0.97 consistency = 3% chance
    if (Math.random() < missplayChance) {
      return generateRandomAction(ctx)
    }
  }

  // ─── Apply hero adaptation if enough data ─────
  let adaptedProfile = heroProfile && heroProfile.handsTracked >= 10
    ? applyHeroAdaptation(profile, heroProfile)
    : profile

  // ─── Table Flow: adjust for table dynamics ─────
  adaptedProfile = applyTableDynamics(adaptedProfile, ctx.tableDynamics)

  const rand = Math.random()

  // ─── Preflop ───────────────────────────────────────────────
  if (street === 'preflop') {
    return decidePreflopAction(adaptedProfile, ctx, rand)
  }

  // ─── Postflop ──────────────────────────────────────────────
  return decidePostflopAction(adaptedProfile, ctx, rand)
}

/**
 * Adjust bot profile based on observed hero tendencies.
 * Returns a modified copy — original is not mutated.
 */
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
function postflopHandStrength(holeCards: [Card, Card], community: Card[]): number {
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

  // High card with overcards to the board — worth more than random high card
  if (result.rank === 0) {
    const boardMax = Math.max(...community.map(c => c.rank))
    const overcards = holeCards.filter(c => c.rank > boardMax).length
    if (overcards >= 1) strength = 0.15  // at least one overcard
    if (overcards >= 2) strength = 0.20  // two overcards (e.g., AK on low board)
  }

  // Boost for top pair with decent kicker
  if (result.rank === 1) {
    const boardMax = Math.max(...community.map(c => c.rank))
    const pairRank = result.score[1]
    if (pairRank >= boardMax) strength = 0.40 // top pair
    if (pairRank >= 12) strength = 0.45       // top pair, face card
  }

  // Add draw equity
  const draws = detectDraws(holeCards, community)
  for (const draw of draws) {
    if (draw.type.includes('Flush draw')) strength = Math.max(strength, 0.35)
    if (draw.type.includes('Open-ended')) strength = Math.max(strength, 0.30)
    if (draw.type.includes('Gutshot')) strength = Math.max(strength, 0.20)
  }

  return strength
}

function decidePreflopAction(profile: BotProfile, ctx: DecisionContext, rand: number): BotAction {
  const { toCall, chips, bb, currentBet, playerBet } = ctx
  const raiseLevel = ctx.raiseLevel ?? 1
  const stackBB = chips / bb

  // ─── Short-stack push/fold mode (<25BB) ────────────────
  if (stackBB < 25 && toCall > 0 && ctx.holeCards) {
    const chenMax = chenPlusScore(ctx.holeCards, ctx.position ?? '', { vpip: profile.vpip, aggression: profile.aggression })
    const handPct = chenToPercentile(chenMax)
    // Shove with top ~15% of hands, fold everything else
    const shoveThreshold = stackBB < 10 ? 0.25 : 0.18 // wider when desperate
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
  let handPct = rand
  if (ctx.holeCards) {
    const style = { vpip: profile.vpip, aggression: profile.aggression, creativeFreq: profile.creativeFreq }
    const chenMax = chenPlusScore(ctx.holeCards, ctx.position ?? '', style)
    handPct = chenToPercentile(chenMax)
    const jitterScale = chenMax >= 10 ? 0.02 : chenMax >= 7 ? 0.06 : 0.10
    handPct = Math.max(0, Math.min(1, handPct + (Math.random() - 0.5) * jitterScale))
  }

  if (toCall === 0) {
    if (handPct < effectivePfr) {
      const raiseSize = Math.round(bb * (2.2 + profile.aggression * 0.5))
      return { type: 'raise', amount: Math.min(raiseSize + playerBet, chips + playerBet) }
    }
    return { type: 'check' }
  }

  // Completing the SB or defending the BB — modern poker defends very wide
  // BB gets a discount, so defend ~90% of VPIP range; SB ~80%
  if (toCall <= bb && raiseLevel <= 1) {
    const isBB = ctx.position === 'BB'
    const defenseRange = isBB ? Math.min(effectiveVpip * 1.25, 0.70) : effectiveVpip
    if (handPct < defenseRange) {
      if (handPct < effectivePfr) {
        const raiseSize = Math.round(currentBet * (2.5 + profile.aggression * 0.5))
        return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
      }
      return { type: 'call' }
    }
    return { type: 'fold' }
  }

  // ─── Facing a raise — value + bluff 3-bet split ─────────
  // Value 3-bets: card quality driven (handPct < threshold)
  // Bluff 3-bets: persona randomness driven (Math.random < threshold)

  if (raiseLevel <= 1) {
    const reraiseFreq = profile.threeBetFreq ?? (profile.pfr * 0.35 * profile.aggression)
    const valueFreq = reraiseFreq * 0.55   // top hands by card quality
    // Bluff rate calibrated so total ≈ reraiseFreq: need bluffRate * callRange ≈ reraiseFreq * 0.45
    const bluffRate = (reraiseFreq * 0.45) / Math.max(effectiveVpip, 0.15)
    // Flat call range — modern poker defends wide vs single raises
    // In position: defend ~85% of VPIP range; out of position: ~75%
    const ipPositions = ['BTN', 'D', 'D/BTN', 'CO']
    const inPosition = ipPositions.includes(ctx.position ?? '')
    const flatCallFreq = effectiveVpip * (inPosition ? 0.85 : 0.75)

    // Value 3-bet with premium hands
    if (handPct < valueFreq && chips > currentBet * 3) {
      const raiseSize = Math.round(currentBet * (3.0 + (profile.aggression - 1) * 0.5))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    // Bluff 3-bet — persona-driven random, needs a playable hand
    if (handPct < effectiveVpip && Math.random() < bluffRate && chips > currentBet * 3) {
      const raiseSize = Math.round(currentBet * (3.0 + (profile.aggression - 1) * 0.5))
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

    if (handPct < valueFreq && chips > currentBet * 2.5) {
      const raiseSize = Math.round(currentBet * 2.5)
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    if (handPct < effectiveVpip && Math.random() < bluffRate4 && chips > currentBet * 2.5) {
      const raiseSize = Math.round(currentBet * 2.5)
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    if (handPct < flatCallFreq4) {
      return { type: 'call' }
    }
    return { type: 'fold' }
  }

  if (raiseLevel === 3) {
    const reraiseFreq = profile.fiveBetFreq ?? 0.01
    // Facing 4-bet: only continuing with strong hands
    const flatCallFreq5 = effectiveVpip * 0.20

    if (handPct < reraiseFreq) {
      return { type: 'raise', amount: chips + playerBet }
    }
    if (handPct < reraiseFreq + flatCallFreq5) {
      return { type: 'call' }
    }
    return { type: 'fold' }
  }

  // Facing 5-bet+
  if (handPct < 0.01) return { type: 'call' }
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

function decidePostflopAction(profile: BotProfile, ctx: DecisionContext, _rand: number): BotAction {
  const { toCall, pot, chips, bb, currentBet, playerBet, numActivePlayers } = ctx

  // ─── Card-aware hand strength ──────────────────────────
  // When no cards provided (backward compat / tests), use pure probabilistic mode
  const cardAware = !!(ctx.holeCards && ctx.community && ctx.community.length >= 3)
  const strength = cardAware
    ? postflopHandStrength(ctx.holeCards!, ctx.community!)
    : -1 // sentinel: use old probabilistic logic

  // ─── Board texture analysis ───────────────────────────
  const board = cardAware ? analyzeBoardTexture(ctx.community!) : null
  const rangeAdv = board ? rangeAdvantage(board, ctx.wasPreflopRaiser ?? false) : 1.0

  // ─── Probabilistic fallback (no cards provided) ─────
  if (!cardAware) {
    if (toCall === 0) {
      if (Math.random() < profile.bluffFreq) {
        const bluffSize = Math.round(pot * (0.33 + Math.random() * 0.22))
        return { type: 'raise', amount: Math.max(bluffSize, bb) + playerBet }
      }
      if (Math.random() < 0.22 * profile.aggression) {
        const betSize = Math.round(pot * (0.45 + profile.aggression * 0.2 + Math.random() * 0.15))
        return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
      }
      return { type: 'check' }
    }
    const potOddsFb = toCall / (pot + toCall)
    if (Math.random() < profile.bluffFreq * 0.5 * profile.aggression && chips > currentBet * 2) {
      const rs = Math.round(currentBet * (2.2 + Math.random() * 0.8))
      return { type: 'raise', amount: Math.min(rs, chips + playerBet) }
    }
    if (toCall / Math.max(pot, 1) > 0.75 && Math.random() > profile.vpip * 1.5) return { type: 'fold' }
    if (Math.random() < 0.10 * profile.aggression && chips > currentBet * 2.5) {
      const rs = Math.round(currentBet * (2.0 + profile.aggression * 0.5))
      return { type: 'raise', amount: Math.min(rs, chips + playerBet) }
    }
    if (Math.random() < profile.vpip * 1.3 * (1 - potOddsFb)) return { type: 'call' }
    return { type: 'fold' }
  }

  // ─── Card-aware postflop logic with street awareness ──

  const hasStrongHand = strength >= 0.40
  const hasMonster = strength >= 0.55
  const hasDraw = strength >= 0.20 && strength < 0.40
  const hasWeakMade = strength >= 0.10 && strength < 0.20
  const hasNothing = strength < 0.10

  // Street awareness context
  const isPreflopRaiser = ctx.wasPreflopRaiser ?? false
  const isMultiway = (ctx.preflopCallers ?? 1) >= 2
  const betOnFlop = ctx.streetHistory?.flop === 'bet' || ctx.streetHistory?.flop === 'raise'
  const calledOnFlop = ctx.streetHistory?.flop === 'call'
  const betOnTurn = ctx.streetHistory?.turn === 'bet' || ctx.streetHistory?.turn === 'raise'

  // Opponent reads — if opponents are passive, bluff more; if aggressive, tighten up
  const oppPassive = ctx.opponentReads?.tableIsPassive ?? false
  const oppAggression = ctx.opponentReads?.avgAggression ?? 1.0
  const oppBluffRate = ctx.opponentReads?.recentBluffRate ?? 0.15

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
      const cbetRate = (hasStrongHand ? 0.80
        : hasDraw ? 0.55 + profile.aggression * 0.10
        : hasWeakMade ? 0.40
        : 0.20 + profile.bluffFreq * 0.6) * textureMod  // air c-bet scales with texture
      // Reduce in multiway pots
      const multiDiscount = isMultiway ? 0.65 : 1.0
      if (Math.random() < cbetRate * multiDiscount) {
        // Size based on texture: bigger on wet boards (charge draws), smaller on dry
        const sizeMult = board?.isWet ? 0.65 : board?.isDry ? 0.35 : 0.50
        const betSize = Math.round(pot * (sizeMult + profile.aggression * 0.12 + Math.random() * 0.12))
        return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
      }
      return { type: 'check' }
    }

    // Second barrel (turn): if bet the flop, consider barreling
    // Board texture: barrel more on dry boards and scare cards, less on draw-completing cards
    if (betOnFlop && ctx.street === 'turn') {
      const turnTexture = board
        ? (board.isDry ? 1.10 : 1.0)
          * (board.isAceHigh ? 1.10 : 1.0)
          * (board.isMonotone ? 0.70 : 1.0)  // flush possible = slow down
          * rangeAdv
        : 1.0
      const barrelRate = (hasStrongHand ? 0.75
        : hasMonster ? 0.90
        : hasDraw ? 0.45 + profile.aggression * 0.10
        : hasNothing ? profile.bluffFreq * 0.6 * profile.aggression  // bluff barrel with air
        : 0.30) * turnTexture
      if (Math.random() < barrelRate) {
        const betSize = Math.round(pot * (0.50 + profile.aggression * 0.15 + Math.random() * 0.15))
        return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
      }
      return { type: 'check' }
    }

    // Third barrel (river): strong hands for value, board-texture-aware bluffs
    // Key insight: on ace-high dry boards, river bluffs work because opponent
    // rarely has an ace (would have raised earlier). On wet boards that bricked,
    // bluffs represent the missed draw.
    if (betOnTurn && ctx.street === 'river') {
      const riverBluffBoost = board
        ? (board.isAceHigh && board.isDry ? 1.5 : 1.0) // ace-high dry = great bluff spot
          * (board.isWet ? 1.3 : 1.0)                    // wet board that bricked = "missed draw" bluff
          * (board.isPaired ? 0.7 : 1.0)                  // paired boards = opponent may have trips
          * rangeAdv
        : 1.0
      const barrelRate = hasMonster ? 0.85
        : hasStrongHand ? 0.60
        : hasNothing ? profile.bluffFreq * 0.4 * profile.aggression * riverBluffBoost
        : 0.20
      if (Math.random() < barrelRate) {
        const betSize = Math.round(pot * (0.55 + profile.aggression * 0.15 + Math.random() * 0.15))
        return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
      }
      return { type: 'check' }
    }

    // Not the preflop raiser — lead (donk bet) on boards where we have range advantage
    // or where the board texture favors our range (low, connected boards)
    const callerRangeAdv = board ? rangeAdvantage(board, false) : 1.0
    const donkFreq = profile.donkBetFreq ?? 0 // fictional bots donk-bet; pros don't

    // Donk bet with strong hands — non-pro players lead into the raiser frequently
    if (hasStrongHand) {
      const leadRate = donkFreq > 0
        ? donkFreq + profile.aggression * 0.15 // fictional: use their donk freq
        : (0.25 + profile.aggression * 0.25) * callerRangeAdv // pro: texture-based
      if (Math.random() < leadRate) {
        const betSize = Math.round(pot * (0.45 + profile.aggression * 0.15 + Math.random() * 0.15))
        return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
      }
    }

    // Donk bet with draws (semi-bluff lead)
    if (hasDraw) {
      const drawLeadRate = donkFreq > 0
        ? donkFreq * 0.7 // fictional: lead with draws at ~70% of their donk rate
        : (profile.bluffFreq + profile.aggression * 0.10) * callerRangeAdv // pro: texture-based
      if (Math.random() < drawLeadRate) {
        const betSize = Math.round(pot * (0.40 + Math.random() * 0.20))
        return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
      }
    }

    // Probe bet / donk bet with air — board-texture-aware
    // Fictional bots donk with air at their donkBetFreq; pros use texture reads.
    {
      const probeRate = donkFreq > 0
        ? donkFreq * 0.4 // fictional: donk bluff at ~40% of their donk rate
        : profile.bluffFreq * profile.aggression * 0.25
          * (board?.isAceHigh ? 1.5 : 1.0)   // represent the ace
          * (board?.isDry ? 1.4 : 1.0)        // dry = more fold equity
          * (board?.isLow ? 1.2 : 1.0)        // low boards with overcards = represent overpair
          * (oppPassive ? 1.3 : 1.0)           // passive table = more fold equity
      if (hasNothing && Math.random() < probeRate) {
        const bluffSize = Math.round(pot * (0.33 + Math.random() * 0.22))
        return { type: 'raise', amount: Math.max(bluffSize, bb) + playerBet }
      }
      // Also probe with weak made hands on scary boards (represent strength)
      if (hasWeakMade && (board?.isAceHigh || donkFreq > 0.10) && Math.random() < probeRate * 0.8) {
        const betSize = Math.round(pot * (0.30 + Math.random() * 0.20))
        return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
      }
    }

    return { type: 'check' }
  }

  // ─── Facing a bet ──────────────────────────────────────
  const potOdds = toCall / (pot + toCall)
  const betToPotRatio = toCall / Math.max(pot, 1)

  // Street pressure: later streets require stronger hands to continue
  // Flop = 1.0, Turn = 0.75, River = 0.55 (much harder to call river bets)
  // Passive players (low aggression) call MORE — that's their identity.
  // Aggressive players fold or raise — they don't flat-call as much.
  const baseStreetFactor = ctx.street === 'river' ? 0.55
    : ctx.street === 'turn' ? 0.75
    : 1.0
  const passiveBoost = Math.max(0.8, 1.6 - profile.aggression * 0.6)
  // Carl (agg 0.60): boost 1.24x — calls down more. Twan (agg 1.50): boost 0.80x — folds or raises.
  const streetFactor = baseStreetFactor * passiveBoost

  // Monster hands — raise for value
  if (hasMonster && Math.random() < 0.15 + profile.aggression * 0.25 && chips > currentBet * 2) {
    const raiseSize = Math.round(currentBet * (2.2 + Math.random() * 0.8))
    return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
  }

  // Strong hands — usually call, sometimes raise, but fold to huge bets on river
  if (hasStrongHand) {
    if (Math.random() < profile.aggression * 0.12 && chips > currentBet * 2.5) {
      const raiseSize = Math.round(currentBet * (2.0 + profile.aggression * 0.5))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    // Fold top pair to pot-sized+ bets on the river (could be beaten)
    if (ctx.street === 'river' && betToPotRatio > 0.8 && strength < 0.50 && Math.random() > profile.vpip) {
      return { type: 'fold' }
    }
    return { type: 'call' }
  }

  // Draws — only on flop/turn (no draws on river), need pot odds
  if (hasDraw && ctx.street !== 'river') {
    if (Math.random() < profile.bluffFreq * profile.aggression * 0.5 && chips > currentBet * 2) {
      const raiseSize = Math.round(currentBet * (2.2 + Math.random() * 0.8))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    // Need decent pot odds to call a draw
    if (betToPotRatio < 0.4) return { type: 'call' }
    if (Math.random() < profile.vpip * 0.5 * streetFactor) return { type: 'call' }
    return { type: 'fold' }
  }

  // Weak made hands — call small bets on flop, tighten on later streets
  if (hasWeakMade) {
    if (betToPotRatio < 0.4 && Math.random() < profile.vpip * 0.7 * streetFactor) return { type: 'call' }
    if (Math.random() < profile.vpip * 0.2 * streetFactor) return { type: 'call' }
    return { type: 'fold' }
  }

  // Nothing — mostly fold. Rare bluff raise, very rare float.
  if (Math.random() < profile.bluffFreq * 0.15 * profile.aggression && chips > currentBet * 2) {
    const raiseSize = Math.round(currentBet * (2.5 + Math.random()))
    return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
  }

  // Float only tiny bets on the flop
  if (ctx.street === 'flop' && betToPotRatio < 0.3 && Math.random() < profile.vpip * 0.25) {
    return { type: 'call' }
  }

  return { type: 'fold' }
}

/**
 * Simulate N preflop + postflop decisions for a bot profile and return observed stats.
 * Used for verifying that a profile's observed VPIP, PFR, fold rate, raise rate,
 * and bluff rate statistically match its configured values.
 */
export function simulateBotStats(
  profile: BotProfile,
  numHands: number = 1000,
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
    // Simulate preflop decision (facing a raise ~60% of the time)
    const facingRaise = Math.random() < 0.6
    const preflopCtx: DecisionContext = {
      street: 'preflop',
      toCall: facingRaise ? bb * 2.5 : bb,
      pot: bb * 1.5,
      currentBet: facingRaise ? bb * 2.5 : bb,
      playerBet: 0,
      chips: 200,
      bb,
      numActivePlayers: 5,
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
      const facingBet = Math.random() < 0.5
      const postPot = bb * 6

      const postCtx: DecisionContext = {
        street: 'flop',
        toCall: facingBet ? Math.round(postPot * 0.6) : 0,
        pot: postPot,
        currentBet: facingBet ? Math.round(postPot * 0.6) : 0,
        playerBet: 0,
        chips: 180,
        bb,
        numActivePlayers: 3,
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
    // Test 3-bet: facing an open raise (raiseLevel=1)
    threeBetOpps++
    const ctx3: DecisionContext = {
      street: 'preflop', toCall: bb * 2.5, pot: bb * 4,
      currentBet: bb * 2.5, playerBet: 0, chips: 200, bb, numActivePlayers: 5,
      raiseLevel: 1,
    }
    const action3 = decideBotAction(profile, ctx3)
    if (action3.type === 'raise') threeBets++

    // Test facing a 3-bet (raiseLevel=2)
    foldsTo3BetOpps++
    const ctx3bet: DecisionContext = {
      street: 'preflop', toCall: bb * 7.5, pot: bb * 12,
      currentBet: bb * 7.5, playerBet: 0, chips: 200, bb, numActivePlayers: 4,
      raiseLevel: 2,
    }
    const action3bet = decideBotAction(profile, ctx3bet)
    if (action3bet.type === 'fold') foldsTo3Bet++
    else if (action3bet.type === 'raise') fourBets++
    else if (action3bet.type === 'call') callsTo3Bet++
    fourBetOpps++

    // Test facing a 4-bet (raiseLevel=3)
    foldsTo4BetOpps++
    const ctx4bet: DecisionContext = {
      street: 'preflop', toCall: bb * 20, pot: bb * 30,
      currentBet: bb * 20, playerBet: 0, chips: 200, bb, numActivePlayers: 3,
      raiseLevel: 3,
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
