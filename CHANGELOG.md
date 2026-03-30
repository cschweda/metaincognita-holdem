# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.3.1]: https://github.com/cschweda/holdem-simulator/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/cschweda/holdem-simulator/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/cschweda/holdem-simulator/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cschweda/holdem-simulator/releases/tag/v0.1.0
