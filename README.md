# No Limit Hold'em Simulator

![No Limit Hold'em Simulator](app/public/og-image.png)

A browser-based No-Limit Texas Hold'em poker simulator with 27 intelligent bot opponents (including 20 pro-inspired personas), real-time hand analysis, and comprehensive cross-session stats. Built for learning poker strategy through practice, observation, and hand replay.

- **Card-aware bot AI** -- bots evaluate actual hole cards and board texture, not just random probabilities
- **Chen+ scoring** -- position- and style-adjusted hand strength (classic Chen also shown for reference)
- **Board texture analysis** -- dry/wet, ace-high, paired, monotone — affects c-bet rates, barrel frequency, bluff sizing
- **Street-aware decisions** -- c-betting, double-barreling, giving up with air, multiway pot adjustments
- **Preflop escalation** -- full 3-bet/4-bet/5-bet logic with per-persona frequencies
- **Hero adaptation** -- bots adjust to your play style over a rolling 10-hand window
- **Metatweak dynamics** -- bots adjust when a player is dominating or running cold (20-hand rolling window)
- **Expected Value (EV)** -- live +EV/-EV display when facing a bet, with pot odds integration
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
- **Hand strength**: Chen score + Chen+ (position/style-adjusted), preflop tier (Premium/Strong/Playable/Marginal/Trash), contextual hand descriptions ("Top Pair, Ace-kicker", "Nut Flush Draw")
- **Equity**: Monte Carlo simulation (300 iterations, adaptive to 500 in close spots) against random opponent ranges
- **Hand improvement probabilities**: Per-rank % chance of making each hand by the river (e.g., "Flush: 19.2%", "Two Pair: 32.4%")
- **Draws and outs**: Flush draws, straight draws (OESD/gutshot), overcards, set draws with hit probability by next card and by river
- **Pot odds**: Ratio, percentage, required equity, pass/fail verdict against your actual equity
- **Expected Value (EV)**: `(equity x pot) - call cost` -- green for +EV (profitable call), red for -EV
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
- Covers: Equity, Chen Score, Chen+, Position, Pot Odds, EV, SPR, Draws & Outs, Recommendation

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
- **Hand Analysis Modal**: Click "Analyze" on any hand for a detailed street-by-street instructional breakdown:
  - Player profiles with playstyle, stats, tilt, and leak descriptions
  - Per-action explanations referencing Chen/Chen+, board texture, hand strength, draws, and the specific bot's persona
  - Showdown summary and personalized key takeaway
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

Every decision a bot makes passes through a layered pipeline in `app/utils/botDecision.ts`. The bot doesn't pick randomly -- it evaluates its actual hole cards against the board, adjusts for position and playstyle, considers who's been winning, remembers what the hero tends to do, and then decides based on the combination of all those factors. Each layer is described below.

### Persona Config Fields

Each of the 25 bot personas is defined by a set of numerical stats in `holdem.config.ts`. These stats control every aspect of how the bot plays:

| Field | Range | What it controls | Example impact |
|-------|-------|------------------|----------------|
| **VPIP** | 0.14--0.38 | Fraction of hands the bot voluntarily enters. This is the primary "loose vs tight" knob. | Tight Tony (14%) sees ~1 in 7 hands. Loose Lucy (38%) sees ~1 in 3. |
| **PFR** | 0.11--0.28 | Fraction of hands the bot raises preflop. Always <= VPIP. The gap between VPIP and PFR determines how often the bot flat-calls vs raises. | Calling Carl: VPIP 30%, PFR 12% -- he calls a lot but rarely raises. Dom Twan: VPIP 31%, PFR 26% -- almost every hand he plays, he raises. |
| **Aggression** | 0.60--1.50 | Multiplier on postflop betting and raising frequency. Directly scales c-bet rates, barrel frequencies, and raise sizing. | Carl at 0.60 checks and calls. Dom Twan at 1.50 bets and raises at every opportunity. |
| **Bluff Frequency** | 0.08--0.25 | How often the bot bets or raises with nothing (air). Controls c-bet bluffs, barrel bluffs, and river bluffs. | Tight Tony (8%) almost never bluffs -- if he bets, he has it. Wild Wendy (25%) bets with air a quarter of the time. |
| **Creative Frequency** | 0.03--0.12 | Probability of unconventional plays: limp-reraises, trap-checks with monsters, slow-plays. | Lhil Paak (11%) and Utu Sngar (12%) take the most unorthodox lines. Tight Tony (3%) is textbook. |
| **3-Bet Frequency** | 0.04--0.22 | How often the bot re-raises when facing an open. Includes both value 3-bets (premium hands) and bluff 3-bets (light hands for fold equity). | Calling Carl (4%) almost never 3-bets. Wild Wendy (22%) 3-bets constantly. |
| **4-Bet Frequency** | 0.015--0.10 | How often the bot re-raises a 3-bet. Much narrower range than 3-bets. | Wild Wendy (10%) 4-bets liberally. Most pros are 3--7%. |
| **5-Bet Frequency** | 0.005--0.02 | How often the bot puts in the 5th bet preflop (essentially committing their stack). Almost always AA/KK. | Dom Twan at 2% does this with a slightly wider range than most. |
| **Donk Bet Frequency** | 0.00--0.22 | How often the bot leads (bets) into the preflop raiser on the flop, rather than checking to them. This is considered a weak play by professionals. **All pro bots have 0%.** | Calling Carl (22%) donk-bets constantly -- a classic recreational player habit. Loose Lucy (18%) and Wild Wendy (20%) also lead frequently. Pro bots never donk-bet; they check to the raiser and use check-raises or floats instead. |
| **Tilt Multiplier** | 0.3--2.5 | How fast the bot tilts after losses and how severely tilt affects their play. Scales both the trigger threshold (losses needed) and the magnitude of stat changes. | Hill Phellmuth (2.5x) tilts after 1 loss and becomes a maniac. Ihil Pvey (0.3x) needs 10+ consecutive losses and barely changes. |
| **Consistency** | 0.88--0.99 | The probability of making the "correct" decision each hand. On a consistency miss, the bot makes a random off-strategy play (fold when it should call, raise with nothing, etc.). | Ihil Pvey (99%) almost never misplays. Wild Wendy (88%) makes a random play ~12% of the time. |
| **Leak** | text | A natural-language description of the bot's primary weakness, shown in the hand analysis modal and bot gallery. | "Folds too much to 3-bets; won't bluff rivers" (Tight Tony) |

### Chen+ Hand Evaluation

Classic Chen scoring rates starting hands 0--20 based on card rank, pairs, suitedness, and connectedness. It doesn't account for position or playstyle -- pocket aces score 20 whether you're UTG or on the Button.

**Chen+** extends this with context-aware adjustments:

| Factor | Adjustment | Reasoning |
|--------|------------|-----------|
| **Button/Dealer** | +2 | You act last on every street. Information advantage makes marginal hands profitable. |
| **Cutoff** | +1 | Second-best position. Nearly as good as the Button. |
| **UTG / UTG+1** | -1 | You act first with 4--5 players behind. Need a stronger hand to enter. |
| **Big Blind** | +1 | Already invested 1 BB. Getting a discount to see the flop. |
| **Suited connectors (loose player)** | +1 | Players with VPIP > 27% extract extra value from speculative hands because they play more pots and get paid off more. |
| **Creative + suited gapper** | +1 | Players with creative freq > 8% profit from unusual holdings because opponents can't put them on a hand. |
| **Big cards (tight-aggressive)** | +1 | Players with VPIP < 22% and aggression > 1.2 get more value from big-card hands because they play them aggressively and get action from worse hands. |

The Chen+ score is then mapped to a **percentile** -- the fraction of all 1,326 unique starting hands that are this strong or better. This percentile was calibrated empirically (not estimated). A bot with VPIP 0.30 plays any hand whose Chen+ percentile falls below 0.30. Because Chen+ is position-adjusted, the same ATo might qualify from the Button but not from UTG.

Both the classic Chen score and the Chen+ score are shown in the stats panel during play so you can see the difference position makes.

### Board Texture Analysis

After the flop, every decision considers the **board texture** -- the pattern of community cards and what kinds of hands they favor. The engine categorizes boards along several dimensions:

| Property | Detection | Impact on bot play |
|----------|-----------|-------------------|
| **Ace-high** | Highest card is an ace | Preflop raiser c-bets more (they have more aces in range). River bluffs are more credible -- "I have the ace." |
| **Broadway-heavy** | 2+ cards >= Jack | Favors the raiser's range (big cards). Less donk-betting from callers. |
| **Low board** | All cards <= 9 | Favors the caller's range (small pairs, suited connectors). Raiser c-bets less. |
| **Dry** | No flush draw, low connectedness, unpaired | Fewer draws mean fewer scare cards on later streets. Bots bluff more (opponents fold more on dry boards). Smaller bet sizing. |
| **Wet** | Flush draw + connected cards | Many draws possible. Bots bet bigger to charge draws. Less bluffing (opponents call more with draws). |
| **Monotone** | 3+ cards of one suit | Flush is possible. Bots slow down significantly unless they have the flush. |
| **Two-tone** | 2 cards of one suit | Flush draw possible. Bots size up to charge the draw. |
| **Paired** | Board has a pair | Full house and trips are possible. Bots bluff less (opponents may have trips). |
| **Connected** | Cards are close in rank | Straight draws are likely. Bots bet to deny free cards. |

**Range advantage** is computed per street: the preflop raiser's range (weighted toward big cards and premium pairs) has an advantage on ace-high and broadway boards. The preflop caller's range (weighted toward suited connectors, small pairs) has an advantage on low, connected boards. This multiplier adjusts c-bet frequency, barrel rate, and bluff sizing.

### Metatweak (Table Dynamics)

Real players adjust when someone is on a hot streak or when the table dynamic shifts. The metatweak system tracks a 20-hand rolling window of winners and adjusts bot profiles before each decision:

| Situation | Detection | Bot adjustment | Real-world analogy |
|-----------|-----------|---------------|-------------------|
| **Someone is dominating** | Any player's win rate > 28% in the window | Reduce bluff frequency by up to 40%. Increase aggression by up to 30% when they do play. | "That guy is crushing -- don't bluff him, but when I have a hand, I'm going to trap him." |
| **Bot is running cold** | This bot's win rate < 10% over 15+ hands | Widen VPIP by up to 8%, PFR by up to 5%. | "I haven't won a hand in forever. I need to get involved or I'll get blinded out." |
| **Bot is running hot** | This bot's win rate > 25% | Tighten VPIP slightly (up to 5%), reduce bluffs by up to 12%. | "I'm up big. No need to gamble -- protect the stack and play strong hands." |

The adjustments are bounded and gentle -- a bot's fundamental personality doesn't change, but it adapts around the edges, just like a real player would.

### Hero Adaptation

After tracking 10+ hands of the hero's play (via `useHeroProfileStore`), bots begin exploiting observed tendencies:

| Hero tendency | Detection | Bot exploit |
|--------------|-----------|-------------|
| **Folds to 3-bets a lot** | Fold-to-3-bet > 60% | Bot 3-bets wider (up to 1.6x their normal rate). Free money. |
| **Very loose** | VPIP > 40% | Bot reduces bluffs (hero calls too often for bluffs to work). Value bets thinner. |
| **Passive** | Low aggression factor | Bot bluffs more (hero won't raise back, so bluffs are safer). |

### Preflop Decision Flow

When it's a bot's turn preflop, the decision proceeds in this order:

1. **Consistency check**: Roll against the bot's consistency (0.88--0.99). If the roll fails, return a random weighted action -- fold (40%), call (40%), or raise (20%) when facing a bet; check (60%) or random bet (40%) otherwise. This simulates human error.

2. **Hero adaptation**: If 10+ hands tracked, adjust the bot's profile based on hero tendencies.

3. **Metatweak**: Adjust profile based on table dynamics (hot/cold/dominated).

4. **Short-stack check**: If below 25 BB and facing a raise, switch to push/fold mode. Shove with top ~15-25% of hands (wider when desperate), fold everything else.

5. **Chen+ evaluation**: Compute the position- and style-adjusted Chen+ score for the bot's hole cards. Map it to a percentile via the calibrated table.

6. **Decision**:
   - **Not facing a raise**: Raise if hand percentile < PFR. Otherwise check.
   - **Completing BB (small bet to call)**: BB defends with 125% of VPIP range (wide defense due to pot discount). Raise the strong subset.
   - **Facing an open raise**: Value 3-bet with top hands (55% of 3-bet range by card quality), bluff 3-bet with playable hands (45% of 3-bet range by persona randomness), flat call with the rest of the continuing range (85% of VPIP in position, 75% out of position), or fold.
   - **Facing a 3-bet**: Value 4-bet, bluff 4-bet, flat call (45% of VPIP), or fold.
   - **Facing a 4-bet**: Shove with top hands, call (20% of VPIP), or fold.
   - **Facing a 5-bet+**: Only continue with the top 1% of hands.

### Postflop Decision Flow

After the flop, decisions become board-texture-aware:

**When not facing a bet:**

1. **C-bet** (if preflop raiser on the flop): Rate scales with hand strength (80% with strong hands, 55% with draws, 20% with air) multiplied by board texture (higher on dry/ace-high boards, lower on wet/low boards). Reduced 35% in multiway pots. Bet sizing: smaller on dry boards (~35% pot), larger on wet boards (~65% pot) to charge draws.

2. **Second barrel** (if bet the flop, now on the turn): Strong hands 75%, draws 45%, air bluffs scale with `bluffFreq * aggression * texture_modifier`. Board texture reduces barreling on monotone boards (flush now possible) and boosts it on dry boards.

3. **Third barrel** (if bet flop and turn, now on the river): Monsters 85%, strong 60%, air bluffs are board-aware: boosted 1.5x on ace-high dry boards (representing the ace), 1.3x on wet boards that bricked (representing a missed draw), reduced 0.7x on paired boards (opponent may have trips).

4. **Donk bet** (not the preflop raiser): Pro bots never donk-bet. Fictional bots lead at their `donkBetFreq` rate, with strong hands leading more and air leading less. This is a deliberate leak -- exploitable by alert opponents.

5. **Probe bet** (non-raiser with air): Board-texture-driven. More likely on ace-high boards (represent the ace), dry boards (more fold equity), and vs passive tables.

**When facing a bet:**

- **Monster hands**: Raise for value (15% + aggression * 25%).
- **Strong hands**: Usually call. Sometimes raise (aggression * 12%). Fold top-pair-only to pot-sized river bets from tight opponents.
- **Draws** (flop/turn only): Semi-bluff raise (bluffFreq * aggression * 50%). Call if pot odds justify. Fold otherwise.
- **Weak made hands**: Call small bets on the flop, tighten by street. River calls are rare.
- **Nothing**: Fold almost always. Rare bluff raise (bluffFreq * 15% * aggression). Float tiny flop bets occasionally (VPIP * 25%).

Street pressure increases from flop (1.0x) to turn (0.75x) to river (0.55x) -- it takes a stronger hand to continue on later streets. Passive players (low aggression) get a boost to call frequency; aggressive players fold or raise instead of flat-calling.

### Testing Approach

Four levels of verification, each more realistic than the last:

| Level | Hands/Bot | What it tests | Speed |
|-------|-----------|---------------|-------|
| **Simplified** (`phase4-bot-behavior`) | 100K | Pure probability engine, no cards | ~30ms |
| **Universal** (`phase4-all-personas`) | 500K | All 25 bots, stat alignment, ordering | ~230ms |
| **Realistic** (`phase4-realistic-sim`) | 50K | Real cards, hand evaluator, position variation, tilt lifecycle | ~16s |
| **Escalation** (`phase6-escalation`) | 50K | 3-bet/4-bet/5-bet rates, fold-to-3-bet, per-persona verification | ~6s |

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
| Testing | Vitest (737 tests) |

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
│   │   ├── BotAvatar.vue           # Bot initials avatar with deterministic color
│   │   ├── BotProfileModal.vue    # In-game bot stat adjustment modal
│   │   ├── HandAnalysisModal.vue  # Street-by-street hand analysis with persona explanations
│   │   ├── SetupScreen.vue        # Game config, bot roster, auth, pro count selector
│   │   ├── StatsPanel.vue         # 4-tab panel: Live, Session, Ranges, Table
│   │   └── SupabaseStatus.vue     # Auth status pill with sign-in/out dropdown
│   ├── composables/
│   │   ├── useGameEngine.ts       # Game loop, betting rounds, metatweak dynamics
│   │   ├── useGameState.ts        # Reactive game state (players, pot, street, community)
│   │   ├── useSessionStats.ts     # Session tracking, export, auto-save, Supabase sync
│   │   └── useSupabase.ts         # Supabase client, GitHub/email/anonymous auth
│   ├── pages/
│   │   ├── bots.vue               # Bot gallery page with all 27 personas
│   │   ├── index.vue              # Main game page (table, betting, bot loop, tilt, timeout)
│   │   ├── replay.vue             # Hand replay with comparison panel
│   │   └── stats.vue              # Cross-session analytics, hand analysis, PokerStars export
│   ├── public/
│   │   ├── og-image.svg           # Open Graph social image (SVG source)
│   │   └── og-image.png           # Open Graph social image (1200x630 PNG)
│   └── utils/
│       ├── botDecision.ts         # Bot decision engine, board texture, tilt, metatweak
│       ├── botDescriptions.ts     # Bot playstyle descriptions for UI
│       ├── cards.ts               # Card types, suit symbols, pip layouts
│       ├── chips.ts               # Chip denomination breakdowns by stake tier
│       ├── handAnalysis.ts        # Hand evaluator, Chen/Chen+, draws, equity
│       ├── pokerStarsExport.ts    # PokerStars hand history format converter
│       ├── ranges.ts              # 169 starting hands + position-based ranges
│       ├── seats.ts               # Position assignment + polar coordinate layout
│       └── sidePots.ts            # Side pot calculation and multi-way pot awards
├── scripts/
│   └── simulate.ts                # Headless bot-vs-bot simulation with stats
├── tests/                         # 16 Vitest test suites (737 tests)
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
- **Metatweak**: Rolling window size, dominance/cold/hot thresholds, min hands before adjusting
- **Session management**: Hero timeout (5 min), auto-save interval (60s), re-buy toggle
- **Animation timing**: Deal stagger, bot thinking delay, showdown pause

## Test Suites

Run all tests: `yarn test` (737 tests, 16 files, ~18 seconds)

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
| **Chen+** | Position- and style-adjusted Chen score. Adds bonuses for late position, suited connectors (for loose players), and big cards (for TAG players). What bots actually use for decisions. |
| **EV (Expected Value)** | The average profit or loss of a play over many repetitions. +EV means profitable long-term. Calculated as `(equity x pot) - call cost`. |
| **Donk Bet** | Betting into the preflop raiser (out of turn from the typical flow). Generally considered a weak play by pros, but common among recreational players. |
| **Board Texture** | How the community cards interact: "dry" (few draws possible, e.g., K-7-2 rainbow), "wet" (many draws, e.g., J-T-9 two-tone), "monotone" (three+ cards of one suit). |
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
| **3** | Done | Game loop -- betting rounds, side pots, all-in auto-runout, blind rotation |
| **4** | Done | Bot AI -- 25 personas (18 pro), per-persona tilt + consistency, 737 tests |
| **5** | Done | Stats -- Supabase, session tracking, analytics, PokerStars/CSV/JSON export, replay |
| **6** | Done | Advanced AI -- Chen+, board texture, metatweak, donk bets, hand analysis modal |
| **7** | Planned | Polish -- dealing animations, chip movement, celebrations |

## Future Enhancements

- **Tournament mode**: Increasing blinds on a timer, eliminations, final table
- **Leak finder**: Analyze hand history for patterns ("You lose 80% of hands where you call a 3-bet with KJo")
- **Bot difficulty slider**: Scale all bots between Beginner and Shark
- **Multiplayer**: WebSocket-based real players (would require a server)
- **Advanced board texture reasoning**: Blocker analysis, range narrowing by street, turn/river card categorization (scare cards, blanks)

## License

Private project.
