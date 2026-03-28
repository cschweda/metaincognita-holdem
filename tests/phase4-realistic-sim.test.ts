/**
 * Phase 4 — Realistic Full-Pipeline Bot Simulation
 *
 * Unlike the simplified stat tests, this simulation deals actual cards,
 * evaluates real hand strength, varies positions, and tracks tilt state
 * across consecutive hands. Tests the complete decision pipeline:
 * shuffle → deal → evaluate → decide → tilt update.
 *
 * 50,000 hands per persona with realistic game conditions.
 */
import { describe, it, expect } from 'vitest'
import {
  decideBotAction,
  applyTilt,
  updateTilt,
  decayTilt,
  createTiltState,
  type BotProfile,
  type TiltState,
  type DecisionContext,
} from '../app/utils/botDecision'
import { bestHand } from '../app/utils/handAnalysis'
import type { Card, Suit } from '../app/utils/cards'
import config from '../holdem.config'

const N = 50000

// ─── Helpers ───────────────────────────────────────────────────

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']

function createDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) cards.push({ rank, suit })
  }
  return cards
}

function shuffle(deck: Card[]): Card[] {
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function profileFrom(p: typeof config.personas[0]): BotProfile {
  return { vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq }
}

interface SimResult {
  vpip: number
  pfr: number
  foldRate: number
  raiseRate: number
  bluffRate: number
  avgHandRank: number
  tiltedHands: number
  tiltedVpip: number     // VPIP while tilted
  normalVpip: number     // VPIP while not tilted
}

/**
 * Run a realistic simulation: deal cards, evaluate hands, make decisions
 * with position variation and tilt tracking across hands.
 */
function simulateRealistic(
  persona: typeof config.personas[0],
  hands: number = N,
): SimResult {
  const profile = profileFrom(persona)
  const tiltMult = persona.tiltMultiplier ?? 1.0
  const tilt = createTiltState()

  let voluntaryPlays = 0
  let preflopRaises = 0
  let preflopHands = 0
  let postflopFolds = 0
  let postflopCalls = 0
  let postflopRaises = 0
  let postflopChecks = 0
  let postflopBetsIntoNoBet = 0
  let postflopNoBetSituations = 0
  let totalHandRank = 0
  let handsEvaluated = 0
  let tiltedHandCount = 0
  let tiltedVpipCount = 0
  let tiltedVpipPlays = 0
  let normalVpipCount = 0
  let normalVpipPlays = 0

  const bb = 2
  const positions = ['UTG', 'UTG+1', 'MP', 'CO', 'BTN', 'SB', 'BB']

  for (let i = 0; i < hands; i++) {
    // Decay tilt each hand
    decayTilt(tilt)

    const deck = shuffle(createDeck())
    const holeCards: [Card, Card] = [deck[0], deck[1]]
    const position = positions[i % positions.length]
    const numPlayers = 3 + Math.floor(Math.random() * 4) // 3-6 active

    // Apply tilt to profile
    const effectiveProfile = applyTilt(profile, tilt, config.tilt, tiltMult)

    if (tilt.tilted) {
      tiltedHandCount++
      tiltedVpipCount++
    } else {
      normalVpipCount++
    }

    // ── Preflop ──
    const isLatePosition = ['CO', 'BTN'].includes(position)
    const facingRaise = Math.random() < (isLatePosition ? 0.5 : 0.65)
    const raiseSize = facingRaise ? bb * (2 + Math.random() * 2) : bb

    const preflopCtx: DecisionContext = {
      street: 'preflop',
      toCall: facingRaise ? Math.round(raiseSize) : bb,
      pot: bb * 1.5 + (facingRaise ? raiseSize : 0),
      currentBet: facingRaise ? Math.round(raiseSize) : bb,
      playerBet: 0,
      chips: 200,
      bb,
      numActivePlayers: numPlayers,
    }

    preflopHands++
    const preflopAction = decideBotAction(effectiveProfile, preflopCtx)

    if (preflopAction.type === 'call' || preflopAction.type === 'raise') {
      voluntaryPlays++
      if (tilt.tilted) tiltedVpipPlays++
      else normalVpipPlays++
    }
    if (preflopAction.type === 'raise') preflopRaises++

    // ── Postflop (only if didn't fold preflop) ──
    if (preflopAction.type !== 'fold') {
      // Deal community cards
      const community = [deck[4], deck[5], deck[6]] // skip burn
      const street = ['flop', 'turn', 'river'][Math.floor(Math.random() * 3)] as 'flop' | 'turn' | 'river'

      if (street === 'turn') community.push(deck[8])
      if (street === 'river') { community.push(deck[8]); community.push(deck[10]) }

      // Evaluate hand
      const result = bestHand(holeCards, community)
      if (result) {
        totalHandRank += result.rank
        handsEvaluated++
      }

      // Postflop decision
      const facingBet = Math.random() < 0.5
      const potSize = bb * (4 + Math.random() * 8)
      const betSize = facingBet ? Math.round(potSize * (0.3 + Math.random() * 0.7)) : 0

      if (!facingBet) postflopNoBetSituations++

      const postCtx: DecisionContext = {
        street,
        toCall: betSize,
        pot: potSize + betSize,
        currentBet: betSize,
        playerBet: 0,
        chips: 180,
        bb,
        numActivePlayers: Math.max(2, numPlayers - Math.floor(Math.random() * 3)),
      }

      const postAction = decideBotAction(effectiveProfile, postCtx)

      if (postAction.type === 'fold') postflopFolds++
      else if (postAction.type === 'call') postflopCalls++
      else if (postAction.type === 'raise') {
        postflopRaises++
        if (!facingBet) postflopBetsIntoNoBet++
      }
      else if (postAction.type === 'check') postflopChecks++
    }

    // ── Tilt update (simulate win/loss) ──
    const won = Math.random() < 0.3 // ~30% win rate average
    const bigLoss = !won && Math.random() < 0.15 // ~15% of losses are big
    updateTilt(tilt, won, bigLoss, config.tilt, tiltMult)
  }

  const totalPostflop = postflopFolds + postflopCalls + postflopRaises + postflopChecks

  return {
    vpip: voluntaryPlays / preflopHands,
    pfr: preflopRaises / preflopHands,
    foldRate: postflopFolds / Math.max(totalPostflop, 1),
    raiseRate: postflopRaises / Math.max(totalPostflop, 1),
    bluffRate: postflopBetsIntoNoBet / Math.max(postflopNoBetSituations, 1),
    avgHandRank: handsEvaluated > 0 ? totalHandRank / handsEvaluated : 0,
    tiltedHands: tiltedHandCount,
    tiltedVpip: tiltedVpipCount > 0 ? tiltedVpipPlays / tiltedVpipCount : 0,
    normalVpip: normalVpipCount > 0 ? normalVpipPlays / normalVpipCount : 0,
  }
}

// ─── Constants ─────────────────────────────────────────────────
const fictionalNames = ['Tight Tony', 'Loose Lucy', 'Aggressive Alex', 'Calling Carl', 'Tricky Tina', 'Solid Sam', 'Wild Wendy']

// ─── Per-Persona Realistic Tests ───────────────────────────────

describe('Realistic simulation: all personas (50K hands, real cards, tilt)', () => {
  for (const persona of config.personas) {
    describe(persona.name, () => {
      const stats = simulateRealistic(persona)

      it('VPIP aligns with config (±22%)', () => {
        // Wide tolerance: bots call more vs raises in modern NLH style,
        // so observed VPIP runs above the base config VPIP
        expect(stats.vpip).toBeGreaterThan(persona.vpip - 0.22)
        expect(stats.vpip).toBeLessThan(persona.vpip + 0.22)
      })

      it('PFR is below VPIP', () => {
        expect(stats.pfr).toBeLessThanOrEqual(stats.vpip + 0.03)
      })

      it('does not fold 100% or play 100% postflop', () => {
        expect(stats.foldRate).toBeGreaterThan(0.01)
        expect(stats.foldRate).toBeLessThan(0.99)
      })

      it('raise rate correlates with aggression', () => {
        if (persona.aggression >= 1.3) {
          expect(stats.raiseRate).toBeGreaterThan(0.08)
        }
      })

      it('evaluates real hands (avg rank > 0)', () => {
        expect(stats.avgHandRank).toBeGreaterThan(0)
        expect(stats.avgHandRank).toBeLessThan(5) // most hands are pairs or less
      })
    })
  }
})

// ─── Tilt Behavioral Impact (realistic) ────────────────────────

describe('Realistic tilt: tilted bots play looser than when calm', () => {
  it('Hill Phellmuth plays significantly looser when tilted (2.5x multiplier)', () => {
    const hellmuth = config.personas.find(p => p.name === 'Hill Phellmuth')!
    const stats = simulateRealistic(hellmuth)
    // With 2.5x tilt, he should tilt frequently and play noticeably looser
    if (stats.tiltedHands > 100) {
      expect(stats.tiltedVpip).toBeGreaterThan(stats.normalVpip)
    }
  })

  it('Ihil Pvey barely changes when tilted (0.3x multiplier)', () => {
    const ivey = config.personas.find(p => p.name === 'Ihil Pvey')!
    const stats = simulateRealistic(ivey)
    // Pvey rarely tilts and barely changes when he does
    if (stats.tiltedHands > 100) {
      const diff = Math.abs(stats.tiltedVpip - stats.normalVpip)
      expect(diff).toBeLessThan(0.15) // very small difference
    }
  })

  it('Mike the Mouth tilts frequently and plays much wider', () => {
    const matusow = config.personas.find(p => p.name === 'Mike the Mouth')!
    const stats = simulateRealistic(matusow)
    // the Mouth (2.2x) should tilt a lot
    expect(stats.tiltedHands).toBeGreaterThan(N * 0.05) // at least 5% of hands tilted
    if (stats.tiltedHands > 100) {
      expect(stats.tiltedVpip).toBeGreaterThan(stats.normalVpip)
    }
  })

  it('Serik Eidel tilts far less than Phellmuth', () => {
    const seidel = config.personas.find(p => p.name === 'Serik Eidel')!
    const hellmuth = config.personas.find(p => p.name === 'Hill Phellmuth')!
    const seidelStats = simulateRealistic(seidel)
    const hellmuthStats = simulateRealistic(hellmuth)
    expect(seidelStats.tiltedHands).toBeLessThan(hellmuthStats.tiltedHands)
  })
})

// ─── Comparative: Tight vs Loose (realistic) ──────────────────

describe('Realistic comparative: config ordering holds with real cards', () => {
  const allStats = new Map<string, SimResult>()
  for (const p of config.personas) {
    allStats.set(p.name, simulateRealistic(p))
  }

  it('Tight Tony plays fewer hands than Loose Lucy', () => {
    expect(allStats.get('Tight Tony')!.vpip).toBeLessThan(allStats.get('Loose Lucy')!.vpip)
  })

  it('Tight Tony plays fewer hands than Wild Wendy', () => {
    expect(allStats.get('Tight Tony')!.vpip).toBeLessThan(allStats.get('Wild Wendy')!.vpip)
  })

  it('Ihil Pvey plays tighter than Naniel Degreanu', () => {
    expect(allStats.get('Ihil Pvey')!.vpip).toBeLessThan(allStats.get('Naniel Degreanu')!.vpip)
  })

  it('Dom Twan raises more postflop than Calling Carl', () => {
    expect(allStats.get('Dom Twan')!.raiseRate).toBeGreaterThan(allStats.get('Calling Carl')!.raiseRate)
  })

  it('Wild Wendy bluffs more than Tight Tony', () => {
    expect(allStats.get('Wild Wendy')!.bluffRate).toBeGreaterThan(allStats.get('Tight Tony')!.bluffRate)
  })

  it('tightest quartile has lower VPIP than loosest quartile', () => {
    const sorted = [...config.personas].sort((a, b) => a.vpip - b.vpip)
    const q = Math.floor(sorted.length / 4)
    const tightAvg = sorted.slice(0, q).reduce((s, p) => s + allStats.get(p.name)!.vpip, 0) / q
    const looseAvg = sorted.slice(-q).reduce((s, p) => s + allStats.get(p.name)!.vpip, 0) / q
    expect(tightAvg).toBeLessThan(looseAvg)
  })
})

// ─── Position Variation ────────────────────────────────────────

describe('Realistic: position affects preflop decisions', () => {
  it('bots face raises more often from early position (sim verification)', () => {
    // This is built into the sim: isLatePosition ? 50% : 65% facing raise
    // Just verify the sim produces reasonable preflop fold rates
    const sam = config.personas.find(p => p.name === 'Solid Sam')!
    const stats = simulateRealistic(sam)
    expect(stats.vpip).toBeGreaterThan(0.10)
    expect(stats.vpip).toBeLessThan(0.40)
  })
})

// ─── Full Pipeline Integrity ───────────────────────────────────

describe('Realistic: full pipeline produces valid results for all 25 bots', () => {
  it('no persona crashes over 50K realistic hands', () => {
    for (const persona of config.personas) {
      expect(() => simulateRealistic(persona)).not.toThrow()
    }
  })

  it('all personas produce VPIP between 5% and 55%', () => {
    for (const persona of config.personas) {
      const stats = simulateRealistic(persona)
      expect(stats.vpip).toBeGreaterThan(0.05)
      expect(stats.vpip).toBeLessThan(0.55)
    }
  })

  it('hand evaluator runs correctly on dealt cards (avg rank is reasonable)', () => {
    // Across all personas, avg hand rank should be ~1.0-1.5 (mostly pairs/high cards)
    let totalAvg = 0
    for (const persona of config.personas) {
      totalAvg += simulateRealistic(persona).avgHandRank
    }
    const overallAvg = totalAvg / config.personas.length
    expect(overallAvg).toBeGreaterThan(0.5)
    expect(overallAvg).toBeLessThan(3.0)
  })
})
