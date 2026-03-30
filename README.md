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
- **7 named personas**: Tight Tony, Loose Lucy, Aggressive Alex, Calling Carl, Tricky Tina, Solid Sam, Wild Wendy
- **6 archetype presets**: Nit, Tight, TAG (Tight-Aggressive), LAG (Loose-Aggressive), Loose-Passive, Maniac
- **Custom sliders**: VPIP (10-50%), PFR (5-40%), Aggression (0.3-2.0), Bluff Frequency (3-30%), Creative Frequency (1-15%)
- **Dynamic bot names**: Auto-update based on stat adjustments ("Loose Lucy" becomes "Aggro Lucy" when aggression is cranked up)
- **Plain-English descriptions**: Real-time playstyle summaries ("This is a very loose, passive player who prefers calling over raising preflop. Bluffs frequently -- call them down with medium-strength hands.")

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
│   │   └── StatsPanel.vue         # 3-tab panel: Live Hand, Ranges, Opponents
│   ├── holdem.config.ts           # Single source of truth for all game parameters
│   ├── pages/
│   │   └── index.vue              # Main game page
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

All game parameters are centralized in `app/holdem.config.ts`:

- **Stakes**: 6 preset levels (Micro $0.25/$0.50 through Nosebleed $25/$50)
- **Stack depth**: 50-200 BB slider, default 100 BB
- **Chip denominations**: 4 tiers mapped to stake levels
- **Bot personas**: 7 named characters with distinct VPIP/PFR/aggression profiles
- **Archetype presets**: 6 quick-select templates (Nit through Maniac)
- **Custom ranges**: Min/max/step for every bot slider
- **Equity thresholds**: Value bet, thin value, drawing, give-up cutoffs
- **Bet sizing**: Open raises, 3-bets, value bets, bluffs, protection bets, overbets
- **Tilt mechanics**: Trigger threshold, aggression boost, decay duration
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

### Phase 4 -- Bot AI (`phase4-bot-ai.test.ts`)
- All persona stats within valid ranges (VPIP 10-50%, PFR <= VPIP, etc.)
- Enough personas for maximum opponents (7)
- Solid Sam has aggression = 1.0 (closest to GTO)
- Wild Wendy has highest bluff frequency
- UTG tighter than BTN, BTN is widest opening range
- Escalation ranges narrow: 3-bet > 4-bet > 5-bet
- Equity thresholds ordered: value > thin value > drawing > give up
- Open raise EP larger than late position, 3-bet OOP larger than IP
- Tilt: reasonable trigger threshold, decays in 3-5 hands, max aggression < 2.0

### Phase 5 -- Stats (`phase5-stats.test.ts`)
- VPIP = voluntary hands / total hands; BB walks excluded
- Aggression factor = (bets + raises) / calls; caps at 999 for zero calls
- Pot odds: ratio and percentage calculated correctly; zero-to-call handled
- Outs: flush draw = 9, OESD = 8, gutshot = 4, combined flush + gutshot = 12 (overlap deducted)
- Probability: Rule of 2 approximation, exact single-card, exact flop-to-river
- BB/hand metric for positive, negative, and breakeven sessions

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| **1** | Done | Visual foundation -- table, cards, chips, setup, stats panel, bet controls |
| **2** | Planned | Core engine -- deck module, hand evaluator, showdown resolver |
| **3** | Planned | Game loop -- full betting mechanics, side pots, blind rotation |
| **4** | Planned | Bot AI -- persona-driven decisions, tilt, session memory, hero adaptation |
| **5** | Planned | Stats tracking -- real VPIP/PFR/AF, localStorage persistence, hand log |
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
