/**
 * Determinism contract: with an injected seeded Rng, bot decisions and
 * Monte Carlo analysis are exactly reproducible.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction } from '../app/utils/botDecision'
import type { DecisionContext, BotProfile } from '../app/utils/botDecision'
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
