# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.1] - 2026-03-29

### Changed
- **Setup screen shows full table roster** — all active bots listed with seat number, name, PRO badge, VPIP, aggression, and inline swap dropdown. No need to open Advanced to see or change who's playing.
- **"Shuffle Players" button** always visible above the player list — click repeatedly to randomize the mix. Shows pro/fictional count summary.

## [0.9.0] - 2026-03-29

Pro player bots with real-world playstyles and per-persona tilt.

### Added

#### 10 Pro Player Bots
- **Phil Hellmuth** (VPIP 20%, tilt 2.5x) — Near-GTO baseline but goes on massive tilt after just 1-2 losses. Becomes a maniac when frustrated.
- **Daniel Negreanu** (VPIP 32%, tilt 0.5x) — Loves suited connectors from any position. Highest creative frequency among pros. Very tilt-resistant.
- **Phil Ivey** (VPIP 23%, tilt 0.3x) — Near-perfect play with rare, unpredictable mistakes. Almost untiltable — needs 10+ consecutive losses. The hardest bot to exploit.
- **Doyle Brunson** (VPIP 28%, tilt 0.4x) — Old-school power poker. Traps with monsters, overvalues top pair. Stoic under pressure.
- **Jennifer Tilly** (VPIP 30%, tilt 0.7x) — Unpredictable tight/loose mix. Plays position well but occasionally overcommits with draws.
- **Phil Laak** (VPIP 27%, tilt 0.6x) — Unorthodox and analytical. Highest creative frequency of all bots. Float bets, delayed aggression, hard to put on a hand.
- **Antonio Esfandiari** (VPIP 29%, tilt 0.9x) — Charismatic aggressor. Constant pressure with well-timed bluffs but can overplay position.
- **Gabe Kaplan** (VPIP 26%, tilt 0.8x) — Steady, intelligent, solid fundamentals. Rarely makes big mistakes but predictable bet sizing.
- **Jean-Robert Bellande** (VPIP 36%, tilt 1.4x) — Fearless gambler. Plays wide, bets big, loves action. Will bluff massive pots but tilts when caught.
- **Mike Matusow** (VPIP 28%, tilt 2.2x) — "The Mouth." Solid player who self-destructs on tilt. Explosive outbursts lead to reckless all-ins and wild bluffs.

#### Per-Persona Tilt System
- Each bot has a `tiltMultiplier` that scales how fast they tilt and how hard it hits
- Hellmuth (2.5x): tilts after 1 loss, massive stat swings
- Ivey (0.3x): needs 10+ losses, barely changes even when tilted
- Tilt trigger threshold, severity, and effect magnitude all scale per bot
- Caps raised: VPIP 65%, aggression 3.0, bluffFreq 50% to accommodate extreme tilt

#### Table Composition Rules
- Max 2 pro bots per randomly generated table
- No duplicate personas — every bot at the table is unique
- 17 total personas (7 fictional + 10 pro) — enough for any table size
- Users can manually swap any bot via the Advanced setup section

#### Pro Bot Tests (46 new tests in `phase4-pro-bots.test.ts`)
- All 9 pros exist with valid fields, PFR <= VPIP
- Per-persona behavioral verification: Hellmuth, Negreanu, Ivey, Brunson, Tilly
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
