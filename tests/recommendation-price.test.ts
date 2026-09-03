/**
 * The action recommendation must respect the price: the same equity is a
 * call against a small bet and a fold against an overbet. The pot-odds
 * verdict and the recommendation can never disagree.
 */
import { describe, it, expect } from 'vitest'
import { recommend, analyzeHand } from '../app/utils/handAnalysis'
import type { Card } from '../app/utils/cards'
import { mulberry32 } from '../app/utils/rng'

const R: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 }
const S: Record<string, Card['suit']> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
const c = (s: string): Card => ({ rank: R[s[0]!] ?? parseInt(s[0]!, 10), suit: S[s[1]!]! })
const H = (a: string, b: string): [Card, Card] => [c(a), c(b)]
const B = (...xs: string[]) => xs.map(c)

describe('recommend() compares equity to the price of the call', () => {
  it('36% equity is a call when the bet needs 25%', () => {
    expect(recommend('flop', 36, [], null, 5, 'BTN', true, 25).action).toBe('CALL')
  })

  it('36% equity is a fold when the bet needs 43%', () => {
    expect(recommend('flop', 36, [], null, 5, 'BTN', true, 43).action).toBe('FOLD')
  })

  it('the fold reasoning names the price and the equity', () => {
    const r = recommend('flop', 36, [], null, 5, 'BTN', true, 43)
    expect(r.reasoning).toMatch(/43%/)
    expect(r.reasoning).toMatch(/36%/)
  })

  it('a marginal 30% equity is a call against a quarter-pot bet (needs 17%)', () => {
    expect(recommend('turn', 30, [], null, 5, 'BTN', true, 17).action).toBe('CALL')
  })

  it('a strong draw a few points short on direct odds is still a call on implied odds', () => {
    const oesd = [{ type: 'Open-ended straight draw', outs: 8, cards: [], outCards: [] }]
    const r = recommend('flop', 32, oesd, null, 5, 'BTN', true, 36)
    expect(r.action).toBe('CALL')
    expect(r.reasoning).toMatch(/implied/i)
  })

  it('without a price the old behavior stands (facing a bet, 36% equity → call)', () => {
    expect(recommend('flop', 36, [], null, 5, 'BTN', true).action).toBe('CALL')
  })
})

describe('analyzeHand carries the price into the recommendation', () => {
  it('reports the equity the call needs from pot and call amount', () => {
    const a = analyzeHand(H('6s', '5s'), B('7d', '9c', '2h'), 'flop', 1, 'BTN', 50, mulberry32(1), 100)
    expect(a.potOddsNeeded).toBeCloseTo(33.3, 0)
  })

  it('needs 0% when not facing a bet', () => {
    const a = analyzeHand(H('6s', '5s'), B('7d', '9c', '2h'), 'flop', 1, 'BTN', 0, mulberry32(1), 100)
    expect(a.potOddsNeeded).toBe(0)
  })

  it('never recommends CALL when equity is below the price', () => {
    // Gutshot, ~30% vs one random hand; a 3x-pot overbet needs 75%
    const a = analyzeHand(H('6s', '5s'), B('7d', '9c', '2h'), 'flop', 1, 'BTN', 300, mulberry32(1), 100)
    expect(a.potOddsNeeded).toBeCloseTo(75, 0)
    expect(a.action).not.toBe('CALL')
  })
})
