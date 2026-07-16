// @vitest-environment happy-dom
/**
 * Persistence guards: localStorage payloads are user-editable (or corrupted
 * by extensions/migrations). A valid-JSON payload with a broken shape must
 * never brick a page — loads sanitize to a safe state or fall back to fresh.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { sanitizeCareerState, freshCareer } from '../app/utils/careerRules'
import type { CareerState, CareerConfig, StakeLevel } from '../app/utils/careerRules'
import { sanitizeHeroModel, emptyModel } from '../app/utils/heroModel'
import config from '../holdem.config'

const cfg: CareerConfig = {
  startingBankroll: 1000, buyInBB: 100, promoteBuyIns: 5,
  promoteMinHands: 100, demoteBuyIns: 2, playerCount: 6, tiers: { 1: [], 2: [] },
}
const stakes: StakeLevel[] = [
  { level: 1, sb: 0.25, bb: 0.5 }, { level: 2, sb: 0.5, bb: 1 }, { level: 3, sb: 1, bb: 2 },
]
const now = '2026-07-16T00:00:00.000Z'

function validState(): CareerState {
  return {
    ...freshCareer(cfg, now),
    bankroll: 250,
    currentTier: 2,
    handsAtTier: 40,
    totalHands: 300,
    peakBankroll: 500,
    peakTier: 3,
    sessions: [{ tier: 1, buyIn: 50, cashOut: 75, hands: 20, endedBy: 'leave', at: now }],
    pendingSession: { tier: 2, buyIn: 100, startedAt: now },
  }
}

describe('sanitizeCareerState', () => {
  it('valid state round-trips unchanged', () => {
    expect(sanitizeCareerState(validState(), stakes, now)).toEqual(validState())
  })

  it('rejects non-objects and wrong versions', () => {
    expect(sanitizeCareerState(null, stakes, now)).toBeNull()
    expect(sanitizeCareerState('x', stakes, now)).toBeNull()
    expect(sanitizeCareerState({ ...validState(), version: 2 }, stakes, now)).toBeNull()
  })

  it('rejects unusable bankroll (NaN, Infinity, string, negative)', () => {
    for (const bankroll of [NaN, Infinity, '250', -5]) {
      expect(sanitizeCareerState({ ...validState(), bankroll }, stakes, now)).toBeNull()
    }
  })

  it('rejects a tier that is not a real stake level', () => {
    expect(sanitizeCareerState({ ...validState(), currentTier: 99 }, stakes, now)).toBeNull()
    expect(sanitizeCareerState({ ...validState(), currentTier: '2' }, stakes, now)).toBeNull()
  })

  it('repairs non-critical numeric fields instead of rejecting', () => {
    const s = sanitizeCareerState(
      { ...validState(), handsAtTier: NaN, totalHands: -3, peakBankroll: Infinity, peakTier: 99 },
      stakes, now,
    )!
    expect(s.handsAtTier).toBe(0)
    expect(s.totalHands).toBe(0)
    expect(s.peakBankroll).toBe(250) // falls back to bankroll
    expect(s.peakTier).toBe(2)       // falls back to currentTier
  })

  it('filters invalid session/archive entries, keeps valid ones', () => {
    const s = sanitizeCareerState({
      ...validState(),
      sessions: [
        { tier: 1, buyIn: 50, cashOut: 75, hands: 20, endedBy: 'leave', at: now },
        { tier: 1, buyIn: NaN, cashOut: 75, hands: 20, endedBy: 'leave', at: now },
        { tier: 1, buyIn: 50, cashOut: 75, hands: 20, endedBy: 'hacked', at: now },
        null, 'junk', 42,
      ],
      archivedRuns: 'nope',
    }, stakes, now)!
    expect(s.sessions).toHaveLength(1)
    expect(s.archivedRuns).toEqual([])
  })

  it('nulls a malformed pendingSession but keeps a valid one', () => {
    const bad = sanitizeCareerState(
      { ...validState(), pendingSession: { tier: 2, buyIn: 'lots', startedAt: now } },
      stakes, now,
    )!
    expect(bad.pendingSession).toBeNull()
    const good = sanitizeCareerState(validState(), stakes, now)!
    expect(good.pendingSession).toEqual({ tier: 2, buyIn: 100, startedAt: now })
  })
})

describe('sanitizeHeroModel', () => {
  it('valid model round-trips unchanged', () => {
    const m = { ...emptyModel(), effectiveHands: 12, vpip: { num: 3, den: 12 }, familiarity: { 'Hill Phellmuth': 4 } }
    expect(sanitizeHeroModel(m)).toEqual(m)
  })

  it('rejects non-objects and wrong versions', () => {
    expect(sanitizeHeroModel(null)).toBeNull()
    expect(sanitizeHeroModel({ ...emptyModel(), version: 3 })).toBeNull()
  })

  it('zeroes broken numeric sub-shapes instead of crashing later', () => {
    const m = sanitizeHeroModel({
      ...emptyModel(),
      effectiveHands: Infinity,
      vpip: null,
      aggression: { raises: 'many', calls: 2 },
      sizing: undefined,
    })!
    expect(m.effectiveHands).toBe(0)
    expect(m.vpip).toEqual({ num: 0, den: 0 })
    expect(m.aggression).toEqual({ raises: 0, calls: 2 }) // per-field repair keeps the valid half
    expect(m.sizing).toEqual({ strongSum: 0, strongN: 0, weakSum: 0, weakN: 0 })
  })

  it('keeps only finite numeric familiarity entries and drops proto keys', () => {
    // JSON.parse (like real storage) creates "__proto__" as an OWN key —
    // an object literal would silently set the prototype instead.
    const familiarity = JSON.parse('{"Pvey": 3, "Jellande": "NaN", "__proto__": 7, "constructor": 1}')
    const m = sanitizeHeroModel({ ...emptyModel(), familiarity })!
    expect(m.familiarity).toEqual({ 'Pvey': 3 })
  })
})

describe('store loads survive hostile localStorage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('career store falls back to fresh on valid-JSON-broken-shape', async () => {
    localStorage.setItem('holdem-career-v1', JSON.stringify({ version: 1, bankroll: 'a lot', currentTier: 99 }))
    const { useCareerStore } = await import('../app/stores/career')
    const store = useCareerStore()
    expect(store.state.bankroll).toBe(config.career.startingBankroll)
    expect(store.state.currentTier).toBe(1)
    expect(() => store.tierStake).not.toThrow()
  })

  it('career store loads a valid state and still refunds a pending session', async () => {
    const valid = {
      ...freshCareer(config.career, now),
      bankroll: 77,
      pendingSession: { tier: 1, buyIn: 50, startedAt: now },
    }
    localStorage.setItem('holdem-career-v1', JSON.stringify(valid))
    const { useCareerStore } = await import('../app/stores/career')
    const store = useCareerStore()
    expect(store.state.bankroll).toBe(127) // refunded
    expect(store.state.pendingSession).toBeNull()
    expect(store.hadAbandoned).toBe(true)
  })

  it('nemesis store falls back to a fresh book on broken shape', async () => {
    localStorage.setItem('holdem-nemesis-v1', JSON.stringify({ version: 1, vpip: null, familiarity: 'x' }))
    const { useNemesisStore } = await import('../app/stores/nemesis')
    const store = useNemesisStore()
    expect(store.model.vpip).toEqual({ num: 0, den: 0 })
    expect(() => store.bookProfile).not.toThrow()
    expect(store.bookProfile).toBeNull() // 0 effective hands → no reads
  })
})
