/**
 * The live advisor must describe the spot the hero is actually in:
 *
 *  - preflop advice reads the action (nothing to call is never a fold; a raise
 *    in front tightens the range),
 *  - facing a postflop bet, equity is judged against a betting range, not
 *    against random hands,
 *  - the price of a call is capped at the hero's stack.
 */
import { describe, it, expect } from 'vitest'
import { recommend, analyzeHand, callPrice, equityVsBettingRange } from '../app/utils/handAnalysis'
import type { Card } from '../app/utils/cards'
import { mulberry32 } from '../app/utils/rng'

const R: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 }
const S: Record<string, Card['suit']> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
const c = (s: string): Card => ({ rank: R[s[0]!] ?? parseInt(s[0]!, 10), suit: S[s[1]!]! })
const H = (a: string, b: string): [Card, Card] => [c(a), c(b)]
const B = (...xs: string[]) => xs.map(c)

describe('preflop advice reads the action', () => {
  it('7-2 offsuit in the big blind with nothing to call is a check, never a fold', () => {
    const a = analyzeHand(H('7s', '2d'), [], 'preflop', 2, 'BB', 0, mulberry32(1), 4, { bb: 2 })
    expect(a.action).toBe('CHECK')
    expect(a.reasoning).toMatch(/free|nothing to call/i)
  })

  it('never advises folding any hand when there is nothing to call', () => {
    for (const hole of [H('7s', '2d'), H('9s', '4d'), H('Js', '8d'), H('Ts', '9s')]) {
      expect(analyzeHand(hole, [], 'preflop', 3, 'BB', 0, mulberry32(1), 6, { bb: 2 }).action).not.toBe('FOLD')
    }
  })

  it('still raises a premium hand from the big blind when checked to', () => {
    expect(analyzeHand(H('As', 'Ad'), [], 'preflop', 2, 'BB', 0, mulberry32(1), 4, { bb: 2 }).action).toBe('RAISE')
  })

  it('a marginal hand that limps on the button folds to a raise', () => {
    // Chen 5 (K9o): playable for one blind in position, not for a raise
    const limp = analyzeHand(H('Ks', '9d'), [], 'preflop', 3, 'BTN', 2, mulberry32(1), 3, { bb: 2 })
    const raised = analyzeHand(H('Ks', '9d'), [], 'preflop', 3, 'BTN', 8, mulberry32(1), 11, { bb: 2 })
    expect(limp.action).toBe('CALL')
    expect(raised.action).toBe('FOLD')
    expect(raised.reasoning).toMatch(/raise/i)
  })

  it('a playable hand opens on the button but only calls a raise', () => {
    const open = analyzeHand(H('Qs', 'Td'), [], 'preflop', 3, 'BTN', 2, mulberry32(1), 3, { bb: 2 })
    const raised = analyzeHand(H('Qs', 'Td'), [], 'preflop', 3, 'BTN', 6, mulberry32(1), 9, { bb: 2 })
    expect(open.action).toBe('RAISE')
    expect(raised.action).toBe('CALL')
  })

  it('in the big blind any amount to call means someone raised', () => {
    // A min-raise leaves the big blind exactly one blind to call
    const a = analyzeHand(H('Ks', '4d'), [], 'preflop', 2, 'BB', 2, mulberry32(1), 7, { bb: 2 })
    expect(a.action).toBe('FOLD')
    expect(a.reasoning).toMatch(/raise/i)
  })

  it('premium hands re-raise a raise', () => {
    expect(recommend('preflop', 50, [], null, 12, 'UTG', true, 40, true).action).toBe('RAISE')
  })

  it('a playable hand folds to a raise so large the call needs coin-flip equity', () => {
    expect(recommend('preflop', 50, [], null, 7, 'BTN', true, 49, true).action).toBe('FOLD')
  })
})

describe('facing a bet, equity is judged against a betting range', () => {
  it('discounts a medium-strength hand more against a bigger bet', () => {
    const small = equityVsBettingRange(60, 0.33)
    const big = equityVsBettingRange(60, 1)
    expect(small).toBeLessThan(60)
    expect(big).toBeLessThan(small)
    expect(big).toBeGreaterThan(40)
  })

  it('barely moves a near-nut hand', () => {
    expect(equityVsBettingRange(97, 1)).toBeGreaterThan(94)
  })

  it('never drops below the chance of completing a flush or straight draw', () => {
    expect(equityVsBettingRange(38, 1, 35)).toBe(35)
    // …and the floor can never raise equity above the raw figure
    expect(equityVsBettingRange(30, 1, 35)).toBeLessThanOrEqual(30)
  })

  it('analyzeHand reports raw equity untouched and a lower figure against the bet', () => {
    // Middle pair: comfortably ahead of random hands, not of a pot-sized bet
    const hole = H('8s', '7d'), board = B('Kh', '8c', '3d')
    const checked = analyzeHand(hole, board, 'flop', 1, 'BTN', 0, mulberry32(7), 100)
    const facing = analyzeHand(hole, board, 'flop', 1, 'BTN', 100, mulberry32(7), 200)
    expect(checked.equityVsRange).toBe(checked.equity)
    expect(facing.equity).toBe(checked.equity)
    expect(facing.equityVsRange).toBeLessThan(facing.equity - 5)
  })

  it('the recommendation uses the discounted figure, so it cannot disagree with the pot-odds verdict', () => {
    // ~62% vs a random hand would be a "call" against a pot bet needing 33%
    // either way; against a 2x overbet (needs 40%) only the range view folds.
    const hole = H('8s', '7d'), board = B('Kh', '8c', '3d')
    const a = analyzeHand(hole, board, 'flop', 1, 'BTN', 200, mulberry32(7), 300)
    const verdictCall = a.equityVsRange >= a.potOddsNeeded
    expect(a.action === 'FOLD').toBe(!verdictCall)
    expect(a.reasoning).toMatch(/betting range|random/i)
  })
})

describe('pot odds are capped at the hero\'s stack', () => {
  it('uncapped: $100 to call into $300 needs 25%', () => {
    expect(callPrice(300, 100)!.neededPct).toBeCloseTo(25, 5)
  })

  it('a call for less than the bet is priced at the all-in amount', () => {
    // Pot $50, villain shoves $250 (pot now $300), hero has $40 behind:
    // hero calls $40 to win the $50 + the $40 of the shove that is matched.
    const p = callPrice(300, 250, 40)!
    expect(p.call).toBe(40)
    expect(p.pot).toBe(90)
    expect(p.neededPct).toBeCloseTo((40 / 130) * 100, 5)
  })

  it('a stack that covers the bet changes nothing', () => {
    expect(callPrice(300, 100, 500)).toEqual(callPrice(300, 100))
  })

  it('returns null when there is nothing to call', () => {
    expect(callPrice(300, 0, 100)).toBeNull()
  })

  it('analyzeHand prices the call from the capped amount', () => {
    const a = analyzeHand(H('6s', '5s'), B('7d', '9c', '2h'), 'flop', 1, 'BTN', 250, mulberry32(1), 300, { heroChips: 40 })
    expect(a.potOddsNeeded).toBeCloseTo(30.8, 1)
    expect(a.callAmount).toBe(40)
  })
})
