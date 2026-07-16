/**
 * Information-hygiene contract: a bot's decision may depend only on the
 * board its street allows it to see. Callers hold the full 5-card runout
 * (dealt up-front), so decideBotAction must street-slice ctx.community —
 * a flop decision made with the full runout in context must be identical
 * to the same decision made with only the flop.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction } from '../app/utils/botDecision'
import type { DecisionContext, BotProfile } from '../app/utils/botDecision'
import { mulberry32 } from '../app/utils/rng'
import type { Card } from '../app/utils/cards'

const profile: BotProfile = { vpip: 0.25, pfr: 0.2, aggression: 1.2, bluffFreq: 0.15, creativeFreq: 0.08 }

// Hero holds a big draw on the flop; the runout completes the flush AND the
// straight. A clairvoyant bot evaluates a made hand; an honest one sees a draw.
const hole: [Card, Card] = [{ rank: 8, suit: 'hearts' }, { rank: 7, suit: 'hearts' }]
const runout: Card[] = [
  { rank: 9, suit: 'hearts' }, { rank: 10, suit: 'hearts' }, { rank: 2, suit: 'clubs' },  // flop
  { rank: 11, suit: 'hearts' },                                                           // turn
  { rank: 6, suit: 'spades' },                                                            // river
]

const base = (rng: () => number): DecisionContext => ({
  street: 'flop', toCall: 10, pot: 20, currentBet: 10, playerBet: 0,
  chips: 200, bb: 2, numActivePlayers: 3, raiseLevel: 0, position: 'BTN',
  holeCards: hole, rng,
})

describe('street-sliced community (no clairvoyance)', () => {
  it('flop decision is identical with 3-card and 5-card community in ctx', () => {
    for (let i = 0; i < 200; i++) {
      const honest = decideBotAction(profile, { ...base(mulberry32(7000 + i)), community: runout.slice(0, 3) }, 1)
      const leaked = decideBotAction(profile, { ...base(mulberry32(7000 + i)), community: runout }, 1)
      expect(leaked).toEqual(honest)
    }
  })

  it('turn decision is identical with 4-card and 5-card community in ctx', () => {
    for (let i = 0; i < 200; i++) {
      const honest = decideBotAction(profile, {
        ...base(mulberry32(9000 + i)), street: 'turn', community: runout.slice(0, 4),
      }, 1)
      const leaked = decideBotAction(profile, {
        ...base(mulberry32(9000 + i)), street: 'turn', community: runout,
      }, 1)
      expect(leaked).toEqual(honest)
    }
  })

  it('consistency brain-fart path is also sliced (strong-made guard)', () => {
    // consistency 0 forces generateRandomAction every time; its strongMade
    // guard reads ctx.community too and must not see the runout.
    for (let i = 0; i < 200; i++) {
      const honest = decideBotAction(profile, { ...base(mulberry32(11000 + i)), community: runout.slice(0, 3) }, 0)
      const leaked = decideBotAction(profile, { ...base(mulberry32(11000 + i)), community: runout }, 0)
      expect(leaked).toEqual(honest)
    }
  })
})
