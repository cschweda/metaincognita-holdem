/**
 * Short-stack play. Round 8 measured pure push/fold from 25bb down: bots
 * open-jammed 18-26% and folded everything else, never opening small and
 * never calling, and they reused the shove range as the jam-CALLING range.
 * Push/fold now starts at 12bb; between 12bb and 25bb the normal logic runs
 * with a commit rule, and jam calls are priced off the jam's size.
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

/** First to act at `stackBB`, facing only the big blind, from `pos`. */
function openMix(stackBB: number, pos = 'BTN', n = 18000) {
  let fold = 0, limp = 0, jamOpen = 0, small = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(3)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const chips = stackBB * BB
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: BB, pot: 1.5 * BB, currentBet: BB, playerBet: 0,
        chips, bb: BB, numActivePlayers: 6, raiseLevel: 0, position: pos,
        holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type === 'fold') fold++
      else if (a.type === 'call') limp++
      else if ((a.amount ?? 0) >= chips) jamOpen++
      else small++
    }
  }
  return { fold: fold / total, limp: limp / total, jamOpen: jamOpen / total, small: small / total }
}

/** Continue rate facing an all-in of `jamBB` with `stackBB` behind. `raiseLevel`
 *  defaults to 1 (an open-jam); pass 2 for a jam over someone else's raise. */
function jamCallRate(stackBB: number, jamBB: number, raiseLevel = 1, n = 18000) {
  let cont = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(7)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const chips = stackBB * BB
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: Math.min(jamBB, stackBB) * BB, pot: (jamBB + 1.5) * BB,
        currentBet: jamBB * BB, playerBet: 0, chips, bb: BB, numActivePlayers: 4,
        raiseLevel, position: 'BB', holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
  }
  return cont / total
}

describe('push/fold band', () => {
  it('a 24bb stack opens by raising, not by shoving', () => {
    const m = openMix(24)
    expect(m.jamOpen).toBeLessThan(0.02)
    expect(m.small).toBeGreaterThan(0.15)
  })

  // Correction (dispatcher, 2026-09-05): the brief called this with
  // pushFoldBB itself, but the branch below is a strict less-than, so a
  // stack sitting exactly AT the threshold has already left push/fold mode
  // and plays the normal band instead — test one chip below it.
  it('a stack below pushFoldBB is in push/fold mode', () => {
    const m = openMix(config.strategy.preflop.pushFoldBB - 1)
    expect(m.jamOpen).toBeGreaterThan(0.15)
    expect(m.small).toBeLessThan(0.02)
  })

  it('late position shoves wider than early position at 10bb', () => {
    expect(openMix(10, 'BTN').jamOpen).toBeGreaterThan(openMix(10, 'UTG').jamOpen)
  })

  it('there is no behavior cliff at exactly 25bb', () => {
    const under = openMix(24.9)
    const at = openMix(25)
    expect(Math.abs(under.jamOpen - at.jamOpen)).toBeLessThan(0.05)
    expect(Math.abs(under.small - at.small)).toBeLessThan(0.10)
  })
})

describe('jam calls are priced off the jam size', () => {
  // Correction (dispatcher, 2026-09-05): the brief called these with a
  // 12bb jam into a 30bb stack, but that trips neither jam-like trigger —
  // 12bb is under the 15bb jamOpenBBThreshold, and 12/30 is under the 0.6
  // jamToCallStackRatio — so the widening this task adds would never fire
  // and these tests would pass against unmodified code. 16bb clears both
  // triggers while staying inside the widening band (below 25bb); 25bb
  // sits right at the band's edge, so it's a clean, un-widened control.
  it('calls a 16bb jam wider than a 25bb jam', () => {
    expect(jamCallRate(30, 16)).toBeGreaterThan(jamCallRate(30, 25))
  })

  it('a short jam still gets a disciplined range, not a station call', () => {
    expect(jamCallRate(30, 16)).toBeLessThan(0.18)
  })

  it('a 100bb open-jam is still premium-only', () => {
    expect(jamCallRate(100, 100)).toBeLessThan(0.03)
  })

  // Discovered during this task, not in the original brief: a bot facing a
  // JAM OVER SOMEONE ELSE'S RAISE (raiseLevel>=2) needs the same size-based
  // widening as a bot facing an open-jam. Before this task, a raise between
  // pushFoldBB and 25bb was itself always a full shove, so "someone opened
  // small at a short stack, then got jammed on" could never happen. Once
  // small opens exist there (the push/fold band above), that scenario is
  // common, and the pre-existing raiseLevel>=2 defense (reraiseJamFloor,
  // above) saturates at a flat, deep-stack-sized ~4% continue range for any
  // jamBB from ~15-20 down to pushFoldBB — it never gets any wider as the
  // jam gets shorter, so it under-defends exactly the newly-reachable short
  // opens. Gating the widening to raiseLevel<=1 only (as originally
  // implemented) measured open-jam and 3bet-jam both above +40bb/100 at
  // 25bb: any-two shoving over a short stack's tiny open printed money
  // because the field folded roughly 96% of the time. The widening above is
  // therefore keyed on jam size alone, not raiseLevel. Measured directly:
  // a 20bb reraise-jam into a 30bb stack continues 4.85% of the time gated
  // to raiseLevel<=1, 7.05% widened regardless of raiseLevel — the 0.06
  // bound below sits between the two and only the fix clears it.
  it('a short reraise-jam gets the same widening as a short open-jam', () => {
    expect(jamCallRate(30, 20, 2)).toBeGreaterThan(0.06)
  })
})

describe('commit rule', () => {
  it('a raise that would cost 40%+ of a 20bb stack goes all-in instead', () => {
    let raises = 0, allIns = 0
    const rng = mulberry32(11)
    for (let i = 0; i < 6000; i++) {
      const d = deck(rng)
      const chips = 20 * BB
      const a = decideBotAction(profileOf('Dom Twan'), {
        street: 'preflop', toCall: 3 * BB, pot: 5 * BB, currentBet: 3 * BB, playerBet: 0,
        chips, bb: BB, numActivePlayers: 4, raiseLevel: 1, position: 'BTN',
        holeCards: [d[0]!, d[1]!], rng,
      })
      if (a.type === 'raise') {
        raises++
        if ((a.amount ?? 0) >= chips) allIns++
      }
    }
    expect(raises).toBeGreaterThan(50)
    expect(allIns / raises).toBeGreaterThan(0.8)
  })

  it('does not apply at 100bb', () => {
    let raises = 0, allIns = 0
    const rng = mulberry32(11)
    for (let i = 0; i < 6000; i++) {
      const d = deck(rng)
      const chips = 100 * BB
      const a = decideBotAction(profileOf('Dom Twan'), {
        street: 'preflop', toCall: 3 * BB, pot: 5 * BB, currentBet: 3 * BB, playerBet: 0,
        chips, bb: BB, numActivePlayers: 4, raiseLevel: 1, position: 'BTN',
        holeCards: [d[0]!, d[1]!], rng,
      })
      if (a.type === 'raise') { raises++; if ((a.amount ?? 0) >= chips) allIns++ }
    }
    expect(allIns / raises).toBeLessThan(0.05)
  })
})
