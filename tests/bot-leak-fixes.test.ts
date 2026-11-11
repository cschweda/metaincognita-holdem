/**
 * Bot leaks from the 2026-11-11 review, each pinned by a static frequency
 * test (Solid Sam's profile, seeded rng, no misplays):
 *
 *  - Stacking off to overbets: the stack-to-pot ratio counted the bet being
 *    faced as pot, so any big overbet read as "pot-committed" — top pair
 *    called a 16x-pot shove 100% of the time, and two pair+ never folded on
 *    any board. A hero shoving flop/turn with two pair+ won +18 bb/100.
 *  - A paired board turned air into "a pair".
 *  - Postflop position came from the seat label, not from who is left.
 *  - The hero's bet-sizing tell was applied to other bots' bets, and the
 *    tracked fold-to-c-bet number was never read.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, type BotProfile, type DecisionContext, type HeroProfile } from '../app/utils/botDecision'
import { mulberry32 } from '../app/utils/rng'
import type { Card, Suit } from '../app/utils/cards'
import config from '../holdem.config'

const BB = 2
const sam = config.personas.find(x => x.name === 'Solid Sam')!
const SAM: BotProfile = {
  vpip: sam.vpip, pfr: sam.pfr, aggression: sam.aggression, bluffFreq: sam.bluffFreq,
  creativeFreq: sam.creativeFreq, threeBetFreq: sam.threeBetFreq, fourBetFreq: sam.fourBetFreq,
  fiveBetFreq: sam.fiveBetFreq, donkBetFreq: sam.donkBetFreq, limpFreq: sam.limpFreq,
  styleBias: sam.styleBias, betSizeMult: sam.betSizeMult, overbetFreq: sam.overbetFreq,
}

const SUITS: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }
const RANKS = '23456789TJQKA'
const cards = (s: string): Card[] => s.split(' ').map(x => ({ rank: RANKS.indexOf(x[0]!) + 2, suit: SUITS[x[1]!]! }))
const streetOf = (n: number) => (n === 3 ? 'flop' : n === 4 ? 'turn' : 'river') as DecisionContext['street']

interface Spot {
  hole: string; board: string
  potBefore: number // pot before the bet being faced
  bet?: number      // bet faced (0 / omitted = checked to)
  chips?: number
  extra?: Partial<DecisionContext>
  hero?: HeroProfile
}
function freq(s: Spot, n = 3000) {
  const rng = mulberry32(4242)
  const board = cards(s.board)
  const chips = s.chips ?? 198
  const bet = Math.min(s.bet ?? 0, chips)
  const out = { fold: 0, check: 0, call: 0, raise: 0 }
  for (let i = 0; i < n; i++) {
    const a = decideBotAction(SAM, {
      street: streetOf(board.length), toCall: bet, pot: s.potBefore + bet, currentBet: bet, playerBet: 0,
      chips, bb: BB, numActivePlayers: 2, position: 'BB',
      holeCards: cards(s.hole) as [Card, Card], community: board, rng, ...s.extra,
    }, undefined, s.hero)
    out[a.type]++
  }
  return { fold: out.fold / n, check: out.check / n, call: out.call / n, raise: out.raise / n, continue: (out.call + out.raise) / n }
}

describe('overbets do not read as pot commitment', () => {
  it('top pair, weak kicker mostly folds to a 10x-pot flop shove', () => {
    expect(freq({ hole: 'Ks Td', board: 'Kh 7c 2d', potBefore: 20, bet: 198 }).continue).toBeLessThan(0.45)
  })
  it('…and on the turn', () => {
    expect(freq({ hole: 'Ks Td', board: 'Kh 7c 2d 4s', potBefore: 20, bet: 198 }).continue).toBeLessThan(0.45)
  })
  it('still continues against a normal flop bet', () => {
    expect(freq({ hole: 'Ks Td', board: 'Kh 7c 2d', potBefore: 20, bet: 13 }).continue).toBeGreaterThan(0.9)
  })
  it('still gets it in when the pot really is bigger than the stack', () => {
    expect(freq({ hole: 'Ks Td', board: 'Kh 7c 2d', potBefore: 150, bet: 100, chips: 100 }).continue).toBeGreaterThan(0.9)
  })
  it('folds more top pair the bigger the flop overbet', () => {
    const at = (bet: number) => freq({ hole: 'Ks Td', board: 'Kh 7c 2d', potBefore: 20, bet }).continue
    expect(at(40)).toBeGreaterThan(at(100))
    expect(at(100)).toBeGreaterThan(at(198))
  })
  it('bottom two pair does not always call a 10x-pot shove, but calls 2x pot', () => {
    expect(freq({ hole: '7s 2s', board: 'Kh 7c 2d', potBefore: 20, bet: 198 }).continue).toBeLessThan(0.65)
    expect(freq({ hole: '7s 2s', board: 'Kh 7c 2d', potBefore: 20, bet: 40 }).continue).toBeGreaterThan(0.9)
  })
  it('a set never folds on a dry board', () => {
    expect(freq({ hole: '7s 7h', board: 'Kh 7c 2d', potBefore: 20, bet: 198 }).fold).toBe(0)
  })
})

describe('made hands are read against the board', () => {
  it('a set is not a monster on a four-flush, four-straight board', () => {
    expect(freq({ hole: '7s 7h', board: '7d 8c 9c Tc 2c', potBefore: 40, bet: 40 }).continue).toBeLessThan(0.85)
  })
  it('a baby flush on a four-flush board can fold; the nut flush cannot', () => {
    expect(freq({ hole: '3c Kd', board: 'Ac 9c 6c Jc 2h', potBefore: 40, bet: 40 }).continue).toBeLessThan(0.9)
    expect(freq({ hole: 'Kc 3d', board: 'Ac 9c 6c Jc 2h', potBefore: 40, bet: 40 }).fold).toBe(0)
  })
  it('a two-card flush on a three-flush board is still a monster', () => {
    expect(freq({ hole: '5c 3c', board: 'Ac 9c 6c Jd 2h', potBefore: 40, bet: 40 }).fold).toBe(0)
  })
})

describe('a pair on the board is not a pair in the hand', () => {
  it('air on a paired river folds to a pot-size bet', () => {
    expect(freq({ hole: '3c 2d', board: 'Kh Ks 7d 4c 9s', potBefore: 40, bet: 40 }).continue).toBeLessThan(0.08)
  })
  it('…and can bluff when checked to', () => {
    expect(freq({ hole: '3c 2d', board: 'Kh Ks 7d 4c 9s', potBefore: 40 }).raise).toBeGreaterThan(0.02)
  })
  it('a real pair on a paired board is still a made hand', () => {
    expect(freq({ hole: '7c 2d', board: 'Kh Ks 7d 4c 9s', potBefore: 40, bet: 13 }).continue).toBeGreaterThan(0.4)
  })
  it('the preflop raiser c-bets air about as often on K-K-2 as on K-J-2', () => {
    const cbet = (board: string) => freq({ hole: '6c 5d', board, potBefore: 14, extra: { wasPreflopRaiser: true } }).raise
    expect(cbet('Kh Ks 2d')).toBeLessThan(cbet('Kh Js 2d') * 1.6)
  })
})

describe('position is who acts last, not the seat label', () => {
  // A float (calling a flop bet with nothing) is the clearest position-only play.
  const float = (extra: Partial<DecisionContext>) =>
    freq({ hole: '6c 5d', board: 'Kh Js 2d', potBefore: 20, bet: 8, extra }).call
  it('a button with a live player behind is out of position', () => {
    expect(float({ position: 'BTN', inPosition: false })).toBeLessThan(float({ position: 'BTN' }) - 0.02)
  })
  it('a big blind closing the action is in position', () => {
    expect(float({ position: 'BB', inPosition: true })).toBeGreaterThan(float({ position: 'BB' }) + 0.02)
  })
})

describe('reads on the hero apply to the hero', () => {
  const neutral: HeroProfile = { vpip: 0.25, foldTo3Bet: 0.5, foldToCbet: 0.5, aggression: 1.0, handsTracked: 30 }
  const tell: HeroProfile = {
    ...neutral,
    betSizingTell: { hasTell: true, bigWithValue: true, strongAvgSizing: 0.5, weakAvgSizing: 0.3 },
  }
  const spot: Spot = { hole: 'Ks Td', board: 'Kh 7c 2d 4s 9h', potBefore: 40, bet: 40 }

  it('uses the sizing tell against a bet the hero made', () => {
    expect(freq({ ...spot, hero: tell, extra: { facingHeroBet: true } }).continue)
      .toBeLessThan(freq({ ...spot, hero: neutral }).continue - 0.05)
  })
  it('ignores the sizing tell when another bot made the bet', () => {
    expect(freq({ ...spot, hero: tell, extra: { facingHeroBet: false } }))
      .toEqual(freq({ ...spot, hero: neutral, extra: { facingHeroBet: false } }))
  })

  const cbetAir = (foldToCbet: number) => freq({
    hole: '6c 5d', board: 'Kh Js 2d', potBefore: 14,
    extra: { wasPreflopRaiser: true }, hero: { ...neutral, foldToCbet, cbetsFaced: 12 },
  }).raise
  it('c-bets air more against a hero who folds to c-bets, less against one who never does', () => {
    expect(cbetAir(0.9)).toBeGreaterThan(cbetAir(0.5) + 0.03)
    expect(cbetAir(0.1)).toBeLessThan(cbetAir(0.5) - 0.03)
  })
  it('needs a sample of c-bets faced before it adjusts', () => {
    const few = freq({
      hole: '6c 5d', board: 'Kh Js 2d', potBefore: 14,
      extra: { wasPreflopRaiser: true }, hero: { ...neutral, foldToCbet: 1, cbetsFaced: 2 },
    }).raise
    expect(few).toBe(cbetAir(0.5))
  })
})

describe('preflop', () => {
  const vsOpenJam = (hole: string) => {
    const rng = mulberry32(7)
    let fold = 0
    for (let i = 0; i < 500; i++) {
      const a = decideBotAction(SAM, {
        street: 'preflop', toCall: 200, pot: 203, currentBet: 200, playerBet: 0, chips: 200, bb: BB,
        numActivePlayers: 6, raiseLevel: 1, position: 'BTN', holeCards: cards(hole) as [Card, Card], rng,
      })
      if (a.type === 'fold') fold++
    }
    return fold / 500
  }
  it('kings call a 100bb open jam', () => {
    expect(vsOpenJam('Ks Kd')).toBe(0)
    expect(vsOpenJam('As Ad')).toBe(0)
  })
  it('queens still fold to it', () => {
    expect(vsOpenJam('Qs Qd')).toBeGreaterThan(0.9)
  })
})

describe('opening ranges widen toward the button', () => {
  // First in, six-handed, 100bb: how often does Solid Sam open from each seat?
  const openRate = (position: string) => {
    const rng = mulberry32(99)
    const d: Card[] = []
    for (const s of Object.values(SUITS)) for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s })
    let opens = 0
    const n = 6000
    for (let i = 0; i < n; i++) {
      const a = Math.floor(rng() * 52)
      let b = Math.floor(rng() * 51)
      if (b >= a) b++
      const act = decideBotAction(SAM, {
        street: 'preflop', toCall: BB, pot: 3, currentBet: BB, playerBet: 0, chips: 200, bb: BB,
        numActivePlayers: 6, raiseLevel: 0, position, holeCards: [d[a]!, d[b]!], rng,
      })
      if (act.type === 'raise') opens++
    }
    return opens / n
  }
  it('the button opens at least 15 points wider than under the gun', () => {
    const utg = openRate('UTG'), co = openRate('CO'), btn = openRate('BTN')
    expect(utg).toBeLessThan(0.19)
    expect(co).toBeGreaterThan(utg + 0.07)
    expect(btn).toBeGreaterThan(utg + 0.15)
    expect(btn).toBeLessThan(0.45)
  })
})

describe('a draw needs one of the bot\'s own cards', () => {
  it('no club in hand is not a flush draw on a four-club turn', () => {
    // 6d 5h on Kc 9c 2c Jc: nothing — the next club makes everyone's flush.
    // A half-pot bet should mostly be folded, not called as a "draw".
    expect(freq({ hole: '6d 5h', board: 'Kc 9c 2c Jc', potBefore: 40, bet: 20 }).continue).toBeLessThan(0.25)
  })
  it('a real flush draw still continues', () => {
    expect(freq({ hole: 'Ac 5c', board: 'Kc 9c 2h Js', potBefore: 40, bet: 20 }).continue).toBeGreaterThan(0.6)
  })
})
