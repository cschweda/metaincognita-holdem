import { describe, it, expect } from 'vitest'
import config from '../holdem.config'
import {
  emptyModel, decayAndRecord, recordSizing, modelToHeroProfile,
  familiarityOf, blendProfiles, describeReads,
} from '../app/utils/heroModel'
import type { HeroHandRecord } from '../app/stores/heroProfile'
import type { HeroProfile } from '../app/utils/botDecision'

const cfg = config.nemesis

const hand = (over: Partial<HeroHandRecord> = {}): HeroHandRecord => ({
  enteredPot: false, faced3Bet: false, foldedTo3Bet: false,
  facedCbet: false, foldedToCbet: false,
  raiseCount: 0, callCount: 0, checkCount: 0, ...over,
})

function play(n: number, over: Partial<HeroHandRecord>, opponents: string[] = ['Ihil Pvey']) {
  let m = emptyModel()
  for (let i = 0; i < n; i++) m = decayAndRecord(m, hand(over), opponents, cfg)
  return m
}

describe('decay math', () => {
  it('effectiveHands grows toward the half-life-implied cap, not linearly', () => {
    const m = play(1000, {})
    expect(m.effectiveHands).toBeLessThan(1000)
    expect(m.effectiveHands).toBeGreaterThan(500) // cap = 1/(1-λ) ≈ 721 for H=500
  })
  it('a burst of old behavior fades: rate tracks recent play', () => {
    let m = emptyModel()
    for (let i = 0; i < 500; i++) m = decayAndRecord(m, hand({ enteredPot: true }), [], cfg)
    for (let i = 0; i < 1500; i++) m = decayAndRecord(m, hand({ enteredPot: false }), [], cfg)
    const p = modelToHeroProfile(m, cfg)!
    expect(p.vpip).toBeLessThan(0.15) // old loose era mostly decayed away
  })
})

describe('rates and profile mapping', () => {
  it('vpip and foldTo3Bet reflect observed frequencies', () => {
    let m = emptyModel()
    for (let i = 0; i < 100; i++) m = decayAndRecord(m, hand({ enteredPot: i % 2 === 0 }), [], cfg)
    for (let i = 0; i < 40; i++) m = decayAndRecord(m, hand({ faced3Bet: true, foldedTo3Bet: i < 30 }), [], cfg)
    const p = modelToHeroProfile(m, cfg)!
    expect(p.vpip).toBeGreaterThan(0.3)
    expect(p.vpip).toBeLessThan(0.5)
    expect(p.foldTo3Bet).toBeGreaterThan(0.65)
  })
  it('returns null below minHandsForReads', () => {
    expect(modelToHeroProfile(play(cfg.minHandsForReads - 1, {}), cfg)).toBeNull()
    expect(modelToHeroProfile(play(cfg.minHandsForReads + 1, {}), cfg)).not.toBeNull()
  })
  it('sizing tell appears after 4 strong + 4 weak classified showdowns', () => {
    let m = play(50, {})
    for (let i = 0; i < 4; i++) m = recordSizing(m, 0.9, true)
    for (let i = 0; i < 3; i++) m = recordSizing(m, 0.3, false)
    expect(modelToHeroProfile(m, cfg)!.betSizingTell).toBeUndefined()
    m = recordSizing(m, 0.3, false)
    const tell = modelToHeroProfile(m, cfg)!.betSizingTell
    expect(tell?.hasTell).toBe(true)
    expect(tell?.bigWithValue).toBe(true)
  })
})

describe('familiarity', () => {
  it('is 0 for strangers, ~1 at famFull, monotone', () => {
    const m = play(400, {}, ['Ihil Pvey'])
    expect(familiarityOf(m, 'Rhip Ceese', cfg)).toBe(0)
    expect(familiarityOf(m, 'Ihil Pvey', cfg)).toBeGreaterThan(0.9)
    const m100 = play(100, {}, ['Ihil Pvey'])
    const f100 = familiarityOf(m100, 'Ihil Pvey', cfg)
    expect(f100).toBeGreaterThan(0.4)
    expect(f100).toBeLessThan(familiarityOf(m, 'Ihil Pvey', cfg))
  })
})

describe('blend', () => {
  const sess: HeroProfile = { vpip: 0.5, foldTo3Bet: 0.2, foldToCbet: 0.2, aggression: 2, handsTracked: 10 }
  const book: HeroProfile = { vpip: 0.2, foldTo3Bet: 0.8, foldToCbet: 0.6, aggression: 0.5, handsTracked: 200 }
  it('book dominates when session is empty, session pulls when present', () => {
    const bookOnly = blendProfiles(undefined, book, cfg)!
    expect(bookOnly.vpip).toBeCloseTo(0.2)
    const mixed = blendProfiles(sess, book, cfg)!
    expect(mixed.vpip).toBeGreaterThan(0.2)
    expect(mixed.vpip).toBeLessThan(0.5)
  })
  it('undefined when neither horizon has data', () => {
    expect(blendProfiles(undefined, null, cfg)).toBeUndefined()
  })
})

describe('reads', () => {
  it('silent below threshold, names real leaks above it', () => {
    expect(describeReads(play(10, { faced3Bet: true, foldedTo3Bet: true }), cfg)).toEqual([])
    const m = play(100, { faced3Bet: true, foldedTo3Bet: true })
    const reads = describeReads(m, cfg)
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.join(' ')).toMatch(/3-bet/i)
  })
  it('never claims the fold-to-cbet exploit the engine does not apply', () => {
    const m = play(100, { facedCbet: true, foldedToCbet: true })
    expect(describeReads(m, cfg).join(' ')).not.toMatch(/c-bet/i)
  })
})
