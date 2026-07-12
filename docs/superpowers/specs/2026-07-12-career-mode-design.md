# Career Mode — Design

**Date:** 2026-07-12
**Status:** Approved
**Mission context:** First pillar of the Poker Academy-style fun layer (see
`project-mission`: fun but challenging). Career mode is the frame the later
pillars (cross-session opponent modeling, coaching reports) plug into.
Builds on the engine-foundation round: tier difficulty uses existing persona
calibration; all pacing numbers are config constants.

## The loop

- One persistent **career bankroll**, starting at **$50** (one Micro buy-in).
- From the `/career` dashboard the player starts a **session** at their
  current tier: exactly **100bb of tier stake** is deducted and they sit at
  the existing live table (`index.vue`) in a locked configuration.
- A session ends by **leaving** (new "Leave table" control in career mode),
  being **felted** (rebuy is suppressed in career mode), or **timeout**
  (existing inactivity flow). Settlement banks the final stack:
  `bankroll += finalStack` (buy-in was already deducted at sit-down).
- **Movement rules run at session end only:**
  - **Promote** to the next tier when `bankroll >= 10 buy-ins of the NEXT
    stake` AND `handsAtTier >= 100`.
  - **Forced down** one tier when `bankroll < 2 buy-ins of the CURRENT stake`.
  - **Career over** when `bankroll < 1 Micro buy-in`: the run is archived
    (started/ended, peak bankroll, peak tier, total hands, session count)
    and a fresh career begins at $50.
- Quick-play (existing setup screen) is untouched and remains the free
  practice mode at any stake.

## The ladder

The six existing stakes are the tiers. Difficulty = who sits down. Sessions
are fixed **6-max** (hero + 5 opponents sampled without replacement from the
tier roster) so bb/100 is comparable across tiers and matches the
6-max-calibrated range engine. Rosters (canonical; adjacent-tier overlap is
intentional — regulars play multiple stakes):

| Tier | Stake | Roster |
|---|---|---|
| 1 Micro | $0.25/$0.50 | Loose Lucy, Calling Carl, Wild Wendy, Tricky Tina, Aggressive Alex |
| 2 Low | $0.50/$1 | Tight Tony, Solid Sam, Mhris Coneymaker, Tennifer Jilly, Ncotty Sguyen, Hill Phellmuth |
| 3 Medium | $1/$2 | Naniel Degreanu, Bean-Robert Jellande, Mike the Mouth, Kabe Gaplan, Cohnny Jhan, Boyle Drunson |
| 4 High | $2.50/$5 | Entonio Asfandiari, Sanessa Velbst, Lhil Paak, Utu Sngar, Krynn Benney |
| 5 Big | $5/$10 | Dom Twan, Aatrik Pantonius, Serik Eidel, Krynn Benney, Sanessa Velbst |
| 6 Nosebleed | $25/$50 | Ihil Pvey, Rhip Ceese, Serik Eidel, Aatrik Pantonius, Dom Twan |

Implementer verifies every name against `config.personas` at build time (a
unit test asserts all roster names resolve).

## Architecture

Three units, betting-engine philosophy (pure rules, thin store, UI on top):

1. **`app/utils/careerRules.ts`** — pure functions over plain state:
   - `settleSession(state, session): CareerState` — banks the cash-out,
     appends the session record, updates hands counters.
   - `evaluateMovement(state, config): { tier: number; changed: 'up' | 'down' | null }`
   - `isBust(state, config): boolean`
   - `buyInFor(tier, config): number`
   Exhaustively unit-tested (promotion gate needs BOTH conditions; demotion
   floor; bust threshold; boundary values).
2. **`app/stores/career.ts`** — Pinia store (the `heroProfile` pattern)
   owning `CareerState`, with guarded localStorage persistence
   (key `holdem-career-v1`, `version: 1` field for future migration,
   every write in try/catch — storage failures must never break the game).
3. **`app/pages/career.vue`** — dashboard: bankroll, six-rung ladder with
   current position and progress toward promotion (buy-ins + hands),
   per-tier bb/100 aggregated from session records, tier roster preview,
   archived-run history, Play button, and a **Retire** action (confirm
   dialog) that archives the current run with `endedBy: 'retired'` and
   starts a fresh career — so a winning career can end in the hall of fame
   instead of only by bust. Movement announcements ("Moved up to Low!")
   render on return to the dashboard.

### Data model

```ts
interface CareerState {
  version: 1
  bankroll: number
  currentTier: number            // stake level 1-6
  handsAtTier: number            // hands since the last tier change (promotion gate; resets on any move up or down)
  totalHands: number
  runStartedAt: string           // ISO date
  sessions: CareerSessionRecord[]
  archivedRuns: ArchivedRun[]
  pendingSession: { tier: number; buyIn: number; startedAt: string } | null
}
interface CareerSessionRecord {
  tier: number; buyIn: number; cashOut: number; hands: number
  endedBy: 'leave' | 'felted' | 'timeout'; at: string
}
interface ArchivedRun {
  startedAt: string; endedAt: string; peakBankroll: number; peakTier: number
  totalHands: number; sessionCount: number; endedBy: 'bust' | 'retired'
}
```

### Table handoff

`index.vue` gains one narrow entry path: if `careerStore.pendingSession` is
set on mount, skip the setup screen and configure from it (stake = tier,
stack = 100bb, opponents = roster sample, commentary defaults unchanged).
In career mode the felted-rebuy modal is replaced by session end, and a
"Leave table" control (banks the current stack between hands) appears.
On session end: `careerStore.settle(finalStack, hands, endedBy)` then route
to `/career`. A "Career" card/link on the setup screen and nav exposes the
mode.

### Config

```ts
career: {
  startingBankroll: 50,
  buyInBB: 100,
  promoteBuyIns: 10,     // of the NEXT stake
  promoteMinHands: 100,  // at current tier
  demoteBuyIns: 2,       // of the CURRENT stake
  playerCount: 6,        // 6-max sessions
  tiers: { /* persona-name arrays exactly as enumerated in "The ladder" table above */ },
}
```

## Edge cases

- **Refresh mid-session:** table state is not persisted. On career-page load
  with a `pendingSession` and no settlement, refund the buy-in and log an
  `abandoned` marker on the dashboard. This permits a refresh-to-undo
  exploit; in a solo educational game, forgiveness beats anti-cheat —
  **accepted**, documented here.
- **Felted:** settlement with `cashOut: 0`, `endedBy: 'felted'`.
- **Timeout:** settles like a leave with the current stack.
- **Demotion from tier 1** cannot occur (no tier below); only bust applies.
- **Promotion from tier 6** cannot occur; the dashboard shows "top of the
  ladder" progress state.
- **Storage full/unavailable:** career persists best-effort; a failed write
  surfaces a dashboard notice, never a crash.

## Out of scope

Nemesis/cross-session opponent modeling (pillar 2), coaching/leak reports
(pillar 3), achievements and celebration animations (Phase 7 polish),
tournament mode, difficulty-slider strategy sharpening. Hero adaptation and
session stats work unchanged inside career sessions.

## Success criteria

- Movement rules unit-tested at boundaries; roster names validated against
  `config.personas` by test.
- Full loop playable: start career → session → settle → promote/demote/bust
  → archive → fresh run, verified live in the browser.
- Quick-play behavior byte-identical (career code inert unless entered).
- `yarn test` green, `yarn typecheck` clean, exploit probe untouched
  (no bot-logic changes).
