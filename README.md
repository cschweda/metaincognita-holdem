# No Limit Hold'em Simulator

![No Limit Hold'em Simulator](app/public/og-image.png)

A browser-based No-Limit Texas Hold'em poker simulator with 27 intelligent bot opponents (including 20 pro-inspired personas), real-time hand analysis, and comprehensive cross-session stats. Built for learning poker strategy through practice, observation, and hand replay.

- **Card-aware bot AI** -- bots evaluate actual hole cards and board texture, not just random probabilities
- **Street-aware decisions** -- c-betting, double-barreling, giving up with air, multiway pot adjustments
- **Preflop escalation** -- full 3-bet/4-bet/5-bet logic with per-persona frequencies
- **Hero adaptation** -- bots adjust to your play style over a rolling 10-hand window
- **Fisher-Yates shuffle** with chi-squared verified uniformity across 10,000 deals
- **Monte Carlo equity engine** -- 500-800 adaptive iterations against opponent ranges
- **Real-time outs and draws** -- flush, OESD, gutshot, overcards, full house, trips draws with exact hit probability
- **Pot odds** with pass/fail verdict against your live equity
- **Authentic 6-max ranges** -- 169 hands ranked by EV, position-aware from UTG (15%) to BTN (42%)
- **25 bot personas** (7 fictional + 18 pro) with VPIP/PFR/aggression/bluff/tilt/consistency profiles
- **Per-persona tilt** -- Phellmuth tilts after 1 loss; Pvey needs 10+ consecutive losses
- **Consistency system** -- bots occasionally misplay (1-12% depending on persona)
- **Opponent HUD** -- live VPIP, PFR, Aggression Factor, WTSD with strategic reads
- **Full hand evaluator** -- all 9 ranks, wheel/steel wheel detection, kicker tie-breaking
- **PokerStars hand history export** -- compatible with PokerTracker, Hold'em Manager, Equilab
- **Hand replay** -- re-live any hand with different decisions, compare outcomes
- **Supabase persistence** -- cross-session lifetime stats with GitHub or email auth

## Features

### Poker Table
- 2-8 player tables with proper seat layout and position badges (UTG, MP, CO, BTN, SB, BB)
- Casino-dark aesthetic: emerald felt, walnut rail, gold accents
- Cards with CSS 3D flip animations
- Click any opponent's cards to peek at their hand (learning tool)
- Light/dark mode (table felt stays emerald green in both)

### Real-Time Hand Analysis
- **Hand strength**: Chen score, preflop tier (Premium/Strong/Playable/Marginal/Trash), contextual hand descriptions ("Top Pair, Ace-kicker", "Nut Flush Draw")
- **Equity**: Monte Carlo simulation (300 iterations, adaptive to 500 in close spots) against random opponent ranges
- **Hand improvement probabilities**: Per-rank % chance of making each hand by the river (e.g., "Flush: 19.2%", "Two Pair: 32.4%")
- **Draws and outs**: Flush draws, straight draws (OESD/gutshot), overcards, set draws with hit probability by next card and by river
- **Pot odds**: Ratio, percentage, required equity, pass/fail verdict against your actual equity
- **SPR**: Stack-to-Pot Ratio with strategic guidance (low/medium/high SPR advice)
- **Rule of 2/4**: Quick mental math reference alongside exact calculations
- **Action recommendation**: FOLD / CHECK / CALL / RAISE with position-aware reasoning per street. Color-coded: green (confident), yellow (marginal), red (fold).

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
- Fold / Check / Call buttons with live amounts and tooltips
- Raise presets: 1/4 pot, 1/2 pot, 3/4 pot, pot, all-in (click to raise instantly)
- Presets below min-raise are dimmed and disabled with tooltip explanation
- Continuous slider from min-raise to all-in (steps by BB) with min-raise indicator
- Custom exact-amount input with keyboard enter support
- All amounts clamped: never below min-raise, never above your stack
- Prominent bankroll display with running P&L and +/- from starting stack
- **Pre-action queuing**: "Pre-fold" and "Pre-check/call" buttons while bots are acting. Cancel anytime before your turn.

### Bot Configurator

The setup screen shows your full table roster with inline controls. Each bot can use a named persona, a quick-select preset, or fully custom stats.

**7 Fictional Personas** -- each with a distinct playstyle and exploitable leak:

| Persona | VPIP | PFR | Aggression | Consistency | Leak |
|---------|------|-----|------------|-------------|------|
| Tight Tony | 14% | 11% | 0.85 | 95% | Folds too much to 3-bets, won't bluff rivers |
| Loose Lucy | 38% | 22% | 1.10 | 92% | Plays too many hands, especially suited junk |
| Aggressive Alex | 26% | 22% | 1.40 | 93% | Over-bets draws, 3-bets too wide |
| Calling Carl | 30% | 12% | 0.60 | 90% | Calls too much postflop, rarely raises |
| Tricky Tina | 24% | 18% | 1.15 | 94% | Slow-plays big hands, check-raises too often |
| Solid Sam | 22% | 17% | 1.00 | 97% | Nearly GTO -- the toughest fictional bot |
| Wild Wendy | 34% | 28% | 1.50 | 88% | Massive over-aggression, 25% bluff frequency |

**18 Pro Player Bots** -- modeled after real-world poker legends with per-persona tilt and consistency:

| Pro | VPIP | Style | Tilt | Consistency |
|-----|------|-------|------|-------------|
| Hill Phellmuth | 20% | Near-GTO, massive tilt after losses | 2.5x | 96% |
| Naniel Degreanu | 32% | Suited connectors from any position, creative | 0.5x | 96% |
| Ihil Pvey | 23% | Near-perfect, rare mistakes, almost untiltable | 0.3x | 99% |
| Boyle Drunson | 28% | Power poker, traps with monsters | 0.4x | 96% |
| Tennifer Jilly | 30% | Unpredictable tight/loose mix | 0.7x | 91% |
| Lhil Paak | 27% | Unorthodox, analytical, float bets | 0.6x | 93% |
| Entonio Asfandiari | 29% | Charismatic aggressor, constant pressure | 0.9x | 94% |
| Kabe Gaplan | 26% | Steady, intelligent, solid fundamentals | 0.8x | 95% |
| Bean-Robert Jellande | 36% | Fearless gambler, huge bluffs | 1.4x | 90% |
| Mike Matusow | 28% | Solid until tilt -- then reckless all-ins | 2.2x | 91% |
| Mhris Coneymaker | 30% | Online grinder, occasional overplays | 1.1x | 92% |
| Rhip Ceese | 24% | Legendary, near-zero leaks, ice cold | 0.3x | 98% |
| Utu Sngar | 26% | Genius reads, fearless, erratic brilliance | 1.0x | 93% |
| Sanessa Velbst | 25% | Fearless aggressor, relentless 3-bets | 0.8x | 95% |
| Serik Eidel | 21% | Quiet assassin, tight, patient, untiltable | 0.3x | 98% |
| Dom Twan | 31% | "durrrr" hyper-LAG, massive bluffs | 0.5x | 95% |
| Aatrik Pantonius | 24% | Finnish ice, calm, precise | 0.4x | 97% |
| Ncotty Sguyen | 30% | Loose-aggressive with flair, tilts on bad beats | 1.2x | 91% |
| Cohnny Jhan | 22% | Old-school TAG, traps, patient, consistent | 0.5x | 97% |
| Krynn Benney | 25% | Modern GTO high-roller, creative lines | 0.6x | 95% |

**Table composition:**
- **Pro count selector**: 0 / 1 / 2 / 3 / All pros per table (default 2)
- **Shuffle Players** button to randomize the mix (click repeatedly)
- **Inline swap dropdown** on each seat to pick any persona
- **PRO badge** on pro bots, VPIP and aggression stats at a glance
- No duplicate personas at a table

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
- **Auto-naming**: Bot names update when stats drift from the preset ("Loose Lucy" becomes "Aggro Lucy" if you crank aggression)
- **Plain-English summary**: Real-time description of what all sliders mean together

### Tilt System
- Per-persona tilt multiplier scales how fast they tilt and how hard it hits
- **Phellmuth (2.5x)**: Tilts after 1 loss, massive stat swings
- **Pvey (0.3x)**: Needs 10+ consecutive losses, barely changes even when tilted
- **Mild tilt**: VPIP +4%, aggression +0.15, bluff freq +3%
- **Full tilt**: VPIP +8%, PFR +4%, aggression +0.3, bluff freq +6%
- Tilt decays over 3-6 hands, then returns to baseline
- Visual indicator: "TILTED" (orange) or "FULL TILT" (red, pulsing) badge on nameplate

### Consistency System
- Each bot has a consistency rating (0.88-0.99)
- Before each decision, rolls against consistency. On fail, makes a random off-strategy play.
- **Near-perfect (0.98-0.99)**: Ihil Pvey, Rhip Ceese, Serik Eidel -- misplay ~1-2% of decisions
- **Very disciplined (0.95-0.97)**: Solid Sam, Boyle Drunson, Aatrik Pantonius, Cohnny Jhan
- **Mostly solid (0.92-0.94)**: Degreanu, Utu Sngar, Coneymaker, Lhil Paak
- **Inconsistent (0.88-0.91)**: Wild Wendy, Jellande, Matusow, Ncotty Sguyen

### Session Management
- **5-minute hero timeout**: Inactivity auto-folds current hand, pauses game, saves session. Resume or end from pause screen.
- **Bust-out**: Showdown results display first, then "Buy More Chips" (re-buy) or "Cash Out" options
- **Re-buy**: Starts a new session at original starting stack. Tracked independently in lifetime stats.
- **Auto-save**: Session saved to Supabase every 60 seconds and on tab close (via `sendBeacon`)
- **Speed after fold**: Bot actions run ~5x faster when hero has folded
- **Stats navigation preserves game state**: Click Stats mid-hand, view analytics, come back to exact same game state

### Action Status Indicators
- **Bot thinking**: Centered pill between table and bet controls with bouncing dots
- **Your Turn**: Amber pill with call amount or "check or bet" hint
- **Pre-action queue**: Shows queued action with cancel button

### Stat Tooltips
- Hover any dotted-underlined label for an explanation
- Covers: Equity, Chen Score, Position, Pot Odds, SPR, Draws & Outs, Recommendation

### Authentication
- **Not signed in**: Session stats saved to localStorage only. Yellow "Local" indicator.
- **GitHub OAuth**: Sign in to sync stats across devices and sessions. Green indicator with username.
- **Email/Password**: Create an account (8+ chars, uppercase, lowercase, number). Bcrypt hashed by Supabase.

### Hand Replay (`/replay`)
- Click **"Replay"** on any hand in the stats page to re-live it
- Same hole cards, same board, same players and positions
- Hero gets full bet controls at each decision point to try different lines
- Bots re-run their AI (probabilistic -- may vary slightly each replay)
- **Comparison panel** at showdown: Original result vs Replay result with profit difference
- **"Replay Again"** button to try the same hand multiple times

### Stats Page (`/stats`)
- **Overview**: Lifetime hands, profit, avg pot, hands/session, winning/losing session counts, best/worst session, win rate, showdown rate, won-at-showdown %, fold rate, profit trend sparkline, performance by position
- **Sessions**: History cards with per-session stats, individual delete, per-session JSON/CSV/PokerStars export
- **Hands**: Click any row to expand -- PokerStars-format hand history with color-coded streets, all players' hole cards, and per-hand export
- **Export**: Lifetime and per-session in JSON, CSV, and PokerStars .txt (compatible with PokerTracker, Hold'em Manager, Equilab)
- **Delete**: Per-session or all lifetime data with confirmation dialogs
- **Winner shown at showdown** for every outcome (win, loss, fold) with cards and amount

### Authentic Deal Sequence
- Fisher-Yates shuffled 52-card deck (statistically uniform, no duplicates)
- Burn cards before flop, turn, and river
- Preflop -> Flop (3) -> Turn (1) -> River (1) -> Showdown
- Hero sees hole cards face-up; opponents face-down until showdown (or click-to-peek)
- Early wins (everyone folds) don't show undealt streets

## How Bot Behavior Works

Each bot's decisions are driven by a probabilistic engine (`app/utils/botDecision.ts`) that uses the persona's config values as direct probability weights. The consistency system adds occasional off-strategy plays, and the tilt system widens ranges after losses. Over many hands, observed behavior statistically aligns with configured profiles.

### Decision Engine

**Consistency check** (fires first):
- Roll against consistency (0.88-0.99). If miss, return a random weighted action instead of the calculated one.

**Preflop:**
- Facing no raise: raise with probability = PFR; otherwise check
- Facing a raise: call with probability = VPIP * 0.7; 3-bet with probability = PFR * 0.35 * aggression; fold the rest

**Postflop (no bet facing):**
- Bluff bet with probability = bluffFreq (independent roll)
- Value bet with probability = 0.22 * aggression (separate roll)
- Otherwise check

**Postflop (facing a bet):**
- Bluff raise with probability = bluffFreq * 0.5 * aggression
- Fold to large bets (>75% pot) with probability = 1 - VPIP * 1.2
- Value raise with probability = 0.10 * aggression
- Call with probability = VPIP * 1.3 * (1 - potOdds)
- Otherwise fold

### Testing Approach

Three levels of verification, each more realistic than the last:

| Level | Hands/Bot | What it tests | Speed |
|-------|-----------|---------------|-------|
| **Simplified** (`phase4-bot-behavior`) | 100K | Pure probability engine, no cards | ~30ms |
| **Universal** (`phase4-all-personas`) | 500K | All 25 bots, stat alignment, ordering | ~230ms |
| **Realistic** (`phase4-realistic-sim`) | 50K | Real cards, hand evaluator, position variation, tilt lifecycle | ~16s |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Nuxt 4 (`ssr: false` -- static SPA) |
| UI | Nuxt UI v4 |
| Styling | Tailwind CSS v4 |
| State | Reactive refs (Vue 3 Composition API) |
| Persistence | Supabase (GitHub OAuth, email/password, RLS) + localStorage fallback |
| Package Manager | Yarn |
| Deployment | Netlify (static) |
| Testing | Vitest (666 tests) |

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

## Project Structure

```
holdem-simulator/
├── app/
│   ├── app.config.ts              # Nuxt UI theme (tooltip styling)
│   ├── app.vue                    # Root layout with KeepAlive
│   ├── assets/css/main.css        # Tailwind + Nuxt UI imports, CSS variables
│   ├── components/
│   │   ├── BetControls.vue        # Fold/check/call/raise with slider, presets, tooltips
│   │   ├── ChipStack.vue          # Visual chip denomination display
│   │   ├── PlayingCard.vue        # Card face/back with CSS 3D flip
│   │   ├── PlayerSeat.vue         # Nameplate, cards, action badge, tilt indicator
│   │   ├── PokerTable.vue         # Felt table with polar-coordinate seat layout
│   │   ├── PositionBadge.vue      # D/SB/BB/UTG/CO/MP position badges
│   │   ├── SetupScreen.vue        # Game config, bot roster, auth, pro count selector
│   │   ├── StatsPanel.vue         # 4-tab panel: Live, Session, Ranges, Table
│   │   └── SupabaseStatus.vue     # Auth status pill with sign-in/out dropdown
│   ├── composables/
│   │   ├── useSessionStats.ts     # Session tracking, export, auto-save, Supabase sync
│   │   └── useSupabase.ts         # Supabase client, GitHub/email/anonymous auth
│   ├── pages/
│   │   ├── index.vue              # Main game page (table, betting, bot loop, tilt, timeout)
│   │   ├── replay.vue             # Hand replay with comparison panel
│   │   └── stats.vue              # Cross-session analytics, PokerStars export, delete
│   ├── public/
│   │   ├── og-image.svg           # Open Graph social image (SVG source)
│   │   └── og-image.png           # Open Graph social image (1200x630 PNG)
│   └── utils/
│       ├── botDecision.ts         # Bot decision engine, tilt system, consistency
│       ├── cards.ts               # Card types, suit symbols, pip layouts
│       ├── chips.ts               # Chip denomination breakdowns by stake tier
│       ├── handAnalysis.ts        # Hand evaluator, draws, equity, recommendations
│       ├── pokerStarsExport.ts    # PokerStars hand history format converter
│       ├── ranges.ts              # 169 starting hands + position-based ranges
│       └── seats.ts               # Position assignment + polar coordinate layout
├── tests/                         # 14 Vitest test suites (666 tests)
├── holdem.config.ts               # Single source of truth for all game parameters
├── nuxt.config.ts                 # Nuxt 4 config with OG meta tags + Supabase runtime config
├── netlify.toml                   # Static deploy config with SPA redirect
├── .env.example                   # Supabase credentials template
└── vitest.config.ts
```

## Configuration

All game parameters are centralized in `holdem.config.ts` (project root):

- **Stakes**: 6 preset levels (Micro $0.25/$0.50 through Nosebleed $25/$50)
- **Stack depth**: 50-200 BB slider, default 100 BB
- **Chip denominations**: 4 tiers mapped to stake levels
- **Bot personas**: 25 characters (7 fictional + 18 pro) with VPIP, PFR, aggression, bluffFreq, creativeFreq, tiltMultiplier, consistency
- **Archetype presets**: 6 quick-select templates (Nit through Maniac)
- **Custom ranges**: Min/max/step for every bot slider
- **Equity thresholds**: Value bet, thin value, drawing, give-up cutoffs
- **Bet sizing**: Open raises, 3-bets, value bets, bluffs, protection bets, overbets
- **Tilt mechanics**: Consecutive loss trigger, big loss threshold, mild/full severity, per-stat boost magnitudes, decay duration
- **Session management**: Hero timeout (5 min), auto-save interval (60s), re-buy toggle
- **Animation timing**: Deal stagger, bot thinking delay, showdown pause

## Test Suites

Run all tests: `yarn test` (666 tests, 14 files, ~22 seconds)

### Phase 1 -- Seats (`phase1-seats.test.ts`)
- Position labels correct for all table sizes: heads-up (2) through full ring (8)
- Dealer rotation shifts all positions correctly
- Heads-up special case: D/SB and BB
- 4-player case: no CO position (UTG is directly right of dealer)

### Phase 2 -- Deck & Shuffle (`phase2-deck.test.ts`)
- Deck has exactly 52 unique cards, 4 suits x 13 ranks
- **Shuffle randomness (chi-squared)**: Ace of Spades and 2 of Hearts distribute uniformly across all 52 positions over 10,000 shuffles
- **No positional bias**: No card stays in its original position more than 4% of the time
- **No rank clustering**: First card isn't always high or low
- **No suit correlation**: Adjacent cards share suits at the expected ~23.5% rate
- **Deal and burn simulation**: Correct card count for all table sizes, exactly 3 burns, no duplicates
- **Statistical frequency**: Aces at ~14.9%, pocket pairs at ~5.9%, suited at ~23.5% over 5,000 deals

### Phase 2 -- Hand Evaluator (`phase2-evaluator.test.ts`)
- All 9 hand ranks detected: high card through straight flush
- **Edge cases**: Wheel, steel wheel, Broadway, Royal Flush
- **Tie-breaking**: Kickers, two pair, full house, flush rank-by-rank
- **Split pots**: Identical best-five hands tie correctly
- Best-five selection from 7 cards, performance under 5ms for 8 players

### Phase 2 -- Random Hand Assessment (`phase2-random-hands.test.ts`)
- 10,000-hand distribution matches expected frequencies
- Multi-player showdown correctness, rank ordering, board-play ties
- 5,000 random deals without crashes

### Phase 3 -- Betting (`phase3-betting.test.ts`)
- Blind posting, min-raise enforcement, preset clamping
- Bet guards: raise/call capped to stack, chips never negative
- Side pot calculation, bust-out detection

### Phase 3 -- Street Betting Flow (`phase3-street-betting.test.ts`)
- `needsToAct` state machine: players added/removed, raise reopens, round ends when empty
- Street progression gated by betting completion
- Action order: preflop at UTG, postflop left of dealer, skips folded

### Phase 4 -- Bot AI Config (`phase4-bot-ai.test.ts`)
- All persona stats valid, PFR <= VPIP, tilt thresholds reasonable
- Range ordering: UTG < BTN, escalation narrows (3-bet > 4-bet > 5-bet)

### Phase 4 -- Bot Behavior (`phase4-bot-behavior.test.ts`)
- 100,000 hands per fictional persona: VPIP, PFR, fold rate, raise rate, bluff rate alignment
- Comparative ordering matches config across all bots
- Preset archetypes behaviorally distinct

### Phase 4 -- Tilt System (`phase4-tilt.test.ts`)
- Triggers, severity scaling, decay, profile modification with caps (VPIP 65%, aggression 3.0)
- 100K-hand behavioral impact: tilted Tony vs calm Tony, mild vs full tilt

### Phase 4 -- Pro Bot Tests (`phase4-pro-bots.test.ts`)
- All 18 pros validated: existence, stat ranges, tiltMultiplier, unique playstyles
- Per-persona behavioral verification: Phellmuth tilt, Pvey composure, Degreanu creativity
- Table composition: max configurable pros, no duplicates across 100 random generations

### Phase 4 -- Universal Persona Alignment (`phase4-all-personas.test.ts`)
- **All 25 bots x 500K hands**: VPIP within ±8% of config, PFR reasonable, no degenerate behavior
- Ordering: tightest config = lowest VPIP, most aggressive = highest raise rate, highest bluff = highest bluff rate
- Valid actions only (1000 random decisions), raises never exceed stack (500 scenarios)

### Phase 4 -- Realistic Pipeline (`phase4-realistic-sim.test.ts`)
- **All 25 bots x 50K hands with real cards**: Fisher-Yates shuffle, hand evaluation, position variation, tilt lifecycle
- Tilt behavioral impact: Phellmuth plays looser when tilted, Pvey barely changes, Eidel tilts far less than Phellmuth
- Comparative ordering holds with real cards: Tight Tony < Loose Lucy, Pvey < Degreanu, Twan raises more than Carl
- Full pipeline integrity: no crashes, reasonable VPIP range, hand evaluator produces valid results

### Phase 5 -- Stats (`phase5-stats.test.ts`)
- VPIP, PFR, aggression factor, pot odds, outs, probability calculations

### Phase 5 -- Session Management (`phase5-session.test.ts`)
- Timeout, bust-out, re-buy, session recording, data deletion

## Poker Glossary

| Term | Definition |
|------|-----------|
| **VPIP** | Voluntarily Put money In Pot -- percentage of hands where a player puts money in by choice (not counting blinds). Higher = looser. Tight players: 15-20%. Loose players: 30%+. |
| **PFR** | Pre-Flop Raise -- percentage of hands where a player raises preflop. Always <= VPIP. Higher PFR/VPIP ratio = more aggressive. |
| **Aggression Factor (AF)** | (Bets + Raises) / Calls. Measures how often a player bets or raises vs just calling. AF > 1 = aggressive. AF < 1 = passive. |
| **WTSD** | Went To ShowDown -- percentage of hands where a player reaches showdown. High WTSD = calling station (calls too much). |
| **Equity** | Your probability of winning the hand if all remaining cards were dealt out. Calculated via Monte Carlo simulation. |
| **Pot Odds** | The ratio of the current pot to the amount you need to call. If pot is $100 and you need to call $25, pot odds are 4:1 (you need 20% equity to call profitably). |
| **Implied Odds** | Expected future bets you'll win if you hit your draw. Justifies calling even when immediate pot odds are insufficient. |
| **Outs** | Cards remaining in the deck that will improve your hand. Flush draw = 9 outs. Open-ended straight draw = 8 outs. Gutshot = 4 outs. |
| **SPR** | Stack-to-Pot Ratio -- your remaining stack divided by the pot. Low SPR (<4): you're committed with strong hands. High SPR (>10): be cautious committing your stack. |
| **Chen Score** | A quick preflop hand strength formula (0-20). Accounts for pairs, suited cards, connectedness, and high card value. Higher = stronger starting hand. |
| **OESD** | Open-Ended Straight Draw -- four consecutive cards needing one on either end to complete a straight. 8 outs. |
| **Gutshot** | Inside straight draw -- four cards needing one specific middle card. 4 outs (half an OESD). |
| **Tilt** | Playing emotionally after losses, leading to looser, more aggressive, and less rational decisions. |
| **GTO** | Game Theory Optimal -- a mathematically balanced strategy that cannot be exploited. The theoretical "perfect" play. |
| **TAG** | Tight-Aggressive -- plays few hands but bets/raises them aggressively. The most profitable style for most players. |
| **LAG** | Loose-Aggressive -- plays many hands and bets/raises frequently. High-risk, high-reward style requiring strong reads. |
| **3-Bet** | The third bet in a sequence: post blind (1st), open raise (2nd), re-raise (3rd). A 3-bet indicates strength or a bluff. |
| **Continuation Bet (C-Bet)** | A bet on the flop by the preflop raiser, regardless of whether the flop helped their hand. |
| **Value Bet** | A bet made with a strong hand to extract chips from weaker hands that will call. |
| **Semi-Bluff** | A bet with a drawing hand that has equity if called but could also win immediately if opponent folds. |
| **Walk** | When everyone folds to the big blind preflop -- BB wins without playing. |
| **Position** | Where you sit relative to the dealer. Late position (BTN, CO) is best -- you act last and have the most information. |

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| **1** | Done | Visual foundation -- table, cards, chips, setup, stats panel, bet controls |
| **2** | Done | Core engine -- deck, shuffle, hand evaluator, all 9 ranks, edge cases |
| **3** | Partial | Game loop -- betting round state machine done, side pots + blind rotation planned |
| **4** | Done | Bot AI -- 25 personas (18 pro), per-persona tilt + consistency, 666 tests |
| **5** | Done | Stats -- Supabase, session tracking, analytics, PokerStars/CSV/JSON export, replay |
| **6** | Planned | Polish -- dealing animations, chip movement, celebrations |

## Future Enhancements

- **Tournament mode**: Increasing blinds on a timer, eliminations, final table
- **Leak finder**: Analyze hand history for patterns ("You lose 80% of hands where you call a 3-bet with KJo")
- **Bot difficulty slider**: Scale all bots between Beginner and Shark
- **Multiplayer**: WebSocket-based real players (would require a server)
- **Hand strength in bot decisions**: Factor actual hand evaluation into bot betting (currently config-driven only)

## License

Private project.
