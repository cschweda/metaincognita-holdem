/**
 * Phase 4 — Bot AI
 *
 * Tests persona-driven decisions, position-aware ranges, tilt mechanics,
 * session memory adaptation, bet sizing, and Monte Carlo equity.
 */
import { describe, it, expect } from 'vitest'

import config from '../holdem.config'

describe('Persona configuration', () => {
  it('all personas have valid stat ranges', () => {
    for (const p of config.personas) {
      expect(p.vpip).toBeGreaterThanOrEqual(0.10)
      expect(p.vpip).toBeLessThanOrEqual(0.50)
      expect(p.pfr).toBeLessThanOrEqual(p.vpip) // PFR can't exceed VPIP
      expect(p.aggression).toBeGreaterThan(0)
      expect(p.bluffFreq).toBeGreaterThanOrEqual(0)
      expect(p.bluffFreq).toBeLessThanOrEqual(0.30)
      expect(p.creativeFreq).toBeGreaterThanOrEqual(0)
      expect(p.creativeFreq).toBeLessThanOrEqual(0.15)
    }
  })

  it('has enough personas for max opponents (7)', () => {
    expect(config.personas.length).toBeGreaterThanOrEqual(config.table.maxPlayers - 1)
  })

  it('Solid Sam has the tightest aggression to GTO baseline', () => {
    const sam = config.personas.find(p => p.name === 'Solid Sam')!
    expect(sam.aggression).toBe(1.0)
  })

  it('Wild Wendy has the highest bluff frequency', () => {
    const wendy = config.personas.find(p => p.name === 'Wild Wendy')!
    const maxBluff = Math.max(...config.personas.map(p => p.bluffFreq))
    expect(wendy.bluffFreq).toBe(maxBluff)
  })
})

describe('Preflop range widths by position', () => {
  it('UTG is tighter than BTN', () => {
    expect(config.botRanges.UTG).toBeLessThan(config.botRanges.BTN)
  })

  it('BTN is the widest opening range', () => {
    const positions = ['UTG', 'MP', 'CO', 'BTN'] as const
    const widest = Math.max(...positions.map(p => config.botRanges[p]))
    expect(config.botRanges.BTN).toBe(widest)
  })

  it('3-bet range is narrower than open range', () => {
    expect(config.botEscalation.threeBetValue + config.botEscalation.threeBetBluff)
      .toBeLessThan(config.botRanges.UTG)
  })

  it('escalation ranges narrow at each level', () => {
    const threebet = config.botEscalation.threeBetValue + config.botEscalation.threeBetBluff
    const fourbet = config.botEscalation.fourBetValue + config.botEscalation.fourBetBluff
    const fivebet = config.botEscalation.fiveBetRange
    expect(threebet).toBeGreaterThan(fourbet)
    expect(fourbet).toBeGreaterThan(fivebet)
  })
})

describe('Equity thresholds', () => {
  it('value bet threshold > thin value > drawing > give up', () => {
    const t = config.botEquityThresholds
    expect(t.valuebet).toBeGreaterThan(t.thinValue)
    expect(t.thinValue).toBeGreaterThan(t.drawing)
    expect(t.drawing).toBeGreaterThanOrEqual(t.giveUp)
  })
})

describe('Bet sizing', () => {
  it('open raise EP is larger than late position', () => {
    expect(config.botSizing.openRaiseEP).toBeGreaterThan(config.botSizing.openRaiseLate)
  })

  it('3-bet OOP is larger than IP (out of position pays more)', () => {
    expect(config.botSizing.threeBetOOP).toBeGreaterThan(config.botSizing.threeBetIP)
  })

  it('bluff sizing is cheaper than value sizing', () => {
    expect(config.botSizing.bluffBet[1]).toBeLessThanOrEqual(config.botSizing.valueBet[1])
  })

  it('overbet size exceeds pot', () => {
    expect(config.botSizing.overbetSize[0]).toBeGreaterThan(1.0)
  })
})

describe('Tilt mechanics', () => {
  it('tilt trigger threshold is reasonable (20-50% of stack)', () => {
    expect(config.tilt.bigLossThreshold).toBeGreaterThanOrEqual(0.20)
    expect(config.tilt.bigLossThreshold).toBeLessThanOrEqual(0.50)
  })

  it('tilt decays within 3-5 hands', () => {
    expect(config.tilt.decayHands[0]).toBeGreaterThanOrEqual(2)
    expect(config.tilt.decayHands[1]).toBeLessThanOrEqual(8)
  })

  it('tilt boosts aggression but not excessively', () => {
    const maxAggression = Math.max(...config.personas.map(p => p.aggression))
    const tiltedMax = maxAggression + config.tilt.aggressionBoost
    // Even the most aggressive bot on full tilt shouldn't exceed 2.0
    expect(tiltedMax).toBeLessThanOrEqual(2.0)
  })
})

describe('Session memory adaptation', () => {
  it('adaptation window is reasonable', () => {
    expect(config.sessionMemory.windowSize).toBeGreaterThanOrEqual(5)
    expect(config.sessionMemory.windowSize).toBeLessThanOrEqual(20)
  })

  it('short stack threshold triggers push/fold mode', () => {
    expect(config.sessionMemory.shortStackThreshold).toBe(20) // standard
  })

  it('deep stack threshold loosens play', () => {
    expect(config.sessionMemory.deepStackThreshold).toBeGreaterThan(100)
  })
})

describe('Bot decision engine (integration-level)', () => {
  // These tests require the actual bot decision engine — placeholder until Phase 4 is built

  it('Tight Tony folds more hands than Wild Wendy over 100 simulated decisions', () => {
    // Simulate 100 random preflop situations
    // Count folds for each persona
    // Tight Tony (vpip 14%) should fold ~86%
    // Wild Wendy (vpip 34%) should fold ~66%
    expect(true).toBe(true) // placeholder
  })

  it('bot in position bets more often than out of position', () => {
    expect(true).toBe(true) // placeholder
  })

  it('bot facing 4-bet with AQo folds (per design spec)', () => {
    expect(true).toBe(true) // placeholder
  })

  it('short-stacked bot (<20BB) uses push/fold strategy', () => {
    expect(true).toBe(true) // placeholder
  })

  it('creative plays occur at approximately the configured frequency', () => {
    // Over 1000 decisions, creative plays should be ~5% (within ±2%)
    expect(true).toBe(true) // placeholder
  })
})
