/**
 * River defense must respond to bet size. Round 8 measured a flat ~45%
 * defense against every size from 1/3 pot to 1.5x pot, against a minimum
 * defense frequency running 75% -> 40%; betting small on every river the
 * baseline would check was worth +18 bb/100 to a scripted hero.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, type BotProfile } from '../app/utils/botDecision'
import { bestHand } from '../app/utils/handAnalysis'
import { mulberry32 } from '../app/utils/rng'
import type { Card, Suit } from '../app/utils/cards'
import config from '../holdem.config'

const BB = 2
const LINEUP = ['Tennifer Jilly', 'Krynn Benney', 'Hill Phellmuth', 'Mhris Coneymaker',
  'Entonio Asfandiari', 'Naniel Degreanu', 'Aatrik Pantonius', 'Solid Sam', 'Ihil Pvey']

const profileOf = (name: string): BotProfile => {
  const p = config.personas.find(x => x.name === name)!
  return {
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq,
    creativeFreq: p.creativeFreq, threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
    fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq, limpFreq: p.limpFreq,
    styleBias: p.styleBias, betSizeMult: p.betSizeMult, overbetFreq: p.overbetFreq,
  }
}

function deck(rng: () => number): Card[] {
  const d: Card[] = []
  for (const s of ['hearts', 'diamonds', 'clubs', 'spades'] as Suit[]) {
    for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s })
  }
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j]!, d[i]!] }
  return d
}

type Cls = 'air' | 'pair<top' | 'top pair' | 'two pair+'
const classify = (hole: [Card, Card], board: Card[]): Cls => {
  const r = bestHand(hole, board)!
  if (r.rank >= 2) return 'two pair+'
  if (r.rank !== 1) return 'air'
  const boardMax = Math.max(...board.map(x => x.rank))
  return (r.score[1]! >= boardMax && hole.some(x => x.rank === r.score[1])) ? 'top pair' : 'pair<top'
}

/** Heads-up river, bot checked and now faces `frac` x pot. Returns defense rates. */
function riverDefense(frac: number, n = 18000) {
  const stat: Record<Cls, { n: number; def: number }> = {
    'air': { n: 0, def: 0 }, 'pair<top': { n: 0, def: 0 }, 'top pair': { n: 0, def: 0 }, 'two pair+': { n: 0, def: 0 },
  }
  for (const name of LINEUP) {
    const rng = mulberry32(4)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const hole: [Card, Card] = [d[0]!, d[1]!]
      const board = d.slice(2, 7)
      const pot = 30 * BB
      const bet = Math.round(pot * frac)
      const a = decideBotAction(profileOf(name), {
        street: 'river', toCall: bet, pot: pot + bet, currentBet: bet, playerBet: 0,
        chips: 85 * BB, bb: BB, numActivePlayers: 2, position: 'BB',
        holeCards: hole, community: board, checkedThisStreet: true,
        streetHistory: { flop: 'call', turn: 'call' }, preflopCallers: 1, rng,
      })
      const s = stat[classify(hole, board)]
      s.n++
      if (a.type !== 'fold') s.def++
    }
  }
  const overall = (Object.values(stat).reduce((a, s) => a + s.def, 0)) / (Object.values(stat).reduce((a, s) => a + s.n, 0))
  return { overall, byClass: Object.fromEntries(Object.entries(stat).map(([k, v]) => [k, v.def / v.n])) as Record<Cls, number> }
}

// The shared `mdf` in botDecision.ts (used by isWithinMDF on the flop and
// turn) is `1 - potOdds`, computed from `pot` which already includes the
// bet being faced. That is a real quantity, but not textbook minimum
// defense frequency, and it compresses far less across bet sizes than
// true defense frequency does (~22% from a third-pot bet to a 1.5x-pot
// overbet, vs. true MDF's ~47%). A first fix anchored the river rules to
// that shared `mdf` and could not simultaneously defend small bets enough
// and overbets little enough — proven unsatisfiable by exhaustive sweep.
// The river block (only — flop/turn still use the shared `mdf`, unchanged,
// since they are not leaking and re-deriving their behavior is a separate,
// separately verified round) now computes true defense frequency locally
// instead, from bettor indifference: `riverMdf = (pot - toCall -
// playerBet) / pot / mdfDefenders` (see its definition in
// botDecision.ts for the full derivation). That restores the full ~47%
// compression, so these bands are back to (approximately) the textbook-MDF
// shape the original brief intended — this is not a coincidence, it's the
// fix working. If the shared `mdf` is ever corrected the same way, these
// bands should still hold; if `riverMdf`'s formula changes, re-derive them.
describe('river defense scales with bet size', () => {
  const third = riverDefense(0.33)
  const pot = riverDefense(1.0)
  const over = riverDefense(1.5)

  it('defends far more against a third-pot bet than against a pot-sized bet', () => {
    expect(third.overall).toBeGreaterThan(pot.overall + 0.08)
  })

  it('overall defense lands in the MDF-anchored band at each size', () => {
    expect(third.overall).toBeGreaterThan(0.58)
    expect(third.overall).toBeLessThan(0.70)
    expect(pot.overall).toBeGreaterThan(0.42)
    expect(pot.overall).toBeLessThan(0.58)
    expect(over.overall).toBeGreaterThan(0.33)
    expect(over.overall).toBeLessThan(0.48)
  })

  it('is monotone non-increasing in bet size', () => {
    expect(pot.overall).toBeLessThanOrEqual(third.overall)
    expect(over.overall).toBeLessThanOrEqual(pot.overall)
  })

  it('top pair calls a small bet and folds enough to a big one', () => {
    expect(third.byClass['top pair']).toBeGreaterThan(0.85)
    expect(over.byClass['top pair']).toBeLessThan(0.65)
  })

  it('air still folds and monsters still continue', () => {
    expect(third.byClass['air']).toBeLessThan(0.10)
    expect(third.byClass['two pair+']).toBeGreaterThan(0.65)
  })
})

/** Heads-up river, bot is checked to in position as the non-raiser. */
function riverBetRate(name: string, n = 4000) {
  const stat: Record<Cls, { n: number; bet: number }> = {
    'air': { n: 0, bet: 0 }, 'pair<top': { n: 0, bet: 0 }, 'top pair': { n: 0, bet: 0 }, 'two pair+': { n: 0, bet: 0 },
  }
  const rng = mulberry32(5)
  for (let i = 0; i < n; i++) {
    const d = deck(rng)
    const hole: [Card, Card] = [d[0]!, d[1]!]
    const board = d.slice(2, 7)
    const a = decideBotAction(profileOf(name), {
      street: 'river', toCall: 0, pot: 30 * BB, currentBet: 0, playerBet: 0,
      chips: 85 * BB, bb: BB, numActivePlayers: 2, position: 'BTN',
      holeCards: hole, community: board,
      streetHistory: { flop: 'call', turn: 'call' }, preflopCallers: 1, rng,
    })
    const s = stat[classify(hole, board)]
    s.n++
    if (a.type === 'raise') s.bet++
  }
  return Object.fromEntries(Object.entries(stat).map(([k, v]) => [k, v.bet / Math.max(v.n, 1)])) as Record<Cls, number>
}

describe('river bluffs fire at the persona rate', () => {
  it('an aggressive persona bluffs air on the river', () => {
    const twan = riverBetRate('Dom Twan')
    expect(twan['air']).toBeGreaterThan(0.05)
    expect(twan['air']).toBeLessThan(config.strategy.river.maxBluffRate)
  })

  it('a tight persona bluffs far less than an aggressive one', () => {
    expect(riverBetRate('Tight Tony')['air']).toBeLessThan(riverBetRate('Dom Twan')['air'])
  })

  it('bluffs stay a minority of river bets (value still dominates)', () => {
    const sam = riverBetRate('Solid Sam')
    expect(sam['air']).toBeLessThan(sam['two pair+'] * 0.5)
  })

  it('a missed draw on the river is air, not a made hand', () => {
    // 4 hearts on board + 2 hearts... no: hole cards make a 4-flush that never got there
    const hole: [Card, Card] = [{ rank: 12, suit: 'hearts' }, { rank: 11, suit: 'hearts' }]
    const board: Card[] = [
      { rank: 9, suit: 'hearts' }, { rank: 4, suit: 'hearts' }, { rank: 2, suit: 'clubs' },
      { rank: 7, suit: 'spades' }, { rank: 3, suit: 'diamonds' },
    ]
    // Facing a pot-sized river bet with queen-high and a busted flush draw:
    // this must fold essentially always.
    let folds = 0
    const rng = mulberry32(9)
    for (let i = 0; i < 2000; i++) {
      const a = decideBotAction(profileOf('Solid Sam'), {
        street: 'river', toCall: 60, pot: 120, currentBet: 60, playerBet: 0,
        chips: 170, bb: BB, numActivePlayers: 2, position: 'BB',
        holeCards: hole, community: board, checkedThisStreet: true,
        streetHistory: { flop: 'call', turn: 'call' }, preflopCallers: 1, rng,
      })
      if (a.type === 'fold') folds++
    }
    expect(folds / 2000).toBeGreaterThan(0.90)
  })
})
