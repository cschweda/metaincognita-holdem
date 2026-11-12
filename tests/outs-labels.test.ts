/**
 * The outs the coach shows must be the hero's own. Three mislabels from the
 * 2026-11-11 review:
 *
 *  - a draw the board makes on its own (four to a flush or straight with no
 *    hole card in it) was listed as the hero's outs,
 *  - trips with an unpaired kicker ignored the kicker's three full-house outs,
 *  - a pocket pair above the board was called "Top Pair".
 *
 * The corrected counting is opt-in (`strict`) because the bots' tuned
 * thresholds were calibrated against the legacy counts; analyzeHand — the
 * coach panel — always uses it.
 */
import { describe, it, expect } from 'vitest'
import { detectDraws, totalOuts, describeHand, analyzeHand } from '../app/utils/handAnalysis'
import type { Card } from '../app/utils/cards'
import { mulberry32 } from '../app/utils/rng'

const R: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 }
const S: Record<string, Card['suit']> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
const c = (s: string): Card => ({ rank: R[s[0]!] ?? parseInt(s[0]!, 10), suit: S[s[1]!]! })
const H = (a: string, b: string): [Card, Card] => [c(a), c(b)]
const B = (...xs: string[]) => xs.map(c)
const strict = (hole: [Card, Card], board: Card[]) => detectDraws(hole, board, { strict: true })

describe('draws made entirely by the board are not the hero\'s outs', () => {
  it('four spades on board, none in hand: no flush draw', () => {
    const draws = strict(H('Ah', 'Kd'), B('2s', '7s', '9s', 'Js'))
    expect(draws.some(d => d.type.includes('Flush'))).toBe(false)
  })

  it('four spades with one in hand is already a flush, three on board plus one in hand is a draw', () => {
    const draw = strict(H('As', 'Kd'), B('2s', '7s', '9s', 'Jh')).find(d => d.type.includes('Flush'))
    expect(draw?.outs).toBe(9)
  })

  it('four to a straight on board, no hole card in it: no straight draw', () => {
    const draws = strict(H('Ah', '2d'), B('6s', '7c', '8d', '9h'))
    expect(draws.some(d => d.type.includes('straight'))).toBe(false)
  })

  it('a hole card that extends the board\'s straight draw still counts', () => {
    // T-9-8-7-6 needs the hero's ten; only the five-high end is the board's own
    const draw = strict(H('Th', '2d'), B('6s', '7c', '8d', 'Ks')).find(d => d.type.includes('straight'))!
    expect(draw.outs).toBe(4)
    expect(draw.outCards.every(o => o.rank === 9)).toBe(true)
  })

  it('the default (bot) counting is unchanged', () => {
    const draws = detectDraws(H('Ah', 'Kd'), B('2s', '7s', '9s', 'Js'))
    expect(draws.some(d => d.type.includes('Flush'))).toBe(true)
  })
})

describe('trips count every card that fills them up', () => {
  it('K5 on K-K-9: one king, three nines and three fives — 7 outs', () => {
    const draws = strict(H('Kh', '5d'), B('Ks', 'Kc', '9d'))
    expect(totalOuts(draws)).toBe(7)
    const boat = draws.find(d => d.type.includes('full house'))!
    expect(boat.outCards.filter(o => o.rank === 5)).toHaveLength(3)
  })

  it('a flopped set keeps its 7 outs', () => {
    expect(totalOuts(strict(H('7s', '7d'), B('7h', '2c', 'Kd')))).toBe(7)
  })

  it('trips on the turn: 1 + 3 + 3 + 3 = 10 outs', () => {
    expect(totalOuts(strict(H('Kh', '5d'), B('Ks', 'Kc', '9d', '2h')))).toBe(10)
  })

  it('the coach panel uses the corrected count', () => {
    const a = analyzeHand(H('Kh', '5d'), B('Ks', 'Kc', '9d'), 'flop', 1, 'BTN', 0, mulberry32(1), 10)
    expect(a.totalOuts).toBe(7)
  })
})

describe('a pocket pair above the board is an overpair', () => {
  it('QQ on J-7-2 is not "Top Pair"', () => {
    const desc = describeHand(H('Qs', 'Qh'), B('Jd', '7c', '2h'))
    expect(desc).toMatch(/overpair/i)
    expect(desc).not.toMatch(/top pair/i)
    expect(desc).toContain('Q')
  })

  it('AJ on J-7-2 is still top pair with its kicker', () => {
    expect(describeHand(H('As', 'Jh'), B('Jd', '7c', '2h'))).toBe('Top Pair, A-kicker')
  })
})
