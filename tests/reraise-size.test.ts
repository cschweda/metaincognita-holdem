/**
 * Defense against re-raises must scale with size. Round 8 measured an
 * identical fold/call/4-bet mix (81/17/2) against every 3-bet from 7.5bb to
 * 60bb, so 3-betting premiums huge and jamming any flop was free money.
 * Opens already had this penalty; re-raises did not.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, type BotProfile } from '../app/utils/botDecision'
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

/** Opened to 2.5bb from the button with 100bb; now faces a 3-bet to `toBB`. */
function vs3Bet(toBB: number, n = 18000) {
  let cont = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(1)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: (toBB - 2.5) * BB, pot: (toBB + 4) * BB,
        currentBet: toBB * BB, playerBet: 2.5 * BB, chips: 97.5 * BB, bb: BB,
        numActivePlayers: 3, raiseLevel: 2, position: 'BTN', holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
  }
  return cont / total
}

/** 3-bet to 9bb, now facing a 4-bet to `toBB`. */
function vs4Bet(toBB: number, n = 18000) {
  let cont = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(2)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: (toBB - 9) * BB, pot: (toBB + 11) * BB,
        currentBet: toBB * BB, playerBet: 9 * BB, chips: 91 * BB, bb: BB,
        numActivePlayers: 2, raiseLevel: 3, position: 'BTN', holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
  }
  return cont / total
}

describe('defense vs 3-bets scales with size', () => {
  it('a standard 3-bet is defended much wider than a huge one', () => {
    expect(vs3Bet(9)).toBeGreaterThan(vs3Bet(25) + 0.05)
  })

  it('continue rate is monotone non-increasing from 9bb to 60bb', () => {
    // Correction (implementer, 2026-09-06): the brief calls this as
    // `.map(vs3Bet)`, but Array.prototype.map invokes its callback as
    // (element, index, array) and vs3Bet's second parameter `n` defaults to
    // 18000 only when the argument is undefined — map's index (0,1,2,3,4)
    // overrides it. That drove the first two sizes to 0 and ~1/9 hands
    // (cont/total = 0/0 = NaN), so the assertion never compared real sample
    // sizes. Wrapping in an arrow forces every size to run the intended
    // 18000-hand sample.
    const r = [9, 15, 25, 40, 60].map(v => vs3Bet(v))
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeLessThanOrEqual(r[i - 1]! + 0.005)
  })

  it('a standard-size 3-bet still gets a real defense (not a nit fold)', () => {
    expect(vs3Bet(9)).toBeGreaterThan(0.14)
  })

  it('a 50bb 3-bet is jam-like and gets a premium-only continue', () => {
    expect(vs3Bet(50)).toBeLessThan(0.05)
  })
})

describe('defense vs 4-bets scales with size', () => {
  it('a standard 4-bet is defended wider than a huge one', () => {
    expect(vs4Bet(22)).toBeGreaterThan(vs4Bet(60))
  })

  it('a standard 4-bet still gets its configured continue range', () => {
    expect(vs4Bet(22)).toBeGreaterThan(0.02)
  })
})

describe('jam-like threshold', () => {
  it('is 45% of stack', () => {
    expect(config.strategy.preflop.jamToCallStackRatio).toBe(0.45)
  })
})

/** In the big blind facing an open to `toBB` from the cutoff, no callers. */
function bbDefense(toBB: number, n = 18000) {
  let cont = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(5)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: (toBB - 1) * BB, pot: (toBB + 1.5) * BB,
        currentBet: toBB * BB, playerBet: BB, chips: 99 * BB, bb: BB,
        numActivePlayers: 4, raiseLevel: 1, position: 'BB', holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
  }
  return cont / total
}

describe('big blind defends small opens', () => {
  it('defends a 2.5bb open at a realistic rate', () => {
    const d = bbDefense(2.5)
    expect(d).toBeGreaterThan(0.20)
    expect(d).toBeLessThan(0.40)
  })

  it('defends less as the open gets bigger', () => {
    expect(bbDefense(2.5)).toBeGreaterThan(bbDefense(5))
    expect(bbDefense(5)).toBeGreaterThan(bbDefense(8))
  })

  it('the boost is fully faded out by 6bb', () => {
    expect(bbDefense(8)).toBeLessThan(0.14)
  })

  it('does not leak into other positions', () => {
    let cont = 0, total = 0
    const rng = mulberry32(6)
    for (let i = 0; i < 6000; i++) {
      const d = deck(rng)
      const a = decideBotAction(profileOf('Solid Sam'), {
        street: 'preflop', toCall: 2.5 * BB, pot: 4 * BB, currentBet: 2.5 * BB, playerBet: 0,
        chips: 100 * BB, bb: BB, numActivePlayers: 4, raiseLevel: 1, position: 'MP',
        holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
    expect(cont / total).toBeLessThan(0.20)
  })
})
