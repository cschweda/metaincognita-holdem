# Hold'em Simulator

![Hold'em Simulator](app/public/og-image.png)

A browser-based No-Limit Texas Hold'em poker simulator with intelligent bot opponents, real-time hand analysis, and a comprehensive stats panel. Built for learning poker strategy through practice and observation.

- **Fisher-Yates shuffle** with chi-squared verified uniformity across 10,000 deals
- **Monte Carlo equity engine** -- 300-500 adaptive iterations against opponent ranges
- **Real-time outs and draws** -- flush, OESD, gutshot, overcards, set draws with exact hit probability
- **Pot odds + implied odds** with pass/fail verdict against your live equity
- **Authentic 6-max ranges** -- 169 hands ranked by EV, position-aware from UTG (15%) to BTN (42%)
- **7 bot personas** with distinct VPIP/PFR/aggression profiles and exploitable leaks
- **Opponent HUD** -- live VPIP, PFR, Aggression Factor, WTSD with strategic reads
- **Full hand evaluator** -- all 9 ranks, wheel/steel wheel detection, kicker tie-breaking
- **SPR guidance** -- stack-to-pot ratio advice for commitment decisions
- **Click-to-peek** -- flip any opponent's cards to study hand-vs-action correlation

## Features

### Poker Table
- 2-8 player tables with proper seat layout and position badges (UTG, MP, CO, BTN, SB, BB)
- Casino-dark aesthetic: emerald felt, walnut rail, gold accents
- Cards with CSS 3D flip animations
- Click any opponent's cards to peek at their hand (learning tool)
- Chip stacks with denomination breakdowns matching the selected stake level
- Light/dark mode (table felt stays emerald green in both)

### Real-Time Hand Analysis
- **Hand strength**: Chen score, preflop tier (Premium/Strong/Playable/Marginal/Trash), contextual hand descriptions ("Top Pair, Ace-kicker", "Nut Flush Draw")
- **Equity**: Monte Carlo simulation (300 iterations, adaptive to 500 in close spots) against random opponent ranges
- **Draws and outs**: Flush draws, straight draws (OESD/gutshot), overcards, set draws with hit probability by next card and by river
- **Pot odds**: Ratio, percentage, required equity, pass/fail verdict against your actual equity
- **SPR**: Stack-to-Pot Ratio with strategic guidance (low/medium/high SPR advice)
- **Rule of 2/4**: Quick mental math reference alongside exact calculations
- **Action recommendation**: FOLD / CHECK / CALL / RAISE with position-aware reasoning per street

### Hand Ranges
- Authentic 6-max cash game opening ranges by position (UTG 15% through BTN 42%)
- All 169 starting hands ranked by expected value
- Expandable lists categorized by pairs, suited, and offsuit hands
- In-range indicator showing whether your current hand falls within each range
- Facing-aggression ranges: 3-bet (8%), call-vs-3-bet (12%), 4-bet (3.5%), 5-bet (1.5%)

### Opponent Stats (HUD)
- Per-player stats: VPIP, PFR, Aggression Factor, Went-to-Showdown %
- Player type labels: Nit, Tight, Solid, Loose, Very Loose
- Aggression labels: Passive, Balanced, Aggressive, Hyper-aggressive
- Strategic reads: "Nit -- 3-bet liberally, steal their blinds", "Calling station -- don't bluff, value bet thin"

### Betting Controls
- Fold / Check / Call buttons with live amounts
- Raise presets: 1/4 pot, 1/2 pot, 3/4 pot, pot, all-in
- Continuous slider from min-raise to all-in (steps by BB)
- Custom exact-amount input with keyboard enter support
- All amounts clamped: never below min-raise, never above your stack
- Prominent bankroll display with running P&L and +/- from starting stack

### Bot Configurator

The advanced setup section lets you fine-tune every opponent at the table. Each bot can use a named persona, a quick-select preset, or fully custom stats.

**7 Named Personas** -- each with a distinct playstyle and exploitable leak:

| Persona | VPIP | PFR | Aggression | Leak |
|---------|------|-----|------------|------|
| Tight Tony | 14% | 11% | 0.85 | Folds too much to 3-bets, won't bluff rivers |
| Loose Lucy | 38% | 22% | 1.10 | Plays too many hands, especially suited junk |
| Aggressive Alex | 26% | 22% | 1.40 | Over-bets draws, 3-bets too wide |
| Calling Carl | 30% | 12% | 0.60 | Calls too much postflop, rarely raises |
| Tricky Tina | 24% | 18% | 1.15 | Slow-plays big hands, check-raises too often |
| Solid Sam | 22% | 17% | 1.00 | Nearly GTO -- the toughest bot at the table |
| Wild Wendy | 34% | 28% | 1.50 | Massive over-aggression, 25% bluff frequency |

**6 Quick-Select Presets** for instant archetype assignment:

| Preset | VPIP | PFR | Aggression | Style |
|--------|------|-----|------------|-------|
| Nit | 12% | 9% | 0.70 | Ultra-tight, folds everything marginal |
| Tight | 18% | 14% | 0.90 | Solid, conservative, few leaks |
| TAG | 22% | 18% | 1.20 | The winning style -- selective but aggressive |
| LAG | 30% | 24% | 1.40 | Wide range, lots of pressure |
| Loose-Passive | 35% | 14% | 0.50 | Calls everything, rarely raises |
| Maniac | 40% | 32% | 1.60 | Plays almost every hand, maximum aggression |

**Custom Sliders** -- tweak any individual stat per bot:

| Stat | Range | What it controls |
|------|-------|------------------|
| VPIP | 10-50% | How many hands the bot plays (tight vs loose) |
| PFR | 5-40% | How often it raises preflop (passive vs aggressive) |
| Aggression | 0.3-2.0 | Multiplier on postflop bets and raises |
| Bluff Frequency | 3-30% | How often it bets with nothing |
| Creative Frequency | 1-15% | Limp-reraises, donk bets, check-raise bluffs |

**Dynamic features:**
- **Auto-naming**: Bot names update when stats drift from the preset ("Loose Lucy" becomes "Aggro Lucy" if you crank aggression, or "Nitty Lucy" if you tighten VPIP)
- **Plain-English summary**: A real-time description below each bot explains the combined effect of all sliders ("This is a very loose, passive player who prefers calling over raising preflop. Bluffs frequently -- call them down with medium-strength hands.")
- **Randomize All**: Shuffle persona assignments across all seats
- **All Same**: Set every bot to the same preset for controlled experiments

### Tilt System
- Bots go on tilt after 3 consecutive losses (configurable) or losing >30% of stack in one hand
- **Mild tilt** (3 losses): VPIP +4%, aggression +0.15, bluff freq +3%
- **Full tilt** (5+ losses or big loss): VPIP +8%, PFR +4%, aggression +0.3, bluff freq +6%
- Even the tightest bot plays junk hands from UTG when fully tilted
- Tilt decays over 3-6 hands, then returns to baseline
- Visual indicator: "TILTED" (orange) or "FULL TILT" (red, pulsing) badge on nameplate

### Session Management
- **5-minute hero timeout**: Inactivity auto-folds current hand, pauses game, saves session. Resume or end from pause screen.
- **Bust-out detection**: Hero at 0 chips triggers bust screen with session summary
- **Re-buy**: Start a new session at original starting stack. Bust-out and re-buy tracked as separate sessions — lifetime profit sums independently.
- **Auto-save**: Session saved to Supabase every 60 seconds and on tab close (via `sendBeacon`)
- **Session stats tab**: Hands played, W/L/F breakdown, bankroll (current/peak/start), win rate, Supabase sync indicator
- **Export**: Download session as JSON or CSV
- **Stats navigation preserves game state**: Click Stats mid-hand, view your analytics, click "Back to Table" — cards, bets, and street are exactly as you left them

### Action Status Indicators
- **Bot thinking**: Centered pill between table and bet controls — bot name with bouncing dots
- **Your Turn**: Amber pill between table and bet controls — shows call amount or "check or bet" hint

### Stat Tooltips
- Hover any dotted-underlined label to learn what it means
- **Equity**: Monte Carlo simulation methodology
- **Chen Score**: Preflop hand strength formula (0-20)
- **Position**: Context-specific guidance (BTN=wide range, UTG=top 15%, SB=worst postflop)
- **Pot Odds**: When calling is mathematically profitable
- **SPR**: Stack-to-pot ratio and commitment thresholds
- **Draws & Outs**: What draws and outs mean, how they affect your chances
- **Recommendation**: Color-coding system (green=confident, yellow=marginal, red=fold)

### Authentication
- **Not signed in**: Default for visitors. Session stats saved to localStorage only. Yellow "Local" indicator.
- **GitHub OAuth**: Sign in to sync stats across devices and sessions. Green indicator with username.
- **Email/Password**: Create an account with email + password (8+ chars, uppercase, lowercase, number). Bcrypt hashed by Supabase.
- Prominent sign-in options on the setup screen

### Hand Replay (`/replay`)
- Click **"Replay"** on any hand in the stats page to re-live it
- Same hole cards, same board, same players and positions
- Hero gets full bet controls at each decision point to try different lines
- Bots re-run their AI (probabilistic — may vary slightly each replay)
- **Comparison panel** at showdown: Original result vs Replay result with profit difference
- Original and replay play-by-play shown side by side
- **"Replay Again"** button to try the same hand multiple times
- Works with both localStorage and Supabase hand data

### Stats Page (`/stats`)
- **Overview**: Lifetime hands, profit, avg pot, hands/session, winning/losing session counts, best/worst session, win rate, showdown rate, won-at-showdown %, fold rate, profit trend sparkline, performance by position
- **Sessions**: History cards with per-session stats, individual delete with confirmation, per-session JSON/CSV export
- **Hands**: Click any row to expand — hero cards, board with labeled streets (Flop/Turn/River), all players' hole cards + positions + fold status, scrollable play-by-play action log, replay button
- **Export**: Lifetime JSON/CSV (all data) and per-session JSON/CSV
- **Delete**: Per-session delete or delete all lifetime data — both with confirmation dialogs. Deletes from Supabase and localStorage simultaneously.
- Supabase connection indicator on every page
- Works on Netlify — all queries run client-side

### Authentic Deal Sequence
- Fisher-Yates shuffled 52-card deck (statistically uniform, no duplicates)
- Burn cards before flop, turn, and river
- Preflop -> Flop (3) -> Turn (1) -> River (1) -> Showdown
- Hero sees hole cards face-up; opponents face-down until showdown (or click-to-peek)

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Nuxt 4 (`ssr: false` -- static SPA) |
| UI | Nuxt UI v4 |
| Styling | Tailwind CSS v4 |
| State | Pinia (planned), reactive refs (current) |
| Persistence | Supabase (anonymous auth, RLS) + localStorage fallback |
| Package Manager | Yarn 1.22.22 |
| Deployment | Netlify (static) |
| Testing | Vitest |

## Getting Started

```bash
# Install dependencies
yarn install

# Start dev server
yarn dev

# Run tests
yarn test

# Build for production (static SPA)
yarn generate
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How Bot Behavior Works

Each bot's decisions are driven by a probabilistic engine (`app/utils/botDecision.ts`) that uses the persona's config values — VPIP, PFR, aggression, bluffFreq, and creativeFreq — as direct probability weights for every action. This means a bot's observed behavior over many hands statistically aligns with its configured profile.

### Decision Engine

**Preflop:**
- Facing no raise: raise with probability = PFR; otherwise check
- Facing a raise: call with probability = VPIP * 0.7 (tighter vs raises); 3-bet with probability = PFR * 0.35 * aggression; fold the rest
- Facing a large re-raise: range tightens further

**Postflop (no bet facing):**
- Bluff bet with probability = bluffFreq (independent roll — this is the pure bluff path)
- Value/protection bet with probability = 0.22 * aggression (separate roll)
- Otherwise check

**Postflop (facing a bet):**
- Bluff raise with probability = bluffFreq * 0.5 * aggression
- Fold to large bets (>75% pot) with probability = 1 - VPIP * 1.2
- Value raise with probability = 0.10 * aggression
- Call with probability = VPIP * 1.3 * (1 - potOdds)
- Otherwise fold

Each decision path uses an independent random roll, so bluffFreq has a direct, measurable effect on bluffing frequency independent of aggression-based value bets.

### Why It's Accurate

The engine is tested with 100,000-hand simulations per persona using `simulateBotStats()`. This function runs a bot through realistic preflop and postflop scenarios (facing raises ~60% of the time preflop, facing bets ~50% of the time postflop) and measures observed VPIP, PFR, fold rate, raise rate, and bluff rate.

**What the tests verify:**
- **Absolute alignment**: Each persona's observed VPIP and PFR fall within a tolerance band of their configured values (e.g., Tight Tony's observed VPIP is within 12% of his configured 14%)
- **Comparative ordering**: Tighter bots always fold more than looser bots; aggressive bots always raise more than passive bots; high-bluff bots always bluff more than low-bluff bots
- **Bluff sensitivity**: Increasing bluffFreq produces a measurable increase in observed bluff rate; doubling the config reliably increases the behavior
- **PFR/VPIP ratio**: TAG bots raise a high proportion of hands they play; Loose-Passive bots call much more than they raise
- **Preset distinctness**: Nit folds the most, Maniac plays the most, Loose-Passive has high VPIP but low raise rate

### Test Coverage (46 tests in `phase4-bot-behavior.test.ts`)

| Category | Tests | What's Verified |
|----------|-------|-----------------|
| Tight Tony | 6 | Low VPIP, low PFR, PFR <= VPIP, bluffs less than Wendy, folds more than Lucy |
| Loose Lucy | 4 | High VPIP, plays more than Tony, PFR matches config |
| Aggressive Alex | 3 | Raises more than Carl postflop, bluff rate reflects config |
| Calling Carl | 3 | Low fold rate, raises less than Alex, bluffs less than Alex |
| Wild Wendy | 5 | High VPIP, bluffs more than all others, high raise rate |
| Solid Sam | 4 | Moderate VPIP, healthy PFR/VPIP ratio, bluffs less than Wendy |
| Comparative ordering | 6 | VPIP order matches config order, bluff order matches config order |
| Preset archetypes | 5 | Nit folds most, Maniac plays most, TAG has high PFR ratio, LAG plays wide + raises |
| Bluff-specific | 5 | Low bluffFreq < high bluffFreq, increasing config increases observed rate |
| Decision function | 4 | Valid action types, raise never exceeds stack, passive bot mostly checks, nit folds preflop |

## Project Structure

```
holdem-simulator/
├── app/
│   ├── assets/css/main.css        # Tailwind + Nuxt UI imports, CSS variables
│   ├── components/
│   │   ├── BetControls.vue        # Fold/check/call/raise with slider and presets
│   │   ├── ChipStack.vue          # Visual chip denomination display
│   │   ├── PlayingCard.vue        # Card face/back with CSS 3D flip
│   │   ├── PlayerSeat.vue         # Nameplate, cards, chips, click-to-peek
│   │   ├── PokerTable.vue         # Felt table with polar-coordinate seat layout
│   │   ├── PositionBadge.vue      # D/SB/BB/UTG/CO/MP position badges
│   │   ├── SetupScreen.vue        # Game config + advanced bot configurator
│   │   ├── StatsPanel.vue         # 4-tab panel: Live, Session, Ranges, Table
│   │   └── SupabaseStatus.vue     # Connection indicator (green/red dot)
│   ├── composables/
│   │   ├── useSessionStats.ts     # Session tracking, export, auto-save
│   │   └── useSupabase.ts         # Supabase client + anonymous auth
│   ├── pages/
│   │   ├── index.vue              # Main game page
│   │   ├── replay.vue             # Hand replay — re-live any hand with different choices
│   │   └── stats.vue              # Cross-session analytics from Supabase
│   ├── public/
│   │   ├── og-image.svg           # Open Graph social image (SVG source)
│   │   └── og-image.png           # Open Graph social image (1200x630 PNG)
│   └── utils/
│       ├── cards.ts               # Card types, suit symbols, pip layouts
│       ├── chips.ts               # Chip denomination breakdowns by stake tier
│       ├── handAnalysis.ts        # Hand evaluator, draws, equity, recommendations
│       ├── ranges.ts              # 169 starting hands + position-based ranges
│       └── seats.ts               # Position assignment + polar coordinate layout
├── tests/                         # Vitest test suites
├── docs/
│   └── holdem-simulator-design.md # Full 6-phase design document
├── nuxt.config.ts                 # Nuxt 4 config with OG meta tags
├── netlify.toml                   # Static deploy config with SPA redirect
└── vitest.config.ts
```

## Configuration

All game parameters are centralized in `holdem.config.ts` (project root):

- **Stakes**: 6 preset levels (Micro $0.25/$0.50 through Nosebleed $25/$50)
- **Stack depth**: 50-200 BB slider, default 100 BB
- **Chip denominations**: 4 tiers mapped to stake levels
- **Bot personas**: 7 named characters with distinct VPIP/PFR/aggression profiles
- **Archetype presets**: 6 quick-select templates (Nit through Maniac)
- **Custom ranges**: Min/max/step for every bot slider
- **Equity thresholds**: Value bet, thin value, drawing, give-up cutoffs
- **Bet sizing**: Open raises, 3-bets, value bets, bluffs, protection bets, overbets
- **Tilt mechanics**: Consecutive loss trigger (default 3), big loss threshold (30%), mild/full severity breakpoints, aggression/VPIP/bluff/PFR boost magnitudes, decay duration
- **Session management**: Hero timeout (default 5 min), auto-save interval (60s), re-buy enabled toggle
- **Animation timing**: Deal stagger, bot thinking delay, showdown pause
- **Stats thresholds**: Min hands for display, persona reveal threshold

## Test Suites

Run all tests: `yarn test`

### Phase 1 -- Seats (`phase1-seats.test.ts`)
- Position labels correct for all table sizes: heads-up (2) through full ring (8)
- Dealer rotation shifts all positions correctly
- Heads-up special case: D/SB and BB
- 4-player case: no CO position (UTG is directly right of dealer)

### Phase 2 -- Deck & Shuffle (`phase2-deck.test.ts`)
- Deck has exactly 52 unique cards, 4 suits x 13 ranks
- **Shuffle randomness (chi-squared)**: Ace of Spades and 2 of Hearts distribute uniformly across all 52 positions over 10,000 shuffles (chi-squared < 82.29 at 99% confidence)
- **No positional bias**: No card stays in its original position more than 4% of the time
- **No rank clustering**: First card isn't always high or low
- **No suit correlation**: Adjacent cards in shuffled deck share suits at the expected ~23.5% rate
- Shuffle does not mutate the original deck
- **Deal and burn simulation**: Correct card count for all table sizes (2-8 players)
- **Burns verified**: Exactly 3 burn cards dealt, each different from all other dealt cards
- **No duplicates**: No card appears in more than one location (hole cards, community, burns)
- **Remaining deck integrity**: Unused deck cards don't overlap with dealt cards
- **Statistical frequency**: Aces dealt at ~14.9%, pocket pairs at ~5.9%, suited hands at ~23.5% over 5,000 deals
- Hero gets varied hands and flops vary across 100 consecutive deals

### Phase 2 -- Hand Evaluator (`phase2-evaluator.test.ts`)
- All 9 hand ranks detected: high card through straight flush
- **Edge cases**: Wheel (A-2-3-4-5) scored as 5-high, steel wheel as straight flush, Broadway as Ace-high, Royal Flush named correctly
- Non-straights rejected: A-2-3-4-6 (gap), K-A-2-3-4 (wrap-around)
- **Tie-breaking**: Pair with K-kicker beats pair with Q-kicker, two pair tiebreakers, full house trip-rank comparison
- **Flush comparison**: Rank-by-rank descending (4th card breaks ties)
- **Split pots**: Identical best-five hands tie correctly
- Best-five selection from 7 cards (ignores weak hole cards)
- Performance: 8-player evaluation in under 5ms

### Phase 2 -- Random Hand Assessment (`phase2-random-hands.test.ts`)
- **1,000 random deals**: Every hand evaluates to a valid rank (0-8)
- **10,000-hand distribution**: One pair is most common (~43%), frequencies decrease monotonically for higher ranks, straight flush < 0.2%
- **Multi-player showdown**: Winner determination correct in 200 random 6-player showdowns
- **Rank ordering**: Higher hand rank always beats lower across 500 deals
- **Board-play ties**: Both players using the board results in a split
- **Crash resilience**: 5,000 random deals (2-8 players) without errors

### Phase 3 -- Betting (`phase3-betting.test.ts`)
- BB = 2x SB for all stake levels
- Min-raise increments tracked correctly (BB=10, raise to 30, next raise >= 50)
- Raise presets clamp up to min-raise and down to all-in
- **Bet guards**: Raise capped to remaining stack, call capped for short stacks, custom input clamped, chips never go negative
- All-in for less than a full raise doesn't reopen betting
- Side pots: 3-way all-in at $50/$120/$300 creates correct main pot ($150) and side pots ($140, $180)
- Card count: 2xN hole + 3 burns + 5 community = correct total
- **Bust-out**: 0 chips = eliminated, positive chips = still active

### Phase 3 -- Street Betting Flow (`phase3-street-betting.test.ts`)
- **needsToAct state machine**: All active players in set at street start; folded, eliminated, and all-in excluded; player removed after acting; raise re-adds all others; round ends only when set is empty
- **Re-raise flow**: Second raise requires full additional pass before street advances
- **Street progression**: Correct community card count per street (0/3/4/5/5); streets advance in order; street does NOT advance while needsToAct has players
- **Full hand simulation**: 4 complete betting rounds before showdown; early hand end when all but one fold; state resets (betThisRound, currentBet, lastAction) verified between streets
- **Action order**: Preflop starts left of BB (UTG); postflop starts left of dealer; postflop skips folded players; action wraps around table correctly
- **Edge cases**: Heads-up completes after both act; 3-bet pot with folds and calls resolves correctly; everyone checks completes round; single active player ends hand immediately

### Phase 4 -- Bot AI Config (`phase4-bot-ai.test.ts`)
- All persona stats within valid ranges (VPIP 10-50%, PFR <= VPIP, etc.)
- Enough personas for maximum opponents (7)
- Solid Sam has aggression = 1.0 (closest to GTO)
- Wild Wendy has highest bluff frequency
- UTG tighter than BTN, BTN is widest opening range
- Escalation ranges narrow: 3-bet > 4-bet > 5-bet
- Equity thresholds ordered: value > thin value > drawing > give up
- Open raise EP larger than late position, 3-bet OOP larger than IP
- Tilt: reasonable trigger threshold, decays in 3-5 hands, max aggression < 2.0

### Phase 4 -- Bot Behavior Statistical Alignment (`phase4-bot-behavior.test.ts`)
- **Per-persona (100,000 hands each)**: Tight Tony (low VPIP/PFR, folds more than Lucy, bluffs less than Wendy), Loose Lucy (high VPIP, plays more than Tony), Aggressive Alex (raises more than Carl, bluff rate matches config), Calling Carl (low fold rate, low raise rate), Wild Wendy (highest bluff rate of all personas, high raise rate), Solid Sam (moderate VPIP, healthy PFR/VPIP ratio)
- **Comparative ordering**: Configured VPIP order matches observed VPIP order; configured bluffFreq order matches observed bluff order; tight bots fold more, loose bots play more, aggressive bots raise more
- **Preset archetypes**: Nit folds most, Maniac plays most, Loose-Passive has high VPIP but low raise rate, TAG has high PFR/VPIP ratio
- **Bluff sensitivity**: Low bluffFreq produces lower bluff rate than high bluffFreq; increasing bluffFreq measurably increases observed rate; high aggression + high bluffFreq produces most betting into unchallenged pots
- **Decision function**: Valid action types across 100 calls, raise never exceeds stack, passive bot mostly checks, nit folds >60% preflop vs raises

### Phase 4 -- Tilt System (`phase4-tilt.test.ts`)
- **Triggers**: Consecutive losses at configurable threshold, big pot loss, winning resets loss count but not active tilt
- **Severity**: Mild (0.5) at 3 losses, full (1.0) at 5+ or big loss, continues escalating with more losses
- **Decay**: Per-hand countdown, clears at 0, duration within configured range, no-op when not tilted
- **Profile modification**: VPIP/PFR/aggression/bluff all increase proportional to severity, caps enforced (VPIP 60%, aggression 2.5)
- **Behavioral impact (100K hands)**: Tilted Tony has higher VPIP, bluffs more, raises more; mild < full tilt; even Solid Sam plays looser on tilt

### Phase 5 -- Stats (`phase5-stats.test.ts`)
- VPIP = voluntary hands / total hands; BB walks excluded
- Aggression factor = (bets + raises) / calls; caps at 999 for zero calls
- Pot odds: ratio and percentage calculated correctly; zero-to-call handled
- Outs: flush draw = 9, OESD = 8, gutshot = 4, combined flush + gutshot = 12 (overlap deducted)
- Probability: Rule of 2 approximation, exact single-card, exact flop-to-river
- BB/hand metric for positive, negative, and breakeven sessions

### Phase 5 -- Session Management (`phase5-session.test.ts`)
- **Timeout**: Fires after 5 min, resets on hero activity, doesn't fire with continuous play, no duplicate timers from rapid actions
- **Bust-out**: Detected at 0 chips, not triggered with positive chips, all-in loss vs all-in win
- **Re-buy**: Fresh stack, new session ID, independent P&L from bust-out session, multiple bust-outs tracked correctly
- **Session recording**: All fields captured, folded hands record 0 profit, stats accumulate, peak stack tracks highest point
- **Data deletion**: Session + hands removed together, delete-all empties everything, lifetime stats recalculate to zero

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| **1** | Done | Visual foundation -- table, cards, chips, setup, stats panel, bet controls |
| **2** | Partial | Core engine -- deck + shuffle done, hand evaluator done, showdown resolver planned |
| **3** | Partial | Game loop -- betting round state machine done, side pots + blind rotation planned |
| **4** | Done | Bot AI -- persona-driven decisions, tilt system, bluff awareness, 100K-hand behavioral tests |
| **5** | Done | Stats -- Supabase persistence, session tracking, cross-session analytics, CSV/JSON export, timeout, bust-out/re-buy |
| **6** | Planned | Polish -- dealing animations, chip movement, bot thinking delays, celebrations |

## Future Enhancements

- **Supabase hand history**: Store every hand for cross-session analytics (user has Supabase subscription)
- **Tournament mode**: Increasing blinds on a timer, eliminations, final table
- **Hand replayer**: Step through any saved hand action-by-action with visualized board
- **Leak finder**: Analyze hand history for patterns ("You lose 80% of hands where you call a 3-bet with KJo")
- **Bot difficulty slider**: Scale all bots between Beginner and Shark
- **Multiplayer**: WebSocket-based real players (would require a server)
- **Hand history export**: PokerStars-format .txt for import into PokerTracker / Hold'em Manager

## License

Private project.
