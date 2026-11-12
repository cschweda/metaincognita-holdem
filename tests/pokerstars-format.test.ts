/**
 * The hand-history text this app writes borrows PokerStars' layout but is not
 * a conforming PokerStars file (see the header of utils/pokerStarsExport.ts
 * for the differences), so the UI must not promise that trackers can import
 * it. The parser, on the other hand, should read a genuine PokerStars
 * cash-game hand.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parsePokerStarsHand } from '../app/utils/pokerStarsParser'
import { toPokerStarsFormat } from '../app/utils/pokerStarsExport'

// Layout of a real PokerStars cash-game history: currency in the stakes,
// slash-separated date, only the hero's cards dealt, "raises $X to $Y".
const REAL_HAND = `PokerStars Hand #234567890123:  Hold'em No Limit ($1/$2 USD) - 2024/03/01 20:15:30 ET
Table 'Aludra II' 6-max Seat #3 is the button
Seat 1: alice ($200 in chips) 
Seat 3: bob ($185.50 in chips) 
Seat 5: Hero ($210 in chips) 
Hero: posts small blind $1
alice: posts big blind $2
*** HOLE CARDS ***
Dealt to Hero [As Kd]
bob: raises $4 to $6
Hero: raises $14 to $20
alice: folds 
bob: calls $14
*** FLOP *** [Ah 7c 2d]
Hero: bets $22
bob: calls $22
*** TURN *** [Ah 7c 2d] [9s]
Hero: checks 
bob: bets $40
Hero: calls $40
*** RIVER *** [Ah 7c 2d 9s] [3h]
Hero: checks 
bob: checks 
*** SHOW DOWN ***
Hero: shows [As Kd] (a pair of Aces)
bob: mucks hand 
Hero collected $163 from pot
*** SUMMARY ***
Total pot $166 | Rake $3 
Board [Ah 7c 2d 9s 3h]
Seat 1: alice (big blind) folded before Flop
Seat 3: bob (button) mucked [Ad Qs]
Seat 5: Hero (small blind) showed [As Kd] and won ($163) with a pair of Aces
`

describe('importing a genuine PokerStars hand', () => {
  const parsed = parsePokerStarsHand(REAL_HAND)

  it('accepts the currency code in the stakes', () => {
    expect(parsed.error).toBeUndefined()
    expect(parsed.success).toBe(true)
    expect(parsed.hand!.stakes).toEqual({ sb: 1, bb: 2 })
  })

  it('reads seats, button, board and the pot', () => {
    const h = parsed.hand!
    expect(h.players.map(p => p.name)).toEqual(['alice', 'bob', 'Hero'])
    expect(h.players[1]!.chips).toBe(185.5)
    expect(h.buttonSeat).toBe(3)
    expect(h.board).toHaveLength(5)
    expect(h.totalPot).toBe(166)
    expect(h.winners).toEqual([{ player: 'Hero', amount: 163 }])
  })

  it('reads "raises $X to $Y" as a raise to Y, and bets as bets', () => {
    const [preflop, flop] = parsed.hand!.streets
    expect(preflop!.actions).toEqual([
      { player: 'bob', type: 'raise', amount: 6 },
      { player: 'Hero', type: 'raise', amount: 20 },
      { player: 'alice', type: 'fold', amount: 0 },
      { player: 'bob', type: 'call', amount: 14 },
    ])
    expect(flop!.actions[0]).toEqual({ player: 'Hero', type: 'bet', amount: 22 })
  })

  it('still reads this app\'s own export', () => {
    const own = toPokerStarsFormat({
      handNumber: 7, potSize: 12, board: '', result: 'won',
      players: [
        { name: 'Hero', seatIndex: 0, position: 'D/SB', chips: 200, isHero: true, folded: false, holeCards: 'A♥ A♦' },
        { name: 'Villain', seatIndex: 1, position: 'BB', chips: 200, isHero: false, folded: true, holeCards: 'K♠ K♦' },
      ],
      actions: ['Hero raises to $6', 'Villain folds'],
    }, { sb: 1, bb: 2 })
    expect(parsePokerStarsHand(own).success).toBe(true)
  })
})

describe('the export is labelled honestly', () => {
  const appDir = join(import.meta.dirname, '..', 'app')
  const sources = ['pages', 'components'].flatMap(dir =>
    readdirSync(join(appDir, dir)).filter(f => f.endsWith('.vue')).map(f => join(appDir, dir, f)))

  it('no page promises import into tracking software', () => {
    for (const file of sources) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/PokerTracker|Hold'em Manager|Equilab|industry standard/i)
    }
  })

  it('the export is called PokerStars-style, not PokerStars format', () => {
    for (const file of sources) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/PokerStars(?: hand history)? format\b/i)
    }
  })

  it('the exporter\'s own header says the same', () => {
    const src = readFileSync(join(appDir, 'utils', 'pokerStarsExport.ts'), 'utf8')
    expect(src).not.toMatch(/Compatible with PokerTracker/)
    expect(src).toMatch(/not a conforming PokerStars/i)
  })
})
