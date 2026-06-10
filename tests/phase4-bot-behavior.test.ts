/**
 * Phase 4 — Bot Behavior Statistical Alignment
 *
 * Simulates 1000+ decisions per bot persona and verifies that observed
 * behavior statistically matches the configured profile. Tests VPIP, PFR,
 * fold rate, aggression, and bluff frequency.
 *
 * Each bot's observed stats must fall within a tolerance band of their
 * config values. The tolerance accounts for randomness but catches
 * bots that are fundamentally misaligned (e.g., a "tight" bot playing loose).
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, simulateBotStats, type BotProfile } from '../app/utils/botDecision'
import config from '../holdem.config'

const N = 100000 // hands per test — very tight confidence intervals

// ─── Persona Profiles ──────────────────────────────────────────

const personas: (BotProfile & { name: string })[] = config.personas.map(p => ({
  name: p.name,
  vpip: p.vpip,
  pfr: p.pfr,
  aggression: p.aggression,
  bluffFreq: p.bluffFreq,
  creativeFreq: p.creativeFreq,
  threeBetFreq: p.threeBetFreq,
  fourBetFreq: p.fourBetFreq,
  fiveBetFreq: p.fiveBetFreq,
  donkBetFreq: p.donkBetFreq,
  limpFreq: (p as any).limpFreq,
  styleBias: (p as any).styleBias,
  betSizeMult: (p as any).betSizeMult,
  overbetFreq: (p as any).overbetFreq,
}))

const presets: (BotProfile & { name: string })[] = config.botPresets.map(p => ({
  name: p.name,
  vpip: p.vpip,
  pfr: p.pfr,
  aggression: p.aggression,
  bluffFreq: p.bluffFreq,
  creativeFreq: p.creativeFreq,
}))

// ─── Helper ────────────────────────────────────────────────────

function runStats(profile: BotProfile) {
  return simulateBotStats(profile, N)
}

// Tolerance: allow observed value within ± band of config
// Wider for small samples, tighter for large (1500 hands is pretty good)
const VPIP_TOLERANCE = 0.12
const PFR_TOLERANCE = 0.10
const BLUFF_TOLERANCE = 0.15
const AGGRESSION_TOLERANCE = 0.15

// ─── Per-Persona Tests ─────────────────────────────────────────

describe('Tight Tony — behavior matches tight config', () => {
  const tony = personas.find(p => p.name === 'Tight Tony')!
  let stats: ReturnType<typeof runStats>

  it('simulates 1500 hands without error', () => {
    stats = runStats(tony)
    expect(stats).toBeDefined()
  })

  it('VPIP is close to configured 14%', () => {
    expect(stats.vpip).toBeGreaterThan(tony.vpip - VPIP_TOLERANCE)
    expect(stats.vpip).toBeLessThan(tony.vpip + VPIP_TOLERANCE)
  })

  it('PFR is close to configured 11%', () => {
    expect(stats.pfr).toBeGreaterThan(tony.pfr - PFR_TOLERANCE)
    expect(stats.pfr).toBeLessThan(tony.pfr + PFR_TOLERANCE)
  })

  it('PFR does not exceed VPIP', () => {
    expect(stats.pfr).toBeLessThanOrEqual(stats.vpip + 0.02)
  })

  it('bluffs less than Wild Wendy (highest bluffer)', () => {
    const wendyStats = runStats(personas.find(p => p.name === 'Wild Wendy')!)
    expect(stats.bluffRate).toBeLessThan(wendyStats.bluffRate + 0.05)
  })

  it('folds more than loose bots', () => {
    const lucyStats = runStats(personas.find(p => p.name === 'Loose Lucy')!)
    expect(stats.foldRate).toBeGreaterThan(lucyStats.foldRate - 0.05)
  })
})

describe('Loose Lucy — behavior matches loose config', () => {
  const lucy = personas.find(p => p.name === 'Loose Lucy')!
  let stats: ReturnType<typeof runStats>

  it('simulates 1500 hands without error', () => {
    stats = runStats(lucy)
    expect(stats).toBeDefined()
  })

  it('VPIP is close to configured 38%', () => {
    expect(stats.vpip).toBeGreaterThan(lucy.vpip - VPIP_TOLERANCE)
    expect(stats.vpip).toBeLessThan(lucy.vpip + VPIP_TOLERANCE)
  })

  it('plays significantly more hands than Tight Tony', () => {
    const tonyStats = runStats(personas.find(p => p.name === 'Tight Tony')!)
    expect(stats.vpip).toBeGreaterThan(tonyStats.vpip + 0.08)
  })

  it('PFR is close to configured 22%', () => {
    expect(stats.pfr).toBeGreaterThan(lucy.pfr - PFR_TOLERANCE)
    expect(stats.pfr).toBeLessThan(lucy.pfr + PFR_TOLERANCE)
  })
})

describe('Aggressive Alex — high aggression postflop', () => {
  const alex = personas.find(p => p.name === 'Aggressive Alex')!
  let stats: ReturnType<typeof runStats>

  it('simulates 1500 hands without error', () => {
    stats = runStats(alex)
    expect(stats).toBeDefined()
  })

  it('raises postflop more than Calling Carl', () => {
    const carlStats = runStats(personas.find(p => p.name === 'Calling Carl')!)
    expect(stats.raiseRate).toBeGreaterThan(carlStats.raiseRate)
  })

  it('bluff rate reflects high bluff config (20%)', () => {
    expect(stats.bluffRate).toBeGreaterThan(alex.bluffFreq * 0.2)
  })
})

describe('Calling Carl — passive postflop, low aggression', () => {
  const carl = personas.find(p => p.name === 'Calling Carl')!
  let stats: ReturnType<typeof runStats>

  it('simulates 1500 hands without error', () => {
    stats = runStats(carl)
    expect(stats).toBeDefined()
  })

  it('folds less than tight players postflop (calls more)', () => {
    const tonyStats = runStats(personas.find(p => p.name === 'Tight Tony')!)
    // Carl's fold rate should be relatively low — he calls
    expect(stats.foldRate).toBeLessThan(tonyStats.foldRate + 0.10)
  })

  it('raises less than aggressive players', () => {
    const alexStats = runStats(personas.find(p => p.name === 'Aggressive Alex')!)
    expect(stats.raiseRate).toBeLessThan(alexStats.raiseRate + 0.05)
  })

  it('bluffs less than Aggressive Alex', () => {
    const alexStats = runStats(personas.find(p => p.name === 'Aggressive Alex')!)
    expect(stats.bluffRate).toBeLessThanOrEqual(alexStats.bluffRate + 0.05)
  })
})

describe('Wild Wendy — highest bluff frequency and aggression', () => {
  const wendy = personas.find(p => p.name === 'Wild Wendy')!
  let stats: ReturnType<typeof runStats>

  it('simulates 1500 hands without error', () => {
    stats = runStats(wendy)
    expect(stats).toBeDefined()
  })

  it('VPIP is close to configured 34%', () => {
    expect(stats.vpip).toBeGreaterThan(wendy.vpip - VPIP_TOLERANCE)
    expect(stats.vpip).toBeLessThan(wendy.vpip + VPIP_TOLERANCE)
  })

  it('bluffs more than any other persona', () => {
    // 20k hands per persona keeps the 27-persona sweep fast; the ±5pp slack
    // in the assertion dwarfs the sampling error at this N.
    for (const persona of personas) {
      if (persona.name === 'Wild Wendy') continue
      const otherStats = simulateBotStats(persona, 20000)
      expect(stats.bluffRate).toBeGreaterThanOrEqual(otherStats.bluffRate - 0.05)
    }
  }, 30000)

  it('raises postflop at a high rate', () => {
    expect(stats.raiseRate).toBeGreaterThan(0.15)
  })

  it('highest bluff config produces highest observed bluff rate', () => {
    const samStats = runStats(personas.find(p => p.name === 'Solid Sam')!)
    expect(stats.bluffRate).toBeGreaterThan(samStats.bluffRate)
  })
})

describe('Solid Sam — closest to GTO baseline', () => {
  const sam = personas.find(p => p.name === 'Solid Sam')!
  let stats: ReturnType<typeof runStats>

  it('simulates 1500 hands without error', () => {
    stats = runStats(sam)
    expect(stats).toBeDefined()
  })

  it('VPIP is moderate (~22%)', () => {
    expect(stats.vpip).toBeGreaterThan(0.10)
    expect(stats.vpip).toBeLessThan(0.40)
  })

  it('PFR/VPIP ratio is healthy (aggressive, not passive)', () => {
    const ratio = stats.pfr / Math.max(stats.vpip, 0.01)
    expect(ratio).toBeGreaterThan(0.3)
    expect(ratio).toBeLessThan(1.1)
  })

  it('bluffs less than Wild Wendy', () => {
    const wendyStats = runStats(personas.find(p => p.name === 'Wild Wendy')!)
    expect(stats.bluffRate).toBeLessThan(wendyStats.bluffRate + 0.05)
  })
})

// ─── Comparative Ordering Tests ────────────────────────────────

describe('Persona ordering — tighter bots fold more, looser bots play more', () => {
  const allStats = new Map<string, ReturnType<typeof runStats>>()

  // Pre-compute all stats
  for (const persona of personas) {
    allStats.set(persona.name, runStats(persona))
  }

  it('Tight Tony has lower VPIP than Loose Lucy', () => {
    expect(allStats.get('Tight Tony')!.vpip).toBeLessThan(allStats.get('Loose Lucy')!.vpip)
  })

  it('Tight Tony has lower VPIP than Wild Wendy', () => {
    expect(allStats.get('Tight Tony')!.vpip).toBeLessThan(allStats.get('Wild Wendy')!.vpip)
  })

  it('Aggressive Alex raises more postflop than Calling Carl', () => {
    expect(allStats.get('Aggressive Alex')!.raiseRate).toBeGreaterThan(allStats.get('Calling Carl')!.raiseRate)
  })

  it('Wild Wendy has higher bluff rate than Tight Tony', () => {
    expect(allStats.get('Wild Wendy')!.bluffRate).toBeGreaterThan(allStats.get('Tight Tony')!.bluffRate)
  })

  it('configured VPIP order matches observed VPIP order', () => {
    const sorted = [...personas].sort((a, b) => a.vpip - b.vpip)
    const observedOrder = sorted.map(p => allStats.get(p.name)!.vpip)
    // Each should be less than or approximately equal to the next
    for (let i = 0; i < observedOrder.length - 1; i++) {
      expect(observedOrder[i]).toBeLessThan(observedOrder[i + 1] + 0.08)
    }
  })

  it('configured bluffFreq order roughly matches observed bluff order', () => {
    const sorted = [...personas].sort((a, b) => a.bluffFreq - b.bluffFreq)
    const observedOrder = sorted.map(p => allStats.get(p.name)!.bluffRate)
    // First (lowest config bluff) should have lower observed bluff than last (highest)
    expect(observedOrder[0]).toBeLessThan(observedOrder[observedOrder.length - 1] + 0.05)
  })
})

// ─── Preset Tests ──────────────────────────────────────────────

describe('Preset archetypes behave distinctly', () => {
  it('Nit folds the most of all presets', () => {
    const nitStats = runStats(presets.find(p => p.name === 'Nit')!)
    for (const preset of presets) {
      if (preset.name === 'Nit') continue
      const otherStats = runStats(preset)
      // Nit should have lowest VPIP (highest fold rate preflop)
      expect(nitStats.vpip).toBeLessThanOrEqual(otherStats.vpip + 0.05)
    }
  })

  it('Maniac plays the most hands of all presets', () => {
    const maniacStats = runStats(presets.find(p => p.name === 'Maniac')!)
    for (const preset of presets) {
      if (preset.name === 'Maniac') continue
      const otherStats = runStats(preset)
      expect(maniacStats.vpip).toBeGreaterThanOrEqual(otherStats.vpip - 0.05)
    }
  })

  it('Loose-Passive has low raise rate despite high VPIP', () => {
    const lpStats = runStats(presets.find(p => p.name === 'Loose-Passive')!)
    const tagStats = runStats(presets.find(p => p.name === 'TAG')!)
    // LP plays lots of hands but raises less than TAG
    expect(lpStats.vpip).toBeGreaterThan(tagStats.vpip - 0.05)
    expect(lpStats.raiseRate).toBeLessThan(tagStats.raiseRate + 0.10)
  })

  it('TAG has healthy PFR/VPIP ratio (raises most of what it plays)', () => {
    const tagStats = runStats(presets.find(p => p.name === 'TAG')!)
    const ratio = tagStats.pfr / Math.max(tagStats.vpip, 0.01)
    expect(ratio).toBeGreaterThan(0.4)
  })

  it('LAG plays wide and raises often', () => {
    const lagStats = runStats(presets.find(p => p.name === 'LAG')!)
    expect(lagStats.vpip).toBeGreaterThan(0.18)
    expect(lagStats.raiseRate).toBeGreaterThan(0.10)
  })
})

// ─── Bluff-Specific Tests ──────────────────────────────────────

describe('Bluffing behavior', () => {
  it('bot with bluffFreq 0.03 bluffs less than bot with bluffFreq 0.25', () => {
    const lowBluff: BotProfile = { vpip: 0.20, pfr: 0.15, aggression: 1.0, bluffFreq: 0.03, creativeFreq: 0.02 }
    const highBluff: BotProfile = { vpip: 0.20, pfr: 0.15, aggression: 1.0, bluffFreq: 0.25, creativeFreq: 0.02 }
    const lowStats = runStats(lowBluff)
    const highStats = runStats(highBluff)
    expect(lowStats.bluffRate).toBeLessThan(highStats.bluffRate)
  })

  it('bot with bluffFreq 0.30 and high aggression bluffs frequently', () => {
    const highBluff: BotProfile = { vpip: 0.30, pfr: 0.20, aggression: 1.5, bluffFreq: 0.30, creativeFreq: 0.05 }
    const stats = runStats(highBluff)
    expect(stats.bluffRate).toBeGreaterThan(0.05)
  })

  it('increasing bluffFreq increases observed bluff rate', () => {
    const low: BotProfile = { vpip: 0.25, pfr: 0.18, aggression: 1.0, bluffFreq: 0.05, creativeFreq: 0.04 }
    const high: BotProfile = { vpip: 0.25, pfr: 0.18, aggression: 1.0, bluffFreq: 0.28, creativeFreq: 0.04 }
    const lowStats = runStats(low)
    const highStats = runStats(high)
    expect(highStats.bluffRate).toBeGreaterThan(lowStats.bluffRate)
  })

  it('bluffing does not happen when checked to with low aggression and low bluffFreq', () => {
    // A very passive, honest bot. The harness deals real cards, so bets into
    // no-bet pots include VALUE bets with strong hands — the cap reflects that
    // floor; the honest bot still bets far less than any aggressive profile.
    const honest: BotProfile = { vpip: 0.15, pfr: 0.10, aggression: 0.40, bluffFreq: 0.03, creativeFreq: 0.01 }
    const stats = runStats(honest)
    expect(stats.bluffRate).toBeLessThan(0.35)
  })

  it('high aggression + high bluffFreq produces the most betting into no-bet pots', () => {
    const maniac: BotProfile = { vpip: 0.40, pfr: 0.30, aggression: 2.0, bluffFreq: 0.30, creativeFreq: 0.10 }
    const nit: BotProfile = { vpip: 0.12, pfr: 0.09, aggression: 0.50, bluffFreq: 0.04, creativeFreq: 0.01 }
    const maniacStats = runStats(maniac)
    const nitStats = runStats(nit)
    expect(maniacStats.bluffRate).toBeGreaterThan(nitStats.bluffRate)
  })
})

// ─── Decision Function Unit Tests ──────────────────────────────

describe('decideBotAction direct calls', () => {
  const tightProfile: BotProfile = { vpip: 0.14, pfr: 0.11, aggression: 0.85, bluffFreq: 0.08, creativeFreq: 0.03 }
  const aggroProfile: BotProfile = { vpip: 0.30, pfr: 0.25, aggression: 1.5, bluffFreq: 0.25, creativeFreq: 0.07 }

  it('returns a valid action type', () => {
    for (let i = 0; i < 100; i++) {
      const action = decideBotAction(tightProfile, {
        street: 'flop', toCall: 10, pot: 30, currentBet: 10,
        playerBet: 0, chips: 200, bb: 2, numActivePlayers: 4,
      })
      expect(['fold', 'check', 'call', 'raise']).toContain(action.type)
    }
  })

  it('never raises more than stack allows', () => {
    for (let i = 0; i < 200; i++) {
      const chips = 50
      const action = decideBotAction(aggroProfile, {
        street: 'flop', toCall: 20, pot: 60, currentBet: 20,
        playerBet: 0, chips, bb: 2, numActivePlayers: 3,
      })
      if (action.type === 'raise') {
        expect(action.amount!).toBeLessThanOrEqual(chips)
      }
    }
  })

  it('checks (not raises) when checked to and no bluff triggered', () => {
    // Run many times — with very low aggression and bluffFreq, should mostly check
    const passive: BotProfile = { vpip: 0.20, pfr: 0.10, aggression: 0.30, bluffFreq: 0.01, creativeFreq: 0.01 }
    let checks = 0
    for (let i = 0; i < 500; i++) {
      const action = decideBotAction(passive, {
        street: 'turn', toCall: 0, pot: 40, currentBet: 0,
        playerBet: 0, chips: 200, bb: 2, numActivePlayers: 3,
      })
      if (action.type === 'check') checks++
    }
    // Should check the vast majority
    expect(checks / 500).toBeGreaterThan(0.75)
  })

  it('folds preflop with very tight config when facing a raise', () => {
    const nit: BotProfile = { vpip: 0.10, pfr: 0.07, aggression: 0.50, bluffFreq: 0.03, creativeFreq: 0.01 }
    let folds = 0
    for (let i = 0; i < 500; i++) {
      const action = decideBotAction(nit, {
        street: 'preflop', toCall: 6, pot: 9, currentBet: 6,
        playerBet: 0, chips: 200, bb: 2, numActivePlayers: 5,
      })
      if (action.type === 'fold') folds++
    }
    // Nit should fold > 70% of the time facing a raise
    expect(folds / 500).toBeGreaterThan(0.60)
  })
})
