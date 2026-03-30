# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/cschweda/holdem-simulator/releases/tag/v0.1.0
