/**
 * Composite engine-leak gate (Round 8, Task 12).
 *
 * The pure-degenerate battery (tests/exploit-probe.test.ts) cannot see a
 * postflop leak: a hero who jams any two cards pays so much blind tax that
 * an +18 bb/100 river leak vanishes inside a -300 bb/100 line. These cells
 * run a hero on a SOLID baseline (Solid Sam's own logic) with exactly one
 * deviation, so the delta against the baseline IS the leak's EV.
 *
 * ── Read this before trusting a green run here ────────────────────────────
 * THIS FILE IS A SECONDARY, COARSE NET. IT IS NOT THE PRIMARY REGRESSION
 * GUARD. The primary guards are the deterministic static-sweep suites --
 * tests/river-defense.test.ts, tests/turn-defense.test.ts,
 * tests/short-stack.test.ts and tests/reraise-size.test.ts. Those are
 * seeded, discriminate cleanly, and each one was directly shown to FAIL
 * when its own feature was neutralised -- that is what "primary guard"
 * means here, and it is a stronger claim than anything below.
 *
 * This file's cells are noisy, and noisy is not free: cell by cell, only
 * SOME of them have actually been shown capable of catching a real
 * regression (full method and numbers in task-12-report.md, sections 5 and
 * 9). `river-50`, `river-66`, `pf-exploit`, and the whole 3-bet/4-bet
 * family (`prem3bet-25-fj`, `prem3bet-50-fj`, `wide5-3bet-50-fj`)
 * demonstrably trip when their fix is undone. `river-33`, `river-100` and
 * `river-value-150` moved hard under the same test (the river's
 * size-awareness flattened to a constant) but landed under their own
 * bounds -- responded, did not fire. `turn-33`, `turn-river-33` and
 * `turn-value-150` barely moved at all under an equivalent test of the
 * turn's size-awareness and do not currently demonstrate they would catch
 * anything on that street. Each cell's status is recorded in its own
 * comment below. DO NOT read an untripped or unresponsive cell as evidence
 * its corresponding fix is intact -- for the turn specifically, that
 * evidence lives in tests/turn-defense.test.ts, not here; see the note
 * beside the bounds below for the general rule.
 *
 * ── Why this file does not look like the original Task 12 brief ──────────
 * The brief specified 2 seeds x 20,000 hands against a flat +10 bound. A
 * preview against real code inverted its own verdict on two adjacent cells
 * (failed river-33, passed river-50 at 2 seeds; the reverse at 8 seeds) —
 * see task-12-report.md, "why the brief's protocol is unusable". This round
 * settled on 8 seeds x 30,000 hands (seeds below) as its measurement
 * standard after finding that even 4 seeds x 30k does not resolve
 * differences under ~4 bb/100.
 *
 * Measuring THIS gate's own run-to-run spread (task-12-report.md) turned up
 * something the round hadn't yet found: several composite cells have a
 * heavy right-tailed per-seed distribution (a small number of hands, or a
 * single seed's whole trajectory, can swing a cell's 8-seed mean by more
 * than 10 bb/100 — confirmed by direct per-seed inspection, not just
 * aggregate variance) — and the point estimates this produces (this file's
 * comments included) should be read as ranges, not precise figures; see
 * task-12-report.md's conclusions. Bounds here are NOT "true value + a few
 * points" — each is the ceiling of (worst of 4 independently-seeded 8-seed
 * batches) + max(half that batch-to-batch range, 5), which is derived, not
 * guessed. That is also, mechanically, why some of these cells turned out
 * unable to demonstrate a trip: a bound wide enough to survive real
 * measurement noise is a bound a real regression can hide under, for the
 * noisiest cells. See task-12-report.md for the full derivation, the
 * four-batch data table, and every revert/neutralisation demonstration.
 */
import { describe, it, expect } from 'vitest'
import { COMPOSITE, runComposite } from '../scripts/composite-probe'

const HANDS = 30000
// This round's own measurement standard (established across Tasks 7-11b;
// see the round's ledger). Chosen BEFORE any of this file's numbers were
// derived from it. Do not swap in a different seed list without re-running
// the spread analysis in task-12-report.md — see the file-level comment
// above on why a small seed set can misrepresent these specific cells.
const SEEDS = [20260712, 999, 7, 4242, 55555, 111, 222, 333]

function meanBB100(name: string, depthBB: number): number {
  const rs = SEEDS.map(s => runComposite(name, HANDS, s, depthBB))
  return rs.reduce((a, r) => a + r.bb100, 0) / rs.length
}

// `base` (Solid Sam's own logic, zero deviation) is not itself free of
// table-level noise, so every cell's leak is judged against base measured
// at the SAME depth and the SAME seeds, not a flat zero. pf-exploit only
// means something below 25bb (see its own comment in composite-probe.ts),
// so it is compared against base@24bb, not base@100bb — an earlier
// exploratory measurement in this task compared it to the wrong depth and
// silently overstated its margin by ~1.3 bb/100. Memoized per depth so a
// 13-cell run at 100bb only pays for `base` once.
const baseMeanCache = new Map<number, number>()
function baseMean(depthBB: number): number {
  let m = baseMeanCache.get(depthBB)
  if (m === undefined) {
    m = meanBB100('base', depthBB)
    baseMeanCache.set(depthBB, m)
  }
  return m
}
function delta(name: string, depthBB: number): number {
  return meanBB100(name, depthBB) - baseMean(depthBB)
}

// ── What's gated, and what isn't ──────────────────────────────────────────
// Gated: every COMPOSITE cell that measures a leak this round closed, or a
// leak this round found and deliberately left as a documented residual
// (river-value-150, turn-value-150, reraise-cliff-bluff). Not gated:
//   - 'base' itself: the reference the deltas below are measured against,
//     not a deviation, so it has no "leak" to trip on.
//   - 'open-any-late': never measured positive and never named as a leak or
//     a residual anywhere in the round (Task 6 built it as a design-check
//     "control" cell alongside river-call-tp). It also carries the
//     second-highest noise floor of any composite cell (sd ~13 bb/100 at
//     8x30k) against a true value near zero, so a bound tight enough to add
//     protection would risk false positives, and one loose enough to be
//     safe would add none. The behavioural question it asks — does a
//     late-position any-two-cards steal pay — is already gated far more
//     tightly (sd well under 1 bb/100) by `steal-fold` in the standing pure
//     battery below.
//
// Bounds derived 2026-09-06 against main @ 56e3274, 8 seeds x 30,000 hands
// per cell, cross-checked against three independently-seeded 8-seed
// replicate batches (full data in task-12-report.md). Each row's comment
// carries: canonical-seed true delta, the [min, max] observed across all
// four batches (the canonical run plus the three replicates), and now the
// cell's DEMONSTRATED status from task-12-report.md sections 5 and 9 — a
// revert or a config-neutralisation of the corresponding fix, actually run,
// not assumed. Three statuses appear below:
//   TRIPPED       — measured to cross its bound when the fix was undone.
//   NOT DEMOSTRATED — tested under the same undoing; moved, in the leak's
//                     direction, but stayed under its own bound.
//   NOT RESPONSIVE  — tested under the same undoing; did not move
//                     meaningfully at all.
// A cell with no TRIPPED status next to it is NOT evidence that the fix it
// watches is safe. It means this particular noisy, coarse-net cell has not
// been shown to catch that fix's removal — nothing more, nothing less. Where
// a deterministic suite exists for that mechanism (river, turn, short
// stacks, reraise sizing), THAT suite is the one actually proving the fix
// holds; read its own file, not the absence of a red test here.
const CELLS: Array<{ name: string; depthBB: number; bound: number }> = [
  // River family (Task 7+8 fixed the small/medium-bet leak; measured +17.8
  // and +19.2 bb/100 pre-fix for river-33/river-50 respectively).
  // NOT DEMONSTRATED: flattening river's size-awareness to a constant
  // (task-12-report.md §9a) drove this to +23.94 -- moved hard, in the
  // leak's direction -- but landed just under this cell's own bound of 25,
  // the widest margin in the file (see file header). Not chased with a
  // harsher flattening; see §9a for why that would be tuning to an answer.
  { name: 'river-33', depthBB: 100, bound: 25 }, // true +3.0, range [3.0, 17.2]
  // TRIPPED: same river flattening reproduces +21.20 against this bound of
  // 19 (task-12-report.md §9a).
  { name: 'river-50', depthBB: 100, bound: 19 }, // true +8.6, range [5.9, 13.6] — closest cell to its own bound
  // TRIPPED: same river flattening reproduces +18.31 against this bound of
  // 16 (task-12-report.md §9a).
  { name: 'river-66', depthBB: 100, bound: 16 }, // true +4.3, range [4.3, 10.4]
  // NOT DEMONSTRATED: same river flattening reached +13.98 against this
  // bound of 18 -- responded, did not fire (task-12-report.md §9a).
  { name: 'river-100', depthBB: 100, bound: 18 }, // true +4.1, range [4.1, 12.4]
  // NOT DEMONSTRATED: same river flattening reached +10.64 against this
  // bound of 17 -- responded, did not fire (task-12-report.md §9a).
  { name: 'river-value-150', depthBB: 100, bound: 17 }, // true +5.4, range [5.4, 11.3] — documented residual, reduced from +14.1, not eliminated (Ruling P13/P17 lineage)
  // Not tested for tripping (it is the opposite-direction control, not a
  // fix this task's neutralisations target) — stayed negative under the
  // river flattening, as expected, not as a demonstration.
  { name: 'river-call-tp', depthBB: 100, bound: 10 }, // true -8.5, range [-8.5, 3.8] — Task 6's opposite-direction control: catches over-calling a river bet with only top pair
  // NOT RESPONSIVE: flattening the turn's size-awareness (task-12-report.md
  // §9b) moved this cell from +5.57 to only +6.99 -- nowhere near this
  // bound of 17. See turn-33 below for the shared explanation and the real
  // guard for this street.
  { name: 'turn-river-33', depthBB: 100, bound: 17 }, // true +5.6, range [5.5, 11.7] — cross-street compound cell; was the round's single largest number (measured ~19 pre Task 11b) before it was closed
  // Turn family (Task 11b fixed the isolated turn leak the compound cell
  // above couldn't localize; added the value-direction check per its own
  // review finding, ruling P30).
  // NOT RESPONSIVE: flattening the turn's size-awareness to a constant
  // (task-12-report.md §9b) moved this cell from -2.21 to -2.11 -- barely
  // measurable, let alone toward tripping this bound of 20. This probe is
  // simply insensitive to the turn fix here: the composite table is
  // 8-handed, and `mdfDefenders` (botDecision.ts) divides the size-aware
  // term across however many opponents are still live, so a flat
  // heads-up-shaped constant lands above the current value in some
  // multiway spots and below it in others and the effects wash out — see
  // §9b for the full reasoning. The turn's real, deterministic guard is
  // tests/turn-defense.test.ts, which directly measures the static sweep
  // this fix produced (68.7/68.9/66.1 percent flat -> 90.5/61.7/47.7
  // percent graded) and was shown to fail when neutralised. This cell was
  // NOT shown to fail, and should not be read as if it were.
  { name: 'turn-33', depthBB: 100, bound: 20 }, // true -2.2, range [-9.1, 10.0]
  // NOT RESPONSIVE, same test and same explanation as turn-33 above: moved
  // from +0.80 to +9.83 under the turn flattening -- more movement than
  // turn-33 or turn-river-33 showed, but still far under this bound of 22,
  // and for the same multiway-dilution reason. tests/turn-defense.test.ts
  // is the real guard for this residual too.
  { name: 'turn-value-150', depthBB: 100, bound: 22 }, // true +0.8, range [0.8, 14.6] — documented residual (shipped wider than the river's vetted constants; measured +2.3 at ship time)
  // Preflop 3-bet/4-bet family (Task 10 fixed the flat continue-rate leak;
  // wide5-3bet-50-fj was the original motivating cell at +16.19 pre-fix).
  // TRIPPED: reverting Task 10's fix commit (9175981) locally reproduces
  // +9.09 against this bound of 4 (task-12-report.md §5a).
  { name: 'prem3bet-25-fj', depthBB: 100, bound: 4 }, // true -4.0, range [-4.0, -1.9] — tightest margin in the file, and the tightest empirical spread
  // TRIPPED: same Task 10 revert reproduces +16.42 against this bound of 7
  // (task-12-report.md §5a).
  { name: 'prem3bet-50-fj', depthBB: 100, bound: 7 }, // true -4.3, range [-10.2, 1.0]
  // TRIPPED: same Task 10 revert reproduces +16.90 against this bound of 2
  // (task-12-report.md §5a) — the demonstrated regression, and the original
  // motivating leak for this whole family.
  { name: 'wide5-3bet-50-fj', depthBB: 100, bound: 2 }, // true -16.5, range [-16.5, -4.8]
  // Documented residual: the size-penalty/jam-floor handoff is a real
  // discontinuity (Task 10 review), confirmed catastrophically unprofitable
  // to exploit rather than fixed (Ruling P25). Bound is a round, generous
  // number rather than the formula's -239 -- precision doesn't matter this
  // far from zero. Not demonstrated to trip by any test of its OWN
  // mechanism (none has been attempted); the Task 10 revert above correctly
  // left it at -223 (task-12-report.md §5a) — nowhere near tripping, and
  // that is the CORRECT result, since this cell targets a different
  // residual than the one that revert reopens, not a failed trip attempt.
  { name: 'reraise-cliff-bluff', depthBB: 100, bound: -100 }, // true -254.7, range [-254.7, -244.2]
  // Short-stack push/fold + commit rule (Task 9); only meaningful below
  // 25bb (see composite-probe.ts's own comment on this cell).
  // TRIPPED: restoring pushFoldBB to its old value (25, collapsing the
  // 12-25bb band Task 9 introduced) reproduces +8.97 against this bound of
  // 6 (task-12-report.md §9c).
  { name: 'pf-exploit', depthBB: 24, bound: 6 }, // true -0.8 vs base@24bb, range [-2.6, 0.3]
]

describe('composite probe covers the cells gated below', () => {
  it('COMPOSITE still exports every cell this file gates', () => {
    expect(Object.keys(COMPOSITE)).toEqual(expect.arrayContaining(CELLS.map(c => c.name)))
  })
})

describe('no single deviation from solid play beats the pro bots (Round 8 composite gate)', () => {
  for (const { name, depthBB, bound } of CELLS) {
    it(`${name} is unprofitable at ${depthBB}bb`, () => {
      const d = delta(name, depthBB)
      expect(
        d,
        `${name} delta ${d.toFixed(1)} bb/100 over ${HANDS} hands x ${SEEDS.length} seeds at ${depthBB}bb ` +
        `(bound ${bound}) — possible engine leak reopened; re-run the spread analysis in task-12-report.md ` +
        `before touching the bound`,
      ).toBeLessThan(bound)
    }, 60_000)
  }
})

describe('composite probe determinism', () => {
  it('is byte-identical for a fixed seed', () => {
    const a = runComposite('river-33', 300, SEEDS[0]!)
    const b = runComposite('river-33', 300, SEEDS[0]!)
    expect(a).toEqual(b)
  }, 60_000)
})
