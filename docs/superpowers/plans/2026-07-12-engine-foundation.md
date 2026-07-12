# Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One betting-rules engine shared by the live game, both simulators, and the exploit probe; a seedable RNG threaded through dealing and bot decisions; strategy constants lifted into typed config; Monte Carlo hot loops sped up; two small correctness bugs fixed.

**Architecture:** Extract the live engine's betting rules (the only correct copy) into a framework-free `app/utils/bettingEngine.ts` step-reducer consumed by all four callers. Randomness is injected as `type Rng = () => number` parameters defaulting to `Math.random`, with `mulberry32` for seeded runs. Config gains a typed `strategy` block and a `Persona` interface.

**Tech Stack:** Nuxt 4 / Vue 3, TypeScript, Vitest 4, vite-node scripts. Yarn 1 (`yarn test`, `yarn probe`).

**Spec:** `docs/superpowers/specs/2026-07-12-engine-foundation-design.md`

## Global Constraints

- Branch: `engine-foundation`. Commit after every task. **Never add an AI co-author trailer to commits** (user rule).
- Run `yarn test` (full suite, ~2 min) before each commit that touches engine/bot code; targeted `npx vitest run tests/<file>` for the tight TDD loop.
- The exploit probe is a balance knife-edge: nit-value vs 3bet-jam are opposing constraints. Any behavior-affecting change to bot decisions requires `yarn probe` (Task 14 owns the full recalibration).
- Amounts are dollars (floats at Micro/Low/High stakes). Do not introduce rounding changes in this plan.
- UI-only randomness (commentary phrasing, bot thinking delays in `useGameEngine.ts`/`useCommentary.ts`) intentionally stays `Math.random` — determinism targets dealing, decisions, and sims.
- `paths` note: vitest resolves `~` to repo root and `@config` to `holdem.config.ts` (see `vitest.config.ts`). Scripts import via relative paths.

---

### Task 1: Odd-chip goes to first seat left of the button

**Files:**
- Modify: `app/utils/sidePots.ts:68-114` (awardPots)
- Modify callers: `app/pages/index.vue:420`, `app/pages/replay.vue:252`, `app/utils/simulateBrowser.ts:245`, `scripts/simulate.ts:416`, `scripts/exploit-probe.ts:290`
- Test: `tests/split-pots.test.ts`

**Interfaces:**
- Produces: `awardPots(pots, players, community, buttonSeat?: number)` — 4th optional param; when provided, split-pot remainders go to the first tied player clockwise from the button. Omitted → existing behavior (ascending id), so old call sites/tests still compile and pass.

- [ ] **Step 1: Write the failing test** — append to `tests/split-pots.test.ts` (match its existing card-building helpers; it already imports `calculateSidePots`/`awardPots`):

```ts
describe('odd chip award order', () => {
  // Board plays for everyone: A-K-Q-J-T rainbow → three-way chopped pot.
  const community: Card[] = [
    { rank: 14, suit: 'spades' }, { rank: 13, suit: 'hearts' },
    { rank: 12, suit: 'diamonds' }, { rank: 11, suit: 'clubs' }, { rank: 10, suit: 'spades' },
  ]
  const players = [
    { id: 0, holeCards: [{ rank: 2, suit: 'hearts' }, { rank: 3, suit: 'hearts' }] as [Card, Card] },
    { id: 1, holeCards: [{ rank: 2, suit: 'clubs' }, { rank: 3, suit: 'clubs' }] as [Card, Card] },
    { id: 2, holeCards: [{ rank: 2, suit: 'diamonds' }, { rank: 4, suit: 'diamonds' }] as [Card, Card] },
  ]
  const pots = [{ amount: 100, eligible: [0, 1, 2] }] // 100 / 3 = 33 rem 1

  it('remainder goes to first seat left of the button', () => {
    // Button on seat 1 → first seat clockwise is seat 2
    const { awards } = awardPots(pots, players, community, 1)
    expect(awards.get(2)).toBe(34)
    expect(awards.get(0)).toBe(33)
    expect(awards.get(1)).toBe(33)
  })

  it('button on last seat wraps to seat 0', () => {
    const { awards } = awardPots(pots, players, community, 2)
    expect(awards.get(0)).toBe(34)
  })

  it('without buttonSeat, keeps legacy ascending-id order', () => {
    const { awards } = awardPots(pots, players, community)
    expect(awards.get(0)).toBe(34)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/split-pots.test.ts` — expect the two new button cases to FAIL (seat 0 currently always gets the remainder).

- [ ] **Step 3: Implement** — in `awardPots`, add the param and order tied ids before splitting:

```ts
export function awardPots(
  pots: SidePot[],
  players: { id: number; holeCards: [Card, Card] | null }[],
  community: Card[],
  buttonSeat?: number,
): { awards: Map<number, number>; potWinners: { potAmount: number; winnerId: number; winnerName?: string }[] } {
```

and inside the tie branch, replace the award loop with:

```ts
    if (tiedIds.length > 1) {
      // Odd chip goes to the first tied player clockwise from the button
      // (standard flop-game rule). Without a button, keep ascending-id order.
      const n = players.length
      const orderedIds = buttonSeat === undefined
        ? tiedIds
        : [...tiedIds].sort((a, b) =>
            ((a - buttonSeat - 1 + 2 * n) % n) - ((b - buttonSeat - 1 + 2 * n) % n))
      const share = Math.floor(pot.amount / orderedIds.length)
      const remainder = pot.amount - share * orderedIds.length
      for (let i = 0; i < orderedIds.length; i++) {
        const award = share + (i === 0 ? remainder : 0)
        awards.set(orderedIds[i], (awards.get(orderedIds[i]) || 0) + award)
      }
      potWinners.push({ potAmount: pot.amount, winnerId: orderedIds[0] })
    } else if (bestId >= 0) {
```

- [ ] **Step 4: Update the five production callers** to pass the dealer seat. Each already has it in scope:
  - `app/pages/index.vue:420` and `app/pages/replay.vue:252`: add 4th arg `gs.dealerSeat.value`
  - `app/utils/simulateBrowser.ts:245`, `scripts/simulate.ts:416`, `scripts/exploit-probe.ts:290`: add 4th arg `dealerSeat`

- [ ] **Step 5: Run** `npx vitest run tests/split-pots.test.ts` (PASS), then `yarn test` (all green — split behavior for non-tied pots unchanged).

- [ ] **Step 6: Commit** — `git commit -m "Fix odd-chip award: first seat left of the button, not lowest id"`

---

### Task 2: PokerStars export handles fractional amounts

**Files:**
- Modify: `app/utils/pokerStarsExport.ts:131-138`
- Test: Create `tests/pokerstars-export.test.ts`

**Interfaces:**
- Produces: internal `fmtAmt(n: number): string` — whole → `"12"`, fractional → `"12.50"`. Export formats unchanged otherwise.

- [ ] **Step 1: Write the failing test** — `tests/pokerstars-export.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toPokerStarsFormat } from '~/app/utils/pokerStarsExport'

const microHand = {
  handNumber: 42,
  potSize: 3.75,
  board: 'A♠ K♥ Q♦',
  result: 'won',
  players: [
    { name: 'Hero', seatIndex: 0, position: 'BTN', chips: 50, isHero: true, folded: false, holeCards: 'A♥ A♦' },
    { name: 'Villain', seatIndex: 1, position: 'SB', chips: 50, isHero: false, folded: false, holeCards: 'K♠ K♦' },
  ],
  actions: [
    'Villain calls $0.25',
    'Hero raises to $1.5',
    'Villain goes ALL-IN $12.75',
    '--- FLOP: A♠ K♥ Q♦ ---',
  ],
}

describe('PokerStars export with fractional stakes', () => {
  const out = toPokerStarsFormat(microHand, { sb: 0.25, bb: 0.5 })

  it('keeps fractional calls', () => {
    expect(out).toContain('Villain: calls $0.25')
  })
  it('keeps fractional raises, formatted to two decimals', () => {
    expect(out).toContain('Hero: raises to $1.50')
  })
  it('keeps fractional all-ins', () => {
    expect(out).toContain('Villain: bets $12.75 and is all-in')
  })
  it('formats whole amounts bare', () => {
    const whole = toPokerStarsFormat(
      { ...microHand, actions: ['Hero raises to $12'] }, { sb: 1, bb: 2 })
    expect(whole).toContain('Hero: raises to $12')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/pokerstars-export.test.ts` — expect FAIL: the three fractional actions are silently dropped (integer-only regexes).

- [ ] **Step 3: Implement** — in `pokerStarsExport.ts` add near `toPS`:

```ts
// PokerStars amount style: whole dollars bare ($12), cents two-decimal ($12.50)
function fmtAmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
```

and replace the three matchers:

```ts
    const callMatch = action.match(/^(.+?) calls \$([0-9.]+)$/)
    if (callMatch) { lines.push(`${callMatch[1]}: calls $${fmtAmt(parseFloat(callMatch[2]))}`); continue }

    const raiseMatch = action.match(/^(.+?) raises to \$([0-9.]+)$/)
    if (raiseMatch) { lines.push(`${raiseMatch[1]}: raises to $${fmtAmt(parseFloat(raiseMatch[2]))}`); continue }

    const allInMatch = action.match(/^(.+?) goes ALL-IN \$([0-9.]+)$/)
    if (allInMatch) { lines.push(`${allInMatch[1]}: bets $${fmtAmt(parseFloat(allInMatch[2]))} and is all-in`); continue }
```

- [ ] **Step 4: Run** `npx vitest run tests/pokerstars-export.test.ts` — PASS. Then `yarn test`.

- [ ] **Step 5: Commit** — `git commit -m "PokerStars export: accept fractional amounts (Micro/Low/High stakes)"`

---

### Task 3: Seedable RNG module

**Files:**
- Create: `app/utils/rng.ts`
- Test: Create `tests/rng.test.ts`

**Interfaces:**
- Produces: `export type Rng = () => number`; `export function mulberry32(seed: number): Rng`. Every later task imports `Rng` from `~/utils/rng` (scripts: `../app/utils/rng`).

- [ ] **Step 1: Write the failing test** — `tests/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mulberry32 } from '~/app/utils/rng'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).toEqual(seqB)
  })
  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
  it('stays in [0, 1)', () => {
    const r = mulberry32(999)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/rng.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** — `app/utils/rng.ts`:

```ts
/**
 * Injectable random source. Everything that deals cards or makes bot
 * decisions accepts an Rng (defaulting to Math.random) so simulations,
 * the exploit probe, and tests can run deterministically from a seed.
 */
export type Rng = () => number

/** Mulberry32 — tiny, fast, statistically solid seeded PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- [ ] **Step 4: Run** `npx vitest run tests/rng.test.ts` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add seedable RNG (mulberry32) module"`

---

### Task 4: shuffle() accepts an Rng

**Files:**
- Modify: `app/utils/shuffle.ts`
- Modify: `app/utils/gameSimulation.ts` (`simShuffleDeck`)
- Test: Create `tests/shuffle-seeded.test.ts`

**Interfaces:**
- Produces: `shuffle<T>(arr, rng: Rng = Math.random): T[]`; `simShuffleDeck(rng?: Rng): Card[]`.

- [ ] **Step 1: Failing test** — `tests/shuffle-seeded.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shuffle } from '~/app/utils/shuffle'
import { mulberry32 } from '~/app/utils/rng'

describe('seeded shuffle', () => {
  const input = Array.from({ length: 52 }, (_, i) => i)
  it('same seed → same order', () => {
    expect(shuffle(input, mulberry32(7))).toEqual(shuffle(input, mulberry32(7)))
  })
  it('different seeds → different order', () => {
    expect(shuffle(input, mulberry32(7))).not.toEqual(shuffle(input, mulberry32(8)))
  })
  it('does not mutate input and keeps all elements', () => {
    const out = shuffle(input, mulberry32(7))
    expect(input[0]).toBe(0)
    expect([...out].sort((a, b) => a - b)).toEqual(input)
  })
})
```

- [ ] **Step 2: Run it** — FAIL (shuffle takes one arg).
- [ ] **Step 3: Implement** — `shuffle.ts` signature becomes:

```ts
import type { Rng } from './rng'

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
```

In `gameSimulation.ts`, `simShuffleDeck` gains `rng?: Rng` and passes it to its Fisher-Yates (or delegates to `shuffle`). Keep the doc comment's "NOT cryptographically secure" note, updated to mention injectability.

- [ ] **Step 4: Run** `npx vitest run tests/shuffle-seeded.test.ts` then `yarn test` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "shuffle/simShuffleDeck accept an injectable Rng"`

---

### Task 5: Bot decisions read ctx.rng

**Files:**
- Modify: `app/utils/botDecision.ts` (63 `Math.random()` sites)
- Test: Create `tests/bot-decision-seeded.test.ts`

**Interfaces:**
- Consumes: `Rng` from Task 3.
- Produces: `DecisionContext` gains `rng?: Rng`; `applyTilt(profile, tilt, cfg, mult, rng: Rng = Math.random)` and `updateTilt(tilt, won, lostBigPot, cfg, mult, participated, rng: Rng = Math.random)` gain trailing optional rng params (only if their bodies use randomness — check each; `decayTilt` is expected to be deterministic).

- [ ] **Step 1: Failing test** — `tests/bot-decision-seeded.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decideBotAction } from '~/app/utils/botDecision'
import type { DecisionContext, BotProfile } from '~/app/utils/botDecision'
import { mulberry32 } from '~/app/utils/rng'

const profile: BotProfile = { vpip: 0.25, pfr: 0.2, aggression: 1.2, bluffFreq: 0.15, creativeFreq: 0.08 }
const ctx = (rng: () => number): DecisionContext => ({
  street: 'preflop', toCall: 2, pot: 3, currentBet: 2, playerBet: 0,
  chips: 200, bb: 2, numActivePlayers: 6, raiseLevel: 0, position: 'BTN',
  holeCards: [{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }],
  community: [], rng,
})

describe('seeded bot decisions', () => {
  it('same seed → identical action across 50 decisions', () => {
    for (let i = 0; i < 50; i++) {
      const a = decideBotAction(profile, ctx(mulberry32(1000 + i)), 1)
      const b = decideBotAction(profile, ctx(mulberry32(1000 + i)), 1)
      expect(a).toEqual(b)
    }
  })
})
```

- [ ] **Step 2: Run it** — FAIL (decisions differ on some seeds because `Math.random` is still used internally; if it passes by luck, `grep -c "Math.random" app/utils/botDecision.ts` proves the work is undone — treat that as the failure signal).

- [ ] **Step 3: Implement** — mechanical threading through `botDecision.ts`:
  1. `import type { Rng } from './rng'`; add `rng?: Rng` to `DecisionContext` (after `community`).
  2. In `decideBotAction`, first line: `const rng = ctx.rng ?? Math.random`. Replace every `Math.random()` in its body with `rng()`.
  3. `decidePreflopAction(profile, ctx, rand)` and `decidePostflopAction(...)` and `generateRandomAction(ctx, strongMade)` all receive `ctx` — same pattern: `const rng = ctx.rng ?? Math.random` at top, `Math.random()` → `rng()` throughout.
  4. Tilt functions: for each of `applyTilt`/`updateTilt` that contains `Math.random()`, append trailing param `rng: Rng = Math.random` and substitute. Do NOT change `decayTilt` unless it uses randomness.
  5. The two Monte Carlo stat simulators at the bottom of the file (`simulateEscalationStats` area, lines ~1389-1561): give each a trailing `rng: Rng = Math.random` and substitute.

- [ ] **Step 4: Verify completeness**:

```bash
grep -n "Math.random" app/utils/botDecision.ts
```

Expected: ONLY default-parameter/default-fallback sites (`?? Math.random` / `= Math.random`) remain — zero bare `Math.random()` calls.

- [ ] **Step 5: Run** `npx vitest run tests/bot-decision-seeded.test.ts`, then `yarn test` (statistical suites still pass — unseeded callers behave identically via the default). 
- [ ] **Step 6: Commit** — `git commit -m "Thread injectable Rng through bot decisions and tilt"`

---

### Task 6: handAnalysis Monte Carlo accepts an Rng

**Files:**
- Modify: `app/utils/handAnalysis.ts` (`estimateEquity` ~line 620, `simulateHandProbabilities` ~line 880, `analyzeHand` ~line 976-981; any other `Math.random()` in the file)
- Test: extend `tests/bot-decision-seeded.test.ts`

**Interfaces:**
- Produces: `estimateEquity(holeCards, community, numOpponents, iterations, rng: Rng = Math.random)`; `simulateHandProbabilities(holeCards, community, iterations, rng: Rng = Math.random)`; `analyzeHand(..., rng?: Rng)` passing it down.

- [ ] **Step 1: Failing test** — append:

```ts
import { estimateEquity } from '~/app/utils/handAnalysis'

describe('seeded equity', () => {
  it('same seed → identical equity', () => {
    const hole: [Card, Card] = [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }]
    const board: Card[] = [{ rank: 2, suit: 'clubs' }, { rank: 7, suit: 'diamonds' }, { rank: 12, suit: 'spades' }]
    const a = estimateEquity(hole, board, 2, 500, mulberry32(42))
    const b = estimateEquity(hole, board, 2, 500, mulberry32(42))
    expect(a).toBe(b)
  })
})
```

(Import `Card` type at top: `import type { Card } from '~/app/utils/cards'`.)

- [ ] **Step 2: Run** — FAIL. **Step 3:** add the trailing `rng` params, substitute `Math.random()` → `rng()` inside both loops and any other sites in the file; `analyzeHand` gains optional `rng` and forwards it to both calls. **Step 4:** targeted test + `yarn test` PASS. 
- [ ] **Step 5: Commit** — `git commit -m "handAnalysis Monte Carlo loops accept an injectable Rng"`

---

### Task 7: Seeded sims and a deterministic probe gate

**Files:**
- Modify: `scripts/exploit-probe.ts` (shuffleDeck :97-106, runStrategy :132, decide ctx :224, tilt calls :223/:304, CLI arg parsing at bottom)
- Modify: `app/utils/simulateBrowser.ts` (runSimulation signature :62, shuffleDeck use :120, decide ctx :167, tilt calls :125/:166 and hand-end tilt update)
- Modify: `scripts/simulate.ts` (same pattern; CLI `--seed` arg)
- Modify: `tests/exploit-probe.test.ts`
- Test: extend `tests/exploit-probe.test.ts`

**Interfaces:**
- Produces: `runStrategy(name, fn, numHands, seed?: number)` — seed defined → `const rng = mulberry32(seed)` used for dealing, all bot decisions (`rng` in ctx), and tilt; `runSimulation(numHands, numPlayers, onProgress, stakeLevel?, abortSignal?, seed?)`.

- [ ] **Step 1: Failing test** — in `tests/exploit-probe.test.ts` add determinism + seed the gate:

```ts
const SEED = 20260712

it('runStrategy is deterministic for a fixed seed', () => {
  const a = runStrategy('station', STRATEGIES['station']!, 300, SEED)
  const b = runStrategy('station', STRATEGIES['station']!, 300, SEED)
  expect(a).toEqual(b)
}, 60_000)
```

and change the gate loop to pass a per-strategy seed:

```ts
      const r = runStrategy(name, STRATEGIES[name]!, HANDS, SEED + i)
```

(`for (const [i, name] of Object.keys(STRATEGIES).entries())`.)

- [ ] **Step 2: Run** `npx vitest run tests/exploit-probe.test.ts` — FAIL (no 4th param).
- [ ] **Step 3: Implement** in `exploit-probe.ts`:

```ts
import { mulberry32 } from '../app/utils/rng'
import type { Rng } from '../app/utils/rng'

function shuffleDeck(rng: Rng): Card[] { /* same body, Math.random() → rng() */ }

export function runStrategy(name: string, fn: ProbeFn, numHands: number, seed?: number) {
  const rng: Rng = seed !== undefined ? mulberry32(seed) : Math.random
  ...
  const deck = shuffleDeck(rng)
  ...
  const tilted = applyTilt(p.profile, p.tilt, config.tilt, p.tiltMultiplier, rng)
  action = decideBotAction(tilted, { ...existing ctx..., rng }, p.consistency)
  ...
  updateTilt(p.tilt, won, lostBigPot, config.tilt, p.tiltMultiplier, participated, rng)
```

CLI: third positional arg `seed` (`const seed = argv[4] ? Number(argv[4]) : undefined`, matching existing arg style at the file bottom). Same pattern in `simulateBrowser.ts` (trailing `seed?: number` param; one `mulberry32` per run) and `scripts/simulate.ts` (`--seed N` or positional, matching its existing arg parsing).

- [ ] **Step 4: Run** `npx vitest run tests/exploit-probe.test.ts` — PASS (note runtime; seeded 5000-hand runs should match current duration). Then `yarn test`.
- [ ] **Step 5: Commit** — `git commit -m "Seedable sims: deterministic exploit-probe gate, seeded runSimulation/simulate"`

---

### Task 8: bettingEngine.ts — one rules module

**Files:**
- Create: `app/utils/bettingEngine.ts`
- Test: Create `tests/betting-engine.test.ts`

**Interfaces:**
- Produces (exact — later tasks depend on these):

```ts
export interface EnginePlayer {
  id: number
  chips: number
  betThisRound: number
  totalInvested: number
  folded: boolean
  eliminated?: boolean
}

export interface BettingRound {
  players: EnginePlayer[]
  currentBet: number
  lastRaiseIncrement: number   // last full raise size; min-raise = currentBet + max(this, bb)
  pot: number
  bb: number
  needsToAct: Set<number>
}

export type EngineAction =
  | { type: 'fold' } | { type: 'check' } | { type: 'call' }
  | { type: 'raise'; amount: number }   // amount = raise-to total

export interface AppliedAction {
  type: 'fold' | 'check' | 'call' | 'raise'
  amount: number       // chips moved for call; raise-to total for raise; 0 otherwise
  isAllIn: boolean
  reopened: boolean    // true only for a FULL raise (half-raise rule)
}

export function startBettingRound(round: BettingRound): void
export function applyEngineAction(round: BettingRound, seatId: number, action: EngineAction): AppliedAction
export function runBettingRound(
  round: BettingRound,
  startSeat: number,
  decide: (p: EnginePlayer, round: BettingRound) => EngineAction,
  onApplied?: (p: EnginePlayer, action: EngineAction, result: AppliedAction) => void,
): void
```

- [ ] **Step 1: Failing tests** — `tests/betting-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { startBettingRound, applyEngineAction, runBettingRound } from '~/app/utils/bettingEngine'
import type { BettingRound, EnginePlayer } from '~/app/utils/bettingEngine'

function mkRound(chips: number[], currentBet = 0, bb = 2): BettingRound {
  const players: EnginePlayer[] = chips.map((c, i) => ({
    id: i, chips: c, betThisRound: 0, totalInvested: 0, folded: false,
  }))
  return { players, currentBet, lastRaiseIncrement: bb, pot: 0, bb, needsToAct: new Set() }
}

describe('applyEngineAction rules', () => {
  it('clamps a sub-min raise up to the minimum', () => {
    const r = mkRound([200, 200], 10) // facing a bet of 10, lastRaiseIncrement=2? set explicitly:
    r.lastRaiseIncrement = 8          // prior raise was 2 → 10
    startBettingRound(r)
    const res = applyEngineAction(r, 0, { type: 'raise', amount: 12 }) // min is 10+8=18
    expect(r.players[0]!.betThisRound).toBe(18)
    expect(res.reopened).toBe(true)
    expect(r.lastRaiseIncrement).toBe(8)
  })

  it('short all-in below min-raise does NOT reopen action', () => {
    const r = mkRound([200, 14, 200], 10)
    r.lastRaiseIncrement = 8
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'call' })
    const res = applyEngineAction(r, 1, { type: 'raise', amount: 14 }) // all-in, min was 18
    expect(res.isAllIn).toBe(true)
    expect(res.reopened).toBe(false)
    expect(r.currentBet).toBe(14)
    // player 0 already acted at bet 10; incomplete raise must not re-add them
    expect(r.needsToAct.has(0)).toBe(false)
    expect(r.needsToAct.has(2)).toBe(true) // hasn't acted yet this round
  })

  it('full raise reopens everyone else with chips', () => {
    const r = mkRound([200, 200, 200], 10)
    r.lastRaiseIncrement = 8
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'call' })
    const res = applyEngineAction(r, 1, { type: 'raise', amount: 30 })
    expect(res.reopened).toBe(true)
    expect(r.needsToAct.has(0)).toBe(true)
    expect(r.lastRaiseIncrement).toBe(20)
  })

  it('call is clamped to stack (all-in call)', () => {
    const r = mkRound([5, 200], 10)
    startBettingRound(r)
    const res = applyEngineAction(r, 0, { type: 'call' })
    expect(res.amount).toBe(5)
    expect(res.isAllIn).toBe(true)
    expect(r.pot).toBe(5)
  })
})

describe('runBettingRound', () => {
  it('multi-raise war terminates only when action is closed (no lap cap)', () => {
    const r = mkRound([10000, 10000], 0)
    startBettingRound(r)
    let raises = 0
    runBettingRound(r, 0, (p, round) => {
      const toCall = round.currentBet - p.betThisRound
      if (raises < 20) { raises++; return { type: 'raise', amount: round.currentBet + Math.max(round.lastRaiseIncrement, round.bb) } }
      return toCall > 0 ? { type: 'call' } : { type: 'check' }
    })
    expect(raises).toBe(20)                 // old count*4 cap would have truncated at 8
    expect(r.needsToAct.size).toBe(0)
    const [a, b] = r.players
    expect(a!.betThisRound).toBe(b!.betThisRound)
  })

  it('skip-guard exits a stuck round (everyone all-in mid-set)', () => {
    const r = mkRound([0, 0], 0)
    r.needsToAct = new Set([0, 1]) // stale set; nobody can act
    let calls = 0
    runBettingRound(r, 0, () => { calls++; return { type: 'check' } })
    expect(calls).toBe(0)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/betting-engine.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** — `app/utils/bettingEngine.ts`. Rules transplanted verbatim from `useGameEngine.ts:141-226` (applyAction) and `:240-262` (needsToAct/skip-guard):

```ts
/**
 * Shared no-limit betting rules — THE single source of truth consumed by the
 * live game (useGameEngine), both simulators, and the exploit probe.
 *
 * Rules enforced here:
 *  - Minimum raise: currentBet + max(lastRaiseIncrement, bb); sub-min raises
 *    are clamped up (which may put the player all-in).
 *  - Half-raise rule: an all-in raise below the minimum does NOT reopen
 *    action for players who already acted at the current bet level.
 *  - Termination: needsToAct empties; a skip-guard breaks only if a full
 *    orbit passes with nobody able to act (never a lap-count cap, which
 *    can truncate legitimate multi-raise rounds).
 */

export interface EnginePlayer {
  id: number
  chips: number
  betThisRound: number
  totalInvested: number
  folded: boolean
  eliminated?: boolean
}

export interface BettingRound {
  players: EnginePlayer[]
  currentBet: number
  lastRaiseIncrement: number
  pot: number
  bb: number
  needsToAct: Set<number>
}

export type EngineAction =
  | { type: 'fold' } | { type: 'check' } | { type: 'call' }
  | { type: 'raise'; amount: number }

export interface AppliedAction {
  type: 'fold' | 'check' | 'call' | 'raise'
  amount: number
  isAllIn: boolean
  reopened: boolean
}

const canAct = (p: EnginePlayer) => !p.folded && !p.eliminated && p.chips > 0
const inHand = (p: EnginePlayer) => !p.folded && !p.eliminated

export function startBettingRound(round: BettingRound): void {
  round.needsToAct = new Set(round.players.filter(canAct).map(p => p.id))
}

export function applyEngineAction(round: BettingRound, seatId: number, action: EngineAction): AppliedAction {
  const p = round.players.find(pl => pl.id === seatId)!

  if (action.type === 'fold') {
    p.folded = true
    round.needsToAct.delete(p.id)
    return { type: 'fold', amount: 0, isAllIn: false, reopened: false }
  }

  if (action.type === 'check') {
    round.needsToAct.delete(p.id)
    return { type: 'check', amount: 0, isAllIn: false, reopened: false }
  }

  if (action.type === 'call') {
    const callAmt = Math.min(round.currentBet - p.betThisRound, p.chips)
    p.chips -= callAmt
    p.betThisRound += callAmt
    p.totalInvested += callAmt
    round.pot += callAmt
    round.needsToAct.delete(p.id)
    return { type: 'call', amount: callAmt, isAllIn: p.chips <= 0, reopened: false }
  }

  // raise
  const prevBet = round.currentBet
  const minRaiseAmt = prevBet === 0
    ? round.bb
    : prevBet + Math.max(round.lastRaiseIncrement, round.bb)

  let raiseTotal = Math.min(action.amount, p.chips + p.betThisRound)
  const isAllIn = raiseTotal >= p.chips + p.betThisRound

  // Enforce minimum raise — unless it's an all-in for less
  if (!isAllIn && raiseTotal < minRaiseAmt) {
    raiseTotal = Math.min(minRaiseAmt, p.chips + p.betThisRound)
  }

  // Half-raise rule: an incomplete raise (all-in below min) doesn't reopen action
  const isFullRaise = raiseTotal >= minRaiseAmt

  const toAdd = raiseTotal - p.betThisRound
  p.chips -= toAdd
  p.betThisRound = raiseTotal
  p.totalInvested += toAdd
  round.pot += toAdd
  if (raiseTotal > round.currentBet) round.currentBet = raiseTotal
  if (isFullRaise) round.lastRaiseIncrement = Math.max(raiseTotal - prevBet, round.bb)

  round.needsToAct.delete(p.id)
  if (isFullRaise) {
    for (const ap of round.players) {
      if (ap.id !== p.id && canAct(ap)) round.needsToAct.add(ap.id)
    }
  }

  return { type: 'raise', amount: raiseTotal, isAllIn: p.chips <= 0, reopened: isFullRaise }
}

export function runBettingRound(
  round: BettingRound,
  startSeat: number,
  decide: (p: EnginePlayer, round: BettingRound) => EngineAction,
  onApplied?: (p: EnginePlayer, action: EngineAction, result: AppliedAction) => void,
): void {
  const count = round.players.length
  let seat = startSeat
  let skips = 0

  while (round.needsToAct.size > 0) {
    const p = round.players[seat % count]!
    if (!round.needsToAct.has(p.id) || !canAct(p)) {
      if (!canAct(p)) round.needsToAct.delete(p.id) // stale all-in/folded entries drop out
      seat = (seat + 1) % count
      if (++skips > count) break
      continue
    }
    if (round.players.filter(inHand).length <= 1) break

    const action = decide(p, round)
    const result = applyEngineAction(round, p.id, action)
    onApplied?.(p, action, result)
    skips = 0

    if (round.players.filter(inHand).length <= 1) break
    seat = (seat + 1) % count
  }
}
```

The stale-entry branch matters: a player still in `needsToAct` who can no longer act (e.g. went all-in via a call clamp) must be dropped, or the skip-guard is the only thing preventing a spin. The tests are the contract — do not weaken them to make the implementation pass.

- [ ] **Step 4: Run** `npx vitest run tests/betting-engine.test.ts` — PASS. Fix until green; do not weaken the assertions.
- [ ] **Step 5: Commit** — `git commit -m "Extract shared no-limit betting rules into bettingEngine module"`

---

### Task 9: Live engine delegates to bettingEngine

**Files:**
- Modify: `app/composables/useGameEngine.ts:141-226` (applyAction), `:228-262` (runBettingRound setup)
- Test: existing `tests/phase3-betting.test.ts`, `tests/phase3-street-betting.test.ts` must stay green.

**Interfaces:**
- Consumes: Task 8's `applyEngineAction`, `startBettingRound`, `BettingRound`.

- [ ] **Step 1: Bridge object** — inside `useGameEngine`, add:

```ts
import { applyEngineAction, startBettingRound } from '~/utils/bettingEngine'
import type { BettingRound } from '~/utils/bettingEngine'

function engineRound(): BettingRound {
  return {
    players: gs.playerStates.value,       // reactive proxies mutate in place
    currentBet: gs.currentBet.value,
    lastRaiseIncrement: gs.lastRaiseIncrement.value,
    pot: gs.pot.value,
    bb: bb.value,
    needsToAct: gs.needsToAct.value,      // same Set instance — existing reactivity semantics
  }
}
function writeBack(r: BettingRound) {
  gs.currentBet.value = r.currentBet
  gs.lastRaiseIncrement.value = r.lastRaiseIncrement
  gs.pot.value = r.pot
}
```

- [ ] **Step 2: Rewrite applyAction** to delegate rules and keep only UI/log bookkeeping:

```ts
function applyAction(p: PlayerState, action: { type: string; amount?: number }): boolean {
  const betBefore = p.betThisRound  // chips moved by a raise = raise-to total minus this
  const r = engineRound()
  const result = applyEngineAction(r, p.id,
    action.type === 'raise'
      ? { type: 'raise', amount: action.amount ?? 0 }
      : { type: action.type as 'fold' | 'check' | 'call' })
  writeBack(r)

  if (result.type === 'fold') {
    p.lastAction = 'fold'; p.currentBetAmount = 0
    gs.handActionLog.value.push(`${p.name} folds`)
  } else if (result.type === 'check') {
    p.lastAction = 'check'; p.currentBetAmount = 0
    gs.handActionLog.value.push(`${p.name} checks`)
  } else if (result.type === 'call') {
    if (p.id === 0) gs.heroTotalWagered.value += result.amount
    p.lastAction = 'call'; p.currentBetAmount = result.amount
    gs.handActionLog.value.push(`${p.name} calls $${result.amount}`)
  } else {
    if (p.id === 0) gs.heroTotalWagered.value += result.amount - betBefore
    p.lastAction = result.isAllIn ? 'all-in' : 'raise'
    p.currentBetAmount = result.amount
    gs.handActionLog.value.push(result.isAllIn
      ? `${p.name} goes ALL-IN $${result.amount}`
      : `${p.name} raises to $${result.amount}`)
    if (gs.street.value === 'preflop') { preflopRaiseLevel++; preflopRaiserId = p.id }
  }
  // …keep the existing street-action / table-memory tracking block unchanged…
  return result.reopened
}
```

**Careful:** heroTotalWagered for raises must add `toAdd` (chips moved), not the raise-to total. `AppliedAction.amount` is raise-to; compute moved chips as `result.amount - betBefore` where `const betBefore = p.betThisRound` is captured BEFORE calling `applyEngineAction`. Implement it that way (capture `betBefore` at function top) — this exactness is why phase3 tests must run after.

- [ ] **Step 3: runBettingRound setup** — replace the manual `gs.needsToAct.value = new Set(...)` (lines 240-246) with:

```ts
if (!resume) {
  const r = engineRound()
  startBettingRound(r)
  gs.needsToAct.value = r.needsToAct
}
```

Keep the existing async loop (delays, hero handoff, insight) — it already deletes from `needsToAct` and calls `applyAction`, which now enforces the same rules via the shared module. Delete nothing else.

- [ ] **Step 4: Run** `yarn test` — phase3 suites and all others green. Also boot the app (`yarn dev`) and play one hand vs bots to confirm logs/chips look right.
- [ ] **Step 5: Commit** — `git commit -m "Live engine delegates betting rules to shared bettingEngine"`

---

### Task 10: simulateBrowser consumes the shared engine

**Files:**
- Modify: `app/utils/simulateBrowser.ts:158-206` (delete local runBettingRound) and its call sites `:209`, and the street loop.

**Interfaces:**
- Consumes: `startBettingRound`, `runBettingRound`, `BettingRound`, `AppliedAction` from Task 8.

- [ ] **Step 1: Replace the local function.** Build a round object from the local state, and keep all stats/log bookkeeping in the `onApplied` callback. Exact replacement for `:158-206`:

```ts
    function playBettingRound(startSeat: number) {
      const round: BettingRound = {
        players, currentBet, lastRaiseIncrement, pot, bb: BB,
        needsToAct: new Set<number>(),
      }
      startBettingRound(round)
      runBettingRound(round, startSeat, (p) => {
        const sp = p as SimPlayer
        const tiltedProfile = applyTilt(sp.profile, sp.tilt, config.tilt, sp.tiltMultiplier, rng)
        return decideBotAction(tiltedProfile, {
          street, toCall: round.currentBet - sp.betThisRound, pot: round.pot,
          currentBet: round.currentBet, playerBet: sp.betThisRound,
          chips: sp.chips, bb: BB, numActivePlayers: players.filter(x => !x.folded && !x.eliminated).length,
          raiseLevel: street === 'preflop' ? preflopRaiseLevel : 0,
          position: positions[sp.id] || '', holeCards: sp.holeCards ?? undefined, community,
          wasPreflopRaiser: sp.id === preflopRaiserId, preflopCallers: preflopCallerCount,
          checkedThisStreet: (playerStreetActions.get(sp.id) as any)?.[street] === 'check',
          streetHistory: playerStreetActions.get(sp.id) as any, tableDynamics: getTableDynamics(sp.id),
          rng,
        }, sp.consistency) as EngineAction
      }, (p, _action, result) => {
        const sp = p as SimPlayer
        if (result.type === 'fold') { sp.lastAction = 'fold'; actions.push(`${sp.name} folds`) }
        else if (result.type === 'check') { sp.lastAction = 'check'; actions.push(`${sp.name} checks`) }
        else if (result.type === 'call') {
          sp.lastAction = 'call'; actions.push(`${sp.name} calls $${result.amount}`)
          if (street === 'preflop') { botStats.get(sp.id)!.vpipHands++; preflopCallerCount++ }
          botStats.get(sp.id)!.callCount++
        } else {
          sp.lastAction = result.isAllIn ? 'all-in' : 'raise'
          if (result.isAllIn) handHadAllIn = true
          actions.push(result.isAllIn ? `${sp.name} goes ALL-IN $${result.amount}` : `${sp.name} raises to $${result.amount}`)
          if (street === 'preflop') {
            if (result.reopened) { preflopRaiseLevel++; preflopRaiserId = sp.id }
            botStats.get(sp.id)!.vpipHands++; botStats.get(sp.id)!.pfrHands++
          }
          botStats.get(sp.id)!.raiseCount++
        }
        if (street !== 'preflop') {
          const existing = playerStreetActions.get(sp.id) || {}
          const key = street as 'flop' | 'turn'
          if (key === 'flop' || key === 'turn') { existing[key] = result.type; playerStreetActions.set(sp.id, existing) }
        }
      })
      currentBet = round.currentBet
      pot = round.pot
      lastRaiseIncrement = round.lastRaiseIncrement
    }
```

Supporting changes in the same function scope: declare `let lastRaiseIncrement = BB` next to `let pot = 0, currentBet = 0` (reset to `BB` when blinds post, and to `BB` at each new street alongside `currentBet = 0` — mirroring `useGameEngine.ts:126` and `:341`); rename call sites `runBettingRound(` → `playBettingRound(`; add imports. Keep the preflop escalation semantics: note `preflopRaiseLevel` now increments only on FULL raises (`result.reopened`) — this is the rules fix, not a regression.

- [ ] **Step 2: Run** `yarn test` — `phase4-realistic-sim`, `realism-fixes`, `regression-score-field` exercise this path; investigate any band failures (expected direction: fewer illegal raise sizes, slightly different escalation counts — bands should hold; if a band fails, STOP and report, do not retune bands in this task).
- [ ] **Step 3: Commit** — `git commit -m "simulateBrowser plays by shared engine rules (min-raise, half-raise, no lap cap)"`

---

### Task 11: scripts/simulate.ts consumes the shared engine

**Files:**
- Modify: `scripts/simulate.ts:233-347` — same transformation as Task 10, with this file's local names (`activePlayers()`, `botStats` keyed by NAME (`botStats.get(p.name)`), per-opportunity escalation tracking at `:256-259`/`:288-290`).

- [ ] **Step 1:** Apply the Task 10 pattern. The escalation-opportunity tracking (`threeBetOpps`/`vs3BetOpps` before deciding, `threeBetsMade`/`vs3BetFolds` after) moves INSIDE the `decide` callback (before return) and the `onApplied` callback respectively. Declare/reset `lastRaiseIncrement` identically.
- [ ] **Step 2:** Smoke-run the CLI: `npx vite-node scripts/simulate.ts 200 6` (or its documented arg style — check the usage comment at the top of the file) — completes without error, prints stats.
- [ ] **Step 3:** `yarn test`, commit — `git commit -m "CLI simulator plays by shared engine rules"`

---

### Task 12: exploit-probe consumes the shared engine

**Files:**
- Modify: `scripts/exploit-probe.ts:197-264` (local runBettingRound) and street loop `:266-280`.

- [ ] **Step 1:** Same transformation. The probe's seat-0 branch moves into `decide`:

```ts
      runBettingRound(round, startSeat, (p) => {
        const sp = p as SimPlayer
        const toCall = round.currentBet - sp.betThisRound
        if (sp.isProbe) {
          let a = fn({
            street, toCall, pot: round.pot, currentBet: round.currentBet,
            playerBet: sp.betThisRound, chips: sp.chips,
            raiseLevel: street === 'preflop' ? preflopRaiseLevel : 0,
            holeCards: sp.holeCards!,
          })
          if (a.type === 'raise' && (a.amount ?? 0) <= round.currentBet) {
            a = toCall > 0 ? { type: 'call' } : { type: 'check' }
          }
          return a as EngineAction
        }
        const tilted = applyTilt(sp.profile, sp.tilt, config.tilt, sp.tiltMultiplier, rng)
        // Bot ctx = the object currently built at exploit-probe.ts:224-235 (street, toCall,
        // pot, currentBet, playerBet, chips, bb, numActivePlayers, raiseLevel, position,
        // holeCards, community slice, wasPreflopRaiser, preflopCallers, checkedThisStreet,
        // streetHistory) with pot/currentBet read from `round`, plus the run's `rng`.
        return decideBotAction(tilted, botCtx(sp, round), sp.consistency) as EngineAction
      }, (p, _a, result) => {
        if (street === 'preflop' && result.type === 'call') preflopCallerCount++
        if (street === 'preflop' && result.type === 'raise' && result.reopened) { preflopRaiseLevel++; preflopRaiserId = p.id }
        if (street === 'flop' || street === 'turn') {
          const ex = streetActions.get(p.id) || {}
          ;(ex as any)[street] = result.type === 'raise' ? 'raise' : result.type
          streetActions.set(p.id, ex)
        }
      })
```

with `pot`/`currentBet`/`lastRaiseIncrement` bridged through a `round` object exactly as in Task 10 (declare `let lastRaiseIncrement = BB` after `currentBet = BB`, reset per street).

- [ ] **Step 2:** Run the seeded determinism test: `npx vitest run tests/exploit-probe.test.ts -t deterministic` — PASS.
- [ ] **Step 3:** Do NOT run the full gate yet (that's Task 14's calibration). Commit — `git commit -m "Exploit probe plays by shared engine rules"`

---

### Task 13: One getTableDynamics

**Files:**
- Modify: `app/utils/gameSimulation.ts` (add shared impl), `app/composables/useGameEngine.ts:72-91`, `app/utils/simulateBrowser.ts:96-103`, `scripts/simulate.ts` (its copy, near `:549`)
- Test: Create `tests/table-dynamics.test.ts`

**Interfaces:**
- Produces (in `gameSimulation.ts`):

```ts
export function getTableDynamics(
  recentWinnerIds: readonly number[],
  playersChips: readonly number[],   // chips per non-eliminated player
  bb: number,
  botId: number,
  minHands: number,
): { dominantPlayerId?: number; dominantWinRate: number; myRecentWinRate: number; avgStackDepth: number; handsInWindow: number } | undefined
```

Returns `undefined` below `minHands` (the live-engine behavior; `simulateBrowser`'s zero-filled variant is replaced by `undefined` — `DecisionContext.tableDynamics` is already optional).

- [ ] **Step 1: Failing test** — window math: dominant id, rates, avg stack depth, `undefined` below `minHands`:

```ts
import { describe, it, expect } from 'vitest'
import { getTableDynamics } from '~/app/utils/gameSimulation'

describe('getTableDynamics', () => {
  it('returns undefined below minHands', () => {
    expect(getTableDynamics([1, 1, 2], [100, 100, 100], 2, 1, 10)).toBeUndefined()
  })
  it('computes dominant player and rates', () => {
    const winners = [1, 1, 1, 1, 1, 1, 2, 2, 0, 0]
    const d = getTableDynamics(winners, [200, 400, 200], 2, 2, 10)!
    expect(d.dominantPlayerId).toBe(1)
    expect(d.dominantWinRate).toBeCloseTo(0.6)
    expect(d.myRecentWinRate).toBeCloseTo(0.2)
    expect(d.avgStackDepth).toBeCloseTo((200 + 400 + 200) / 3 / 2)
    expect(d.handsInWindow).toBe(10)
  })
})
```

- [ ] **Step 2:** FAIL → implement (transplant `useGameEngine.ts:72-91` body, parameterized). Callers:
  - `useGameEngine.ts`: keep a thin local `getTableDynamics(botId)` calling the shared one with `minHands: config.tableFlow.minHands ?? 10` — check `holdem.config.ts` for the existing `tableFlow` key and use its actual field name; if no such key exists, add `tableFlow: { window: 20, minHands: 10 }` to the config and use it in all three callers.
  - `simulateBrowser.ts` and `simulate.ts`: same, deleting their local copies. **This intentionally unifies min-hands gates (10 vs 5 vs config) to the config value — a behavior change for the sims**; it lands before Task 14's recalibration on purpose.
- [ ] **Step 3:** `yarn test` green. Commit — `git commit -m "One getTableDynamics with config-driven min-hands gate"`

---

### Task 14: Probe recalibration under real rules (Phase 3 gate)

**Files:**
- Modify (only if breached): the jam-defense block `app/utils/botDecision.ts:702-728`
- Modify: `README.md` (Security section, audit-log convention: newest round open, older rounds in `<details>`), `CHANGELOG.md`
- Test: `tests/exploit-probe.test.ts` stays the gate.

- [ ] **Step 1:** Full battery, seeded: `yarn probe all 6000 20260712` (adjust to the CLI arg order implemented in Task 7). Record every strategy's bb/100 in the task log.
- [ ] **Step 2:** Compare against `MAX_BB100 = 10`. All negative → no tuning; skip to Step 4.
- [ ] **Step 3 (only if a strategy breaches):** tune per the knife-edge notes — nit-value and 3bet-jam pull the jam-defense constants (`continueRange` floor `0.04`, `fourBetFreq` factor, `sizeShrink` exponent `1.1`, `reraiseJamFloor` `0.85`) in OPPOSITE directions. Change ONE constant per iteration, re-run `yarn probe all 6000 20260712` plus a second seed (`…20260713`) to confirm the fix isn't seed luck. Both probes green before proceeding.
- [ ] **Step 4:** Run the gate: `npx vitest run tests/exploit-probe.test.ts` — PASS. Full `yarn test` — PASS.
- [ ] **Step 5:** Document: README Security log entry ("Round 5 — unified engine recalibration: sims/probe now enforce min-raise + half-raise; bb/100 table before/after") following the existing rounds' format; CHANGELOG entry under a new heading.
- [ ] **Step 6:** Commit — `git commit -m "Recalibrate exploit probe under unified engine rules"`

---

### Task 15: tsconfig + typecheck script

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json` (script + devDeps)

- [ ] **Step 1:** `tsconfig.json` at repo root:

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

- [ ] **Step 2:** `yarn add -D vue-tsc typescript` (nuxt typecheck requires vue-tsc). Add script `"typecheck": "nuxt typecheck"`.
- [ ] **Step 3:** Run `yarn typecheck`. Fix every surfaced error in `app/` and `scripts/` — expected clusters: `as any` casts, the `{ type: string }` seam in `GameEngineOptions.makeBotDecision` (`useGameEngine.ts:17-23` — tighten to `{ type: 'fold' | 'check' | 'call' | 'raise'; amount?: number }`), possible null-index warnings in tests. If more than ~30 errors surface, fix the engine/utils/scripts ones, and report the remainder count before deciding whether to expand scope.
- [ ] **Step 4:** `yarn test` + `yarn typecheck` both green. Commit — `git commit -m "Add root tsconfig and typecheck script; fix surfaced type errors"`

---

### Task 16: Persona interface, delete (p as any)

**Files:**
- Modify: `app/utils/botDecision.ts` (export `Persona`), `holdem.config.ts` (type the array), `app/utils/simulateBrowser.ts:82`, `scripts/simulate.ts:~148`, `scripts/exploit-probe.ts:124-125`

**Interfaces:**
- Produces (in `botDecision.ts`, next to `BotProfile`):

```ts
/** A configured bot persona — BotProfile plus identity/meta fields from holdem.config. */
export interface Persona extends BotProfile {
  name: string
  tiltMultiplier?: number
  consistency?: number
  leak?: string
}
```

(`BotProfile` already carries `limpFreq`/`styleBias`/`betSizeMult`/`overbetFreq` — verify against its declaration and extend `Persona` with any config-only fields the personas actually use; the compiler will list them.)

- [ ] **Step 1:** In `holdem.config.ts`: `import type { Persona } from './app/utils/botDecision'` and change the personas array to `personas: [ ... ] satisfies Persona[]` (keeps literal inference; flags typos in field names immediately).
- [ ] **Step 2:** Delete the `(p as any)` casts — fields are now typed: e.g. `exploit-probe.ts:124-125` becomes `limpFreq: p.limpFreq, styleBias: p.styleBias, betSizeMult: p.betSizeMult, overbetFreq: p.overbetFreq`.
- [ ] **Step 3:** `yarn typecheck` green (this is the proof), `yarn test` green.
- [ ] **Step 4:** Commit — `git commit -m "Typed Persona config; remove (p as any) persona reads"`

---

### Task 17: Strategy constants → holdem.config.ts

**Files:**
- Modify: `holdem.config.ts` (new `strategy` block), `app/utils/botDecision.ts:611-615` (POS_SHIFT), `:701-702` (size penalty, jam thresholds), `:718-728` (jam-defense factors — post-Task-14 values), `:971-980` (strength cutoffs), `:1025-1028` and `:1063-1067` (c-bet/barrel base rates)

- [ ] **Step 1:** Add to `holdem.config.ts` (values copied VERBATIM from the code as it stands after Task 14 — do not retune anything here):

```ts
  // ─── Bot Strategy Constants ──────────────────────────────────
  // Lifted from botDecision.ts so difficulty can be tuned/A-B tested
  // without editing branch logic. Values are the audited baselines.
  strategy: {
    posShift: { BTN: -0.08, D: -0.08, 'D/BTN': -0.08, 'D/SB': -0.08, CO: -0.05, SB: 0, BB: -0.03, MP: 0, 'MP+1': 0, UTG: 0.03, 'UTG+1': 0.02 } as Record<string, number>,
    preflop: {
      sizePenaltyExp: 0.85,        // value 3-bet shrink vs open size
      bluffSizePenaltyExp: 1.5,    // bluff 3-bet shrink vs open size
      jamToCallStackRatio: 0.6,    // toCall >= chips * this → jam-like
      jamOpenBBThreshold: 15,      // raiseLevel<=1 && toCall >= bb * this → jam-like
      jamSizeShrinkExp: 1.1,
      reraiseJamFloorBase: 0.85,
      jamContinueFloor: 0.04,
      jamRaisePortion: 0.4,        // top fraction of continue range that reraises
    },
    postflop: {
      monsterStrength: 0.55,
      strongStrength: 0.35,
      weakMadeStrength: 0.10,
    },
    cbet: {
      strongDry: 0.85, strongWet: 0.55, strongNeutral: 0.65,
      drawBase: 0.50, weakMadeDry: 0.40, weakMadeOther: 0.25, airBase: 0.15,
    },
    barrel: {
      turnMonster: 0.90, turnStrong: 0.70, turnDrawBase: 0.45, turnDefault: 0.25,
    },
  },
```

- [ ] **Step 2:** In `botDecision.ts`, import config (check the file's existing config import style — it may already import `@config` or take config via params; match it) and replace each literal with the config read, e.g. `const POS_SHIFT = config.strategy.posShift`, `strength >= config.strategy.postflop.monsterStrength`, `(hasStrongHand ? (board?.isDry ? S.cbet.strongDry : board?.isWet ? S.cbet.strongWet : S.cbet.strongNeutral) : …)` with `const S = config.strategy` at module top. Only the enumerated sites — do NOT chase every numeric literal in the file.
- [ ] **Step 3: Behavior-identical proof:** `yarn probe all 6000 20260712` — bb/100 for every strategy must be IDENTICAL to Task 14's recorded numbers (same seed, same rules, constants only moved). Any difference = a transcription error; diff the constants.
- [ ] **Step 4:** `yarn test` + `yarn typecheck` green. Commit — `git commit -m "Lift bot strategy constants into typed config.strategy block"`

---

### Task 18: Monte Carlo perf — merge loops, partial shuffle

**Files:**
- Modify: `app/utils/handAnalysis.ts` (`estimateEquity` ~:620-700, `simulateHandProbabilities` ~:880-935, `analyzeHand` ~:976-981)
- Test: existing seeded tests from Task 6 (update expectations if RNG draw order changes — they assert self-consistency, not golden values, so they should still pass); Create `scripts/bench-mc.ts` (throwaway benchmark, committed for reuse)

- [ ] **Step 1: Benchmark BEFORE.** `scripts/bench-mc.ts`:

```ts
import { estimateEquity, analyzeHand } from '../app/utils/handAnalysis'
import { mulberry32 } from '../app/utils/rng'
import type { Card } from '../app/utils/cards'

const hole: [Card, Card] = [{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }]
const board: Card[] = [{ rank: 2, suit: 'clubs' }, { rank: 7, suit: 'diamonds' }, { rank: 12, suit: 'spades' }]

let t = performance.now()
for (let i = 0; i < 50; i++) estimateEquity(hole, board, 3, 1000, mulberry32(i))
console.log(`estimateEquity x50 (1000 iters): ${(performance.now() - t).toFixed(0)}ms`)

t = performance.now()
for (let i = 0; i < 20; i++) analyzeHand(hole, board, 'flop', 3, 'BTN', 10, mulberry32(i))
console.log(`analyzeHand x20: ${(performance.now() - t).toFixed(0)}ms`)
```

Run `npx vite-node scripts/bench-mc.ts` — record both numbers. (Match `analyzeHand`'s real signature — check it before writing the bench; adjust arg list accordingly.)

- [ ] **Step 2: Optimize `estimateEquity`:** hoist `const remaining = [...deck]` out of the loop (reuse one array), and partial-shuffle only `cardsNeeded = (5 - community.length) + 2 * numOpponents` positions using the prefix trick already at `:918-921`:

```ts
  const remaining = [...deck]
  const cardsNeeded = (5 - community.length) + 2 * numOpponents

  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < cardsNeeded && j < remaining.length; j++) {
      const k = j + Math.floor(rng() * (remaining.length - j))
      ;[remaining[j], remaining[k]] = [remaining[k]!, remaining[j]!]
    }
    let idx = 0
    // …existing board-completion + opponent-dealing logic reads remaining[idx++] as before…
  }
```

(Re-partial-shuffling the same array each iteration is uniform over the needed prefix — each position j draws uniformly from the remaining pool.) Apply the same one-allocation hoist to `simulateHandProbabilities` (it already partial-shuffles; just stop copying the deck per iteration).

- [ ] **Step 3: Merge `analyzeHand`'s two MC runs into one loop:** add an internal `runoutStats(holeCards, community, numOpponents, iterations, rng)` that walks ONE set of seeded runouts computing BOTH the win/tie counts (equity) and the `handCategory7` histogram (hand probabilities), then have `analyzeHand` call it once (1000 iterations) instead of `estimateEquity(…,1000)` + `simulateHandProbabilities(…,800)`. Keep the standalone exported functions for existing callers (StatsPanel/commentary) — they now share the optimized inner loop.
- [ ] **Step 4: Benchmark AFTER.** Same command. Success criterion from the spec: ≥2x on `estimateEquity`; no regression on `analyzeHand` (expect ~2.5x from the merge alone). Record both numbers in the commit message.
- [ ] **Step 5:** `yarn test` green (statistical bands unaffected; seeded self-consistency tests still pass). Commit with the measured numbers in the message, e.g. `git commit -m "MC perf: single-allocation partial shuffle, merged analyzeHand runout loop (estimateEquity 480ms→130ms per 50x1000, analyzeHand 890ms→310ms per 20)"` — replace with the real before/after ms from Steps 1 and 4.

---

### Task 19: O(1) hand index + single postflop evaluation

**Files:**
- Modify: `app/utils/ranges.ts:74-77` (handRankIndex), `app/utils/botDecision.ts` (postflop entry — strength/draws/texture computed once)

- [ ] **Step 1: ranges.ts** — above `handRankIndex`:

```ts
const HAND_INDEX = new Map(ALL_HANDS.map((h, i) => [h, i]))

export function handRankIndex(hole: [Card, Card]): number {
  return HAND_INDEX.get(holeCardsToNotation(hole)) ?? -1
}
```

- [ ] **Step 2: botDecision postflop** — inside `decidePostflopAction`, find every repeated evaluation of the same 7 cards (`postflopHandStrength`/`bestHand`/`detectDraws`/`analyzeBoardTexture` at `:917-968` compute once already — verify; the duplication is in helpers called later that re-derive strength or draws). Hoist each so the 7-card evaluation runs at most once per decision; pass results as arguments to the helpers that recompute them. Only refactor call flow — zero logic changes.
- [ ] **Step 3: Behavior proof:** `yarn probe all 6000 20260712` — identical numbers to Task 17's run (pure caching; same rng draw order — if the numbers move, a hoisted call changed rng consumption order: find it and restore order, e.g. by keeping call sequence stable).
- [ ] **Step 4:** `yarn test` green. Commit — `git commit -m "O(1) preflop hand index; evaluate postflop hand once per decision"`

---

### Task 20: Final verification and wrap-up

- [ ] **Step 1:** Full gates: `yarn test` (all green), `yarn typecheck` (clean), `yarn probe all 6000 20260712` (all strategies negative), `yarn generate` (web build still works — CI never runs it).
- [ ] **Step 2:** Determinism spot-check: run `yarn probe all 2000 999` twice — identical output.
- [ ] **Step 3:** Play a hand manually (`yarn dev`) — bets, raises, all-ins, logs, pot awards all sane.
- [ ] **Step 4:** Update `CHANGELOG.md` with the full round summary (engine unification, seedable RNG, probe recalibration, typed config, MC perf numbers, the two bug fixes).
- [ ] **Step 5:** Commit, then present branch integration options (merge to main / PR / keep) per superpowers:finishing-a-development-branch.
