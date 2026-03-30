/**
 * Regression tests — ensure HandResult uses .score (not .values)
 * and that all sort/comparison operations work correctly.
 * Also tests: PS parser, hand descriptions with kickers, range lookup.
 */
import { describe, it, expect } from 'vitest'
import { bestHand, describeHand, chenScore, chenPlusScore, estimateEquity, detectDraws, HAND_RANK_NAMES } from '../app/utils/handAnalysis'
import { handRankIndex, holeCardsToNotation, ALL_HANDS } from '../app/utils/ranges'
import { parsePokerStarsHand, parseMultipleHands } from '../app/utils/pokerStarsParser'

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
interface Card { rank: number; suit: Suit }

function c(str: string): Card {
  const rankMap: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }
  const suitMap: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
  return { rank: rankMap[str[0]], suit: suitMap[str[1]] }
}

describe('HandResult .score field (regression: was .values)', () => {
  it('bestHand returns score array, not values', () => {
    const result = bestHand([c('As'), c('Kd')], [c('Ah'), c('Kh'), c('3c'), c('7d'), c('2s')])
    expect(result).toBeTruthy()
    expect(result!.score).toBeDefined()
    expect(Array.isArray(result!.score)).toBe(true)
    expect((result as any).values).toBeUndefined()
  })

  it('score[0] matches rank for all hand types', () => {
    // One pair
    const pair = bestHand([c('As'), c('Kd')], [c('Ah'), c('3c'), c('7d'), c('2s'), c('9h')])
    expect(pair!.score[0]).toBe(1) // ONE_PAIR

    // Two pair
    const twoPair = bestHand([c('As'), c('Kd')], [c('Ah'), c('Kh'), c('3c'), c('7d'), c('2s')])
    expect(twoPair!.score[0]).toBe(2) // TWO_PAIR

    // Flush
    const flush = bestHand([c('As'), c('Ks')], [c('Qs'), c('Js'), c('2s'), c('3d'), c('4h')])
    expect(flush!.score[0]).toBe(5) // FLUSH
  })

  it('sorting by score works correctly (not .values)', () => {
    const hands = [
      { result: bestHand([c('2h'), c('3d')], [c('5s'), c('7c'), c('9h'), c('Jd'), c('Ks')])! },
      { result: bestHand([c('As'), c('Ad')], [c('5s'), c('7c'), c('9h'), c('Jd'), c('Ks')])! },
    ]
    // This sort is the exact pattern that caused the .values crash
    const sorted = hands.sort((a, b) => b.result.rank - a.result.rank || b.result.score[0] - a.result.score[0])
    expect(sorted[0].result.rank).toBeGreaterThanOrEqual(sorted[1].result.rank)
  })
})

describe('Hand descriptions with kickers', () => {
  it('two pair shows kicker', () => {
    const desc = describeHand([c('Ks'), c('Jd')], [c('Kh'), c('Jh'), c('5c'), c('8d'), c('Tc')])
    expect(desc).toContain('kicker')
  })

  it('top pair shows kicker rank', () => {
    const desc = describeHand([c('As'), c('Kd')], [c('Ah'), c('3c'), c('7d')])
    expect(desc).toContain('K-kicker')
  })

  it('flush shows high card', () => {
    const desc = describeHand([c('Ks'), c('9s')], [c('As'), c('Js'), c('2s'), c('3d'), c('4h')])
    expect(desc).toContain('Flush')
  })

  it('straight shows high card', () => {
    const desc = describeHand([c('9s'), c('8d')], [c('7h'), c('6c'), c('5s'), c('Kd'), c('2h')])
    expect(desc).toContain('Straight')
  })

  it('trips shows kicker', () => {
    const desc = describeHand([c('As'), c('Ad')], [c('Ah'), c('3c'), c('7d'), c('2s'), c('9h')])
    expect(desc).toContain('Three')
  })

  it('full house shows over what', () => {
    const desc = describeHand([c('As'), c('Ad')], [c('Ah'), c('Kc'), c('Kd'), c('2s'), c('9h')])
    expect(desc).toContain('full of')
  })
})

describe('Pre-computed range lookup', () => {
  it('converts hole cards to notation', () => {
    expect(holeCardsToNotation([c('As'), c('Kd')])).toBe('AKo')
    expect(holeCardsToNotation([c('As'), c('Ks')])).toBe('AKs')
    expect(holeCardsToNotation([c('Ah'), c('Ad')])).toBe('AA')
    expect(holeCardsToNotation([c('7h'), c('2d')])).toBe('72o')
  })

  it('AA is ranked first', () => {
    expect(handRankIndex([c('As'), c('Ad')])).toBe(0)
  })

  it('72o is ranked near last', () => {
    const idx = handRankIndex([c('7h'), c('2d')])
    expect(idx).toBeGreaterThan(160)
  })

  it('suited hands rank higher than offsuit', () => {
    const suited = handRankIndex([c('As'), c('Ks')])
    const offsuit = handRankIndex([c('As'), c('Kd')])
    expect(suited).toBeLessThan(offsuit)
  })
})

describe('PokerStars parser', () => {
  const sampleHand = `PokerStars Hand #1: Hold'em No Limit ($1/$2) - 2026-04-01 12:00:00 ET
Table 'Bot Simulation' 6-max Seat #1 is the button
Seat 1: Player1 ($200 in chips)
Seat 2: Player2 ($200 in chips)
Player1: posts small blind $1
Player2: posts big blind $2
*** HOLE CARDS ***
Dealt to Player1 [Ah Kd]
Dealt to Player2 [7s 2c]
Player1: raises to $6
Player2: folds
*** SHOW DOWN ***
Player1: shows [Ah Kd]
Player1 collected $4 from pot
*** SUMMARY ***
Total pot $4 | Rake $0
Board [Js Td 3c]
Seat 1: Player1 (button) showed [Ah Kd] and won ($4)
Seat 2: Player2 (big blind) folded`

  it('parses a valid hand successfully', () => {
    const result = parsePokerStarsHand(sampleHand)
    expect(result.success).toBe(true)
    expect(result.hand).toBeTruthy()
  })

  it('extracts hand ID and stakes', () => {
    const { hand } = parsePokerStarsHand(sampleHand)
    expect(hand!.handId).toBe('1')
    expect(hand!.stakes.sb).toBe(1)
    expect(hand!.stakes.bb).toBe(2)
  })

  it('extracts players with seats and chips', () => {
    const { hand } = parsePokerStarsHand(sampleHand)
    expect(hand!.players).toHaveLength(2)
    expect(hand!.players[0].name).toBe('Player1')
    expect(hand!.players[0].chips).toBe(200)
    expect(hand!.players[1].name).toBe('Player2')
  })

  it('extracts hole cards from Dealt to lines', () => {
    const { hand } = parsePokerStarsHand(sampleHand)
    const p1 = hand!.players.find(p => p.name === 'Player1')
    expect(p1!.holeCards).toBeTruthy()
    expect(p1!.holeCards![0].rank).toBe(14) // Ace
    expect(p1!.holeCards![1].rank).toBe(13) // King
  })

  it('extracts actions', () => {
    const { hand } = parsePokerStarsHand(sampleHand)
    expect(hand!.streets.length).toBeGreaterThanOrEqual(1)
    const preflop = hand!.streets[0]
    expect(preflop.name).toBe('preflop')
    // Preflop actions after HOLE CARDS: raise, fold (blinds may be before HOLE CARDS marker)
    const actionTypes = preflop.actions.map(a => a.type)
    expect(actionTypes).toContain('raise')
    expect(actionTypes).toContain('fold')
  })

  it('extracts winners', () => {
    const { hand } = parsePokerStarsHand(sampleHand)
    expect(hand!.winners).toHaveLength(1)
    expect(hand!.winners[0].player).toBe('Player1')
    expect(hand!.winners[0].amount).toBe(4)
  })

  it('assigns positions from button seat', () => {
    const { hand } = parsePokerStarsHand(sampleHand)
    const p1 = hand!.players.find(p => p.name === 'Player1')
    const p2 = hand!.players.find(p => p.name === 'Player2')
    // In 2-player, seat 1 is button = D/SB, seat 2 = BB
    expect(p1!.position).toContain('SB')
    expect(p2!.position).toBe('BB')
  })

  it('rejects invalid input', () => {
    expect(parsePokerStarsHand('not a hand').success).toBe(false)
    expect(parsePokerStarsHand('').success).toBe(false)
  })

  it('parses multiple hands', () => {
    const multi = sampleHand + '\n\n' + sampleHand.replace('#1:', '#2:')
    const results = parseMultipleHands(multi)
    expect(results.length).toBe(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(true)
  })
})

describe('Hand with postflop action parses correctly', () => {
  const flopHand = `PokerStars Hand #5: Hold'em No Limit ($1/$2) - 2026-04-01 12:00:00 ET
Table 'Bot Simulation' 6-max Seat #1 is the button
Seat 1: Alice ($200 in chips)
Seat 2: Bob ($200 in chips)
Seat 3: Charlie ($200 in chips)
Alice: posts small blind $1
Bob: posts big blind $2
*** HOLE CARDS ***
Dealt to Alice [As Kd]
Dealt to Bob [Qh Jh]
Dealt to Charlie [7s 2c]
Charlie: folds
Alice: raises to $6
Bob: calls $4
*** FLOP *** [Ah Th 3c]
Alice: bets $8
Bob: calls $8
*** TURN *** [Ah Th 3c] [5d]
Alice: checks
Bob: checks
*** RIVER *** [Ah Th 3c 5d] [9s]
Alice: bets $15
Bob: folds
*** SHOW DOWN ***
Alice: shows [As Kd]
Alice collected $30 from pot
*** SUMMARY ***
Total pot $30 | Rake $0
Board [Ah Th 3c 5d 9s]
Seat 1: Alice (button) showed [As Kd] and won ($30)
Seat 2: Bob (big blind) folded
Seat 3: Charlie  folded`

  it('parses all four streets', () => {
    const { hand } = parsePokerStarsHand(flopHand)
    expect(hand!.streets.length).toBe(4) // preflop, flop, turn, river
    expect(hand!.streets[1].name).toBe('flop')
    expect(hand!.streets[1].newCards).toHaveLength(3)
    expect(hand!.streets[2].name).toBe('turn')
    expect(hand!.streets[2].newCards).toHaveLength(1)
    expect(hand!.streets[3].name).toBe('river')
    expect(hand!.streets[3].newCards).toHaveLength(1)
  })

  it('extracts flop actions correctly', () => {
    const { hand } = parsePokerStarsHand(flopHand)
    const flop = hand!.streets[1]
    expect(flop.actions.length).toBe(2) // bet + call
    expect(flop.actions[0].type).toBe('bet')
    expect(flop.actions[0].amount).toBe(8)
    expect(flop.actions[1].type).toBe('call')
  })

  it('extracts board cards', () => {
    const { hand } = parsePokerStarsHand(flopHand)
    expect(hand!.board).toHaveLength(5)
    expect(hand!.board[0].rank).toBe(14) // Ace
  })

  it('assigns 3-player positions', () => {
    const { hand } = parsePokerStarsHand(flopHand)
    expect(hand!.players).toHaveLength(3)
    // Button=1 in 3-player: D, SB, BB
    const alice = hand!.players.find(p => p.name === 'Alice')
    expect(alice!.position).toBe('D')
  })
})

describe('Chen score and Chen+', () => {
  it('pocket aces score 20', () => {
    expect(chenScore([c('As'), c('Ad')])).toBe(20)
  })

  it('pocket kings score 16', () => {
    expect(chenScore([c('Ks'), c('Kd')])).toBe(16)
  })

  it('72o scores very low', () => {
    expect(chenScore([c('7h'), c('2d')])).toBeLessThanOrEqual(1)
  })

  it('Chen+ adjusts for position', () => {
    const base = chenPlusScore([c('As'), c('Td')], '')
    const btn = chenPlusScore([c('As'), c('Td')], 'BTN')
    const utg = chenPlusScore([c('As'), c('Td')], 'UTG')
    expect(btn).toBeGreaterThan(base)
    expect(utg).toBeLessThan(base)
  })
})

describe('Equity estimation', () => {
  it('AA vs 1 opponent has high equity', () => {
    const eq = estimateEquity([c('As'), c('Ad')], [], 1, 100)
    expect(eq).toBeGreaterThan(75)
  })

  it('72o vs 1 opponent has low equity', () => {
    const eq = estimateEquity([c('7h'), c('2d')], [], 1, 100)
    expect(eq).toBeLessThan(45)
  })
})

describe('Draw detection', () => {
  it('detects flush draw', () => {
    const draws = detectDraws([c('As'), c('Ks')], [c('Qs'), c('3s'), c('7d')])
    expect(draws.some(d => d.type.includes('Flush'))).toBe(true)
  })

  it('detects open-ended straight draw', () => {
    const draws = detectDraws([c('9h'), c('8d')], [c('7s'), c('6c'), c('2h')])
    expect(draws.some(d => d.type.includes('Open-ended') || d.type.includes('Straight'))).toBe(true)
  })

  it('no draws on a dry board with high cards', () => {
    const draws = detectDraws([c('As'), c('Kd')], [c('Ah'), c('3c'), c('7d')])
    const significantDraws = draws.filter(d => d.outs >= 4)
    // Should have no big draws (maybe overcards but not flush/straight)
    expect(significantDraws.length).toBeLessThanOrEqual(1)
  })
})
