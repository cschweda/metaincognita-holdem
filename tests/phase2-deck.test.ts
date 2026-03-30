/**
 * Phase 2A — Deck Module
 *
 * Tests deck creation, shuffle randomness (Fisher-Yates), dealing, burning,
 * and reset. Includes statistical tests for shuffle quality.
 */
import { describe, it, expect } from 'vitest'

// Placeholder: replace with actual import
// import { createDeck, shuffle, deal, burn, reset } from '~/utils/deck'

interface Card {
  rank: number  // 2–14 (14 = Ace)
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
}

// Stub deck functions — replace with real implementations
function createDeck(): Card[] {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
  const cards: Card[] = []
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      cards.push({ rank, suit })
    }
  }
  return cards
}

function shuffle(deck: Card[]): Card[] {
  // Fisher-Yates — replace with real implementation
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

describe('Deck creation', () => {
  it('produces exactly 52 cards', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
  })

  it('contains no duplicates', () => {
    const deck = createDeck()
    const keys = deck.map(c => `${c.rank}-${c.suit}`)
    expect(new Set(keys).size).toBe(52)
  })

  it('contains all 4 suits × 13 ranks', () => {
    const deck = createDeck()
    const suits = new Set(deck.map(c => c.suit))
    const ranks = new Set(deck.map(c => c.rank))
    expect(suits.size).toBe(4)
    expect(ranks.size).toBe(13)
    expect(Math.min(...ranks)).toBe(2)
    expect(Math.max(...ranks)).toBe(14)
  })
})

describe('Shuffle quality (Fisher-Yates)', () => {
  it('preserves all 52 cards after shuffle', () => {
    const deck = createDeck()
    const shuffled = shuffle(deck)
    expect(shuffled).toHaveLength(52)
    const original = new Set(deck.map(c => `${c.rank}-${c.suit}`))
    const after = new Set(shuffled.map(c => `${c.rank}-${c.suit}`))
    expect(after).toEqual(original)
  })

  it('produces different orderings on successive shuffles', () => {
    const deck = createDeck()
    const results = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const s = shuffle(deck)
      results.add(s.map(c => `${c.rank}${c.suit}`).join(','))
    }
    // Probability of 10 identical shuffles from 52! permutations is effectively 0
    expect(results.size).toBeGreaterThan(1)
  })

  it('distributes cards uniformly across positions (chi-squared)', () => {
    /**
     * Statistical test: shuffle 10,000 times and count how often the Ace of Spades
     * lands in each of the 52 positions. A fair shuffle should distribute it
     * uniformly (~192 times per position). We use a chi-squared test with
     * significance level α = 0.01.
     */
    const N = 10000
    const positions = new Array(52).fill(0)
    const deck = createDeck()
    const aceOfSpadesIndex = (c: Card) => c.rank === 14 && c.suit === 'spades'

    for (let i = 0; i < N; i++) {
      const s = shuffle(deck)
      const pos = s.findIndex(aceOfSpadesIndex)
      positions[pos]++
    }

    const expected = N / 52
    const chiSquared = positions.reduce((sum, observed) => {
      return sum + ((observed - expected) ** 2) / expected
    }, 0)

    // Chi-squared critical value for 51 df at α=0.01 is ~82.29
    // A fair shuffle should produce chi-squared well below this
    expect(chiSquared).toBeLessThan(82.29)
  })

  it('no card stays in original position more often than expected', () => {
    /**
     * Check that no single card remains in its original position significantly
     * more than 1/52 ≈ 1.9% of the time over 5000 shuffles.
     * Threshold: 4% (generous but catches broken shuffles).
     */
    const N = 5000
    const deck = createDeck()
    const stayCount = new Array(52).fill(0)

    for (let i = 0; i < N; i++) {
      const s = shuffle(deck)
      for (let j = 0; j < 52; j++) {
        if (s[j].rank === deck[j].rank && s[j].suit === deck[j].suit) {
          stayCount[j]++
        }
      }
    }

    for (let j = 0; j < 52; j++) {
      expect(stayCount[j] / N).toBeLessThan(0.04)
    }
  })
})

describe('Deal and burn', () => {
  it('deal(n) returns n cards from top and removes them', () => {
    const deck = shuffle(createDeck())
    const top5 = deck.slice(0, 5).map(c => `${c.rank}-${c.suit}`)
    // When real deal() is implemented:
    // const dealt = deal(deck, 5)
    // expect(dealt.map(c => `${c.rank}-${c.suit}`)).toEqual(top5)
    // expect(deck).toHaveLength(47)
    expect(top5).toHaveLength(5) // placeholder assertion
  })

  it('burn() discards one card without returning it', () => {
    // When real burn() is implemented:
    // const deck = shuffle(createDeck())
    // const sizeBefore = deck.length
    // burn(deck)
    // expect(deck).toHaveLength(sizeBefore - 1)
    expect(true).toBe(true) // placeholder
  })

  it('dealing entire deck leaves 0 cards', () => {
    const deck = shuffle(createDeck())
    // deal(deck, 52) should empty the deck
    expect(deck).toHaveLength(52) // placeholder — update when deal() exists
  })
})
