# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **The hub exit — a way back to the floor.** A gold **METAINCOGNITA** wordmark now sits at the far left of the top status bar on every route, linking to [metaincognita.com](https://metaincognita.com) — the floor where all nine Metaincognita games live. Until now the hub linked out to every game and not one of them linked home; a player deep in a session had no way back but the browser's back button. It is a real `<a href>`, opens in the **same tab** (an exit, not a side trip), is never hidden or gated, and **never confirms** — it destroys nothing, and the point is that you can always leave. Suite chrome, per METAINCOGNITA-GUIDELINES v1.2 §5.
- **Nemesis bots** — cross-session opponent modeling (the Vexbot homage): a persistent decay-weighted book on the hero (O(1) storage, 500-hand half-life) blends with the live session read, and each persona scales the existing hero-adaptation exploit by its own familiarity with you (log curve, full strength at ~300 hands faced; the bet-sizing tell needs Regular familiarity). Scouting report in the bot profile modal shows the reads and familiarity tier; career sessions always exploit, quick-play gets a default-off "Bots Remember You" toggle; learning is always on with a one-click reset. The exploit probe is structurally untouched (purity test added). foldToCbet is tracked for the coaching pillar but gets no read line — the engine has no c-bet counter-exploit, and the panel never claims an exploit the engine isn't applying.
- **Career mode** (`/career`) — persistent-bankroll ladder over the six stake tiers with per-tier persona rosters (fish at Micro → elite at Nosebleed), real bankroll-management movement rules (10-buy-in/100-hand promotion, 2-buy-in demotion floor, bust archives the run to a hall of fame), retire-to-archive, and session settlement wired into the existing live table (leave/felted/timeout). Pure rules module (`careerRules.ts`, boundary-tested) + Pinia store with guarded localStorage persistence + dashboard; quick-play unchanged. Live testing during the build caught and fixed a pacing flaw: a one-buy-in starting bankroll made any losing first session a career bust — starts at $150 (3 Micro buy-ins).
- **One betting engine** (`app/utils/bettingEngine.ts`) — minimum-raise enforcement, the half-raise/reopen rule, and skip-guard termination now live in a single framework-free module consumed by the live game, the browser simulator, the CLI simulator, and the exploit probe. Before this, only the live engine enforced min-raises: the sims accepted illegal raise sizes and two of them still used the `count*4` lap cap the live engine had already replaced — so persona validation and the CI difficulty gate were measuring bots under different rules than the game you actually play. Contract tests in `tests/betting-engine.test.ts` (a 20-raise war terminates only when action closes; short all-ins don't reopen; sub-min raises clamp up).
- **Seedable RNG** (`app/utils/rng.ts`, mulberry32) — threaded through dealing, all 63 randomness sites in bot decisions, tilt, the Monte Carlo analysis loops, and both simulators. `yarn probe all 6000 <seed>` and `simulate.ts --seed=N` reproduce byte-identically; the CI exploit-probe gate is seeded per strategy (it was a statistical pass/fail over unseeded randomness — flaky by construction, and failures could never be reproduced locally).
- **Typecheck** — root `tsconfig.json` + `yarn typecheck` (vue-tsc). The codebase had no tsconfig, so nothing had ever type-checked; 471 initial errors triaged (index-access strictness deferred via `noUncheckedIndexedAccess: false`, all 23 genuine errors fixed — including a dead river branch in the OOP donk logic and a tilt-config tuple mismatch).
- **Typed personas** — `Persona` interface exported from `botDecision.ts`; the config personas array is annotated (`satisfies Persona[] as Persona[]`), killing every `(p as any)` persona read across the sims, probe, and setup UI. Field-name typos in `holdem.config.ts` now fail typecheck instead of silently reading as `undefined`.
- **`config.strategy` block** — the position-shift table, jam-defense factors, 3-bet size-penalty exponents, postflop strength cutoffs, and c-bet/turn-barrel base rates lifted verbatim from `botDecision.ts` branch logic into `holdem.config.ts`. This is the prerequisite for the roadmap difficulty slider. Seeded probe battery byte-identical before/after the move.
- **MC benchmark** (`scripts/bench-mc.ts`) — before/after harness for the analysis hot loops.
- **CI engine-leak gate** (`tests/exploit-probe.test.ts` + `.github/workflows/ci.yml`) — the exploit probe now runs as a regression test on every push/PR: each degenerate hero strategy must stay below +10 bb/100. The gate immediately caught a real leak the old probe's noise had hidden (see Fixed).
- **Bitmask hand evaluator** (`handAnalysis.ts`) — `eval7`/`rank7`/`handCategory7` compute hand category and tiebreaks from rank/suit bitmasks with no 21-combo enumeration; equity estimation, hand-probability simulation, and side-pot resolution use them in hot loops. The brute-force evaluator survives as `bestHandOracle`, with an equivalence suite (`tests/bitmask-evaluator.test.ts`) proving identical rank/score/name/ordering over 100k+ random hands.

### Fixed
- **Browser-sim clairvoyance** (`simulateBrowser.ts`) — `/analysis` bots received the full 5-card runout in their flop/turn decision contexts (the CLI sim and probe correctly sliced by street), so browser-sim stats were computed from bots that could see the future. Community cards are now street-sliced identically in all paths.
- **Split-pot odd chip** (`sidePots.ts`) — remainders always went to the lowest player id, deterministically favoring low seats over a session; now awarded to the first tied player clockwise from the button (standard rule). All five callers pass their dealer seat.
- **PokerStars export dropped fractional amounts** (`pokerStarsExport.ts`) — the action regexes were integer-only, so `raises to $12.5` at Micro/Low/High stakes silently vanished from exported histories while the parser accepted decimals. Amounts now format PokerStars-style (whole bare, cents two-decimal).
- **Sort-by-3-bet NaN** (`bots.vue`) — sorting personas by `threeBetFreq` compared `undefined` for personas without the field, producing NaN comparisons and unstable order.
- **Nit-value leak: reraise-jam defense floor now decays with jam size** (`botDecision.ts`) — the v0.18.1 floor that keeps the table wide vs any-two reraise-jam-spam was flat (0.85), so bots called even 100bb 3-bet jams with top ~3.4% hands (TT/AQs) — paying off a hero who jams only QQ+/AK. The floor now gets full weight vs jams ≤40bb and decays as `sqrt(40/jamBB)`: ~top 2% (QQ+/AK) vs a 100bb reraise-jam, ~KK+ at several hundred bb. Probe: nit-value **+64 → −14 bb/100** while 3bet-jam any-two stays ruinous (−314 bb/100).
- **Exploit-probe harness: stacks pin to exactly 100bb every hand** (`scripts/exploit-probe.ts`) — the old refill-only-below-40bb rule let winners' stacks balloon past 1,000bb, so a few monster coolers dominated the metric (±100 bb/100 swings run-to-run, the "±38 noise" was really much worse). Constant depth makes every hand an i.i.d. sample and the CI gate stable (~±3 bb/100 at 10k hands).
- **`yarn probe` silently did nothing** — the CLI guard checked `process.argv[1]` for the script name, which vite-node consumes; keyed off `process.env.VITEST` instead.
- **River thin value** (`botDecision.ts`) — strong one-pair hands (top pair / overpair) now bet ~⅓ pot on the river at a passivity/position/multiway-aware frequency instead of always check-calling, so bluff-catching is no longer free against the bots.
- **No-fold-the-nuts brain fart** (`botDecision.ts`) — the consistency misplay can no longer randomly fold a strong made hand (two pair+); misplays are wrong folds of marginal hands, loose calls, and mis-sized stabs, not punted monsters.
- **Paired-board nut awareness** (`botDecision.ts`) — made flushes/straights are discounted on paired (0.82×) and trips/double-paired (0.62×) boards where a full house is live, so bots stop stacking off non-nut flushes into boats.
- **Betting-round orbit guard** — the round now ends only when a full lap finds nobody able to act, replacing a fixed iteration cap that could truncate a legitimate multi-raise multiway pot mid-action (engine + probe harness).
- **Unbiased lineup shuffle** — bot lineup selection used `sort(() => Math.random() - 0.5)`; replaced with a Fisher-Yates util (`shuffle.ts`). Card decks were already correct.

### Changed
- **Table-flow gate unified** — one `getTableDynamics` (config-driven `minHands`) replaces three drifted copies (live 10, browser sim 5, CLI config); the browser sim now waits the same 10 hands before heater/cold adjustments as the live game.
- **Escalation counting unified to live semantics** — the sims/probe now bump the preflop raise level on any applied raise (as the live engine always has), instead of gating on `raiseTotal > currentBet`.
- **analyzeHand runs one Monte Carlo pass** — equity and hand-improvement probabilities come from the same 1,000 seeded runouts (was two independent 1,000 + 800-iteration simulations); improvement probabilities now sample 1,000 runouts postflop.

### Performance
- **`analyzeHand` ~1.7x faster** (32ms → ~19ms per 20 flop calls) from the merged runout pass; the shared loop builds the deck once, partial-shuffles only the drawn prefix, and reuses one 7-card buffer into `rank7`. `estimateEquity` alone gains only ~10% — the loop is eval-bound (~0.25µs per `rank7`), so further gains require a faster evaluator, not loop surgery.
- **O(1) preflop hand index** — `handRankIndex` uses a precomputed Map instead of an O(169) `indexOf` that ran several times per preflop decision; the full test suite dropped from ~114s to ~80s, dominated by the N=500k escalation sims.
- **One draw scan per postflop decision** — `decidePostflopAction` shares its `detectDraws` result with `postflopHandStrength` (the same 7 cards were scanned twice).

### Security
- **Red/blue audit — Round 5 (Engine integrity).** Full findings in the README Security audit log: the rules-divergence, clairvoyance, and probe-flakiness fixes above, plus the post-unification probe battery (all six degenerate strategies lose; nit-value remains the knife-edge in the noise band around zero, −18.0 / +2.4 bb/100 across two seeds).

### Documentation
- README: test counts refreshed (836 tests / 27 files), Security audit log Round 5 added.
- README: exploit-probe section rewritten — corrected run command (`yarn probe all 10000`), fresh fixed-depth results for all six strategies, and a post-mortem of the nit-value leak replacing the old "+64 bb/100 is fine, as in real life" rationalization.

## [0.19.0] - 2026-06-24

### Added
- **Desktop app (Tauri 2)** — the simulator now builds as a native desktop app for macOS, Windows, and Linux. Same Nuxt SPA, packaged into the OS WebView via a minimal Rust core (no custom IPC commands, `core:default` capability only). `yarn tauri dev` opens a hot-reloading native window; `yarn tauri build` produces a local installer. See the new README "Desktop App (Tauri)" section.
- **CI release pipeline** (`.github/workflows/desktop-build.yml`) — builds macOS (universal), Windows, and Linux installers on a version-tag push (`v*`) or manual dispatch, and attaches them to a draft GitHub Release.
- **Offline icon bundling** — `nuxt.config.ts` `icon.clientBundle` embeds used icons into the client JS, so the static/desktop build renders fully offline with no runtime fetch to `api.iconify.design`.

### Security
- **Red/blue audit — Round 4 (Desktop & CI hardening).** Full findings live in the README "Security" section (now a collapsible audit log). Highlights:
  - **Tauri WebView CSP** — the desktop build shipped with `"csp": null`; added a restrictive CSP to `tauri.conf.json` (mirrors the web policy, `connect-src 'self'` since the desktop app is fully offline, plus `object-src 'none'` / `base-uri 'self'`).
  - **CI least privilege** — added a top-level `permissions: contents: read` to the release workflow; the build job opts up to `contents: write` only to create the Release.
  - **CI supply chain** — pinned every GitHub Action in the release workflow to a full commit SHA (was floating tags like `@v4` / `@v0`); `dtolnay/rust-toolchain` gets an explicit `toolchain: stable` input.
  - Confirmed safe: no XSS sinks anywhere (no `v-html` / `innerHTML` / `eval`), minimal Tauri IPC surface, no untrusted-input → shell flows in CI, and `route.query.hand` rendered through Vue escaping.

### Documentation
- README: new "Desktop App (Tauri)" section (prerequisites, `tauri dev` / `tauri build`, CI pipeline, config files); Security section restructured into a collapsible red/blue audit log (current round expanded, older rounds in `<details>`); Architecture updated for the dual web + desktop targets; Tech Stack, Project Structure tree, and table of contents brought current.
- README: new "How the Bot Intelligence Works" section — plain-language explainer of where the pro stats come from (authored from live-poker stat bands, validated by simulation), how a stat becomes a decision (percentile thresholds + `Math.random()` frequency rolls, with a worked example), and an explicit "no AI, no cloud, no network — all local deterministic algorithms" statement.
- README: table of contents expanded with nested sub-navigation for the large sections (bot intelligence, bot behavior, simulation, desktop, security) and reordered to match the document; fixed a duplicate-anchor collision where the Desktop App's "Configuration" subsection shadowed the main Configuration section (renamed to "Configuration Files").

## [0.18.1] - 2026-06-10

### Added
- **Exploit probe** (`scripts/exploit-probe.ts`) — adversarial validation: a scripted hero plays one degenerate strategy per run (open-jam any two, 3-bet-jam, overbet-spam, min-raise spam, station, nit-value) against a fixed pro lineup and reports hero EV in bb/100. Five of six strategies lose 1,000-2,300 bb/100; nit-value sits at +64 +/- 38 (mildly +EV vs non-adapting opponents, as in real life).

### Fixed
- **Jam-call ranges scale with jam size** — a 20bb shove gets called by ~TT+/AQs+, but a 100bb open-jam now gets called by ~KK+ only (was a flat top-4.5% at any size; a hero jamming only QQ+/AK printed +210 bb/100 off TT/AQ calls). Facing a reraise-jam in a raised pot, defense stays wide enough that any-two jam-spam can't run the table over.
- **Brain-fart misplays respect big bets** — the consistency misplay generator no longer randomly calls bets over 10bb / 30% of stack at meaningful frequency (nobody "accidentally" calls off 100bb with a random hand).

### Documentation
- README brought fully current: preflop/postflop decision-flow sections rewritten for the v0.18 engine (combo-weighted percentiles, limp model, jam defense, board-relative strength, call-down discipline), historical audit sections labeled as pre-overhaul, exploit probe and simulator flags documented.

## [0.18.0] - 2026-06-10

### Removed
- **All Supabase integration** — local-only persistence (localStorage + JSON/CSV/PokerStars export). No accounts, no cloud, no serverless functions; static Netlify deploy with zero external connections (CSP narrowed to iconify). The auth UI, anonymous sessions, auto-sync, and sendBeacon paths are gone.
- **Documentation-only bot config blocks** (`botRanges`, `botEscalation`, `botEquityThresholds`, `botSizing`) — nothing consumed them; the engine owns its tuned constants.

### Fixed (bot realism overhaul — engine)
- **Combo-weighted hand percentile** — `idx/169` treated all hand classes as equally likely (pairs are 6 combos, suited 4, offsuit 12), so every bot played 3-8pp tighter than configured. VPIP now lands within ~2pp of config. Also restored two missing hands (`94s`/`94o`) — the "169-hand list" had 167.
- **Tilt only on played hands** — folding preflop no longer counts as a "loss". Phellmuth (threshold 1) was permanently tilted and played 24/17 maniac instead of his configured profile; tilt is now episodic, as intended.
- **Board-relative hand strength** — "two pair" using a board pair, board trips, and played-the-board rivers were scored as monsters, producing constant raise wars between one-pair hands (20% of hands went all-in; average pot 190bb). Now scored as the marginal hands they are. All-ins: ~6%; average pot ~55-60bb.
- **Raise-size-aware preflop defense** — calls scale with raise size; jam-like raises get premium-only continues (TT+/AQs+/AK) instead of 20%-of-hands calls.
- **Bet-size sensitivity postflop** — top-pair-class hands fold to overbets at realistic rates and respect sustained turn/river pressure (passives call down more); multiway flop bets get more respect; MDF defense splits across multiway defenders instead of applying heads-up math.
- **SPR auto-commit restricted to flop/turn** — no more one-pair river jams.
- **Misplays softened** — the consistency "brain fart" now produces wrong folds/loose calls/mis-sized stabs, not random raise wars.

### Changed (personas)
- **Pro stats retuned to live full-ring realism** — 3-bet/4-bet frequencies now 2-9% per opportunity (verified per-opportunity in the sim); Phellmuth reshaped to his real identity (18/11, limpy "white magic", big-card bias, episodic mega-tilt); Ivey/Brunson aggression raised; Dwan 32/26 with 1.2x sizing and 18% river overbets; Negreanu small-ball sizing with suited-connector bias; Selbst suited-ace 3-bet bias; Tilly/Ungar tilt sensitivity up.
- **New persona fields** — `limpFreq` (open-limp the PFR-VPIP gap), `styleBias` (per-category range shapes), `betSizeMult`, `overbetFreq`. Fictional teaching bots keep their deliberate leaks and now limp explicitly.

### Added
- **Hero adaptation fully wired** — fold-to-3-bet and fold-to-c-bet are now derived from the real action log (previously hardcoded false, so bots never exploited them), and the bet-sizing tell is live: bots classify your showdown sizings after 8+ revealed hands and adjust calls/folds to your pattern.
- **Grounded commentary** — Mon's tilt reads fire only on real TiltState (with severity-aware phrasing), new-hand callouts announce genuine tilt episodes and heaters from the actual last-10-winners window, and all-in analysis computes real pot/call equity instead of canned lines.
- **Sim instrumentation** — per-bot WTSD, W$SD, per-opportunity 3-bet%, fold-to-3-bet vs config; cash-game top-ups below 40bb; `--players=` flag pins an exact lineup for repeatable comparison runs; WTSD denominator fixed (previously only counted never-folded players).

### Validation
Three fixed-lineup 3,000-hand 8-max pro runs (same seats as the pre-fix baseline): avg pot $379→~$113, all-in hands 17.5%→~5.8%, 3-bet pots 36.9%→~21%, per-opportunity 3-bet within ~1pp of each persona's config, fold-to-3-bet 60-79%, W$SD 43-54%, run-to-run persona VPIP stable within ±1pp. 796 tests green.

## [0.17.2] - 2026-03-29

### Fixed
- **Mon board analysis matches actual board texture** — Mon's flop commentary now checks the real board (paired, monotone, dry, wet, ace-high, connected, etc.) before speaking. Previously picked random quips from a single pool, causing mismatches like saying "the board just double-paired" on a monotone flop.

### Added
- **All showdown hands in stats panel** — When 3+ players reach showdown, all hands are shown in a flex layout (not just hero vs winner). Winner highlighted green, hero red, others gray.

## [0.17.1] - 2026-03-29

### Removed
- **Fold countdown/cancel** — Pressing F now folds instantly, like real online poker. The 2-second undo window was removed.

## [0.17.0] - 2026-03-29

### Fixed (simulation script)
- **Bots could see future community cards in simulation** — `simulate.ts` passed all 5 community cards to bot decisions regardless of street. On the flop, bots could "see" the turn and river when evaluating hand strength and draws. Now correctly passes only visible cards per street (3 on flop, 4 on turn, 5 on river, none preflop). The live game was not affected — it deals cards incrementally. This fix significantly improves simulation accuracy: avg pots dropped ~40%, showdowns dropped ~20%, all-in hands dropped ~15%, all moving toward realistic NLH distributions.

### Changed
- **Raise-or-fold preflop opens** — Bots now open-raise with their full VPIP range. Limping eliminated, matching modern NLH strategy.
- **Reduced cold-calling vs raises** — OOP cold-call range narrowed from 75% to 60% of VPIP; freed hands moved to 3-bets. Modern 3-bet-or-fold tendency.
- **Increased 3-bet base frequency** — Calculation raised from `pfr × 0.35 × aggression` to `pfr × 0.45 × aggression`. Per-bot 3-bet% now 3-7%.
- **SB 3-bet-or-fold strategy** — Small blind raises 70% of defense range (worst postflop position should rarely flat). BB raises 45% (pot-odds discount).
- **Tilt VPIP cap** — Tilt can only widen VPIP by 50% of base (20% → max 30%). Prevents tilt-prone bots like Hill Phellmuth from becoming unrecognizable (was inflating from 20% to 30%+).
- **Rhip Ceese aggression bump** — Config aggression increased from 1.10 to 1.25. Post-bump AF rose from 1.81 to 2.05 and he became the biggest winner across 5 simulation appearances (+$32K avg). A legendary player isn't just tight — they're selectively aggressive.
- **Position-aware postflop aggression** — All postflop decisions now factor in whether the bot is in position (IP) or out of position (OOP):
  - IP aggression boost (1.25x): c-bets, barrels, bluffs, and value raises all fire more often in position
  - OOP caution factor (0.85x): betting rates reduced when out of position
  - IP probe bets: when checked to in position, bots bet aggressively with full range (85% monsters → bluff-freq air)
  - OOP donk bet reduction: pro bots lead into the raiser less often from OOP (leak correction)
  - IP strong-hand raises doubled (22% × aggression, up from 12%) for value extraction
  - IP semi-bluff raises boosted 75% (draw + fold equity combination)
  - IP floating: call with nothing on the flop more often in position to steal later streets

### Fixed
- **Per-bot 3-bet% tracking** — `threeBetCount` was initialized but never incremented. Now detects 2nd+ preflop raise and attributes it to the correct player.
- **Postflop AF formula** — Aggression Factor now counts bets in addition to raises/all-ins, matching the standard `(bets + raises) / calls` definition.

### Added
- **Mon bot play observations** — 24 new commentary quips where Mon comments on surprising bot plays, board-aware reads, and analytical observations during the hand.

## [0.16.1] - 2026-03-29

### Fixed
- **River draws/outs suppressed everywhere** — Three places incorrectly referenced draws and outs after the river was dealt (no more cards to come):
  - Stats panel recommendation said "9 outs to improve. Check to see a free card" on the river. `recommend()` now zeros out draw outs on the river street.
  - Mon said "Hero has 9 outs to the flush draw" on the river. `onHeroTurn()` now skips `detectDraws()` entirely on the river.
  - Mon said a player was "chasing the flush draw" when calling on the river. `onAction()` call handler now skips draw detection on the river.

### Changed
- **Dedicated Chorman Frequency slider** — New independent slider controls how often Chorman speaks (Nonstop → Every play → Regular → Selective → Rare). Decoupled from the Style slider which now purely controls quips↔strategy. ALL Chorman speech is gated through the frequency check — previously many paths (all-ins, bluffs, hero folds, board texture, showdowns) bypassed it entirely, making Chorman comment after every single play.
- **Chorman Style slider accuracy** — When set high (50%+), Chorman prefers strategic observations first, Mon-banter second, quips only as fallback. When set low, pure quips dominate.
- **Player names in action quips** — Chorman now occasionally names the player when commenting on their play (~35%): "Degreanu there. Another one bites the dust." / "Oh, Hero. Fold. The most underrated play in poker." Only on action-specific quips — generic banter stays impersonal.
- **TV commentary color-coded by speaker** — All Mon lines are blue, all Chorman lines are amber. Previously text color varied by type (green/cyan/amber/gray) regardless of speaker.

### Added (Position-Aware Commentary)
- **Mon fold assessments with position** — `lonFoldAssessment()` generates dynamic, context-aware fold analysis considering hand strength, position, street, and whether facing a raise. Examples: "Degreanu folds Ah Qd from the cutoff facing a raise. Disciplined. Most players can't fold that." / "Pvey folds 7h 2d from under the gun. Easy decision."
- **Chorman reacts to fold assessments** — 15 new `normanFoldReactionQuips`: "Mon's right. That fold makes sense. I would have called, which is why I'm broke and they're not."
- **Position on junk EP opens** — Mon critiques questionable early-position raises: "Opening that hand from under the gun? That's either a read or a mistake." Chorman follows with position-specific quips: "From under the gun with THAT? My ex-wife makes better decisions."
- **Position on premium raises** — Mon includes position label when analyzing strong preflop raises in TV mode.
- **Positions passed to commentary composable** — `useCommentary` now receives position labels via the GS interface from index.vue.

### Added (Commentary Overhaul — Variety & Banter)
Comprehensive assessment found Mon's pools too thin (61 phrases, repeats within a session), Norman's thin pools (4-8 quips each for common triggers), no inter-voice dialogue, and strategic generators too shallow. All fixed:

- **Mon pools doubled** — 61 → 126 static analytical phrases across 6 pools. lonShowdownAnalysis: 6 → 18. lonTiltReads: 8 → 19. lonPotAnalysis: 10 → 20. lonStreetTransition: 10 → 21. lonPlayerReads: 12 → 22. lonBoardAnalysis: 15 → 29. No more repeats within a typical session.
- **Norman thin pools padded & converted to UniquePool** — normanHeadsUpQuips: 4 → 12. normanPotSizeQuips: 6 → 14. normanRiverQuips: 8 → 16. normanDrawQuips: 8 → 16. Board subcategories: scary 3→7, turnScare 4→8, riverComplete 4→8. All converted from plain arrays to UniquePool for no-repeat guarantees.
- **Inter-voice banter (Norman → Mon)** — 25 new quips where Norman reacts to Mon's analysis: "What Mon said. I understood about half of it, but what he said." / "Mon makes it sound so simple. Like poker is just math. It's not just math. It's also crying." Fires ~20% of the time after Mon delivers board analysis.
- **Inter-voice banter (Mon → Norman)** — 20 new quips where Mon briefly reacts to Norman's jokes then pivots back to analysis: "...Anyway. Back to the poker." / "That joke was free and it was overpriced. Meanwhile, the flop favors—" / "My partner, ladies and gentlemen. He'll be here all night. Unfortunately." Fires ~12-15% after Norman's board texture quips.
- **20 new bot/AI awareness quips** — "I tried to shake hands with one of the bots earlier. It didn't end well." / "Bot Phellmuth just tilted. Even in code, that man can't control his emotions." / "These bots run on algorithms. I run on caffeine and regret." Added to deal-time rotation alongside existing self-aware pool.
- **Strategic generators expanded** — `commentaryStrategic.ts` grew from ~16 to ~30 observation templates. New: multi-street narrative ("double barrel — representing real strength"), hero critique ("Hero missed completely — folding to any bet is disciplined"), combo draw awareness ("combo draw with 15 outs is actually a favorite"), card-specific board reads, session-context showdown analysis.
- **Draw quips wired in** — normanDrawQuips pool (16 entries) now fires when hero has a drawing hand on hero's turn. Previously used inline text with only 2 variations.

### Pool inventory after expansion
| Category | Before | After |
|----------|--------|-------|
| Mon static phrases | 61 | 126 |
| Mon strategic generators | ~16 | ~30 |
| Norman action pools | ~140 | ~140 |
| Norman situation pools | ~89 | ~89 |
| Norman thin pools | 26 | 58 |
| Norman board texture | ~51 | ~63 |
| Norman banter/bot-aware | ~38 | 103 |
| Norman persona quips | ~85 | ~85 |
| **Total commentary lines** | **~506** | **~694** |

## [0.16.0] - 2026-03-29

### Fixed (Poker Rules — Engine Audit)
Eight fixes to bring the poker engine from C+ to B+/A- poker accuracy.

- **Min-raise enforcement** — Engine now tracks `lastRaiseIncrement` and enforces legal minimum raises. Previously, the min-raise was always `currentBet + BB` which is wrong after 3-bets and beyond. Now correctly calculates: if someone opens to $6 (BB $2), min 3-bet is $10 (increment $4), not $8. Bot raises below minimum are clamped up; short all-ins are allowed.
- **Half-raise rule** — An incomplete all-in (less than a full raise) no longer reopens action for players who already acted. Standard tournament/cash game rule that was missing entirely. Example: blinds $1/$2, BTN raises to $6, BB goes all-in for $8 (less than min-raise of $10) — BTN does NOT get to re-raise.
- **Hand strength bucket overlap** — Bottom pair (strength 0.30) was being classified as a "draw" instead of a "weak made hand" because the draw bucket (0.20–0.35) overlapped with made-hand values. Now uses explicit `detectDraws()` to identify drawing hands independently from made-hand classification. A flush draw is a draw; bottom pair with no draw is a weak made hand.
- **Preflop equity formula** — Replaced crude linear formula (`30 + chen*5 - opponents*4`) with lookup table calibrated against pokerstove/equilab. Old: AA 6-way = 74%. New: AA 6-way = 49% (correct). Old: 99 6-way = 46%. New: 99 6-way = 22% (correct). Uses interpolation between heads-up, 3-way, and 6-way reference points.
- **Monte Carlo iterations doubled** — Equity estimation increased from 500 to 1,000 iterations for higher accuracy. Reduces variance in equity-dependent decisions (pot odds, MDF calculations).
- **SPR auto-commit** — Bots with SPR < 2 facing a bet now auto-shove with strong hands (top pair+). At this stack depth, pot-committing is standard but was previously going through full decision logic, occasionally checking or making small raises.
- **`lastRaiseIncrement` tracking** — New ref in `useGameState`, updated on every raise, reset on street change. Powers both min-raise enforcement and half-raise rule. Exposed to UI for correct BetControls slider minimum.
- **Min-raise computed fix** — `minRaise` computed property now uses `currentBet + lastRaiseIncrement` instead of `currentBet + BB`. BetControls slider and exact-amount input reflect correct legal minimum.

### Fixed (Code Quality — Critical Issues)
- **Silent error swallowing** — `useSessionStats.ts` and `useStatsData.ts` had empty `catch {}` blocks that silently discarded JSON parse errors and Supabase save failures. Corrupted localStorage would lose an entire session with zero feedback. Now logs warnings and resets to fresh state.
- **Untracked setTimeout cleanup** — `useGameEngine.ts` had 10+ `setTimeout` calls with no cleanup on unmount. Navigating away mid-hand would trigger ghost state mutations. All timeouts now tracked via `scheduleTimeout()` helper with `cleanup()` exposed to index.vue.
- **Deep watch performance** — `useSessionStats.ts` serialized the entire session to localStorage on every mutation (deep watch). Now debounced to 1 second, preventing jank at 100+ hands.
- **`any` type leaks** — `useStatsData.ts` had `ref<any>`, `(h: any)`, `exportSingleHandPokerStars(h: any)`. Replaced with proper `SessionData`, `HandRecord`, and `HandRow` types with imports from `useSessionStats`.
- **`catch (e: any)`** — `useSupabase.ts` used `any` in catch block. Changed to `unknown` with proper narrowing (`e instanceof Error`).
- **CSV export escaping** — CSV exports in `useSessionStats.ts` and `useStatsData.ts` didn't escape fields containing commas, quotes, or newlines. Added `csvEscape()` utility function to both.

## [0.15.3] - 2026-03-29

### Refactored (Code Quality — B+ → A-)
Continued refactoring from the codebase audit. Focus: eliminate remaining large files and duplication.

- **useStatsData composable** — Extracted all data loading, computed stats (lifetime, position, profit timeline), CRUD operations (delete all/session/hand), and export functions from stats.vue into a dedicated composable (262 LOC). stats.vue reduced from 1,104 → 725 LOC (34% reduction).
- **downloadFile utility** — Shared file download helper extracted from inline functions. Used by useStatsData, analysis page.
- **Keyboard fold confirmation** — Pressing F now requires double-press within 2 seconds, matching the BetControls click confirmation pattern.
- **Heads-up poker fix** — Three bugs causing heads-up to be unplayable: SB defense too tight (now 85% cap in heads-up), script rebuy happening after alive-check (games ended after 1 bust), D/SB position bonus too small (now matches BTN). Verified over 1,000+ heads-up hands.

### Summary of all refactoring (v0.15.2 + v0.15.3)
| File | Before | After | Change |
|------|--------|-------|--------|
| useCommentary.ts | 1,622 | 877 | -46% |
| stats.vue | 1,104 | 725 | -34% |
| Code duplication | ~500 LOC | ~80 LOC | -84% |
| Files >900 LOC (non-algorithmic) | 4 | 1 (StatsPanel) | -75% |
| Utility files | 11 | 17 | +55% |
| Composables | 5 | 6 | +20% |
| Tests | 765 | 800 | +5% |

## [0.15.2] - 2026-03-29

### Refactored (Code Quality — C+ → B+)
Codebase audit identified organizational debt from rapid feature development. Three high-impact refactorings applied:

- **useCommentary.ts split** — 1,622 → 877 LOC (46% reduction). Extracted 480+ quip pools to `commentaryQuips.ts` (678 LOC) and strategic observation generators to `commentaryStrategic.ts` (92 LOC). Composable retains only state management and generation wiring.
- **Shared simulation utilities** — `gameSimulation.ts` consolidates `shuffleDeck()`, `displayCard()`, and `findSeat()` that were duplicated between `scripts/simulate.ts` and `app/utils/simulateBrowser.ts` (~300 LOC of identical code eliminated).
- **Card parser utility** — `cardParser.ts` extracts display-format card parsing (e.g., "A♠" → Card object) that was duplicated in `replay.vue`. Functions: `parseDisplayCard()`, `parseDisplayCards()`, `parseDisplayHoleCards()`.
- **35 regression tests** — New test file covering HandResult.score (the .values crash), PS parser, kicker descriptions, range lookup, Chen scores, equity estimation, draw detection. Total: **800 tests across 18 files**.

### Added
- **`.values` → `.score` fix** in 5 locations across commentary and simulation — HandResult uses `score`, not `values`. Was causing crashes when sorting hands at showdown.

## [0.15.1] - 2026-03-29

### Added
- **TV mode pause button** — Pause the game mid-action in TV Broadcast mode to study bet sizing, board texture, and card values. Bot actions freeze until you resume. Only available in TV mode (not Hero POV or Off). Auto-resumes at showdown.
- **Watch vs Practice buttons** in stats hand detail — "Watch" opens the non-interactive step-through replay (all cards face-up, pause/play/speed). "Practice" opens the interactive replay (hero makes new decisions). Both have tooltips explaining the difference.
- **Session milestones** in stats panel Session tab — first win, first $100+ pot, first $500+ pot, first all-in win, best win streak, biggest win. Each with hand number.
- **Keyboard shortcuts** on main game — F=fold, C=call/check, R=raise half-pot. Shown in the Your Turn indicator.

### Changed
- **Commentary mode simplified** — always defaults to Hero POV. No localStorage for mode. Setup passes choice directly to composable via GameSettings. No race conditions.
- **Fold confirmation** — first click shows "Confirm Fold" (pulsing, 2s timeout), second click folds.
- **Your Turn indicator** — larger, thicker border, amber glow, keyboard shortcut hint.
- **Hero vs winner comparison** at showdown — side-by-side red/green panels showing both hands with descriptions and kicker explanation.
- **Raise presets** — larger buttons (py-2.5), bolder text, better active/hover contrast.
- **Hand counter** in header bar (Hand #N).
- **Commentary scroll-to-bottom** arrow button when scrolled up.

## [0.15.0] - 2026-03-29

### Added
- **Hand history replay viewer** (`/replay-hand`) — Paste any PokerStars hand history and watch it play out step-by-step on the visual poker table. All cards face-up. Play/pause, speed control (0.5x-3x), step forward/back, keyboard shortcuts, action log, multi-hand support. "Replay on Table" button on analysis interesting hands.
- **PokerStars parser** (`pokerStarsParser.ts`) — Inverse of the exporter. Parses seats, blinds, hole cards (from Dealt/Shows/Summary), actions per street, community cards, showdown, winners. Validates format with clear error messages.
- **Chorman strategic analysis mode** — Chorman now alternates between quips and genuine poker observations based on a "Style" slider (0 = all jokes, 100 = all strategy, default 30). Strategic observations are generated dynamically from actual cards/board/pot:
  - Flop: outs math with hit percentages, position analysis ("Protect it — bet to charge draws"), board danger ("Monotone board and we don't have a card of that suit"), ace-high warnings
  - Actions: bet-sizing analysis ("Overbet — very strong hand or big bluff"), pot-odds equity against all-ins, blocking bet detection
  - Showdown: session-building commentary, cooler acknowledgment ("Nothing you could have done differently")
- **Hero POV board texture analysis** — Flop/turn/river now show detailed objective notes: board texture (monotone/two-tone/paired/connected), equity vs opponents, draw outs, ace-on-low-board alerts, flush-completing warnings, paired-board full-house-draw alerts, player count.
- **Detailed hand descriptions with kickers** — Two Pair shows "Ks and Js, T-kicker" (was just "Ks and Js"). Trips/Flush/Straight/Full House all show kicker or high card. Winner section explains kicker losses ("Same hand type — wins on kicker").
- **Recommendation shows ALL-IN** when hero can't meaningfully raise (stack ≤ 1.5x call amount).
- **Winner's hand description** shown in stats panel at showdown (e.g., "Top Pair, Ace-kicker").
- **Hand insights in analysis** — Each interesting hand shows color-coded analysis: Leak (red), Good Play (green), Note (amber), Info (blue). Leaks include weak hands from EP, calling all-ins with marginal holdings. Good plays include disciplined folds under pressure.
- **Raise defaults to half-pot** instead of minimum raise. On a $248 pot, shows $124 instead of $2.

### Changed
- **Commentary always generates** regardless of enabled state — switching from Off to Hero POV mid-hand shows full history.
- **3-way Off/Hero/TV tabs** in both setup screen and commentary panel for consistency.
- **Commentary defaults to Off** — user must explicitly choose Hero POV or TV Broadcast.
- **Tooltip layout shift fixed** — CSS `[data-state="delayed-open"]` was styling the trigger element, not just the popup. Scoped to portal wrapper.
- **480+ unique Chorman quips** across 20+ pools including 7 board texture categories, random banter, and strategic observations.
- **Stake selector on analysis page** with tooltip explaining stakes don't affect bot behavior.
- **Analysis runs 3 sims** — heads-up, 6-player, 8-player with per-sim download links.

## [0.14.0] - 2026-03-29

### Added (Solver-Adjacent Improvements)
Five improvements that push bot decision-making toward solver-level play while keeping the game fun and responsive. All 765 tests pass; simulation verified.

- **River polarization** — On the river, bots now only bet with monsters (value) and air (bluffs). Medium-strength hands (top pair, second pair, weak two pair) check to avoid value-owning themselves. This is a fundamental GTO concept — previously bots bet strong hands 55% on the river, which is exploitable.
- **Pre-computed opening ranges** — Preflop decisions now use the actual 169-hand EV-ranked list instead of Chen+ → percentile approximation. Position shifts (-8% BTN to +3% UTG) adjust which hands are playable. Falls back to Chen+ only for edge cases. More accurate than the continuous heuristic.
- **Minimum Defense Frequency (MDF)** — When facing a bet, bots compute MDF = 1 - (bet / (pot + bet)) and defend if their hand is within that threshold. Prevents exploitable over-folding to large bets. Applied to draws, weak made hands, and even air (25% of the time on flop/turn).
- **Hero bet-sizing exploitation** — Bots detect if hero bets big with value and small with bluffs (or vice versa). When a tell is detected, bots adjust: call big "value" bets less (0.7x), call small "bluff" bets more (1.4x). Requires 8+ showdown hands with bet-sizing data.
- **Commentator name swap** — Lon McEachern → Mon LeEachern, Norman Chad → Chorman Nad. Same initial-swap pattern as the pro player bots. Real names remain in the README homage section.
- **Interactive bot analysis page** (`/analysis`) — Runs a 3,000-hand browser-side simulation (heads-up + 6-player + 8-player, pro personas only) with animated spinner, timestamped results, per-table metrics with tooltips, observed vs config bot stats, auto-selected interesting hands (coolers, huge pots, all-in showdowns), and per-sim PokerStars hand history downloads.
- **3-way commentary selector on setup screen** — Off (no commentary, standard trainer) / Hero POV (default — your cards only, opponents face-down, straight analysis) / TV Broadcast (all cards face-up, Chorman & Mon banter). Replaces the simple on/off toggle.
- **Raise defaults to half-pot** — Raise button now shows 50% pot (clamped to min/max) instead of the minimum raise. On a $248 pot, shows $124 instead of $2.
- **Chorman slider fixed** — Slide right = more quips, left = fewer. 0 = off. Quip text uses "Chorman" throughout.
- **Color mode toggle removed** — App is dark-mode only by design (casino aesthetic).
- **Top status bar on setup screen** — Nav links (Stats, Bot Analysis) on the left, Supabase status on the right.
- **Footer bar** — Bots, Bot Analysis, and GitHub links at the bottom of the game page. Bots link moved from top bar.

## [0.13.2] - 2026-03-29

### Fixed (Poker Realism Audit — Round 2)
Seven additional fixes based on second professional audit. All 765 tests pass; simulation verified over 300 hands.

- **SPR awareness** — Bots now compute stack-to-pot ratio and adjust: shallow SPR (<4) plays straightforward bet/fold with auto-shove on monsters; deep SPR (>12) plays cautiously. Affects c-bet decisions, commitment, and raise sizing.
- **Paired board c-betting** — C-bet logic now uses `board.isPaired`: monsters bet 1.2x more on paired boards (protect equity), overcards/air check 50% more (opponent likely has trips when continuing). Previously paired boards were ignored.
- **Check-raise board texture** — Check-raise frequency now varies by texture: dry boards 1.4x boost (fewer draws, safe to trap), wet boards 0.6x (too many draws to trap with), paired boards 1.3x. Previously flat +20% regardless.
- **River fold equity fix** — Passive opponents' river bets are now treated as real: bluff multiplier reduced to 0.3x for raises and 0.5x for probe bets on river vs passive tables. Previously passive opponents got 1.3x MORE bluffs — backwards.
- **Draw-type blocker discounts** — Flush draws discounted 5% (9 outs, few blockers), OESD 10% (8 outs), gutshot 18% (4 outs, blockers matter most). Previously flat 12% for all draw types.
- **Strong-hand threshold lowered** — From 0.40 to 0.35 so all top pairs (including bad kickers) are classified as "strong hands." Previously top pair with deuce kicker fell into "draw" category.
- **Multiway discount inverse to hand strength** — Monsters discount 20% less in multiway pots (still profitable against many opponents), bluffs discount 15% more (no fold equity multiway). Previously flat discount for all hand types.

## [0.13.1] - 2026-03-29

### Fixed (Poker Realism Audit)
Nine fixes to make bot decision-making more realistic, based on review from a professional poker perspective. All 765 tests pass; simulation scripts verified over 500 hands.

- **3-bet sizing now position-aware** — Out of position 3-bets size to 3.5x (was flat 3.0x). In position stays at 3.0x. Aggression scaling reduced from 0.5 to 0.3 to prevent oversizing.
- **Check-raise logic implemented** — Bots can now check with intent to raise when bet into. Monsters get +20% raise frequency after checking, strong hands get a balanced check-raise line. New `checkedThisStreet` field in DecisionContext tracks whether the bot checked earlier on the current street.
- **C-bet frequency reduced and texture-aware** — Strong hands c-bet 80% on dry boards but only 55% on wet boards (was flat 80%). Weak made hands drop from 40% to 25% on wet boards. Air c-bet base reduced. Three-tier multiway discount (HU 100%, 3-way 65%, 4+ way 40%) replaces binary flag.
- **Kicker-aware hand strength** — Top pair now scores 0.38 (deuce kicker) to 0.48 (ace kicker) instead of flat 0.40-0.45. Second/third pair scores 0.28-0.35 by kicker. Overpair bonus added (AA overpair ~0.53). This means top pair bad kicker plays more cautiously while top pair good kicker bets for value.
- **Short-stack push/fold widened by position** — Late position (BTN/CO) now shoves top 25% at 15-25BB and top 35% below 10BB (was 18% and 25% regardless of position). Early position stays tight.
- **Blocker-adjusted draw equity** — Draw strength scores reduced by ~12% to account for dead cards that opponents may hold. Flush draw strength 0.35 → ~0.31, OESD 0.30 → ~0.27.
- **Overcard equity improved** — Two overcards (e.g., AK on a low board) now score 0.22-0.25 (was 0.20). Suited overcards get a bonus for backdoor flush potential.
- **Turn/river barrel logic improved** — Turn barrel now considers whether the turn card helped the raiser's range (high cards = barrel more, low cards = slow down, flush-completing = significantly slow down). River barrel considers scare cards (flush-completing, straight-completing) and reduces bluff frequency accordingly.
- **Donk-bet logic already implemented** — Confirmed working: fictional bots donk-bet at their configured frequency, pro bots use texture-based leading. Donk bluffs, semi-bluff leads, and weak-made-hand probes all operational.

## [0.13.0] - 2026-03-28

### Added
- **Live Commentary System** — New left-column commentary panel with two simultaneous modes that run in real time:
  - **Hero POV** (default) — First-person perspective. Only sees hero's cards and public info (bets, board, actions). "We pick up A♠ K♦. Strong hand." Commentary on every action: folds, calls, raises, checks, blinds, all-ins.
  - **TV Broadcast** — Dual-voice Norman Chad & Lon McEachern style commentary. Lon calls the play-by-play, Norman provides color commentary with goofy puns, self-deprecating humor, ex-wife jokes, and poker wisdom. Sees all hole cards, calls out bluffs, identifies slow-plays, foreshadows future cards.
  - **All cards face-up in TV mode** — When TV Broadcast is selected, all bot hole cards are shown face-up on the table (like watching WSOP on TV). Switch back to Hero POV and cards flip back down.
  - **400+ unique Norman Chad quips** across 20+ categorized no-repeat pools: action pools (folds, big folds, bluffs, raises, calls, checks, all-ins, junk all-ins), result pools (showdown wins/losses, coolers), atmosphere pools (foreshadowing, street hits/misses, generic wisdom), and hand-specific pools (pocket aces/kings/queens/jacks, board texture — monotone/paired/broadway/low/ace, river drama, pot size, heads-up, draw chasing). UniquePool class tracks used lines — never repeats within a game, resets each new hand.
  - **Norman picks his spots** — Doesn't quip after every single action. Skips ~40% of routine actions (folds, calls, checks, standard raises) by default, but always speaks on big moments: bluffs, all-ins with junk, big laydowns, slow-plays, showdowns, coolers, foreshadowing. Tunable via slider.
  - **Persona-specific commentary** — Norman has 4-5 custom quips for each of the 18 pro bots: Phellmuth's tantrums, Gaplan's Sweathogs/Barbarino/Horseshack references, Twan's "durrrr" challenge, Drunson's Super/System, Pvey's machine-like precision, Asfandiari's magic tricks, Ceese's legend status, etc. ~40% chance to fire on any pro bot action.
  - **Self-aware commentary** — Norman occasionally knows he's commentating a simulation with bots: "These bot names seem familiar. I can't quite place the faces though. Probably for legal reasons." (~8% chance per hand.)
  - **Slider reactions** — Norman reacts in real time when his quip slider is adjusted: turned up ("Oh, you want MORE of me?"), turned down ("Oh, I'm being turned down. This feels very familiar.").
  - **Lon/Norman voice sliders** — Two sliders in TV Broadcast mode: "Lon Analysis" (0-100%, controls whether Lon includes card details, hand strength, draw callouts, or just announces bare actions) and "Norman Quips" (0-95%, controls how often Norman chimes in on routine actions). Both persisted in localStorage.
  - **Setup screen toggle** — Commentary can be turned on/off from the setup screen before dealing. Default is on. When off, the commentary column is completely hidden and no lines are generated.
  - **Constant stream** — Every player action gets Lon's play-by-play in the TV stream and a line in the Hero stream. Commentary starts from the first blind post.
  - **Toggle and mode persisted** — On/off toggle, Hero/TV mode, and both voice sliders saved in localStorage.
  - **Three-column layout** — Commentary (left, w-80) | Table (center, flex) | Stats (right, w-80) at xl breakpoint. Commentary hidden on smaller screens or when disabled.
- **Stats panel overflow fix** — `overflow-clip` on root, fixed height at all breakpoints, pinned section overflow-hidden to prevent tooltip reflow.
- **Detailed Chen vs Chen+ documentation** — README expanded with full scoring rules, where Chen works/breaks down, Chen+ adjustments table, empirical percentile mapping, concrete A♠T♦ position example.

## [0.12.2] - 2026-03-28

### Added
- **Recent Hands on Overview** — The stats Overview tab now shows a "Recent Hands" section (up to 20 hands, reverse chronological) below the "By Position" breakdown. Click any hand to open a detail modal with Replay, Analyze, Copy, Export, and Delete actions.
- **Hand Detail Modal** — Replaced expandable hand rows with a full modal dialog. Keeps hand list scroll position stable, gives more room for hand history, and feels consistent with the existing Analyze modal.
- **Copy to Clipboard** — New "Copy" button in the hand detail modal copies the PokerStars-format hand history to clipboard with a 2-second checkmark confirmation.
- **Pro stat derivation docs** — README now explains how the 18 pro bot persona stats are derived (hand-crafted archetypes from publicly known playstyle traits, not database exports).
- **.nvmrc** — Pins Node.js version to 22.14.0 for consistent environments.

### Changed
- **Pot Odds redesign** — Replaced ratio + percentage layout with side-by-side "Your Equity" vs "Need" percentages for direct visual comparison. Ratio shown as secondary reference. Equity color-coded green/red based on whether it exceeds the required percentage.
- **Stats panel fixed height** — Panel now uses a fixed viewport-relative height (`h-[calc(100vh-6rem)]`) on desktop with internal scrolling, preventing layout shifts when content changes. Column is sticky-positioned so it stays in view.
- **Recommendation pinned** — "Your Hand" and the action recommendation are pinned at the top of the stats panel (above the scroll area) so they're always visible without scrolling.
- **Layout shift reduction** — Added `tabular-nums` and `min-w` constraints to all dynamic number displays: hero stack/delta, pot, player chip counts, action badges, bet control amounts, EV, equity, and session profit. Slider range labels widened from `w-12` to `w-16`. Hero stack delta uses `invisible` instead of `v-if` to reserve space.
- **Supabase status label** — Status pill now reads "Supabase Connected" instead of just "Supabase" for clarity on the setup screen.

## [0.12.1] - 2026-03-28

### Added
- **Bot thinking insight** — The "X is thinking..." indicator now shows real-time calculation details: Chen/Chen+ scores preflop, made hand + draws + board texture postflop, pot odds needed to call. Displayed as monospaced reasoning lines during the 0.8-2s thinking delay.
- **Supabase graceful fallback** — When Supabase is not configured (no `.env` or empty credentials), the setup screen shows "Local Storage Only" with a gray indicator and hides all login UI (GitHub/email). Invalid credentials (bad URL, short key, auth failure) show red "Connection Failed" with diagnostic message and fall back to localStorage.
- **Supabase credential validation** — URL must be `https://*.supabase.co`, key must be 20+ chars. Partial credentials (one present, one missing) and whitespace-only values handled. `ensureSession()` catches auth errors and disables the Supabase layer gracefully.
- **Dual-indicator status pill** — Redesigned SupabaseStatus.vue with two side-by-side dots: database status (green Supabase / red Failed / gray Local Only) and auth method (green GitHub / blue Email / yellow Anonymous).
- **Supabase setup documentation** — Full SQL schema, RLS policies, env var setup, and 3-tier persistence explanation in README.
- **28 Supabase fallback tests** — Covers empty, partial, whitespace-only, invalid URL, short key, all auth functions with null client, password validation.

### Fixed (Security Audit)
- **User_id scoping on all Supabase queries** — SELECT queries in stats.vue now filter by `user_id` (defense-in-depth alongside RLS). Previously relied solely on server-side RLS, meaning a misconfigured policy could expose all users' data.
- **User_id scoping on all DELETE operations** — Session and hand deletes now include `.eq('user_id')` to prevent cross-user deletion.
- **sendBeacon authentication** — Tab-close session save now includes apikey query parameter so Supabase can authenticate the request.
- **Security headers** — Added to `netlify.toml`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `Content-Security-Policy` restricting connect-src to `*.supabase.co`.
- **Security audit documentation** — Full audit results, defense-in-depth strategy, CSP breakdown, credential validation, and accepted risks documented in README.

### Changed
- **Renamed metatweak to Table Flow** — All references (code, config key, comments, README, changelog) renamed from `metatweak` to `tableFlow` for clarity.
- **Mike the Mouth** (was Mike Matusow) — Avoids using the real name while keeping the initial-swap pattern. Updated across config, tests, README, and changelog.
- **README expanded** — Detailed bot behavior section (12 config fields, Chen+, board texture, table flow, hero adaptation, full preflop/postflop decision flows), simulation script documentation, table of contents, security section.

## [0.12.0] - 2026-03-28

### Added
- **Chen+ scoring** — Position- and playstyle-adjusted hand strength. Adds bonuses for late position (BTN +2, CO +1, UTG -1), suited connectors for loose/creative players, and big cards for TAG players. Both classic Chen and Chen+ are shown in the stats panel with separate tooltips. Bots use Chen+ for all decisions.
- **Board texture analysis** — New `analyzeBoardTexture()` categorizes boards as dry/wet, ace-high, paired, monotone/two-tone, and connected. `rangeAdvantage()` estimates who benefits from the board (preflop raiser on ace-high boards, caller on low connected boards). C-bets, barrels, and bluffs all scale with texture.
- **Table Flow dynamics** — Bots monitor a 20-hand rolling window and adjust: tighten + trap vs a player on a heater (win rate >28%), widen when running cold (<10%), protect the lead when running hot (>25%). Config in `holdem.config.ts` under `tableFlow`.
- **Expected Value (EV) display** — New stat in StatsPanel between Pot Odds and SPR. Shows `(equity × pot after call) - call cost` with +EV (green) / -EV (red) color coding and tooltip explaining the formula.
- **Donk bet system** — New `donkBetFreq` field on bot profiles. Fictional bots donk-bet into the preflop raiser at 5–22% (Calling Carl 22%, Wild Wendy 20%, Loose Lucy 18%). Pro bots never donk-bet (0%) — they check to the raiser and use check-raises/floats instead.
- **Hand analysis modal** — Click "Analyze" on any expanded hand in the stats page to see a detailed, instructional street-by-street breakdown:
  - **Player profiles**: each bot's playstyle (TAG/LAG/nit/calling station), VPIP/PFR/AF, tilt tendency, leak description, pro vs fictional badge
  - **Street-by-street actions** with per-action explanations referencing Chen/Chen+ scores, board texture, hand strength, draw outs, and the bot's persona (e.g., "As a LAG pro, Dom Twan raises with air to put opponents in tough spots")
  - **Showdown summary** with final hand evaluation for all non-folded players
  - **Key takeaway** — personalized lesson for the hero

### Changed
- **Calibrated chen percentiles** — `chenToPercentile()` now uses empirically measured values from all 1,326 starting hands. Previously the mapping was estimated and caused bots to play ~50% too tight (e.g., VPIP 30% config produced 15% observed).
- **Wider preflop defense ranges** — Modern aggressive poker: BB defends 125% of VPIP range, in-position flat calls at 85% of VPIP, OOP at 75%. Facing 3-bet: 45% of VPIP. Facing 4-bet: 20% of VPIP.
- **Position handled by Chen+** — Removed the separate position multiplier from `decidePreflopAction()` since Chen+ already adjusts hand strength by seat. Eliminates the double-counting that was skewing VPIPs.
- **C-bet sizing by texture** — Bigger bets on wet boards (charge draws), smaller on dry. Board-aware barrel rates on turn and river.
- **River bluffs are board-aware** — High frequency on ace-high dry boards (represent the ace), wet boards that bricked (represent missed draw), low on paired boards (opponent may have trips).

## [0.11.1] - 2026-03-28

### Fixed
- **Showdown hand evaluation** — Critical bug fix: showdown now evaluates actual hands using `bestHand()` instead of picking a random winner. The live game was not evaluating hands at all.
- **All-in auto-runout** — When all active players are all-in, remaining streets deal automatically with no betting prompts. No more "Your Turn" when you have zero chips.

### Added
- **Side pot calculation** — New `app/utils/sidePots.ts` with `calculateSidePots()` and `awardPots()`. Tracks `totalInvested` per player. When players are all-in for different amounts, pots are split into buckets and each is awarded to the best eligible hand. Handles ties (split pots).
- **Position-aware opening ranges** — Bots now adjust preflop ranges by position. UTG opens ~13-20%, BTN opens ~27-34%. Blends persona PFR with position range: `effectivePfr = (profile.pfr + positionRange) / 2`. Uses existing `botRanges` config values.
- **Stats drill-down by position** — Click any position row in the overview to filter the hands tab by that position. Breadcrumb navigation shows the active filter with a clear button.
- **Individual hand deletion** — Delete button on each expanded hand in the hands tab. Confirmation modal shows hand details before deletion. Lifetime stats auto-recalculate.

## [0.11.0] - 2026-03-28

### Added
- **Card-aware bot decisions** — Bots now evaluate their actual hole cards (chen score preflop, hand rank + draws postflop) instead of making purely probabilistic decisions. A bot with VPIP 0.30 plays the top 30% of hands by strength, not a random 30%. No more folding QQ or 3-betting 72o.
- **Street awareness** — Bots track what happened on previous streets: whether they were the preflop raiser (c-bet logic), whether they bet the flop (double-barrel logic), and whether to give up with air on later streets. Preflop raisers c-bet 65-85% with strong hands, 25-40% as bluffs, with reduced frequency in multiway pots.
- **Preflop escalation system** — Full 3-bet/4-bet/5-bet logic with per-persona `threeBetFreq`, `fourBetFreq`, `fiveBetFreq` fields. Aggressive pros (Dom Twan, Sanessa Velbst, Wild Wendy) 3-bet 18-22% and 4-bet 8-10%. Passive personas (Tight Tony, Calling Carl) 3-bet only 4-5%.
- **Hero adaptation** — Bots track hero's tendencies (VPIP, fold-to-3-bet, fold-to-cbet, aggression) via `useHeroProfileStore` (Pinia). After 10 hands, bots exploit: 3-bet more vs fold-happy heroes, bluff less vs loose heroes, bluff more vs passive heroes.
- **Bot table memory** — Bots track table-level aggression, bluff rate, and passivity across recent hands. Adjusts float rate, calling frequency, and bluff decisions based on observed table dynamics.
- **Full house / trips / quads draw detection** — `detectDraws()` now identifies full house outs (when holding two pair), trips draw outs (when holding one pair), and quads/full house outs (when holding trips).
- **Pinia state management** — Installed `@pinia/nuxt` with `useHeroProfileStore` for rolling-window hero behavior tracking.
- **Composable extraction** — Created `useGameState` and `useGameEngine` composables, eliminating ~600 lines of duplicated game logic between `index.vue` and `replay.vue`.
- **`/bots` gallery page** — Visual showcase of all 27 bot personas with `BotAvatar` (initials + deterministic color), stat bars, descriptions, pro badges, and filter/sort controls.
- **In-game bot adjustment modal** — Click the gear icon on any bot's nameplate at the table to open `BotProfileModal` with sliders for VPIP, PFR, aggression, bluff freq, creative freq, and 3-bet freq. Changes apply to the next hand.
- **Delete confirmation modals** — Nuxt UI 4 modals for session deletion (y/n) and lifetime data deletion (type "DELETE" to confirm). Lifetime stats auto-recalculate after deletion.
- **Bot simulation script** — `scripts/simulate.ts` runs headless bot-vs-bot games and generates PokerStars `.txt` files for analysis. Tracks per-bot VPIP, PFR, AF, and table-level stats. Usage: `npx tsx scripts/simulate.ts 1000 6`.
- **71 new tests** — `phase6-escalation.test.ts` (preflop escalation rates, backward compat) and `phase6-hero-adaptation.test.ts` (adaptation triggers, window gating, bounded magnitude). 737 total tests passing.

### Changed
- **Preflop calling rates fixed** — Flat-call range is now additive with 3-bet range (not overlapping). A single raise no longer folds the entire table. Continue rates: 30-50% for aggressive pros, 15-25% for tight players.
- **Postflop aggression factors fixed** — AF values now closely track persona config (was 3-4x config, now within 0.2x). C-bet and bluff rates properly scaled by aggression.
- **Monte Carlo runs increased** — Equity simulation: 300 → 500 runs. Hand probability simulation: 400 → 800 runs. More refined percentages in the stats panel.
- **Tooltip backgrounds fixed** — Added `h-auto` and `break-words` so multiline tooltip text no longer extends beyond the background.
- **Stats page redesigned** — Gradient headline card, cleaner grids, session drill-down navigation, hand cards (not table), tab badges with counts, board cards color-coded by street.
- **Pro player names anonymized** — All 19 pro persona names have swapped initials (e.g., "Tom Dwan" → "Dom Twan") to avoid identity appropriation. Fictional bot names unchanged.
- **`BotConfig` interface extended** — Added optional `threeBetFreq`, `fourBetFreq`, `fiveBetFreq`, `leak` fields. Populated from persona config at setup time. Eliminates `as any` casts.
- **`describeBotStyle()` extracted** — Moved from `SetupScreen.vue` to shared `app/utils/botDescriptions.ts` utility.

## [0.10.2] - 2026-03-29

### Changed
- **README fully rewritten** to reflect current state of the app:
  - Updated from "7 bot personas" to 25 (7 fictional + 18 pro) with full tables including consistency column
  - Updated from "10 pro bots" to 18 with all new additions (Coneymaker, Ceese, Sngar, Velbst, Eidel, Twan, Pantonius, Sguyen, Jhan, Benney)
  - Pro count now documented as configurable (0 / 1 / 2 / 3 / All), not hardcoded at 2
  - Added consistency system documentation
  - Added pre-action queuing and speed-after-fold documentation
  - Added PokerStars export documentation
  - Added hand improvement probabilities documentation
  - Test suite section updated: 666 tests across 14 files with realistic pipeline tests
  - Testing approach table: Simplified (100K) → Universal (500K) → Realistic (50K with real cards)
  - Future enhancements cleaned up: removed items already implemented (hand history, replayer, PokerStars export)
  - Configuration section updated: 25 personas, consistency field
  - Project structure updated: app.config.ts, app.vue, botDecision.ts, pokerStarsExport.ts, .env.example
  - Roadmap updated: Phases 1-5 done, Phase 3 partial
  - **Added poker glossary**: 20 terms (VPIP, PFR, AF, WTSD, equity, pot odds, implied odds, outs, SPR, Chen, OESD, gutshot, tilt, GTO, TAG, LAG, 3-bet, C-bet, value bet, semi-bluff, walk, position)

## [0.10.1] - 2026-03-29

### Added

#### Consistency System (Human Variance)
- New `consistency` field on every persona (0.88–0.99)
- Before each decision, rolls against consistency. On fail, bot makes a random off-strategy play — fold when they should call, raise with nothing, etc.
- Near-perfect (0.98-0.99): Ihil Pvey, Rhip Ceese, Serik Eidel — misplay ~1-2% of decisions
- Very disciplined (0.95-0.97): Solid Sam, Phellmuth (calm), Boyle, Pantonius, Jhan, Twan — 3-5%
- Mostly solid (0.92-0.94): Degreanu, Utu Sngar, Coneymaker, Paak, Asfandiari — 6-8%
- Inconsistent (0.88-0.91): Wild Wendy, Jellande, Mike the Mouth, Ncotty Sguyen — 9-12%
- Random actions are weighted: facing a bet → 40% fold / 40% call / 20% raise; unchallenged → 60% check / 40% random bet
- Simulates fatigue, distraction, overconfidence, and bad reads in a single knob

## [0.10.0] - 2026-03-29

25 personas, 18 pro bots, PokerStars export, universal tests, all 517 tests passing.

### Added

#### 8 New Pro Bots (18 pro total, 25 overall)
- **Mhris Coneymaker** (VPIP 30%, tilt 1.1x) — Online grinder who changed poker. Solid fundamentals, occasional overplays.
- **Rhip Ceese** (VPIP 24%, tilt 0.3x) — Legendary all-around player. Near-zero leaks. Ice cold under pressure.
- **Utu Sngar** (VPIP 26%, tilt 1.0x) — Genius reads, fearless aggression, erratic brilliance impossible to predict.
- **Sanessa Velbst** (VPIP 25%, tilt 0.8x) — Fearless aggressor. 3-bets relentlessly, rarely backs down.
- **Serik Eidel** (VPIP 21%, tilt 0.3x) — Quiet assassin. Tight, patient, almost untiltable.
- **Dom Twan** (VPIP 31%, tilt 0.5x) — "durrrr" hyper-LAG. Massive bluffs, fearless, constant pressure.
- **Aatrik Pantonius** (VPIP 24%, tilt 0.4x) — Finnish ice. Calm, precise, positionally disciplined.
- **Ncotty Sguyen** (VPIP 30%, tilt 1.2x) — Loose-aggressive with flair. Gambles, tilts on bad beats.
- **Cohnny Jhan** (VPIP 22%, tilt 0.5x) — Old-school TAG. Traps, patient, consistent.
- **Krynn Benney** (VPIP 25%, tilt 0.6x) — Modern GTO high-roller. Creative lines, mixes frequencies.

#### PokerStars Hand History Export
- Full PokerStars-format `.txt` export compatible with PokerTracker, Hold'em Manager, Equilab
- Per-hand, per-session, and lifetime export buttons
- Hand detail in stats page now displays PokerStars format instead of raw action log
- Color-coded: street headers yellow, hero deal amber, winner green, losers red, folders gray

#### Universal Persona Tests (196 new tests)
- Every persona (25 bots) tested for VPIP, PFR, fold rate, raise rate alignment with config
- PFR never exceeds VPIP, no degenerate fold rates, valid actions only
- Raise amounts never exceed stack across random scenarios
- VPIP ordering, aggression ordering, and bluff ordering match config across all bots
- Position awareness: all bots check sometimes unchallenged, fold sometimes to big bets

#### Pro Count Selector
- Quick-select: 0 / 1 / 2 / 3 / All pros per table (default 2)
- Options adapt to player count

#### Pre-Action Queuing
- "Pre-fold" and "Pre-check/call" buttons while bots are acting
- Queued action auto-executes when hero's turn arrives
- Cancel button to change your mind before your turn

#### Speed After Fold
- Bot thinking: 150-350ms (was 800-2000ms) after hero folds
- Street advancement, end hand, and postflop start all accelerated ~5x

### Changed
- Play-by-play now includes all player hole cards in a DEAL section at the top
- Hand detail in stats uses PokerStars format with labeled streets and seat summaries
- Tooltip styling: solid dark background (#030712), max-width 280px, word wrap, z-index 9999
- Pro bot detection uses fictional-name exclusion (future-proof for adding more pros)
- Tilt caps raised to VPIP 65%, aggression 3.0 for extreme tilt scenarios
- Renamed to "No Limit Hold'em Simulator" everywhere
- Bust screen delayed until after showdown results display
- Winner info (name, cards, amount) shown for every outcome
- "Buy More Chips" / "Cash Out" options when hero busts at showdown

### Fixed
- All 517 tests passing (was 23 stub failures from phase1-seats and phase2-evaluator)
- Stub test files wired to real implementations
- JSDoc comments updated across all files to match actual code

## [0.9.2] - 2026-03-29

### Changed
- **Renamed to "No Limit Hold'em Simulator"** everywhere — page title, meta tags, OG image, setup screen, README, config
- **Bust screen delayed until after showdown** — when hero hits 0 chips, showdown results display first (winner, cards, financials). Then two options appear:
  - "Buy More Chips ($200)" — rebuys at the same table, starts a new session
  - "Cash Out" — saves session, shows bust screen with summary
- **Winner info shown for every outcome** — win, loss, or fold. Stats panel at showdown shows winner's name, hole cards, and pot won alongside hero's financials. Stays visible until Deal Next Hand.

### Fixed
- Bust screen no longer appears before the hand resolves
- Hero no longer eliminated from the table before seeing showdown results
- SetupScreen initialization order: `proBots` defined before `generateDefaultBots` call

## [0.9.1] - 2026-03-29

### Changed
- **Setup screen shows full table roster** — all active bots listed with seat number, name, PRO badge, VPIP, aggression, and inline swap dropdown. No need to open Advanced to see or change who's playing.
- **"Shuffle Players" button** always visible above the player list — click repeatedly to randomize the mix. Shows pro/fictional count summary.

## [0.9.0] - 2026-03-29

Pro player bots with real-world playstyles and per-persona tilt.

### Added

#### 10 Pro Player Bots
- **Hill Phellmuth** (VPIP 20%, tilt 2.5x) — Near-GTO baseline but goes on massive tilt after just 1-2 losses. Becomes a maniac when frustrated.
- **Naniel Degreanu** (VPIP 32%, tilt 0.5x) — Loves suited connectors from any position. Highest creative frequency among pros. Very tilt-resistant.
- **Ihil Pvey** (VPIP 23%, tilt 0.3x) — Near-perfect play with rare, unpredictable mistakes. Almost untiltable — needs 10+ consecutive losses. The hardest bot to exploit.
- **Boyle Drunson** (VPIP 28%, tilt 0.4x) — Old-school power poker. Traps with monsters, overvalues top pair. Stoic under pressure.
- **Tennifer Jilly** (VPIP 30%, tilt 0.7x) — Unpredictable tight/loose mix. Plays position well but occasionally overcommits with draws.
- **Lhil Paak** (VPIP 27%, tilt 0.6x) — Unorthodox and analytical. Highest creative frequency of all bots. Float bets, delayed aggression, hard to put on a hand.
- **Entonio Asfandiari** (VPIP 29%, tilt 0.9x) — Charismatic aggressor. Constant pressure with well-timed bluffs but can overplay position.
- **Kabe Gaplan** (VPIP 26%, tilt 0.8x) — Steady, intelligent, solid fundamentals. Rarely makes big mistakes but predictable bet sizing.
- **Bean-Robert Jellande** (VPIP 36%, tilt 1.4x) — Fearless gambler. Plays wide, bets big, loves action. Will bluff massive pots but tilts when caught.
- **Mike the Mouth** (VPIP 28%, tilt 2.2x) — "The Mouth." Solid player who self-destructs on tilt. Explosive outbursts lead to reckless all-ins and wild bluffs.

#### Per-Persona Tilt System
- Each bot has a `tiltMultiplier` that scales how fast they tilt and how hard it hits
- Phellmuth (2.5x): tilts after 1 loss, massive stat swings
- Pvey (0.3x): needs 10+ losses, barely changes even when tilted
- Tilt trigger threshold, severity, and effect magnitude all scale per bot
- Caps raised: VPIP 65%, aggression 3.0, bluffFreq 50% to accommodate extreme tilt

#### Table Composition Rules
- Max 2 pro bots per randomly generated table
- No duplicate personas — every bot at the table is unique
- 17 total personas (7 fictional + 10 pro) — enough for any table size
- Users can manually swap any bot via the Advanced setup section

#### Pro Bot Tests (46 new tests in `phase4-pro-bots.test.ts`)
- All 9 pros exist with valid fields, PFR <= VPIP
- Per-persona behavioral verification: Phellmuth, Degreanu, Pvey, Drunson, Jilly
- Comparative ordering: VPIP, tilt multipliers, creative frequency, aggression
- Tilt multiplier mechanics: faster trigger at high mult, larger effect, default 1.0 unchanged
- Table composition: max 2 pros verified over 100 random generations, no duplicates

## [0.8.1] - 2026-03-29

### Fixed
- **Delete all stats now actually deletes** — Supabase RLS was missing DELETE policies on `hands` and `sessions` tables. Deletes were silently rejected. Added `"Users can delete own hands"` and `"Users can delete own sessions"` policies.
- **Stale data after delete** — localStorage and local state fully cleared on delete. Navigating back to stats page no longer shows deleted data.
- **Delete session** also clears localStorage if the deleted session was the active one.
- Error logging added for failed Supabase deletes (visible in browser console).

## [0.8.0] - 2026-03-29

Hand replay, email/password auth, stat tooltips, and UI improvements.

### Added

#### Hand Replay (`/replay`)
- Click "Replay" on any hand in the stats page to re-live it
- Same hole cards, same board, same players and positions
- Bot decisions replay using the same AI engine (probabilistic — may differ slightly each replay)
- Hero gets full bet controls at each decision point to try different lines
- Ready screen shows original hand summary before starting
- Comparison panel at showdown: Original result vs Replay result with profit difference
- Side panel shows original play-by-play alongside replay play-by-play
- "Replay Again" button to try the same hand multiple times
- Works with both localStorage and Supabase hand data

#### Email/Password Authentication
- Sign up / sign in form on setup screen alongside GitHub OAuth
- Password requirements: 8+ chars, uppercase, lowercase, number
- Real-time validation feedback while typing
- Supabase handles bcrypt hashing server-side (passwords never stored in plaintext)
- Prevents duplicate emails across auth methods
- Forgot password flow via Supabase reset email

#### Stat Tooltips (Nuxt UI UTooltip)
- Equity: explains Monte Carlo simulation methodology
- Chen Score: explains the preflop hand strength formula
- Position: context-specific guidance (BTN=wide range, UTG=top 15%, etc.)
- Pot Odds: explains ratio and when calling is profitable
- SPR: explains stack-to-pot ratio and commitment thresholds
- Draws & Outs: explains draws, outs, and improvement chances
- Chance to Improve: explains the probability simulation
- Recommendation: explains the color-coding system
- All labels have dotted underline + cursor-help for discoverability

#### Betting Tooltips
- All main action buttons (Fold/Check/Call/Raise) have explanatory tooltips
- Preset buttons show "Raise to $X" or explain why disabled
- All-in button shows full amount

### Changed
- Recommendation reasoning text is now color-coded: green (confident), yellow (marginal), red (fold)
- Turn/thinking indicators moved from stats column to between table and bet controls
- Simplified auth: removed guest mode, two clear options (signed in or not)
- Setup screen shows prominent GitHub sign-in button + email/password form for non-authenticated users
- Stats page shows localStorage data for anonymous users, Supabase data for authenticated users
- Min-raise formula fixed: BB-based instead of doubling current bet
- Pot-fraction presets show real amounts and are disabled when below min-raise

### Fixed
- Hands not saving to Supabase (FK constraint — session must exist before hand insert)
- UColorModeToggle → UColorModeButton (Nuxt UI v4)
- URange → USlider (Nuxt UI v4)
- onUnmounted lifecycle warning (moved to onBeforeUnmount)
- Recommendation showing CHECK when facing a bet (now properly context-aware)
- Betting round not ending after opponent calls hero's raise (needsToAct reinit bug)
- Negative wagered amount in win stats
- Community cards showing after early win (board now freezes at ending street)
- Preset buttons not raising immediately on click

## [0.7.1] - 2026-03-29

### Added
- **"Your Turn" indicator** above stats panel — amber pulsing dot with call amount or check hint

### Changed
- **Thinking indicator** moved from under the table to above the stats panel (right column) — larger dots, bot name prominent, animated progress bar
- **Game state preserved** when navigating to `/stats` via KeepAlive — "Back to Table" returns to exact game state (cards, bets, street all intact)
- Timeout timer pauses while on stats page, resumes on return
- Added `@vue/devtools-core` and `@vue/devtools-kit` to Vite optimizeDeps

## [0.7.0] - 2026-03-29

GitHub OAuth, guest mode, hand replay, action logging, and auth UI improvements.

### Added

#### GitHub OAuth Login
- Sign in with GitHub to persist stats across devices and browsers
- GitHub username shown in green with green dot when authenticated
- Sign-out reverts to anonymous session (app keeps working)
- OAuth redirect flow via Supabase — works on both localhost and Netlify

#### Guest Mode
- Toggle on setup screen: "Play without saving — no stats tracked, no Supabase"
- Button changes to "Play as Guest"
- All Supabase saves skipped: no session init, no hand recording, no auto-save
- Top bar shows "Guest Mode" badge instead of connection status
- Stats link hidden in guest mode

#### Hand Action Logging & Replay
- Every action recorded during gameplay: folds, checks, calls ($), raises ($), all-ins
- Street markers logged: "--- FLOP: A♠ K♦ 7♣ ---", "--- TURN: 2♥ ---", etc.
- Actions stored in Supabase `hands.actions` column (text array)
- Stats page hands tab: click any row to expand detailed view
  - Large hole cards, board, position, pot, profit
  - Scrollable play-by-play log with street transitions highlighted in yellow
- Included in JSON/CSV exports

#### Export on Stats Page
- **Lifetime export**: JSON (full dump with stats, positions, all sessions + hands) and CSV (flat hand table)
- **Per-session export**: JSON and CSV buttons on each session card
- All via browser file download

### Changed

#### Auth Status Indicator
- **Anonymous sessions**: Yellow dot + "Local" (no Supabase branding). Click to see GitHub sign-in option.
- **GitHub sessions**: Green dot + username. Click for sign-out and stats link.
- **Connecting**: Yellow pulsing dot. **Offline**: Red dot.
- Dropdown menu only shows relevant options per auth state

## [0.6.0] - 2026-03-29

Hero timeout, bust-out handling, re-buy, and data deletion.

### Added

#### Hero Timeout (5 min configurable)
- 5-minute inactivity timer resets on every hero action (fold/check/call/raise)
- On timeout: auto-folds current hand, saves session, shows pause screen
- Pause screen shows session summary (hands, stack, profit) with Resume or End Session buttons
- Timeout duration configurable via `config.session.heroTimeoutMs`

#### Bust-Out & Re-Buy
- Hero reaching 0 chips triggers bust-out screen
- Session saved automatically on bust-out
- Re-buy button: starts a new session at original starting stack
- Re-buy is a separate session — bust-out P&L tracked independently
- Multiple bust-outs + re-buys show as separate sessions in lifetime stats
- Lifetime profit = sum of all session profits (including negative bust-out sessions)

#### Data Deletion (Stats Page)
- **Delete All**: Removes all sessions and hands from Supabase with confirmation dialog
- **Delete Session**: Per-session delete with inline confirmation
- Lifetime stats recalculate automatically after deletion (computed from remaining data)
- localStorage also cleared on full delete

#### Session Tests (19 new tests in `phase5-session.test.ts`)
- Timeout: fires after 5 min, resets on activity, doesn't fire with continuous play, no duplicate timers
- Bust-out: detected at 0 chips, not triggered with positive chips, all-in loss vs win
- Re-buy: fresh stack, new session ID, independent P&L, multiple bust-outs tracked
- Session recording: all fields captured, folded = 0 profit, stats accumulate, peak stack tracked
- Data deletion: session + hands removed together, delete all empties everything, lifetime stats zero after delete

### Changed
- Game phase now includes 'timeout' and 'busted' states
- `config.session` section added with `heroTimeoutMs`, `autoSaveIntervalMs`, `rebuyEnabled`

## [0.5.1] - 2026-03-29

### Added

#### Full Stats Page (`/stats`)
- Dedicated page at `/stats` with cross-session analytics from Supabase
- **Overview tab**: Lifetime hands played, total profit, win rate, sessions count, biggest win/loss, avg pot size, results breakdown bars, profit trend chart (last 50 hands as bar sparkline), performance by position (win rate + profit per position)
- **Sessions tab**: Session history cards showing stake level, player count, hands played, W/L, profit
- **Hands tab**: Sortable table with hand #, hole cards, board, position, result badge, profit, pot size, timestamp
- Linked from both the setup screen ("View Stats") and the in-game top bar (chart icon)
- Works on Netlify — all data fetched client-side from Supabase, no server needed

## [0.5.0] - 2026-03-29

Supabase integration, session stats tracking, and CSV/JSON export.

### Added

#### Supabase Integration
- Anonymous auth — auto-creates a user per browser, no login required
- Database tables with Row Level Security:
  - `sessions`: id, user_id, stake_level, player_count, stacks, hands played/won/lost, profit
  - `hands`: hole_cards, board, result, profit, position, pot_size, played_at
- Every hand saved to Supabase in background (localStorage as fallback)
- Session summary saved on exit or reset
- Indexes on user_id, session_id, played_at for fast cross-session queries
- `.env` file for credentials (gitignored), `.env.example` included

#### Session Stats Tab (Stats Panel)
- Hands played counter (large, prominent)
- Running profit/loss with color coding (+green / -red)
- Win/Loss/Fold breakdown with visual progress bars
- Bankroll tracker: current stack, peak stack, starting stack
- Win rate percentage
- Supabase connection indicator (green dot = syncing, gray = local only)
- Export JSON button — full session data including every hand
- Export CSV button — tabular hand history for spreadsheet analysis
- New Session button — saves current to Supabase, resets counters

#### Session Stats Composable (`app/composables/useSessionStats.ts`)
- `initSession()` — starts a new session with stake/player config
- `recordHand()` — logs result, updates counters, saves to Supabase
- `downloadJSON()` / `downloadCSV()` — browser file download
- `resetSession()` — saves to cloud, starts fresh
- Auto-saves to localStorage on every change (survives refresh)

### Changed
- Stats panel now has 4 tabs: Live, Session, Ranges, Table (was 3)
- `endHand()` records hand results for session tracking
- `backToSetup()` saves session to Supabase before navigating away

## [0.4.0] - 2026-03-29

Tilt system — bots go on tilt after consecutive losses or big pot losses.

### Added

#### Tilt System (`app/utils/botDecision.ts`)
- **Consecutive loss trigger**: After N losses in a row (default 3, configurable), bot enters tilt
- **Big pot loss trigger**: Losing >30% of stack in a single hand triggers immediate full tilt
- **Severity scaling**: Mild tilt (3 losses, 50% boosts) and full tilt (5+ losses or big loss, 100% boosts)
- **Tilt effects** (additive modifiers to base profile):
  - VPIP widens by up to 8% (plays more junk hands, even from UTG)
  - PFR increases by up to 4% (raises looser preflop)
  - Aggression boost of 0.3 (bets and raises more postflop)
  - Bluff frequency increases by 6% (more reckless bluffs)
  - Creative frequency increases slightly (more unorthodox plays)
- **Decay**: Tilt lasts 3-6 hands (configurable, random), then clears
- **Win reset**: Winning resets consecutive loss count but doesn't instantly cure active tilt
- **Safety caps**: VPIP capped at 60%, aggression at 2.5, bluffFreq at 40%
- **Visual indicator**: "TILTED" (orange) or "FULL TILT" (red, pulsing) badge on player seat, red-tinted nameplate border

#### Tilt Configuration (`holdem.config.ts`)
- `tilt.consecutiveLosses`: Number of losses to trigger (default 3)
- `tilt.bigLossThreshold`: Fraction of stack lost to trigger (default 0.30)
- `tilt.mildTiltThreshold` / `tilt.fullTiltThreshold`: Severity breakpoints
- `tilt.aggressionBoost`, `tilt.vpipWiden`, `tilt.bluffBoost`, `tilt.pfrBoost`: Effect magnitudes
- `tilt.decayHands`: Duration range [min, max]

#### Tilt Tests (26 new tests in `phase4-tilt.test.ts`)
- Trigger conditions: consecutive losses, big pot loss, configurable threshold
- Severity: mild vs full, escalation with continued losses
- Decay: per-hand countdown, clears at 0, duration within configured range
- Profile modification: VPIP/PFR/aggression/bluff all increase, caps enforced
- Behavioral impact (100K-hand simulations): tilted Tony has higher VPIP, more bluffs, more raises than base; mild tilt < full tilt effect; even Solid Sam plays looser on full tilt

### Changed
- Tilt config expanded: added `consecutiveLosses`, `bluffBoost`, `pfrBoost`, `mildTiltThreshold`, `fullTiltThreshold` (was only `triggerThreshold` and `aggressionBoost`)
- Bot decision engine now applies tilt modifiers before making decisions
- `endHand()` tracks wins/losses and updates tilt state for all bots

## [0.3.1] - 2026-03-29

### Changed
- Bot behavior tests now simulate 100,000 hands per persona (was 1,500). Runs in 146ms total. Confidence intervals are within ~1% of configured values at this sample size.
- Updated README and CHANGELOG to reflect 100K sample size

## [0.3.0] - 2026-03-29

Bot decision engine with statistical alignment, bluff awareness, and 46 behavioral tests.

### Added

#### Bot Decision Engine (`app/utils/botDecision.ts`)
- Extracted bot decision logic into standalone, testable utility
- Preflop decisions weighted by VPIP (call probability) and PFR (raise probability)
- Postflop decisions use independent random rolls for bluff bets, value bets, and calls
- Bluff frequency now has direct, measurable impact on bluffing behavior
- `bluffFreq` drives a dedicated bluff-bet path (separate from aggression-based value bets)
- Bluff raises when facing bets scale with bluffFreq * aggression
- Tight players fold to large bets proportional to (1 - VPIP)
- Call probability factors in pot odds (better odds = more calls)

#### Bot Behavior Statistical Tests (46 new tests)
- 1,500-hand simulations per persona via `simulateBotStats()`
- Per-persona verification: Tight Tony, Loose Lucy, Aggressive Alex, Calling Carl, Wild Wendy, Solid Sam
- Comparative ordering: VPIP order, bluff order, raise rate order all match config
- Preset archetype distinctness: Nit/Tight/TAG/LAG/Loose-Passive/Maniac
- Bluff sensitivity: increasing bluffFreq measurably increases observed bluff rate
- Decision function unit tests: valid actions, stack limits, passive checking, nit folding

#### README Bot Behavior Section
- Detailed explanation of the decision engine (preflop + postflop logic)
- Why behavior is accurate (1,500-hand statistical simulations)
- Full test coverage table by category (46 tests)

### Changed
- Bot decisions in game now use the extracted `decideBotAction()` from `botDecision.ts` instead of inline logic
- Postflop bluff decisions use independent random rolls (not shared with aggression path)

## [0.2.0] - 2026-03-29

Betting flow overhaul, visual improvements, and expanded test coverage.

### Added

#### Visible Betting Rounds
- Bots act in sequence with 0.8-2s thinking delays, visible around the table
- Active player seat pulses with green ring and scale-up animation
- Colored action badges per player: FOLD (red), CHECK (gray), CALL (blue), RAISE (green), ALL-IN (amber with pulse), SB/BB (muted)
- "X is thinking..." indicator with bouncing dot animation in a dark pill container
- Folded players: hole cards disappear, seat dims to 30% with grayscale, "Folded" label shown
- Eliminated players (0 chips) removed from table entirely between hands

#### Betting State Machine
- `needsToAct` set tracks which players must still act each street
- A raise re-adds all other active players to the set (reopens action)
- Street advances only when every active player has acted (set is empty)
- Prevents premature card reveals -- flop/turn/river only dealt after betting completes
- Proper flow: preflop betting -> flop -> flop betting -> turn -> turn betting -> river -> river betting -> showdown

#### Hand Ranges (Stats Panel -- Ranges Tab)
- Authentic 6-max cash game opening ranges by position (UTG 15% through BTN 42%)
- All 169 starting hands ranked by expected value
- Expandable lists categorized by pairs, suited, offsuit
- Hero hand in-range indicator
- Facing-aggression ranges: 3-bet (8%), call-vs-3-bet (12%), 4-bet (3.5%), 5-bet (1.5%)

#### Opponent Stats (Stats Panel -- Opponents Tab)
- Per-player HUD: VPIP, PFR, Aggression Factor, Went-to-Showdown %
- Player type and aggression labels with strategic reads

#### Pot Odds & SPR
- Pot odds: ratio, percentage, required equity, pass/fail verdict against live equity
- SPR (Stack-to-Pot Ratio) with low/medium/high strategic guidance

#### Clickable Recommendations
- FOLD, CHECK, CALL badges in stats panel are clickable buttons when it's hero's turn
- "click to fold/check/call" hint text shown
- RAISE remains display-only (amount is always custom via slider)

#### Street Betting Tests (31 new tests)
- `needsToAct` state machine: add/remove players, raise reopens, folded/all-in excluded
- Street progression: correct card counts, no advancement until betting completes
- Action order: preflop at UTG, postflop left of dealer, skips folded
- Edge cases: heads-up, 3-bet pots, everyone checks, single player remaining
- Full hand simulation: 4 betting rounds before showdown, early end on folds

### Changed

#### Cards
- Simplified design: rank in corners + large centered suit symbol (no pip grids)
- Red for hearts/diamonds, black for clubs/spades
- Increased sizes: small 64x88px, medium 80x112px, large 96x136px
- More spacing between hole cards

#### Table Layout
- Seats now arranged clockwise (was counter-clockwise)
- BTN -> SB -> BB flows left-to-right from hero's perspective, matching real poker
- Randomized dealer position at game start (was always seat 0)
- Postflop start seat finds first active player left of dealer (skips folded)

#### Action Badges
- Repositioned above cards (absolute, z-20) to prevent overlap with other elements
- Removed chip stack visuals from seat area to reduce clutter

### Fixed
- Blank card faces in dark mode: clubs/spades no longer use `dark:text-gray-100` on white card background
- Betting rounds completing prematurely: `allMatched` check at 0 >= 0 caused streets to advance before anyone acted
- Config import path: `holdem.config.ts` moved to project root with `@config` alias

## [0.1.0] - 2026-03-29

Initial release -- Phase 1 visual foundation with simulated betting, real-time hand analysis, and bot configurator.

### Added

#### Poker Table & Layout
- Emerald felt table with walnut rail, gold accents, and radial green glow
- Polar-coordinate seat layout engine supporting 2-8 players
- Position badges: D, SB, BB, UTG, UTG+1, MP, MP+1, CO with correct assignment for all table sizes including heads-up
- Light/dark mode via Nuxt UI (table felt stays emerald in both modes)

#### Playing Cards
- Clean, bold card design: rank in corners + large centered suit symbol
- Red for hearts/diamonds, black for clubs/spades
- CSS 3D flip animation (face/back)
- Click-to-peek: flip any opponent's cards to study their hand

#### Deck & Dealing
- Fisher-Yates shuffle with chi-squared verified uniformity (10,000-deal statistical tests)
- Burn cards before flop, turn, and river
- Authentic deal sequence: Preflop -> Flop (3) -> Turn (1) -> River (1) -> Showdown
- Hero cards face-up, opponents face-down until showdown or peek

#### Betting Controls
- Fold / Check / Call buttons with live amounts
- Raise presets: 1/4 pot, 1/2 pot, 3/4 pot, pot, all-in
- Continuous slider from min-raise to all-in (steps by BB)
- Custom exact-amount input with keyboard enter support
- All amounts clamped: never below min-raise, never above stack

#### Simulated Betting Rounds
- Bots act in sequence with 0.8-2s thinking delays
- Active player seat pulses with green ring and scale-up
- Colored action badges per player: FOLD (red), CHECK (gray), CALL (blue), RAISE (green), ALL-IN (amber)
- Folded players: cards disappear, seat dims with grayscale, "Folded" label
- Eliminated players (0 chips) removed from table between hands
- Randomized dealer position at game start
- Preflop action starts left of BB; postflop starts left of dealer
- Blinds posted visually with SB/BB badges

#### Real-Time Hand Analysis (Stats Panel -- Live Hand Tab)
- Chen score with preflop tier badge (Premium / Strong / Playable / Marginal / Trash)
- Contextual hand descriptions ("Top Pair, Ace-kicker", "Nut Flush Draw")
- Monte Carlo equity estimation (300 iterations, adaptive to 500 in close spots)
- Draw detection: flush draws, straight draws (OESD/gutshot), overcards, set draws
- Outs counting with deduplication for overlapping draws
- Hit probability by next card and by river (exact calculation)
- Rule of 2/4 quick reference
- Pot odds: ratio, percentage, required equity, pass/fail verdict vs live equity
- SPR (Stack-to-Pot Ratio) with strategic guidance
- Action recommendation per street: FOLD / CHECK / CALL / RAISE with reasoning
- FOLD, CHECK, CALL recommendations are clickable buttons when it's hero's turn

#### Hand Ranges (Stats Panel -- Ranges Tab)
- Authentic 6-max cash game opening ranges by position (UTG 15% -> BTN 42%)
- All 169 starting hands ranked by expected value
- Expandable hand lists categorized by pairs, suited, offsuit
- Hero hand in-range indicator per range
- Facing-aggression ranges: 3-bet (8%), call-vs-3-bet (12%), 4-bet (3.5%), 5-bet (1.5%)

#### Opponent Stats (Stats Panel -- Opponents Tab)
- Per-player HUD: VPIP, PFR, Aggression Factor, Went-to-Showdown %
- Player type labels (Nit, Tight, Solid, Loose, Very Loose)
- Aggression labels (Passive, Balanced, Aggressive, Hyper-aggressive)
- Strategic reads based on stat combinations

#### Bankroll Display
- Prominent stack counter in top bar
- Running P&L with +/- from starting stack, color-coded green/red

#### Setup Screen
- Hero name input
- Opponent count slider (1-7 bots)
- 6 stake levels: Micro ($0.25/$0.50) through Nosebleed ($25/$50)
- Stack depth slider: 50-200 BB
- Light/dark mode toggle

#### Bot Configurator (Advanced Setup)
- 7 named personas: Tight Tony, Loose Lucy, Aggressive Alex, Calling Carl, Tricky Tina, Solid Sam, Wild Wendy
- 6 archetype presets: Nit, Tight, TAG, LAG, Loose-Passive, Maniac
- Custom sliders per bot: VPIP (10-50%), PFR (5-40%), Aggression (0.3-2.0), Bluff Frequency (3-30%), Creative Frequency (1-15%)
- Dynamic bot names that auto-update when stats drift from preset
- Plain-English playstyle descriptions that update in real-time
- Randomize All / All Same quick actions

#### Configuration
- Single source of truth: `holdem.config.ts` at project root
- All stakes, personas, presets, equity thresholds, bet sizing, tilt mechanics, animation timing, and stats thresholds centralized

#### Hand Evaluator Engine
- Full 5-card evaluator: all 9 hand ranks (high card through straight flush)
- Best-of-C(n,5) selection from 5-7 cards
- Wheel (A-2-3-4-5) scored as 5-high straight
- Steel wheel detected as straight flush
- Royal Flush named correctly
- Kicker tie-breaking for all hand types

#### Testing (Vitest)
- Phase 1: Seat layout and position labels for all table sizes
- Phase 2 Deck: Chi-squared shuffle uniformity, positional bias, suit correlation, burn card verification, deal integrity for 2-8 players
- Phase 2 Evaluator: All 9 hand ranks, edge cases, tie-breaking, best-five selection, performance benchmarks
- Phase 2 Random Hands: 10K-hand distribution, multi-player showdown correctness, rank ordering, split pot detection, 5K-deal crash resilience
- Phase 3 Betting: Blind posting, min-raise enforcement, raise preset clamping, bet guards, side pot calculation, bust-out handling
- Phase 4 Bot AI: Persona validation, position-based range widths, escalation narrowing, equity threshold ordering, bet sizing logic, tilt mechanics
- Phase 5 Stats: VPIP/PFR calculation, aggression factor, pot odds, outs counting, probability math, BB/hand metric

#### Deployment
- Nuxt 4 SPA (`ssr: false`) with `nuxt generate` for static output
- Netlify config with SPA redirect rule
- OG image (SVG source + 1200x630 PNG) with meta tags for social sharing

#### Documentation
- Comprehensive README with feature list, tech stack, project structure, test suite details, and roadmap
- Full 6-phase design document in `docs/holdem-simulator-design.md`

[0.10.2]: https://github.com/cschweda/holdem-simulator/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/cschweda/holdem-simulator/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/cschweda/holdem-simulator/compare/v0.9.2...v0.10.0
[0.9.2]: https://github.com/cschweda/holdem-simulator/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/cschweda/holdem-simulator/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/cschweda/holdem-simulator/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/cschweda/holdem-simulator/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/cschweda/holdem-simulator/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/cschweda/holdem-simulator/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/cschweda/holdem-simulator/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/cschweda/holdem-simulator/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/cschweda/holdem-simulator/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/cschweda/holdem-simulator/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/cschweda/holdem-simulator/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/cschweda/holdem-simulator/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/cschweda/holdem-simulator/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/cschweda/holdem-simulator/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cschweda/holdem-simulator/releases/tag/v0.1.0
