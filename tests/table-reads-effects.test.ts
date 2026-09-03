/**
 * Each table read moves exactly one knob by its configured factor, and a
 * context with no read (or all-false reads) is byte-identical to today.
 * Frequencies are measured over seeded decisions; bands are ±25% of the
 * expected ratio, which is far outside sampling noise at 6,000 samples.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction } from '../app/utils/botDecision'
import type { DecisionContext, BotProfile } from '../app/utils/botDecision'
import { mulberry32 } from '../app/utils/rng'
import type { Card } from '../app/utils/cards'
import config from '../holdem.config'

const cfg = config.strategy.tableReads
const N = 6000
const profile: BotProfile = { vpip: 0.25, pfr: 0.2, aggression: 1.2, bluffFreq: 0.18, creativeFreq: 0.08 }
// Aggressive persona: at this aggression, maybeThinValueRiver's uncapped base
// frequency alone already sits at/above the 0.6 cap, so it's the sharpest
// regression check for the tableMult-outside-the-cap fix (item 1).
const profileAggro: BotProfile = { ...profile, aggression: 1.5 }
const c = (rank: number, suit: Card['suit']): Card => ({ rank, suit })

function rate(make: (rng: () => number) => DecisionContext, pick: (a: { type: string }) => boolean, seedBase: number, p: BotProfile = profile): number {
  let hits = 0
  for (let i = 0; i < N; i++) if (pick(decideBotAction(p, make(mulberry32(seedBase + i)), 1))) hits++
  return hits / N
}
const isRaise = (a: { type: string }) => a.type === 'raise'
const STATION = { passive: true, showdownHeavy: true }
const NONE = { passive: false, showdownHeavy: false }

// River, checked to us, medium-strength made hand: top pair, weak kicker.
// Reaches maybeThinValueRiver (strength in [0.42, 0.55)) as the non-raiser.
// Kicker is 8 (not 5): top-pair-Kings strength is 0.38 + (kicker-2)/12*0.10,
// so an 8 kicker lands at 0.43 — inside the band. A 5 kicker lands at 0.405,
// just short of the 0.42 floor, so the branch is never reached.
const thinValueCtx = (rng: () => number, tableReads?: DecisionContext['tableReads']): DecisionContext => ({
  street: 'river', toCall: 0, pot: 40, currentBet: 0, playerBet: 0, chips: 200, bb: 2,
  numActivePlayers: 2, raiseLevel: 0, position: 'BTN',
  holeCards: [c(13, 'spades'), c(8, 'diamonds')],
  community: [c(13, 'hearts'), c(9, 'clubs'), c(4, 'diamonds'), c(2, 'spades'), c(7, 'clubs')],
  wasPreflopRaiser: false, preflopCallers: 1, rng, tableReads,
})

// River, facing a half-pot bet with nothing: the bluff-raise line.
const bluffRaiseCtx = (rng: () => number, tableReads?: DecisionContext['tableReads']): DecisionContext => ({
  street: 'river', toCall: 20, pot: 60, currentBet: 20, playerBet: 0, chips: 200, bb: 2,
  numActivePlayers: 2, raiseLevel: 0, position: 'BTN',
  holeCards: [c(8, 'spades'), c(6, 'diamonds')],
  community: [c(13, 'hearts'), c(11, 'clubs'), c(4, 'diamonds'), c(2, 'spades'), c(10, 'clubs')],
  wasPreflopRaiser: false, preflopCallers: 1, rng, tableReads,
})

// Turn, in position, checked to us, air, not the preflop raiser: the IP probe.
const probeCtx = (rng: () => number, tableReads?: DecisionContext['tableReads']): DecisionContext => ({
  street: 'turn', toCall: 0, pot: 30, currentBet: 0, playerBet: 0, chips: 200, bb: 2,
  numActivePlayers: 2, raiseLevel: 0, position: 'BTN',
  holeCards: [c(8, 'spades'), c(6, 'diamonds')],
  community: [c(13, 'hearts'), c(11, 'clubs'), c(4, 'diamonds'), c(2, 'spades')],
  wasPreflopRaiser: false, preflopCallers: 1, rng, tableReads,
})


describe('table reads move exactly the configured knobs', () => {
  it('no read and all-false reads are byte-identical to an absent field', () => {
    for (let i = 0; i < 300; i++) {
      const a = decideBotAction(profile, thinValueCtx(mulberry32(500 + i)), 1)
      const b = decideBotAction(profile, thinValueCtx(mulberry32(500 + i), NONE), 1)
      expect(b).toEqual(a)
      const d = decideBotAction(profile, probeCtx(mulberry32(900 + i)), 1)
      const e = decideBotAction(profile, probeCtx(mulberry32(900 + i), NONE), 1)
      expect(e).toEqual(d)
    }
  })

  it('station table: river thin value rises by thinValueBoost', () => {
    const base = rate(r => thinValueCtx(r), isRaise, 10_000)
    const boosted = rate(r => thinValueCtx(r, STATION), isRaise, 10_000)
    expect(base).toBeGreaterThan(0.05)                       // the branch is actually reached
    expect(boosted / base).toBeGreaterThan(cfg.thinValueBoost * 0.75)
    expect(boosted / base).toBeLessThan(cfg.thinValueBoost * 1.25)
  })

  it('station table: river thin value still rises by ~thinValueBoost at higher aggression (1.5)', () => {
    // Regression for item 1: at aggression 1.5 the uncapped base frequency
    // (0.35 * 1.15 * 1.5 = 0.604) already sits at the 0.6 cap on its own, so
    // pre-fix (tableMult inside Math.min) both the base and boosted rates
    // collapse to the same 0.6 ceiling — ratio ≈ 1.00, not ≈ 1.4.
    const base = rate(r => thinValueCtx(r), isRaise, 70_000, profileAggro)
    const boosted = rate(r => thinValueCtx(r, STATION), isRaise, 70_000, profileAggro)
    expect(base).toBeGreaterThan(0.05)
    expect(boosted / base).toBeGreaterThan(cfg.thinValueBoost * 0.75)
    expect(boosted / base).toBeLessThan(cfg.thinValueBoost * 1.25)
  })

  it('station table: river bluff-raises fall to riverBluffPenalty', () => {
    const base = rate(r => bluffRaiseCtx(r), isRaise, 20_000)
    const cut = rate(r => bluffRaiseCtx(r, STATION), isRaise, 20_000)
    expect(base).toBeGreaterThan(0.02)
    expect(cut / base).toBeGreaterThan(cfg.riverBluffPenalty * 0.6)
    expect(cut / base).toBeLessThan(cfg.riverBluffPenalty * 1.4)
  })



  it('a station read does not touch probe bets', () => {
    // Identical seeds replay identical rng trajectories whenever the applied
    // multiplier is exactly 1.0 (no probe multiplier exists any more), so this
    // is an exact-equality check, not a statistical one: a station read that
    // leaked into the probe branch would desync the two trajectories.
    const probeBase = rate(r => probeCtx(r), isRaise, 40_000)
    expect(rate(r => probeCtx(r, STATION), isRaise, 40_000)).toBe(probeBase)
  })
})
