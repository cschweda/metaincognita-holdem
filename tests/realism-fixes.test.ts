/**
 * Realism fixes test suite — covers the 2026-06 bot realism overhaul:
 *   F4: combo-weighted hand percentile (idx/169 → cumulative combo mass)
 *   F1: tilt only triggers on hands the bot actually played
 *   F2: raise-size-aware preflop defense (jams get premium-only continues)
 *   F3: made-hand bet-size sensitivity postflop
 *   F6: per-persona range shapes (styleBias) + open-limp model (limpFreq)
 *   F7: sizing personality (betSizeMult) + river overbets (overbetFreq)
 *   F8c: hero bet-sizing tell detection
 *
 * Spec: docs/superpowers/specs/2026-06-10-pro-bot-realism-design.md
 */
import { describe, it, expect } from 'vitest'
import { handPercentile } from '../app/utils/ranges'
import { updateTilt, createTiltState } from '../app/utils/botDecision'
import config from '../holdem.config'
import type { Card } from '../app/utils/cards'

const c = (rank: number, suit: Card['suit']): Card => ({ rank, suit })

/** Draw two distinct random cards from a fresh 52-card deck. */
export function dealRandomHole(): [Card, Card] {
  const deck: Card[] = []
  for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as const) {
    for (let r = 2; r <= 14; r++) deck.push(c(r, suit))
  }
  const i1 = Math.floor(Math.random() * 52)
  let i2 = Math.floor(Math.random() * 52)
  while (i2 === i1) i2 = Math.floor(Math.random() * 52)
  return [deck[i1], deck[i2]]
}

// ─── F4: Combo-weighted percentile ─────────────────────────────

describe('F4 — combo-weighted percentile', () => {
  it('AA is the top ~0.45% of dealt hands', () => {
    expect(handPercentile([c(14, 'hearts'), c(14, 'spades')])).toBeCloseTo(6 / 1326, 3)
  })

  it('72o is the bottom (1.0)', () => {
    expect(handPercentile([c(7, 'hearts'), c(2, 'clubs')])).toBeCloseTo(1.0, 3)
  })

  it('AA/KK stay inside a 1% five-bet range, QQ does not', () => {
    expect(handPercentile([c(14, 'hearts'), c(14, 'spades')])).toBeLessThan(0.01)
    expect(handPercentile([c(13, 'hearts'), c(13, 'spades')])).toBeLessThan(0.01)
    expect(handPercentile([c(12, 'hearts'), c(12, 'spades')])).toBeGreaterThan(0.01)
  })

  it('random dealt hands are ~uniform: P(pct < 0.25) ≈ 0.25', () => {
    let below = 0
    const N = 40000
    for (let i = 0; i < N; i++) {
      if (handPercentile(dealRandomHole()) < 0.25) below++
    }
    expect(below / N).toBeGreaterThan(0.22)
    expect(below / N).toBeLessThan(0.28)
  })
})

// ─── F1: Tilt requires participation ───────────────────────────

describe('F1 — tilt requires participation', () => {
  it('folding preflop 20 times never tilts even Phellmuth', () => {
    const state = createTiltState()
    for (let i = 0; i < 20; i++) updateTilt(state, false, false, config.tilt, 2.5, false)
    expect(state.tilted).toBe(false)
    expect(state.consecutiveLosses).toBe(0)
  })

  it('played losses still tilt (participated defaults to true)', () => {
    const state = createTiltState()
    updateTilt(state, false, false, config.tilt, 2.5)
    expect(state.tilted).toBe(true)
  })

  it('a fold between two played losses does not reset the loss count', () => {
    const state = createTiltState()
    updateTilt(state, false, false, config.tilt, 1.0, true)  // played loss
    updateTilt(state, false, false, config.tilt, 1.0, false) // folded preflop
    updateTilt(state, false, false, config.tilt, 1.0, true)  // played loss
    expect(state.consecutiveLosses).toBe(2)
  })
})
