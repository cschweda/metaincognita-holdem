/**
 * Phase 2B — Hand Evaluator
 *
 * Comprehensive tests for the poker hand evaluator covering all 9 hand ranks,
 * edge cases (wheel, steel wheel, broadway, royal flush), tie-breaking,
 * kicker comparison, and split pots.
 */
import { describe, it, expect } from 'vitest'

// Placeholder: replace with actual import
// import { evaluateHand, compareHands } from '~/utils/evaluator'

interface Card {
  rank: number
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
}

interface HandResult {
  rank: number
  name: string
  score: number[]
  bestFive: Card[]
  kickers: number[]
}

// Stub — replace with real implementation
function evaluateHand(_holeCards: Card[], _community: Card[]): HandResult {
  throw new Error('Not implemented — wire up to ~/utils/evaluator.ts')
}

function compareHands(a: HandResult, b: HandResult): number {
  for (let i = 0; i < Math.max(a.score.length, b.score.length); i++) {
    const diff = (a.score[i] ?? 0) - (b.score[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// Helper to create cards concisely: c('As') = Ace of spades
function c(str: string): Card {
  const rankMap: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  }
  const suitMap: Record<string, Card['suit']> = {
    h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades',
  }
  const rank = rankMap[str.slice(0, -1)]
  const suit = suitMap[str.slice(-1)]
  if (!rank || !suit) throw new Error(`Invalid card: ${str}`)
  return { rank, suit }
}

describe('Hand rank detection', () => {
  it('detects high card', () => {
    const result = evaluateHand(
      [c('2h'), c('7d')],
      [c('9s'), c('Jc'), c('Kh'), c('4d'), c('6s')]
    )
    expect(result.rank).toBe(0)
    expect(result.name).toContain('High Card')
  })

  it('detects one pair', () => {
    const result = evaluateHand(
      [c('Ah'), c('Ad')],
      [c('3s'), c('7c'), c('Jh'), c('9d'), c('2s')]
    )
    expect(result.rank).toBe(1)
    expect(result.name).toContain('Pair')
  })

  it('detects two pair', () => {
    const result = evaluateHand(
      [c('Kh'), c('Kd')],
      [c('7s'), c('7c'), c('2h'), c('9d'), c('Js')]
    )
    expect(result.rank).toBe(2)
  })

  it('detects three of a kind', () => {
    const result = evaluateHand(
      [c('9h'), c('9d')],
      [c('9s'), c('2c'), c('Kh'), c('5d'), c('Js')]
    )
    expect(result.rank).toBe(3)
  })

  it('detects straight', () => {
    const result = evaluateHand(
      [c('8h'), c('9d')],
      [c('Ts'), c('Jc'), c('Qh'), c('2d'), c('4s')]
    )
    expect(result.rank).toBe(4)
  })

  it('detects flush', () => {
    const result = evaluateHand(
      [c('2h'), c('5h')],
      [c('9h'), c('Jh'), c('Kh'), c('3d'), c('7s')]
    )
    expect(result.rank).toBe(5)
  })

  it('detects full house', () => {
    const result = evaluateHand(
      [c('Ah'), c('Ad')],
      [c('As'), c('Kc'), c('Kh'), c('2d'), c('7s')]
    )
    expect(result.rank).toBe(6)
  })

  it('detects four of a kind', () => {
    const result = evaluateHand(
      [c('Jh'), c('Jd')],
      [c('Js'), c('Jc'), c('Ah'), c('3d'), c('7s')]
    )
    expect(result.rank).toBe(7)
  })

  it('detects straight flush', () => {
    const result = evaluateHand(
      [c('5h'), c('6h')],
      [c('7h'), c('8h'), c('9h'), c('2d'), c('Ks')]
    )
    expect(result.rank).toBe(8)
  })
})

describe('Critical edge cases', () => {
  it('wheel (A-2-3-4-5) is a 5-high straight, not Ace-high', () => {
    const result = evaluateHand(
      [c('Ah'), c('2d')],
      [c('3s'), c('4c'), c('5h'), c('9d'), c('Ks')]
    )
    expect(result.rank).toBe(4) // straight
    // The high card of the straight should be 5, not 14
    expect(result.score[1]).toBe(5)
  })

  it('steel wheel (A-2-3-4-5 suited) is a straight flush', () => {
    const result = evaluateHand(
      [c('Ah'), c('2h')],
      [c('3h'), c('4h'), c('5h'), c('9d'), c('Ks')]
    )
    expect(result.rank).toBe(8) // straight flush
    expect(result.score[1]).toBe(5) // 5-high, not Ace-high
  })

  it('broadway (A-K-Q-J-T) is an Ace-high straight', () => {
    const result = evaluateHand(
      [c('Ah'), c('Kd')],
      [c('Qs'), c('Jc'), c('Th'), c('3d'), c('7s')]
    )
    expect(result.rank).toBe(4)
    expect(result.score[1]).toBe(14) // Ace-high
  })

  it('royal flush is named "Royal Flush" not "Ace-high Straight Flush"', () => {
    const result = evaluateHand(
      [c('Ah'), c('Kh')],
      [c('Qh'), c('Jh'), c('Th'), c('3d'), c('7s')]
    )
    expect(result.rank).toBe(8)
    expect(result.name).toBe('Royal Flush')
  })

  it('A-2-3-4-6 is NOT a straight (gap)', () => {
    const result = evaluateHand(
      [c('Ah'), c('2d')],
      [c('3s'), c('4c'), c('6h'), c('9d'), c('Ks')]
    )
    expect(result.rank).not.toBe(4)
  })

  it('K-A-2-3-4 is NOT a straight (wrap-around)', () => {
    const result = evaluateHand(
      [c('Kh'), c('Ad')],
      [c('2s'), c('3c'), c('4h'), c('9d'), c('Js')]
    )
    expect(result.rank).not.toBe(4)
  })
})

describe('Tie-breaking and kickers', () => {
  it('pair of Aces with K kicker beats pair of Aces with Q kicker', () => {
    const handA = evaluateHand(
      [c('Ah'), c('Kd')],
      [c('As'), c('7c'), c('3h'), c('9d'), c('2s')]
    )
    const handB = evaluateHand(
      [c('Ad'), c('Qh')],
      [c('As'), c('7c'), c('3h'), c('9d'), c('2s')]
    )
    expect(compareHands(handA, handB)).toBeGreaterThan(0)
  })

  it('two pair KK-33-A beats two pair KK-33-Q', () => {
    const handA = evaluateHand(
      [c('Kh'), c('3d')],
      [c('Ks'), c('3c'), c('Ah'), c('7d'), c('2s')]
    )
    const handB = evaluateHand(
      [c('Kd'), c('3h')],
      [c('Ks'), c('3c'), c('Qh'), c('7d'), c('2s')]
    )
    expect(compareHands(handA, handB)).toBeGreaterThan(0)
  })

  it('full house AAA-22 beats KKK-QQ', () => {
    const handA = evaluateHand(
      [c('Ah'), c('Ad')],
      [c('As'), c('2c'), c('2h'), c('7d'), c('9s')]
    )
    const handB = evaluateHand(
      [c('Kh'), c('Kd')],
      [c('Ks'), c('Qc'), c('Qh'), c('7d'), c('9s')]
    )
    expect(compareHands(handA, handB)).toBeGreaterThan(0)
  })

  it('flush A-K-9-7-2 beats flush A-K-9-6-2 (4th card)', () => {
    const handA = evaluateHand(
      [c('Ah'), c('7h')],
      [c('Kh'), c('9h'), c('2h'), c('3d'), c('Ts')]
    )
    const handB = evaluateHand(
      [c('Ad'), c('6d')],
      [c('Kd'), c('9d'), c('2d'), c('3h'), c('Ts')]
    )
    expect(compareHands(handA, handB)).toBeGreaterThan(0)
  })

  it('identical hands (both play the board) result in a tie', () => {
    // Board: A-K-Q-J-T rainbow — both players play the broadway straight
    const board = [c('As'), c('Kd'), c('Qh'), c('Jc'), c('Ts')]
    const handA = evaluateHand([c('2h'), c('3d')], board)
    const handB = evaluateHand([c('4h'), c('5d')], board)
    expect(compareHands(handA, handB)).toBe(0)
  })
})

describe('Best-five selection from 7 cards', () => {
  it('selects the best 5 from 7 cards (ignores weak hole cards)', () => {
    // Hole: 2h, 3d. Board: Ah, Kh, Qh, Jh, Th
    // Best hand is the royal flush on board (hole cards are irrelevant)
    const result = evaluateHand(
      [c('2h'), c('3d')],
      [c('Ah'), c('Kh'), c('Qh'), c('Jh'), c('Th')]
    )
    // Wait — 2h is a heart, so this is 6 hearts. Best 5 = A-K-Q-J-T of hearts = royal flush
    expect(result.rank).toBe(8)
    expect(result.name).toBe('Royal Flush')
  })

  it('uses one hole card and four board cards when optimal', () => {
    // Hole: Ah, 2d. Board: Kh, Qh, Jh, Th, 3s
    // Best: Ah-Kh-Qh-Jh-Th = royal flush (uses 1 hole card)
    const result = evaluateHand(
      [c('Ah'), c('2d')],
      [c('Kh'), c('Qh'), c('Jh'), c('Th'), c('3s')]
    )
    expect(result.rank).toBe(8)
  })
})

describe('Performance', () => {
  it('evaluates 8 players at river in under 5ms', () => {
    const board = [c('As'), c('Kd'), c('7h'), c('3c'), c('9s')]
    const holeCards: Card[][] = [
      [c('Ah'), c('2d')], [c('Kh'), c('Qd')], [c('Jh'), c('Td')], [c('8h'), c('6d')],
      [c('5h'), c('4d')], [c('2s'), c('3d')], [c('Qh'), c('Jd')], [c('Ts'), c('9d')],
    ]

    const start = performance.now()
    for (const hole of holeCards) {
      evaluateHand(hole, board)
    }
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5)
  })
})
