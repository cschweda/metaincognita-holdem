# Pro Bot Realism — Design

**Date:** 2026-06-10
**Status:** Approved (analysis + recommendations approved in session; this doc records the design)

## Problem

Four 3,000-hand, 8-player, pros-only simulations show the emergent game is far from real poker, and several persona identities are distorted or inverted:

| Metric | Observed | Real-world reference |
|---|---|---|
| 3-bet pots | 34–37% | ~8–12% |
| Hands with an all-in | 17.5–19% | ~3–5% (100bb cash) |
| Hands reaching showdown | 40% | ~15–20% |
| Avg pot at $1/$2 | $379 (190bb) | ~$40–80 |
| Bust-outs per bot / 3k hands | 25–67 | a few |
| Observed VPIP vs config | −3 to −5pp (all bots) | should match |
| Phellmuth / Matusow | permanently tilted, play above config | tilt should be episodic |

Root causes (analysis in session, 2026-06-10): tilt counts folded hands as losses; preflop calls ignore raise size; top pair never folds flop/turn; `idx/169` percentile ignores combo weighting; 3-bet/4-bet configs ~2× real frequencies; all personas share one range shape; several advertised features are dead code.

## Goals

1. Game texture lands in realistic bands (acceptance criteria below).
2. Each pro's observed stats match their configured profile, and configured profiles match the real player's documented style.
3. No dead/advertised-but-inert features: wire or remove.
4. Existing test suite passes (with intentional, documented updates where semantics change).

Non-goals: GTO solver accuracy; changing the fictional bots' deliberate teaching leaks; UI redesign.

## Fixes

### F1 — Tilt triggers only on played hands
`updateTilt()` gains a `participated` param (default `true`, preserving existing direct-call test semantics). Call sites (`index.vue`, `scripts/simulate.ts`, `app/utils/simulateBrowser.ts`) pass `participated = bot voluntarily invested chips this hand OR reached showdown`. Not-participated → no change to `consecutiveLosses` (folding 72o preflop neither tilts nor calms). Wins still reset.

### F2 — Raise-size-aware preflop defense
In `decidePreflopAction` facing-a-raise paths, scale flat-call and bluff-3-bet thresholds by a continuous size penalty (`(3 / openSizeBB)^~0.85`, clamped ≤ 1) and treat jam-like raises (`toCall ≥ 60% of stack` or `≥ 15bb`) specially: continue only with a premium band (~top 4–5% combo-weighted, ≈ TT+/AQs+/AK) and no bluff re-raises. Exact constants tuned against simulation acceptance criteria.

### F3 — Made-hand bet-size sensitivity postflop
Non-monster made hands (strength 0.30–0.55) facing bets > ~0.7× pot on flop/turn fold with probability rising with bet size and falling with strength (top pair folds to overbet shoves most of the time, calls normal bets as today). River rule stays. Monsters unaffected.

### F4 — Combo-weighted hand percentile
`ranges.ts` exports a precomputed cumulative combo-mass percentile per hand class (pair = 6, suited = 4, offsuit = 12 of 1,326). `botDecision.ts` uses it everywhere `idx/169` is used today, including the short-stack push/fold path (replacing the Chen-percentile detour). Position shift and jitter unchanged.

### F5 — Retune pro escalation frequencies and persona stats
Pros' `threeBetFreq` scaled to ~4–9% (live-pro band; aggressive outliers like Dwan/Selbst ~10–12%), `fourBetFreq` proportionally. Persona reshapes per the approved scorecard, notably: Phellmuth 18/11, 3-bet 4%, lower aggression, high limp frequency; Ivey aggression ~1.45; Dwan 32/26 with overbets; Selbst 28/22; Brunson aggression ~1.4; Tilly tiltMultiplier ~1.3. Fictional bots and presets keep their teaching-caricature identities (only indefensible escalation numbers trimmed).

### F6 — Per-persona range shape + limp model
- New optional persona/`BotProfile` field `styleBias`: small percentile bonuses/penalties per hand category (suited connectors, big cards, pairs, suited aces), magnitude ≤ ~0.08, default none. Wired into the percentile computation; gives Negreanu suited connectors, Hellmuth big-card bias, etc.
- New optional field `limpFreq` (default 0): probability of open-limping (instead of folding) a hand in the PFR–VPIP band when first in / over limpers. Pros default 0 (raise-or-fold first-in); Hellmuth and loose-passive personas get meaningful values. BB/SB defense logic unchanged.

### F7 — Sizing personality and overbets
- Wire `config.botSizing` as the engine's sizing source (position-based open sizes; value/bluff pot fractions).
- New optional persona fields `betSizeMult` (default 1.0; Negreanu small-ball < 1, Dwan > 1) and `overbetFreq` (default ~0.03): river (and occasional turn) overbets 1.2–1.5× pot for monsters and, for overbettors, bluffs.

### F8 — Wire or remove dead features; honest instrumentation
- **Wire** hero `faced3Bet`/`foldedTo3Bet`/`facedCbet`/`foldedToCbet` tracking in `index.vue` (currently hardcoded `false`), from the hand action log.
- **Wire** `betSizingTell`: hero bet sizings recorded during play; at hero showdowns, classify strong/weak and aggregate into the tell after 8+ showdowns (as README describes). Stored in `heroProfile` store.
- **Remove** unused config blocks `botRanges`, `botEscalation`, `botEquityThresholds` (engine has its own numbers; `ranges.ts` has its own display data). `botSizing` becomes used (F7). Touch up README lines these changes falsify.
- `simulateBotStats()` deals real cards so unit tests exercise the card-aware path; test tolerances re-baselined.
- `scripts/simulate.ts` gains per-bot WTSD, W$SD, per-opportunity 3-bet%, fold-to-3-bet; the misleading `AF (cfg)` column relabeled to show the aggression knob distinctly.

## Acceptance criteria

Run 3,000-hand, 8-player, pros-only sims (≥2 runs) after all fixes:

- 3-bet pots: **6–14%** of hands
- All-in hands: **≤ 6%**
- Hands seeing a flop: **35–55%**
- Showdown rate: **12–25%** of dealt hands
- Rebuys: **< 8 per bot** per 3k hands (no bot > 12)
- Observed VPIP within **±3pp** of config for non-tilt-prone pros; PFR within **±4pp**
- Phellmuth observed VPIP in **16–24%** (episodic tilt, not permanent)
- Per-opportunity 3-bet% per pro within **±3pp** of configured `threeBetFreq`
- `yarn test` passes; intentional test updates documented in commit messages

## Testing approach

TDD per fix: failing unit test first (new tests in existing `tests/phase4-*` files or a new `tests/realism-fixes.test.ts`), then implementation, then sim-calibration loop for the tuned constants. Final validation = acceptance sims + full suite.

## Decisions made (defaults, can be revisited)

- Fictional bots/presets keep extreme values by design; only pros are retuned to realism.
- First-in behavior for `limpFreq = 0` personas is raise-or-fold (modern standard); VPIP accounting then relies on calls vs raises and blind defense — verified against config via sims.
- Unused config blocks are removed rather than wired (less speculative surface); README updated minimally.
- Work happens directly on `main` (matches repo workflow), one commit per logical fix, no AI co-author trailers.
