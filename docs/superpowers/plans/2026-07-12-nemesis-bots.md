# Nemesis Bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bots remember and exploit the hero's leaks across sessions — one persistent decay-weighted hero model, per-persona familiarity scaling the existing adaptation, and a full scouting report in the bot profile modal.

**Architecture:** Pure model math in `app/utils/heroModel.ts` (decayed aggregates, familiarity curve, blend, read strings), a `readStrength` field on `HeroProfile` that scales the existing `applyHeroAdaptation` delta inside `decideBotAction` (per-bot), a Pinia store with guarded persistence, and thin wiring in `index.vue`/`SetupScreen`/`BotProfileModal`. Learning always on; exploitation career-always / quick-play-toggle.

**Tech Stack:** Nuxt 4 / Vue 3 / Pinia / Nuxt UI v4, Vitest (seeded), localStorage.

**Spec:** `docs/superpowers/specs/2026-07-12-nemesis-bots-design.md`

## Global Constraints

- Branch: `nemesis-bots`. Commit per task. **No AI co-author trailer** (user rule).
- Config constants verbatim: `halfLifeHands: 500`, `minHandsForReads: 30`, `famDivisor: 30`, `famFull: 300`, `blendDiv: 10`, `blendCap: 20`. Tell gating floor: `readStrength >= 0.4`.
- `applyHeroAdaptation` internals and clamps unchanged — nemesis only scales its delta.
- Probe purity: `scripts/exploit-probe.ts` must not (transitively) gain nemesis behavior — it never passes `heroProfile`, and a test asserts its source references neither `heroModel` nor `nemesis`.
- `yarn test` + `yarn typecheck` green before every commit; suite stays deterministic (seeded setup already global).
- `readStrength` default is 1 so every existing caller/test keeps today's behavior bit-for-bit.

---

### Task 1: `config.nemesis` + `heroModel.ts` (TDD)

**Files:**
- Modify: `holdem.config.ts` (new `nemesis` block after `career`)
- Create: `app/utils/heroModel.ts`
- Test: Create `tests/hero-model.test.ts`

**Interfaces (produces):**

```ts
export interface NemesisConfig {
  halfLifeHands: number; minHandsForReads: number
  famDivisor: number; famFull: number; blendDiv: number; blendCap: number
}
interface DecayedRate { num: number; den: number }
export interface PersistentHeroModel {
  version: 1
  effectiveHands: number
  vpip: DecayedRate
  foldTo3Bet: DecayedRate
  foldToCbet: DecayedRate
  aggression: { raises: number; calls: number }
  sizing: { strongSum: number; strongN: number; weakSum: number; weakN: number }
  familiarity: Record<string, number>
}
export function emptyModel(): PersistentHeroModel
export function decayAndRecord(model: PersistentHeroModel, record: HeroHandRecord, opponents: string[], cfg: NemesisConfig): PersistentHeroModel
export function recordSizing(model: PersistentHeroModel, avgSizing: number, wasStrong: boolean): PersistentHeroModel  // no decay (sizing decays with hands via decayAndRecord)
export function modelToHeroProfile(model: PersistentHeroModel, cfg: NemesisConfig): HeroProfile | null  // null below minHandsForReads
export function familiarityOf(model: PersistentHeroModel, personaName: string, cfg: NemesisConfig): number  // 0..1
export function blendProfiles(session: HeroProfile | undefined, book: HeroProfile | null, cfg: NemesisConfig): HeroProfile | undefined
export function describeReads(model: PersistentHeroModel, cfg: NemesisConfig): string[]
```

(`HeroHandRecord` and `HeroProfile` import from `~/stores/heroProfile` and `~/utils/botDecision` respectively.)

- [ ] **Step 1: Config block** — in `holdem.config.ts`, immediately after the `career` block's closing `},`:

```ts
  // ─── Nemesis (cross-session opponent modeling) ───────────────
  // One persistent decay-weighted "book" on the hero; each persona's
  // exploitation strength scales with its own familiarity (hands faced).
  // Learning is always on; exploitation is career-always / quick-play toggle.
  nemesis: {
    halfLifeHands: 500,    // old reads fade with a 500-hand half-life
    minHandsForReads: 30,  // book silent below this effective sample
    famDivisor: 30,        // familiarity curve: ln(1 + h/div) / ln(1 + full/div)
    famFull: 300,          // hands to reach full-strength exploitation
    blendDiv: 10,          // book blend weight = min(effHands/div, cap)
    blendCap: 20,
  },
```

- [ ] **Step 2: Failing tests** — `tests/hero-model.test.ts`:

```ts
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
})
```

- [ ] **Step 3: Run** `npx vitest run tests/hero-model.test.ts` — FAIL (module missing).
- [ ] **Step 4: Implement** `app/utils/heroModel.ts`:

```ts
/**
 * Nemesis — the persistent "book" on the hero. Decay-weighted aggregates of
 * the same signals the in-session window tracks, plus a per-persona
 * familiarity ledger. Pure functions; the Pinia store binds storage.
 * Storage is O(1) regardless of hands played.
 */
import type { HeroProfile } from './botDecision'
import type { HeroHandRecord } from '~/stores/heroProfile'

export interface NemesisConfig {
  halfLifeHands: number
  minHandsForReads: number
  famDivisor: number
  famFull: number
  blendDiv: number
  blendCap: number
}

interface DecayedRate { num: number; den: number }

export interface PersistentHeroModel {
  version: 1
  effectiveHands: number
  vpip: DecayedRate
  foldTo3Bet: DecayedRate
  foldToCbet: DecayedRate
  aggression: { raises: number; calls: number }
  sizing: { strongSum: number; strongN: number; weakSum: number; weakN: number }
  familiarity: Record<string, number>
}

export function emptyModel(): PersistentHeroModel {
  return {
    version: 1,
    effectiveHands: 0,
    vpip: { num: 0, den: 0 },
    foldTo3Bet: { num: 0, den: 0 },
    foldToCbet: { num: 0, den: 0 },
    aggression: { raises: 0, calls: 0 },
    sizing: { strongSum: 0, strongN: 0, weakSum: 0, weakN: 0 },
    familiarity: {},
  }
}

const rate = (r: DecayedRate, fallback = 0) => (r.den > 0 ? r.num / r.den : fallback)

/** Fold one hand into the book: decay everything, then add the observation. */
export function decayAndRecord(
  model: PersistentHeroModel,
  record: HeroHandRecord,
  opponents: string[],
  cfg: NemesisConfig,
): PersistentHeroModel {
  const λ = Math.pow(2, -1 / cfg.halfLifeHands)
  const d = (r: DecayedRate, addNum: number, addDen: number): DecayedRate => ({
    num: r.num * λ + addNum,
    den: r.den * λ + addDen,
  })
  const familiarity: Record<string, number> = {}
  for (const [name, h] of Object.entries(model.familiarity)) {
    const decayed = h * λ
    if (decayed > 0.01) familiarity[name] = decayed
  }
  for (const name of opponents) familiarity[name] = (familiarity[name] ?? 0) + 1

  return {
    ...model,
    effectiveHands: model.effectiveHands * λ + 1,
    vpip: d(model.vpip, record.enteredPot ? 1 : 0, 1),
    foldTo3Bet: d(model.foldTo3Bet, record.foldedTo3Bet ? 1 : 0, record.faced3Bet ? 1 : 0),
    foldToCbet: d(model.foldToCbet, record.foldedToCbet ? 1 : 0, record.facedCbet ? 1 : 0),
    aggression: {
      raises: model.aggression.raises * λ + record.raiseCount,
      calls: model.aggression.calls * λ + record.callCount,
    },
    sizing: {
      strongSum: model.sizing.strongSum * λ,
      strongN: model.sizing.strongN * λ,
      weakSum: model.sizing.weakSum * λ,
      weakN: model.sizing.weakN * λ,
    },
    familiarity,
  }
}

/** A classified showdown sizing sample (already averaged over the hand). */
export function recordSizing(model: PersistentHeroModel, avgSizing: number, wasStrong: boolean): PersistentHeroModel {
  return {
    ...model,
    sizing: wasStrong
      ? { ...model.sizing, strongSum: model.sizing.strongSum + avgSizing, strongN: model.sizing.strongN + 1 }
      : { ...model.sizing, weakSum: model.sizing.weakSum + avgSizing, weakN: model.sizing.weakN + 1 },
  }
}

function sizingTell(model: PersistentHeroModel): HeroProfile['betSizingTell'] {
  const { strongSum, strongN, weakSum, weakN } = model.sizing
  if (strongN < 4 || weakN < 4) return undefined
  const strongAvgSizing = strongSum / strongN
  const weakAvgSizing = weakSum / weakN
  if (Math.abs(strongAvgSizing - weakAvgSizing) < 0.15) {
    return { hasTell: false, bigWithValue: false, strongAvgSizing, weakAvgSizing }
  }
  return { hasTell: true, bigWithValue: strongAvgSizing > weakAvgSizing, strongAvgSizing, weakAvgSizing }
}

export function modelToHeroProfile(model: PersistentHeroModel, cfg: NemesisConfig): HeroProfile | null {
  if (model.effectiveHands < cfg.minHandsForReads) return null
  const { raises, calls } = model.aggression
  return {
    vpip: rate(model.vpip),
    foldTo3Bet: rate(model.foldTo3Bet),
    foldToCbet: rate(model.foldToCbet),
    aggression: calls > 0 ? raises / calls : raises > 0 ? 2.0 : 0,
    handsTracked: Math.round(model.effectiveHands),
    betSizingTell: sizingTell(model),
  }
}

/** 0 for strangers → 1 at famFull hands faced; log curve. */
export function familiarityOf(model: PersistentHeroModel, personaName: string, cfg: NemesisConfig): number {
  const h = model.familiarity[personaName] ?? 0
  if (h <= 0) return 0
  return Math.min(1, Math.log(1 + h / cfg.famDivisor) / Math.log(1 + cfg.famFull / cfg.famDivisor))
}

/** Sample-size-weighted mean of the live session window and the book. */
export function blendProfiles(
  session: HeroProfile | undefined,
  book: HeroProfile | null,
  cfg: NemesisConfig,
): HeroProfile | undefined {
  if (!session && !book) return undefined
  if (!book) return session
  if (!session) return book
  const wS = session.handsTracked
  const wP = Math.min(book.handsTracked / cfg.blendDiv, cfg.blendCap)
  const total = wS + wP
  if (total <= 0) return undefined
  const mix = (a: number, b: number) => (a * wS + b * wP) / total
  return {
    vpip: mix(session.vpip, book.vpip),
    foldTo3Bet: mix(session.foldTo3Bet, book.foldTo3Bet),
    foldToCbet: mix(session.foldToCbet, book.foldToCbet),
    aggression: mix(session.aggression, book.aggression),
    handsTracked: Math.max(session.handsTracked, book.handsTracked),
    // The sharper read wins the tell: session tell if present, else the book's
    betSizingTell: session.betSizingTell ?? book.betSizingTell,
  }
}

/**
 * Human-readable scouting report. Triggers on the SAME thresholds
 * applyHeroAdaptation acts on — the panel never claims an exploit the
 * engine isn't applying.
 */
export function describeReads(model: PersistentHeroModel, cfg: NemesisConfig): string[] {
  const p = modelToHeroProfile(model, cfg)
  if (!p) return []
  const reads: string[] = []
  if (p.foldTo3Bet > 0.60) {
    reads.push(`Folds to 3-bets ${(p.foldTo3Bet * 100).toFixed(0)}% → 3-betting you wider`)
  }
  if (p.vpip > 0.40) {
    reads.push(`Plays ${(p.vpip * 100).toFixed(0)}% of hands → bluffing less, value-betting thinner`)
  }
  if (p.aggression < 0.5 && p.handsTracked >= cfg.minHandsForReads) {
    reads.push(`Rarely raises (AF ${p.aggression.toFixed(2)}) → betting into you more`)
  }
  if (p.foldToCbet > 0.65) {
    reads.push(`Folds to c-bets ${(p.foldToCbet * 100).toFixed(0)}% → c-betting you relentlessly`)
  }
  if (p.betSizingTell?.hasTell) {
    reads.push(p.betSizingTell.bigWithValue
      ? 'Sizing tell: big bets = strong → folding to your big bets, calling your small ones'
      : 'Sizing tell: big bets = bluffs → calling your big bets down lighter')
  }
  return reads
}
```

Note on thresholds: the `aggression < 0.5` and `foldToCbet > 0.65` read lines must match `applyHeroAdaptation`'s actual branch conditions — READ `app/utils/botDecision.ts:313-360` first and copy the exact constants it uses (the passive-hero and fold-to-cbet branches sit below the vpip branch shown at :327). Adjust the two conditions and strings to mirror what the engine really does before committing.

- [ ] **Step 5: Run** `npx vitest run tests/hero-model.test.ts` — PASS. `yarn typecheck` — 0.
- [ ] **Step 6: Commit** — `git commit -m "Nemesis: config block and pure hero-model math (decay, familiarity, blend, reads)"`

---

### Task 2: `readStrength` scaling in botDecision (TDD)

**Files:**
- Modify: `app/utils/botDecision.ts` — `HeroProfile` interface (~:38), adaptation gate (~:291), tell gate (:1248)
- Test: extend `tests/bot-decision-seeded.test.ts`

**Interfaces:**
- Produces: `HeroProfile.readStrength?: number` (0..1, default 1 — absent means today's full-strength behavior). `decideBotAction` lerps the adaptation delta by it; the bet-sizing-tell branch requires `readStrength >= 0.4`.

- [ ] **Step 1: Failing test** — append to `tests/bot-decision-seeded.test.ts`:

```ts
import type { HeroProfile } from '../app/utils/botDecision'

describe('readStrength scales hero adaptation', () => {
  const overFolder: HeroProfile = {
    vpip: 0.2, foldTo3Bet: 0.9, foldToCbet: 0.3, aggression: 1, handsTracked: 200,
  }
  const ctx3bet = (rng: () => number): DecisionContext => ({
    street: 'preflop', toCall: 5, pot: 8.5, currentBet: 7.5, playerBet: 2.5,
    chips: 200, bb: 2, numActivePlayers: 3, raiseLevel: 1, position: 'BTN',
    rng,
  })
  it('readStrength 0 behaves exactly like no heroProfile at all', () => {
    for (let i = 0; i < 40; i++) {
      const a = decideBotAction(profile, ctx3bet(mulberry32(7000 + i)), 1, { ...overFolder, readStrength: 0 })
      const b = decideBotAction(profile, ctx3bet(mulberry32(7000 + i)), 1, undefined)
      expect(a).toEqual(b)
    }
  })
  it('readStrength absent behaves exactly like today (full adaptation)', () => {
    for (let i = 0; i < 40; i++) {
      const a = decideBotAction(profile, ctx3bet(mulberry32(8000 + i)), 1, overFolder)
      const b = decideBotAction(profile, ctx3bet(mulberry32(8000 + i)), 1, { ...overFolder, readStrength: 1 })
      expect(a).toEqual(b)
    }
  })
  it('partial readStrength raises 3-bet frequency less than full', () => {
    const freq = (rs: number | undefined) => {
      let raises = 0
      const rng = mulberry32(99)
      for (let i = 0; i < 4000; i++) {
        const hp = rs === undefined ? undefined : { ...overFolder, readStrength: rs }
        if (decideBotAction(profile, ctx3bet(rng), 1, hp).type === 'raise') raises++
      }
      return raises / 4000
    }
    const none = freq(0)
    const half = freq(0.5)
    const full = freq(1)
    expect(full).toBeGreaterThan(none)
    expect(half).toBeGreaterThan(none)
    expect(half).toBeLessThan(full)
  })
})
```

(`profile`, `DecisionContext`, `mulberry32` already imported in this file.)

- [ ] **Step 2: Run** — FAIL (readStrength ignored → 0 behaves like 1).
- [ ] **Step 3: Implement** in `botDecision.ts`:

Add to the `HeroProfile` interface (after `handsTracked`):

```ts
  readStrength?: number  // 0..1 — how much of the adaptation this bot has earned (nemesis familiarity); absent = 1
```

Add near `applyHeroAdaptation`:

```ts
/** Lerp every numeric field from base toward full by t (nemesis familiarity). */
function lerpProfiles(base: BotProfile, full: BotProfile, t: number): BotProfile {
  if (t >= 1) return full
  if (t <= 0) return base
  const out: BotProfile = { ...full }
  for (const k of Object.keys(full) as (keyof BotProfile)[]) {
    const b = base[k]
    const f = full[k]
    if (typeof b === 'number' && typeof f === 'number') {
      ;(out as Record<string, unknown>)[k as string] = b + (f - b) * t
    }
  }
  return out
}
```

Replace the adaptation gate (~:291):

```ts
  const readStrength = heroProfile?.readStrength ?? 1
  let adaptedProfile = heroProfile && heroProfile.handsTracked >= 10 && readStrength > 0
    ? lerpProfiles(profile, applyHeroAdaptation(profile, heroProfile), readStrength)
    : profile
```

Gate the tell (:1248):

```ts
  if (heroProfile?.betSizingTell?.hasTell && (heroProfile.readStrength ?? 1) >= 0.4) {
```

- [ ] **Step 4: Run** the file + `yarn probe all 6000 20260712` — probe numbers byte-identical to the Round 5 baseline (probe passes no heroProfile; default 1 changes nothing).
- [ ] **Step 5:** `yarn test` green, `yarn typecheck` 0. Commit — `git commit -m "HeroProfile.readStrength: familiarity-scaled adaptation delta (default 1 = today)"`

---

### Task 3: nemesis Pinia store

**Files:**
- Create: `app/stores/nemesis.ts`

**Interfaces:**
- Produces: `useNemesisStore()` — `model: Ref<PersistentHeroModel>`, `storageWarning: Ref<boolean>`, `bookProfile` (computed `HeroProfile | null`), `reads` (computed `string[]`), `familiarityFor(name: string): number`, `record(rec: HeroHandRecord, opponents: string[])`, `recordSizing(avgSizing: number, wasStrong: boolean)`, `reset()`.

- [ ] **Step 1: Implement** (career-store pattern):

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import config from '@config'
import {
  emptyModel, decayAndRecord, recordSizing as ruleRecordSizing,
  modelToHeroProfile, familiarityOf, describeReads,
} from '~/utils/heroModel'
import type { PersistentHeroModel } from '~/utils/heroModel'
import type { HeroHandRecord } from '~/stores/heroProfile'

const STORAGE_KEY = 'holdem-nemesis-v1'

export const useNemesisStore = defineStore('nemesis', () => {
  const cfg = config.nemesis
  const model = ref<PersistentHeroModel>(emptyModel())
  const storageWarning = ref(false)

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(model.value))
      storageWarning.value = false
    } catch {
      storageWarning.value = true
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as PersistentHeroModel
      if (parsed?.version !== 1) return
      model.value = parsed
    } catch {
      // corrupted/unavailable storage → fresh book
    }
  }
  if (typeof localStorage !== 'undefined') load()

  const bookProfile = computed(() => modelToHeroProfile(model.value, cfg))
  const reads = computed(() => describeReads(model.value, cfg))

  function familiarityFor(name: string): number {
    return familiarityOf(model.value, name, cfg)
  }
  function record(rec: HeroHandRecord, opponents: string[]) {
    model.value = decayAndRecord(model.value, rec, opponents, cfg)
    save()
  }
  function recordSizing(avgSizing: number, wasStrong: boolean) {
    model.value = ruleRecordSizing(model.value, avgSizing, wasStrong)
    save()
  }
  function reset() {
    model.value = emptyModel()
    save()
  }

  return { model, storageWarning, bookProfile, reads, familiarityFor, record, recordSizing, reset }
})
```

- [ ] **Step 2:** `yarn typecheck` 0. Commit — `git commit -m "Nemesis: Pinia store with guarded persistence"`

---

### Task 4: game integration (index.vue + SetupScreen)

**Files:**
- Modify: `app/pages/index.vue` — recording sites (:359, :554, :573), heroProfile construction in `makeBotDecision` (~:187-198), career entry (`nemesisEnabled` always true), imports
- Modify: `app/components/SetupScreen.vue` — `GameSettings.nemesisEnabled: boolean` + toggle (default false)

**Interfaces:**
- Consumes: Tasks 1-3.

- [ ] **Step 1: SetupScreen** — add `nemesisEnabled: boolean` to `GameSettings` (:15-24); add `const nemesisEnabled = ref(false)` in script; include `nemesisEnabled: nemesisEnabled.value` where settings are assembled (~:175, next to `commentaryMode`); add a toggle in the template near the commentary mode selector (copy the adjacent control's classes):

```vue
<div class="flex items-center justify-between">
  <div>
    <div class="text-sm text-white">Bots remember you</div>
    <div class="text-xs text-gray-500">Opponents keep a book on your leaks across sessions and exploit what they know</div>
  </div>
  <USwitch v-model="nemesisEnabled" />
</div>
```

- [ ] **Step 2: index.vue recording** (learning always on, all modes):

At :554, after `heroProfileStore.recordHeroAction({ ... })` capture the record once and feed both stores — restructure to:

```ts
    const heroRecord = { /* the existing object literal, unchanged */ }
    heroProfileStore.recordHeroAction(heroRecord)
    nemesisStore.record(heroRecord, settings.value?.botConfigs.slice(0, (settings.value?.playerCount ?? 1) - 1).map(b => b.name) ?? [])
```

At :573, mirror the sizing finalize — `finalizeHandSizing` computes the classification internally in the session store, so ALSO classify for the book at the same site:

```ts
    if (heroAtShowdown && heroPendingSizings.length > 0) {
      const avg = heroPendingSizings.reduce((s, x) => s + x, 0) / heroPendingSizings.length
      nemesisStore.recordSizing(avg, heroStrong)
    }
```

`heroPendingSizings`: the session store keeps its pending list private — add a local mirror in index.vue: push `amount / gs.pot.value` at :359 alongside `recordHeroBetSizing`, clear it where `finalizeHandSizing` is called. (Three-line bookkeeping; do NOT reach into the other store's internals.)

- [ ] **Step 3: index.vue exploitation path** — imports:

```ts
import { useNemesisStore } from '~/stores/nemesis'
import { blendProfiles } from '~/utils/heroModel'
```

`const nemesisStore = useNemesisStore()` next to the other stores. `startCareerSession`'s `handleStart({...})` gains `nemesisEnabled: true`. In `makeBotDecision`, replace the current heroProfile construction (the `heroProfileStore.handsTracked >= config.sessionMemory.windowSize ? {...} : undefined` block) with:

```ts
    const sessionProfile: HeroProfile | undefined = heroProfileStore.handsTracked >= config.sessionMemory.windowSize
      ? {
          vpip: heroProfileStore.heroVpip,
          foldTo3Bet: heroProfileStore.heroFoldTo3Bet,
          foldToCbet: heroProfileStore.heroFoldToCbet,
          aggression: heroProfileStore.heroAggression,
          handsTracked: heroProfileStore.handsTracked,
          betSizingTell: heroProfileStore.betSizingTell,
        }
      : undefined

    let heroProfile: HeroProfile | undefined = sessionProfile
    if (settings.value?.nemesisEnabled) {
      const blended = blendProfiles(sessionProfile, nemesisStore.bookProfile, config.nemesis)
      heroProfile = blended
        ? { ...blended, readStrength: nemesisStore.familiarityFor(botConfig.name) }
        : undefined
    }
```

- [ ] **Step 4: Verify** — `yarn test` green (quick-play default-off keeps every existing path identical), `yarn typecheck` 0. `yarn dev`: quick-play with toggle off plays exactly as before; career session records familiarity (check localStorage key after a few hands).
- [ ] **Step 5: Commit** — `git commit -m "Nemesis integration: always-learn, career-always/quick-play-toggle exploitation"`

---

### Task 5: scouting report panel (BotProfileModal)

**Files:**
- Modify: `app/components/BotProfileModal.vue`

- [ ] **Step 1:** In the script: `import { useNemesisStore } from '~/stores/nemesis'`; `const nemesis = useNemesisStore()`; add:

```ts
const showResetConfirm = ref(false)
const familiarity = computed(() => nemesis.familiarityFor(props.botConfig.name))
const famTier = computed(() => {
  const f = familiarity.value
  if (f >= 0.8) return { label: 'Nemesis', tone: 'text-red-400' }
  if (f >= 0.4) return { label: 'Regular', tone: 'text-orange-400' }
  if (f >= 0.1) return { label: 'Noticing you', tone: 'text-yellow-400' }
  return { label: 'Stranger', tone: 'text-gray-500' }
})
const handsFaced = computed(() => Math.round(nemesis.model.familiarity[props.botConfig.name] ?? 0))
const minReads = config.nemesis.minHandsForReads
function confirmReset() {
  nemesis.reset()
  showResetConfirm.value = false
}
```

- [ ] **Step 2:** In the template, after the stats section (before the modal's footer/reset area), add:

```vue
<div class="border-t border-gray-800 pt-3 mt-3 space-y-2">
  <div class="flex items-center justify-between">
    <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">What they know about you</h4>
    <span class="text-xs font-semibold" :class="famTier.tone">{{ famTier.label }} · {{ handsFaced }} hands</span>
  </div>
  <template v-if="nemesis.reads.length">
    <ul class="space-y-1">
      <li v-for="(read, i) in nemesis.reads" :key="i" class="text-xs text-gray-300">• {{ read }}</li>
    </ul>
    <p class="text-[0.65rem] text-gray-600">Reads are the table's shared book on you — this player acts on it to the degree they know your game.</p>
  </template>
  <p v-else class="text-xs text-gray-600">No book on you yet — fewer than {{ minReads }} hands observed.</p>
  <UButton size="xs" variant="ghost" color="error" @click="() => { showResetConfirm = true }">Reset what bots know</UButton>
  <div v-if="showResetConfirm" class="flex items-center gap-2 text-xs">
    <span class="text-gray-400">Wipe the book and all familiarity?</span>
    <UButton size="xs" color="error" @click="confirmReset">Wipe</UButton>
    <UButton size="xs" variant="ghost" color="neutral" @click="() => { showResetConfirm = false }">Cancel</UButton>
  </div>
</div>
```

- [ ] **Step 3:** `yarn typecheck` 0; live check: modal shows Stranger/no-book fresh, reads appear after 30+ recorded hands (see Task 6 verification).
- [ ] **Step 4: Commit** — `git commit -m "Nemesis: scouting report panel in bot profile modal"`

---

### Task 6: wrap-up — probe purity, docs, gates, live loop

**Files:**
- Test: append to `tests/exploit-probe.test.ts`
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Probe purity test** — append:

```ts
import { readFileSync } from 'fs'

describe('probe purity', () => {
  it('the exploit probe has no nemesis/hero-model coupling', () => {
    const src = readFileSync('scripts/exploit-probe.ts', 'utf-8')
    expect(src).not.toMatch(/heroModel|nemesis|HeroProfile/)
  })
})
```

- [ ] **Step 2: README** — add under the Career Mode feature block:

```markdown
### Nemesis Bots
- **Bots keep a book on you** -- one persistent, decay-weighted model of your leaks (500-hand half-life; old reads fade as you improve)
- **Familiarity matters** -- each persona exploits you only as hard as its own history with you: a stranger plays you straight, a 300-hand regular plays the full exploit
- **Scouting report** -- the bot profile modal shows what they know ("Folds to 3-bets 68% → 3-betting you wider") and their familiarity tier, up to Nemesis
- **Always learning, opt-in exploitation** -- career sessions always face the book; quick-play has a "Bots remember you" toggle (default off). One-click reset.
```

- [ ] **Step 3: CHANGELOG** — first bullet under `[Unreleased] → Added`:

```markdown
- **Nemesis bots** — cross-session opponent modeling (the Vexbot homage): a persistent decay-weighted book on the hero (O(1) storage, 500-hand half-life) blends with the live session read, and each persona scales the existing hero-adaptation exploit by its own familiarity with you (log curve, full strength at ~300 hands faced). Scouting report in the bot profile modal shows the reads and familiarity tier; career sessions always exploit, quick-play gets a default-off toggle; learning is always on with a one-click reset. The exploit probe is structurally untouched (purity test added).
```

- [ ] **Step 4: Gates** — `yarn test` (all green, deterministic), `yarn typecheck` (0), `yarn probe all 6000 20260712` (byte-identical to Round 5 baseline), `yarn generate`.
- [ ] **Step 5: Live loop** — `yarn dev` + browser: (a) fresh quick-play, toggle off → identical behavior, modal shows Stranger/no book; (b) seed the book via a career session (~10 hands), reload, confirm localStorage `holdem-nemesis-v1` persists and familiarity ticks up; (c) modal shows reads once effectiveHands ≥ 30 (simulate by playing or temporarily lowering the config in the dev session — do not commit a lowered value).
- [ ] **Step 6: Commit** — `git commit -m "Nemesis wrap-up: probe purity test, README + CHANGELOG"` then superpowers:finishing-a-development-branch.
