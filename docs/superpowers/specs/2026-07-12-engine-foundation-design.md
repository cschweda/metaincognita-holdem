# Engine Foundation for Difficult Opponents — Design

**Date:** 2026-07-12
**Status:** Approved
**Mission context:** The product goal is a solid, fun-but-challenging hold'em game with
difficult opponents (Poker Academy Pro spirit). This spec covers the engine foundation
that makes bot difficulty measurable, tunable, and trustworthy. Player-facing features
(career mode, cross-session opponent modeling, coaching) are a later spec.

## Problem

1. The betting round is implemented four times — live game (`app/composables/useGameEngine.ts`),
   browser sim (`app/utils/simulateBrowser.ts`), CLI sim (`scripts/simulate.ts`), and exploit
   probe (`scripts/exploit-probe.ts`) — and the copies have diverged. Only the live engine
   enforces minimum raises and the half-raise/reopen rule; the other three retain the
   `loops >= count * 4` betting-loop cap that the live engine replaced because it can truncate
   legitimate multi-raise rounds (`useGameEngine.ts:251`). Persona validation and the CI
   difficulty gate therefore measure bots under different rules than the game the user plays.
2. There is no injectable RNG anywhere (63 raw `Math.random()` calls in `botDecision.ts` alone).
   The exploit-probe CI gate is a statistical pass/fail over unseeded randomness — flaky by
   construction — and no sim run or bug is reproducible.
3. Strategy constants (position shifts, jam thresholds, c-bet/barrel rates, strength cutoffs)
   are hard-coded in `botDecision.ts` branch logic; persona fields are read via `(p as any)`;
   there is no root `tsconfig.json`, so nothing type-checks.
4. Monte Carlo hot loops copy and fully shuffle the whole deck per iteration; preflop hand
   ranking is an O(169) `indexOf` per lookup; postflop decisions re-evaluate the same 7 cards
   several times.
5. Two small correctness bugs: split-pot odd chips go to the lowest player id instead of the
   first seat left of the button (`sidePots.ts:100-105`); PokerStars export regexes are
   integer-only (`pokerStarsExport.ts:131-138`), silently dropping fractional-amount actions
   (e.g. `raises to $12.5` at Micro stakes) while the parser accepts decimals.

## Phase 0 — Immediate bug fixes (TDD)

- **Odd-chip award:** order tied winners by seat clockwise from the button before assigning
  the remainder chip. The side-pot award path gains a button-seat parameter. Failing test
  first: three-way tie, button at various seats, remainder lands left of button.
- **Fractional export:** the three action regexes (`calls`, `raises to`, `goes ALL-IN`)
  become `\$([0-9.]+)`, and exported amounts follow PokerStars formatting: whole amounts
  bare (`$12`), fractional amounts with two decimals (`$12.50`).
  Failing test first: Micro-stakes hand ($0.25/$0.50) exports every action.

## Phase 1 — Seedable RNG

- New `app/utils/rng.ts`: `export type Rng = () => number` and `export function mulberry32(seed: number): Rng`.
- Explicit parameter threading (no module-global RNG, no class):
  - `shuffle(arr, rng?)` — defaults to `Math.random`.
  - `DecisionContext` gains `rng?: Rng`; every `Math.random()` inside the decision path
    reads from `ctx.rng ?? Math.random`.
  - Monte Carlo helpers in `handAnalysis.ts` accept an optional `rng`.
  - The sims (`simulateBrowser.ts`, `scripts/simulate.ts`) and `scripts/exploit-probe.ts`
    accept a seed and construct one `mulberry32` stream per run.
- Tests: same seed → byte-identical sim output twice; `tests/exploit-probe.test.ts` pins a
  seed so the CI gate is deterministic. Statistical suites get seeds for reproducibility
  without changing their assertion bands.

**Alternatives considered:** module-global `setRng()` (simpler call sites, but hidden state
breaks test isolation); a DI class (over-engineering). Parameter threading chosen.

## Phase 2 — One betting engine

- New framework-free `app/utils/bettingEngine.ts`, extracted from the live engine's rules
  (the only correct copy):
  - `nextToAct(state): number | null` — whose turn, or round complete.
  - `legalActions(state, seat)` — `{ toCall, canRaise, minRaiseTo, maxRaiseTo }`.
  - `applyAction(state, seat, action)` — mutates plain state; enforces min-raise
    (last full raise increment, floor BB), clamps short all-ins, applies the half-raise
    rule (incomplete all-in does not reopen action); returns whether action reopened.
  - `runBettingRound(state, decide)` — synchronous convenience loop for sims/probe;
    uses the skip-guard termination (never a lap-count cap).
  - One shared `getTableDynamics` with the config-driven min-hands gate (replaces the
    three divergent copies: 10 vs 5 vs config).
- `useGameEngine.ts` keeps its async choreography (thinking delays, pause, hero input) and
  delegates legality/turn-order bookkeeping to the shared module. Player objects inside
  `gs.playerStates.value` are mutated through their reactive proxies, so reactivity is
  preserved; scalar refs (`currentBet`, `lastRaiseIncrement`) are snapshotted into the plain
  state and written back after each step.
- `simulateBrowser.ts`, `scripts/simulate.ts`, and `scripts/exploit-probe.ts` delete their
  hand-rolled loops (and the `count * 4` caps) and consume `runBettingRound`.
- Existing phase3 betting tests are pointed at the shared module and continue to pass;
  new unit tests cover reopen/no-reopen edge cases at the module level.

**Alternatives considered:** callback-only loop (can't host async hero input cleanly);
sims driving `useGameEngine` (drags Vue reactivity into hot loops). Step-reducer chosen.

## Phase 3 — Probe recalibration under real rules

- Re-run `yarn probe` seeded, with sims now playing real min-raise/reopen rules.
- Expect bb/100 shifts (knife-edge: nit-value vs 3-bet-jam are opposing constraints).
  If a strategy breaches the gate, tune in small steps, re-running the probe each time.
- Record results in the README Security section per the audit-log convention and in
  CHANGELOG. `MAX_BB100 = 10` stays; tightening is follow-up once seeded variance is known.

## Phase 4 — Config-lift strategy constants + typing

- Move hard-coded strategy numbers from `botDecision.ts` into a typed `strategy` block in
  `holdem.config.ts`: the `POS_SHIFT` table, jam thresholds (`bb*15`, `chips*0.6`),
  size-penalty exponents (`0.85`, `1.5`), c-bet/barrel base rates, and the postflop
  strength cutoffs (`0.55` / `0.35` / `0.10`).
- Declare a `Persona` interface (superset of `BotProfile` with `limpFreq`, `styleBias`,
  `betSizeMult`, `overbetFreq`); type `holdem.config.ts` with it; delete the `(p as any)`
  casts in `simulateBrowser.ts`, `scripts/simulate.ts`, `scripts/exploit-probe.ts`.
- Add root `tsconfig.json` (`{ "extends": "./.nuxt/tsconfig.json" }`) and a
  `typecheck` script (`nuxt typecheck`); fix surfaced type errors.
- Behavior-preservation check: seeded probe run produces identical results before/after
  the constant extraction.

## Phase 5 — Evaluator / Monte Carlo performance

- `estimateEquity` and `simulateHandProbabilities`: allocate the deck once outside the
  loop; partial-shuffle only the cards actually drawn (the prefix trick already at
  `handAnalysis.ts:919-921`); merge the two independent runout loops inside `analyzeHand`
  into one.
- `ranges.ts`: precomputed `Map<string, number>` for hand index (replaces O(169) `indexOf`);
  memoize `holeCardsToNotation` where hot.
- Postflop decision path: evaluate `eval7`/draws/texture once per decision and pass down.
- Verification: before/after benchmark (time `analyzeHand` and a 1,000-hand sim); the
  statistical suites assert distribution bands, not golden values, so they remain valid
  even though RNG consumption order changes.

## Out of scope

Splitting `botDecision.ts` into modules (separate pass — no file reorg mixed with rule
changes); frontend performance (StatsPanel `toCall` recompute, localStorage growth);
accessibility/theming; Tauri desktop items; Poker Academy feature work (career mode,
cross-session opponent modeling, coaching) — next spec.

## Success criteria

- All existing tests green (805 at time of writing), plus new failing-first tests for
  Phase 0 and module tests for Phases 1–2.
- `yarn probe` green under unified rules, seeded; any recalibration documented per
  convention.
- Same seed → byte-identical sim output on repeat runs.
- `yarn typecheck` passes.
- Measured MC speedup reported in the phase commit message (target: >2x on
  `estimateEquity`; no regression tolerated).

## Sequencing

Phase 0 → 1 → 2 → 3 → 4 → 5, committed per phase on branch `engine-foundation`.
Phase 3 gates Phase 4 (recalibration must land before constants move, so the
before/after seeded comparison in Phase 4 is meaningful).
