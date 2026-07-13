# Nemesis Bots — Design

**Date:** 2026-07-12
**Status:** Approved
**Mission context:** Second pillar of the Poker Academy fun layer (Vexbot
spirit): bots remember and exploit the hero's leaks across sessions. Builds
on the existing in-session hero adaptation (`heroProfile` store +
`applyHeroAdaptation`) and the career ladder, which gives the hunt a frame.
Pillar 3 (coaching) will read the same model this pillar builds.

## Shape (approved choices)

- **Shared model + familiarity:** ONE persistent hero model (the "book" on
  the hero), plus a per-persona familiarity ledger — each bot's exploitation
  strength scales with how many hands *it* has personally played against you.
- **Full scouting report:** the bot profile modal shows what a bot knows
  ("What they know about you") — familiarity tier, exposed leaks, and the
  countermeasure. Knowing the read is the lesson.

## The model (`app/utils/heroModel.ts`, pure)

Decay-weighted aggregates of the same signals the session window tracks.
Every statistic is a pair of exponentially decayed sums (numerator /
denominator), so storage is O(1) no matter how many hands are played:

```ts
interface DecayedRate { num: number; den: number }   // rate = num/den
export interface PersistentHeroModel {
  version: 1
  effectiveHands: number            // decayed total sample size
  vpip: DecayedRate                 // entered pot / hands
  foldTo3Bet: DecayedRate           // folded to 3-bet / faced 3-bet
  foldToCbet: DecayedRate           // folded to c-bet / faced c-bet
  aggression: { raises: number; calls: number }      // decayed sums
  sizing: { strongSum: number; strongN: number; weakSum: number; weakN: number }
  familiarity: Record<string, number>                // persona name → decayed hands faced
}
```

- **Decay:** per recorded hand, every sum is multiplied by
  `λ = 2^(-1 / halfLifeHands)` before the new observation is added
  (`halfLifeHands: 500`). Old reads fade as the hero's game changes.
- **Update path:** the model learns from the SAME call sites that feed the
  session window — `recordHand(HeroHandRecord, opponents: string[])` (also
  bumps each seated persona's familiarity) and
  `recordShowdownSizing(avgSizing, wasStrong)`. Incremental; no session-end
  batching, no dependence on the session window's retention.
- **Learning is always on** (quick-play included): there is one book on the
  hero. The nemesis toggle (below) controls *exploitation*, never learning.
- Pure API: `emptyModel()`, `decayAndRecord(model, record, opponents, cfg)`,
  `recordSizing(model, avgSizing, wasStrong, cfg)`,
  `modelToHeroProfile(model): HeroProfile | null` (null below
  `minHandsForReads`), `familiarityOf(model, name, cfg): number` (0..1),
  `describeReads(model, cfg): string[]`.

## Blend and scaling (decision time)

- `blendProfiles(session: HeroProfile | undefined, book: HeroProfile | null, sessionHands, bookEffectiveHands, cfg): HeroProfile | undefined`
  — weighted mean per field. Weights: `wS = sessionHands` (the sharp live
  read, window-capped at 10) and
  `wP = min(bookEffectiveHands / cfg.blendDiv, cfg.blendCap)`
  (`blendDiv: 10`, `blendCap: 20`) — early in a session the book dominates;
  as the live window fills it pulls toward the present. Returns undefined if
  neither horizon has enough data (existing gate: session ≥ windowSize OR
  book ≥ minHandsForReads).
- **Familiarity curve:** `fam(h) = min(1, ln(1 + h/famDivisor) / ln(1 + famFull/famDivisor))`
  with `famDivisor: 30`, `famFull: 300` — ~0 for strangers, ≈0.6 at 100
  hands, saturates at 300.
- `applyNemesisAdaptation(base: BotProfile, eff: HeroProfile, fam: number): BotProfile`
  — computes `full = applyHeroAdaptation(base, eff)` (existing function and
  clamps, unchanged) and lerps every numeric field: `base + (full − base) × fam`.
  A stranger plays you straight; a 300-hand regular plays the full exploit.
  Existing caps bound the exploit exactly as today, so the exploit-probe
  balance is structurally untouched (the probe never constructs heroProfile).

## Storage (`app/stores/nemesis.ts`)

Pinia store, career-store pattern: key `holdem-nemesis-v1`, versioned schema,
try/catch guarded writes, `storageWarning` flag. Actions: `record(...)`,
`recordSizing(...)`, `reset()` (clears model + ledger — the "Reset what bots
know" action). Getters: `bookProfile` (via `modelToHeroProfile`),
`reads` (via `describeReads`), `familiarityFor(name)`.

## Integration (`app/pages/index.vue`)

- The `makeBotDecision` callback currently builds `heroProfile` from the
  session store when `handsTracked >= windowSize`. New path (one function):
  build `session` (as today) and `book` (from nemesis store), blend, and per
  bot apply `applyNemesisAdaptation(profile, blended, familiarityOf(botName))`
  — but ONLY when nemesis exploitation is enabled for this game:
  - **Career sessions: always enabled.**
  - **Quick-play:** `GameSettings` gains `nemesisEnabled: boolean`
    (SetupScreen toggle, default **off** — practice stays neutral). When off,
    behavior is exactly today's: session-window-only adaptation.
- Recording: the existing `recordHeroAction` / `finalizeHandSizing` call
  sites additionally call the nemesis store (with the seated persona names
  for familiarity). Learning happens in every mode.

## Scouting report (BotProfileModal)

New panel "What they know about you" for pro/fictional bots alike:

- Familiarity tier from `fam`: Stranger (<0.1) / Noticing (<0.4) /
  Regular (<0.8) / **Nemesis** (≥0.8), with decayed hands faced.
- The reads list (`describeReads`): only when the book has
  `effectiveHands ≥ minHandsForReads (30)`; each read pairs the leak with
  the countermeasure, e.g. "Folds to 3-bets 68% → 3-betting you wider",
  "Calls c-bets too often → bluffing you less, value-betting thinner",
  "Bet-sizing tell: big with value → reading your big bets as strength."
- Read strings trigger on the SAME thresholds `applyHeroAdaptation` acts on
  (e.g. fold-to-3bet > 0.60, VPIP > 0.40, sizing tell present) — the panel
  never claims an exploit the engine isn't actually applying.
- Reads shown are the GLOBAL book; the tier line makes clear how much THIS
  bot acts on it. Below the panel: "Reset what bots know" (confirm dialog →
  `nemesisStore.reset()`).

## Config (`holdem.config.ts`)

```ts
nemesis: {
  halfLifeHands: 500,
  minHandsForReads: 30,
  famDivisor: 30,
  famFull: 300,
  blendDiv: 10,
  blendCap: 20,
}
```

## Edge cases

- **Storage unavailable:** model lives in memory for the session, warning
  flag set; gameplay never breaks.
- **Unknown persona names** in the ledger (renamed/removed personas): ignored
  at read time, dropped on next save.
- **Divide-by-zero:** every rate reads `den > 0 ? num/den : fallback`
  (fallbacks match HeroProfile semantics: 0).
- **Custom-tweaked bots in quick-play:** familiarity keys on the persona
  `name`; a customized "Naniel Degreanu" still counts as him.
- **Model reset** does not touch career state or session stats.

## Out of scope

Per-persona stat windows (familiarity is the per-persona dimension), the
coaching page/report card (pillar 3 — will consume `describeReads`),
bot-vs-bot modeling, new adaptation mechanics beyond scaling the existing
`applyHeroAdaptation` (no new exploit types this round).

## Success criteria

- `heroModel.ts` unit-tested: decay math (half-life actually halves weight
  after `halfLifeHands`), rate updates, familiarity curve endpoints, blend
  weighting, nemesis lerp (fam 0 → base, fam 1 → full adaptation, monotone
  between), `describeReads` thresholds.
- Probe untouched: no nemesis import in `scripts/exploit-probe.ts` (test-
  asserted grep or import check); seeded probe numbers byte-identical.
- Live verification: play sessions vs the same lineup, watch familiarity
  climb and reads appear in the modal; quick-play with toggle off behaves
  exactly as before.
- `yarn test` + `yarn typecheck` green; suite remains deterministic.
