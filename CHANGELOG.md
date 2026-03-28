# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Inconsistent (0.88-0.91): Wild Wendy, Jellande, Matusow, Ncotty Sguyen — 9-12%
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
- **Mike Matusow** (VPIP 28%, tilt 2.2x) — "The Mouth." Solid player who self-destructs on tilt. Explosive outbursts lead to reckless all-ins and wild bluffs.

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
