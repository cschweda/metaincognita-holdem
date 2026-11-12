/**
 * The hand-history text this app writes is PokerStars cash-game hand-history
 * format (utils/pokerStarsExport.ts), and the UI says so — without claiming
 * it was checked against any particular tracking product, which it was not.
 * The parser reads a genuine PokerStars cash-game hand as well as the export.
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
    // The blinds, posted above the HOLE CARDS line, open the preflop street
    expect(preflop!.actions.slice(0, 2)).toEqual([
      { player: 'Hero', type: 'sb', amount: 1 },
      { player: 'alice', type: 'bb', amount: 2 },
    ])
    expect(preflop!.actions.slice(2)).toEqual([
      { player: 'bob', type: 'raise', amount: 6 },
      { player: 'Hero', type: 'raise', amount: 20 },
      { player: 'alice', type: 'fold', amount: 0 },
      { player: 'bob', type: 'call', amount: 14 },
    ])
    expect(flop!.actions[0]).toEqual({ player: 'Hero', type: 'bet', amount: 22 })
  })

  it('reads this app\'s own export', () => {
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

describe('importing the lines only a genuine history has', () => {
  it('reads an uncalled bet, all-in suffixes, side-pot collections and mucked cards', () => {
    const { hand, error } = parsePokerStarsHand(`PokerStars Hand #234567890124:  Hold'em No Limit ($1/$2 USD) - 2024/03/01 20:16:30 ET
Table 'Aludra II' 6-max Seat #1 is the button
Seat 1: alice ($40 in chips)
Seat 3: bob smith ($300 in chips) is sitting out
Seat 5: Hero ($210 in chips)
Seat 6: carl ($1.50 in chips)
bob smith: posts small blind $1
Hero: posts big blind $2
*** HOLE CARDS ***
Dealt to Hero [As Kd]
carl: calls $1.50 and is all-in
alice: raises $38 to $40 and is all-in
bob smith: folds
Hero: raises $60 to $100
Uncalled bet ($60) returned to Hero
*** FLOP *** [Ah 7c 2d]
*** TURN *** [Ah 7c 2d] [9s]
*** RIVER *** [Ah 7c 2d 9s] [3h]
*** SHOW DOWN ***
Hero: shows [As Kd] (a pair of Aces)
alice: mucks hand
Hero collected $77 from side pot
carl: shows [7d 7h] (three of a kind, Sevens)
carl collected $5.50 from main pot
*** SUMMARY ***
Total pot $82.50 Main pot $5.50. Side pot $77. | Rake $0
Board [Ah 7c 2d 9s 3h]
Seat 1: alice (button) mucked [Qd Qs]
Seat 3: bob smith (small blind) folded before Flop
Seat 5: Hero (big blind) showed [As Kd] and won ($77) with a pair of Aces
Seat 6: carl showed [7d 7h] and won ($5.50) with three of a kind, Sevens
`)
    expect(error).toBeUndefined()
    const h = hand!
    expect(h.players.map(p => p.name)).toEqual(['alice', 'bob smith', 'Hero', 'carl'])
    expect(h.streets[0]!.actions).toEqual([
      { player: 'bob smith', type: 'sb', amount: 1 },
      { player: 'Hero', type: 'bb', amount: 2 },
      { player: 'carl', type: 'call', amount: 1.5 },
      { player: 'alice', type: 'raise', amount: 40 },
      { player: 'bob smith', type: 'fold', amount: 0 },
      { player: 'Hero', type: 'raise', amount: 100 },
    ])
    expect(h.uncalledReturns).toEqual([{ player: 'Hero', amount: 60 }])
    expect(h.winners).toEqual([{ player: 'Hero', amount: 77 }, { player: 'carl', amount: 5.5 }])
    expect(h.totalPot).toBe(82.5)
    // alice mucked at showdown; her cards are only in the summary
    expect(h.players[0]!.holeCards).toEqual([{ rank: 12, suit: 'diamonds' }, { rank: 12, suit: 'spades' }])
    expect(h.players[3]!.holeCards).toEqual([{ rank: 7, suit: 'diamonds' }, { rank: 7, suit: 'hearts' }])
  })

  it('reads an all-in blind post', () => {
    const { hand } = parsePokerStarsHand(`PokerStars Hand #1: Hold'em No Limit ($1/$2 USD) - 2024/03/01 20:16:30 ET
Table 'T' 2-max Seat #1 is the button
Seat 1: a ($50 in chips)
Seat 2: b ($1.50 in chips)
a: posts small blind $1
b: posts big blind $1.50 and is all-in
*** HOLE CARDS ***
a: calls $0.50
`)
    expect(hand!.streets[0]!.actions[1]).toEqual({ player: 'b', type: 'bb', amount: 1.5 })
  })
})

describe('the export is labelled as what it is', () => {
  const appDir = join(import.meta.dirname, '..', 'app')
  const sources = ['pages', 'components'].flatMap(dir =>
    readdirSync(join(appDir, dir)).filter(f => f.endsWith('.vue')).map(f => join(appDir, dir, f)))
  const read = (...parts: string[]) => readFileSync(join(appDir, ...parts), 'utf8')

  it('no page promises import into a named tracking product', () => {
    for (const file of sources) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/PokerTracker|Hold'em Manager|Equilab|industry standard/i)
    }
  })

  it('no page still calls the export PokerStars-style', () => {
    for (const file of sources) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/PokerStars-style/i)
      expect(src, file).not.toMatch(/not a conforming PokerStars/i)
    }
  })

  it('the pages that offer the export call it PokerStars (hand-history) format', () => {
    expect(read('pages', 'stats.vue')).toMatch(/PokerStars hand-history format/)
    expect(read('pages', 'stats.vue')).toMatch(/>PokerStars format</)
    expect(read('pages', 'analysis.vue')).toMatch(/PokerStars hand-history format/)
    expect(read('pages', 'replay-hand.vue')).toMatch(/PokerStars-format export/)
    expect(read('components', 'SetupScreen.vue')).toMatch(/PokerStars format/)
  })

  it('the exporter\'s own header claims the format, not a tracker test', () => {
    const src = read('utils', 'pokerStarsExport.ts')
    expect(src).not.toMatch(/PokerTracker|Hold'em Manager/)
    expect(src).not.toMatch(/not a conforming PokerStars/i)
    expect(src).toMatch(/PokerStars cash-game hand-history format/)
  })
})
