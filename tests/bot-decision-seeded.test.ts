/**
 * Determinism contract: with an injected seeded Rng, bot decisions and
 * Monte Carlo analysis are exactly reproducible.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction } from '../app/utils/botDecision'
import type { DecisionContext, BotProfile, HeroProfile } from '../app/utils/botDecision'
import { estimateEquity } from '../app/utils/handAnalysis'
import { mulberry32 } from '../app/utils/rng'
import type { Card } from '../app/utils/cards'

const profile: BotProfile = { vpip: 0.25, pfr: 0.2, aggression: 1.2, bluffFreq: 0.15, creativeFreq: 0.08 }

const ctx = (rng: () => number): DecisionContext => ({
  street: 'preflop', toCall: 2, pot: 3, currentBet: 2, playerBet: 0,
  chips: 200, bb: 2, numActivePlayers: 6, raiseLevel: 0, position: 'BTN',
  holeCards: [{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }],
  community: [], rng,
})

describe('seeded bot decisions', () => {
  it('same seed → identical action across 50 decisions', () => {
    for (let i = 0; i < 50; i++) {
      const a = decideBotAction(profile, ctx(mulberry32(1000 + i)), 1)
      const b = decideBotAction(profile, ctx(mulberry32(1000 + i)), 1)
      expect(a).toEqual(b)
    }
  })

  it('postflop decisions are seed-deterministic too', () => {
    const board: Card[] = [
      { rank: 14, suit: 'hearts' }, { rank: 9, suit: 'spades' }, { rank: 4, suit: 'diamonds' },
    ]
    for (let i = 0; i < 50; i++) {
      const make = () => decideBotAction(profile, {
        ...ctx(mulberry32(2000 + i)), street: 'flop', community: board,
        toCall: 0, currentBet: 0, raiseLevel: 0, wasPreflopRaiser: true, preflopCallers: 1,
      }, 1)
      expect(make()).toEqual(make())
    }
  })
})

describe('seeded equity', () => {
  it('same seed → identical equity', () => {
    const hole: [Card, Card] = [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }]
    const board: Card[] = [{ rank: 2, suit: 'clubs' }, { rank: 7, suit: 'diamonds' }, { rank: 12, suit: 'spades' }]
    const a = estimateEquity(hole, board, 2, 500, mulberry32(42))
    const b = estimateEquity(hole, board, 2, 500, mulberry32(42))
    expect(a).toBe(b)
  })
})

describe('readStrength scales hero adaptation', () => {
  // adaptation's preflop lever is threeBetFreq/fourBetFreq — the bot must have them
  const lagBot: BotProfile = { ...profile, threeBetFreq: 0.06, fourBetFreq: 0.02 }
  const overFolder: HeroProfile = {
    vpip: 0.2, foldTo3Bet: 0.9, foldToCbet: 0.3, aggression: 1, handsTracked: 200,
  }
  const ctx3bet = (rng: () => number): DecisionContext => ({
    street: 'preflop', toCall: 5, pot: 8.5, currentBet: 7.5, playerBet: 2.5,
    chips: 200, bb: 2, numActivePlayers: 3, raiseLevel: 1, position: 'BTN',
    rng,
  })
  it('readStrength 0 behaves exactly like no heroProfile at all', () => {
    for (let i = 0; i < 40; i++) {
      const a = decideBotAction(lagBot, ctx3bet(mulberry32(7000 + i)), 1, { ...overFolder, readStrength: 0 })
      const b = decideBotAction(lagBot, ctx3bet(mulberry32(7000 + i)), 1, undefined)
      expect(a).toEqual(b)
    }
  })
  it('readStrength absent behaves exactly like today (full adaptation)', () => {
    for (let i = 0; i < 40; i++) {
      const a = decideBotAction(lagBot, ctx3bet(mulberry32(8000 + i)), 1, overFolder)
      const b = decideBotAction(lagBot, ctx3bet(mulberry32(8000 + i)), 1, { ...overFolder, readStrength: 1 })
      expect(a).toEqual(b)
    }
  })
  it('partial readStrength raises 3-bet frequency less than full', () => {
    const freq = (rs: number | undefined) => {
      let raises = 0
      const rng = mulberry32(99)
      for (let i = 0; i < 4000; i++) {
        const hp = rs === undefined ? undefined : { ...overFolder, readStrength: rs }
        if (decideBotAction(lagBot, ctx3bet(rng), 1, hp).type === 'raise') raises++
      }
      return raises / 4000
    }
    const none = freq(0)
    const half = freq(0.5)
    const full = freq(1)
    expect(full).toBeGreaterThan(none)
    expect(half).toBeGreaterThan(none)
    expect(half).toBeLessThan(full)
  })
})
