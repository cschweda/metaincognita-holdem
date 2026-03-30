/**
 * Split pot tests — verify that identical hands split the pot correctly,
 * and that kickers are properly evaluated in tie situations.
 */
import { describe, it, expect } from 'vitest'
import { bestHand } from '../app/utils/handAnalysis'
import { calculateSidePots, awardPots } from '../app/utils/sidePots'

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
interface Card { rank: number; suit: Suit }

function c(str: string): Card {
  const rankMap: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }
  const suitMap: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
  return { rank: rankMap[str[0]], suit: suitMap[str[1]] }
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

describe('Split pot hand evaluation', () => {
  it('identical pair with same kickers is a tie', () => {
    // Board: Q♦ 3♣ K♠ 6♦ 6♠
    // Player 1: T♦ 8♣ → Pair of 6s (K Q T)
    // Player 2: T♥ 9♥ → Pair of 6s (K Q T) — 9 doesn't play
    const board = [c('Qd'), c('3c'), c('Ks'), c('6d'), c('6s')]
    const h1 = bestHand([c('Td'), c('8c')], board)!
    const h2 = bestHand([c('Th'), c('9h')], board)!

    expect(h1.rank).toBe(1) // ONE_PAIR
    expect(h2.rank).toBe(1)
    expect(compareScores(h1.score, h2.score)).toBe(0) // tie
  })

  it('same two pair but different kicker is NOT a tie', () => {
    // Board: K♠ J♦ 5♣ 5♠ 3♥
    // Player 1: K♦ A♠ → Two Pair Ks and 5s, A kicker
    // Player 2: K♥ Q♦ → Two Pair Ks and 5s, Q kicker
    const board = [c('Ks'), c('Jd'), c('5c'), c('5s'), c('3h')]
    const h1 = bestHand([c('Kd'), c('As')], board)!
    const h2 = bestHand([c('Kh'), c('Qd')], board)!

    expect(h1.rank).toBe(2) // TWO_PAIR
    expect(h2.rank).toBe(2)
    expect(compareScores(h1.score, h2.score)).toBeGreaterThan(0) // h1 wins (A > Q kicker)
  })

  it('both players play the board — exact tie', () => {
    // Board: A♠ K♠ Q♠ J♠ T♠ (royal flush on board)
    // Both players have irrelevant cards
    const board = [c('As'), c('Ks'), c('Qs'), c('Js'), c('Ts')]
    const h1 = bestHand([c('2h'), c('3d')], board)!
    const h2 = bestHand([c('4h'), c('5d')], board)!

    expect(compareScores(h1.score, h2.score)).toBe(0) // tie — both play the board
  })

  it('flush beats straight even with better straight cards', () => {
    // Board: 7♥ 8♥ 9♥ T♣ 2♠
    // Player 1: J♣ 6♣ → Straight (J-high)
    // Player 2: 3♥ 4♥ → Flush (9-high)
    const board = [c('7h'), c('8h'), c('9h'), c('Tc'), c('2s')]
    const h1 = bestHand([c('Jc'), c('6c')], board)!
    const h2 = bestHand([c('3h'), c('4h')], board)!

    expect(h1.rank).toBe(4) // STRAIGHT
    expect(h2.rank).toBe(5) // FLUSH
    expect(compareScores(h1.score, h2.score)).toBeLessThan(0) // h2 wins
  })
})

describe('Side pot splitting', () => {
  it('splits pot equally between tied hands', () => {
    // Two players, both invest $100, identical hands
    const contributors = [
      { id: 0, totalInvested: 100, folded: false, holeCards: [c('Td'), c('8c')] as [Card, Card] },
      { id: 1, totalInvested: 100, folded: false, holeCards: [c('Th'), c('9h')] as [Card, Card] },
    ]
    const board = [c('Qd'), c('3c'), c('Ks'), c('6d'), c('6s')]
    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      contributors.map(p => ({ id: p.id, holeCards: p.holeCards })),
      board,
    )

    // Both should get $100 each (split of $200 pot)
    expect(awards.get(0)).toBe(100)
    expect(awards.get(1)).toBe(100)
  })

  it('gives full pot to the winner when hands differ', () => {
    const contributors = [
      { id: 0, totalInvested: 100, folded: false, holeCards: [c('As'), c('Kd')] as [Card, Card] },
      { id: 1, totalInvested: 100, folded: false, holeCards: [c('7h'), c('2c')] as [Card, Card] },
    ]
    const board = [c('Ah'), c('3c'), c('5s'), c('9d'), c('Jh')]
    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      contributors.map(p => ({ id: p.id, holeCards: p.holeCards })),
      board,
    )

    // Player 0 has pair of aces, player 1 has nothing
    expect(awards.get(0)).toBe(200)
    expect(awards.get(1)).toBeUndefined()
  })

  it('handles 3-way split correctly', () => {
    // Board is the best hand for all three — all play the board
    const contributors = [
      { id: 0, totalInvested: 50, folded: false, holeCards: [c('2h'), c('3d')] as [Card, Card] },
      { id: 1, totalInvested: 50, folded: false, holeCards: [c('4h'), c('5d')] as [Card, Card] },
      { id: 2, totalInvested: 50, folded: false, holeCards: [c('7c'), c('8c')] as [Card, Card] },
    ]
    // Board straight that all players use
    const board = [c('As'), c('Ks'), c('Qs'), c('Js'), c('Ts')]
    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      contributors.map(p => ({ id: p.id, holeCards: p.holeCards })),
      board,
    )

    // $150 pot split 3 ways = $50 each
    expect(awards.get(0)).toBe(50)
    expect(awards.get(1)).toBe(50)
    expect(awards.get(2)).toBe(50)
  })

  it('folded player gets nothing even with better cards', () => {
    const contributors = [
      { id: 0, totalInvested: 50, folded: true, holeCards: [c('As'), c('Ad')] as [Card, Card] },
      { id: 1, totalInvested: 50, folded: false, holeCards: [c('7h'), c('2c')] as [Card, Card] },
    ]
    const board = [c('3h'), c('4c'), c('5s'), c('9d'), c('Jh')]
    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      contributors.map(p => ({ id: p.id, holeCards: p.holeCards })),
      board,
    )

    // Player 0 folded — player 1 wins regardless
    expect(awards.get(0)).toBeUndefined()
    expect(awards.get(1)).toBe(100)
  })

  it('side pot goes to second-best when short stack wins main', () => {
    // Player 0: all-in for $50 with aces
    // Player 1: bets $100 with junk
    // Player 2: calls $100 with kings
    const contributors = [
      { id: 0, totalInvested: 50, folded: false, holeCards: [c('As'), c('Ad')] as [Card, Card] },
      { id: 1, totalInvested: 100, folded: false, holeCards: [c('7h'), c('2c')] as [Card, Card] },
      { id: 2, totalInvested: 100, folded: false, holeCards: [c('Kh'), c('Kd')] as [Card, Card] },
    ]
    const board = [c('3h'), c('4c'), c('5s'), c('9d'), c('Jh')]
    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      contributors.map(p => ({ id: p.id, holeCards: p.holeCards })),
      board,
    )

    // Main pot ($150): player 0 wins with aces
    // Side pot ($100): player 2 wins with kings
    expect(awards.get(0)).toBe(150) // main pot
    expect(awards.get(2)).toBe(100) // side pot
    expect(awards.get(1)).toBeUndefined() // junk loses everything
  })

  it('kicker determines winner in one-pair tie', () => {
    // Board: A♠ 5♣ 5♦ 8♥ 2♠
    // Player 0: K♦ 3♣ → Pair of 5s (A K 8)
    // Player 1: Q♥ 3♥ → Pair of 5s (A Q 8)
    // Player 0 wins on K vs Q kicker
    const contributors = [
      { id: 0, totalInvested: 100, folded: false, holeCards: [c('Kd'), c('3c')] as [Card, Card] },
      { id: 1, totalInvested: 100, folded: false, holeCards: [c('Qh'), c('3h')] as [Card, Card] },
    ]
    const board = [c('As'), c('5c'), c('5d'), c('8h'), c('2s')]
    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      contributors.map(p => ({ id: p.id, holeCards: p.holeCards })),
      board,
    )

    expect(awards.get(0)).toBe(200) // K kicker wins
    expect(awards.get(1)).toBeUndefined()
  })
})
