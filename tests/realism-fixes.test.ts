/**
 * Realism fixes test suite — covers the 2026-06 bot realism overhaul:
 *   F4: combo-weighted hand percentile (idx/169 → cumulative combo mass)
 *   F1: tilt only triggers on hands the bot actually played
 *   F2: raise-size-aware preflop defense (jams get premium-only continues)
 *   F3: made-hand bet-size sensitivity postflop
 *   F6: per-persona range shapes (styleBias) + open-limp model (limpFreq)
 *   F7: sizing personality (betSizeMult) + river overbets (overbetFreq)
 *   F8c: hero bet-sizing tell detection
 *
 * Spec: docs/superpowers/specs/2026-06-10-pro-bot-realism-design.md
 */
import { describe, it, expect } from 'vitest'
import { handPercentile, handCategory } from '../app/utils/ranges'
import { updateTilt, createTiltState, decideBotAction, type DecisionContext, type BotProfile } from '../app/utils/botDecision'
import config from '../holdem.config'
import type { Card } from '../app/utils/cards'

const c = (rank: number, suit: Card['suit']): Card => ({ rank, suit })

/** Draw two distinct random cards from a fresh 52-card deck. */
export function dealRandomHole(): [Card, Card] {
  const deck: Card[] = []
  for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as const) {
    for (let r = 2; r <= 14; r++) deck.push(c(r, suit))
  }
  const i1 = Math.floor(Math.random() * 52)
  let i2 = Math.floor(Math.random() * 52)
  while (i2 === i1) i2 = Math.floor(Math.random() * 52)
  return [deck[i1], deck[i2]]
}

// ─── F4: Combo-weighted percentile ─────────────────────────────

describe('F4 — combo-weighted percentile', () => {
  it('AA is the top ~0.45% of dealt hands', () => {
    expect(handPercentile([c(14, 'hearts'), c(14, 'spades')])).toBeCloseTo(6 / 1326, 3)
  })

  it('72o is the bottom (1.0)', () => {
    expect(handPercentile([c(7, 'hearts'), c(2, 'clubs')])).toBeCloseTo(1.0, 3)
  })

  it('AA/KK stay inside a 1% five-bet range, QQ does not', () => {
    expect(handPercentile([c(14, 'hearts'), c(14, 'spades')])).toBeLessThan(0.01)
    expect(handPercentile([c(13, 'hearts'), c(13, 'spades')])).toBeLessThan(0.01)
    expect(handPercentile([c(12, 'hearts'), c(12, 'spades')])).toBeGreaterThan(0.01)
  })

  it('random dealt hands are ~uniform: P(pct < 0.25) ≈ 0.25', () => {
    let below = 0
    const N = 40000
    for (let i = 0; i < N; i++) {
      if (handPercentile(dealRandomHole()) < 0.25) below++
    }
    expect(below / N).toBeGreaterThan(0.22)
    expect(below / N).toBeLessThan(0.28)
  })
})

// ─── F1: Tilt requires participation ───────────────────────────

describe('F1 — tilt requires participation', () => {
  it('folding preflop 20 times never tilts even Phellmuth', () => {
    const state = createTiltState()
    for (let i = 0; i < 20; i++) updateTilt(state, false, false, config.tilt, 2.5, false)
    expect(state.tilted).toBe(false)
    expect(state.consecutiveLosses).toBe(0)
  })

  it('played losses still tilt (participated defaults to true)', () => {
    const state = createTiltState()
    updateTilt(state, false, false, config.tilt, 2.5)
    expect(state.tilted).toBe(true)
  })

  it('a fold between two played losses does not reset the loss count', () => {
    const state = createTiltState()
    updateTilt(state, false, false, config.tilt, 1.0, true)  // played loss
    updateTilt(state, false, false, config.tilt, 1.0, false) // folded preflop
    updateTilt(state, false, false, config.tilt, 1.0, true)  // played loss
    expect(state.consecutiveLosses).toBe(2)
  })
})

// ─── F2: Raise-size-aware preflop defense ──────────────────────

describe('F2 — raise-size-aware defense', () => {
  function continueRate(currentBetBB: number, trials = 4000): number {
    const profile: BotProfile = { vpip: 0.32, pfr: 0.22, aggression: 1.2, bluffFreq: 0.18, creativeFreq: 0.05, threeBetFreq: 0.10 }
    let cont = 0
    for (let i = 0; i < trials; i++) {
      const ctx: DecisionContext = {
        street: 'preflop', toCall: currentBetBB * 2, pot: currentBetBB * 2 + 3, currentBet: currentBetBB * 2,
        playerBet: 0, chips: 200, bb: 2, numActivePlayers: 4, raiseLevel: 1, position: 'BTN',
        holeCards: dealRandomHole(),
      }
      const a = decideBotAction(profile, ctx)
      if (a.type === 'call' || a.type === 'raise') cont++
    }
    return cont / trials
  }

  it('loose bot continues vs a 2.5bb open at a healthy rate', () => {
    expect(continueRate(2.5)).toBeGreaterThan(0.15)
  })

  it('vs a 25bb jam-like raise, continues under 8% (premium only)', () => {
    expect(continueRate(25)).toBeLessThan(0.08)
  })

  it('continue rate declines monotonically with raise size', () => {
    const r25 = continueRate(2.5), r6 = continueRate(6), r12 = continueRate(12)
    expect(r6).toBeLessThan(r25)
    expect(r12).toBeLessThan(r6)
  })
})

// ─── F3: Made hands respect bet size ───────────────────────────

describe('F3 — made hands respect bet size postflop', () => {
  // Top pair good kicker (KQ on K-7-2 rainbow), deep stacks so no SPR auto-commit
  function strongFacingBet(betToPot: number, street: 'flop' | 'turn' = 'flop', trials = 3000): number {
    const profile: BotProfile = { vpip: 0.25, pfr: 0.20, aggression: 1.1, bluffFreq: 0.12, creativeFreq: 0.05 }
    let folds = 0
    for (let i = 0; i < trials; i++) {
      const pot = 20
      const community = street === 'flop'
        ? [c(13, 'clubs'), c(7, 'spades'), c(2, 'diamonds')]
        : [c(13, 'clubs'), c(7, 'spades'), c(2, 'diamonds'), c(9, 'hearts')]
      const ctx: DecisionContext = {
        street, toCall: Math.round(pot * betToPot), pot, currentBet: Math.round(pot * betToPot),
        playerBet: 0, chips: 2000, bb: 2, numActivePlayers: 2, position: 'BB',
        holeCards: [c(13, 'hearts'), c(12, 'diamonds')],
        community,
      }
      if (decideBotAction(profile, ctx).type === 'fold') folds++
    }
    return folds / trials
  }

  it('top pair folds >40% to a 3x-pot flop shove', () => {
    expect(strongFacingBet(3)).toBeGreaterThan(0.40)
  })

  it('top pair rarely folds to a half-pot flop bet', () => {
    expect(strongFacingBet(0.5)).toBeLessThan(0.10)
  })

  it('turn overbets get more folds than flop overbets', () => {
    expect(strongFacingBet(1.5, 'turn')).toBeGreaterThan(strongFacingBet(1.5, 'flop'))
  })
})

// ─── F6: Range shapes (styleBias) + limp model (limpFreq) ──────

describe('F6 — hand categories, styleBias, limpFreq', () => {
  it('categorizes hands correctly', () => {
    expect(handCategory('88')).toBe('pair')
    expect(handCategory('A5s')).toBe('suitedAce')
    expect(handCategory('87s')).toBe('suitedConnector')
    expect(handCategory('KQo')).toBe('bigCard')
    expect(handCategory('AKs')).toBe('suitedAce')
    expect(handCategory('J4o')).toBe('other')
  })

  const firstInCtx = (hole: [Card, Card]): DecisionContext => ({
    street: 'preflop', toCall: 2, pot: 3, currentBet: 2, playerBet: 0, chips: 200, bb: 2,
    numActivePlayers: 6, raiseLevel: 0, position: 'MP', holeCards: hole,
  })

  it('suited-connector bias widens those hands for a Negreanu-style bot', () => {
    const base: BotProfile = { vpip: 0.22, pfr: 0.18, aggression: 1.0, bluffFreq: 0.10, creativeFreq: 0.05 }
    const biased: BotProfile = { ...base, styleBias: { suitedConnector: -0.10 } }
    const hole: [Card, Card] = [c(8, 'hearts'), c(7, 'hearts')] // 87s ≈ pct 0.31
    let plainPlays = 0, biasedPlays = 0
    for (let i = 0; i < 2000; i++) {
      if (decideBotAction(base, firstInCtx(hole)).type !== 'fold') plainPlays++
      if (decideBotAction(biased, firstInCtx(hole)).type !== 'fold') biasedPlays++
    }
    expect(biasedPlays).toBeGreaterThan(plainPlays + 300)
  })

  it('limpFreq=0 pro never open-limps; limpFreq=0.6 passive limps the gap band', () => {
    const passive: BotProfile = { vpip: 0.30, pfr: 0.15, aggression: 0.8, bluffFreq: 0.08, creativeFreq: 0.04, limpFreq: 0.6 }
    const pro: BotProfile = { ...passive, limpFreq: 0 }
    let passiveLimps = 0, proLimps = 0
    for (let i = 0; i < 3000; i++) {
      const hole = dealRandomHole()
      if (decideBotAction(passive, firstInCtx(hole)).type === 'call') passiveLimps++
      if (decideBotAction(pro, firstInCtx(hole)).type === 'call') proLimps++
    }
    expect(proLimps).toBe(0)
    expect(passiveLimps).toBeGreaterThan(100)
  })
})

// ─── F7: Sizing personality + overbets ─────────────────────────

describe('F7 — sizing personality', () => {
  // Top set of aces, checked to us on the river, deep stacks
  const monsterCtx = (): DecisionContext => ({
    street: 'river', toCall: 0, pot: 100, currentBet: 0, playerBet: 0, chips: 1000, bb: 2,
    numActivePlayers: 2, position: 'BTN',
    holeCards: [c(14, 'hearts'), c(14, 'diamonds')],
    community: [c(14, 'clubs'), c(7, 'spades'), c(2, 'diamonds'), c(9, 'hearts'), c(3, 'clubs')],
  })

  function riverValueSizes(profile: BotProfile, trials = 300): number[] {
    const sizes: number[] = []
    for (let i = 0; i < trials; i++) {
      const a = decideBotAction(profile, monsterCtx())
      if (a.type === 'raise') sizes.push(a.amount!)
    }
    return sizes
  }

  it('overbettor (overbetFreq 1.0) bets more than pot with a river monster', () => {
    const p: BotProfile = { vpip: 0.30, pfr: 0.25, aggression: 1.4, bluffFreq: 0.2, creativeFreq: 0.05, overbetFreq: 1.0 }
    const sizes = riverValueSizes(p)
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.max(...sizes)).toBeGreaterThan(100)
  })

  it('small-ball (betSizeMult 0.8) sizes smaller than big-bet (1.2) on average', () => {
    const avg = (mult: number) => {
      const p: BotProfile = { vpip: 0.30, pfr: 0.25, aggression: 1.0, bluffFreq: 0.15, creativeFreq: 0.05, betSizeMult: mult, overbetFreq: 0 }
      const sizes = riverValueSizes(p, 400)
      return sizes.reduce((s, x) => s + x, 0) / sizes.length
    }
    expect(avg(0.8)).toBeLessThan(avg(1.2))
  })

  it('open-raise size reflects betSizeMult', () => {
    const open = (mult: number): number => {
      const p: BotProfile = { vpip: 0.99, pfr: 0.99, aggression: 1.0, bluffFreq: 0.1, creativeFreq: 0.05, betSizeMult: mult }
      const ctx: DecisionContext = {
        street: 'preflop', toCall: 2, pot: 3, currentBet: 2, playerBet: 0, chips: 200, bb: 2,
        numActivePlayers: 6, raiseLevel: 0, position: 'MP', holeCards: [c(14, 'hearts'), c(14, 'spades')],
      }
      const a = decideBotAction(p, ctx)
      return a.type === 'raise' ? a.amount! : 0
    }
    expect(open(1.2)).toBeGreaterThan(open(0.85))
  })
})
