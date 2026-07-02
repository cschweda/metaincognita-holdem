/**
 * Bitmask evaluator equivalence.
 *
 * Proves the fast bitmask evaluator (bestHand / rank7 / handCategory7) is
 * byte-for-byte equivalent to the brute-force reference (bestHandOracle) that
 * enumerates all C(n,5) combos. If these ever diverge, the fast path is wrong.
 */
import { describe, it, expect } from 'vitest'
import { bestHand, bestHandOracle, rank7, handCategory7 } from '../app/utils/handAnalysis'
import type { Card, Suit } from '../app/utils/cards'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']

function fullDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit })
  return deck
}

// Deterministic PRNG (mulberry32) so failures are reproducible.
function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function draw(deck: Card[], n: number, rand: () => number): Card[] {
  const pool = [...deck]
  const out: Card[] = []
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rand() * pool.length)
    out.push(pool.splice(j, 1)[0]!)
  }
  return out
}

function scoreEqual(a: number[], b: number[]): boolean {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false
  return true
}

describe('bitmask evaluator matches brute-force oracle', () => {
  it('agrees on rank, score, and name across 60k random 5/6/7-card hands', () => {
    const deck = fullDeck()
    const rand = rng(1234567)
    let mismatches = 0
    const failures: string[] = []

    for (let size = 5; size <= 7; size++) {
      for (let i = 0; i < 20000; i++) {
        const cards = draw(deck, size, rand)
        const hole = cards.slice(0, 2)
        const board = cards.slice(2)
        const fast = bestHand(hole, board)!
        const oracle = bestHandOracle(hole, board)!

        if (fast.rank !== oracle.rank || !scoreEqual(fast.score, oracle.score) || fast.name !== oracle.name) {
          mismatches++
          if (failures.length < 5) {
            failures.push(`${cards.map(c => `${c.rank}${c.suit[0]}`).join(' ')} | fast=${fast.rank}/[${fast.score}]/${fast.name} oracle=${oracle.rank}/[${oracle.score}]/${oracle.name}`)
          }
        }
      }
    }

    expect(mismatches, failures.join('\n')).toBe(0)
  })

  it('rank7 ordering agrees with the oracle score comparison over 40k random pairs', () => {
    const deck = fullDeck()
    const rand = rng(987654321)

    function oracleCmp(a: number[], b: number[]): number {
      const len = Math.max(a.length, b.length)
      for (let i = 0; i < len; i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0)
        if (d !== 0) return Math.sign(d)
      }
      return 0
    }

    let mismatches = 0
    for (let i = 0; i < 40000; i++) {
      const board = draw(deck, 5, rand)
      const remaining = deck.filter(c => !board.some(b => b.rank === c.rank && b.suit === c.suit))
      const a = draw(remaining, 2, rand)
      const b = draw(remaining.filter(c => !a.some(x => x.rank === c.rank && x.suit === c.suit)), 2, rand)

      const fastCmp = Math.sign(rank7([...a, ...board]) - rank7([...b, ...board]))
      const oCmp = oracleCmp(bestHandOracle(a, board)!.score, bestHandOracle(b, board)!.score)
      if (fastCmp !== oCmp) mismatches++
    }
    expect(mismatches).toBe(0)
  })

  it('handCategory7 equals bestHand.rank', () => {
    const deck = fullDeck()
    const rand = rng(42)
    for (let i = 0; i < 5000; i++) {
      const cards = draw(deck, 7, rand)
      expect(handCategory7(cards)).toBe(bestHand(cards.slice(0, 2), cards.slice(2))!.rank)
    }
  })
})
