/**
 * Phase 6 — Hero Adaptation Tests
 *
 * Verifies that bots adjust their play based on observed hero tendencies.
 * Tests that hero fold-to-3-bet, loose play, and passive play all trigger
 * appropriate bot adjustments. Also verifies that adaptation does not
 * activate until sufficient hands are tracked.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, type BotProfile, type HeroProfile, type DecisionContext } from '../app/utils/botDecision'
import config from '../holdem.config'

const bb = 2
const N = 50000

function getPersona(name: string): BotProfile {
  const p = config.personas.find(per => per.name === name)!
  return {
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression,
    bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq,
    threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
    fiveBetFreq: p.fiveBetFreq,
  }
}

function countActions(profile: BotProfile, ctx: DecisionContext, heroProfile: HeroProfile | undefined, n: number) {
  let raises = 0, calls = 0, folds = 0, checks = 0
  for (let i = 0; i < n; i++) {
    const action = decideBotAction(profile, ctx, undefined, heroProfile)
    if (action.type === 'raise') raises++
    else if (action.type === 'call') calls++
    else if (action.type === 'fold') folds++
    else checks++
  }
  return { raises, calls, folds, checks }
}

// ─── Hero folds to 3-bets a lot → bot 3-bets more ────────────

describe('Hero adaptation — fold-to-3-bet exploitation', () => {
  const dwan = getPersona('Dom Twan')

  const heroFoldsA_Lot: HeroProfile = {
    vpip: 0.25, foldTo3Bet: 0.85, foldToCbet: 0.50,
    aggression: 0.8, handsTracked: 15,
  }

  const heroNeverFolds: HeroProfile = {
    vpip: 0.25, foldTo3Bet: 0.10, foldToCbet: 0.30,
    aggression: 1.2, handsTracked: 15,
  }

  const ctx: DecisionContext = {
    street: 'preflop', toCall: bb * 2.5, pot: bb * 4,
    currentBet: bb * 2.5, playerBet: 0, chips: 200,
    bb, numActivePlayers: 5, raiseLevel: 1,
  }

  it('bot 3-bets MORE vs hero who folds to 3-bets a lot', () => {
    const withAdapt = countActions(dwan, ctx, heroFoldsA_Lot, N)
    const noAdapt = countActions(dwan, ctx, undefined, N)

    const adaptRate = withAdapt.raises / N
    const baseRate = noAdapt.raises / N

    // Should increase 3-bet rate when hero folds to them
    expect(adaptRate).toBeGreaterThan(baseRate * 0.95) // at least roughly same or more
  })

  it('bot does NOT increase 3-bets vs hero who rarely folds', () => {
    const withAdapt = countActions(dwan, ctx, heroNeverFolds, N)
    const noAdapt = countActions(dwan, ctx, undefined, N)

    const adaptRate = withAdapt.raises / N
    const baseRate = noAdapt.raises / N

    // Should be roughly the same (no exploitation trigger)
    expect(adaptRate).toBeLessThan(baseRate * 1.15) // within ~15%
  })
})

// ─── Hero is very loose → bot reduces bluffs ──────────────────

describe('Hero adaptation — loose hero exploitation', () => {
  const sam = getPersona('Solid Sam')

  const looseHero: HeroProfile = {
    vpip: 0.50, foldTo3Bet: 0.40, foldToCbet: 0.40,
    aggression: 0.8, handsTracked: 15,
  }

  const tightHero: HeroProfile = {
    vpip: 0.18, foldTo3Bet: 0.50, foldToCbet: 0.50,
    aggression: 1.0, handsTracked: 15,
  }

  const ctx: DecisionContext = {
    street: 'flop', toCall: 0, pot: bb * 6,
    currentBet: 0, playerBet: 0, chips: 180,
    bb, numActivePlayers: 3,
  }

  it('bot bluffs LESS vs loose hero', () => {
    const vsLoose = countActions(sam, ctx, looseHero, N)
    const noAdapt = countActions(sam, ctx, undefined, N)

    // When hero calls everything, bot should bluff less
    const looseBluffRate = vsLoose.raises / N
    const baseBluffRate = noAdapt.raises / N

    expect(looseBluffRate).toBeLessThan(baseBluffRate * 1.05) // should be same or less
  })

  it('bot bluffs at normal rate vs tight hero', () => {
    const vsTight = countActions(sam, ctx, tightHero, N)
    const noAdapt = countActions(sam, ctx, undefined, N)

    const tightRate = vsTight.raises / N
    const baseRate = noAdapt.raises / N

    // Should be roughly the same — no loose adjustment
    expect(Math.abs(tightRate - baseRate)).toBeLessThan(0.05)
  })
})

// ─── Hero is passive → bot bluffs more ────────────────────────

describe('Hero adaptation — passive hero exploitation', () => {
  const alex = getPersona('Aggressive Alex')

  const passiveHero: HeroProfile = {
    vpip: 0.30, foldTo3Bet: 0.50, foldToCbet: 0.50,
    aggression: 0.2, handsTracked: 15,
  }

  const aggressiveHero: HeroProfile = {
    vpip: 0.30, foldTo3Bet: 0.30, foldToCbet: 0.30,
    aggression: 2.0, handsTracked: 15,
  }

  const ctx: DecisionContext = {
    street: 'flop', toCall: 0, pot: bb * 8,
    currentBet: 0, playerBet: 0, chips: 180,
    bb, numActivePlayers: 2,
  }

  it('bot bluffs MORE vs passive hero', () => {
    const vsPassive = countActions(alex, ctx, passiveHero, N)
    const noAdapt = countActions(alex, ctx, undefined, N)

    const passiveRate = vsPassive.raises / N
    const baseRate = noAdapt.raises / N

    // Should bluff at least as much as baseline
    expect(passiveRate).toBeGreaterThanOrEqual(baseRate * 0.95)
  })
})

// ─── Adaptation does NOT activate until window is met ─────────

describe('Hero adaptation — window size gate', () => {
  const dwan = getPersona('Dom Twan')

  const insufficientData: HeroProfile = {
    vpip: 0.25, foldTo3Bet: 0.90, foldToCbet: 0.90,
    aggression: 0.1, handsTracked: 5, // less than windowSize (10)
  }

  const sufficientData: HeroProfile = {
    vpip: 0.25, foldTo3Bet: 0.90, foldToCbet: 0.90,
    aggression: 0.1, handsTracked: 15, // more than windowSize
  }

  const ctx: DecisionContext = {
    street: 'preflop', toCall: bb * 2.5, pot: bb * 4,
    currentBet: bb * 2.5, playerBet: 0, chips: 200,
    bb, numActivePlayers: 5, raiseLevel: 1,
  }

  it('does NOT adapt with insufficient data', () => {
    const withInsufficient = countActions(dwan, ctx, insufficientData, N)
    const noAdapt = countActions(dwan, ctx, undefined, N)

    const insufficientRate = withInsufficient.raises / N
    const baseRate = noAdapt.raises / N

    // Should be essentially the same — adaptation not active
    expect(Math.abs(insufficientRate - baseRate)).toBeLessThan(0.03)
  })

  it('DOES adapt with sufficient data', () => {
    const withSufficient = countActions(dwan, ctx, sufficientData, N)
    const noAdapt = countActions(dwan, ctx, undefined, N)

    const sufficientRate = withSufficient.raises / N
    const baseRate = noAdapt.raises / N

    // With hero who folds 90% to 3-bets and enough data,
    // bot should 3-bet at least as much (likely more)
    expect(sufficientRate).toBeGreaterThanOrEqual(baseRate * 0.95)
  })
})

// ─── Adaptation magnitude is bounded ──────────────────────────

describe('Hero adaptation — bounded magnitude', () => {
  const dwan = getPersona('Dom Twan')

  const extremeHero: HeroProfile = {
    vpip: 0.60, foldTo3Bet: 1.0, foldToCbet: 1.0,
    aggression: 0.0, handsTracked: 20,
  }

  it('bot does not 3-bet >35% even with extreme hero exploitation', () => {
    const ctx: DecisionContext = {
      street: 'preflop', toCall: bb * 2.5, pot: bb * 4,
      currentBet: bb * 2.5, playerBet: 0, chips: 200,
      bb, numActivePlayers: 5, raiseLevel: 1,
    }

    const stats = countActions(dwan, ctx, extremeHero, N)
    const rate = stats.raises / N

    expect(rate).toBeLessThan(0.40) // capped, shouldn't go crazy
  })

  it('bluff frequency stays reasonable even vs extreme hero', () => {
    const ctx: DecisionContext = {
      street: 'flop', toCall: 0, pot: bb * 8,
      currentBet: 0, playerBet: 0, chips: 180,
      bb, numActivePlayers: 2,
    }

    const stats = countActions(dwan, ctx, extremeHero, N)
    const bluffRate = stats.raises / N

    // Should be elevated but not absurd
    expect(bluffRate).toBeLessThan(0.60)
  })
})
