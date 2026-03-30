/**
 * Phase 2A — Deck Module
 *
 * Tests deck creation, shuffle randomness (Fisher-Yates), dealing, burning,
 * and reset. Includes statistical tests for shuffle quality and burn card verification.
 */
import { describe, it, expect } from 'vitest'

interface Card {
  rank: number
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
}

const SUITS: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']

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

function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`
}

// ─── Deck Creation ─────────────────────────────────────────────

describe('Deck creation', () => {
  it('produces exactly 52 cards', () => {
    expect(createDeck()).toHaveLength(52)
  })

  it('contains no duplicates', () => {
    const deck = createDeck()
    expect(new Set(deck.map(cardKey)).size).toBe(52)
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

  it('each suit has exactly 13 cards', () => {
    const deck = createDeck()
    for (const suit of SUITS) {
      expect(deck.filter(c => c.suit === suit)).toHaveLength(13)
    }
  })
})

// ─── Shuffle Quality ───────────────────────────────────────────

describe('Shuffle quality (Fisher-Yates)', () => {
  it('preserves all 52 cards after shuffle', () => {
    const deck = createDeck()
    const shuffled = shuffle(deck)
    expect(shuffled).toHaveLength(52)
    expect(new Set(shuffled.map(cardKey))).toEqual(new Set(deck.map(cardKey)))
  })

  it('does not mutate the original deck', () => {
    const deck = createDeck()
    const original = deck.map(cardKey)
    shuffle(deck)
    expect(deck.map(cardKey)).toEqual(original)
  })

  it('produces different orderings on successive shuffles', () => {
    const deck = createDeck()
    const results = new Set<string>()
    for (let i = 0; i < 10; i++) {
      results.add(shuffle(deck).map(cardKey).join(','))
    }
    // 10 identical shuffles from 52! permutations is effectively impossible
    expect(results.size).toBeGreaterThan(1)
  })

  it('distributes Ace of Spades uniformly across positions (chi-squared)', () => {
    const N = 10000
    const positions = new Array(52).fill(0)
    const deck = createDeck()
    const target = (c: Card) => c.rank === 14 && c.suit === 'spades'

    for (let i = 0; i < N; i++) {
      positions[shuffle(deck).findIndex(target)]++
    }

    const expected = N / 52
    const chiSquared = positions.reduce((sum, obs) =>
      sum + ((obs - expected) ** 2) / expected, 0)

    // Chi-squared critical value for 51 df at α=0.01 is ~82.29
    expect(chiSquared).toBeLessThan(82.29)
  })

  it('distributes 2 of Hearts uniformly across positions (chi-squared)', () => {
    const N = 10000
    const positions = new Array(52).fill(0)
    const deck = createDeck()
    const target = (c: Card) => c.rank === 2 && c.suit === 'hearts'

    for (let i = 0; i < N; i++) {
      positions[shuffle(deck).findIndex(target)]++
    }

    const expected = N / 52
    const chiSquared = positions.reduce((sum, obs) =>
      sum + ((obs - expected) ** 2) / expected, 0)

    expect(chiSquared).toBeLessThan(82.29)
  })

  it('no card stays in original position more than 4% of the time', () => {
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

  it('first card is not always high or always low', () => {
    const deck = createDeck()
    let highCount = 0
    const N = 1000
    for (let i = 0; i < N; i++) {
      if (shuffle(deck)[0].rank >= 10) highCount++
    }
    // With 5 high ranks out of 13, expect ~38%. Allow 25-55%.
    expect(highCount / N).toBeGreaterThan(0.25)
    expect(highCount / N).toBeLessThan(0.55)
  })

  it('adjacent cards in shuffled deck are not correlated', () => {
    // Check that consecutive cards don't share the same suit more than expected
    // Expected: 12/51 ≈ 23.5% of the time for any given pair
    const deck = createDeck()
    let sameSuitPairs = 0
    const N = 2000
    const totalPairs = N * 51

    for (let i = 0; i < N; i++) {
      const s = shuffle(deck)
      for (let j = 0; j < 51; j++) {
        if (s[j].suit === s[j + 1].suit) sameSuitPairs++
      }
    }

    const ratio = sameSuitPairs / totalPairs
    // Expected ~0.235, allow 0.20–0.27
    expect(ratio).toBeGreaterThan(0.20)
    expect(ratio).toBeLessThan(0.27)
  })
})

// ─── Deal & Burn Simulation ────────────────────────────────────

describe('Deal and burn (simulated full hand)', () => {
  function simulateDeal(playerCount: number) {
    const deck = shuffle(createDeck())
    let idx = 0

    // Deal 2 hole cards per player
    const holeCards: [Card, Card][] = []
    for (let i = 0; i < playerCount; i++) {
      holeCards.push([deck[idx++], deck[idx++]])
    }

    // Burn + flop (3)
    const burn1 = deck[idx++]
    const flop = [deck[idx++], deck[idx++], deck[idx++]]

    // Burn + turn (1)
    const burn2 = deck[idx++]
    const turn = deck[idx++]

    // Burn + river (1)
    const burn3 = deck[idx++]
    const river = deck[idx++]

    return { holeCards, flop, turn, river, burns: [burn1, burn2, burn3], idx, deck }
  }

  it('uses correct number of cards: 2×N hole + 3 burns + 5 community', () => {
    for (const n of [2, 4, 6, 8]) {
      const { idx } = simulateDeal(n)
      expect(idx).toBe(2 * n + 3 + 5) // hole + burns + community
    }
  })

  it('burns exactly 3 cards (before flop, turn, river)', () => {
    const { burns } = simulateDeal(6)
    expect(burns).toHaveLength(3)
    // Each burn should be a valid card
    for (const b of burns) {
      expect(b.rank).toBeGreaterThanOrEqual(2)
      expect(b.rank).toBeLessThanOrEqual(14)
      expect(SUITS).toContain(b.suit)
    }
  })

  it('no card appears in more than one location', () => {
    const { holeCards, flop, turn, river, burns } = simulateDeal(6)

    const allCards = [
      ...holeCards.flat(),
      ...flop,
      turn,
      river,
      ...burns,
    ]

    const keys = allCards.map(cardKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('burn cards are different from all dealt cards', () => {
    const { holeCards, flop, turn, river, burns } = simulateDeal(8)
    const dealtKeys = new Set([
      ...holeCards.flat().map(cardKey),
      ...flop.map(cardKey),
      cardKey(turn),
      cardKey(river),
    ])

    for (const burn of burns) {
      expect(dealtKeys.has(cardKey(burn))).toBe(false)
    }
  })

  it('community cards (flop+turn+river) are exactly 5 unique cards', () => {
    const { flop, turn, river } = simulateDeal(6)
    const community = [...flop, turn, river]
    expect(community).toHaveLength(5)
    expect(new Set(community.map(cardKey)).size).toBe(5)
  })

  it('deals work correctly for all table sizes (2-8 players)', () => {
    for (let n = 2; n <= 8; n++) {
      const { holeCards, flop, turn, river, burns } = simulateDeal(n)
      expect(holeCards).toHaveLength(n)

      // No duplicates across everything
      const all = [...holeCards.flat(), ...flop, turn, river, ...burns]
      expect(new Set(all.map(cardKey)).size).toBe(all.length)

      // Enough cards remain in deck
      const used = 2 * n + 3 + 5
      expect(used).toBeLessThanOrEqual(52)
    }
  })

  it('remaining deck after deal has no dealt cards in it', () => {
    const { holeCards, flop, turn, river, burns, idx, deck } = simulateDeal(6)

    const dealtKeys = new Set([
      ...holeCards.flat().map(cardKey),
      ...flop.map(cardKey),
      cardKey(turn),
      cardKey(river),
      ...burns.map(cardKey),
    ])

    const remaining = deck.slice(idx)
    for (const card of remaining) {
      expect(dealtKeys.has(cardKey(card))).toBe(false)
    }
  })
})

// ─── Multiple Hands — Randomness Over Time ─────────────────────

describe('Randomness across multiple hands', () => {
  it('hero gets a variety of hands over 100 deals', () => {
    const deck = createDeck()
    const holeCardSets = new Set<string>()

    for (let i = 0; i < 100; i++) {
      const s = shuffle(deck)
      const key = [cardKey(s[0]), cardKey(s[1])].sort().join('+')
      holeCardSets.add(key)
    }

    // Should see many distinct hands (not the same pair every time)
    expect(holeCardSets.size).toBeGreaterThan(80)
  })

  it('community flops vary across 100 deals', () => {
    const deck = createDeck()
    const flopSets = new Set<string>()

    for (let i = 0; i < 100; i++) {
      const s = shuffle(deck)
      // Skip: 12 hole cards (6 players) + 1 burn = index 13
      const flop = [s[13], s[14], s[15]].map(cardKey).sort().join('+')
      flopSets.add(flop)
    }

    expect(flopSets.size).toBeGreaterThan(90)
  })

  it('aces are dealt to hero at roughly the expected frequency', () => {
    const deck = createDeck()
    let aceCount = 0
    const N = 5000

    for (let i = 0; i < N; i++) {
      const s = shuffle(deck)
      if (s[0].rank === 14 || s[1].rank === 14) aceCount++
    }

    // P(at least one ace in 2 cards) = 1 - C(48,2)/C(52,2) ≈ 14.9%
    const ratio = aceCount / N
    expect(ratio).toBeGreaterThan(0.12)
    expect(ratio).toBeLessThan(0.18)
  })

  it('pocket pairs occur at roughly the expected frequency', () => {
    const deck = createDeck()
    let pairCount = 0
    const N = 5000

    for (let i = 0; i < N; i++) {
      const s = shuffle(deck)
      if (s[0].rank === s[1].rank) pairCount++
    }

    // P(pocket pair) = 3/51 ≈ 5.88%
    const ratio = pairCount / N
    expect(ratio).toBeGreaterThan(0.04)
    expect(ratio).toBeLessThan(0.08)
  })

  it('suited cards occur at roughly the expected frequency', () => {
    const deck = createDeck()
    let suitedCount = 0
    const N = 5000

    for (let i = 0; i < N; i++) {
      const s = shuffle(deck)
      if (s[0].suit === s[1].suit) suitedCount++
    }

    // P(suited) = 12/51 ≈ 23.5%
    const ratio = suitedCount / N
    expect(ratio).toBeGreaterThan(0.20)
    expect(ratio).toBeLessThan(0.27)
  })
})
