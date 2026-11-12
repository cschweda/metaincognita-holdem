/**
 * PokerStars export — the text must be a genuine PokerStars cash-game hand
 * history: bet vs raise wording, `raises $X to $Y`, all-in suffixes, the
 * uncalled-bet return, itemised main/side/split pots, a SHOW DOWN section
 * only when there is one, and only the hero dealt in. `players[].chips` is
 * the stack at the deal, before blinds.
 */
import { describe, it, expect } from 'vitest'
import { toPokerStarsFormat, exportHandsAsPokerStars } from '../app/utils/pokerStarsExport'
import { parsePokerStarsHand, parseMultipleHands } from '../app/utils/pokerStarsParser'

const STAKE = { sb: 1, bb: 2 }
const linesOf = (text: string) => text.split('\n')

// ─── Fold-around: the raise is never called ────────────────────────
const foldAround = {
  handNumber: 7,
  playedAt: '2026-11-11T19:03:22Z', // 14:03:22 in New York (EST)
  potSize: 9,
  board: '',
  result: 'won',
  winnerName: 'Hero',
  players: [
    { name: 'Hero', seatIndex: 0, position: 'CO', chips: 200, isHero: true, folded: false, holeCards: 'A♥ K♦' },
    { name: 'Ann Lee', seatIndex: 1, position: 'BTN', chips: 180, isHero: false, folded: true, holeCards: '7♣ 2♦' },
    { name: 'Bob', seatIndex: 2, position: 'SB', chips: 200, isHero: false, folded: true, holeCards: '9♣ 4♦' },
    { name: 'Cy', seatIndex: 3, position: 'BB', chips: 150.5, isHero: false, folded: true, holeCards: 'J♣ 3♦' },
    { name: 'Dee', seatIndex: 4, position: 'UTG', chips: 200, isHero: false, folded: true, holeCards: '8♣ 3♥' },
    // A busted seat: no position, no cards — it was not dealt in.
    { name: 'Gone', seatIndex: 5, position: '', chips: 0, isHero: false, folded: true, holeCards: '' },
  ],
  actions: [
    '--- DEAL ---',
    '  Hero (CO): A♥ K♦ ← Hero',
    '  Ann Lee (BTN): 7♣ 2♦',
    '--- PREFLOP ---',
    'Dee folds',
    'Hero raises to $6',
    'Ann Lee folds',
    'Bob folds',
    'Cy folds',
  ],
}

describe('a hand won without a showdown', () => {
  const out = toPokerStarsFormat(foldAround, STAKE)
  const lines = linesOf(out)

  it('writes the real header: currency code, slash date in ET, a long hand number', () => {
    expect(lines[0]).toMatch(/^PokerStars Hand #\d{10,}: Hold'em No Limit \(\$1\/\$2 USD\) - 2026\/11\/11 14:03:22 ET$/)
    expect(lines[1]).toBe('Table \'Metaincognita\' 6-max Seat #2 is the button')
  })

  it('seats only the players dealt in, with their stacks at the deal', () => {
    expect(lines.slice(2, 7)).toEqual([
      'Seat 1: Hero ($200 in chips)',
      'Seat 2: Ann Lee ($180 in chips)',
      'Seat 3: Bob ($200 in chips)',
      'Seat 4: Cy ($150.50 in chips)',
      'Seat 5: Dee ($200 in chips)',
    ])
    expect(out).not.toContain('Gone')
  })

  it('posts the blinds and deals only the hero in', () => {
    expect(lines.slice(7, 11)).toEqual([
      'Bob: posts small blind $1',
      'Cy: posts big blind $2',
      '*** HOLE CARDS ***',
      'Dealt to Hero [Ah Kd]',
    ])
    expect(out.match(/^Dealt to /gm)).toHaveLength(1)
  })

  it('writes the raise as "raises $X to $Y" and returns the uncalled part', () => {
    expect(lines.slice(11, 19)).toEqual([
      'Dee: folds',
      'Hero: raises $4 to $6',
      'Ann Lee: folds',
      'Bob: folds',
      'Cy: folds',
      'Uncalled bet ($4) returned to Hero',
      'Hero collected $5 from pot',
      'Hero: doesn\'t show hand',
    ])
  })

  it('has no SHOW DOWN section, no board, and a summary that says who folded when', () => {
    expect(out).not.toContain('*** SHOW DOWN ***')
    expect(out).not.toMatch(/^Board /m)
    expect(lines.slice(19, 26)).toEqual([
      '*** SUMMARY ***',
      'Total pot $5 | Rake $0',
      'Seat 1: Hero collected ($5)',
      'Seat 2: Ann Lee (button) folded before Flop (didn\'t bet)',
      'Seat 3: Bob (small blind) folded before Flop',
      'Seat 4: Cy (big blind) folded before Flop',
      'Seat 5: Dee folded before Flop (didn\'t bet)',
    ])
  })

  it('never writes unicode suits or the app\'s own log wording', () => {
    expect(out).not.toMatch(/[♠♥♦♣]/)
    expect(out).not.toMatch(/raises to|ALL-IN|---/)
  })
})

// ─── Heads-up showdown: bet vs raise ───────────────────────────────
const headsUp = {
  handNumber: 3,
  playedAt: '2026-07-04T16:00:00Z', // 12:00:00 in New York (EDT)
  potSize: 60,
  board: 'A♠ 10♦ 7♣ 2♥ 9♠',
  result: 'won',
  winnerName: 'Hero',
  players: [
    { name: 'Hero', seatIndex: 0, position: 'D/SB', chips: 200, isHero: true, folded: false, holeCards: 'A♥ K♦' },
    { name: 'Villain', seatIndex: 1, position: 'BB', chips: 200, isHero: false, folded: false, holeCards: 'Q♠ Q♦' },
  ],
  actions: [
    '--- DEAL ---', '  Hero (D/SB): A♥ K♦ ← Hero', '  Villain (BB): Q♠ Q♦', '--- PREFLOP ---',
    'Hero raises to $6',
    'Villain calls $4',
    '--- FLOP: A♠ 10♦ 7♣ ---',
    'Villain checks',
    'Hero raises to $8',
    'Villain raises to $24',
    'Hero calls $16',
    '--- TURN: 2♥ ---',
    'Villain checks',
    'Hero checks',
    '--- RIVER: 9♠ ---',
    'Villain checks',
    'Hero checks',
  ],
}

describe('a heads-up hand that reaches showdown', () => {
  const out = toPokerStarsFormat(headsUp, STAKE)

  it('converts the date to Eastern time (daylight saving included)', () => {
    expect(linesOf(out)[0]).toContain(' - 2026/07/04 12:00:00 ET')
  })

  it('writes an opening postflop bet as a bet and a raise as "raises $X to $Y"', () => {
    expect(out).toContain('\nHero: raises $4 to $6\nVillain: calls $4\n')
    expect(out).toContain('\nHero: bets $8\nVillain: raises $16 to $24\nHero: calls $16\n')
  })

  it('writes the street lines with the cumulative board', () => {
    expect(out).toContain('\n*** FLOP *** [As Td 7c]\n')
    expect(out).toContain('\n*** TURN *** [As Td 7c] [2h]\n')
    expect(out).toContain('\n*** RIVER *** [As Td 7c 2h] [9s]\n')
  })

  it('deals only the hero in; the villain\'s cards appear at showdown', () => {
    expect(out.match(/^Dealt to .+$/gm)).toEqual(['Dealt to Hero [Ah Kd]'])
  })

  it('writes the showdown with hand descriptions, then the summary', () => {
    const tail = out.slice(out.indexOf('*** SHOW DOWN ***')).trimEnd().split('\n')
    expect(tail).toEqual([
      '*** SHOW DOWN ***',
      'Villain: shows [Qs Qd] (a pair of Queens)',
      'Hero: shows [Ah Kd] (a pair of Aces)',
      'Hero collected $60 from pot',
      '*** SUMMARY ***',
      'Total pot $60 | Rake $0',
      'Board [As Td 7c 2h 9s]',
      'Seat 1: Hero (button) (small blind) showed [Ah Kd] and won ($60) with a pair of Aces',
      'Seat 2: Villain (big blind) showed [Qs Qd] and lost with a pair of Queens',
    ])
    expect(out).not.toContain('Uncalled bet')
  })

  it('says which street a player folded on', () => {
    const folded = toPokerStarsFormat({
      ...headsUp,
      board: 'A♠ 10♦ 7♣',
      actions: [...headsUp.actions.slice(0, 9), 'Villain folds'],
    }, STAKE)
    expect(folded).toContain('\nHero: bets $8\nVillain: folds\nUncalled bet ($8) returned to Hero\nHero collected $12 from pot\nHero: doesn\'t show hand\n*** SUMMARY ***\nTotal pot $12 | Rake $0\nBoard [As Td 7c]\n')
    expect(folded).toContain('Seat 1: Hero (button) (small blind) collected ($12)')
    expect(folded).toContain('Seat 2: Villain (big blind) folded on the Flop')
    expect(folded).not.toContain('*** SHOW DOWN ***')
  })
})

// ─── Three-way all-in with a side pot ──────────────────────────────
const threeWay = {
  handNumber: 12,
  playedAt: '2026-11-11T19:03:22Z',
  potSize: 290,
  board: '9♣ 8♦ 3♠ 2♥ 7♣',
  result: 'lost',
  winnerName: 'Short',
  players: [
    { name: 'Hero', seatIndex: 0, position: 'D/BTN', chips: 200, isHero: true, folded: false, holeCards: 'Q♠ Q♦' },
    { name: 'Short', seatIndex: 1, position: 'SB', chips: 50, isHero: false, folded: false, holeCards: 'A♠ A♥' },
    { name: 'Mid', seatIndex: 2, position: 'BB', chips: 120, isHero: false, folded: false, holeCards: 'K♠ K♦' },
  ],
  actions: [
    '--- DEAL ---', '--- PREFLOP ---',
    'Hero raises to $6',
    'Short goes ALL-IN $50',
    'Mid goes ALL-IN $120',
    'Hero goes ALL-IN $200',
    '--- FLOP: 9♣ 8♦ 3♠ ---',
    '--- TURN: 2♥ ---',
    '--- RIVER: 7♣ ---',
  ],
}

describe('a three-way all-in', () => {
  const out = toPokerStarsFormat(threeWay, STAKE)

  it('writes each all-in as a raise with the all-in suffix', () => {
    expect(out).toContain([
      'Hero: raises $4 to $6',
      'Short: raises $44 to $50 and is all-in',
      'Mid: raises $70 to $120 and is all-in',
      // Hero shoved $200 over two all-ins: nobody can call the extra, so it is a call
      'Hero: calls $114',
      '*** FLOP *** [9c 8d 3s]',
      '*** TURN *** [9c 8d 3s] [2h]',
      '*** RIVER *** [9c 8d 3s 2h] [7c]',
      '*** SHOW DOWN ***',
    ].join('\n'))
  })

  it('itemises the side pot and the main pot, each to its own winner', () => {
    expect(out).toContain([
      // PokerStars settles the side pot first: its players show, it is paid,
      // then the player who is only in the main pot shows
      '*** SHOW DOWN ***',
      'Mid: shows [Ks Kd] (a pair of Kings)',
      'Hero: shows [Qs Qd] (a pair of Queens)',
      'Mid collected $140 from side pot',
      'Short: shows [As Ah] (a pair of Aces)',
      'Short collected $150 from main pot',
      '*** SUMMARY ***',
      'Total pot $290 Main pot $150. Side pot $140. | Rake $0',
      'Board [9c 8d 3s 2h 7c]',
      'Seat 1: Hero (button) showed [Qs Qd] and lost with a pair of Queens',
      'Seat 2: Short (small blind) showed [As Ah] and won ($150) with a pair of Aces',
      'Seat 3: Mid (big blind) showed [Ks Kd] and won ($140) with a pair of Kings',
    ].join('\n'))
  })

  it('returns the uncalled part of a raise that a player could have called', () => {
    // Mid still has chips when Hero shoves, then folds
    const out2 = toPokerStarsFormat({
      ...threeWay,
      board: '',
      actions: ['Hero raises to $6', 'Short goes ALL-IN $50', 'Mid raises to $100', 'Hero goes ALL-IN $200', 'Mid folds'],
    }, STAKE)
    expect(out2).toContain('Mid: raises $50 to $100\nHero: raises $100 to $200 and is all-in\nMid: folds\nUncalled bet ($100) returned to Hero\n')
  })

  it('writes an all-in for less than the bet as a call', () => {
    const shortCall = toPokerStarsFormat({
      ...threeWay,
      actions: ['Hero raises to $60', 'Short goes ALL-IN $50', 'Mid folds'],
    }, STAKE)
    expect(shortCall).toContain('Hero: raises $58 to $60\nShort: calls $49 and is all-in\nMid: folds\nUncalled bet ($10) returned to Hero\n')
  })
})

// ─── Split pot ─────────────────────────────────────────────────────
const split = {
  handNumber: 20,
  playedAt: '2026-11-11T19:03:22Z',
  potSize: 140,
  board: 'A♠ K♠ Q♦ J♣ 10♥',
  result: 'won',
  winnerName: 'Split: Hero & Villain',
  players: [
    { name: 'Hero', seatIndex: 0, position: 'D/SB', chips: 100, isHero: true, folded: false, holeCards: '2♥ 2♦' },
    { name: 'Villain', seatIndex: 1, position: 'BB', chips: 40, isHero: false, folded: false, holeCards: '3♠ 3♦' },
  ],
  actions: [
    '--- DEAL ---', '--- PREFLOP ---',
    'Hero goes ALL-IN $100',
    'Villain calls $38',
    '--- FLOP: A♠ K♠ Q♦ ---',
    '--- TURN: J♣ ---',
    '--- RIVER: 10♥ ---',
  ],
}

describe('a split pot', () => {
  const out = toPokerStarsFormat(split, STAKE)

  it('marks the all-in call and returns what the short stack could not cover', () => {
    expect(out).toContain('Hero: raises $98 to $100 and is all-in\nVillain: calls $38 and is all-in\nUncalled bet ($60) returned to Hero\n*** FLOP *** [As Ks Qd]\n')
  })

  it('gives each winner a collected line and a summary line', () => {
    expect(out).toContain('Villain: shows [3s 3d] (a straight, Ten to Ace)\nHero: shows [2h 2d] (a straight, Ten to Ace)\n')
    expect(out).toContain('Hero collected $40 from pot\n')
    expect(out).toContain('Villain collected $40 from pot\n')
    expect(out).toContain('Total pot $80 | Rake $0\n')
    expect(out).toContain('Seat 1: Hero (button) (small blind) showed [2h 2d] and won ($40) with a straight, Ten to Ace')
    expect(out).toContain('Seat 2: Villain (big blind) showed [3s 3d] and won ($40) with a straight, Ten to Ace')
  })
})

// ─── Hand descriptions ─────────────────────────────────────────────
describe('showdown hand descriptions use PokerStars wording', () => {
  const describeWith = (hole: string, board: string) => {
    // Hero bets the river and is called, so he shows first whatever he holds
    const out = toPokerStarsFormat({
      ...headsUp, board,
      actions: [...headsUp.actions.slice(0, -1), 'Hero raises to $10', 'Villain calls $10'],
      players: [{ ...headsUp.players[0]!, holeCards: hole }, headsUp.players[1]!],
    }, STAKE)
    return out.match(/^Hero: shows \[.+?\] \((.+)\)$/m)?.[1]
  }
  it.each([
    ['K♥ 4♦', 'A♠ 10♦ 7♣ 2♥ 9♠', 'high card Ace'],
    ['2♣ 5♦', 'A♠ 10♦ 7♣ 2♥ 9♠', 'a pair of Deuces'],
    ['A♥ 10♣', 'A♠ 10♦ 7♣ 2♥ 9♠', 'two pair, Aces and Tens'],
    ['7♥ 7♦', 'A♠ 10♦ 7♣ 2♥ 9♠', 'three of a kind, Sevens'],
    ['3♥ 4♦', 'A♠ 5♦ 7♣ 2♥ 9♠', 'a straight, Ace to Five'],
    ['J♥ 8♦', 'A♠ 10♦ 7♣ 2♥ 9♠', 'a straight, Seven to Jack'],
    ['K♠ 3♠', 'A♠ 10♠ 7♣ 2♥ 9♠', 'a flush, Ace high'],
    ['6♥ 6♦', 'A♠ A♦ 6♣ 2♥ 9♠', 'a full house, Sixes full of Aces'],
    ['9♥ 9♦', 'A♠ 9♣ 7♣ 2♥ 9♠', 'four of a kind, Nines'],
    ['8♠ 6♠', 'A♦ 5♠ 7♠ 2♥ 9♠', 'a straight flush, Five to Nine'],
    ['K♠ Q♠', 'A♠ 10♠ 7♣ 2♥ J♠', 'a Royal Flush'],
  ])('%s on %s is "%s"', (hole, board, expected) => {
    expect(describeWith(hole, board)).toBe(expected)
  })
})

// ─── Showdown order, mucking, kicker qualifiers ────────────────────
// Rules derived from genuine PokerStars histories (the Stars regression files
// of the fpdb project and the PokerStars fixtures of the hhp, poker and
// PokerHandHistoryParser projects — about 420 hold'em showdowns, 2005–2025).
describe('who shows first and who mucks', () => {
  const riverBet = (bettor: 'Hero' | 'Villain', caller: 'Hero' | 'Villain') => [
    ...headsUp.actions.slice(0, -2),
    ...(bettor === 'Hero' ? ['Villain checks', 'Hero raises to $10', 'Villain calls $10']
      : ['Villain raises to $10', `${caller} calls $10`]),
  ]
  const sdOf = (out: string) => out.slice(out.indexOf('*** SHOW DOWN ***'), out.indexOf('*** SUMMARY ***')).trimEnd().split('\n')

  it('with no bet on the river, the first player left of the button shows first; a later loser mucks', () => {
    // Villain (big blind, left of the button) shows queens; Hero cannot beat them
    const out = toPokerStarsFormat({
      ...headsUp, players: [{ ...headsUp.players[0]!, holeCards: 'K♥ 4♦' }, headsUp.players[1]!],
    }, STAKE)
    expect(sdOf(out)).toEqual([
      '*** SHOW DOWN ***',
      'Villain: shows [Qs Qd] (a pair of Queens)',
      'Hero: mucks hand',
      'Villain collected $60 from pot',
    ])
    expect(out).toContain('Seat 1: Hero (button) (small blind) mucked [Kh 4d]')
    expect(out).toContain('Seat 2: Villain (big blind) showed [Qs Qd] and won ($60) with a pair of Queens')
  })

  it('a later player who wins shows', () => {
    expect(sdOf(toPokerStarsFormat(headsUp, STAKE))).toEqual([
      '*** SHOW DOWN ***',
      'Villain: shows [Qs Qd] (a pair of Queens)',
      'Hero: shows [Ah Kd] (a pair of Aces)',
      'Hero collected $60 from pot',
    ])
  })

  it('the last player to bet or raise on the river shows first', () => {
    const out = toPokerStarsFormat({ ...headsUp, actions: riverBet('Hero', 'Villain') }, STAKE)
    expect(sdOf(out)).toEqual([
      '*** SHOW DOWN ***',
      'Hero: shows [Ah Kd] (a pair of Aces)',
      'Villain: mucks hand',
      'Hero collected $80 from pot',
    ])
    // The hero's own history lists what an opponent mucked
    expect(out).toContain('Seat 2: Villain (big blind) mucked [Qs Qd]')
    expect(out).toContain('Seat 1: Hero (button) (small blind) showed [Ah Kd] and won ($80) with a pair of Aces')
  })

  it('a history with no hero dealt in does not list mucked cards', () => {
    const out = toPokerStarsFormat({
      ...headsUp, actions: riverBet('Hero', 'Villain'),
      players: headsUp.players.map(p => ({ ...p, isHero: false })),
    }, STAKE)
    expect(out).toContain('Villain: mucks hand')
    expect(out).toContain('Seat 2: Villain (big blind) mucked\n')
    expect(out).not.toContain('Qs Qd')
  })

  it('a tie is shown, not mucked', () => {
    const out = toPokerStarsFormat({ ...split, players: split.players.map(p => ({ ...p, chips: 200 })),
      actions: ['Hero raises to $6', 'Villain calls $4', ...split.actions.slice(4)] }, STAKE)
    expect(sdOf(out)).toEqual([
      '*** SHOW DOWN ***',
      'Villain: shows [3s 3d] (a straight, Ten to Ace)',
      'Hero: shows [2h 2d] (a straight, Ten to Ace)',
      'Hero collected $6 from pot',
      'Villain collected $6 from pot',
    ])
  })

  it('when the betting ended all-in, every hand is shown', () => {
    const out = toPokerStarsFormat({
      ...split, board: 'A♠ K♠ Q♦ 7♣ 2♣',
      players: [{ ...split.players[0]!, holeCards: '9♥ 8♦' }, { ...split.players[1]!, holeCards: 'A♦ 3♦' }],
      actions: [...split.actions.slice(0, 5), '--- TURN: 7♣ ---', '--- RIVER: 2♣ ---'],
    }, STAKE)
    expect(sdOf(out)).toEqual([
      '*** SHOW DOWN ***',
      'Villain: shows [Ad 3d] (a pair of Aces)',
      'Hero: shows [9h 8d] (high card Ace)',
      'Villain collected $80 from pot',
    ])
    expect(out).toContain('Seat 1: Hero (button) (small blind) showed [9h 8d] and lost with high card Ace')
  })

  it('three-way: mucked hands keep their place in the order', () => {
    const out = toPokerStarsFormat({
      ...threeWay, board: '9♣ 8♦ 3♠ 2♥ 7♣',
      players: threeWay.players.map(p => ({ ...p, chips: 500 })),
      actions: [
        'Hero raises to $6', 'Short calls $5', 'Mid calls $4',
        '--- FLOP: 9♣ 8♦ 3♠ ---', 'Short checks', 'Mid checks', 'Hero checks',
        '--- TURN: 2♥ ---', 'Short checks', 'Mid checks', 'Hero checks',
        '--- RIVER: 7♣ ---', 'Short checks', 'Mid raises to $10', 'Hero calls $10', 'Short calls $10',
      ],
    }, STAKE)
    // Mid (kings) bet the river and shows first; Hero (queens) mucks; Short (aces) wins
    expect(sdOf(out)).toEqual([
      '*** SHOW DOWN ***',
      'Mid: shows [Ks Kd] (a pair of Kings)',
      'Hero: mucks hand',
      'Short: shows [As Ah] (a pair of Aces)',
      'Short collected $48 from pot',
    ])
    expect(out).toContain('Seat 1: Hero (button) mucked [Qs Qd]')
    expect(out).toContain('Seat 3: Mid (big blind) showed [Ks Kd] and lost with a pair of Kings')
  })

  it('the replay export (dealtTo all) still carries every hand, mucked or not', () => {
    const text = toPokerStarsFormat({ ...headsUp, actions: riverBet('Hero', 'Villain'),
      players: headsUp.players.map(p => ({ ...p, isHero: false })) }, STAKE, undefined, { dealtTo: 'all' })
    expect(text).toContain('Villain: mucks hand')
    const h = parsePokerStarsHand(text).hand!
    expect(h.players.every(p => p.holeCards)).toBe(true)
  })

  it('the importer reads a mucked opponent\'s cards back from the summary', () => {
    const h = parsePokerStarsHand(toPokerStarsFormat({ ...headsUp, actions: riverBet('Hero', 'Villain') }, STAKE)).hand!
    expect(h.players[1]!.holeCards).toEqual([{ rank: 12, suit: 'spades' }, { rank: 12, suit: 'diamonds' }])
    expect(h.winners).toEqual([{ player: 'Hero', amount: 80 }])
  })
})

describe('kicker qualifiers on a later-shown hand', () => {
  // Heads-up all-in before the flop: both hands are always shown, the big
  // blind (Villain) first. Returns [first shown, second shown, summary text].
  const showBoth = (first: string, second: string, board: string) => {
    const out = toPokerStarsFormat({
      ...split, board,
      players: [{ ...split.players[0]!, holeCards: second }, { ...split.players[1]!, holeCards: first }],
      actions: ['Hero goes ALL-IN $100', 'Villain calls $38'],
    }, STAKE)
    const desc = (name: string) => out.match(new RegExp(`^${name}: shows \\[.+?\\] \\((.+)\\)$`, 'm'))?.[1]
    return { first: desc('Villain'), second: desc('Hero'), summary: out.slice(out.indexOf('*** SUMMARY ***')) }
  }

  // Each row is a showdown from a genuine PokerStars history
  it.each([
    ['5♠ 6♦', '2♥ A♠', 'K♥ 7♦ J♣ 9♥ K♦', 'a pair of Kings', 'a pair of Kings - Ace kicker'],
    ['A♠ 10♦', 'A♦ K♦', '8♣ 3♠ 2♦ 3♥ 4♣', 'a pair of Threes', 'a pair of Threes - Ace+King kicker'],
    ['A♠ 9♦', 'A♥ J♥', '6♦ 7♣ 6♥ 2♠ Q♣', 'a pair of Sixes', 'a pair of Sixes - Ace+Queen+Jack kicker'],
    ['A♠ K♦', 'K♥ Q♠', '3♠ J♦ 3♣ 8♣ 2♦', 'a pair of Threes', 'a pair of Threes - lower kicker'],
    ['J♥ A♠', 'Q♣ A♦', '10♦ 8♣ A♣ 6♥ 10♣', 'two pair, Aces and Tens', 'two pair, Aces and Tens - Queen kicker'],
    ['K♥ A♣', 'J♦ A♥', 'Q♦ 3♠ 9♣ 9♠ A♠', 'two pair, Aces and Nines', 'two pair, Aces and Nines - lower kicker'],
    ['6♥ A♣', 'K♦ 6♣', '6♦ 5♦ Q♥ 8♣ 6♠', 'three of a kind, Sixes', 'three of a kind, Sixes - lower kicker'],
    ['J♠ A♥', 'K♦ A♠', '8♥ 4♥ 6♦ 5♦ 3♣', 'high card Ace', 'high card Ace - King kicker'],
    ['J♠ 2♠', 'J♣ 9♣', 'K♦ 7♣ A♦ 4♦ 6♦', 'high card Ace', 'high card Ace - King+Jack+Nine kicker'],
    ['9♦ A♠', '7♦ 8♦', '2♥ 2♦ Q♦ 5♦ 4♦', 'a flush, Queen high', 'a flush, Queen high - lower cards'],
  ])('%s then %s on %s', (first, second, board, firstDesc, secondDesc) => {
    const r = showBoth(first, second, board)
    expect(r.first).toBe(firstDesc)
    expect(r.second).toBe(secondDesc)
    // the summary never carries the qualifier
    expect(r.summary).not.toMatch(/ - (lower|\w+(\+\w+)* kicker)/)
    expect(r.summary).toContain(`with ${firstDesc}\n`)
  })

  it.each([
    ['same hand: a tie has no qualifier', 'K♥ 3♥', '7♦ 9♥', '2♥ 10♠ 10♥ 2♦ A♠', 'two pair, Tens and Deuces', 'two pair, Tens and Deuces'],
    ['a different hand: nothing to tell apart', 'Q♠ Q♦', 'A♥ K♦', 'A♠ 10♦ 7♣ 2♥ 9♠', 'a pair of Queens', 'a pair of Aces'],
    ['a straight has no kicker', 'K♦ J♥', 'K♣ 2♦', 'A♠ A♣ 10♠ J♣ Q♥', 'a straight, Ten to Ace', 'a straight, Ten to Ace'],
  ])('%s', (_label, first, second, board, firstDesc, secondDesc) => {
    const r = showBoth(first, second, board)
    expect([r.first, r.second]).toEqual([firstDesc, secondDesc])
  })

  it('the qualifier compares with the best hand shown so far, and only if it has the same name', () => {
    // From a genuine five-way all-in: a full house was shown first, so the
    // hands of three eights that follow carry no qualifier.
    const out = toPokerStarsFormat({
      ...threeWay, board: '6♥ 8♦ 2♣ 8♠ 8♥',
      players: [
        { ...threeWay.players[0]!, chips: 120, holeCards: '3♦ 10♣' },
        { ...threeWay.players[1]!, chips: 120, holeCards: 'A♠ A♦' },
        { ...threeWay.players[2]!, chips: 120, holeCards: '5♥ K♦' },
      ],
      actions: ['Hero goes ALL-IN $120', 'Short goes ALL-IN $120', 'Mid calls $118'],
    }, STAKE)
    expect(out).toContain([
      'Short: shows [As Ad] (a full house, Eights full of Aces)',
      'Mid: shows [5h Kd] (three of a kind, Eights)',
      'Hero: shows [3d Tc] (three of a kind, Eights)',
    ].join('\n'))
  })
})

// ─── Fractional stakes ─────────────────────────────────────────────
describe('fractional stakes keep their cents', () => {
  const out = toPokerStarsFormat({
    handNumber: 42, potSize: 25.5, board: 'A♠ K♥ Q♦ 4♣ 5♣', result: 'won',
    players: [
      { name: 'Hero', seatIndex: 0, position: 'D/SB', chips: 50, isHero: true, folded: false, holeCards: 'A♥ A♦' },
      { name: 'Villain', seatIndex: 1, position: 'BB', chips: 12.75, isHero: false, folded: false, holeCards: 'K♠ K♦' },
    ],
    actions: [
      'Hero raises to $1.5',
      'Villain goes ALL-IN $12.75',
      'Hero calls $11.25',
      '--- FLOP: A♠ K♥ Q♦ ---', '--- TURN: 4♣ ---', '--- RIVER: 5♣ ---',
    ],
  }, { sb: 0.25, bb: 0.5 })

  it('in the header and the blinds', () => {
    expect(out).toContain('($0.25/$0.50 USD)')
    expect(out).toContain('Hero: posts small blind $0.25\nVillain: posts big blind $0.50\n')
  })
  it('in raises, calls and pots, two decimals only when needed', () => {
    expect(out).toContain('Hero: raises $1 to $1.50\nVillain: raises $11.25 to $12.75 and is all-in\nHero: calls $11.25\n')
    expect(out).toContain('Hero collected $25.50 from pot')
  })
})

// ─── Options, fallbacks, robustness ────────────────────────────────
describe('exporter options and fallbacks', () => {
  it('prefers the stake and button recorded on the hand', () => {
    const out = toPokerStarsFormat({ ...foldAround, sb: 5, bb: 10, buttonSeat: 1 }, STAKE)
    expect(out).toContain('($5/$10 USD)')
    expect(out).toContain('Bob: posts small blind $5\nCy: posts big blind $10\n')
    expect(out).toContain('Seat #2 is the button')
  })

  it('can deal every player in for the app\'s own face-up replay', () => {
    const out = toPokerStarsFormat(headsUp, STAKE, undefined, { dealtTo: 'all' })
    expect(out.match(/^Dealt to .+$/gm)).toEqual(['Dealt to Hero [Ah Kd]', 'Dealt to Villain [Qs Qd]'])
  })

  it('reads a stored row (snake_case, no winner name) the same way', () => {
    const row = {
      hand_number: 3, played_at: '2026-07-04T16:00:00Z', pot_size: 60, board: headsUp.board,
      result: 'won', players: headsUp.players, actions: headsUp.actions,
    }
    expect(toPokerStarsFormat(row, STAKE)).toBe(toPokerStarsFormat(headsUp, STAKE))
  })

  it('gives hands of different sessions different hand numbers', () => {
    const idOf = (h: object) => toPokerStarsFormat(h, STAKE).match(/^PokerStars Hand #(\d+):/)![1]
    expect(idOf(headsUp)).not.toBe(idOf({ ...headsUp, playedAt: '2026-07-05T16:00:00Z' }))
    expect(idOf(headsUp)).toBe(idOf({ ...headsUp }))
  })

  it('a stack recorded smaller than what the player put in is raised to cover it', () => {
    // Hands stored before stacks were recorded at the deal hold end-of-hand stacks.
    const legacy = toPokerStarsFormat({
      ...split,
      players: [{ ...split.players[0]!, chips: 0 }, { ...split.players[1]!, chips: undefined }],
    }, STAKE)
    expect(legacy).toContain('Seat 1: Hero ($100 in chips)')
    expect(legacy).toMatch(/Seat 2: Villain \(\$\d+ in chips\)/)
    expect(parsePokerStarsHand(legacy).success).toBe(true)
  })

  it('a hand recorded without its players is left out of a multi-hand file', () => {
    const file = exportHandsAsPokerStars([foldAround, { ...foldAround, handNumber: 8, players: [] }, headsUp], STAKE)
    expect(file.match(/^PokerStars Hand #/gm)).toHaveLength(2)
    expect(parseMultipleHands(file).every(r => r.success)).toBe(true)
  })
})

// ─── Export → parse round trip ─────────────────────────────────────
describe('the importer reads the export back', () => {
  it('fold-around: seats, button, actions, the returned bet and the winner', () => {
    const r = parsePokerStarsHand(toPokerStarsFormat(foldAround, STAKE))
    expect(r.error).toBeUndefined()
    const h = r.hand!
    expect(h.stakes).toEqual(STAKE)
    expect(h.tableName).toBe('Metaincognita')
    expect(h.buttonSeat).toBe(2)
    expect(h.players.map(p => [p.seatNumber, p.name, p.chips])).toEqual([
      [1, 'Hero', 200], [2, 'Ann Lee', 180], [3, 'Bob', 200], [4, 'Cy', 150.5], [5, 'Dee', 200],
    ])
    expect(h.streets).toHaveLength(1)
    expect(h.streets[0]!.actions).toEqual([
      { player: 'Bob', type: 'sb', amount: 1 },
      { player: 'Cy', type: 'bb', amount: 2 },
      { player: 'Dee', type: 'fold', amount: 0 },
      { player: 'Hero', type: 'raise', amount: 6 },
      { player: 'Ann Lee', type: 'fold', amount: 0 },
      { player: 'Bob', type: 'fold', amount: 0 },
      { player: 'Cy', type: 'fold', amount: 0 },
    ])
    expect(h.uncalledReturns).toEqual([{ player: 'Hero', amount: 4 }])
    expect(h.winners).toEqual([{ player: 'Hero', amount: 5 }])
    expect(h.totalPot).toBe(5)
    expect(h.players.find(p => p.name === 'Hero')!.holeCards).toEqual([
      { rank: 14, suit: 'hearts' }, { rank: 13, suit: 'diamonds' },
    ])
  })

  it('heads-up showdown: bets, raises, the board and the shown cards', () => {
    const h = parsePokerStarsHand(toPokerStarsFormat(headsUp, STAKE)).hand!
    expect(h.streets.map(s => s.name)).toEqual(['preflop', 'flop', 'turn', 'river'])
    expect(h.streets[1]!.actions).toEqual([
      { player: 'Villain', type: 'check', amount: 0 },
      { player: 'Hero', type: 'bet', amount: 8 },
      { player: 'Villain', type: 'raise', amount: 24 },
      { player: 'Hero', type: 'call', amount: 16 },
    ])
    expect(h.board).toHaveLength(5)
    expect(h.players[1]!.holeCards).toEqual([{ rank: 12, suit: 'spades' }, { rank: 12, suit: 'diamonds' }])
    expect(h.winners).toEqual([{ player: 'Hero', amount: 60 }])
    expect(h.uncalledReturns).toEqual([])
  })

  it('side pots and all-in suffixes', () => {
    const h = parsePokerStarsHand(toPokerStarsFormat(threeWay, STAKE)).hand!
    expect(h.streets[0]!.actions.slice(2)).toEqual([
      { player: 'Hero', type: 'raise', amount: 6 },
      { player: 'Short', type: 'raise', amount: 50 },
      { player: 'Mid', type: 'raise', amount: 120 },
      { player: 'Hero', type: 'call', amount: 114 },
    ])
    expect(h.uncalledReturns).toEqual([])
    expect(h.players[0]!.chips).toBe(200)
    expect(h.winners).toEqual([{ player: 'Mid', amount: 140 }, { player: 'Short', amount: 150 }])
    expect(h.totalPot).toBe(290)
    expect(h.players.every(p => p.holeCards)).toBe(true)
  })

  it('split pots and an all-in call', () => {
    const h = parsePokerStarsHand(toPokerStarsFormat(split, STAKE)).hand!
    expect(h.streets[0]!.actions.slice(2)).toEqual([
      { player: 'Hero', type: 'raise', amount: 100 },
      { player: 'Villain', type: 'call', amount: 38 },
    ])
    expect(h.winners).toEqual([{ player: 'Hero', amount: 40 }, { player: 'Villain', amount: 40 }])
  })

  it('chips are conserved: stacks − bets + returns + collections = stacks', () => {
    for (const hand of [foldAround, headsUp, threeWay, split]) {
      const h = parsePokerStarsHand(toPokerStarsFormat(hand, STAKE)).hand!
      let put = 0
      for (const street of h.streets) {
        const inFor = new Map<string, number>()
        for (const a of street.actions) {
          const before = inFor.get(a.player) ?? 0
          if (a.type === 'raise') { put += a.amount - before; inFor.set(a.player, a.amount) }
          else if (a.type !== 'fold' && a.type !== 'check') { put += a.amount; inFor.set(a.player, before + a.amount) }
        }
      }
      const returned = h.uncalledReturns.reduce((s, r) => s + r.amount, 0)
      const collected = h.winners.reduce((s, w) => s + w.amount, 0)
      expect(put - returned, `hand ${hand.handNumber}`).toBe(collected)
      expect(collected).toBe(h.totalPot)
    }
  })

  it('a multi-hand export parses hand by hand', () => {
    const results = parseMultipleHands(exportHandsAsPokerStars([foldAround, headsUp, threeWay, split], STAKE))
    expect(results).toHaveLength(4)
    expect(results.every(r => r.success)).toBe(true)
  })
})

// ─── Whole simulated sessions ──────────────────────────────────────
// The simulator plays with the live game's betting engine and writes the
// same log, so its hands exercise wordings the fixtures above do not.
describe('simulated sessions export as consistent hand histories', () => {
  it.each([[2, 3], [6, 3], [8, 1]])('%i players, stake level %i', async (playerCount, stake) => {
    const { runSimulation } = await import('../app/utils/simulateBrowser')
    const sim = await runSimulation(300, playerCount, () => {}, stake, undefined, 4242 + playerCount)
    const texts = sim.allHandsPS.split(/\n\s*\n(?=PokerStars Hand #)/)
    const parsed = parseMultipleHands(sim.allHandsPS)
    expect(parsed).toHaveLength(300)
    const r2 = (n: number) => Math.round(n * 100) / 100
    const problems: string[] = []

    parsed.forEach((res, i) => {
      const text = texts[i]!
      if (!res.success) { problems.push(`hand ${i}: ${res.error}`); return }
      const h = res.hand!
      const stack = new Map(h.players.map(p => [p.name, p.chips]))
      let put = 0
      for (const street of h.streets) {
        const inFor = new Map<string, number>()
        for (const a of street.actions) {
          const before = inFor.get(a.player) ?? 0
          const added = a.type === 'raise' ? a.amount - before
            : a.type === 'fold' || a.type === 'check' ? 0 : a.amount
          inFor.set(a.player, before + added)
          put += added
          stack.set(a.player, r2(stack.get(a.player)! - added))
        }
      }
      const returned = h.uncalledReturns.reduce((s, x) => s + x.amount, 0)
      const collected = h.winners.reduce((s, w) => s + w.amount, 0)
      if (r2(put - returned) !== r2(collected) || r2(collected) !== h.totalPot) problems.push(`hand ${i}: chips not conserved\n${text}`)
      for (const [name, left] of stack) {
        if (left < 0) problems.push(`hand ${i}: ${name} bet more than the stack\n${text}`)
        const saysAllIn = text.split('\n').some(l => l.startsWith(`${name}: `) && l.endsWith(' and is all-in'))
        if (saysAllIn !== (left === 0)) problems.push(`hand ${i}: all-in suffix wrong for ${name}\n${text}`)
      }
      if (/[♠♥♦♣]|ALL-IN|raises to|---/.test(text)) problems.push(`hand ${i}: app wording leaked\n${text}`)
      if (text.includes('*** SHOW DOWN ***') === text.includes('doesn\'t show hand')) problems.push(`hand ${i}: showdown section wrong\n${text}`)
    })
    expect(problems.slice(0, 2).join('\n\n')).toBe('')

    const ids = texts.map(t => t.match(/^PokerStars Hand #(\d+):/)![1])
    expect(new Set(ids).size).toBe(300)
  }, 60_000)
})
