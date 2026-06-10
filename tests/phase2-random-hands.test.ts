/**
 * Phase 2 — Random Hand Assessment
 *
 * Tests the hand evaluator against a large number of random deals
 * to verify statistical accuracy of hand distribution, correct ranking,
 * and proper winner determination in multi-player showdowns.
 */
import { describe, it, expect } from 'vitest'
import { bestHand, HAND_RANKS } from '../app/utils/handAnalysis'

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
interface Card { rank: number; suit: Suit }

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']

function createDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      cards.push({ rank, suit })
    }
  }
  return cards
}

function shuffle(deck: Card[]): Card[] {
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function dealFullHand(playerCount: number) {
  const deck = shuffle(createDeck())
  let idx = 0

  const holeCards: [Card, Card][] = []
  for (let i = 0; i < playerCount; i++) {
    holeCards.push([deck[idx++], deck[idx++]])
  }
  idx++ // burn
  const community = [deck[idx++], deck[idx++], deck[idx++]]
  idx++ // burn
  community.push(deck[idx++])
  idx++ // burn
  community.push(deck[idx++])

  return { holeCards, community }
}

describe('Hand distribution over random deals', () => {
  it('every hand evaluates to a valid rank (0-8) over 1000 deals', () => {
    for (let i = 0; i < 1000; i++) {
      const { holeCards, community } = dealFullHand(6)
      for (const hole of holeCards) {
        const result = bestHand(hole, community)
        expect(result).not.toBeNull()
        expect(result!.rank).toBeGreaterThanOrEqual(0)
        expect(result!.rank).toBeLessThanOrEqual(8)
      }
    }
  })

  it('hand rank distribution is approximately correct over 10000 hands', () => {
    // Expected frequencies (approximate, for 7-card hands):
    // High card: ~17.4%, One pair: ~43.8%, Two pair: ~23.5%,
    // Three of a kind: ~4.83%, Straight: ~4.62%, Flush: ~3.03%,
    // Full house: ~2.60%, Four of a kind: ~0.168%, Straight flush: ~0.031%
    const counts = new Array(9).fill(0)
    // 30k deals: the tightest comparison (full house ~2.60% vs flush ~3.03%)
    // is only 0.43pp apart and flakes ~3% of runs at 10k samples
    const N = 30000

    for (let i = 0; i < N; i++) {
      const { holeCards, community } = dealFullHand(2)
      const result = bestHand(holeCards[0], community)
      if (result) counts[result.rank]++
    }

    // High card should be roughly 15-22%
    expect(counts[0] / N).toBeGreaterThan(0.12)
    expect(counts[0] / N).toBeLessThan(0.25)

    // One pair should be the most common (roughly 40-48%)
    expect(counts[1] / N).toBeGreaterThan(0.35)
    expect(counts[1] / N).toBeLessThan(0.52)

    // Two pair roughly 20-28%
    expect(counts[2] / N).toBeGreaterThan(0.17)
    expect(counts[2] / N).toBeLessThan(0.30)

    // One pair should be more common than any other single rank
    expect(counts[1]).toBeGreaterThan(counts[0])
    expect(counts[1]).toBeGreaterThan(counts[2])

    // Higher ranks should be progressively rarer
    expect(counts[3]).toBeLessThan(counts[2]) // trips < two pair
    expect(counts[6]).toBeLessThan(counts[5]) // full house < flush (in 7-card)
    expect(counts[7]).toBeLessThan(counts[6]) // quads < full house
    expect(counts[8]).toBeLessThan(counts[7]) // straight flush < quads
  })

  it('straight flush is very rare (< 0.2% over 10000 hands)', () => {
    let sfCount = 0
    const N = 10000
    for (let i = 0; i < N; i++) {
      const { holeCards, community } = dealFullHand(2)
      const result = bestHand(holeCards[0], community)
      if (result && result.rank === 8) sfCount++
    }
    expect(sfCount / N).toBeLessThan(0.002)
  })
})

describe('Multi-player showdown correctness', () => {
  it('determines a winner (or tie) in every 6-player showdown', () => {
    for (let i = 0; i < 200; i++) {
      const { holeCards, community } = dealFullHand(6)

      const results = holeCards.map(hole => bestHand(hole, community))
      // All should evaluate
      expect(results.every(r => r !== null)).toBe(true)

      // Find the best score
      const scores = results.map(r => r!.score)
      let bestIdx = 0
      for (let j = 1; j < scores.length; j++) {
        const cmp = compareScores(scores[j], scores[bestIdx])
        if (cmp > 0) bestIdx = j
      }

      // Winner's rank should be >= all others
      for (let j = 0; j < scores.length; j++) {
        expect(compareScores(scores[bestIdx], scores[j])).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('a higher hand rank always beats a lower hand rank', () => {
    // Deal until we get two players with different hand ranks, verify ordering
    let verified = 0
    for (let i = 0; i < 500 && verified < 50; i++) {
      const { holeCards, community } = dealFullHand(2)
      const a = bestHand(holeCards[0], community)
      const b = bestHand(holeCards[1], community)
      if (!a || !b || a.rank === b.rank) continue

      if (a.rank > b.rank) {
        expect(compareScores(a.score, b.score)).toBeGreaterThan(0)
      } else {
        expect(compareScores(a.score, b.score)).toBeLessThan(0)
      }
      verified++
    }
    expect(verified).toBeGreaterThan(20) // should easily find 20+ differing ranks
  })

  it('split pots detected when both players play the board', () => {
    // Manually create a board that dominates both hole cards
    const community: Card[] = [
      { rank: 14, suit: 'spades' },
      { rank: 13, suit: 'hearts' },
      { rank: 12, suit: 'diamonds' },
      { rank: 11, suit: 'clubs' },
      { rank: 10, suit: 'spades' },
    ]
    // Both players have garbage — board is a broadway straight
    const a = bestHand([{ rank: 2, suit: 'hearts' }, { rank: 3, suit: 'diamonds' }], community)
    const b = bestHand([{ rank: 4, suit: 'hearts' }, { rank: 5, suit: 'diamonds' }], community)

    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(compareScores(a!.score, b!.score)).toBe(0) // tie
  })
})

describe('evaluator never crashes on random input', () => {
  it('handles 5000 random deals without error', () => {
    for (let i = 0; i < 5000; i++) {
      const { holeCards, community } = dealFullHand(Math.floor(Math.random() * 7) + 2)
      for (const hole of holeCards) {
        expect(() => bestHand(hole, community)).not.toThrow()
      }
    }
  })
})

// Helper
function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
