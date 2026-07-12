/**
 * PokerStars export — fractional-amount handling.
 * At Micro/Low/High stakes (sb 0.25/0.50/2.50) action amounts carry cents;
 * the export must keep them (the parser already accepts decimals).
 */
import { describe, it, expect } from 'vitest'
import { toPokerStarsFormat } from '../app/utils/pokerStarsExport'

const microHand = {
  handNumber: 42,
  potSize: 3.75,
  board: 'A♠ K♥ Q♦',
  result: 'won',
  players: [
    { name: 'Hero', seatIndex: 0, position: 'BTN', chips: 50, isHero: true, folded: false, holeCards: 'A♥ A♦' },
    { name: 'Villain', seatIndex: 1, position: 'SB', chips: 50, isHero: false, folded: false, holeCards: 'K♠ K♦' },
  ],
  actions: [
    'Villain calls $0.25',
    'Hero raises to $1.5',
    'Villain goes ALL-IN $12.75',
    '--- FLOP: A♠ K♥ Q♦ ---',
  ],
}

describe('PokerStars export with fractional stakes', () => {
  const out = toPokerStarsFormat(microHand, { sb: 0.25, bb: 0.5 })

  it('keeps fractional calls', () => {
    expect(out).toContain('Villain: calls $0.25')
  })
  it('keeps fractional raises, formatted to two decimals', () => {
    expect(out).toContain('Hero: raises to $1.50')
  })
  it('keeps fractional all-ins', () => {
    expect(out).toContain('Villain: bets $12.75 and is all-in')
  })
  it('formats whole amounts bare', () => {
    const whole = toPokerStarsFormat(
      { ...microHand, actions: ['Hero raises to $12'] }, { sb: 1, bb: 2 })
    expect(whole).toContain('Hero: raises to $12')
  })
})
