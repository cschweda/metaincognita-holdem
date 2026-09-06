/**
 * River bluff discipline (Round 8 follow-up).
 *
 * Origin: Ihil Pvey (tiltMultiplier 0.3, donkBetFreq 0) led the river for
 * ~88% of a 17bb stack with king-high from the small blind, leaving $4 (2bb)
 * behind, while the table showed him as FULL TILT. Investigation found four
 * independent defects, one test each:
 *
 *   1. Postflop bet sizes are pot fractions that never consult the stack, so a
 *      short stack bets itself down to an unplayable stub. `applyCommitRule`
 *      already encodes the fix but was wired only into the preflop path.
 *   2. The generic river block ignores position entirely — an OOP lead and an
 *      IP bet fired at identical frequency.
 *   3. The OOP donk discount is unreachable on the river. On the flop and turn
 *      a lead into the aggressor runs at 0.18 where the in-position probe runs
 *      at 0.40; both river blocks return before that section, so leading the
 *      river into the aggressor got no discount at all. (`donkBetFreq: 0`
 *      means "pro — use the rare fallback", not "never".)
 *   4. A big-pot loss pins severity at 1.0 regardless of tiltMultiplier, and
 *      the badge renders that raw number — so an untiltable persona reads
 *      FULL TILT while playing at 0.3 tilt.
 */
import { describe, it, expect } from 'vitest'
import {
  decideBotAction,
  applyTilt,
  createTiltState,
  effectiveTiltSeverity,
  type BotProfile,
  type DecisionContext,
} from '../app/utils/botDecision'
import type { Card } from '../app/utils/cards'
import { mulberry32 } from '../app/utils/rng'
import config from '../holdem.config'

const R: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 }
const S: Record<string, Card['suit']> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
const c = (x: string): Card => ({ rank: R[x[0]!] ?? parseInt(x[0]!, 10), suit: S[x[1]!]! })

const persona = (name: string) => (config as unknown as { personas: Record<string, number>[] })
  .personas.find(p => p.name as unknown as string === name)!

const profileOf = (name: string): BotProfile => {
  const p = persona(name) as unknown as Record<string, number>
  return {
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq,
    creativeFreq: p.creativeFreq, threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
    fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq, betSizeMult: p.betSizeMult,
  } as BotProfile
}

// The exact hand: 3h 4s 8s Th 7d, KcQc = king high, every draw bricked.
const BOARD = ['3h', '4s', '8s', 'Th', '7d'].map(c)
const KING_HIGH: [Card, Card] = [c('Kc'), c('Qc')]

function riverCtx(over: Partial<DecisionContext>): DecisionContext {
  return {
    street: 'river', toCall: 0, pot: 45, currentBet: 0, playerBet: 0,
    chips: 34, bb: 2, numActivePlayers: 2, position: 'SB',
    holeCards: KING_HIGH, community: BOARD,
    wasPreflopRaiser: true, preflopCallers: 1,
    streetHistory: { flop: 'bet', turn: 'check' },
    ...over,
  }
}

/** Runs the spot N times on distinct seeds; returns every raise it produced. */
function riverBets(profile: BotProfile, over: Partial<DecisionContext>, consistency = 1.0, n = 40000) {
  const bets: { total: number; chips: number }[] = []
  for (let i = 0; i < n; i++) {
    const ctx = riverCtx({ ...over, rng: mulberry32(i + 1) })
    const a = decideBotAction(profile, ctx, consistency)
    if (a.type === 'raise') bets.push({ total: a.amount ?? 0, chips: ctx.chips })
  }
  return { bets, n }
}

// ─── 1. Postflop bets respect the stack ────────────────────────

describe('a postflop bet never leaves an unplayable stub', () => {
  it('shoves rather than betting a short stack down to dust', () => {
    const { bets } = riverBets(profileOf('Ihil Pvey'), {})
    expect(bets.length).toBeGreaterThan(0) // spot must actually produce bets

    const stubs = bets.filter(b => {
      const left = b.chips - b.total
      return left > 0 && left <= 5 * 2 // 1–5bb behind
    })
    expect(stubs).toHaveLength(0)
  })

  it('leaves a deep stack alone — the rule is for committed stacks only', () => {
    const deep = riverBets(profileOf('Ihil Pvey'), { chips: 400 })
    const shoves = deep.bets.filter(b => b.total >= b.chips)
    expect(shoves).toHaveLength(0)
  })

  // The first cut of this rule fired on any leftover under a quarter of the
  // pot, which in a big 3-bet pot meant promoting a half-pot turn bet that
  // left 30bb behind. 30bb is a stack you can still fold or shove later, not
  // dust, and handing it to the pot reopened the prem3bet-25-fj composite
  // cell (+6.1 bb/100 against a bound of 4). Dust is absolute, not just
  // relative: the rule must leave a playable remainder alone.
  it('leaves a playable remainder alone in a big pot', () => {
    // pot 100 / stack 100 at 2bb — the depth a 3-bet pot reaches by the turn,
    // and the depth that reopened prem3bet-25-fj. A 55-75% bet leaves 10-21bb.
    // The ratio test alone calls that dust (it is under a quarter of the pot
    // the bet creates) and shoves 100 instead of betting 79; the BB floor is
    // what stops it, because 10-21bb is a stack you can still play.
    const { bets } = riverBets(profileOf('Ihil Pvey'), { pot: 100, chips: 100 })
    expect(bets.length).toBeGreaterThan(0)
    // Standard river sizing tops out at pot * 0.75 * betSizeMult = 79; anything
    // above that is a deliberate overbet, which legitimately clamps to all-in.
    const standard = bets.filter(b => b.total <= 85)
    expect(standard.length).toBeGreaterThan(0)
    expect(standard.filter(b => b.total >= b.chips)).toHaveLength(0)
  })
})

// ─── 2. The river knows about position ─────────────────────────

describe('river leads are rarer out of position', () => {
  it('bluffs the river less from the SB than from the BTN', () => {
    const p = profileOf('Ihil Pvey')
    const oop = riverBets(p, { position: 'SB' })
    const ip = riverBets(p, { position: 'BTN' })
    expect(oop.bets.length).toBeLessThan(ip.bets.length)
  })
})

// ─── 3. donkBetFreq reaches the river ──────────────────────────

describe('a river lead into the aggressor takes the donk discount', () => {
  it('leads the river OOP as the caller far less than it stabs as the aggressor', () => {
    const p = profileOf('Ihil Pvey')
    const donk = riverBets(p, {
      position: 'SB', wasPreflopRaiser: false, streetHistory: { flop: 'check', turn: 'check' },
    })
    const stab = riverBets(p, { position: 'SB', wasPreflopRaiser: true })
    // Flop/turn run the OOP donk at 0.18 against the IP probe's 0.40.
    expect(donk.bets.length).toBeLessThan(stab.bets.length * 0.6)
  })

  it('still stabs the river as the preflop aggressor — that is not a donk bet', () => {
    const { bets } = riverBets(profileOf('Ihil Pvey'), { position: 'SB', wasPreflopRaiser: true })
    expect(bets.length).toBeGreaterThan(0)
  })
})

// ─── 4. The tilt badge reflects the tilt the bot actually plays ─

describe('displayed tilt severity is scaled by tiltMultiplier', () => {
  it('an untiltable persona does not read FULL TILT off one big pot', () => {
    const tilt = createTiltState()
    tilt.tilted = true
    tilt.severity = 1.0 // what a big-pot loss pins it to
    const pvey = persona('Ihil Pvey') as unknown as Record<string, number>

    // The badge threshold in PlayerSeat.vue is >= 0.8 for FULL TILT.
    expect(effectiveTiltSeverity(tilt, pvey.tiltMultiplier)).toBeLessThan(0.8)
    expect(effectiveTiltSeverity(tilt, pvey.tiltMultiplier)).toBeGreaterThan(0)
  })

  it('a tilt-prone persona still reads FULL TILT', () => {
    const tilt = createTiltState()
    tilt.tilted = true
    tilt.severity = 1.0
    const mouth = persona('Mike the Mouth') as unknown as Record<string, number>
    expect(effectiveTiltSeverity(tilt, mouth.tiltMultiplier)).toBeGreaterThanOrEqual(0.8)
  })

  it('matches the multiplier applyTilt actually uses', () => {
    const tilt = createTiltState()
    tilt.tilted = true
    tilt.severity = 1.0
    const base = profileOf('Ihil Pvey')
    const tiltedProfile = applyTilt(base, tilt, config.tilt, 0.3)
    const expectedAgg = base.aggression + config.tilt.aggressionBoost * effectiveTiltSeverity(tilt, 0.3)
    expect(tiltedProfile.aggression).toBeCloseTo(expectedAgg, 10)
  })
})
