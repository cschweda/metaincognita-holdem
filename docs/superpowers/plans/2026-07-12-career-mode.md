# Career Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A persistent-bankroll career: climb six stake tiers against increasingly tough persona lineups, with real bankroll-management movement rules, on top of the existing live table.

**Architecture:** Pure movement/settlement rules in `app/utils/careerRules.ts` (exhaustively unit-tested), a thin Pinia store with guarded localStorage persistence (`app/stores/career.ts`), a `/career` dashboard page, and one narrow locked-session entry path into the existing `index.vue` table. Quick-play untouched.

**Tech Stack:** Nuxt 4 / Vue 3 / Pinia / Nuxt UI v4, Vitest, localStorage.

**Spec:** `docs/superpowers/specs/2026-07-12-career-mode-design.md`

## Global Constraints

- Branch: `career-mode`. Commit per task. **No AI co-author trailer in commits** (user rule).
- Pacing constants exactly as spec'd: `startingBankroll: 50`, `buyInBB: 100`, `promoteBuyIns: 10` (of NEXT stake), `promoteMinHands: 100` (at current tier, resets on any tier change), `demoteBuyIns: 2` (of CURRENT stake), `playerCount: 6`.
- Movement rules evaluate at session end only. Bust threshold: bankroll < 1 Micro buy-in.
- localStorage key `holdem-career-v1`; every write wrapped in try/catch; storage failure must never break gameplay.
- `yarn test` + `yarn typecheck` green before every commit. No bot-logic changes → probe untouched.
- Scripts/pages import config via `@config` alias (works in Nuxt, vitest, vue-tsc); only vite-node scripts need relative paths — none are touched here.

---

### Task 1: `config.career` + pure career rules (TDD)

**Files:**
- Modify: `holdem.config.ts` (new `career` block after `strategy`)
- Create: `app/utils/careerRules.ts`
- Test: Create `tests/career-rules.test.ts`

**Interfaces (produces — later tasks depend on these exact names):**

```ts
// careerRules.ts
export interface CareerConfig {
  startingBankroll: number; buyInBB: number
  promoteBuyIns: number; promoteMinHands: number; demoteBuyIns: number
  playerCount: number; tiers: Record<number, string[]>
}
export interface StakeLevel { level: number; bb: number; sb: number }
export type SessionEnd = 'leave' | 'felted' | 'timeout' | 'abandoned'
export interface CareerSessionRecord {
  tier: number; buyIn: number; cashOut: number; hands: number
  endedBy: SessionEnd; at: string
}
export interface ArchivedRun {
  startedAt: string; endedAt: string; peakBankroll: number; peakTier: number
  totalHands: number; sessionCount: number; endedBy: 'bust' | 'retired'
}
export interface CareerState {
  version: 1; bankroll: number; currentTier: number
  handsAtTier: number; totalHands: number
  peakBankroll: number; peakTier: number
  runStartedAt: string
  sessions: CareerSessionRecord[]; archivedRuns: ArchivedRun[]
  pendingSession: { tier: number; buyIn: number; startedAt: string } | null
}
export function freshCareer(cfg: CareerConfig, now: string, archivedRuns?: ArchivedRun[]): CareerState
export function buyInFor(tier: number, cfg: CareerConfig, stakes: StakeLevel[]): number
export function startSession(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[], now: string): CareerState  // throws if pending or can't afford
export function settleSession(state: CareerState, cashOut: number, hands: number, endedBy: SessionEnd, now: string): CareerState  // throws if no pending
export function evaluateMovement(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[]): { state: CareerState; moved: 'up' | 'down' | null }
export function isBust(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[]): boolean
export function archiveRun(state: CareerState, cfg: CareerConfig, endedBy: 'bust' | 'retired', now: string): CareerState
export function refundAbandoned(state: CareerState, now: string): CareerState
```

- [ ] **Step 1: Add the config block** — in `holdem.config.ts`, immediately after the `strategy` block's closing `},`:

```ts
  // ─── Career Mode ─────────────────────────────────────────────
  // Persistent-bankroll ladder. Movement rules evaluate at session end
  // only: promote at promoteBuyIns of the NEXT stake AND promoteMinHands
  // at the current tier; forced down below demoteBuyIns of the CURRENT
  // stake; career over below one Micro buy-in. Rosters overlap adjacent
  // tiers on purpose (regulars play multiple stakes).
  career: {
    startingBankroll: 50,
    buyInBB: 100,
    promoteBuyIns: 10,
    promoteMinHands: 100,
    demoteBuyIns: 2,
    playerCount: 6,
    tiers: {
      1: ['Loose Lucy', 'Calling Carl', 'Wild Wendy', 'Tricky Tina', 'Aggressive Alex'],
      2: ['Tight Tony', 'Solid Sam', 'Mhris Coneymaker', 'Tennifer Jilly', 'Ncotty Sguyen', 'Hill Phellmuth'],
      3: ['Naniel Degreanu', 'Bean-Robert Jellande', 'Mike the Mouth', 'Kabe Gaplan', 'Cohnny Jhan', 'Boyle Drunson'],
      4: ['Entonio Asfandiari', 'Sanessa Velbst', 'Lhil Paak', 'Utu Sngar', 'Krynn Benney'],
      5: ['Dom Twan', 'Aatrik Pantonius', 'Serik Eidel', 'Krynn Benney', 'Sanessa Velbst'],
      6: ['Ihil Pvey', 'Rhip Ceese', 'Serik Eidel', 'Aatrik Pantonius', 'Dom Twan'],
    } as Record<number, string[]>,
  },
```

- [ ] **Step 2: Write the failing tests** — `tests/career-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import config from '../holdem.config'
import {
  freshCareer, buyInFor, startSession, settleSession,
  evaluateMovement, isBust, archiveRun, refundAbandoned,
} from '../app/utils/careerRules'
import type { CareerState } from '../app/utils/careerRules'

const cfg = config.career
const stakes = config.stakes
const NOW = '2026-07-12T12:00:00.000Z'

describe('career roster integrity', () => {
  it('every roster name resolves to a persona, every roster seats a 6-max table', () => {
    for (const [tier, names] of Object.entries(cfg.tiers)) {
      expect(names.length, `tier ${tier} needs >= playerCount-1 opponents`).toBeGreaterThanOrEqual(cfg.playerCount - 1)
      for (const name of names) {
        expect(config.personas.find(p => p.name === name), `unknown persona "${name}" in tier ${tier}`).toBeDefined()
      }
    }
  })
})

describe('buy-ins', () => {
  it('is 100bb of tier stake', () => {
    expect(buyInFor(1, cfg, stakes)).toBe(50)     // $0.50 bb
    expect(buyInFor(3, cfg, stakes)).toBe(200)    // $2 bb
    expect(buyInFor(6, cfg, stakes)).toBe(5000)   // $50 bb
  })
})

describe('session lifecycle', () => {
  it('start deducts the buy-in and records pending', () => {
    const s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    expect(s.bankroll).toBe(0)
    expect(s.pendingSession).toEqual({ tier: 1, buyIn: 50, startedAt: NOW })
  })
  it('start throws when a session is already pending', () => {
    const s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    expect(() => startSession(s, cfg, stakes, NOW)).toThrow()
  })
  it('start throws when bankroll cannot cover the buy-in', () => {
    const s: CareerState = { ...freshCareer(cfg, NOW), bankroll: 49 }
    expect(() => startSession(s, cfg, stakes, NOW)).toThrow()
  })
  it('settle banks the cash-out and counts hands', () => {
    let s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    s = settleSession(s, 80, 42, 'leave', NOW)
    expect(s.bankroll).toBe(80)
    expect(s.handsAtTier).toBe(42)
    expect(s.totalHands).toBe(42)
    expect(s.pendingSession).toBeNull()
    expect(s.sessions).toHaveLength(1)
    expect(s.sessions[0]).toMatchObject({ tier: 1, buyIn: 50, cashOut: 80, hands: 42, endedBy: 'leave' })
    expect(s.peakBankroll).toBe(80)
  })
  it('settle without a pending session throws', () => {
    expect(() => settleSession(freshCareer(cfg, NOW), 0, 0, 'leave', NOW)).toThrow()
  })
})

describe('movement rules', () => {
  const at = (tier: number, bankroll: number, handsAtTier: number): CareerState => ({
    ...freshCareer(cfg, NOW), currentTier: tier, bankroll, handsAtTier,
  })
  it('promotes only when BOTH bankroll and hands gates pass', () => {
    // next stake from tier 1 is Low ($1 bb): 10 buy-ins = $1000
    expect(evaluateMovement(at(1, 1000, 100), cfg, stakes).moved).toBe('up')
    expect(evaluateMovement(at(1, 999, 100), cfg, stakes).moved).toBe(null)
    expect(evaluateMovement(at(1, 1000, 99), cfg, stakes).moved).toBe(null)
  })
  it('promotion resets handsAtTier and moves one tier', () => {
    const r = evaluateMovement(at(1, 1000, 150), cfg, stakes)
    expect(r.state.currentTier).toBe(2)
    expect(r.state.handsAtTier).toBe(0)
    expect(r.state.peakTier).toBe(2)
  })
  it('does not promote past the top tier', () => {
    expect(evaluateMovement(at(6, 10_000_000, 10_000), cfg, stakes).moved).toBe(null)
  })
  it('demotes below 2 buy-ins of the current stake', () => {
    // tier 3 buy-in $200 → floor $400
    expect(evaluateMovement(at(3, 399, 500), cfg, stakes).moved).toBe('down')
    expect(evaluateMovement(at(3, 400, 500), cfg, stakes).moved).toBe(null)
  })
  it('demotion resets handsAtTier and cannot go below tier 1', () => {
    const r = evaluateMovement(at(3, 100, 500), cfg, stakes)
    expect(r.state.currentTier).toBe(2)
    expect(r.state.handsAtTier).toBe(0)
    expect(evaluateMovement(at(1, 60, 0), cfg, stakes).moved).toBe(null)
  })
})

describe('bust and archive', () => {
  it('bust below one Micro buy-in', () => {
    expect(isBust({ ...freshCareer(cfg, NOW), bankroll: 49 }, cfg, stakes)).toBe(true)
    expect(isBust({ ...freshCareer(cfg, NOW), bankroll: 50 }, cfg, stakes)).toBe(false)
  })
  it('archive preserves history and starts a fresh run', () => {
    let s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    s = settleSession(s, 500, 60, 'leave', NOW)
    s = archiveRun(s, cfg, 'retired', '2026-07-13T00:00:00.000Z')
    expect(s.bankroll).toBe(cfg.startingBankroll)
    expect(s.currentTier).toBe(1)
    expect(s.sessions).toHaveLength(0)
    expect(s.archivedRuns).toHaveLength(1)
    expect(s.archivedRuns[0]).toMatchObject({
      endedBy: 'retired', peakBankroll: 500, totalHands: 60, sessionCount: 1,
    })
  })
})

describe('abandoned sessions', () => {
  it('refunds the buy-in and logs an abandoned record', () => {
    let s = startSession(freshCareer(cfg, NOW), cfg, stakes, NOW)
    s = refundAbandoned(s, NOW)
    expect(s.bankroll).toBe(50)
    expect(s.pendingSession).toBeNull()
    expect(s.sessions[0]).toMatchObject({ endedBy: 'abandoned', cashOut: 50, hands: 0 })
  })
  it('is a no-op without a pending session', () => {
    const s = freshCareer(cfg, NOW)
    expect(refundAbandoned(s, NOW)).toEqual(s)
  })
})
```

- [ ] **Step 3: Run** `npx vitest run tests/career-rules.test.ts` — FAIL (module missing).

- [ ] **Step 4: Implement** `app/utils/careerRules.ts`:

```ts
/**
 * Career mode — pure movement/settlement rules over a plain state shape.
 * No storage, no Vue: the Pinia store binds these to config + localStorage.
 * Rules (see the spec): promote at promoteBuyIns of the NEXT stake AND
 * promoteMinHands at the current tier; forced down below demoteBuyIns of
 * the CURRENT stake; bust below one tier-1 buy-in. Session-end only.
 */

export interface CareerConfig {
  startingBankroll: number
  buyInBB: number
  promoteBuyIns: number
  promoteMinHands: number
  demoteBuyIns: number
  playerCount: number
  tiers: Record<number, string[]>
}

export interface StakeLevel { level: number; bb: number; sb: number }

export type SessionEnd = 'leave' | 'felted' | 'timeout' | 'abandoned'

export interface CareerSessionRecord {
  tier: number
  buyIn: number
  cashOut: number
  hands: number
  endedBy: SessionEnd
  at: string
}

export interface ArchivedRun {
  startedAt: string
  endedAt: string
  peakBankroll: number
  peakTier: number
  totalHands: number
  sessionCount: number
  endedBy: 'bust' | 'retired'
}

export interface CareerState {
  version: 1
  bankroll: number
  currentTier: number
  handsAtTier: number
  totalHands: number
  peakBankroll: number
  peakTier: number
  runStartedAt: string
  sessions: CareerSessionRecord[]
  archivedRuns: ArchivedRun[]
  pendingSession: { tier: number; buyIn: number; startedAt: string } | null
}

export function freshCareer(cfg: CareerConfig, now: string, archivedRuns: ArchivedRun[] = []): CareerState {
  return {
    version: 1,
    bankroll: cfg.startingBankroll,
    currentTier: 1,
    handsAtTier: 0,
    totalHands: 0,
    peakBankroll: cfg.startingBankroll,
    peakTier: 1,
    runStartedAt: now,
    sessions: [],
    archivedRuns,
    pendingSession: null,
  }
}

export function buyInFor(tier: number, cfg: CareerConfig, stakes: StakeLevel[]): number {
  const stake = stakes.find(s => s.level === tier)
  if (!stake) throw new Error(`Unknown stake tier ${tier}`)
  return stake.bb * cfg.buyInBB
}

export function startSession(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[], now: string): CareerState {
  if (state.pendingSession) throw new Error('A career session is already in progress')
  const buyIn = buyInFor(state.currentTier, cfg, stakes)
  if (state.bankroll < buyIn) throw new Error('Bankroll cannot cover the buy-in')
  return {
    ...state,
    bankroll: state.bankroll - buyIn,
    pendingSession: { tier: state.currentTier, buyIn, startedAt: now },
  }
}

export function settleSession(state: CareerState, cashOut: number, hands: number, endedBy: SessionEnd, now: string): CareerState {
  const pending = state.pendingSession
  if (!pending) throw new Error('No career session to settle')
  const bankroll = state.bankroll + cashOut
  return {
    ...state,
    bankroll,
    peakBankroll: Math.max(state.peakBankroll, bankroll),
    handsAtTier: state.handsAtTier + hands,
    totalHands: state.totalHands + hands,
    sessions: [...state.sessions, { tier: pending.tier, buyIn: pending.buyIn, cashOut, hands, endedBy, at: now }],
    pendingSession: null,
  }
}

export function evaluateMovement(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[]): { state: CareerState; moved: 'up' | 'down' | null } {
  const maxTier = Math.max(...stakes.map(s => s.level))
  if (state.currentTier < maxTier) {
    const nextBuyIn = buyInFor(state.currentTier + 1, cfg, stakes)
    if (state.bankroll >= cfg.promoteBuyIns * nextBuyIn && state.handsAtTier >= cfg.promoteMinHands) {
      const tier = state.currentTier + 1
      return {
        moved: 'up',
        state: { ...state, currentTier: tier, handsAtTier: 0, peakTier: Math.max(state.peakTier, tier) },
      }
    }
  }
  if (state.currentTier > 1) {
    const floor = cfg.demoteBuyIns * buyInFor(state.currentTier, cfg, stakes)
    if (state.bankroll < floor) {
      return {
        moved: 'down',
        state: { ...state, currentTier: state.currentTier - 1, handsAtTier: 0 },
      }
    }
  }
  return { state, moved: null }
}

export function isBust(state: CareerState, cfg: CareerConfig, stakes: StakeLevel[]): boolean {
  return state.bankroll < buyInFor(1, cfg, stakes)
}

export function archiveRun(state: CareerState, cfg: CareerConfig, endedBy: 'bust' | 'retired', now: string): CareerState {
  const run: ArchivedRun = {
    startedAt: state.runStartedAt,
    endedAt: now,
    peakBankroll: state.peakBankroll,
    peakTier: state.peakTier,
    totalHands: state.totalHands,
    sessionCount: state.sessions.length,
    endedBy,
  }
  return freshCareer(cfg, now, [...state.archivedRuns, run])
}

export function refundAbandoned(state: CareerState, now: string): CareerState {
  const pending = state.pendingSession
  if (!pending) return state
  return {
    ...state,
    bankroll: state.bankroll + pending.buyIn,
    sessions: [...state.sessions, { tier: pending.tier, buyIn: pending.buyIn, cashOut: pending.buyIn, hands: 0, endedBy: 'abandoned', at: now }],
    pendingSession: null,
  }
}
```

- [ ] **Step 5: Run** `npx vitest run tests/career-rules.test.ts` — PASS. Then `yarn typecheck` — 0 errors.
- [ ] **Step 6: Commit** — `git commit -m "Career mode: config block and pure movement/settlement rules"`

---

### Task 2: Pinia career store with guarded persistence

**Files:**
- Create: `app/stores/career.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `useCareerStore()` with: `state: Ref<CareerState>`, `storageWarning: Ref<boolean>`, `lastMovement: Ref<'up' | 'down' | 'bust' | null>`, `tierStake` (computed `{ level, name, sb, bb }`), `currentBuyIn` (computed number), `promotionProgress` (computed `{ bankrollPct: number; handsPct: number; nextBuyIn: number } | null` — null at top tier), `perTierStats` (computed `Array<{ tier: number; sessions: number; hands: number; net: number; bb100: number }>`), `startSession(): void`, `settle(cashOut: number, hands: number, endedBy: SessionEnd): void`, `retire(): void`, `clearMovement(): void`.

- [ ] **Step 1: Implement** `app/stores/career.ts` (persistence is best-effort; a failed write flips `storageWarning`, never throws into gameplay):

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import config from '@config'
import {
  freshCareer, startSession as ruleStart, settleSession, evaluateMovement,
  isBust, archiveRun, refundAbandoned, buyInFor,
} from '~/utils/careerRules'
import type { CareerState, SessionEnd } from '~/utils/careerRules'

const STORAGE_KEY = 'holdem-career-v1'

function nowIso(): string {
  return new Date().toISOString()
}

export const useCareerStore = defineStore('career', () => {
  const cfg = config.career
  const stakes = config.stakes

  const state = ref<CareerState>(freshCareer(cfg, nowIso()))
  const storageWarning = ref(false)
  const lastMovement = ref<'up' | 'down' | 'bust' | null>(null)
  const hadAbandoned = ref(false)

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
      storageWarning.value = false
    } catch {
      storageWarning.value = true
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as CareerState
      if (parsed?.version !== 1) return
      state.value = parsed
      // Refresh mid-session: table state is gone — refund the buy-in
      // (accepted refresh-to-undo tradeoff, see the spec's edge cases)
      if (state.value.pendingSession) {
        state.value = refundAbandoned(state.value, nowIso())
        hadAbandoned.value = true
        save()
      }
    } catch {
      // corrupted/unavailable storage → keep the fresh default
    }
  }
  if (typeof localStorage !== 'undefined') load()

  const tierStake = computed(() => stakes.find(s => s.level === state.value.currentTier)!)
  const currentBuyIn = computed(() => buyInFor(state.value.currentTier, cfg, stakes))

  const promotionProgress = computed(() => {
    const maxTier = Math.max(...stakes.map(s => s.level))
    if (state.value.currentTier >= maxTier) return null
    const nextBuyIn = buyInFor(state.value.currentTier + 1, cfg, stakes)
    return {
      nextBuyIn,
      bankrollPct: Math.min(1, state.value.bankroll / (cfg.promoteBuyIns * nextBuyIn)),
      handsPct: Math.min(1, state.value.handsAtTier / cfg.promoteMinHands),
    }
  })

  const perTierStats = computed(() => {
    const byTier = new Map<number, { sessions: number; hands: number; net: number }>()
    for (const s of state.value.sessions) {
      if (s.endedBy === 'abandoned') continue
      const t = byTier.get(s.tier) ?? { sessions: 0, hands: 0, net: 0 }
      t.sessions++; t.hands += s.hands; t.net += s.cashOut - s.buyIn
      byTier.set(s.tier, t)
    }
    return [...byTier.entries()]
      .sort(([a], [b]) => a - b)
      .map(([tier, t]) => {
        const bb = stakes.find(s => s.level === tier)!.bb
        return { tier, ...t, bb100: t.hands > 0 ? (t.net / bb) / t.hands * 100 : 0 }
      })
  })

  function startSession() {
    state.value = ruleStart(state.value, cfg, stakes, nowIso())
    save()
  }

  function settle(cashOut: number, hands: number, endedBy: SessionEnd) {
    state.value = settleSession(state.value, cashOut, hands, endedBy, nowIso())
    if (isBust(state.value, cfg, stakes)) {
      state.value = archiveRun(state.value, cfg, 'bust', nowIso())
      lastMovement.value = 'bust'
    } else {
      const r = evaluateMovement(state.value, cfg, stakes)
      state.value = r.state
      if (r.moved) lastMovement.value = r.moved
    }
    save()
  }

  function retire() {
    state.value = archiveRun(state.value, cfg, 'retired', nowIso())
    lastMovement.value = null
    save()
  }

  function clearMovement() {
    lastMovement.value = null
    hadAbandoned.value = false
  }

  return {
    state, storageWarning, lastMovement, hadAbandoned,
    tierStake, currentBuyIn, promotionProgress, perTierStats,
    startSession, settle, retire, clearMovement,
  }
})
```

- [ ] **Step 2: Verify** — `yarn typecheck` (0 errors). No dedicated store test (logic lives in the tested rules module; localStorage is absent in the node test env by design — the `typeof localStorage` guard covers it).
- [ ] **Step 3: Commit** — `git commit -m "Career mode: Pinia store with guarded localStorage persistence"`

---

### Task 3: /career dashboard page

**Files:**
- Create: `app/pages/career.vue`

**Interfaces:**
- Consumes: `useCareerStore()` from Task 2, `config.career.tiers` roster names.
- Produces: the route `/career`; a Play button that calls `careerStore.startSession()` then `navigateTo('/')`.

- [ ] **Step 1: Implement** `app/pages/career.vue`. Functional, dark-theme-consistent (`bg-gray-950`, same idioms as `stats.vue`); polish is Phase 7. Full file:

```vue
<script setup lang="ts">
defineOptions({ name: 'career' })
import config from '@config'
import { useCareerStore } from '~/stores/career'

const career = useCareerStore()
const showRetireModal = ref(false)

const tiers = computed(() =>
  config.stakes.map(s => ({
    ...s,
    roster: (config.career.tiers[s.level] ?? []) as string[],
    isCurrent: s.level === career.state.currentTier,
    reached: s.level <= career.state.peakTier,
  })),
)

const movementNotice = computed(() => {
  switch (career.lastMovement) {
    case 'up': return { text: `Moved up to ${career.tierStake.name}!`, tone: 'text-green-400' }
    case 'down': return { text: `Dropped down to ${career.tierStake.name}.`, tone: 'text-orange-400' }
    case 'bust': return { text: 'Career over — run archived. Fresh start at the micros.', tone: 'text-red-400' }
    default: return null
  }
})

function playSession() {
  career.startSession()
  navigateTo('/')
}

function confirmRetire() {
  career.retire()
  showRetireModal.value = false
}

const fmt = (n: number) => n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white p-6">
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Career</h1>
          <p class="text-sm text-gray-400">Run started {{ new Date(career.state.runStartedAt).toLocaleDateString() }}</p>
        </div>
        <NuxtLink to="/" class="text-sm text-gray-400 hover:text-white">← Table</NuxtLink>
      </div>

      <div v-if="movementNotice" class="rounded-lg border border-gray-800 bg-gray-900 p-3 flex justify-between items-center">
        <span :class="movementNotice.tone" class="font-semibold">{{ movementNotice.text }}</span>
        <UButton size="xs" variant="ghost" color="neutral" @click="() => career.clearMovement()">Dismiss</UButton>
      </div>
      <div v-if="career.hadAbandoned" class="rounded-lg border border-gray-800 bg-gray-900 p-3 text-sm text-gray-400">
        A session was interrupted (page closed mid-game) — the buy-in was refunded.
      </div>
      <div v-if="career.storageWarning" class="rounded-lg border border-orange-900 bg-orange-950/40 p-3 text-sm text-orange-300">
        Browser storage is unavailable — career progress can't be saved right now.
      </div>

      <!-- Bankroll + actions -->
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
        <div>
          <div class="text-sm text-gray-400">Bankroll</div>
          <div class="text-3xl font-bold font-mono">{{ fmt(career.state.bankroll) }}</div>
          <div class="text-xs text-gray-500 mt-1">
            Peak {{ fmt(career.state.peakBankroll) }} · {{ career.state.totalHands }} hands this run
          </div>
        </div>
        <div class="flex gap-2">
          <UButton color="primary" size="lg" :disabled="career.state.bankroll < career.currentBuyIn" @click="playSession">
            Play {{ career.tierStake.name }} — buy-in {{ fmt(career.currentBuyIn) }}
          </UButton>
          <UButton variant="outline" color="neutral" size="lg" @click="() => { showRetireModal = true }">Retire</UButton>
        </div>
      </div>

      <!-- Ladder -->
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-2">
        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">The Ladder</h2>
        <div
          v-for="t in [...tiers].reverse()"
          :key="t.level"
          class="flex items-center justify-between rounded-lg px-3 py-2"
          :class="t.isCurrent ? 'bg-green-950/40 border border-green-800' : 'bg-gray-950/40'"
        >
          <div class="flex items-center gap-3">
            <span class="font-mono text-xs w-16" :class="t.isCurrent ? 'text-green-400' : 'text-gray-500'">${{ t.sb }}/${{ t.bb }}</span>
            <span :class="t.isCurrent ? 'text-white font-semibold' : t.reached ? 'text-gray-300' : 'text-gray-600'">{{ t.name }}</span>
            <span v-if="t.isCurrent" class="text-xs text-green-400">← you</span>
          </div>
          <div class="text-xs text-gray-500 truncate max-w-[45%]">{{ t.roster.join(' · ') }}</div>
        </div>
        <div v-if="career.promotionProgress" class="pt-2 space-y-1 text-xs text-gray-400">
          <div class="flex justify-between">
            <span>Bankroll toward promotion ({{ config.career.promoteBuyIns }} buy-ins of the next stake)</span>
            <span class="font-mono">{{ Math.round(career.promotionProgress.bankrollPct * 100) }}%</span>
          </div>
          <div class="h-1.5 rounded bg-gray-800"><div class="h-1.5 rounded bg-green-600" :style="{ width: `${career.promotionProgress.bankrollPct * 100}%` }" /></div>
          <div class="flex justify-between">
            <span>Hands at this tier ({{ config.career.promoteMinHands }} needed)</span>
            <span class="font-mono">{{ Math.round(career.promotionProgress.handsPct * 100) }}%</span>
          </div>
          <div class="h-1.5 rounded bg-gray-800"><div class="h-1.5 rounded bg-green-600" :style="{ width: `${career.promotionProgress.handsPct * 100}%` }" /></div>
        </div>
        <div v-else class="pt-2 text-xs text-yellow-500">Top of the ladder — nowhere left to climb.</div>
      </div>

      <!-- Per-tier results -->
      <div v-if="career.perTierStats.length" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">This Run</h2>
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 text-xs">
            <th class="pb-2">Tier</th><th class="pb-2">Sessions</th><th class="pb-2">Hands</th><th class="pb-2">Net</th><th class="pb-2">bb/100</th>
          </tr></thead>
          <tbody>
            <tr v-for="t in career.perTierStats" :key="t.tier" class="border-t border-gray-800">
              <td class="py-1.5">{{ config.stakes.find(s => s.level === t.tier)?.name }}</td>
              <td class="py-1.5 font-mono">{{ t.sessions }}</td>
              <td class="py-1.5 font-mono">{{ t.hands }}</td>
              <td class="py-1.5 font-mono" :class="t.net >= 0 ? 'text-green-400' : 'text-red-400'">{{ t.net >= 0 ? '+' : '' }}{{ fmt(t.net) }}</td>
              <td class="py-1.5 font-mono">{{ t.bb100.toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Hall of fame -->
      <div v-if="career.state.archivedRuns.length" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Past Runs</h2>
        <div v-for="(run, i) in [...career.state.archivedRuns].reverse()" :key="i" class="flex justify-between text-sm border-t border-gray-800 py-1.5 first:border-t-0">
          <span class="text-gray-400">{{ new Date(run.startedAt).toLocaleDateString() }} → {{ new Date(run.endedAt).toLocaleDateString() }}</span>
          <span class="font-mono">peak {{ fmt(run.peakBankroll) }} · {{ config.stakes.find(s => s.level === run.peakTier)?.name }} · {{ run.totalHands }} hands</span>
          <span :class="run.endedBy === 'retired' ? 'text-green-400' : 'text-red-400'">{{ run.endedBy }}</span>
        </div>
      </div>

      <UModal v-model:open="showRetireModal">
        <template #content>
          <div class="p-6 space-y-4">
            <h3 class="text-lg font-semibold">Retire this career?</h3>
            <p class="text-sm text-gray-400">
              The run is archived to Past Runs ({{ fmt(career.state.bankroll) }} final, peak {{ fmt(career.state.peakBankroll) }})
              and a fresh career starts at {{ fmt(config.career.startingBankroll) }}.
            </p>
            <div class="flex gap-2 justify-end">
              <UButton variant="ghost" color="neutral" @click="() => { showRetireModal = false }">Cancel</UButton>
              <UButton color="primary" @click="confirmRetire">Retire</UButton>
            </div>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify** — `yarn typecheck` (0 errors); `yarn dev`, open `http://localhost:3000/career` (port may vary): dashboard renders, Play disabled state correct, Retire modal opens/cancels.
- [ ] **Step 3: Commit** — `git commit -m "Career mode: /career dashboard (ladder, progress, run history, retire)"`

---

### Task 4: Locked career sessions at the existing table

**Files:**
- Modify: `app/pages/index.vue` — career entry on mount, Leave-table control, felted/timeout settlement, career-aware busted screen, nav link.

**Interfaces:**
- Consumes: `useCareerStore()` (Task 2), `config.career`, `shuffle` from `~/utils/shuffle`, existing `handleStart(gameSettings: GameSettings)` (index.vue:287), `session.handsPlayed` (useSessionStats), `phase` ref, `backToSetup()`.

- [ ] **Step 1: Career entry.** In `app/pages/index.vue` `<script setup>`, after `const heroProfileStore = useHeroProfileStore()` add:

```ts
const careerStore = useCareerStore()
const careerMode = ref(false)

// Career sessions arrive with a pendingSession set by /career's Play button.
// Lock the table to the tier: stake, 6-max roster sample, 100bb buy-in.
onMounted(() => {
  if (careerStore.state.pendingSession) startCareerSession()
})

function startCareerSession() {
  const pending = careerStore.state.pendingSession!
  const roster = (config.career.tiers[pending.tier] ?? []) as string[]
  const opponents = shuffle(roster).slice(0, config.career.playerCount - 1)
  const botConfigs = opponents.map((name) => {
    const p = config.personas.find(x => x.name === name)!
    return {
      preset: p.name, name: p.name,
      vpip: p.vpip, pfr: p.pfr, aggression: p.aggression,
      bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq,
      tiltMultiplier: p.tiltMultiplier ?? 1.0,
      threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
      fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq,
      limpFreq: p.limpFreq, styleBias: p.styleBias,
      betSizeMult: p.betSizeMult, overbetFreq: p.overbetFreq,
      leak: p.leak,
    }
  })
  careerMode.value = true
  handleStart({
    playerCount: config.career.playerCount,
    stakeLevel: pending.tier,
    customBB: null,
    stackBB: config.career.buyInBB,
    heroName: 'Hero',
    botConfigs,
    guestMode: false,
    commentaryMode: 'hero',
  })
}

function endCareerSession(endedBy: 'leave' | 'felted' | 'timeout') {
  const cashOut = endedBy === 'felted' ? 0 : (gs.hero.value?.chips ?? 0)
  careerStore.settle(cashOut, session.value.handsPlayed, endedBy)
  careerMode.value = false
  navigateTo('/career')
}
```

Add the imports next to the existing ones: `import { useCareerStore } from '~/stores/career'` and `import { shuffle } from '~/utils/shuffle'` (check first — `shuffle` may already be imported; if so, skip that line).

- [ ] **Step 2: Leave control.** In the template, next to the "Deal Next Hand" button (visible at showdown), add a career-only leave button:

```vue
<UButton
  v-if="careerMode"
  variant="outline"
  color="neutral"
  @click="() => endCareerSession('leave')"
>
  Leave table (bank ${{ gs.hero.value?.chips ?? 0 }})
</UButton>
```

Leaving is only offered between hands (this button renders beside Deal Next Hand, which only shows at showdown) — mid-hand escape would dodge losses.

- [ ] **Step 3: Felted + timeout.** In the busted-screen block (`index.vue:639`), branch on career mode — replace the Re-buy/back buttons region with:

```vue
<div class="flex gap-3 justify-center">
  <template v-if="careerMode">
    <UButton color="primary" size="lg" @click="() => endCareerSession('felted')">
      Back to Career
    </UButton>
  </template>
  <template v-else>
    <UButton v-if="config.session.rebuyEnabled" color="primary" size="lg" @click="handleRebuy">
      Re-buy (${{ startingStack }})
    </UButton>
    <UButton variant="outline" color="neutral" size="lg" @click="backToSetup">
      Back to Setup
    </UButton>
  </template>
</div>
```

Replace `handleTimeout()` (currently at `index.vue:50-59`) with a career-aware version — the existing body is preserved as the non-career branch:

```ts
function handleTimeout() {
  if (phase.value !== 'table') return
  const heroState = gs.playerStates.value[0]
  if (heroState && !heroState.folded && gs.waitingForHero.value) {
    heroState.folded = true
    heroState.lastAction = 'fold'
    gs.waitingForHero.value = false
  }
  if (careerMode.value) {
    // Inactivity ends the career session; current stack settles like a leave.
    // (Chips already committed to the abandoned pot are forfeited — same as
    // walking away from a real table mid-hand.)
    endCareerSession('timeout')
    return
  }
  phase.value = 'timeout'
}
```

Also route the header "← Setup" control through the career exit: locate the back-to-setup button in the table-phase template (grep `backToSetup` in the template section of `index.vue`), keep its element and class attribute exactly as they are, and change only its click handler to:

```
@click="careerMode ? endCareerSession('leave') : backToSetup()"
```

Mid-hand header-leave in career mode is allowed and honest by construction: `endCareerSession('leave')` banks `gs.hero.value.chips`, which already excludes chips committed to the pot — those are forfeited, exactly like walking away from a live table mid-hand.

- [ ] **Step 4: Nav exposure.** Grep `Bot Analysis` across `app/` to find the setup-screen header nav links (they render as `<NuxtLink>`s labelled "Stats" and "Bot Analysis"). Add a third link labelled `Career` pointing `to="/career"`, copying the class attribute verbatim from the adjacent "Stats" link so styling matches.

- [ ] **Step 5: Verify live.** `yarn dev` → `/career` → Play: table opens locked (tier stake, 6 opponents from the roster, no setup screen). Play a hand; Leave at showdown; dashboard shows the settled session, hands count, updated bankroll. Force a felted end (raise all-in until bust or use Micro short runs) and confirm the Back-to-Career path. `yarn test` + `yarn typecheck` green.
- [ ] **Step 6: Commit** — `git commit -m "Career mode: locked sessions at the live table with leave/felted/timeout settlement"`

---

### Task 5: Wrap-up — docs and final gates

**Files:**
- Modify: `README.md` (Features: career mode blurb; TOC entry), `CHANGELOG.md` (`[Unreleased]` → Added)

- [ ] **Step 1: README** — add to the features area (near "Tools & Export"):

```markdown
### Career Mode
- **Persistent bankroll** -- start with $50 at Micro; every session's result banks into your career
- **Six-tier ladder** -- lineups toughen as you climb: fictional fish at Micro, leaky pros mid-stakes, the elite (Pvey, Ceese, Twan) at Nosebleed
- **Real bankroll rules** -- move up with 10 buy-ins of the next stake (and 100 hands at your tier), forced down under 2 buy-ins, career over if you can't cover a Micro buy-in
- **Run history** -- busted and retired careers archive to a hall of fame (peak bankroll, peak tier, hands)
- All pacing numbers in `holdem.config.ts` → `career`
```

- [ ] **Step 2: CHANGELOG** — under `## [Unreleased]` → `### Added`, first bullet:

```markdown
- **Career mode** (`/career`) — persistent-bankroll ladder over the six stake tiers with per-tier persona rosters (fish at Micro → elite at Nosebleed), real bankroll-management movement rules (10-buy-in/100-hand promotion, 2-buy-in demotion floor, bust archives the run to a hall of fame), retire-to-archive, and session settlement wired into the existing live table. Pure rules module (`careerRules.ts`) + Pinia store + dashboard; quick-play unchanged.
```

- [ ] **Step 3: Final gates** — `yarn test` (all green), `yarn typecheck` (0), `yarn generate` (builds), and one full live loop in the browser (career → session → settle → dashboard reflects it).
- [ ] **Step 4: Commit** — `git commit -m "Career mode wrap-up: README + CHANGELOG"` then follow superpowers:finishing-a-development-branch.
