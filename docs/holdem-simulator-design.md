# Hold'em Poker Simulator — Phased Design Document

## Project Overview

A browser-based No-Limit Texas Hold'em poker simulator with 1–8 players (1 hero + 1–7 AI bots), a complete game loop (preflop → flop → turn → river), intelligent bot opponents using real poker heuristics, and a live stats/advisor panel. Deployed as a static site on Netlify.

### Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | Nuxt 4 (`ssr: false`) | Default stack. With `ssr: false`, `nuxt generate` produces a static SPA bundle — a single `index.html` shell + hashed JS/CSS assets. No server-side rendering, no hydration. |
| **UI** | Nuxt UI v4 | Provides base components (buttons, sliders, dropdowns, modals, tooltips, color-mode toggle) out of the box. Poker-specific visuals (table, cards, chips) are custom. |
| **Styling** | Tailwind CSS (via Nuxt UI) | Utility-first, fast iteration, no CSS file management. Nuxt UI's color mode system handles light/dark theming. |
| **Package manager** | Yarn 1.22.22 | Preferred package manager. |
| **Deployment** | Netlify (static site) | `yarn generate` → deploy `.output/public/` folder. Zero server, zero cost for static. |
| **State management** | Pinia (single store) | One `usePokerStore` with the full game state. Pinia ships with Nuxt 4. |
| **Persistence (Phase 1)** | `localStorage` | Session stats (hands played, wins, profit) persist across browser refreshes. No backend needed. |
| **Persistence (Future)** | Supabase or local IndexedDB | Store full hand histories — every card, every action, every outcome. Supabase subscription already available. See Future Enhancements below. |

### SPA Mode vs. `nuxt generate` — Why Both, and What's the Difference

These are two separate concepts that work together:

**`ssr: false` (SPA mode)** controls *how pages render.* With SSR enabled (the default), Nuxt pre-renders each page's HTML on the server (or at build time) so the browser receives meaningful HTML before JavaScript loads. With `ssr: false`, Nuxt skips this — it produces an empty HTML shell that loads a JS bundle, and the entire UI is rendered client-side by Vue after JavaScript executes. There is no server-rendered HTML, no hydration step, no mismatch risk.

**`nuxt generate`** controls *how the site is built for deployment.* It produces a fully static output (HTML + JS + CSS files) that can be served from any static host (Netlify, S3, etc.) with no Node.js server at runtime. With `ssr: true`, `nuxt generate` pre-renders every route to static HTML. With `ssr: false`, `nuxt generate` produces a single `index.html` shell + the JS bundle — functionally identical to a traditional SPA like Create React App or Vite's build output.

**For this project:** `ssr: false` + `nuxt generate` is correct. The poker simulator has one route (`/`) with all logic running client-side. Pre-rendering HTML for the setup screen or an empty table has no value — the user sees the JS-rendered game within milliseconds. The output from `yarn generate` is a static folder that Netlify serves from a CDN.

**Why not SSR?**
- **No SEO need.** It's a game — search engines don't need to index poker hands.
- **No server data.** Nothing is fetched from an API; deck shuffling, hand evaluation, bot AI, and Monte Carlo simulations all run in the browser.
- **Hydration risk eliminated.** SSR + complex client state (game state, timers, animations) is a common source of mismatch bugs. With `ssr: false`, state is born client-side and stays there.
- **First paint tradeoff is acceptable.** SSR gives faster first-contentful-paint for text-heavy pages. A poker table is an interactive canvas that needs JS loaded before anything meaningful renders anyway.

### Aesthetic Direction
Casino-dark luxury — deep emerald felt, walnut rail, gold/cream accents, crisp card faces with rich card backs. Typography: a distinctive display font for hand names and pot amounts, a clean sans-serif for stats and controls.

**Light/dark mode:** The app supports light and dark themes via Nuxt UI's built-in `useColorMode()` composable and `<UColorModeToggle>` component. The theme switch affects the entire UI — stats panel, setup screen, controls, nameplates, card faces, chip labels, and all chrome. **Exception: the poker table felt stays dark emerald green in both modes.** The felt is the felt — it doesn't change with the theme. The walnut rail, inner shadow, and center glow also remain consistent. Only the surrounding UI (sidebar, controls, overlays, text) adapts to light/dark.

---

## Phase 1 — Table, Cards & Visual Foundation

### Goal
Render a polished poker table with hero seat at bottom, configurable 2–8 player seats arranged in an oval, a 52-card deck with beautiful faces and backs, and chip stacks. No game logic yet — just the stage.

### Deliverables
1. **Poker table component** — CSS oval/ellipse with felt texture gradient, walnut-colored rail with inner shadow, subtle green radial glow at center
2. **Seat layout engine** — Dynamically positions 2–8 seats around the table using polar coordinates; hero always at bottom-center (seat 0)
3. **Position indicators** — Each occupied seat shows its current table position as a badge:
   - **D** (Dealer/Button) — white circle with "D", most prominent
   - **SB** (Small Blind) — subtle badge, one seat left of dealer
   - **BB** (Big Blind) — subtle badge, two seats left of dealer
   - **UTG** (Under the Gun) — left of BB
   - **UTG+1, UTG+2** — at 7–8 player tables
   - **MP** (Middle Position) — middle seats at 6+ player tables
   - **CO** (Cutoff) — one seat right of dealer
   - **BTN** — same seat as dealer, alternate label used in stats panel
   - Position labels update automatically when dealer button rotates
   - At 2 players (heads-up): only D/SB and BB (dealer is also SB per heads-up rules)
   - At 3 players: D/BTN, SB, BB
   - At 4 players: D/BTN, SB, BB, UTG (UTG is directly right of the dealer, no CO)
   - At 5 players: D, SB, BB, UTG, CO
   - At 6–8 players: Full position names (UTG, UTG+1, MP, MP+1, CO, BTN, SB, BB)
4. **Card component** — SVG-based playing cards:
   - **Faces:** Rank + suit with proper pip layouts (2–10 pips arranged correctly), court cards (J/Q/K) with stylized Unicode or SVG portraits
   - **Backs:** Rich repeating pattern — interlocking diamond/filigree design in crimson and navy with gold border
   - **Animations:** Flip (CSS 3D transform), deal (translate from deck position to seat), slide to community
5. **Chip stack component** — Colored chip discs with denominational rings, stacked with 3D offset. Chip denominations scale with stakes:
   - Low stakes: white/$0.25, red/$1, green/$5, black/$25
   - Medium stakes: white/$1, red/$5, green/$25, black/$100
   - High stakes: red/$5, green/$25, black/$100, purple/$500
   - Nosebleed: green/$25, black/$100, purple/$500, orange/$1,000
6. **Player nameplate** — Name, chip count, position badge (D/SB/BB/UTG/CO/etc.), card slots
7. **Setup screen** — Configure the game before playing:
   - **Number of opponents:** 1–7 (radio or stepper)
   - **Stake level selector** with preset blind/bankroll combos:

   | Level | Name | SB / BB | Starting Stack | BB Count |
   |-------|------|---------|----------------|----------|
   | 1 | Micro | $0.25 / $0.50 | $50 | 100 BB |
   | 2 | Low | $0.50 / $1.00 | $100 | 100 BB |
   | 3 | Medium | $1 / $2 | $200 | 100 BB |
   | 4 | High | $2.50 / $5 | $500 | 100 BB |
   | 5 | Big | $5 / $10 | $1,000 | 100 BB |
   | 6 | Nosebleed | $25 / $50 | $5,000 | 100 BB |

   - All stacks default to 100 BB (standard deep-stack play), but can optionally be adjusted (50–200 BB slider)
   - Custom blinds option: enter any SB/BB pair, stack auto-calculates at 100 BB
   - Hero name input (defaults to "Hero")
   - **Bot configurator** (expandable "Advanced" section on setup screen):
     - Each bot seat shows its assigned persona (randomly selected by default) with a dropdown to swap personas or choose "Custom"
     - **Presets dropdown** per bot — quick-select a standard player archetype:
       | Preset | VPIP | PFR | Aggression | Bluff Freq | Description |
       |--------|------|-----|------------|------------|-------------|
       | Nit | 12% | 9% | 0.7 | 6% | Ultra-tight, folds everything marginal |
       | Tight | 18% | 14% | 0.9 | 10% | Solid, conservative, few leaks |
       | TAG (Tight-Aggressive) | 22% | 18% | 1.2 | 14% | The winning style — selective but aggressive |
       | LAG (Loose-Aggressive) | 30% | 24% | 1.4 | 20% | Wide range, lots of pressure |
       | Loose-Passive | 35% | 14% | 0.5 | 8% | Calls everything, rarely raises |
       | Maniac | 40% | 32% | 1.6 | 28% | Plays almost every hand, maximum aggression |
     - **Custom mode** — sliders for each stat: VPIP (10–50%), PFR (5–40%), Aggression (0.3–2.0), Bluff Frequency (3–30%), Creative Frequency (1–15%)
     - Custom bot name input (optional — defaults to persona name or "Bot 1", "Bot 2", etc.)
     - **Dynamic playstyle description** — below each bot's sliders, a plain-English sentence or two dynamically describes what the combined stats mean in poker terms. Updates in real-time as sliders are adjusted. Examples:
       - "This is a tight, aggressive player who raises most of the hands they play. Rarely bluffs — when they bet big, believe them."
       - "This is a very loose, passive player who prefers calling over raising preflop. Bluffs frequently — call them down with medium-strength hands."
       - "This is a moderately selective, highly aggressive player. Will bluff occasionally, especially in position. Expect unorthodox plays like limp-reraises and check-raise bluffs."
     - **"Randomize All"** button — assigns random personas to all bot seats
     - **"All Same"** button — sets all bots to the same persona/preset (useful for testing specific strategies)
     - Bot config values are sourced from `holdem.config.js` (personas array and preset definitions)
8. **Light/dark mode toggle** — Uses Nuxt UI's `useColorMode()` composable and `<UColorModeToggle>` component.
   - Toggle in top-right corner of setup screen and in-game settings
   - **Dark mode (default):** Dark background, light text, muted chrome — the natural feel for a casino game
   - **Light mode:** Light background, dark text, softer shadows — for daytime/accessibility preference
   - **Table is exempt:** The felt (emerald green), walnut rail, inner shadow, and center glow remain identical in both modes. The table is the table. Only the surrounding UI (stats panel, controls, setup screen, overlays, nameplates) adapts.
   - Card faces adapt slightly (white card bg in dark mode, off-white in light mode) but suit colors and pip layouts stay the same
   - Implemented via Tailwind's `dark:` variant classes — all component styles define both modes

### Acceptance Criteria
- Table renders at all player counts (2–8) without overlap
- Position badges display correctly for every table size including heads-up
- Positions rotate correctly when dealer button moves
- Cards flip smoothly between face-up and face-down
- Demo deal animation works with preset/placeholder cards (real shuffled deck comes in Phase 2)
- Stake selection produces correct blind amounts and bankrolls
- Chip denominations match the selected stake level
- Light/dark mode toggle works; table felt stays emerald green in both modes
- Color mode preference persists across page refreshes (Nuxt UI stores this in a cookie)
- Looks polished on 1280×800+ viewports

---

## Phase 2 — Deck, Deal & Hand Evaluation Engine

### Goal
Build the core engine: shuffled deck, dealing, and a complete hand evaluator that ranks any 5–7 card combination into one of the standard poker hand ranks with correct tie-breaking.

### Deliverables

#### 2A. Deck Module
- Fisher-Yates shuffle (in-place, O(n), cryptographically unnecessary but statistically uniform)
- `deal(n)` returns n cards from top of deck
- `burn()` discards one card (standard poker procedure before flop/turn/river)
- `reset()` rebuilds full 52-card deck and reshuffles

#### 2B. Hand Evaluator — Algorithm Detail

**Input:** 2 hole cards + 3–5 community cards (5–7 cards total)

**Output:**
```
{
  rank: 0–8,                    // hand category (high card → straight flush)
  name: string,                 // human-readable: "Pair of Aces", "Ace-high flush"
  score: [number, ...],         // composite comparison key (see scoring below)
  bestFive: Card[],             // the 5-card combination used
  kickers: number[],            // ordered kicker ranks for tie-breaking
}
```

**Step 1 — Enumerate all 5-card subsets (brute force):**

| Street | Cards available | C(n,5) subsets | Work |
|--------|----------------|----------------|------|
| Flop | 5 (2 hole + 3 board) | 1 | Trivial |
| Turn | 6 (2 hole + 4 board) | 6 | Trivial |
| River | 7 (2 hole + 5 board) | 21 | Still trivial |

Generate all combinations using nested loops or a recursive choose(k) generator. For 7 cards that's 21 subsets — no optimization needed.

**Step 2 — Score each 5-card subset:**

For each 5-card hand, produce a score tuple that enables direct numeric comparison. The tuple is structured so that leftmost elements dominate (hand rank is most significant, then primary grouping, then kickers):

```
score = [handRank, primary, secondary, kicker1, kicker2, kicker3]
```

Detection runs top-down — first match wins:

| handRank | Hand | How to detect | Primary | Secondary | Kickers |
|----------|------|---------------|---------|-----------|---------|
| 8 | **Straight flush** | Is straight AND is flush (same suit on all 5) | High card of the straight | — | — |
| 7 | **Four of a kind** | Any rank appears 4× | Quad rank | — | 1 remaining card |
| 6 | **Full house** | One rank 3× + another rank 2× | Trip rank | Pair rank | — |
| 5 | **Flush** | All 5 same suit (but not a straight) | — | — | All 5 ranks descending |
| 4 | **Straight** | 5 consecutive ranks (but not all same suit) | High card of straight | — | — |
| 3 | **Three of a kind** | One rank 3× (no pair alongside) | Trip rank | — | 2 highest remaining |
| 2 | **Two pair** | Two different ranks each appear 2× | Higher pair rank | Lower pair rank | 1 remaining card |
| 1 | **One pair** | Exactly one rank appears 2× | Pair rank | — | 3 highest remaining |
| 0 | **High card** | None of the above | — | — | All 5 ranks descending |

**Straight detection edge cases:**
- **Broadway:** A-K-Q-J-10 → high card = 14 (Ace)
- **Wheel:** A-2-3-4-5 → high card = 5 (Ace plays LOW, not 14). This is the critical edge case most naive implementations miss.
- **Not a straight:** A-2-3-4-6 (gap), K-A-2-3-4 (wrap-around not allowed in standard Hold'em)

**Royal Flush naming:** A straight flush with high card = 14 (A-K-Q-J-10 suited) is a Royal Flush. It's rank 8 like any straight flush, but the `name` field should output "Royal Flush" not "Ace-high Straight Flush."

**Flush detection:** Count suits. If all 5 are the same suit, it's a flush. Then check if it's also a straight (→ straight flush) or not (→ plain flush).

**Rank-count method for pairs/trips/quads:** Build a frequency map of ranks. Sort by (frequency DESC, rank DESC). This immediately reveals:
- `[4,1]` → four of a kind
- `[3,2]` → full house
- `[3,1,1]` → three of a kind
- `[2,2,1]` → two pair
- `[2,1,1,1]` → one pair
- `[1,1,1,1,1]` → check for straight/flush, else high card

**Step 3 — Keep the best:**

Compare all subset scores. The highest score tuple (compared left-to-right, first difference wins) is the player's best hand.

#### 2C. Hand Comparison Function

```
compareHands(handA, handB):
  for i = 0 to score.length:
    if handA.score[i] > handB.score[i]: return A wins
    if handA.score[i] < handB.score[i]: return B wins
  return TIE (split pot)
```

This handles every tie-breaking scenario:
- Same hand rank, different kickers (e.g., both have a pair of Kings, but different side cards)
- Identical hands (e.g., both play the board) → split pot
- Two pair vs. two pair where high pairs match but low pairs differ

#### 2D. Showdown Resolver

Given N remaining (non-folded) players' hole cards + the board:

1. Evaluate each player's best hand
2. Sort by score descending
3. Group tied players (identical scores)
4. Award main pot to winner(s) — split equally if tied
5. For side pots: repeat the process but only among eligible players for each side pot
6. Return chip movements: `{ playerId, amount }[]`

**Side pot logic recap (from Phase 3, but the evaluation feeds into it):**
- Side pots are created during betting when players go all-in at different stack depths
- At showdown, each pot is independently contested only by players who contributed to it
- A player can win a side pot they're eligible for even if they lose the main pot (rare but possible in multi-way all-ins)

#### 2E. Performance Budget

| Operation | Per player | 8 players | Target |
|-----------|-----------|-----------|--------|
| Subset generation | 21 combos | 168 combos | < 0.1ms |
| Scoring per combo | ~10 operations | ~1,680 ops | < 0.5ms |
| Total evaluation | ~0.1ms | ~0.8ms | < 1ms |

No lookup tables, hash maps, or precomputation needed. Brute force is fast enough by orders of magnitude.

### Acceptance Criteria
- Correctly ranks all 9 hand types (high card through straight flush)
- Wheel straight (A-2-3-4-5) scored as 5-high, not Ace-high
- Steel wheel (A-2-3-4-5 suited) detected as straight flush, not just a flush
- Broadway (A-K-Q-J-10) scored as Ace-high straight
- Full house: trip rank determines winner (AAA-22 beats KKK-QQ)
- Two pair: high pair first, then low pair, then kicker (KK-33-A beats KK-33-Q)
- Flush: compared rank by rank descending (A-K-9-7-2 beats A-K-9-6-2)
- Split pots: identical best-five hands (e.g., both play the board) split correctly
- Side pots awarded independently to eligible winners
- Evaluator runs < 1ms for 8 players at river (168 combinations total)
- Console test mode: deal random hands, evaluate, display results with hand names

---

## Phase 3 — Game Loop & Betting Mechanics

### Goal
Implement the full No-Limit Hold'em game loop with proper betting rounds, pot management, and side pots.

### Deliverables
1. **Game state machine** — States: `SETUP → DEAL → PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → CLEANUP`
   - Each betting round: cycles through active players starting left of BB (preflop) or left of dealer (postflop)
   - Tracks: current bet, pot, player actions, who has acted, min-raise amount
2. **Blind posting** — Auto-post SB and BB; rotate dealer button each hand
   - **Heads-up exception:** In 2-player games, the dealer posts the SB and acts FIRST preflop, but LAST postflop. This is standard heads-up rules and differs from 3+ player tables.
3. **Betting actions:**
   - **Fold** — Remove from hand
   - **Check** — Only when no bet to call
   - **Call** — Match current bet (all-in if short-stacked)
   - **Raise** — Min-raise = previous raise size or BB (whichever larger); No max (no-limit)
4. **Pot management:**
   - Main pot + side pots when players go all-in with different stack sizes
   - **Side pot algorithm (canonical — referenced by Phase 2D and showdown):**
     1. Collect all players' total contributions to the pot this hand
     2. Sort the distinct all-in contribution amounts ascending (e.g., $50, $120, $300)
     3. For each tier boundary, create a pot: everyone who contributed at least that much is eligible. The pot amount = (number of eligible players) × (this tier's increment over the previous tier).
     4. Example: Player A all-in for $50, Player B all-in for $120, Player C bets $300. Pot 1 (main): 3 × $50 = $150, eligible: A, B, C. Pot 2 (side): 2 × $70 = $140, eligible: B, C. Pot 3 (side): 1 × $180 = $180, eligible: C only (returned).
     5. At showdown, each pot is independently awarded to the best hand among its eligible players. A player can win pots they're eligible for even if they lose other pots.
5. **Round progression:**
   - Preflop → deal 2 hole cards each, betting from UTG (or SB in heads-up)
   - Flop → burn 1, deal 3 community, betting from first active left of dealer
   - Turn → burn 1, deal 1, betting round
   - River → burn 1, deal 1, betting round
   - Showdown → evaluate all remaining hands, award pot(s)
6. **Auto-advance:** If all but one player folds at any point → award pot immediately, skip remaining streets
   - **Walk handling:** If everyone folds to the BB preflop, BB wins uncontested ("walk"). This counts as a hand won but does NOT count as a VPIP hand for the BB (they didn't voluntarily put money in). Walks are tracked separately in stats.
   - **Post-fold hero experience:** When the hero folds, the hand fast-forwards to showdown (or next fold-out) with a brief summary of what happened ("Tight Tony bet, Loose Lucy folded, Tight Tony wins $24"). Hero does not watch bots play out every action in real-time — that's slow and tedious. Full action details are available in the hand log for review.
7. **Player bust-out handling:**
   - When a player reaches 0 chips, they are eliminated and their seat empties
   - Remaining players continue; seat layout adjusts (positions recalculate)
   - Game ends when hero busts out (show session summary) or only hero remains (victory screen)
   - No re-buy in v1 (future enhancement: optional re-buy to starting stack)
8. **Multi-bet / re-raise handling (3-bet, 4-bet, 5-bet+):**
   - **"Still to act" reset:** When any player raises, ALL other active (non-folded, non-all-in) players are marked as "needs to act again." The betting round continues cycling until every active player has acted since the last raise with no new raise occurring.
   - **No artificial raise cap.** No-limit means unlimited re-raises. Stack depth is the natural terminator — every raise brings someone closer to all-in, which removes them from further raising.
   - **Min-raise tracking across raises:** Each raise must be at least the size of the previous raise increment. If BB is $10, first raise to $30 (increment = $20), next raise must be at least $50 (increment ≥ $20). This is tracked via `lastRaiseIncrement` in state.
   - **All-in exception:** A player who goes all-in for less than a full raise does NOT reopen betting for players who have already acted. E.g., if Player A raises to $100 and Player B goes all-in for $130 (only $30 more, less than the min-raise increment), Player A cannot re-raise — they can only call or fold.
9. **Hero UI controls** (bottom of screen):
   - **Fold** button (always available when it's hero's turn)
   - **Check/Call** button (shows amount to call, or "Check" if 0)
   - **Raise presets:** 0.25× pot, 0.5× pot, 0.75× pot, 1× pot, All-In
     - Presets that would produce a raise below the minimum raise are clamped UP to min-raise
     - Presets that would exceed the hero's remaining stack are clamped DOWN to all-in
     - If min-raise = all-in (hero can only shove), show only "All-In" button
   - **Custom raise slider:** Min-raise to all-in, with text input override
   - Buttons disabled/greyed when not hero's turn
   - Raise amount displayed in real-time as slider moves

### Acceptance Criteria
- Complete hand plays through all streets correctly
- Heads-up blind posting works correctly (dealer = SB, acts first preflop, last postflop)
- 3-bet, 4-bet, and 5-bet pots resolve correctly without infinite loops
- All-in for less than a full raise does NOT reopen betting
- Side pots calculated correctly when multiple players go all-in at different amounts
- Min-raise enforcement works (can't raise less than the last raise increment or BB)
- Raise presets clamp correctly (never below min-raise, never above stack)
- Hero can play a full hand using only the UI controls
- Dealer button rotates, blinds post automatically
- Busted players (0 chips) are eliminated; game ends on hero bust or last-bot-standing
- Walks (everyone folds to BB) award pot correctly and don't count as VPIP for BB
- When hero folds, hand fast-forwards with summary; full details in hand log
- Hand history log records every action

---

## Phase 4 — Intelligent Bot AI

### Goal
Build bot opponents that play strong, fundamentally sound poker — but with human-like imperfections, tendencies, and occasional deviations that make them feel like real players rather than solved algorithms.

### Design Philosophy
The bots should be *good enough to punish bad play* but *exploitable enough to reward observant players.* A skilled hero who pays attention to a bot's tendencies should be able to gain an edge — just like at a real table. The baseline is solid GTO-approximation; the personality layer introduces exploitable leaks on top of that.

### Deliverables

#### 4A. Core Calculation Engine
1. **Hand strength calculator:**
   - **Preflop:** Static hand ranking table — all 169 distinct starting hands (13 pairs + 78 suited + 78 offsuit) ranked by expected value. Each position (UTG through BB) has a cutoff index into this table defining its opening range. Chen formula is still computed for display in the advisor panel (tier badges), but bot decisions use the ranking table for precision. This avoids the coarseness problem where Chen scores can't cleanly map to percentage-based ranges (e.g., 15% UTG, 30% CO).
   - **Postflop:** Monte Carlo equity estimation — simulate N random runouts against estimated opponent range to get win%. N=500 simulations for reliable results (~80ms for 8 players). Uses adaptive sampling: run 200 first, and if equity is in the 40–60% zone (where variance matters most), run 300 more for tighter confidence.
2. **Pot odds calculator:** `amountToCall / (pot + amountToCall)` — compare to hand equity
3. **Outs calculator:** Count cards that improve hand (flush draw = 9, OESD = 8, gutshot = 4, two-pair-to-boat = 4, set-to-quads = 1, etc.)
4. **Implied odds estimator:** When on a draw, factor in expected future bets if the draw hits. Multiplier of 1.5–2.5× based on opponent stack depth and draw hiddenness (e.g., backdoor flush is more hidden than 4-to-a-flush on board).

#### 4B. Bot Decision Engine (Baseline "GTO-Lite")
1. **Preflop ranges (position-aware):**
   - **UTG/EP:** Open top ~15% (pairs 66+, AJs+, AQo+, KQs)
   - **MP:** Top ~22% (add suited broadways, 55, A9s+)
   - **CO:** Top ~30% (add suited connectors 78s+, more offsuit broadways)
   - **BTN:** Top ~42% (add suited gappers, K9s+, Q9s+, J9s+)
   - **Blinds:** SB completes/3-bets ~25%; BB defends ~40% vs steal
   - **3-bet range:** Top ~5% for value (QQ+, AKs), plus ~3% bluffs (A5s, A4s type blockers)
   - **4-bet range:** Top ~2.5% for value (KK+, AKs), bluffs at ~1% frequency
   - **5-bet:** Almost always AA/KK, rare bluff
2. **Postflop decision tree:**
   1. Calculate equity vs. estimated opponent range (range narrows based on preflop action — a 4-bettor's range is QQ+/AK, not random)
   2. **Equity > 70%:** Bet/raise for value. Size 0.6–0.8× pot.
   3. **Equity 50–70%:** Bet in position for protection + thin value. Check/call out of position. Occasionally check-raise (~15%) for balance.
   4. **Equity 30–50%:** Check/call if drawing and pot odds or implied odds justify. Otherwise check/fold. Occasional semi-bluff raise with nut draws (~20%).
   5. **Equity < 30%:** Fold to bets. Bluff-bet ~12% of the time when checked to, with preference for semi-bluffs (draws) over pure bluffs (air).
   - **Position awareness:** In position → more betting, thinner value bets, cheaper bluffs. Out of position → more check/calling, fewer bluffs.
   - **Stack-to-pot ratio (SPR):** Low SPR (<4) → more willing to commit all-in. High SPR (>10) → need stronger hands to stack off.
   - **Board texture awareness:** Wet boards (flush/straight draws present) → larger bets for protection. Dry boards (K-7-2 rainbow) → smaller bets, more checks.
3. **Multi-bet preflop logic (3-bet, 4-bet, 5-bet):**
   - Facing a 3-bet: Fold bottom of opening range (~60% of opens), call with suited broadways/medium pairs, 4-bet with premiums + occasional bluffs
   - Facing a 4-bet: Range narrows to top ~3%. Fold AQo, fold JJ at high SPR, call/5-bet QQ+/AKs
   - Facing a 5-bet: Almost always KK+. Occasionally call with QQ if pot-committed.
   - **Range narrowing prevents infinite re-raising:** Each escalation drastically shrinks the continuing range, so most bots fold well before stacks go in — unless they actually have it.

#### 4C. Personality System (The "Imperfect Human" Layer)
Each bot has a named persona with a stat profile that modifies the baseline engine. These aren't random deviations — they're *systematic tendencies*, the kind a real player would develop.

| Persona | VPIP | PFR | Aggression | Key Leak | Playstyle |
|---------|------|-----|------------|----------|-----------|
| **Tight Tony** | 14% | 11% | 0.85 | Folds too much to 3-bets; won't bluff rivers | Ultra-nit, only plays premiums, easy to bluff postflop |
| **Loose Lucy** | 38% | 22% | 1.1 | Plays too many hands, especially suited junk | Sees too many flops, but plays postflop reasonably well |
| **Aggressive Alex** | 26% | 22% | 1.4 | Over-bets draws, 3-bets too wide | Constant pressure, but overplays marginal hands |
| **Calling Carl** | 30% | 12% | 0.6 | Calls too much postflop, rarely raises | Station — hard to bluff, but never punishes you for betting thin |
| **Tricky Tina** | 24% | 18% | 1.15 | Slow-plays big hands, check-raises too often | Deceptive, will trap you, but sometimes traps herself |
| **Solid Sam** | 22% | 17% | 1.0 | Very few leaks — tightest to GTO baseline | The toughest bot. Nearly optimal, only slight exploitability. |
| **Wild Wendy** | 34% | 28% | 1.5 | Massive over-aggression, huge bluff frequency (~25%) | Maniac. Will 3-bet you with 74s. Punish by calling wider. |

Stat definitions:
- **VPIP** (Voluntarily Put $ In Pot): % of hands played (affects `tightness` — which hands enter the pot)
- **PFR** (Pre-Flop Raise): % of hands raised preflop (affects limp vs. raise tendency)
- **Aggression**: Multiplier on bet/raise frequency and sizing vs. the GTO-lite baseline
- **Key Leak**: A specific, observable tendency the hero can exploit

#### 4D. Deviation & Variance Behaviors
On top of the personality layer, bots occasionally deviate from their own baseline to prevent them from becoming completely predictable:

1. **Tilt mechanic:** After losing a big pot (>30% of stack), a bot's aggression increases by 0.2 and VPIP widens by 5% for the next 3–5 hands, then decays back. This simulates tilt — a bot that just got stacked is more likely to make a loose re-steal or overplay top pair.
2. **Occasional "creative" plays (~5% frequency):**
   - Limp-reraise with a premium from early position
   - Donk-bet into the preflop raiser with middle pair
   - Float the flop in position with nothing, then bluff the turn
   - Check-raise all-in on a draw as a semi-bluff (when they'd normally just call)
   - Slow-play a monster by just checking back the flop
3. **Bet-sizing variance:** Instead of always 0.66× pot, the actual size has a ±15% jitter. A bot "thinking" 0.66× pot might actually bet 0.58× or 0.74×. This prevents the hero from reading bet sizes as perfectly correlated to hand strength.
4. **Session memory (short-term):** Bots track the last ~10 hands for hero-specific adjustments:
   - If hero has folded to 3-bets the last 3 times → bot 3-bets wider against hero
   - If hero has been caught bluffing → bot calls hero down lighter
   - If hero never bets the river → bot bluffs rivers more against hero
   - These adjustments are *imperfect* — bots overweight recent history (recency bias), just like real players do
5. **Stack-aware mode shifts:** When a bot drops below 20BB, it switches to a simplified short-stack strategy (push/fold charts, shove-or-fold preflop with wider range). When deep-stacked (>150BB), bots loosen up slightly and play more speculative hands.

#### 4E. Bet Sizing Logic
- **Open raises:** 2.5× BB from EP/MP, 2.2× BB from CO/BTN (standard modern sizing)
- **3-bets:** 3× the open (in position), 3.5× the open (out of position)
- **Value bets:** 0.55–0.75× pot (personality aggression shifts this range)
- **Bluffs/semi-bluffs:** 0.33–0.5× pot (cheaper = better risk/reward on bluffs)
- **Protection bets (wet boards):** 0.75–1.0× pot
- **Overbets:** ~5% of monster hands: 1.2–1.5× pot (Aggressive Alex does this more)
- **All-in:** When effective stack < 1.5× pot, just shove rather than making an awkward bet

### Acceptance Criteria
- Bots demonstrably play different styles — Tight Tony visibly folds far more than Wild Wendy
- Bots fold trash, raise premiums, check-raise draws, 3-bet in position
- Bots respect position (tighter UTG, looser BTN)
- Bots fold to 4-bets with marginal holdings (no infinite re-raise loops)
- Multi-bet pots (3-bet, 4-bet, 5-bet) resolve naturally through range narrowing + stack depth
- Bluff frequency varies by persona (8–25% depending on bot)
- Tilt mechanic is observable: a bot that just lost a big pot plays noticeably looser for a few hands
- "Creative" plays happen occasionally but not so often they feel random
- Hero-specific adjustments are detectable: if you keep folding to 3-bets, bots start 3-betting you more
- Bots handle short-stack play correctly (shove/fold with <20BB)
- Can play 50+ hands and observe distinct personality differences between bots

---

## Phase 5 — Stats Panel & Hand Advisor

### Goal
Add a comprehensive real-time stats/advisor panel on the right side of the table. Three tabs: **Live Hand** (current hand analysis), **Hero Stats** (session-level hero performance), and **Table Stats** (all players' observable stats). The panel should give the hero everything they'd get from a HUD in online poker, plus the educational advisor layer.

### Deliverables

#### 5A. Panel Layout
- Right sidebar (~300px), dark glass-morphism card, always visible
- Three tabs: **Live Hand** | **My Stats** | **Table**
- Collapsible on narrow screens (<1280px → slides in from right as overlay)
- Each section below maps to a tab

#### 5B. Live Hand Tab (real-time, updates every street)

**Hand Strength Section:**
- **Preflop:** Chen score displayed as tier badge — "Premium" (green) / "Strong" (blue) / "Playable" (yellow) / "Marginal" (orange) / "Trash" (red)
- **Postflop:** Equity percentage as a radial gauge (0–100%), color-coded
- **Hand name:** Descriptive, not just the rank — "Top Pair, Ace Kicker" / "Nut Flush Draw" / "Two Pair, Kings and Sevens" / "Open-Ended Straight Draw" / "Set of Nines"
- **Hand rank category:** "One Pair" / "Flush" / etc. with rank badge (1st, 2nd, 3rd best possible hand on this board)

**Outs & Draw Analysis:**
- List of all active draws with out counts:
  - "♠ Flush draw: 9 outs"
  - "Straight draw (open-ended): 8 outs"
  - "Gutshot straight: 4 outs"
  - "Overcards: 6 outs"
  - "Set to full house: 7 outs" (when applicable)
  - "Runner-runner flush: ~2 effective outs" (when applicable)
- **Probability to improve:**
  - By next card (turn or river): `outs × 2 + 1`% approximation, plus exact calculation
  - By river (if on flop): `1 - ((47-outs)/47 × (46-outs)/46)` exact
- **Combined outs:** When holding multiple draws (e.g., flush draw + gutshot = 12 outs, not 13 if one overlaps)

**Pot Odds & Implied Odds:**
- **Pot odds:** Current pot / amount to call, displayed as both ratio ("3.5 : 1") and percentage ("22%")
- **Required equity:** "You need 22% equity to call"
- **Your equity:** "You have 36% equity"
- **Verdict:** Green checkmark "Odds justify a call ✓" or red X "Fold — odds don't justify ✗"
- **Implied odds estimate:** Factors in expected future bets if draw completes
  - "Implied odds: ~5.2 : 1 (opponents likely to pay off ~$150 more)"
  - Based on: opponent stack depth, draw visibility (hidden draws get better implied odds), number of opponents still in hand
- **Effective pot odds vs. implied odds:** When direct pot odds say fold but implied odds say call, the advisor notes this: "Direct odds don't justify a call, but implied odds do — you'll likely get paid if you hit."

**Action Recommendation:**
- Large colored badge: **FOLD** (red), **CHECK** (gray), **CALL** (yellow), **RAISE** (green)
- Recommended raise size if RAISE: "Raise to $45 (0.66× pot)"
- **Reasoning line:** 1–2 sentences explaining why:
  - "Top pair good kicker in position — bet for value and protection"
  - "Nut flush draw with 9 outs, pot odds justify a call, implied odds are strong"
  - "Bottom pair no kicker, facing a pot-sized bet — fold"
  - "Overpair on dry board, raise for value — unlikely to be beaten"
  - "No pair, no draw, no equity — fold to any aggression"
- **Position context:** "You're on the button — wider range is profitable here"

**Hand History Mini-Log:**
- Scrollable list of actions this hand: "Tight Tony raises to $6", "Hero calls $6", "Flop: A♠ K♦ 7♣", "Tight Tony bets $8"

#### 5C. My Stats Tab (hero session performance)

**Core Session Stats:**
- **Hands played** — total count
- **Win rate** — handsWon / handsPlayed as percentage
- **Total profit/loss** — running P&L from starting stack, green (+$245) or red (−$120), with a mini sparkline chart showing profit over the last 20 hands
- **BB/hand** — profit expressed in big blinds per hand (standard poker performance metric)
- **Current streak** — "W3" or "L5" with color coding
- **Best streak** — longest win streak this session

**Preflop Stats:**
- **VPIP** — % of hands where hero voluntarily put money in (not counting BB posting). Key indicator of loose vs. tight play. Display with guidance: <20% = tight, 20–30% = solid, >30% = loose
- **PFR** — % of hands where hero raised preflop. PFR/VPIP ratio indicates aggression: close to 1.0 = aggressive, <0.5 = passive
- **3-bet %** — % of opportunities where hero 3-bet
- **Fold to 3-bet %** — how often hero folds when facing a 3-bet (high = exploitable)

**Postflop Stats:**
- **Aggression factor (AF)** — (bets + raises) / calls. >2.0 = aggressive, <1.0 = passive
- **Went to showdown (WTSD)** — % of hands that reached showdown. >30% = calling station, <20% = folding too much
- **Won at showdown (W$SD)** — % of showdowns hero won. >55% = good hand selection, <45% = calling with weak hands
- **Continuation bet %** — how often hero bets the flop after raising preflop

**Showdown & Results:**
- **Showdowns won / lost** — raw counts
- **Biggest pot won** — amount + hand description ("$340 — Full House, Aces full of Kings")
- **Biggest pot lost** — amount + hand description
- **Bots eliminated** — count of players hero has outlasted

**Hand Log:**
- Scrollable list of last ~50 hands
- Each entry shows: hand #, hole cards (miniature card icons), board, result badge (Won/Lost/Folded/Split), profit (+$45 / −$20)
- Click to expand: full action-by-action replay for that hand
- **localStorage persistence** — all stats survive page refresh. "New Session" button resets everything.

#### 5D. Table Stats Tab (all players' observable HUD)

A mini-HUD for each player at the table, showing stats the hero would observe over time. These build up as more hands are played (show "—" until at least 10 hands of data).

**Per-player stats displayed:**

| Stat | Abbrev | What it means |
|------|--------|---------------|
| VPIP | V | % of hands voluntarily played — how loose/tight |
| PFR | P | % of hands raised preflop — passive vs. aggressive |
| AF | A | Aggression factor — betting vs. calling postflop |
| 3-bet % | 3B | How often they 3-bet — helps read their range |
| Fold to 3-bet | F3B | How often they fold to a 3-bet — exploit by 3-betting lighter |
| WTSD | WT | Went to showdown % — how often they call down |
| W$SD | W$ | Won $ at showdown — are they calling with winners? |
| C-bet | CB | Continuation bet % — do they always c-bet or give up? |

**Layout:** Compact grid under each player's name, e.g.:
```
Tight Tony (52 hands)
V: 14%  P: 11%  AF: 0.8
3B: 3%  F3B: 72%  CB: 58%
```

**Persona reveal (after 30+ hands):** After enough data, the panel shows a "read" on each bot:
- "Tight Tony plays very few hands and folds to aggression — 3-bet him liberally"
- "Wild Wendy is a maniac — let her bluff into you with strong hands"
- "Calling Carl never folds postflop — don't bluff, value bet thinner"

This teaches the hero to read opponents from stats, which is a core poker skill.

### Acceptance Criteria
- All three tabs render and switch correctly
- Live Hand stats update in real-time as community cards are revealed
- Outs count is accurate for all common draw types (flush, straight, OESD, gutshot, overcards, two-pair-to-boat, set-to-quads)
- Combined outs correctly deduplicate overlapping draws
- Pot odds calculation accounts for current bet to call
- Implied odds factor in stack depth and draw visibility
- Recommendation adapts to position, stack depth, draw strength, and pot odds — not just hand rank
- Hero session stats persist across page refreshes via localStorage
- "New Session" button resets all stats and resets all player stacks
- Table stats accumulate over hands and show "—" until minimum sample size (10 hands)
- Persona reads appear after 30+ hands of data
- VPIP/PFR compute correctly from raw counts
- BB/hand profit metric calculates correctly
- Panel doesn't overlap table on 1280px+ screens; slides in as overlay on narrow screens

---

## Phase 6 — Polish, Animation & UX

### Goal
Final visual pass — smooth animations, sound-like visual feedback, and quality-of-life features that make it feel like a real poker client.

### Deliverables
1. **Dealing animation:** Cards fly from deck position to each player sequentially (100ms stagger)
2. **Community card reveals:** Cards slide in from left, flip with 3D rotation
3. **Chip movement:** Chips animate from player stack to pot on bet, pot to winner on showdown
4. **Winning hand highlight:** Winning cards glow gold, losing cards dim; winning hand type displayed in center ("Full House, Aces full of Kings!")
5. **Turn indicator:** Active player seat pulses with soft glow; timer bar (15-second shot clock for hero, 1–3s for bots)
6. **Bot "thinking" delay:** Bots pause 0.8–2.5s before acting (random within range) with a thinking indicator
7. **Muck / show:** Losing bots muck (cards face down to center); hero can choose to show or muck
8. **Hand-over-hand play:** After showdown, brief pause, then auto-deal next hand (or "Deal" button)
9. **Settings:** Toggle auto-deal, adjust bot speed, toggle advisor panel
10. **Responsive tweaks:** Compact layout for narrower screens (stack stats panel below on <1280px)

### Animation Sequencing
All animations are promise-based and gated by the `animating` flag in the store. When `animating` is true, hero action buttons are disabled. The game loop `await`s animation promises before advancing state — e.g., deal animation completes before preflop betting begins, community card reveal completes before postflop betting opens. Bot "thinking" delays (item 6) run during the bot's turn and are separate from card/chip animations.

### Acceptance Criteria
- Full hand plays through smoothly with no visual glitches
- Animations don't block game logic (async with proper await); hero controls disabled during animations via `animating` flag
- Bot delays feel natural, not robotic
- Winner celebration is clear and satisfying
- Can play 20+ consecutive hands without state corruption

---

## Architecture Notes

### Project Setup & Config

```bash
# Initialize
npx nuxi@latest init holdem-simulator
cd holdem-simulator
yarn install                        # Yarn 1.22.22
yarn add @nuxt/ui                   # Nuxt UI v4+
```

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  ssr: false,                        // SPA mode — no server rendering
  modules: ['@nuxt/ui'],            // Nuxt UI includes Tailwind + color mode
  colorMode: {
    preference: 'dark',              // default to dark (casino feel)
    fallback: 'dark',
  },
  app: {
    head: {
      title: 'Hold\'em Simulator',
    },
  },
})
```

```bash
# Development
yarn dev                             # http://localhost:3000

# Production build (static SPA)
yarn generate                        # outputs to .output/public/
# Deploy .output/public/ to Netlify
```

**Netlify config (`netlify.toml`):**
```toml
[build]
  command = "yarn generate"
  publish = ".output/public"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

The redirect rule is essential for SPA mode — since there's only one `index.html`, all routes must fall through to it. Without this, Netlify returns 404 for any direct URL access (e.g., if someone refreshes the page).

### State Shape (Pinia Store — `usePokerStore`)

```
{
  phase: 'SETUP' | 'DEAL' | 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN',
  animating: boolean,                  // true while deal/reveal/chip animations are in progress; hero controls disabled until false
  deck: Card[],
  communityCards: Card[],
  pot: number,
  sidePots: { amount: number, eligible: number[] }[],
  currentBet: number,
  minRaise: number,
  lastRaiseIncrement: number,        // tracks min-raise across re-raises
  dealerSeat: number,
  activeSeat: number,
  handNumber: number,                 // increments each hand, used for tilt decay
  players: {
    id: number,
    name: string,
    chips: number,
    holeCards: [Card, Card] | null,
    bet: number,
    folded: boolean,
    allIn: boolean,
    hasActedSinceLastRaise: boolean,  // reset on each new raise
    isHero: boolean,
    // --- Bot personality (null for hero) ---
    persona: {
      name: string,                   // "Tight Tony", "Wild Wendy", etc.
      vpip: number,                   // 0.14–0.38 — % of hands played
      pfr: number,                    // 0.11–0.28 — % of hands raised preflop
      aggression: number,             // 0.6–1.5 — multiplier on bets/raises
      bluffFreq: number,             // 0.08–0.25 — base bluff frequency
      creativeFreq: number,          // 0.03–0.08 — frequency of unorthodox plays
      leak: string,                   // description of primary exploitable tendency
    } | null,
    // --- Dynamic state (per-session, mutable) ---
    tilt: {
      level: number,                  // 0.0 (calm) to 1.0 (full tilt)
      decayHand: number,              // hand number when tilt resets to 0
    },
    sessionMemory: {
      heroFoldTo3Bet: number,         // count of hero folds to this bot's 3-bets
      heroCaughtBluffing: number,     // count of hero bluffs this bot has seen
      heroRiverBetFreq: number,       // rolling frequency of hero river bets
      lastBigLossHand: number | null, // hand number of last big loss (>30% stack)
    },
    // --- Observable stats (tracked for ALL players, displayed in Table Stats tab) ---
    observedStats: {
      handsDealt: number,             // total hands this player was dealt into
      // Raw counts — all derived %s computed in UI
      handsVoluntarilyPlayed: number, // VPIP numerator
      handsRaisedPreflop: number,     // PFR numerator
      timesThreeBet: number,          // 3-bet numerator
      opportunitiesToThreeBet: number,// 3-bet denominator
      foldedToThreeBet: number,       // fold-to-3-bet numerator
      facedThreeBet: number,          // fold-to-3-bet denominator
      betsAndRaisesPostflop: number,  // AF numerator (bets + raises)
      callsPostflop: number,          // AF denominator
      wentToShowdown: number,         // WTSD numerator
      handsReachedFlop: number,       // WTSD denominator
      wonAtShowdown: number,          // W$SD numerator
      continuationBets: number,       // C-bet numerator
      continuationBetOpportunities: number, // C-bet denominator
    },
  }[],
  handHistory: string[],
  // --- Live hand analysis (Pinia GETTER, not stored state) ---
  // Computed from phase + communityCards + hero holeCards + pot + currentBet.
  // Recalculates reactively when inputs change. No manual writes needed.
  liveHandStats: {  // getter return shape:
    handStrength: {
      tier: 'premium' | 'strong' | 'playable' | 'marginal' | 'trash', // preflop
      chenScore: number,              // raw Chen formula score (preflop)
      equity: number,                 // 0–100, Monte Carlo postflop
      handName: string,               // "Top Pair, Ace Kicker", "Nut Flush Draw"
      handRank: number,               // 0–8
      rankName: string,               // "One Pair", "Flush", etc.
      bestPossibleRank: string | null,// "Nut flush" / "2nd nut straight" when relevant
    },
    draws: {
      type: string,                   // "Flush draw", "OESD", "Gutshot", "Overcards"
      outs: number,
      probByNextCard: number,         // % to hit on next card
      probByRiver: number,            // % to hit by river (if on flop)
    }[],
    combinedOuts: number,             // deduplicated total across all draws
    potOdds: {
      pot: number,                    // current total pot
      toCall: number,                 // amount hero must pay to call
      ratio: string,                  // "3.5 : 1"
      percentage: number,             // 22%
      requiredEquity: number,         // 22% — the equity threshold
    },
    impliedOdds: {
      estimatedFutureBets: number,    // expected additional $ if draw hits
      effectiveRatio: string,         // "5.2 : 1"
      effectivePercentage: number,    // 16%
      reasoning: string,              // "Hidden draw, deep stacks — good implied odds"
    },
    recommendation: {
      action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE',
      raiseAmount: number | null,     // suggested raise size if RAISE
      reasoning: string,              // 1–2 sentence explanation
      positionNote: string | null,    // "You're on the button — wider range is profitable"
    },
  },
  // --- Session-level tracking (persisted to localStorage) ---
  sessionStats: {
    handsPlayed: number,              // total hands dealt this session
    handsWon: number,                 // hands hero won (including walks)
    handsLost: number,               // hands hero lost at showdown
    handsFolded: number,             // hands hero folded
    totalProfit: number,             // cumulative profit/loss from starting stack
    biggestPotWon: { amount: number, handName: string },
    biggestPotLost: { amount: number, handName: string },
    showdownsWon: number,            // wins at showdown specifically
    showdownsLost: number,           // losses at showdown
    // Raw counts — compute VPIP%, PFR%, etc. as derived values
    handsVoluntarilyPlayed: number,  // VPIP numerator
    handsRaisedPreflop: number,      // PFR numerator
    timesThreeBet: number,           // 3-bet numerator
    opportunitiesToThreeBet: number, // 3-bet denominator
    foldedToThreeBet: number,        // fold-to-3-bet tracking
    facedThreeBet: number,
    betsAndRaisesPostflop: number,   // AF tracking
    callsPostflop: number,
    continuationBets: number,        // C-bet tracking
    continuationBetOpportunities: number,
    currentStreak: number,           // positive = win streak, negative = loss streak
    bestStreak: number,              // longest win streak this session
    botsEliminated: number,          // how many bots hero outlasted
    profitHistory: number[],         // profit after each hand (for sparkline chart)
    handLog: {                       // last ~50 hands for review
      handNumber: number,
      holeCards: [Card, Card],
      board: Card[],
      result: 'won' | 'lost' | 'folded' | 'split',
      profit: number,
      handName: string | null,       // "Two Pair, Aces and Sevens" or null if folded
      position: string,              // "BTN", "UTG", etc.
      actions: string[],             // full action log for replay
    }[],
  },
}
```

### Card Representation

```
{ rank: 2-14, suit: 'hearts'|'diamonds'|'clubs'|'spades' }
// rank 11=J, 12=Q, 13=K, 14=A
// Display: rank + suit emoji (♠♥♦♣)
```

### Key Algorithms

| Algorithm | Approach | Complexity |
|-----------|----------|-----------|
| Hand eval | Enumerate C(n,5), bit-score each | O(21) per player max |
| Monte Carlo equity | 200–500 adaptive runouts, count wins | ~80ms for 8 players |
| Side pots | Sort all-in amounts, bucket | O(n log n) |
| Bot decision | Equity → personality-modified decision tree → sizing | O(1) per decision + equity calc |
| Range narrowing | Preflop action → estimated range → equity vs. range | Lookup table |
| Tilt decay | Exponential decay from trigger hand to +5 hands | O(1) per hand |
| Hero adaptation | Rolling window over last ~10 hands, frequency counts | O(1) per update |
| Implied odds | Stack depth × draw hiddenness multiplier | O(1) |

---

## Build Order Summary

| Phase | Focus | Deliverable |
|-------|-------|-------------|
| **1** | Visual foundation | Table, cards, chips, seats with position badges, stake/blind setup screen |
| **2** | Core engine | Deck, hand evaluator, showdown — testable in console |
| **3** | Game loop | Full betting mechanics including 3/4/5-bet pots, hero plays hands vs. dummy bots |
| **4** | Bot AI | Bots with personas, tilt, session memory, exploitable leaks |
| **5** | Stats panel | Real-time advisor + session stats tracker with localStorage persistence |
| **6** | Polish | Animations, delays, celebration, QoL features |
| **7** | Future | Supabase hand history, tournament mode, hand replayer, leak finder |

Each phase produces a playable (or at least viewable) artifact. Phase 3 is the first "playable game," Phase 4 makes it worth playing, Phase 5 makes it educational, Phase 6 makes it beautiful.

---

## Future Enhancements (Post-Phase 6)

### 7A. Persistent Hand History Database

**Goal:** Store every hand the hero plays — cards, actions, outcomes — in a database for long-term analysis, leak-finding, and session review.

**Option 1: Supabase (preferred for cloud sync)**
- Supabase paid subscription already available
- Tables: `sessions`, `hands`, `actions`
- `sessions`: id, started_at, stake_level, player_count, total_profit
- `hands`: id, session_id, hand_number, hole_cards, board, result, profit, hand_name, position
- `actions`: id, hand_id, street, seat, action_type, amount, pot_after
- Row-level security: hero's data only accessible to hero
- Enables cross-session analytics: "What's my win rate with AKo from UTG over 500 hands?"
- Auth: Supabase Auth with magic link or GitHub OAuth

**Option 2: IndexedDB (offline-first, no backend)**
- Same schema but stored in browser's IndexedDB
- Works offline, no account needed
- Limitation: data tied to one browser, no cross-device sync
- Could use Dexie.js wrapper for cleaner API

**Option 3: SQLite via API route (if Nuxt SSR enabled later)**
- Add a Nuxt server route that writes to SQLite on a DigitalOcean droplet
- Most complex but most flexible — full SQL queries, export to CSV, etc.
- Would require switching from static Netlify deploy to server deploy via Laravel Forge

**Recommended path:** Start with localStorage (Phase 5), add Supabase in a future sprint when the game is stable and you want cross-session analytics.

### 7B. Additional Future Ideas
- **Tournament mode:** Increasing blinds on a timer, eliminations, final table
- **Hand replayer:** Step through any saved hand action by action with board + cards visualized
- **Leak finder:** Analyze hand history for patterns ("You lose 80% of hands where you call a 3-bet with KJo")
- **Bot difficulty slider:** Scale all bots between "Beginner" (wide, passive) and "Shark" (tight, aggressive, low-leak)
- **Multiplayer (WebSocket):** Replace bots with real players. Would require a server — DigitalOcean + WebSocket server via Laravel Forge.
- **Export hand history:** Download as PokerStars-format .txt for import into third-party analysis tools (PokerTracker, Hold'em Manager)
