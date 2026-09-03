/**
 * Ground-truth contract for the numbers the analysis panel shows the player.
 * Outs are DISTINCT unseen cards that improve the hand (a card that completes
 * both a flush and a straight is one out, not two); preflop equity is the
 * Monte Carlo value, not a Chen-score bucket. Published equities from
 * standard calculators; outs by hand enumeration.
 */
import { describe, it, expect } from 'vitest'
import { detectDraws, totalOuts, analyzeHand } from '../app/utils/handAnalysis'
import type { Card } from '../app/utils/cards'
import { mulberry32 } from '../app/utils/rng'

const R: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 }
const S: Record<string, Card['suit']> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
const c = (s: string): Card => ({ rank: R[s[0]!] ?? parseInt(s[0]!, 10), suit: S[s[1]!]! })
const H = (a: string, b: string): [Card, Card] => [c(a), c(b)]
const B = (...xs: string[]) => xs.map(c)
const outs = (hole: [Card, Card], board: Card[]) => totalOuts(detectDraws(hole, board))

describe('outs are distinct improving cards', () => {
  it('pocket pair over the board: 2 outs to a set, not 10', () => {
    expect(outs(H('Ts', 'Th'), B('9d', '5c', '2h'))).toBe(2)
  })

  it('pocket pair lists a single set draw, not set + trips + overcards', () => {
    const draws = detectDraws(H('Ts', 'Th'), B('9d', '5c', '2h'))
    expect(draws).toHaveLength(1)
    expect(draws[0]!.type).toContain('Set draw')
  })

  it('flush draw + open-ender shares two cards: 15, not 17', () => {
    expect(outs(H('8h', '7h'), B('9h', 'Th', '2c'))).toBe(15)
  })

  it('flush draw + two live overcards: 15 distinct cards', () => {
    expect(outs(H('As', 'Ks'), B('2s', '7s', '9d'))).toBe(15)
  })

  it('two pair holding a pocket pair: 4 full-house outs, not 12', () => {
    expect(outs(H('Qs', 'Qh'), B('7d', '7c', '2h', '3s'))).toBe(4)
  })

  it('set on the flop: 7 outs to a full house or quads', () => {
    expect(outs(H('7s', '7d'), B('7h', '2c', 'Kd'))).toBe(7)
  })

  it('every draw exposes the physical out cards it counts', () => {
    const draws = detectDraws(H('8h', '7h'), B('9h', 'Th', '2c'))
    for (const d of draws) expect(d.outCards.length).toBe(d.outs)
  })
})

describe('straight draws that cannot extend both ways are gutshots', () => {
  it('A-K-Q-J needs exactly a ten: gutshot, 4 outs', () => {
    const straight = detectDraws(H('Ac', 'Kd'), B('Qh', 'Js', '2c')).find(d => d.type.includes('straight'))!
    expect(straight.type).toContain('Gutshot')
    expect(straight.outs).toBe(4)
  })

  it('wheel draw A-2-3-4 needs exactly a five: gutshot, 4 outs', () => {
    const straight = detectDraws(H('Ad', '2c'), B('3h', '4s', '9d')).find(d => d.type.includes('straight'))!
    expect(straight.type).toContain('Gutshot')
    expect(straight.outs).toBe(4)
  })

  it('5-6-7-8 is open-ended: 8 outs', () => {
    const straight = detectDraws(H('6s', '5d'), B('7d', '8c', '2h')).find(d => d.type.includes('straight'))!
    expect(straight.type).toContain('Open-ended')
    expect(straight.outs).toBe(8)
  })

  it('a made straight is not reported as a straight draw', () => {
    const draws = detectDraws(H('6s', '5d'), B('7h', '8c', '9d', '2s'))
    expect(draws.some(d => d.type.includes('straight'))).toBe(false)
  })
})

describe('preflop equity is the Monte Carlo value, not a Chen bucket', () => {
  const eq = (a: string, b: string, opp: number) =>
    analyzeHand(H(a, b), [], 'preflop', opp, 'BTN', 0, mulberry32(20260903)).equity

  it('AKs heads-up is ~67%, not the 77% pairs get', () => {
    expect(eq('As', 'Ks', 1)).toBeGreaterThan(63)
    expect(eq('As', 'Ks', 1)).toBeLessThan(71)
  })

  it('98s heads-up is ~51%', () => {
    expect(eq('9s', '8s', 1)).toBeGreaterThan(47)
    expect(eq('9s', '8s', 1)).toBeLessThan(55)
  })

  it('AA heads-up is ~85%', () => {
    expect(eq('As', 'Ah', 1)).toBeGreaterThan(81)
    expect(eq('As', 'Ah', 1)).toBeLessThan(89)
  })

  it('AA six-way is ~49%', () => {
    expect(eq('As', 'Ah', 5)).toBeGreaterThan(45)
    expect(eq('As', 'Ah', 5)).toBeLessThan(53)
  })
})
