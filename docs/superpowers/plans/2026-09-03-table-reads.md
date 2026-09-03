# Table Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bots read the table they are sitting at (public information only) and adjust thin value, river bluffs and probe bets within config-bounded factors, with the exploit probe gating the result in CI.

**Architecture:** One pure tracker module (`app/utils/tableReads.ts`) keeps a rolling 30-hand window of table-wide bets / checks / flops / showdowns and derives three booleans. The live engine, both simulators and the exploit probe feed the same tracker and pass `ctx.tableReads` into `decideBotAction`, which applies three multipliers from `config.strategy.tableReads`. No read → byte-identical decisions.

**Tech Stack:** TypeScript, Nuxt 4 (Vue 3, `~` alias = `app/`), Vitest 4 (`yarn vitest run <file>`), vite-node for scripts (`yarn probe`). Scripts must import with relative paths (vite-node ignores the `~`/`@config` aliases).

**Spec:** `docs/superpowers/specs/2026-09-03-table-reads-design.md`

## Global Constraints

- Thresholds and factors live only in `holdem.config.ts` → `strategy.tableReads`: `windowHands: 30, minHands: 10, passiveAt: 0.62, showdownHeavyAt: 0.85, showdownLightAt: 0.30, thinValueBoost: 1.4, riverBluffPenalty: 0.3, probeBoost: 1.25`.
- "bet" = any raise/all-in; "check" = check; calls and folds count toward neither. "showdown" = hand ended with ≥ 2 players still in.
- The tracker is pure and framework-free (no Vue imports); the engine/sims/probe own the state object.
- Every strategy in `tests/exploit-probe.test.ts` must stay below +10 bb/100 at 100bb and 25bb after the change.
- After any change to `app/utils/botDecision.ts`, run `yarn probe all 10000 20260712` and `yarn probe all 10000 20260712 25`.
- TDD: write the failing test, watch it fail, implement, watch it pass, commit. Commit messages end with the descriptive content (no AI trailers — user rule).

---

### Task 1: Tracker module + config block

**Files:**
- Create: `app/utils/tableReads.ts`
- Modify: `holdem.config.ts` (append to `strategy` block after `barrel: {...},`)
- Test: `tests/table-reads.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TableReadConfig { windowHands: number; minHands: number; passiveAt: number; showdownHeavyAt: number; showdownLightAt: number; thinValueBoost: number; riverBluffPenalty: number; probeBoost: number }
  export interface TableReads { passive: boolean; showdownHeavy: boolean; showdownLight: boolean }
  export interface TableReadState { current: { bets: number; checks: number }; hands: { bets: number; checks: number; sawFlop: boolean; showdown: boolean }[] }
  export function createTableReadState(): TableReadState
  export function noteTableAction(state: TableReadState, type: 'bet' | 'check'): void
  export function finishTableHand(state: TableReadState, hand: { sawFlop: boolean; showdown: boolean }, windowHands: number): void
  export function readTable(state: TableReadState, cfg: TableReadConfig): TableReads | undefined
  export function tableReadStats(state: TableReadState): { hands: number; passivity: number; showdownPerFlop: number }
  ```
- `config.strategy.tableReads: TableReadConfig`

- [ ] **Step 1: Write the failing test**

```ts
// tests/table-reads.test.ts
/**
 * Table reads: a rolling window of public table-wide signals (bets, checks,
 * flops seen, showdowns) → three booleans the bots may act on. Thresholds
 * sit outside the measured range of a normal pro table (passivity
 * 0.41–0.56, showdown-per-flop 0.42–0.71 over 30-hand windows).
 */
import { describe, it, expect } from 'vitest'
import { createTableReadState, noteTableAction, finishTableHand, readTable, tableReadStats } from '../app/utils/tableReads'
import config from '../holdem.config'

const cfg = config.strategy.tableReads

function play(state: ReturnType<typeof createTableReadState>, hands: number, per: { bets: number; checks: number; sawFlop: boolean; showdown: boolean }) {
  for (let i = 0; i < hands; i++) {
    for (let b = 0; b < per.bets; b++) noteTableAction(state, 'bet')
    for (let c = 0; c < per.checks; c++) noteTableAction(state, 'check')
    finishTableHand(state, { sawFlop: per.sawFlop, showdown: per.showdown }, cfg.windowHands)
  }
}

describe('tableReads tracker', () => {
  it('is silent below minHands', () => {
    const s = createTableReadState()
    play(s, cfg.minHands - 1, { bets: 1, checks: 9, sawFlop: true, showdown: true })
    expect(readTable(s, cfg)).toBeUndefined()
  })

  it('keeps only the last windowHands hands', () => {
    const s = createTableReadState()
    play(s, cfg.windowHands, { bets: 9, checks: 1, sawFlop: true, showdown: false })   // aggressive early
    play(s, cfg.windowHands, { bets: 1, checks: 9, sawFlop: true, showdown: true })    // then a station table
    expect(s.hands).toHaveLength(cfg.windowHands)
    expect(readTable(s, cfg)).toEqual({ passive: true, showdownHeavy: true, showdownLight: false })
  })

  it('a normal pro table produces no read', () => {
    const s = createTableReadState()
    play(s, 30, { bets: 5, checks: 5, sawFlop: true, showdown: true })   // passivity 0.50
    play(s, 0, { bets: 0, checks: 0, sawFlop: false, showdown: false })
    // showdown-per-flop 1.0 above would trip showdownHeavy; mix in flops without showdown
    const t = createTableReadState()
    for (let i = 0; i < 30; i++) {
      noteTableAction(t, 'bet'); noteTableAction(t, 'check')
      finishTableHand(t, { sawFlop: true, showdown: i % 2 === 0 }, cfg.windowHands)   // 0.50 showdown-per-flop
    }
    expect(readTable(t, cfg)).toEqual({ passive: false, showdownHeavy: false, showdownLight: false })
  })

  it('passivity counts only bets and checks, and flags a check-heavy table', () => {
    const s = createTableReadState()
    play(s, 12, { bets: 3, checks: 7, sawFlop: true, showdown: false })   // 0.70 ≥ passiveAt
    expect(tableReadStats(s).passivity).toBeCloseTo(0.7, 2)
    expect(readTable(s, cfg)!.passive).toBe(true)
  })

  it('showdown-per-flop ignores hands that never saw a flop', () => {
    const s = createTableReadState()
    play(s, 10, { bets: 1, checks: 1, sawFlop: false, showdown: false })  // preflop fold-outs
    play(s, 10, { bets: 1, checks: 1, sawFlop: true, showdown: true })    // every flop → showdown
    expect(tableReadStats(s).showdownPerFlop).toBe(1)
    expect(readTable(s, cfg)!.showdownHeavy).toBe(true)
  })

  it('flags a weak-tight table (flops seen, few showdowns)', () => {
    const s = createTableReadState()
    play(s, 20, { bets: 2, checks: 8, sawFlop: true, showdown: false })   // 0.0 showdown-per-flop, passive
    expect(readTable(s, cfg)).toEqual({ passive: true, showdownHeavy: false, showdownLight: true })
  })

  it('config thresholds sit outside the normal-table range', () => {
    expect(cfg.passiveAt).toBeGreaterThan(0.56)
    expect(cfg.showdownHeavyAt).toBeGreaterThan(0.71)
    expect(cfg.showdownLightAt).toBeLessThan(0.42)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn vitest run tests/table-reads.test.ts`
Expected: FAIL — "Cannot find module '../app/utils/tableReads'".

- [ ] **Step 3: Add the config block**

In `holdem.config.ts`, inside `strategy: { ... }`, directly after the `barrel: { ... },` entry:

```ts
    // Table reads — public table-wide signals over a rolling window.
    // Thresholds sit outside a normal pro table's range (passivity
    // 0.41–0.56, showdown-per-flop 0.42–0.71 over 30-hand windows, seed
    // 20260712); a calling station drives 0.64+/1.00. Effects are bounded
    // multipliers on existing knobs; no read → decisions byte-identical.
    tableReads: {
      windowHands: 30, minHands: 10,
      passiveAt: 0.62, showdownHeavyAt: 0.85, showdownLightAt: 0.30,
      thinValueBoost: 1.4, riverBluffPenalty: 0.3, probeBoost: 1.25,
    },
```

- [ ] **Step 4: Write the module**

```ts
// app/utils/tableReads.ts
/**
 * Table reads — what kind of table is this? A rolling window of PUBLIC,
 * table-wide signals (bets, checks, flops seen, showdowns reached) → three
 * booleans the bot brain may act on. Nothing here looks at cards. Pure and
 * framework-free: the live engine, both simulators and the exploit probe
 * own a state object each and call the same three functions, so the CI
 * probe gate measures exactly what the live table does.
 */
export interface TableReadConfig {
  windowHands: number
  minHands: number
  passiveAt: number         // passivity = checks / (checks + bets)
  showdownHeavyAt: number   // showdowns / flops seen
  showdownLightAt: number
  thinValueBoost: number    // river thin-value frequency × (station table)
  riverBluffPenalty: number // river bluff-raise frequency × (station table)
  probeBoost: number        // probe / stab bet rate × (weak-tight table)
}

export interface TableReads {
  passive: boolean
  showdownHeavy: boolean
  showdownLight: boolean
}

interface HandSample { bets: number; checks: number; sawFlop: boolean; showdown: boolean }

export interface TableReadState {
  current: { bets: number; checks: number }
  hands: HandSample[]
}

export function createTableReadState(): TableReadState {
  return { current: { bets: 0, checks: 0 }, hands: [] }
}

/** A bet or raise (all-ins included) or a check. Calls and folds are not counted. */
export function noteTableAction(state: TableReadState, type: 'bet' | 'check'): void {
  if (type === 'bet') state.current.bets++
  else state.current.checks++
}

/** Close the hand: push its sample, keep the window, reset the accumulators. */
export function finishTableHand(state: TableReadState, hand: { sawFlop: boolean; showdown: boolean }, windowHands: number): void {
  state.hands.push({ bets: state.current.bets, checks: state.current.checks, sawFlop: hand.sawFlop, showdown: hand.showdown })
  while (state.hands.length > windowHands) state.hands.shift()
  state.current = { bets: 0, checks: 0 }
}

export function tableReadStats(state: TableReadState): { hands: number; passivity: number; showdownPerFlop: number } {
  let bets = 0, checks = 0, flops = 0, showdowns = 0
  for (const h of state.hands) {
    bets += h.bets; checks += h.checks
    if (h.sawFlop) { flops++; if (h.showdown) showdowns++ }
  }
  return {
    hands: state.hands.length,
    passivity: bets + checks > 0 ? checks / (bets + checks) : 0,
    showdownPerFlop: flops > 0 ? showdowns / flops : 0,
  }
}

/** undefined below minHands; otherwise the three reads. */
export function readTable(state: TableReadState, cfg: TableReadConfig): TableReads | undefined {
  if (state.hands.length < cfg.minHands) return undefined
  const s = tableReadStats(state)
  return {
    passive: s.passivity >= cfg.passiveAt,
    showdownHeavy: s.showdownPerFlop >= cfg.showdownHeavyAt,
    showdownLight: s.showdownPerFlop <= cfg.showdownLightAt,
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn vitest run tests/table-reads.test.ts`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add app/utils/tableReads.ts holdem.config.ts tests/table-reads.test.ts
git commit -m "Table reads: pure rolling-window tracker + config block"
```

---

### Task 2: Bot brain effects

**Files:**
- Modify: `app/utils/botDecision.ts` — `DecisionContext` (after `tableDynamics?: {...}`), `maybeThinValueRiver` (signature + `freq`), both `maybeThinValueRiver(...)` call sites, the IP probe (`if (rng() < probeBase * probeTexture)`), the OOP stab (`if (hasNothing && rng() < probeRate)`), the river bluff-raise (`if (rng() < profile.bluffFreq * (isInPosition ? 0.25 : 0.12) * profile.aggression && ...`).
- Test: `tests/table-reads-effects.test.ts`

**Interfaces:**
- Consumes: `TableReads` from Task 1; `STRAT.tableReads` (the module already has `const STRAT = config.strategy`).
- Produces: `DecisionContext.tableReads?: TableReads`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/table-reads-effects.test.ts
/**
 * Each table read moves exactly one knob by its configured factor, and a
 * context with no read (or all-false reads) is byte-identical to today.
 * Frequencies are measured over seeded decisions; bands are ±25% of the
 * expected ratio, which is far outside sampling noise at 6,000 samples.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction } from '../app/utils/botDecision'
import type { DecisionContext, BotProfile } from '../app/utils/botDecision'
import { mulberry32 } from '../app/utils/rng'
import type { Card } from '../app/utils/cards'
import config from '../holdem.config'

const cfg = config.strategy.tableReads
const N = 6000
const profile: BotProfile = { vpip: 0.25, pfr: 0.2, aggression: 1.2, bluffFreq: 0.18, creativeFreq: 0.08 }
const c = (rank: number, suit: Card['suit']): Card => ({ rank, suit })

function rate(make: (rng: () => number) => DecisionContext, pick: (a: { type: string }) => boolean, seedBase: number): number {
  let hits = 0
  for (let i = 0; i < N; i++) if (pick(decideBotAction(profile, make(mulberry32(seedBase + i)), 1))) hits++
  return hits / N
}
const isRaise = (a: { type: string }) => a.type === 'raise'
const STATION = { passive: true, showdownHeavy: true, showdownLight: false }
const WEAK_TIGHT = { passive: true, showdownLight: true, showdownHeavy: false }
const NONE = { passive: false, showdownHeavy: false, showdownLight: false }

// River, checked to us, medium-strength made hand: top pair, weak kicker.
// Reaches maybeThinValueRiver (strength in [0.42, 0.55)) as the non-raiser.
const thinValueCtx = (rng: () => number, tableReads?: DecisionContext['tableReads']): DecisionContext => ({
  street: 'river', toCall: 0, pot: 40, currentBet: 0, playerBet: 0, chips: 200, bb: 2,
  numActivePlayers: 2, raiseLevel: 0, position: 'BTN',
  holeCards: [c(13, 'spades'), c(5, 'diamonds')],
  community: [c(13, 'hearts'), c(9, 'clubs'), c(4, 'diamonds'), c(2, 'spades'), c(7, 'clubs')],
  wasPreflopRaiser: false, preflopCallers: 1, rng, tableReads,
})

// River, facing a half-pot bet with nothing: the bluff-raise line.
const bluffRaiseCtx = (rng: () => number, tableReads?: DecisionContext['tableReads']): DecisionContext => ({
  street: 'river', toCall: 20, pot: 60, currentBet: 20, playerBet: 0, chips: 200, bb: 2,
  numActivePlayers: 2, raiseLevel: 0, position: 'BTN',
  holeCards: [c(8, 'spades'), c(6, 'diamonds')],
  community: [c(13, 'hearts'), c(11, 'clubs'), c(4, 'diamonds'), c(2, 'spades'), c(10, 'clubs')],
  wasPreflopRaiser: false, preflopCallers: 1, rng, tableReads,
})

// Turn, in position, checked to us, air, not the preflop raiser: the IP probe.
const probeCtx = (rng: () => number, tableReads?: DecisionContext['tableReads']): DecisionContext => ({
  street: 'turn', toCall: 0, pot: 30, currentBet: 0, playerBet: 0, chips: 200, bb: 2,
  numActivePlayers: 2, raiseLevel: 0, position: 'BTN',
  holeCards: [c(8, 'spades'), c(6, 'diamonds')],
  community: [c(13, 'hearts'), c(11, 'clubs'), c(4, 'diamonds'), c(2, 'spades')],
  wasPreflopRaiser: false, preflopCallers: 1, rng, tableReads,
})

describe('table reads move exactly the configured knobs', () => {
  it('no read and all-false reads are byte-identical to an absent field', () => {
    for (let i = 0; i < 300; i++) {
      const a = decideBotAction(profile, thinValueCtx(mulberry32(500 + i)), 1)
      const b = decideBotAction(profile, thinValueCtx(mulberry32(500 + i), NONE), 1)
      expect(b).toEqual(a)
      const d = decideBotAction(profile, probeCtx(mulberry32(900 + i)), 1)
      const e = decideBotAction(profile, probeCtx(mulberry32(900 + i), NONE), 1)
      expect(e).toEqual(d)
    }
  })

  it('station table: river thin value rises by thinValueBoost', () => {
    const base = rate(r => thinValueCtx(r), isRaise, 10_000)
    const boosted = rate(r => thinValueCtx(r, STATION), isRaise, 10_000)
    expect(base).toBeGreaterThan(0.05)                       // the branch is actually reached
    expect(boosted / base).toBeGreaterThan(cfg.thinValueBoost * 0.75)
    expect(boosted / base).toBeLessThan(cfg.thinValueBoost * 1.25)
  })

  it('station table: river bluff-raises fall to riverBluffPenalty', () => {
    const base = rate(r => bluffRaiseCtx(r), isRaise, 20_000)
    const cut = rate(r => bluffRaiseCtx(r, STATION), isRaise, 20_000)
    expect(base).toBeGreaterThan(0.02)
    expect(cut / base).toBeGreaterThan(cfg.riverBluffPenalty * 0.6)
    expect(cut / base).toBeLessThan(cfg.riverBluffPenalty * 1.4)
  })

  it('weak-tight table: in-position probe bets rise by probeBoost', () => {
    const base = rate(r => probeCtx(r), isRaise, 30_000)
    const boosted = rate(r => probeCtx(r, WEAK_TIGHT), isRaise, 30_000)
    expect(base).toBeGreaterThan(0.03)
    expect(boosted / base).toBeGreaterThan(cfg.probeBoost * 0.85)
    expect(boosted / base).toBeLessThan(cfg.probeBoost * 1.15)
  })

  it('a station read does not touch probe bets, and a weak-tight read does not touch thin value', () => {
    const probeBase = rate(r => probeCtx(r), isRaise, 40_000)
    expect(rate(r => probeCtx(r, STATION), isRaise, 40_000)).toBeCloseTo(probeBase, 1)
    const thinBase = rate(r => thinValueCtx(r), isRaise, 50_000)
    expect(rate(r => thinValueCtx(r, WEAK_TIGHT), isRaise, 50_000)).toBeCloseTo(thinBase, 1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn vitest run tests/table-reads-effects.test.ts`
Expected: the "byte-identical" test passes (unknown fields are ignored today); the three factor tests FAIL with ratios ≈ 1.0. If a `base` assertion fails (branch not reached), adjust the context's cards until the base rate is above the floor — the strength band for thin value is `[0.42, 0.55)` in `postflopHandStrength`; top pair with a weak kicker on a dry board sits there.

- [ ] **Step 3: Implement the effects**

In `app/utils/botDecision.ts`:

1. Import the type and add the context field:
```ts
import type { TableReads } from './tableReads'
```
and inside `DecisionContext`, after the `tableDynamics?: {...}` block:
```ts
  // Table reads — public, table-wide (see utils/tableReads.ts)
  tableReads?: TableReads
```

2. `maybeThinValueRiver`: add a multiplier parameter and apply it.
```ts
function maybeThinValueRiver(
  pot: number,
  profile: BotProfile,
  bb: number,
  strength: number,
  isMultiway: boolean,
  isInPosition: boolean,
  tableMult: number = 1.0,   // station table: value-bet thinner
  rng: Rng = Math.random,
): number | null {
  if (strength < 0.42 || strength >= 0.55) return null
  const freq = Math.min(
    0.35
      * (isMultiway ? 0.5 : 1.0)   // multiway, someone has us beat more often
      * (isInPosition ? 1.15 : 0.9)
      * profile.aggression
      * tableMult,
    0.6,
  )
  if (rng() >= freq) return null
  return sizedBet(pot, 0.30 + rng() * 0.12, profile, bb)
}
```

3. Near the top of `decidePostflopAction` (after `const board = ...` / `rangeAdv`), derive the multipliers once:
```ts
  // ─── Table reads (public signals; see utils/tableReads.ts) ─────
  const TR = STRAT.tableReads
  const stationTable = !!(ctx.tableReads?.passive && ctx.tableReads?.showdownHeavy)
  const weakTightTable = !!(ctx.tableReads?.passive && ctx.tableReads?.showdownLight)
  const thinValueMult = stationTable ? TR.thinValueBoost : 1.0
  const riverBluffMult = stationTable ? TR.riverBluffPenalty : 1.0
  const probeMult = weakTightTable ? TR.probeBoost : 1.0
```

4. Both call sites become:
```ts
      const thin = maybeThinValueRiver(pot, profile, bb, strength, isMultiway, isInPosition, thinValueMult, rng)
```

5. IP probe: `if (rng() < probeBase * probeTexture * probeMult) {`

6. OOP stab: `if (hasNothing && rng() < probeRate * probeMult) {`

7. River bluff-raise:
```ts
  const bluffRaiseMult = ctx.street === 'river' ? riverBluffMult : 1.0
  if (rng() < profile.bluffFreq * (isInPosition ? 0.25 : 0.12) * profile.aggression * bluffRaiseMult && chips > currentBet * 2) {
```
(`riverBluffMult` is defined in `decidePostflopAction`; the bluff-raise line is in the same function's facing-a-bet section — if it is in a helper, pass `riverBluffMult` through as a parameter defaulting to 1.0.)

- [ ] **Step 4: Run the tests**

Run: `yarn vitest run tests/table-reads-effects.test.ts tests/bot-decision-seeded.test.ts tests/information-hygiene.test.ts tests/exploit-probe.test.ts`
Expected: all pass. Then `yarn probe all 10000 20260712` and `yarn probe all 10000 20260712 25`: every cell unchanged from the README table (no consumer passes `tableReads` yet).

- [ ] **Step 5: Commit**

```bash
git add app/utils/botDecision.ts tests/table-reads-effects.test.ts
git commit -m "Table reads: bounded thin-value / river-bluff / probe multipliers in the bot brain"
```

---

### Task 3: Live engine + pages

**Files:**
- Modify: `app/composables/useGameEngine.ts` — `GameEngineOptions.makeBotDecision` streetContext type; state next to `recentWinnerIds`; `applyAction` (after the `streetKey` bookkeeping); replace the three `onEndHand()` call sites with `endHand()`; `cleanup()` and the new-hand reset (`playerStreetActions.clear()` site) leave the window alone — reset only in `resetTableReads()`, exposed and called from `handleStart`/rebuy in `index.vue`.
- Modify: `app/pages/index.vue` (`tableReads: streetContext?.tableReads,` next to `tableDynamics: streetContext?.tableDynamics,`; call `engine.resetTableReads()` inside `handleStart` right after `engine.cleanup()`), `app/pages/replay.vue` (same context line).
- Test: `tests/table-reads-wiring.test.ts` (source contract, since the engine has no unit harness)

**Interfaces:**
- Consumes: `createTableReadState`, `noteTableAction`, `finishTableHand`, `readTable` (Task 1); `DecisionContext.tableReads` (Task 2).
- Produces: `engine.resetTableReads()`; streetContext gains `tableReads?: TableReads`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/table-reads-wiring.test.ts
/**
 * The live engine and both pages must feed and forward the table-read
 * tracker. There is no unit harness for the keep-alive engine, so this pins
 * the wiring at source level (the probe gate pins the behavior).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const src = (p: string) => readFileSync(p, 'utf-8')

describe('table reads are wired into the live game', () => {
  it('the engine counts actions, closes hands, and forwards the reads', () => {
    const engine = src('app/composables/useGameEngine.ts')
    expect(engine).toMatch(/noteTableAction\(/)
    expect(engine).toMatch(/finishTableHand\(/)
    expect(engine).toMatch(/tableReads: readTable\(/)
    expect(engine).toMatch(/resetTableReads/)
  })
  it('both table pages pass the reads to the bot brain', () => {
    expect(src('app/pages/index.vue')).toMatch(/tableReads: streetContext\?\.tableReads/)
    expect(src('app/pages/replay.vue')).toMatch(/tableReads: streetContext\?\.tableReads/)
  })
  it('a new game resets the window', () => {
    expect(src('app/pages/index.vue')).toMatch(/engine\.resetTableReads\(\)/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn vitest run tests/table-reads-wiring.test.ts` — Expected: 3 failed.

- [ ] **Step 3: Wire the engine**

In `app/composables/useGameEngine.ts`:

```ts
import { createTableReadState, noteTableAction, finishTableHand, readTable } from '~/utils/tableReads'
import type { TableReads } from '~/utils/tableReads'
```
Street context type — add after `tableDynamics?: {...}`:
```ts
    tableReads?: TableReads
```
State — after `const recentWinnerIds: number[] = []`:
```ts
  // Table reads — public table-wide signals over a rolling window (utils/tableReads.ts)
  let tableReadState = createTableReadState()
  function resetTableReads() { tableReadState = createTableReadState() }
```
`applyAction` — after the `playerStreetActions.set(p.id, existing)` block (still inside the function):
```ts
    // Table reads: bets/raises and checks are public table-wide signals
    if (result.type === 'raise') noteTableAction(tableReadState, 'bet')
    else if (result.type === 'check') noteTableAction(tableReadState, 'check')
```
Hand end — add one function and use it at all three `onEndHand()` sites (`scheduleTimeout(() => onEndHand(), delay)` ×2 and the bare `onEndHand()` in the river case):
```ts
  /** Close the table-read sample for this hand, then hand off to the page. */
  function endHand() {
    finishTableHand(tableReadState, {
      sawFlop: gs.street.value !== 'preflop',
      showdown: gs.activePlayers.value.length > 1,
    }, config.strategy.tableReads.windowHands)
    onEndHand()
  }
```
(`scheduleTimeout(() => endHand(), delay)` / `endHand()`.)
Bot context — in the `makeBotDecision(p, currentRaiseLevel, { ... })` call, after `tableDynamics: getTableDynamics(p.id),`:
```ts
        tableReads: readTable(tableReadState, config.strategy.tableReads),
```
Return `resetTableReads` from the composable's returned object.

- [ ] **Step 4: Wire the pages**

`app/pages/index.vue` — in the `decideBotAction` context after `tableDynamics: streetContext?.tableDynamics,`:
```ts
        tableReads: streetContext?.tableReads,
```
and in `handleStart`, right after `engine.cleanup()`:
```ts
  engine.resetTableReads() // a new table is a new read
```
`app/pages/replay.vue` — same context line after its `tableDynamics: streetContext?.tableDynamics,`.

- [ ] **Step 5: Verify**

Run: `yarn vitest run tests/table-reads-wiring.test.ts` — Expected: 3 passed. Then `yarn typecheck` — Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useGameEngine.ts app/pages/index.vue app/pages/replay.vue tests/table-reads-wiring.test.ts
git commit -m "Table reads: live engine tracks the table and forwards reads to the bots"
```

---

### Task 4: Simulators, probe, `fit-or-fold`, calibration

**Files:**
- Modify: `app/utils/simulateBrowser.ts`, `scripts/simulate.ts` (tracker + context field)
- Modify: `scripts/exploit-probe.ts` (tracker, `fit-or-fold`, `tableReadWindows` in the result, header comment)
- Modify: `tests/exploit-probe.test.ts` (expect `fit-or-fold`; calibration test)

**Interfaces:**
- Consumes: Task 1 functions; `DecisionContext.tableReads`.
- Produces: `runStrategy(...)` result gains `tableReadWindows: { total: number; passive: number; showdownHeavy: number; showdownLight: number }`; `STRATEGIES['fit-or-fold']`.

- [ ] **Step 1: Write the failing tests** — edit `tests/exploit-probe.test.ts`:

Change the coverage test to:
```ts
describe('the probe covers the strategies closest to break-even and the table reads', () => {
  it('includes steal-and-fold, small donk bets, and fit-or-fold', () => {
    expect(Object.keys(STRATEGIES)).toEqual(expect.arrayContaining(['steal-fold', 'donk-33', 'fit-or-fold']))
  })
})
```
Add after the determinism block:
```ts
describe('table reads are calibrated to the normal table', () => {
  it('a fold-everything hero at the pro table produces a read in under 5% of windows', () => {
    const r = runStrategy('fold-all', c => (c.toCall === 0 ? { type: 'check' } : { type: 'fold' }), 3000, SEED)
    const w = r.tableReadWindows
    expect(w.total).toBeGreaterThan(2000)
    expect((w.passive + w.showdownHeavy + w.showdownLight) / w.total).toBeLessThan(0.05)
  }, 60_000)

  it('a calling station makes the bots read a station table', () => {
    const r = runStrategy('station', STRATEGIES['station']!, 3000, SEED)
    expect(r.tableReadWindows.passive / r.tableReadWindows.total).toBeGreaterThan(0.5)
    expect(r.tableReadWindows.showdownHeavy / r.tableReadWindows.total).toBeGreaterThan(0.5)
  }, 60_000)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn vitest run tests/exploit-probe.test.ts` — Expected: coverage test fails (no `fit-or-fold`); calibration tests fail (`tableReadWindows` undefined).

- [ ] **Step 3: Probe harness**

In `scripts/exploit-probe.ts`:
```ts
import { createTableReadState, noteTableAction, finishTableHand, readTable } from '../app/utils/tableReads'
```
Header comment — add after the `donk-33` line:
```
 *   fit-or-fold   — call any open, then continue only with a pair or better (weak-tight table read)
```
Strategy — after `'donk-33'`:
```ts
  'fit-or-fold': (c) => {
    if (c.street === 'preflop') return c.raiseLevel <= 1 ? checkOrCall(c) : checkOrFold(c)
    const r = c.community.length >= 3 ? (bestHand(c.holeCards, c.community)?.rank ?? 0) : 0
    const paired = r >= 1 || c.holeCards[0].rank === c.holeCards[1].rank
    if (!paired) return checkOrFold(c)
    if (c.toCall === 0) return betPot(c, 0.5)
    return c.toCall <= c.pot ? { type: 'call' } : { type: 'fold' }
  },
```
(add `import { bestHand } from '../app/utils/handAnalysis'` next to the other imports.)

Inside `runStrategy`, after `let probeSteals = 0`:
```ts
  const tableReadState = createTableReadState()
  const TR = config.strategy.tableReads
  const tableReadWindows = { total: 0, passive: 0, showdownHeavy: 0, showdownLight: 0 }
```
In the `onApplied` callback (the `(ep, _action, result) => {` block), first lines:
```ts
        if (result.type === 'raise') noteTableAction(tableReadState, 'bet')
        else if (result.type === 'check') noteTableAction(tableReadState, 'check')
```
In the bot's `decideBotAction` context, after `streetHistory: streetActions.get(p.id) as any,`:
```ts
          tableReads: readTable(tableReadState, TR),
```
At hand end, right after `const remaining = active()` in the `// Award pot` section:
```ts
    finishTableHand(tableReadState, { sawFlop: street !== 'preflop', showdown: remaining.length > 1 }, TR.windowHands)
    const reads = readTable(tableReadState, TR)
    if (reads) {
      tableReadWindows.total++
      if (reads.passive) tableReadWindows.passive++
      if (reads.showdownHeavy) tableReadWindows.showdownHeavy++
      if (reads.showdownLight) tableReadWindows.showdownLight++
    }
```
Return: `return { name, handsPlayed, probeNet, bb100, probeSteals, probeShowdownWins, depthBB, tableReadWindows }`.

- [ ] **Step 4: Simulators** — identical three touches in `app/utils/simulateBrowser.ts` and `scripts/simulate.ts`:
  - import (`~/utils/tableReads` in the browser sim; `../app/utils/tableReads` in the CLI sim),
  - a `const tableReadState = createTableReadState()` next to the other per-run state (browser sim: inside `runSimulation` before the hand loop; CLI sim: module-level next to `playerStreetActions`),
  - in the `onApplied` callback: `if (result.type === 'raise') noteTableAction(tableReadState, 'bet'); else if (result.type === 'check') noteTableAction(tableReadState, 'check')`,
  - in the bot context after `tableDynamics: getTableDynamics(p.id),`: `tableReads: readTable(tableReadState, config.strategy.tableReads),`,
  - at showdown resolution (browser sim: right after `const isShowdown = remaining.length > 1`; CLI sim: right after `const remaining = activePlayers()`): `finishTableHand(tableReadState, { sawFlop: <street reached flop>, showdown: remaining.length > 1 }, config.strategy.tableReads.windowHands)` — in the browser sim `sawFlop` is `flopsSeenThisHand`-style local (`street` was advanced past preflop; use the existing per-hand flag that increments `flopsSeen`, or `community.length >= 3 && <hand reached flop>` — read the loop and pick the variable that already drives the `Flops seen` metric).

- [ ] **Step 5: Verify**

Run: `yarn vitest run tests/exploit-probe.test.ts` — Expected: 21 gate cells + coverage + determinism + purity + 2 calibration, all pass. Then `yarn typecheck`. Then record the new battery:
`yarn probe all 10000 20260712` and `yarn probe all 10000 20260712 25` — expected: `station` loses at least as much as before (−1,080 / −552), `fit-or-fold` negative at both depths, other cells within noise of the README table.

- [ ] **Step 6: Commit**

```bash
git add scripts/exploit-probe.ts app/utils/simulateBrowser.ts scripts/simulate.ts tests/exploit-probe.test.ts
git commit -m "Table reads: simulators and probe feed the tracker; fit-or-fold strategy; calibration test"
```

---

### Task 5: Modal line, docs, final verification

**Files:**
- Modify: `app/components/BotProfileModal.vue` (one static line after the `botConfig.leak` paragraph)
- Modify: `README.md` — "How Bot Behavior Works" gets a `### Table Reads` subsection after `### Table Flow`; the probe table gets the `fit-or-fold` row and refreshed numbers; Round 7 row 7 status appends "Replaced by real table reads (see Table Reads)"; the Future Enhancements "Table reads" bullet is removed; test counts refreshed.
- Modify: `CHANGELOG.md` — `### Added` entry.
- Memory: update `round7-audit-findings.md` (table reads shipped).

- [ ] **Step 1: Modal line** — in `BotProfileModal.vue`, after the `<p v-if="botConfig.leak" ...>` line:
```html
          <p class="text-[0.65rem] text-gray-600 mt-1">Reads the table: value-bets thinner into calling stations, probes weak-tight tables.</p>
```

- [ ] **Step 2: README subsection** (after `### Table Flow`'s paragraph, before `### Hero Adaptation`):
```markdown
### Table Reads

Bots read the *table*, not you — that is Nemesis's job. A rolling 30-hand window counts public signals only: bets and raises, checks, flops seen, showdowns reached. Two reads come out of it, each with thresholds set outside a normal pro table's range (passivity 0.41–0.56 and showdown-per-flop 0.42–0.71 over 30-hand windows; a calling station drives 0.64+ and 1.00):

| Table | Read | What the bots do |
|---|---|---|
| Calling stations (check-heavy, everything goes to showdown) | `passive && showdownHeavy` | River thin value ×1.4, river bluff-raises ×0.3 |
| Weak-tight (check-heavy, folds before showdown) | `passive && showdownLight` | Probe and stab bets ×1.25 |

Every number lives in `config.strategy.tableReads`. With no read the multipliers are 1.0 and decisions are byte-identical. The exploit probe feeds the same tracker, so `station` and the new `fit-or-fold` strategy gate the feature in CI; a fold-everything hero at the pro table produces a read in under 5% of windows.
```

- [ ] **Step 3: Probe table row + numbers, Round 7 row 7, Future Enhancements, CHANGELOG** — from the Task 4 battery. CHANGELOG under `### Added`:
```markdown
- **Table reads** — bots notice a calling-station table (check-heavy, everything reaches showdown) and value-bet thinner / bluff the river less, or a weak-tight table (check-heavy, folds before showdown) and probe more. Public signals only, over a rolling 30-hand window (`app/utils/tableReads.ts`), thresholds calibrated outside a normal pro table's range, three bounded multipliers in `config.strategy.tableReads`. The live engine, both simulators and the exploit probe feed the same tracker; the gate gains `fit-or-fold` and a calibration test. Replaces the dead "opponent reads" plumbing removed earlier in Round 7.
```

- [ ] **Step 4: Full verification**

Run: `yarn typecheck && yarn test` — Expected: clean; all files green. Refresh the README test counts from the run.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "Table reads: profile line, README/CHANGELOG, refreshed probe table"
git push
```
