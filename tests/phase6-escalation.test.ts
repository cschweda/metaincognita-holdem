/**
 * Phase 6 — Preflop Escalation Tests
 *
 * Verifies that bots correctly 3-bet, 4-bet, and 5-bet at frequencies
 * matching their persona config. Tests that aggressive pros (Twan, Pantonius,
 * Velbst) escalate significantly more than passive personas (Tight Tony,
 * Calling Carl). Also tests backward compatibility — profiles without
 * explicit escalation fields fall back to the original formula.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, simulateEscalationStats, type BotProfile, type DecisionContext } from '../app/utils/botDecision'
import config from '../holdem.config'

const N = 100000 // hands per escalation test

// ─── Helpers ──────────────────────────────────────────────────

function getPersona(name: string): BotProfile & { name: string } {
  const p = config.personas.find(per => per.name === name)!
  return {
    name: p.name,
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression,
    bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq,
    threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
    fiveBetFreq: p.fiveBetFreq,
  }
}

const TOLERANCE = 0.04 // ±4% tolerance for escalation rates

// ─── Dom Twan — Hyper-Aggressive LAG ──────────────────────────

describe('Dom Twan — preflop escalation', () => {
  const dwan = getPersona('Dom Twan')
  let stats: ReturnType<typeof simulateEscalationStats>

  it('simulates escalation stats', () => {
    stats = simulateEscalationStats(dwan, N)
    expect(stats).toBeDefined()
  })

  it('3-bets at ~20% facing an open raise', () => {
    expect(stats.threeBetRate).toBeGreaterThan(dwan.threeBetFreq! - TOLERANCE)
    expect(stats.threeBetRate).toBeLessThan(dwan.threeBetFreq! + TOLERANCE)
  })

  it('4-bets at ~9% facing a 3-bet', () => {
    expect(stats.fourBetRate).toBeGreaterThan(dwan.fourBetFreq! - TOLERANCE)
    expect(stats.fourBetRate).toBeLessThan(dwan.fourBetFreq! + TOLERANCE)
  })

  it('5-bets at ~2% facing a 4-bet', () => {
    expect(stats.fiveBetRate).toBeGreaterThan(dwan.fiveBetFreq! - 0.015)
    expect(stats.fiveBetRate).toBeLessThan(dwan.fiveBetFreq! + 0.015)
  })

  it('does NOT fold most of the time vs 3-bets (calls or 4-bets)', () => {
    const continueRate = 1 - stats.foldTo3Bet
    expect(continueRate).toBeGreaterThan(0.15) // at least 15% continue vs 3-bet
  })

  it('never call-folds at high frequency (the original bug)', () => {
    // Twan should NOT fold >85% to 3-bets — he continues with 4-bet + flat call
    expect(stats.foldTo3Bet).toBeLessThan(0.88)
  })
})

// ─── Aatrik Pantonius — Aggressive High-Stakes Reg ─────────────

describe('Aatrik Pantonius — preflop escalation', () => {
  const antonius = getPersona('Aatrik Pantonius')
  let stats: ReturnType<typeof simulateEscalationStats>

  it('simulates escalation stats', () => {
    stats = simulateEscalationStats(antonius, N)
    expect(stats).toBeDefined()
  })

  it('3-bets at ~16%', () => {
    expect(stats.threeBetRate).toBeGreaterThan(antonius.threeBetFreq! - TOLERANCE)
    expect(stats.threeBetRate).toBeLessThan(antonius.threeBetFreq! + TOLERANCE)
  })

  it('4-bets at ~7%', () => {
    expect(stats.fourBetRate).toBeGreaterThan(antonius.fourBetFreq! - TOLERANCE)
    expect(stats.fourBetRate).toBeLessThan(antonius.fourBetFreq! + TOLERANCE)
  })
})

// ─── Sanessa Velbst — Fearless 3-bettor ───────────────────────

describe('Sanessa Velbst — preflop escalation', () => {
  const selbst = getPersona('Sanessa Velbst')
  let stats: ReturnType<typeof simulateEscalationStats>

  it('simulates escalation stats', () => {
    stats = simulateEscalationStats(selbst, N)
  })

  it('3-bets at ~18%', () => {
    expect(stats.threeBetRate).toBeGreaterThan(selbst.threeBetFreq! - TOLERANCE)
    expect(stats.threeBetRate).toBeLessThan(selbst.threeBetFreq! + TOLERANCE)
  })

  it('4-bets at ~8%', () => {
    expect(stats.fourBetRate).toBeGreaterThan(selbst.fourBetFreq! - TOLERANCE)
    expect(stats.fourBetRate).toBeLessThan(selbst.fourBetFreq! + TOLERANCE)
  })
})

// ─── Wild Wendy — Maximum Fictional Aggression ────────────────

describe('Wild Wendy — preflop escalation', () => {
  const wendy = getPersona('Wild Wendy')
  let stats: ReturnType<typeof simulateEscalationStats>

  it('simulates escalation stats', () => {
    stats = simulateEscalationStats(wendy, N)
  })

  it('3-bets at ~22% (highest of all personas)', () => {
    expect(stats.threeBetRate).toBeGreaterThan(wendy.threeBetFreq! - TOLERANCE)
    expect(stats.threeBetRate).toBeLessThan(wendy.threeBetFreq! + TOLERANCE)
  })

  it('4-bets at ~10%', () => {
    expect(stats.fourBetRate).toBeGreaterThan(wendy.fourBetFreq! - TOLERANCE)
    expect(stats.fourBetRate).toBeLessThan(wendy.fourBetFreq! + TOLERANCE)
  })
})

// ─── Tight Tony — Passive, Low Escalation ─────────────────────

describe('Tight Tony — preflop escalation', () => {
  const tony = getPersona('Tight Tony')
  let stats: ReturnType<typeof simulateEscalationStats>

  it('simulates escalation stats', () => {
    stats = simulateEscalationStats(tony, N)
  })

  it('3-bets at only ~5%', () => {
    expect(stats.threeBetRate).toBeGreaterThan(tony.threeBetFreq! - TOLERANCE)
    expect(stats.threeBetRate).toBeLessThan(tony.threeBetFreq! + TOLERANCE)
  })

  it('almost never 4-bets (~2%)', () => {
    expect(stats.fourBetRate).toBeLessThan(0.05)
  })

  it('folds to 3-bets most of the time', () => {
    expect(stats.foldTo3Bet).toBeGreaterThan(0.50)
  })
})

// ─── Calling Carl — Calls but doesn't raise ───────────────────

describe('Calling Carl — preflop escalation', () => {
  const carl = getPersona('Calling Carl')
  let stats: ReturnType<typeof simulateEscalationStats>

  it('simulates escalation stats', () => {
    stats = simulateEscalationStats(carl, N)
  })

  it('3-bets at only ~4%', () => {
    expect(stats.threeBetRate).toBeLessThan(0.08)
  })

  it('virtually never 4-bets', () => {
    expect(stats.fourBetRate).toBeLessThan(0.04)
  })
})

// ─── Comparative: Aggressive > Passive at all levels ──────────

describe('Escalation ordering — aggressive personas > passive', () => {
  const dwan = getPersona('Dom Twan')
  const tony = getPersona('Tight Tony')
  const carl = getPersona('Calling Carl')
  const wendy = getPersona('Wild Wendy')
  const alex = getPersona('Aggressive Alex')

  let dwanStats: ReturnType<typeof simulateEscalationStats>
  let tonyStats: ReturnType<typeof simulateEscalationStats>
  let carlStats: ReturnType<typeof simulateEscalationStats>
  let wendyStats: ReturnType<typeof simulateEscalationStats>
  let alexStats: ReturnType<typeof simulateEscalationStats>

  it('simulates all personas', () => {
    dwanStats = simulateEscalationStats(dwan, N)
    tonyStats = simulateEscalationStats(tony, N)
    carlStats = simulateEscalationStats(carl, N)
    wendyStats = simulateEscalationStats(wendy, N)
    alexStats = simulateEscalationStats(alex, N)
  })

  it('Twan 3-bets more than Tony', () => {
    expect(dwanStats.threeBetRate).toBeGreaterThan(tonyStats.threeBetRate)
  })

  it('Twan 4-bets more than Tony', () => {
    expect(dwanStats.fourBetRate).toBeGreaterThan(tonyStats.fourBetRate)
  })

  it('Wild Wendy 3-bets more than Calling Carl', () => {
    expect(wendyStats.threeBetRate).toBeGreaterThan(carlStats.threeBetRate)
  })

  it('Aggressive Alex 3-bets more than Tight Tony', () => {
    expect(alexStats.threeBetRate).toBeGreaterThan(tonyStats.threeBetRate)
  })

  it('All aggressive personas 3-bet at >7%', () => {
    // Pros retuned to realistic live frequencies (Dwan 12%); fictional
    // teaching caricatures (Wendy 22%, Alex 16%) stay hot
    expect(dwanStats.threeBetRate).toBeGreaterThan(0.07)
    expect(wendyStats.threeBetRate).toBeGreaterThan(0.10)
    expect(alexStats.threeBetRate).toBeGreaterThan(0.10)
  })

  it('All passive personas 3-bet at <10%', () => {
    expect(tonyStats.threeBetRate).toBeLessThan(0.10)
    expect(carlStats.threeBetRate).toBeLessThan(0.10)
  })
})

// ─── Backward Compatibility ───────────────────────────────────

describe('Backward compatibility — profiles without escalation fields', () => {
  const legacyProfile: BotProfile = {
    vpip: 0.25, pfr: 0.20, aggression: 1.20,
    bluffFreq: 0.14, creativeFreq: 0.05,
    // No threeBetFreq/fourBetFreq/fiveBetFreq
  }

  it('falls back to formula: pfr * 0.35 * aggression for 3-bet', () => {
    const bb = 2
    let raises = 0
    const n = 50000

    for (let i = 0; i < n; i++) {
      const action = decideBotAction(legacyProfile, {
        street: 'preflop', toCall: bb * 2.5, pot: bb * 4,
        currentBet: bb * 2.5, playerBet: 0, chips: 200,
        bb, numActivePlayers: 5, raiseLevel: 1,
      })
      if (action.type === 'raise') raises++
    }

    const expected = legacyProfile.pfr * 0.35 * legacyProfile.aggression // 0.084
    const observed = raises / n
    expect(observed).toBeGreaterThan(expected - 0.03)
    expect(observed).toBeLessThan(expected + 0.03)
  })

  it('uses ~1% default for 5-bet when field is missing', () => {
    const bb = 2
    let raises = 0
    const n = 50000

    for (let i = 0; i < n; i++) {
      const action = decideBotAction(legacyProfile, {
        street: 'preflop', toCall: bb * 20, pot: bb * 30,
        currentBet: bb * 20, playerBet: 0, chips: 200,
        bb, numActivePlayers: 3, raiseLevel: 3,
      })
      if (action.type === 'raise') raises++
    }

    const observed = raises / n
    expect(observed).toBeGreaterThan(0)
    expect(observed).toBeLessThan(0.04) // should be near 1%
  })
})

// ─── Preflop Scenario Tests ───────────────────────────────────

describe('Preflop scenarios — realistic action sequences', () => {
  const bb = 2

  it('aggressive bot re-raises when facing an open (not just call-fold)', () => {
    const dwan = getPersona('Dom Twan')
    let raises = 0
    let calls = 0
    let folds = 0
    const n = 10000

    for (let i = 0; i < n; i++) {
      const action = decideBotAction(dwan, {
        street: 'preflop', toCall: bb * 2.5, pot: bb * 4,
        currentBet: bb * 2.5, playerBet: 0, chips: 200,
        bb, numActivePlayers: 5, raiseLevel: 1,
      })
      if (action.type === 'raise') raises++
      else if (action.type === 'call') calls++
      else folds++
    }

    // Twan should 3-bet ~8% of the time (retuned to realistic live full-ring
    // frequency, was 20%), not just call
    expect(raises / n).toBeGreaterThan(0.05)
    // Twan either 3-bets or folds — he's an aggressor, not a caller.
    // No position in this ctx → treated as OOP, where even a LAG's continue
    // range is ~12-15%. The point is non-trivial engagement, not a station.
    expect((raises + calls) / n).toBeGreaterThan(0.10)
  })

  it('aggressive bot 4-bets facing a 3-bet (not fold)', () => {
    const dwan = getPersona('Dom Twan')
    let raises = 0
    let folds = 0
    const n = 10000

    for (let i = 0; i < n; i++) {
      const action = decideBotAction(dwan, {
        street: 'preflop', toCall: bb * 7.5, pot: bb * 12,
        currentBet: bb * 7.5, playerBet: 0, chips: 200,
        bb, numActivePlayers: 4, raiseLevel: 2,
      })
      if (action.type === 'raise') raises++
      else if (action.type === 'fold') folds++
    }

    // Twan should 4-bet ~4% (live full-ring realism; was ~9%)
    expect(raises / n).toBeGreaterThan(0.025)
    // Should not fold too often. True rate measured at 0.8466 ± 0.0006
    // (200k hands × 5 seeds); the old < 0.85 band left only 0.34pp of
    // margin against a 0.36pp sampling σ at n=10k — it failed on any +1σ
    // draw, which was THE recurring CI flake before the suite was seeded.
    expect(folds / n).toBeLessThan(0.87)
  })

  it('passive bot mostly folds to escalation', () => {
    const tony = getPersona('Tight Tony')
    let folds = 0
    const n = 10000

    for (let i = 0; i < n; i++) {
      const action = decideBotAction(tony, {
        street: 'preflop', toCall: bb * 7.5, pot: bb * 12,
        currentBet: bb * 7.5, playerBet: 0, chips: 200,
        bb, numActivePlayers: 4, raiseLevel: 2,
      })
      if (action.type === 'fold') folds++
    }

    // Tony should fold most of the time to 3-bets
    expect(folds / n).toBeGreaterThan(0.60)
  })

  it('facing 5-bet+, almost everyone folds (only ~1% continue)', () => {
    const ivey = getPersona('Ihil Pvey')
    let folds = 0
    const n = 10000

    for (let i = 0; i < n; i++) {
      const action = decideBotAction(ivey, {
        street: 'preflop', toCall: bb * 50, pot: bb * 80,
        currentBet: bb * 50, playerBet: 0, chips: 200,
        bb, numActivePlayers: 2, raiseLevel: 4,
      })
      if (action.type === 'fold') folds++
    }

    expect(folds / n).toBeGreaterThan(0.95) // ~99% fold
  })
})

// ─── All Personas Escalation Validation ───────────────────────

describe('All personas — escalation stats within tolerance', () => {
  const allPersonas = config.personas.map(p => ({
    name: p.name,
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression,
    bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq,
    threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
    fiveBetFreq: p.fiveBetFreq,
  }))

  for (const persona of allPersonas) {
    it(`${persona.name} — 3-bet rate aligns with config (${persona.threeBetFreq})`, () => {
      const stats = simulateEscalationStats(persona, 50000)
      expect(stats.threeBetRate).toBeGreaterThan(persona.threeBetFreq! - TOLERANCE)
      expect(stats.threeBetRate).toBeLessThan(persona.threeBetFreq! + TOLERANCE)
    })
  }
})
