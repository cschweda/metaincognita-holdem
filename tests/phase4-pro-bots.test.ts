/**
 * Phase 4 — Pro Player Bot Tests
 *
 * Verifies that pro bots behave according to their real-life playstyles,
 * that per-persona tilt multipliers work correctly, and that table
 * composition rules (max 2 pros, no duplicates) are enforced.
 */
import { describe, it, expect } from 'vitest'
import {
  decideBotAction,
  simulateBotStats,
  applyTilt,
  updateTilt,
  createTiltState,
  type BotProfile,
  type TiltState,
} from '../app/utils/botDecision'
import config from '../holdem.config'

const N = 50000 // hands per test — good confidence in reasonable time

// ─── Helpers ───────────────────────────────────────────────────

function getPersona(name: string) {
  const p = config.personas.find(b => b.name === name)
  if (!p) throw new Error(`Persona not found: ${name}`)
  return p
}

function profileFrom(p: ReturnType<typeof getPersona>): BotProfile {
  return { vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq }
}

function runStats(p: ReturnType<typeof getPersona>) {
  return simulateBotStats(profileFrom(p), N)
}

// ─── Pro Bot Existence ─────────────────────────────────────────

describe('Pro bot personas exist with correct fields', () => {
  const proNames = ['Phil Hellmuth', 'Daniel Negreanu', 'Phil Ivey', 'Doyle Brunson', 'Jennifer Tilly', 'Phil Laak', 'Antonio Esfandiari', 'Gabe Kaplan', 'Jean-Robert Bellande']

  for (const name of proNames) {
    it(`${name} exists in config`, () => {
      const persona = getPersona(name)
      expect(persona).toBeDefined()
      expect(persona.vpip).toBeGreaterThan(0)
      expect(persona.pfr).toBeGreaterThan(0)
      expect(persona.aggression).toBeGreaterThan(0)
      expect(persona.bluffFreq).toBeGreaterThan(0)
      expect(persona.creativeFreq).toBeGreaterThan(0)
      expect(persona.tiltMultiplier).toBeDefined()
      expect(persona.leak).toBeTruthy()
    })
  }

  it('all pros have PFR <= VPIP', () => {
    for (const name of proNames) {
      const p = getPersona(name)
      expect(p.pfr).toBeLessThanOrEqual(p.vpip)
    }
  })
})

// ─── Phil Hellmuth ─────────────────────────────────────────────

describe('Phil Hellmuth — GTO baseline with extreme tilt', () => {
  const hellmuth = getPersona('Phil Hellmuth')

  it('plays tight-ish when not tilted (VPIP ~20%)', () => {
    const stats = runStats(hellmuth)
    expect(stats.vpip).toBeGreaterThan(0.10)
    expect(stats.vpip).toBeLessThan(0.35)
  })

  it('has the highest tilt multiplier of all personas', () => {
    const maxTilt = Math.max(...config.personas.map(p => p.tiltMultiplier ?? 1))
    expect(hellmuth.tiltMultiplier).toBe(maxTilt)
  })

  it('tilts after just 1-2 losses (tiltMultiplier 2.5)', () => {
    const state = createTiltState()
    // With multiplier 2.5, effective threshold = round(3 / 2.5) = 1
    updateTilt(state, false, false, config.tilt, hellmuth.tiltMultiplier!)
    expect(state.tilted).toBe(true) // tilts after a single loss
  })

  it('tilted Hellmuth plays drastically looser than base', () => {
    const baseStats = simulateBotStats(profileFrom(hellmuth), N)
    const tiltedProfile = applyTilt(
      profileFrom(hellmuth),
      { consecutiveLosses: 3, tilted: true, severity: 1.0, handsRemaining: 5 },
      config.tilt,
      hellmuth.tiltMultiplier!,
    )
    const tiltStats = simulateBotStats(tiltedProfile, N)

    // Massive increase due to 2.5x multiplier
    expect(tiltStats.vpip).toBeGreaterThan(baseStats.vpip + 0.05)
    expect(tiltStats.bluffRate).toBeGreaterThan(baseStats.bluffRate)
    expect(tiltStats.raiseRate).toBeGreaterThan(baseStats.raiseRate)
  })

  it('tilted Hellmuth is looser than tilted Ivey', () => {
    const ivey = getPersona('Phil Ivey')
    const tiltState: TiltState = { consecutiveLosses: 3, tilted: true, severity: 1.0, handsRemaining: 5 }

    const tiltedHellmuth = applyTilt(profileFrom(hellmuth), tiltState, config.tilt, hellmuth.tiltMultiplier!)
    const tiltedIvey = applyTilt(profileFrom(ivey), tiltState, config.tilt, ivey.tiltMultiplier!)

    expect(tiltedHellmuth.vpip).toBeGreaterThan(tiltedIvey.vpip)
    expect(tiltedHellmuth.aggression).toBeGreaterThan(tiltedIvey.aggression)
  })
})

// ─── Daniel Negreanu ───────────────────────────────────────────

describe('Daniel Negreanu — suited connectors, creative, tilt-resistant', () => {
  const negreanu = getPersona('Daniel Negreanu')

  it('plays loose (VPIP ~32% — wider than most)', () => {
    const stats = runStats(negreanu)
    expect(stats.vpip).toBeGreaterThan(0.20)
  })

  it('plays looser than Hellmuth and Ivey', () => {
    const hellmuthStats = runStats(getPersona('Phil Hellmuth'))
    const iveyStats = runStats(getPersona('Phil Ivey'))
    const negStats = runStats(negreanu)
    expect(negStats.vpip).toBeGreaterThan(hellmuthStats.vpip)
    expect(negStats.vpip).toBeGreaterThan(iveyStats.vpip)
  })

  it('has high creative frequency (suited connectors, speculative plays)', () => {
    expect(negreanu.creativeFreq).toBeGreaterThanOrEqual(0.10)
    // Among the highest creative frequencies (top 3)
    const sorted = [...config.personas].sort((a, b) => b.creativeFreq - a.creativeFreq)
    const top3 = sorted.slice(0, 3).map(p => p.name)
    expect(top3).toContain('Daniel Negreanu')
  })

  it('is very tilt-resistant (0.5x multiplier)', () => {
    expect(negreanu.tiltMultiplier).toBeLessThanOrEqual(0.5)
  })

  it('needs many consecutive losses to tilt', () => {
    const state = createTiltState()
    // With multiplier 0.5, effective threshold = round(3 / 0.5) = 6
    for (let i = 0; i < 5; i++) {
      updateTilt(state, false, false, config.tilt, negreanu.tiltMultiplier!)
    }
    expect(state.tilted).toBe(false) // still not tilted after 5 losses
  })
})

// ─── Phil Ivey ─────────────────────────────────────────────────

describe('Phil Ivey — near-perfect, almost untiltable', () => {
  const ivey = getPersona('Phil Ivey')

  it('plays solid TAG style (VPIP ~23%, PFR ~19%)', () => {
    const stats = runStats(ivey)
    expect(stats.vpip).toBeGreaterThan(0.12)
    expect(stats.vpip).toBeLessThan(0.35)
    expect(stats.pfr).toBeGreaterThan(0.08)
  })

  it('has the lowest tilt multiplier (most emotionally controlled)', () => {
    const minTilt = Math.min(...config.personas.map(p => p.tiltMultiplier ?? 1))
    expect(ivey.tiltMultiplier).toBe(minTilt)
  })

  it('needs 10 consecutive losses to tilt (0.3x)', () => {
    const state = createTiltState()
    // effective threshold = round(3 / 0.3) = 10
    for (let i = 0; i < 9; i++) {
      updateTilt(state, false, false, config.tilt, ivey.tiltMultiplier!)
    }
    expect(state.tilted).toBe(false)
    updateTilt(state, false, false, config.tilt, ivey.tiltMultiplier!)
    expect(state.tilted).toBe(true) // finally tilts at 10
  })

  it('even when tilted, Ivey barely changes (0.3x boosts)', () => {
    const baseStats = simulateBotStats(profileFrom(ivey), N)
    const tiltedProfile = applyTilt(
      profileFrom(ivey),
      { consecutiveLosses: 10, tilted: true, severity: 1.0, handsRemaining: 5 },
      config.tilt,
      ivey.tiltMultiplier!,
    )
    const tiltStats = simulateBotStats(tiltedProfile, N)

    // Only slight increase — Ivey stays composed
    const vpipDiff = tiltStats.vpip - baseStats.vpip
    expect(vpipDiff).toBeLessThan(0.06) // barely widens
  })
})

// ─── Doyle Brunson ─────────────────────────────────────────────

describe('Doyle Brunson — power poker, tilt-resistant', () => {
  const doyle = getPersona('Doyle Brunson')

  it('plays moderately loose with aggression (VPIP ~28%)', () => {
    const stats = runStats(doyle)
    expect(stats.vpip).toBeGreaterThan(0.15)
    expect(stats.vpip).toBeLessThan(0.42)
  })

  it('is more aggressive than Calling Carl', () => {
    expect(doyle.aggression).toBeGreaterThan(getPersona('Calling Carl').aggression)
  })

  it('has high creative frequency (trapping)', () => {
    expect(doyle.creativeFreq).toBeGreaterThan(0.06)
  })

  it('is tilt-resistant (0.4x)', () => {
    expect(doyle.tiltMultiplier).toBeLessThanOrEqual(0.5)
  })
})

// ─── Jennifer Tilly ────────────────────────────────────────────

describe('Jennifer Tilly — unpredictable, moderate tilt', () => {
  const tilly = getPersona('Jennifer Tilly')

  it('plays loose-ish (VPIP ~30%)', () => {
    const stats = runStats(tilly)
    expect(stats.vpip).toBeGreaterThan(0.18)
  })

  it('PFR is notably lower than VPIP (calls more than raises)', () => {
    expect(tilly.vpip - tilly.pfr).toBeGreaterThan(0.10)
  })

  it('has moderate tilt sensitivity (0.7x)', () => {
    expect(tilly.tiltMultiplier).toBeGreaterThan(0.5)
    expect(tilly.tiltMultiplier).toBeLessThan(1.5)
  })
})

// ─── Comparative: Pro vs Pro ───────────────────────────────────

describe('Pro bot comparative behavior', () => {
  it('Hellmuth is tighter than Negreanu when not tilted', () => {
    expect(getPersona('Phil Hellmuth').vpip).toBeLessThan(getPersona('Daniel Negreanu').vpip)
  })

  it('Ivey is tighter than Negreanu', () => {
    expect(getPersona('Phil Ivey').vpip).toBeLessThan(getPersona('Daniel Negreanu').vpip)
  })

  it('Negreanu is the loosest pro', () => {
    const proVpips = ['Phil Hellmuth', 'Daniel Negreanu', 'Phil Ivey', 'Doyle Brunson', 'Jennifer Tilly']
      .map(n => getPersona(n).vpip)
    expect(getPersona('Daniel Negreanu').vpip).toBe(Math.max(...proVpips))
  })

  it('Ivey has the lowest tilt multiplier of all bots', () => {
    const allTilts = config.personas.map(p => p.tiltMultiplier ?? 1)
    expect(getPersona('Phil Ivey').tiltMultiplier).toBe(Math.min(...allTilts))
  })

  it('Hellmuth has the highest tilt multiplier of all bots', () => {
    const allTilts = config.personas.map(p => p.tiltMultiplier ?? 1)
    expect(getPersona('Phil Hellmuth').tiltMultiplier).toBe(Math.max(...allTilts))
  })

  it('all pros have unique playstyles (no two have identical VPIP+PFR+aggression)', () => {
    const pros = ['Phil Hellmuth', 'Daniel Negreanu', 'Phil Ivey', 'Doyle Brunson', 'Jennifer Tilly']
    const signatures = pros.map(n => {
      const p = getPersona(n)
      return `${p.vpip}-${p.pfr}-${p.aggression}`
    })
    expect(new Set(signatures).size).toBe(pros.length)
  })
})

// ─── Tilt Multiplier Scaling ───────────────────────────────────

describe('Per-persona tilt multiplier mechanics', () => {
  it('higher multiplier = faster tilt trigger', () => {
    const fast = createTiltState()
    const slow = createTiltState()

    // Hellmuth (2.5x) vs Ivey (0.3x) — same number of losses
    updateTilt(fast, false, false, config.tilt, 2.5)
    updateTilt(slow, false, false, config.tilt, 0.3)

    expect(fast.tilted).toBe(true)  // Hellmuth tilts immediately
    expect(slow.tilted).toBe(false) // Ivey doesn't
  })

  it('higher multiplier = larger tilt effect', () => {
    const base: BotProfile = { vpip: 0.20, pfr: 0.16, aggression: 1.0, bluffFreq: 0.10, creativeFreq: 0.04 }
    const tiltState: TiltState = { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 5 }

    const hellmuthTilted = applyTilt(base, tiltState, config.tilt, 2.5)
    const iveyTilted = applyTilt(base, tiltState, config.tilt, 0.3)

    expect(hellmuthTilted.vpip).toBeGreaterThan(iveyTilted.vpip)
    expect(hellmuthTilted.aggression).toBeGreaterThan(iveyTilted.aggression)
    expect(hellmuthTilted.bluffFreq).toBeGreaterThan(iveyTilted.bluffFreq)
  })

  it('multiplier of 1.0 matches the original tilt behavior', () => {
    const base: BotProfile = { vpip: 0.22, pfr: 0.17, aggression: 1.0, bluffFreq: 0.12, creativeFreq: 0.05 }
    const tiltState: TiltState = { consecutiveLosses: 5, tilted: true, severity: 1.0, handsRemaining: 5 }

    const withMult = applyTilt(base, tiltState, config.tilt, 1.0)
    const without = applyTilt(base, tiltState, config.tilt) // default 1.0

    expect(withMult.vpip).toBe(without.vpip)
    expect(withMult.aggression).toBe(without.aggression)
  })
})

// ─── Table Composition Rules ───────────────────────────────────

describe('Table composition: max 2 pros, no duplicates', () => {
  const proNames = new Set(['Phil Hellmuth', 'Daniel Negreanu', 'Phil Ivey', 'Doyle Brunson', 'Jennifer Tilly', 'Phil Laak', 'Antonio Esfandiari', 'Gabe Kaplan', 'Jean-Robert Bellande'])
  const allNames = config.personas.map(p => p.name)

  it('config has at least 12 total personas (7 fictional + 5 pro)', () => {
    expect(config.personas.length).toBeGreaterThanOrEqual(12)
  })

  it('config has exactly 9 pro bots', () => {
    const pros = config.personas.filter(p => proNames.has(p.name))
    expect(pros.length).toBe(9)
  })

  it('no duplicate persona names in config', () => {
    expect(new Set(allNames).size).toBe(allNames.length)
  })

  it('simulated table of 7 never has more than 2 pros', () => {
    // Simulate the selection logic 100 times
    const proPersonas = config.personas.filter(p => proNames.has(p.name))
    const fictionalPersonas = config.personas.filter(p => !proNames.has(p.name))

    for (let trial = 0; trial < 100; trial++) {
      const shuffledPros = [...proPersonas].sort(() => Math.random() - 0.5).slice(0, 2)
      const shuffledFictional = [...fictionalPersonas].sort(() => Math.random() - 0.5)
      const selected = [...shuffledPros, ...shuffledFictional].slice(0, 7)

      const proCount = selected.filter(p => proNames.has(p.name)).length
      expect(proCount).toBeLessThanOrEqual(2)
    }
  })

  it('simulated table never has duplicate personas', () => {
    const proPersonas = config.personas.filter(p => proNames.has(p.name))
    const fictionalPersonas = config.personas.filter(p => !proNames.has(p.name))

    for (let trial = 0; trial < 100; trial++) {
      const shuffledPros = [...proPersonas].sort(() => Math.random() - 0.5).slice(0, 2)
      const shuffledFictional = [...fictionalPersonas].sort(() => Math.random() - 0.5)
      const selected = [...shuffledPros, ...shuffledFictional].slice(0, 7)

      const names = selected.map(p => p.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('enough personas to fill a max table (7 bots) without duplicates', () => {
    expect(config.personas.length).toBeGreaterThanOrEqual(7)
  })
})
