# Round 8 Leak Fixes — Design

**Date:** 2026-09-05
**Status:** Approved
**Mission context:** "Solid, difficult opponents." The Round 7 conclusion
("no strategic leak found") rested on a probe whose heroes are pure
degenerate lines. A composite probe — a hero that runs a solid bot persona's
own logic plus one deliberate deviation — finds three leaks a human notices
within an orbit. This round closes them, promotes the composite probe into
the CI gate so they stay closed, and clears a batch of wiring and
documentation bugs found in the same review.

## Findings (baseline evidence, 2026-09-05)

Composite probe: hero = Solid Sam's `decideBotAction` (no consistency
misplays) + one deviation, vs the CI pro lineup, 100bb reset each hand,
30,000 hands × 4 seeds (per-seed bb/100 SD ≈ 8–10). Baseline alone: +7.9.

| Deviation | Δ vs baseline |
|---|---|
| Bet 1/3 pot on every river the baseline would check | **+17.8** |
| same at 1/2 pot / 2/3 pot / 1x / 1.5x | +19.2 / +16.1 / +6.4 / 0.0 |
| same, heads-up rivers only / multiway only | +17.1 / −2.3 |
| 24bb table: open 2.2x top 20%, call jams with top 7% | **+16.9** |
| 24bb table: only call jams with top 5% | +10.6 |
| 3-bet QQ+/AK to 25bb, jam any flop | +8.1 (+8.2bb per premium hand) |
| 3-bet QQ+/AK to 50bb, jam any flop | +5.3 (+10.2bb per premium hand) |
| 3-bet top 5% to 50bb, jam any flop | +10.3 |
| 3-bet QQ+/AK all-in | −21.5 |
| any-two opens, any-two 3-bets at any size, 4-bet bluffs, c-bet always, raise c-bets, check-raise + barrel, float, iso-raise limpers, small turn bets, river raise-bluffs, nut overbets, call rivers with top pair, BB call wide | all ≤ 0 |

Static sweeps (pooled pros, 20,000 random hands each):

- River, heads-up, bot checked then faces a bet: defends 46 / 45 / 44 / 46 / 45 %
  vs 0.33 / 0.5 / 0.66 / 1.0 / 1.5 × pot (MDF 75 / 67 / 60 / 50 / 40 %).
  By class: air 2%, pair below top 37%, top pair 52%, two pair+ 70%.
- River, checked to as the non-raiser: bets 0% of air, 5% of weak pairs,
  25% of top pair, 47% of two pair+.
- Facing a 3-bet after a BTN open: fold 81 / call 17 / 4-bet 2, identical
  from 7.5bb to 60bb; only ≥ 60% of stack is jam-like (fold 98%).
- BB vs an open: defends 34% vs 2bb, 14% vs 2.5–3bb, 8% vs 8bb.
- Stack under 25bb, first to act: open-jams 18% (EP/SB) – 26% (LP), never
  opens small, never limps, never calls; at exactly 25bb: 0% jams. The CI
  gate's "25bb" cell therefore never exercises push/fold mode.

## Shape (approved choices)

- **Approach A — targeted patches** inside the existing branches of
  `decidePreflopAction` / `decidePostflopAction`. No new decision model,
  no post-processing layer. Flop and turn facing-a-bet logic is untouched
  (it is not leaking).
- **Degenerate lines must always lose.** Where a constant trades one probe
  constraint against another, any-two / spam / station lines stay clearly
  negative at every depth; a pure nit may sit at +0 to +5 bb/100 at 20–25bb.
- Every new constant lives in `holdem.config.ts` → `strategy`.
- Commit per task on `main`, no AI co-author trailer, nothing pushed.

## 1. River defense, size-aware (`decidePostflopAction`, facing a bet, river only)

Replace, for `ctx.street === 'river'` only:

- the river half of the "call-down discipline" block
  (`baseContinue = 0.35 + marginShield * 0.50`),
- the "fold top pair to pot-sized+ bets on the river" rule
  (`betToPotRatio > 0.8 && strength < 0.50 && rng() > vpip`),
- the weak-made river path (small-bet call, 80% MDF call, `vpip * 0.2 * streetFactor`)

with one continuation probability per class, anchored to the MDF the bet
size implies (`mdf = (1 − potOdds) / mdfDefenders`, already computed):

```
strong, non-monster (0.35 ≤ strength < 0.55):
  shield   = clamp((strength − 0.35) / 0.20, 0, 1)
  continue = clamp(mdf × (river.strongBase + shield × river.strongShield)
                   × passiveBoost × sizingExploit, river.strongMin, river.strongMax)
weak made (0.10 ≤ strength < 0.35, no draw):
  continue = clamp(mdf × river.weakBase × passiveBoost × sizingExploit,
                   river.weakMin, river.weakMax)
```

Order inside the strong branch is unchanged: continuation roll first, then
the existing check-raise and IP value-raise rolls, then call. Monsters,
draws (flop/turn only) and air keep their branches; the air bluff-raise
keeps `riverBluffMult` from table reads. `passiveBoost` (0.8–1.24) and the
Nemesis sizing tell keep scaling the result, so stations still call down more.

Config: `strategy.river = { strongBase: 1.15, strongShield: 0.45, strongMin: 0.25,
strongMax: 0.97, weakBase: 0.95, weakMin: 0.05, weakMax: 0.85, maxBluffRate: 0.35 }`.

Targets (static sweep, same harness as the findings): overall defense
60–65% vs 1/3 pot, 45–55% vs 1x, 35–45% vs 1.5x; top pair ≥ 85% vs 1/3 pot,
≤ 60% vs 1.5x. Monotone non-increasing in bet size for every class.

## 2. River bluffs that fire (`postflopHandStrength`, `decidePostflopAction`)

- The overcard credit for high-card hands (0.15 / 0.22 / 0.25) applies only
  while cards are still to come: `community.length < 5`. On the river an
  unpaired hand scores 0.08 and classifies as `hasNothing`.
- On the river no draws are detected for the decision (`decisionDraws = []`
  when `street === 'river'`, and `postflopHandStrength` receives them), so a
  missed flush or straight draw is air too — the natural bluffing hand.
- The existing bluff branches then fire at the persona's rate: when checked
  to as a non-raiser `bluffFreq × 0.35 × aggression`; as the raiser after a
  turn barrel `bluffFreq × 0.45 × aggression × riverBluffBoost × ipAggBoost`.
  Both are capped at `river.maxBluffRate` (0.35) so the bluff share of a
  persona's river bets stays under half of its value bets.
- Nothing else reads these classifications on the river (the consistency
  brain-fart guard uses `strongMade ≥ 0.55`, unaffected; the analysis panel
  has its own scorer).

Targets: non-raiser checked-to river bets with air 3–13% by persona
(Tony ≈ 2%, Sam ≈ 4%, Twan ≈ 13%); the composite "call rivers with top
pair" cell stays ≤ +10.

## 3. Short stacks (`decidePreflopAction`)

Config: `strategy.preflop.pushFoldBB: 12`, `commitRatio: 0.40`,
`shortReJamScale: 0.70`, `shortJamCallScale: 0.45`. The hardcoded `< 25`
goes away; `sessionMemory.shortStackThreshold` (unused by the code) and its
config-pin test are removed.

At or below `pushFoldBB` (stack in bb = chips / bb, `toCall > 0`, cards known),
with `shove` = today's position/desperation thresholds (LP 0.25 / EP 0.18;
under 10bb 0.35 / 0.28):

| Spot | Action |
|---|---|
| first in / over limpers (`toCall ≤ bb`, `raiseLevel === 0`) | jam if pct < shove, else fold |
| facing a jam-like raise (`toCall ≥ chips × commitRatio`) | jam (= call) if pct < shove × shortJamCallScale, else fold |
| facing a small raise | jam if pct < shove × shortReJamScale, else fold |

The BB with `toCall === 0` keeps today's check-or-raise path.

Between `pushFoldBB` and 25bb the normal branches run, with two additions:

- **Commit rule** — every preflop raise the normal logic returns (open,
  iso, blind 3-bet, value/bluff 3-bet, 4-bet) becomes all-in when
  `raiseTotal − playerBet ≥ chips × commitRatio`.
- **Open-jam calls widen with shorter jams** — in the jam-like branch at
  `raiseLevel ≤ 1`, `continueRange = max(today's range, shortJamRange)` with
  `shortJamRange = jamBB > 25 ? 0 : 0.04 + 0.06 × clamp((25 − jamBB) / 13, 0, 1)`
  (4% at 25bb, 6.3% at 20bb, 10% at ≤ 12bb). The reraise-jam floor at
  `raiseLevel ≥ 2` is unchanged.

Targets: at 24bb first-in the pros open small at their normal rate and
never open-jam; at 12bb they open-jam at today's rates; the composite
24bb open-and-call line is ≤ +10 (aim ≤ +5); `open-jam`, `3bet-jam` and
`nit-value` lose at 100 / 25 / 20 / 15bb.

## 4. Size-aware 3-bet and 4-bet defense (`decidePreflopAction`)

Config: `strategy.preflop.threeBetRefBB: 9`, `threeBetRefMult: 3.5`,
`fourBetRefBB: 25`, `fourBetRefMult: 2.5`, `reraiseSizePenaltyExp: 0.85`,
and `jamToCallStackRatio` 0.6 → **0.45**.

```
raiseLevel 2:  ref = max(threeBetRefBB × bb, threeBetRefMult × playerBet)
               pen = currentBet ≤ ref ? 1 : (ref / currentBet) ^ reraiseSizePenaltyExp
               flatCallFreq4 × pen;  bluffRate4 × pen^1.5;  valueFreq × sqrt(pen)
raiseLevel 3:  ref = max(fourBetRefBB × bb, fourBetRefMult × playerBet)
               flatCallFreq5 × pen (same shape)
```

`playerBet` is the bot's own open or 3-bet; when it has nothing in the pot
(cold spots, the escalation test harness) the bb-denominated reference
applies, so 7.5bb 3-bets and 20bb 4-bets are unpenalized and the
escalation suites are unaffected.

Targets: facing a 3-bet after a BTN open, continue rate strictly decreasing
from 9bb to 60bb; a 50bb 3-bet (≥ 45% of stack) gets the jam-like
premium-only defense; the composite premium 3-bet cells at 25 and 50bb
are ≤ +10 (aim: no more than +3bb per premium hand over the baseline).

## 5. Big-blind defense vs small opens (`decidePreflopAction`, raiseLevel 1)

Config: `strategy.preflop.bbDefenseBoost: 2.4`, `bbDefenseFullBB: 3`,
`bbDefenseFadeBB: 6`. For the BB only (OOP flat branch):

```
mult = openSizeBB ≤ 3 ? boost : openSizeBB ≥ 6 ? 1 : 1 + (boost − 1) × (6 − openSizeBB) / 3
flatCallFreq × mult
```

Targets: BB defends 22–30% vs a 2.5bb open (Sam ≈ 25%, Jilly ≈ 32%),
still 34% vs a min-raise, ≤ 12% vs 8bb; observed VPIP in the persona
alignment suites moves < 3 points.

## 6. Composite probe and gate

- `scripts/exploit-probe.ts`: the hand loop moves into an exported
  `runTable(heroes, opts)`; `runStrategy` keeps its signature and output.
  `ProbeCtx` gains `numActivePlayers`, `preflopCallers`, `toActBehind`
  (`round.needsToAct.size − 1`), `streetHistory`, `bb`, per-hand `mem`, and
  an optional `base: BotAction` computed from a baseline `BotProfile` only
  when the caller asks for one — pure strategies consume the random stream
  exactly as today, so every recorded probe number is byte-identical
  (verified by re-running `yarn probe all 10000 20260712` before any bot
  change).
- `scripts/composite-probe.ts` (`yarn probe:composite [strategy|all] [hands]
  [seeds,comma] [depthBB]`): baseline = Solid Sam; strategies `base`,
  `river-33`, `river-50`, `river-66`, `river-100`, `river-call-tp`,
  `turn-river-33`, `prem3bet-25-fj`, `prem3bet-50-fj`, `wide5-3bet-50-fj`,
  `open-any-late`, `pf-exploit` (for 24bb). Prints bb/100 per seed, mean,
  Δ vs base, override count, tagged per-hand EV, river-bet fold rate.
- `tests/composite-probe.test.ts`: seeded cells, 2 seeds × 20,000 hands,
  Δ vs base < +10 bb/100: `river-33`, `river-50`, `prem3bet-25-fj`,
  `prem3bet-50-fj` at 100bb; `pf-exploit` at 24bb. Plus a determinism
  test (same seed → identical result).
- `tests/exploit-probe.test.ts`: the depth list becomes `[100, 25, 20]`.

## 7. Bounded batch

- **Links** — `app/pages/index.vue` footer href and all 20 CHANGELOG link
  definitions: host `cschweda/holdem-simulator` → `cschweda/metaincognita-holdem`;
  `"repository": "github:cschweda/metaincognita-holdem"` in `package.json`;
  link definitions added for every tagged version that lacks one
  (`git tag --sort=v:refname`), none invented for untagged ones.
  `tests/links.test.ts` pins: no `holdem-simulator` GitHub URL anywhere in
  README / CHANGELOG / app, and every `## [x.y.z]` heading with a tag has a definition.
- **README line 16** — the Tauri sentence is removed.
- **CHANGELOG 0.20.0** — four stale statements corrected in place: Round 6
  carry-overs are closed; Round 7 findings are fixed and the iconify origin
  stays; the table-reads roadmap sentence is dropped; one test count
  (983 / 43) and one probe battery size (nine strategies, two depths).
- **Preset switch** — `applyPreset` also copies `donkBetFreq`, `limpFreq`,
  `styleBias`, `betSizeMult`, `overbetFreq` (explicitly `undefined` when the
  preset lacks them). The mapping moves into a pure
  `botConfigFromPreset(preset)` in `app/utils/botConfig.ts`, used by both
  `generateDefaultBots` and `applyPreset`, with a unit test.
- **Hero record** — the log parsing in `index.vue` `endHand` moves to a pure
  `parseHeroHandRecord(log, heroName)` in `app/utils/heroRecord.ts`, matching
  `${name} ` at line start; the bot tilt `participated` check uses the same
  matcher; the setup screen falls back to `config.betting.defaultHeroName`
  when the name is blank. Unit-tested, including a hero named "Sam" at a
  table with "Solid Sam".

## 8. Verification, docs, order of work

Order: 7 (bounded batch) → 6 (probe refactor + composite script, byte-identical
check) → 1 → 2 → 3 → 4 → 5 (each with its tests and probe numbers) → gate
cells → docs. After every bot change: `yarn test`, `yarn typecheck`,
`yarn probe all 10000 20260712` at 100 / 25 / 20 / 15bb, and
`yarn probe:composite all 30000 20260712,999,7,4242`.

Docs: README "Preflop Decision Flow" / "Postflop Decision Flow" / "Exploit
Probe" sections and the persona table, a Round 8 entry at the top of the
Security audit log (findings above, each marked Fixed with post-fix numbers),
CHANGELOG Unreleased, and the two memory files.

### Success criteria

- Standard battery: every strategy < +10 bb/100 at 100, 25, 20 and 15bb;
  `open-jam`, `3bet-jam`, `overbet-spam`, `minraise-spam`, `station`,
  `donk-33`, `fit-or-fold` each below −100 at every depth.
- Composite battery (4 seeds × 30k): every cell ≤ +10, `river-33` and
  `river-50` ≤ +5, `pf-exploit` at 24bb ≤ +5, premium 3-bet cells ≤ +5.
- Static sweep targets in sections 1–5 met.
- Full suite and typecheck green; persona alignment bands unchanged.
- No probe number for a pure strategy changes across the refactor commit.

## Out of scope

Flop and turn facing-a-bet logic; fictional personas' designed leaks (they
live in their stats, not in the shared branches); per-opponent reads; the
analysis panel; CI `paths-ignore` for docs-only pushes (noted, not done).
