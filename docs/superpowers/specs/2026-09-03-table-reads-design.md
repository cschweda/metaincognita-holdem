# Table Reads — Design

**Date:** 2026-09-03
**Status:** Approved
**Mission context:** "Solid, difficult opponents." Round 7 removed a dead
"opponent reads" feature: the bot brain had branches for a passive table that
no counter ever fed. This replaces it with a real, calibrated, probe-gated
adaptation. The bots notice what kind of table they are sitting at — using
only public information — and adjust thin value, river bluffs and probe bets
within bounds.

## Shape (approved choices)

- **Always on**, like tilt and table flow. The signals are public (who
  checked, who bet, whether a flop was seen, whether the hand reached
  showdown), so there is no fairness gate and no toggle.
- **Table-level, not per-opponent.** Bots read the table as a whole; reading
  *you* specifically is Nemesis's job.
- **One tracker, four consumers.** The live engine, the browser simulator, the
  CLI simulator and the exploit probe feed the same pure tracker, so the CI
  gate measures the feature instead of trusting it.

## Signals (`app/utils/tableReads.ts`, pure, framework-free)

A rolling window of the last `windowHands` (30) completed hands. Each hand
records, table-wide:

- `bets` — every bet or raise (all-ins included); `checks` — every check.
  Calls and folds count toward neither.
- `sawFlop` — the hand reached a flop street.
- `showdown` — the hand ended with two or more players still in (all-in
  runouts included).

State is a plain object: `{ current: { bets, checks }, hands: HandSample[] }`.

- `createTableReadState()`
- `noteTableAction(state, type: 'bet' | 'check')` — bumps the current hand
- `finishTableHand(state, { sawFlop, showdown })` — pushes the sample, drops
  the oldest beyond `windowHands`, resets `current`
- `readTable(state, cfg): TableReads | undefined` — `undefined` below
  `minHands` (10); otherwise:
  - `passivity = checks / (checks + bets)`; `showdownPerFlop = showdowns / flopsSeen`
    (0 when no flop was seen)
  - `passive = passivity >= passiveAt` (0.62)
  - `showdownHeavy = showdownPerFlop >= showdownHeavyAt` (0.85)
  - `showdownLight = showdownPerFlop <= showdownLightAt` (0.30)
  - `showdownHeavy` and `showdownLight` are additionally forced `false` below
    `minFlops` (5) flops in the window — too few flops make the showdown
    ratio noise; `passive` is unaffected

Calibration (6,000 hands, pro lineup, 30-hand windows, seed 20260712):
passivity p10/p50/p90 = 0.41/0.48/0.56 and showdown-per-flop 0.42/0.58/0.71
at the normal table; 0.64/0.69/0.74 and 1.00 against a calling station;
0.07/0.11/0.14 passivity against an overbet maniac. Every threshold sits
outside the normal range, so a pro table produces no read.

## Reads → effects (`app/utils/botDecision.ts`)

`DecisionContext.tableReads?: { passive; showdownHeavy; showdownLight }`.
Three bounded effects, all in existing knobs, all in `config.strategy.tableReads`:

| Table | Read | Effect |
|---|---|---|
| Calling-station table | `passive && showdownHeavy` | river thin-value frequency × `thinValueBoost` (1.4) |
| Calling-station table | `passive && showdownHeavy` | river bluff-raise frequency × `riverBluffPenalty` (0.3) |
| Weak-tight table | `passive && showdownLight` | probe / stab bet rate × `probeBoost` (1.25), flop–river |

No read → every multiplier is 1.0 and the decision is byte-identical to today.

## Integration

- **Live engine** (`useGameEngine.ts`): `noteTableAction` in `applyAction`;
  `finishTableHand` at hand end (flop seen = street advanced past preflop;
  showdown = two or more unfolded players at the end). `makeBotDecision`'s
  street context carries `tableReads`; `index.vue` and `replay.vue` pass it.
  The tracker resets with the table (setup, rebuy, career session start),
  not on route change.
- **Simulators** (`simulateBrowser.ts`, `scripts/simulate.ts`) and the
  **probe** (`scripts/exploit-probe.ts`): same three calls, same context field.
- **Bot profile modal**: one static line under the persona description —
  "Reads the table: value-bets thinner into calling stations, probes
  weak-tight tables." No per-bot state to show.

## Config (`holdem.config.ts` → `strategy.tableReads`)

```ts
tableReads: {
  windowHands: 30, minHands: 10,
  passiveAt: 0.62, showdownHeavyAt: 0.85, showdownLightAt: 0.30,
  thinValueBoost: 1.4, riverBluffPenalty: 0.3, probeBoost: 1.25,
}
```

## Probe coverage (`scripts/exploit-probe.ts`, `tests/exploit-probe.test.ts`)

- New strategy `fit-or-fold`: calls any single raise preflop, then continues
  only with a pair or better (bets ½ pot when checked to, calls up to a
  pot-sized bet), folds everything else. It sees flops and gives up; in
  measurement this lowers showdown-per-flop only slightly and never makes
  the table passive, so it does not fire the weak-tight read (see the
  Implementation note below).
- `station` already fires the calling-station read.
- Gate: all nine strategies × {100bb, 25bb} must stay below +10 bb/100.
- `runStrategy` also returns `tableReadWindows: { total, passive,
  showdownHeavy, showdownLight }` so calibration is testable.

## Tests

- `tests/table-reads.test.ts` — window rolling, `minHands` gating, threshold
  edges, calls/folds not counted, no-flop hands excluded from the showdown
  denominator.
- `tests/table-reads-effects.test.ts` — seeded frequency bands over
  `decideBotAction`: thin-value river bets rise by ≈1.4× under the station
  read, river bluff-raises fall to ≈0.3×, probe bets rise ≈1.25× under the
  weak-tight read, and nothing moves with no read.
- Calibration — `runStrategy` with a fold-everything hero: fewer than 5% of
  windows produce any read at the normal table.
- The existing gate, extended to nine strategies.

## Edge cases

- The hero's own actions count: a station hero makes a station table. That
  is intended — the read is about the table, and Nemesis handles the hero.
- Heads-up and short-handed tables use the same thresholds; fewer actions per
  hand just make the window noisier, and `minHands` covers the start.
- A window straddles a rebuy or a career session start only if the tracker
  is not reset; the engine resets it wherever it resets the table.

## Out of scope

- Per-opponent reads (Nemesis), an "aggressive table" read (signal exists —
  overbet-spam drives passivity to ~0.1 — but no bounded counter-effect is
  designed yet), per-street or per-position reads, any UI beyond the one
  static line.

## Success criteria

- Probe gate green for 9 strategies × 2 depths; `station` loses at least as
  much as today (−1,080 bb/100 at 100bb) and `fit-or-fold` loses.
- Seeded probe cells where no read fires (open-jam, 3bet-jam, overbet-spam,
  minraise-spam, nit-value, steal-fold, donk-33) change by less than noise;
  the tracker's cost is negligible (a few counters per action).
- Calibration test: < 5% of windows carry any read at the normal table.
- Full suite and typecheck green; README bot-behavior docs and the Round 7
  roadmap line updated.

## Implementation note (2026-09-03)

A 4,000-hand-per-strategy measurement against the shipped tracker: the
calling-station read (`passive && showdownHeavy`) fires in 98% of windows
against `station`, exactly as designed. Against `fit-or-fold`, though, the
weak-tight read (`passive && showdownLight`) fires in 0% of windows
(showdown-light alone reaches 7%) — a single hero folding postflop can't
push an eight-handed table's aggregate passivity and showdown-per-flop past
the calibrated thresholds, so the "fires the weak-tight read" expectation
in Probe coverage above does not hold. The weak-tight read is still
unit-tested (`tests/table-reads-effects.test.ts`) and calibrated (the
fold-everything-hero test, under 5% of windows), but it is not measured end
to end by any probe strategy; `fit-or-fold` stays in the gate as its own
degenerate line regardless.
