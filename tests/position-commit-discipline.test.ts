/**
 * Position discipline when a bot commits its stack.
 *
 * Shoving a short stack from the button is a different decision from shoving
 * it out of the blinds, and before Round 8's river fix the engine could not
 * tell the two apart on the river: an SB lead and a BTN bet with the same air
 * fired at byte-identical frequency. These gates hold both halves of the
 * position contract — the preflop push/fold range and the postflop stack-off —
 * for EVERY persona, so a future frequency tweak cannot flatten them again.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, applyTilt, createTiltState, type BotProfile, type DecisionContext } from '../app/utils/botDecision'
import type { Card } from '../app/utils/cards'
import { mulberry32 } from '../app/utils/rng'
import config from '../holdem.config'

const R: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 }
const S: Record<string, Card['suit']> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
const c = (x: string): Card => ({ rank: R[x[0]!] ?? parseInt(x[0]!, 10), suit: S[x[1]!]! })

type Persona = Record<string, number> & { name: string }
const PERSONAS = (config as unknown as { personas: Persona[] }).personas

const profileOf = (p: Persona): BotProfile => ({
  vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq,
  creativeFreq: p.creativeFreq, threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
  fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq, betSizeMult: p.betSizeMult,
  overbetFreq: p.overbetFreq,
} as BotProfile)

const BOARD = ['3h', '4s', '8s', 'Th', '7d'].map(c)
const AIR: [Card, Card] = [c('Kc'), c('Qc')]

/** % of hands this persona puts its LAST chips in on the river as a pure bluff. */
function stackOffWithAir(p: Persona, position: string, tilted = false, n = 20000): number {
  const tilt = createTiltState()
  if (tilted) { tilt.tilted = true; tilt.severity = 1.0; tilt.handsRemaining = 5 }
  const profile = applyTilt(profileOf(p), tilt, config.tilt, p.tiltMultiplier)
  let allIn = 0
  const chips = 34 // 17bb
  for (let i = 0; i < n; i++) {
    const ctx: DecisionContext = {
      street: 'river', toCall: 0, pot: 45, currentBet: 0, playerBet: 0,
      chips, bb: 2, numActivePlayers: 2, position, holeCards: AIR, community: BOARD,
      rng: mulberry32(i + 1), wasPreflopRaiser: true, preflopCallers: 1,
      streetHistory: { flop: 'bet', turn: 'check' },
    }
    const a = decideBotAction(profile, ctx, p.consistency)
    if (a.type === 'raise' && (a.amount ?? 0) >= chips) allIn++
  }
  return 100 * allIn / n
}

// ─── Postflop: the blinds stack off with air less than the button ──

describe('every persona stacks off with air less from the blinds than the button', () => {
  for (const p of PERSONAS) {
    it(`${p.name}`, () => {
      const btn = stackOffWithAir(p, 'BTN')
      const sb = stackOffWithAir(p, 'SB')
      expect(btn).toBeGreaterThan(0) // the spot must actually produce stack-offs
      expect(sb).toBeLessThan(btn)
    })
  }
})

// ─── Preflop: the blinds shove a short stack tighter than the button ──

/** % of the 169 starting hands this persona shoves an 8bb stack with. */
function shoveRange(p: Persona, position: string): number {
  const profile = profileOf(p)
  const ranks = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
  let shoves = 0, total = 0
  for (let i = 0; i < ranks.length; i++) {
    for (let j = i; j < ranks.length; j++) {
      for (const suited of [true, false]) {
        if (i === j && suited) continue // no suited pairs
        const hole: [Card, Card] = [
          { rank: ranks[i]!, suit: 'spades' },
          { rank: ranks[j]!, suit: suited ? 'spades' : 'hearts' },
        ]
        total++
        const ctx: DecisionContext = {
          street: 'preflop', toCall: 2, pot: 3, currentBet: 2, playerBet: 0,
          chips: 16, bb: 2, numActivePlayers: 3, position, holeCards: hole,
          rng: mulberry32(7), raiseLevel: 1,
        }
        // consistency 1.0: measure the strategy, not the brain-fart layer
        if (decideBotAction(profile, ctx, 1.0).type === 'raise') shoves++
      }
    }
  }
  return 100 * shoves / total
}

describe('every persona shoves an 8bb stack tighter from the blinds than the button', () => {
  for (const p of PERSONAS) {
    it(`${p.name}`, () => {
      const btn = shoveRange(p, 'BTN')
      const sb = shoveRange(p, 'SB')
      expect(btn).toBeGreaterThan(0)
      expect(sb).toBeLessThan(btn)
    })
  }
})

// ─── Tilt separates the personas it is supposed to separate ──

describe('tilt moves the tilt-prone far more than the untiltable', () => {
  const swing = (name: string) => {
    const p = PERSONAS.find(x => x.name === name)!
    return stackOffWithAir(p, 'SB', true) - stackOffWithAir(p, 'SB', false)
  }

  it('an untiltable pro barely changes on full tilt', () => {
    // Ihil Pvey, Rhip Ceese, Serik Eidel all carry tiltMultiplier 0.3.
    for (const name of ['Ihil Pvey', 'Rhip Ceese', 'Serik Eidel']) {
      expect(swing(name)).toBeLessThan(3)
    }
  })

  it('a tilt-prone persona changes several times as much', () => {
    for (const name of ['Mike the Mouth', 'Hill Phellmuth']) {
      expect(swing(name)).toBeGreaterThan(5)
    }
    expect(swing('Mike the Mouth')).toBeGreaterThan(swing('Ihil Pvey') * 3)
  })
})
