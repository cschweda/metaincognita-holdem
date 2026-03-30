/**
 * Phase 4 — Tilt System Tests
 *
 * Tests that tilt triggers correctly on consecutive losses and big pot losses,
 * decays over time, modifies bot profiles (wider VPIP, more aggression, more bluffs),
 * and that tilted bots play measurably looser than their base config.
 */
import { describe, it, expect } from 'vitest'
import {
  createTiltState,
  updateTilt,
  decayTilt,
  applyTilt,
  decideBotAction,
  simulateBotStats,
  type BotProfile,
  type TiltState,
} from '../app/utils/botDecision'
import config from '../holdem.config'

const tiltConfig = config.tilt

// ─── Tilt State Management ─────────────────────────────────────

describe('Tilt triggers', () => {
  it('no tilt after 1-2 consecutive losses', () => {
    const state = createTiltState()
    updateTilt(state, false, false, tiltConfig)
    expect(state.tilted).toBe(false)
    updateTilt(state, false, false, tiltConfig)
    expect(state.tilted).toBe(false)
    expect(state.consecutiveLosses).toBe(2)
  })

  it('triggers tilt after configured consecutive losses (default 3)', () => {
    const state = createTiltState()
    for (let i = 0; i < tiltConfig.consecutiveLosses; i++) {
      updateTilt(state, false, false, tiltConfig)
    }
    expect(state.tilted).toBe(true)
    expect(state.consecutiveLosses).toBe(tiltConfig.consecutiveLosses)
  })

  it('triggers tilt immediately on big pot loss', () => {
    const state = createTiltState()
    updateTilt(state, false, true, tiltConfig)
    expect(state.tilted).toBe(true)
    expect(state.severity).toBe(1.0) // big loss = full tilt
  })

  it('winning resets consecutive loss count', () => {
    const state = createTiltState()
    updateTilt(state, false, false, tiltConfig)
    updateTilt(state, false, false, tiltConfig)
    expect(state.consecutiveLosses).toBe(2)
    updateTilt(state, true, false, tiltConfig)
    expect(state.consecutiveLosses).toBe(0)
  })

  it('winning does not instantly clear active tilt', () => {
    const state = createTiltState()
    // Trigger tilt
    for (let i = 0; i < tiltConfig.consecutiveLosses; i++) {
      updateTilt(state, false, false, tiltConfig)
    }
    expect(state.tilted).toBe(true)
    // Win — loss count resets but tilt stays (needs to decay over hands)
    updateTilt(state, true, false, tiltConfig)
    expect(state.consecutiveLosses).toBe(0)
    expect(state.tilted).toBe(true) // still tilted
  })
})

describe('Tilt severity', () => {
  it('mild tilt at mildTiltThreshold consecutive losses', () => {
    const state = createTiltState()
    for (let i = 0; i < tiltConfig.mildTiltThreshold; i++) {
      updateTilt(state, false, false, tiltConfig)
    }
    expect(state.tilted).toBe(true)
    expect(state.severity).toBe(0.5)
  })

  it('full tilt at fullTiltThreshold consecutive losses', () => {
    const state = createTiltState()
    for (let i = 0; i < tiltConfig.fullTiltThreshold; i++) {
      updateTilt(state, false, false, tiltConfig)
    }
    expect(state.severity).toBe(1.0)
  })

  it('big pot loss goes straight to full tilt severity', () => {
    const state = createTiltState()
    updateTilt(state, false, true, tiltConfig)
    expect(state.severity).toBe(1.0)
  })

  it('continued losses extend tilt duration', () => {
    const state = createTiltState()
    for (let i = 0; i < tiltConfig.fullTiltThreshold + 2; i++) {
      updateTilt(state, false, false, tiltConfig)
    }
    expect(state.handsRemaining).toBeGreaterThanOrEqual(3)
  })
})

describe('Tilt decay', () => {
  it('tilt decays by 1 hand each call', () => {
    const state = createTiltState()
    state.tilted = true
    state.severity = 1.0
    state.handsRemaining = 4

    decayTilt(state)
    expect(state.handsRemaining).toBe(3)
    expect(state.tilted).toBe(true)
  })

  it('tilt clears when handsRemaining reaches 0', () => {
    const state = createTiltState()
    state.tilted = true
    state.severity = 1.0
    state.handsRemaining = 1

    decayTilt(state)
    expect(state.tilted).toBe(false)
    expect(state.severity).toBe(0)
  })

  it('tilt duration is within configured range', () => {
    const [min, max] = tiltConfig.decayHands
    for (let trial = 0; trial < 50; trial++) {
      const state = createTiltState()
      for (let i = 0; i < tiltConfig.consecutiveLosses; i++) {
        updateTilt(state, false, false, tiltConfig)
      }
      expect(state.handsRemaining).toBeGreaterThanOrEqual(min)
      expect(state.handsRemaining).toBeLessThanOrEqual(max)
    }
  })

  it('no-op when not tilted', () => {
    const state = createTiltState()
    decayTilt(state)
    expect(state.tilted).toBe(false)
    expect(state.handsRemaining).toBe(0)
  })
})

// ─── Profile Modification ──────────────────────────────────────

describe('applyTilt profile modification', () => {
  const base: BotProfile = {
    vpip: 0.14, pfr: 0.11, aggression: 0.85,
    bluffFreq: 0.08, creativeFreq: 0.03,
  }

  it('returns base profile unchanged when not tilted', () => {
    const state = createTiltState()
    const result = applyTilt(base, state, tiltConfig)
    expect(result).toEqual(base)
  })

  it('widens VPIP on mild tilt', () => {
    const state: TiltState = { consecutiveLosses: 3, tilted: true, severity: 0.5, handsRemaining: 4 }
    const result = applyTilt(base, state, tiltConfig)
    expect(result.vpip).toBeGreaterThan(base.vpip)
    expect(result.vpip).toBe(base.vpip + tiltConfig.vpipWiden * 0.5)
  })

  it('widens VPIP more on full tilt', () => {
    const mild: TiltState = { consecutiveLosses: 3, tilted: true, severity: 0.5, handsRemaining: 4 }
    const full: TiltState = { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 4 }
    const mildResult = applyTilt(base, mild, tiltConfig)
    const fullResult = applyTilt(base, full, tiltConfig)
    expect(fullResult.vpip).toBeGreaterThan(mildResult.vpip)
  })

  it('boosts aggression', () => {
    const state: TiltState = { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 4 }
    const result = applyTilt(base, state, tiltConfig)
    expect(result.aggression).toBe(base.aggression + tiltConfig.aggressionBoost)
  })

  it('boosts bluff frequency', () => {
    const state: TiltState = { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 4 }
    const result = applyTilt(base, state, tiltConfig)
    expect(result.bluffFreq).toBe(base.bluffFreq + tiltConfig.bluffBoost)
  })

  it('boosts PFR', () => {
    const state: TiltState = { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 4 }
    const result = applyTilt(base, state, tiltConfig)
    expect(result.pfr).toBe(base.pfr + tiltConfig.pfrBoost)
  })

  it('caps VPIP at 0.60 even on full tilt', () => {
    const looseBase: BotProfile = { ...base, vpip: 0.55 }
    const state: TiltState = { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 4 }
    const result = applyTilt(looseBase, state, tiltConfig)
    expect(result.vpip).toBeLessThanOrEqual(0.60)
  })

  it('caps aggression at 2.5 even on full tilt', () => {
    const aggroBase: BotProfile = { ...base, aggression: 2.3 }
    const state: TiltState = { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 4 }
    const result = applyTilt(aggroBase, state, tiltConfig)
    expect(result.aggression).toBeLessThanOrEqual(2.5)
  })
})

// ─── Behavioral Impact (100K hands) ────────────────────────────

describe('Tilted bot plays measurably looser (100K-hand simulation)', () => {
  const tightTony: BotProfile = {
    vpip: 0.14, pfr: 0.11, aggression: 0.85,
    bluffFreq: 0.08, creativeFreq: 0.03,
  }

  it('tilted Tight Tony has higher VPIP than base Tight Tony', () => {
    const baseStats = simulateBotStats(tightTony, 100000)

    const tiltedProfile = applyTilt(
      tightTony,
      { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 5 },
      tiltConfig,
    )
    const tiltStats = simulateBotStats(tiltedProfile, 100000)

    expect(tiltStats.vpip).toBeGreaterThan(baseStats.vpip)
  })

  it('tilted Tight Tony bluffs more than base Tight Tony', () => {
    const baseStats = simulateBotStats(tightTony, 100000)

    const tiltedProfile = applyTilt(
      tightTony,
      { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 5 },
      tiltConfig,
    )
    const tiltStats = simulateBotStats(tiltedProfile, 100000)

    expect(tiltStats.bluffRate).toBeGreaterThan(baseStats.bluffRate)
  })

  it('tilted Tight Tony raises more than base Tight Tony', () => {
    const baseStats = simulateBotStats(tightTony, 100000)

    const tiltedProfile = applyTilt(
      tightTony,
      { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 5 },
      tiltConfig,
    )
    const tiltStats = simulateBotStats(tiltedProfile, 100000)

    expect(tiltStats.raiseRate).toBeGreaterThan(baseStats.raiseRate)
  })

  it('mild tilt has smaller effect than full tilt', () => {
    const mildProfile = applyTilt(
      tightTony,
      { consecutiveLosses: 3, tilted: true, severity: 0.5, handsRemaining: 3 },
      tiltConfig,
    )
    const fullProfile = applyTilt(
      tightTony,
      { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 5 },
      tiltConfig,
    )

    const mildStats = simulateBotStats(mildProfile, 100000)
    const fullStats = simulateBotStats(fullProfile, 100000)

    expect(fullStats.vpip).toBeGreaterThan(mildStats.vpip)
    expect(fullStats.bluffRate).toBeGreaterThanOrEqual(mildStats.bluffRate - 0.02)
  })

  it('even Solid Sam plays looser on full tilt', () => {
    const sam: BotProfile = {
      vpip: 0.22, pfr: 0.17, aggression: 1.00,
      bluffFreq: 0.12, creativeFreq: 0.05,
    }
    const baseStats = simulateBotStats(sam, 100000)
    const tiltedSam = applyTilt(
      sam,
      { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 5 },
      tiltConfig,
    )
    const tiltStats = simulateBotStats(tiltedSam, 100000)

    expect(tiltStats.vpip).toBeGreaterThan(baseStats.vpip)
    expect(tiltStats.bluffRate).toBeGreaterThan(baseStats.bluffRate)
  })
})
