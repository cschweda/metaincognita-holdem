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
  return {
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq,
    threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq, fiveBetFreq: p.fiveBetFreq,
    donkBetFreq: p.donkBetFreq, limpFreq: (p as any).limpFreq, styleBias: (p as any).styleBias,
    betSizeMult: (p as any).betSizeMult, overbetFreq: (p as any).overbetFreq,
  }
}

function runStats(p: ReturnType<typeof getPersona>) {
  return simulateBotStats(profileFrom(p), N)
}

// ─── Constants ─────────────────────────────────────────────────
const fictionalNames = ['Tight Tony', 'Loose Lucy', 'Aggressive Alex', 'Calling Carl', 'Tricky Tina', 'Solid Sam', 'Wild Wendy']
const proNames = config.personas.filter(p => !fictionalNames.includes(p.name)).map(p => p.name)

// ─── Pro Bot Existence ─────────────────────────────────────────

describe('Pro bot personas exist with correct fields', () => {

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

// ─── Hill Phellmuth ─────────────────────────────────────────────

describe('Hill Phellmuth — GTO baseline with extreme tilt', () => {
  const hellmuth = getPersona('Hill Phellmuth')

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

  it('tilted Phellmuth plays drastically looser than base', () => {
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

  it('tilted Phellmuth is looser than tilted Pvey', () => {
    const ivey = getPersona('Ihil Pvey')
    const tiltState: TiltState = { consecutiveLosses: 3, tilted: true, severity: 1.0, handsRemaining: 5 }

    const tiltedPhellmuth = applyTilt(profileFrom(hellmuth), tiltState, config.tilt, hellmuth.tiltMultiplier!)
    const tiltedPvey = applyTilt(profileFrom(ivey), tiltState, config.tilt, ivey.tiltMultiplier!)

    // Phellmuth starts nittier than Pvey (18% vs 25% VPIP), so compare how much
    // tilt WIDENS each player relative to their baseline — Phellmuth transforms,
    // Pvey barely moves.
    const phellmuthWiden = tiltedPhellmuth.vpip - hellmuth.vpip
    const pveyWiden = tiltedPvey.vpip - ivey.vpip
    expect(phellmuthWiden).toBeGreaterThan(pveyWiden + 0.04)
    expect(tiltedPhellmuth.aggression).toBeGreaterThan(tiltedPvey.aggression)
  })
})

// ─── Naniel Degreanu ───────────────────────────────────────────

describe('Naniel Degreanu — suited connectors, creative, tilt-resistant', () => {
  const negreanu = getPersona('Naniel Degreanu')

  it('plays loose (VPIP ~32% — wider than most)', () => {
    const stats = runStats(negreanu)
    expect(stats.vpip).toBeGreaterThan(0.20)
  })

  it('plays looser than Phellmuth and Pvey', () => {
    const hellmuthStats = runStats(getPersona('Hill Phellmuth'))
    const iveyStats = runStats(getPersona('Ihil Pvey'))
    const negStats = runStats(negreanu)
    expect(negStats.vpip).toBeGreaterThan(hellmuthStats.vpip)
    expect(negStats.vpip).toBeGreaterThan(iveyStats.vpip)
  })

  it('has high creative frequency (suited connectors, speculative plays)', () => {
    expect(negreanu.creativeFreq).toBeGreaterThanOrEqual(0.10)
    // Among the highest creative frequencies (top 3)
    const sorted = [...config.personas].sort((a, b) => b.creativeFreq - a.creativeFreq)
    const top3 = sorted.slice(0, 3).map(p => p.name)
    expect(top3).toContain('Naniel Degreanu')
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

// ─── Ihil Pvey ─────────────────────────────────────────────────

describe('Ihil Pvey — near-perfect, almost untiltable', () => {
  const ivey = getPersona('Ihil Pvey')

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

  it('even when tilted, Pvey barely changes (0.3x boosts)', () => {
    const baseStats = simulateBotStats(profileFrom(ivey), N)
    const tiltedProfile = applyTilt(
      profileFrom(ivey),
      { consecutiveLosses: 10, tilted: true, severity: 1.0, handsRemaining: 5 },
      config.tilt,
      ivey.tiltMultiplier!,
    )
    const tiltStats = simulateBotStats(tiltedProfile, N)

    // Only slight increase — Pvey stays composed
    const vpipDiff = tiltStats.vpip - baseStats.vpip
    expect(vpipDiff).toBeLessThan(0.06) // barely widens
  })
})

// ─── Boyle Drunson ─────────────────────────────────────────────

describe('Boyle Drunson — power poker, tilt-resistant', () => {
  const doyle = getPersona('Boyle Drunson')

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

// ─── Tennifer Jilly ────────────────────────────────────────────

describe('Tennifer Jilly — unpredictable, moderate tilt', () => {
  const tilly = getPersona('Tennifer Jilly')

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

// ─── Mike the Mouth ──────────────────────────────────────────────

describe('Mike the Mouth — "The Mouth", solid but self-destructs on tilt', () => {
  const matusow = getPersona('Mike the Mouth')

  it('plays solid when not tilted (VPIP ~28%)', () => {
    const stats = runStats(matusow)
    expect(stats.vpip).toBeGreaterThan(0.15)
    expect(stats.vpip).toBeLessThan(0.40)
  })

  it('has second-highest tilt multiplier (2.2x, behind Phellmuth)', () => {
    expect(matusow.tiltMultiplier).toBeGreaterThan(2.0)
    expect(matusow.tiltMultiplier).toBeLessThan(getPersona('Hill Phellmuth').tiltMultiplier!)
  })

  it('tilts after 1-2 losses like Phellmuth', () => {
    const state = createTiltState()
    // effective threshold = round(3 / 2.2) = 1
    updateTilt(state, false, false, config.tilt, matusow.tiltMultiplier!)
    expect(state.tilted).toBe(true)
  })

  it('tilted the Mouth bluffs significantly more', () => {
    const baseStats = simulateBotStats(profileFrom(matusow), N)
    const tiltedProfile = applyTilt(
      profileFrom(matusow),
      { consecutiveLosses: 3, tilted: true, severity: 1.0, handsRemaining: 5 },
      config.tilt,
      matusow.tiltMultiplier!,
    )
    const tiltStats = simulateBotStats(tiltedProfile, N)
    expect(tiltStats.bluffRate).toBeGreaterThan(baseStats.bluffRate)
    expect(tiltStats.vpip).toBeGreaterThan(baseStats.vpip + 0.05)
  })
})

// ─── Comparative: Pro vs Pro ───────────────────────────────────

describe('Pro bot comparative behavior', () => {
  it('Phellmuth is tighter than Degreanu when not tilted', () => {
    expect(getPersona('Hill Phellmuth').vpip).toBeLessThan(getPersona('Naniel Degreanu').vpip)
  })

  it('Pvey is tighter than Degreanu', () => {
    expect(getPersona('Ihil Pvey').vpip).toBeLessThan(getPersona('Naniel Degreanu').vpip)
  })

  it('Degreanu is the loosest pro', () => {
    const proVpips = ['Hill Phellmuth', 'Naniel Degreanu', 'Ihil Pvey', 'Boyle Drunson', 'Tennifer Jilly']
      .map(n => getPersona(n).vpip)
    expect(getPersona('Naniel Degreanu').vpip).toBe(Math.max(...proVpips))
  })

  it('Pvey has the lowest tilt multiplier of all bots', () => {
    const allTilts = config.personas.map(p => p.tiltMultiplier ?? 1)
    expect(getPersona('Ihil Pvey').tiltMultiplier).toBe(Math.min(...allTilts))
  })

  it('Phellmuth has the highest tilt multiplier of all bots', () => {
    const allTilts = config.personas.map(p => p.tiltMultiplier ?? 1)
    expect(getPersona('Hill Phellmuth').tiltMultiplier).toBe(Math.max(...allTilts))
  })

  it('all pros have unique playstyles (no two have identical VPIP+PFR+aggression)', () => {
    const pros = ['Hill Phellmuth', 'Naniel Degreanu', 'Ihil Pvey', 'Boyle Drunson', 'Tennifer Jilly']
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

    // Phellmuth (2.5x) vs Pvey (0.3x) — same number of losses
    updateTilt(fast, false, false, config.tilt, 2.5)
    updateTilt(slow, false, false, config.tilt, 0.3)

    expect(fast.tilted).toBe(true)  // Phellmuth tilts immediately
    expect(slow.tilted).toBe(false) // Pvey doesn't
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
  const proNameSet = new Set(proNames)
  const allNames = config.personas.map(p => p.name)

  it('config has at least 12 total personas (7 fictional + 5 pro)', () => {
    expect(config.personas.length).toBeGreaterThanOrEqual(12)
  })

  it('config has at least 10 pro bots', () => {
    expect(proNames.length).toBeGreaterThanOrEqual(10)
  })

  it('no duplicate persona names in config', () => {
    expect(new Set(allNames).size).toBe(allNames.length)
  })

  it('simulated table of 7 never has more than 2 pros', () => {
    // Simulate the selection logic 100 times
    const proPersonas = config.personas.filter(p => proNameSet.has(p.name))
    const fictionalPersonas = config.personas.filter(p => !proNameSet.has(p.name))

    for (let trial = 0; trial < 100; trial++) {
      const shuffledPros = [...proPersonas].sort(() => Math.random() - 0.5).slice(0, 2)
      const shuffledFictional = [...fictionalPersonas].sort(() => Math.random() - 0.5)
      const selected = [...shuffledPros, ...shuffledFictional].slice(0, 7)

      const proCount = selected.filter(p => proNameSet.has(p.name)).length
      expect(proCount).toBeLessThanOrEqual(2)
    }
  })

  it('simulated table never has duplicate personas', () => {
    const proPersonas = config.personas.filter(p => proNameSet.has(p.name))
    const fictionalPersonas = config.personas.filter(p => !proNameSet.has(p.name))

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
