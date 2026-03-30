/**
 * Bot decision engine — makes betting decisions based on persona config.
 *
 * Each decision is probabilistic, driven by the bot's VPIP, PFR, aggression,
 * bluffFreq, and creativeFreq stats. Over many hands, a bot's observed
 * behavior should statistically match its config.
 */

export interface BotProfile {
  vpip: number        // 0.10–0.50 — probability of voluntarily entering a pot
  pfr: number         // 0.05–0.40 — probability of raising preflop (subset of vpip)
  aggression: number  // 0.30–2.00 — multiplier on bet/raise frequency postflop
  bluffFreq: number   // 0.03–0.30 — probability of betting/raising with nothing
  creativeFreq: number // 0.01–0.15 — probability of unorthodox plays
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
  // Hellmuth (2.5x) tilts after just 1-2 losses; Ivey (0.3x) needs 10+
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
 * Returns a tilt-modified profile. The base profile is not mutated.
 */
/**
 * Returns a tilt-modified profile. The base profile is not mutated.
 * tiltMultiplier scales how hard tilt hits this specific bot:
 *   - Hellmuth (2.5): massive tilt swings
 *   - Ivey (0.3): barely affected
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
  }
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
}

export interface BotAction {
  type: 'fold' | 'check' | 'call' | 'raise'
  amount?: number      // total raise-to amount (only for raise)
}

/**
 * Make a bot decision based on persona config and game context.
 * Designed to produce behavior that statistically matches the config
 * over a large sample of decisions.
 */
export function decideBotAction(profile: BotProfile, ctx: DecisionContext): BotAction {
  const rand = Math.random()
  const { toCall, pot, chips, bb, street, currentBet, playerBet, numActivePlayers } = ctx

  // ─── Preflop ───────────────────────────────────────────────
  if (street === 'preflop') {
    return decidePreflopAction(profile, ctx, rand)
  }

  // ─── Postflop ──────────────────────────────────────────────
  return decidePostflopAction(profile, ctx, rand)
}

function decidePreflopAction(profile: BotProfile, ctx: DecisionContext, rand: number): BotAction {
  const { toCall, pot, chips, bb, currentBet, playerBet } = ctx

  if (toCall === 0) {
    // Limped to us or we're BB with no raise
    // Raise with PFR probability
    if (rand < profile.pfr) {
      const raiseSize = Math.round(bb * (2.2 + profile.aggression * 0.5))
      return { type: 'raise', amount: Math.min(raiseSize + playerBet, chips + playerBet) }
    }
    return { type: 'check' }
  }

  // Facing a raise
  if (toCall <= bb) {
    // Completing the BB — use VPIP
    if (rand < profile.vpip) {
      // Sometimes raise instead of call (PFR/VPIP ratio)
      if (rand < profile.pfr) {
        const raiseSize = Math.round(currentBet * (2.5 + profile.aggression * 0.5))
        return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
      }
      return { type: 'call' }
    }
    return { type: 'fold' }
  }

  // Facing a real raise — tighten range
  const callThreshold = profile.vpip * 0.7 // tighter vs raises
  if (rand < callThreshold) {
    // Sometimes 3-bet
    const threeBetThreshold = profile.pfr * 0.35 * profile.aggression
    if (rand < threeBetThreshold && chips > currentBet * 3) {
      const raiseSize = Math.round(currentBet * (3.0 + (profile.aggression - 1) * 0.5))
      return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
    }
    return { type: 'call' }
  }

  return { type: 'fold' }
}

function decidePostflopAction(profile: BotProfile, ctx: DecisionContext, _rand: number): BotAction {
  const { toCall, pot, chips, bb, currentBet, playerBet, numActivePlayers } = ctx

  if (toCall === 0) {
    // No bet to face — decide: bluff, value bet, or check
    // Each path uses an independent random roll

    // Bluff bet — driven purely by bluffFreq
    if (Math.random() < profile.bluffFreq) {
      const bluffSize = Math.round(pot * (0.33 + Math.random() * 0.22))
      return { type: 'raise', amount: Math.max(bluffSize, bb) + playerBet }
    }

    // Value/protection bet — driven by aggression
    if (Math.random() < 0.22 * profile.aggression) {
      const betSize = Math.round(pot * (0.45 + profile.aggression * 0.2 + Math.random() * 0.15))
      return { type: 'raise', amount: Math.max(betSize, bb) + playerBet }
    }

    return { type: 'check' }
  }

  // Facing a bet — fold, call, or raise
  const potOdds = toCall / (pot + toCall)
  const betToPotRatio = toCall / Math.max(pot, 1)

  // Bluff raise — independent roll using bluffFreq + aggression
  if (Math.random() < profile.bluffFreq * 0.5 * profile.aggression && chips > currentBet * 2) {
    const raiseSize = Math.round(currentBet * (2.2 + Math.random() * 0.8))
    return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
  }

  // Tight players fold to big bets
  if (betToPotRatio > 0.75 && Math.random() > profile.vpip * 1.2) {
    return { type: 'fold' }
  }

  // Value raise — aggressive players raise more
  if (Math.random() < 0.10 * profile.aggression && chips > currentBet * 2.5) {
    const raiseSize = Math.round(currentBet * (2.0 + profile.aggression * 0.5))
    return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
  }

  // Call or fold — VPIP-influenced
  const callProb = profile.vpip * 1.3 * (1 - potOdds)
  if (Math.random() < callProb) {
    return { type: 'call' }
  }

  return { type: 'fold' }
}

/**
 * Simulate N decisions for a bot profile and return observed stats.
 * Used for testing that behavior matches config.
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
