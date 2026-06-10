# Local-Only Conversion + Pro Bot Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Strip all Supabase/serverless integration so the app is a pure static, local-storage-only SPA deployable on Netlify with zero lambdas; (B) implement the 8 approved bot-realism fixes so pro bots produce realistic game texture and per-persona stats.

**Architecture:** Part A removes the Supabase client layer (every path already has a localStorage fallback — make local the only path). Part B changes `app/utils/botDecision.ts` (decision engine), `app/utils/ranges.ts` (combo-weighted percentiles, hand categories), `holdem.config.ts` (persona retune), `scripts/simulate.ts` (instrumentation), and wires hero-adaptation tracking in `app/pages/index.vue` + `app/stores/heroProfile.ts`.

**Tech Stack:** Nuxt 4 SPA (ssr:false), TypeScript, Vitest, vite-node for headless sims. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-10-pro-bot-realism-design.md`

**Conventions for every commit:** descriptive message, NO AI co-author trailers (user rule). Run `yarn test` before each commit; sims via `./node_modules/.bin/vite-node scripts/simulate.ts 3000 8 --pros`.

---

## Task 1 (A1): Remove Supabase — local-only persistence

**Files:**
- Delete: `app/composables/useSupabase.ts`, `app/components/SupabaseStatus.vue`, `tests/supabase-fallback.test.ts`, `.env.example`
- Modify: `app/composables/useSessionStats.ts`, `app/composables/useStatsData.ts`, `app/pages/index.vue`, `app/pages/stats.vue`, `app/pages/replay.vue`, `app/components/SetupScreen.vue`, `app/components/StatsPanel.vue`, `nuxt.config.ts`, `netlify.toml`, `package.json`, `README.md`

- [ ] **Step 1: Delete dead files**

```bash
git rm app/composables/useSupabase.ts app/components/SupabaseStatus.vue tests/supabase-fallback.test.ts .env.example
```

- [ ] **Step 2: Rewrite `useSessionStats.ts` local-only**

Remove line 7 import. In `useSessionStats()`: delete `userId`/`supabaseReady` refs, the `onMounted` Supabase block (lines 76–115: anon session, autoSaveInterval, sendBeacon — keep the localStorage load at 64–74 and keep a simplified `beforeUnloadHandler` that only does the localStorage save), delete `sessionCreatedInSupabase`, `ensureSessionExists`, `saveHandToSupabase`, `saveSessionToSupabase`, the `saveHandToSupabase(record)` call in `recordHand`, and the `saveSessionToSupabase()` call in `resetSession`. Keep `autoSaveInterval` cleanup refs only if still used (they aren't — remove). Header comment: "persists to localStorage with reactive watch". New return:

```ts
return {
  session: readonly(session),
  initSession,
  recordHand,
  resetSession,
  downloadJSON,
  downloadCSV,
}
```

Simplified onMounted tail (replacing lines 76–117):

```ts
    // Save on tab close
    beforeUnloadHandler = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session.value))
    }
    window.addEventListener('beforeunload', beforeUnloadHandler)
```

- [ ] **Step 3: Rewrite `useStatsData.ts` local-only**

Remove the `useSupabase` import; replace the Supabase branch in its load/clear functions so they always use the existing localStorage path (read the file first; it already contains the complete localStorage implementation — delete the `sb` branches and the `useSupabase()` calls at lines ~62, 105, 115, 127, keeping the fallback bodies).

- [ ] **Step 4: Update `index.vue`**

Line 27: drop `saveSessionToSupabase` and `supabaseReady` from the destructure. Delete the `saveSessionToSupabase()` calls at lines 58, 503, 513 and in the `@click` at line 856 (keep the rest of those handlers). Remove `<SupabaseStatus />` (line 665). Line 896: remove `:supabase-connected="supabaseReady"`.

- [ ] **Step 5: Update `SetupScreen.vue`, `stats.vue`, `replay.vue`, `StatsPanel.vue`**

- `SetupScreen.vue`: remove the import at line 9, `supabaseAvailable` ref and its usages; delete the auth UI sections (`<SupabaseStatus />` at 231, the not-signed-in block at ~497, the connection-failed banner at 476–485 → replace with one static note):

```html
    <div class="bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-emerald-500" />
        <span class="text-sm text-gray-300">Local Storage</span>
      </div>
      <p class="text-xs text-gray-500 mt-1">Session stats are saved in this browser. Export hands as JSON/CSV/PokerStars format anytime.</p>
    </div>
```

- `stats.vue`: remove `<SupabaseStatus />` (line 102) and update the header comment.
- `replay.vue`: remove import (line 17), `loadFromSupabase()` (lines ~90+) and its call at line 57 (keep localStorage lookup).
- `StatsPanel.vue`: remove `supabaseConnected` prop (line 54) and the status row (lines ~922–926) → static `Local only` text or delete the row entirely.

- [ ] **Step 6: Config + dependency removal**

- `nuxt.config.ts`: delete `runtimeConfig.public.supabaseUrl/supabaseKey` and the `vite.optimizeDeps.include` supabase entry (keep devtools entries).
- `netlify.toml`: CSP `connect-src 'self' https://api.iconify.design` (drop supabase hosts).
- `package.json`: remove `"@supabase/supabase-js"`; run `yarn install` to refresh lockfile.

- [ ] **Step 7: README + .gitignore touch-ups**

Update README: "Supabase persistence" bullet → "Local persistence — session stats in browser localStorage; JSON/CSV/PokerStars export. No accounts, no cloud, no serverless."; remove Supabase setup/configuration sections and Security section claims about credential validation; remove `.env` instructions. Grep: `grep -n -i supabase README.md`.

- [ ] **Step 8: Test + commit**

Run: `yarn test` → all green (supabase-fallback test deleted). `grep -rn -i supabase app/ tests/ nuxt.config.ts package.json | grep -v node_modules` → no hits.

```bash
git add -A && git commit -m "Remove Supabase integration — local-only persistence (localStorage + exports)"
```

## Task 2 (A2): Verify static deploy is clean

- [ ] **Step 1:** `yarn generate` → succeeds. Confirm output dir matches `netlify.toml` `publish = "dist"` (Nuxt 4 generates `.output/public`; if `dist` is a symlink to it, fine — otherwise fix `publish`).
- [ ] **Step 2:** `grep -ri supabase dist/ --include="*.js" -l | head` (follow symlink; expect zero hits) and `grep -ri "sendBeacon\|functions" netlify.toml` (no functions config).
- [ ] **Step 3:** Dev server check on :3000 — app boots, play a hand, no console errors. Commit any fixes: `git commit -m "Verify local-only static build"`.

---

## Task 3 (F4): Combo-weighted hand percentile

**Files:** Modify `app/utils/ranges.ts`, `app/utils/botDecision.ts`; Test `tests/realism-fixes.test.ts` (new)

- [ ] **Step 1: Write failing tests** (`tests/realism-fixes.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { handPercentile, ALL_HANDS } from '../app/utils/ranges'
import type { Card } from '../app/utils/cards'

const c = (rank: number, suit: Card['suit']): Card => ({ rank, suit })

describe('F4 — combo-weighted percentile', () => {
  it('AA is the top ~0.45% of dealt hands', () => {
    expect(handPercentile([c(14, 'hearts'), c(14, 'spades')])).toBeCloseTo(6 / 1326, 3)
  })
  it('72o is the bottom (1.0)', () => {
    expect(handPercentile([c(7, 'hearts'), c(2, 'clubs')])).toBeCloseTo(1.0, 3)
  })
  it('random dealt hands are ~uniform: P(pct < 0.25) ≈ 0.25', () => {
    let below = 0
    const N = 40000
    for (let i = 0; i < N; i++) {
      const deck: Card[] = []
      for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as const)
        for (let r = 2; r <= 14; r++) deck.push(c(r, suit))
      const i1 = Math.floor(Math.random() * 52)
      let i2 = Math.floor(Math.random() * 52)
      while (i2 === i1) i2 = Math.floor(Math.random() * 52)
      if (handPercentile([deck[i1], deck[i2]]) < 0.25) below++
    }
    expect(below / N).toBeGreaterThan(0.22)
    expect(below / N).toBeLessThan(0.28)
  })
})
```

- [ ] **Step 2:** Run `yarn vitest run tests/realism-fixes.test.ts` → FAIL (handPercentile not exported).
- [ ] **Step 3: Implement in `ranges.ts`** (after `handRankIndex`):

```ts
// Combos per hand class: pair = 6, suited = 4, offsuit = 12 (1326 total).
function combosFor(hand: string): number {
  if (hand.length === 2) return 6
  return hand.endsWith('s') ? 4 : 12
}

const TOTAL_COMBOS = 1326
const HAND_PERCENTILE: number[] = (() => {
  const out: number[] = []
  let running = 0
  for (const h of ALL_HANDS) { running += combosFor(h); out.push(running / TOTAL_COMBOS) }
  return out
})()

/**
 * Combo-weighted percentile: fraction of all dealt hands at or above this
 * hand's rank (AA ≈ 0.0045, 72o = 1.0). Unlike idx/169, this accounts for
 * each class's combo count, so "percentile < VPIP" plays VPIP% of dealt hands.
 */
export function handPercentile(hole: [Card, Card]): number {
  const idx = handRankIndex(hole)
  return idx < 0 ? 1 : HAND_PERCENTILE[idx]
}
```

In `botDecision.ts`: import `handPercentile`; in `decidePreflopAction` replace `handPct = idx / ALL_HANDS.length` with `handPct = handPercentile(ctx.holeCards)` (keep POS_SHIFT + jitter); in the short-stack push/fold block replace the `chenToPercentile(chenPlusScore(...))` percentile with `handPercentile(ctx.holeCards)` (keep thresholds). Remove now-unused `ALL_HANDS` import if nothing else uses it.

- [ ] **Step 4:** `yarn vitest run tests/realism-fixes.test.ts` → PASS. `yarn test` → investigate any phase4 drift (tolerances are ±8pp; expect green).
- [ ] **Step 5:** `git add -A && git commit -m "Combo-weighted hand percentile — bots now play their configured VPIP of dealt hands"`

## Task 4 (F1): Tilt only on played hands

**Files:** Modify `app/utils/botDecision.ts:63-109`, `app/pages/index.vue:441-447`, `scripts/simulate.ts:409-415`, `app/utils/simulateBrowser.ts:255`; Test `tests/realism-fixes.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { updateTilt, createTiltState } from '../app/utils/botDecision'
import config from '../holdem.config'

describe('F1 — tilt requires participation', () => {
  it('folding preflop 20 times never tilts even Phellmuth', () => {
    const state = createTiltState()
    for (let i = 0; i < 20; i++) updateTilt(state, false, false, config.tilt, 2.5, false)
    expect(state.tilted).toBe(false)
    expect(state.consecutiveLosses).toBe(0)
  })
  it('played losses still tilt (participated default true)', () => {
    const state = createTiltState()
    updateTilt(state, false, false, config.tilt, 2.5)
    expect(state.tilted).toBe(true)
  })
})
```

- [ ] **Step 2:** Run → FAIL (6th arg ignored, consecutiveLosses = 20).
- [ ] **Step 3: Implement.** `updateTilt(state, won, lostBigPot, config, tiltMultiplier = 1.0, participated = true)`; first line of body:

```ts
  if (!participated) return // folded without investing: neither tilts nor calms
```

Call sites — compute participation from the hand log (same vocabulary in all three):

```ts
// scripts/simulate.ts (in the updateTilt loop; `actions` is in scope)
const participated = actions.some(a =>
  a.startsWith(`${p.name} `) && (a.includes('calls') || a.includes('raises') || a.includes('ALL-IN')))
  || (!p.folded && remaining.length > 1)
updateTilt(p.tilt, won, lostBigPot, config.tilt, p.tiltMultiplier, participated)
```

`index.vue` (use `gs.handActionLog.value` and `p.name`, plus `!p.folded` for showdown reach); `simulateBrowser.ts` line 255 equivalently (read its local action log variable first).

- [ ] **Step 4:** `yarn test` → PASS (existing tilt tests use default `participated = true`).
- [ ] **Step 5:** `git add -A && git commit -m "Tilt only triggers on hands the bot actually played"`

## Task 5 (F2): Raise-size-aware preflop defense

**Files:** Modify `app/utils/botDecision.ts` (raiseLevel ≤ 1 facing-raise block, ~532-570); Test `tests/realism-fixes.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { decideBotAction, type DecisionContext } from '../app/utils/botDecision'

function dealRandomHole(): [Card, Card] { /* same deck draw as F4 test, extract helper */ }

function continueRate(currentBetBB: number, trials = 4000): number {
  const profile = { vpip: 0.32, pfr: 0.22, aggression: 1.2, bluffFreq: 0.18, creativeFreq: 0.05, threeBetFreq: 0.10 }
  let cont = 0
  for (let i = 0; i < trials; i++) {
    const ctx: DecisionContext = {
      street: 'preflop', toCall: currentBetBB * 2, pot: currentBetBB * 2 + 3, currentBet: currentBetBB * 2,
      playerBet: 0, chips: 200, bb: 2, numActivePlayers: 4, raiseLevel: 1, position: 'BTN',
      holeCards: dealRandomHole(),
    }
    const a = decideBotAction(profile, ctx)
    if (a.type === 'call' || a.type === 'raise') cont++
  }
  return cont / trials
}

describe('F2 — raise-size-aware defense', () => {
  it('loose bot continues vs 2.5bb open at a healthy rate', () => {
    expect(continueRate(2.5)).toBeGreaterThan(0.15)
  })
  it('vs 25bb jam-like raise, continues under 8%', () => {
    expect(continueRate(25)).toBeLessThan(0.08)
  })
})
```

- [ ] **Step 2:** Run → FAIL (25bb continue ≈ 30%+ today).
- [ ] **Step 3: Implement** at the top of the `raiseLevel <= 1` block:

```ts
    const openSizeBB = currentBet / bb
    const sizePenalty = openSizeBB <= 3 ? 1.0 : Math.pow(3 / openSizeBB, 0.85)
    const jamLike = toCall >= chips * 0.6 || toCall >= bb * 15
    if (jamLike) {
      // Vs a jam: premium-only. ~top 1.7% reshoves (QQ+/AKs), ~top 4.5% calls (TT+/AQs+/AKo).
      const continueRange = Math.max(profile.fourBetFreq ?? 0.025, 0.04)
      if (handPct < continueRange * 0.4 && chips > toCall) {
        return { type: 'raise', amount: chips + playerBet }
      }
      if (handPct < continueRange) return { type: 'call' }
      return { type: 'fold' }
    }
```

Then scale the existing thresholds: `valueFreq * Math.sqrt(sizePenalty)` where value 3-bets are checked, `bluffRate * Math.pow(sizePenalty, 1.5)` for bluff 3-bets, `flatCallFreq * sizePenalty` for flats. In the `raiseLevel === 2` and `raiseLevel === 3` blocks add only the relative jam check (`toCall >= chips * 0.6`) with the same premium-continue shape (use `fiveBetFreq ?? 0.01` as reshove range at level 3).

- [ ] **Step 4:** `yarn test` → PASS. **Step 5:** `git add -A && git commit -m "Preflop defense scales with raise size; jams get premium-only continues"`

## Task 6 (F3): Made-hand bet-size sensitivity postflop

**Files:** Modify `app/utils/botDecision.ts` (hasStrongHand facing-bet block ~1042); Test `tests/realism-fixes.test.ts`

- [ ] **Step 1: Failing test** — top pair good kicker (KhQd on Kc 7s 2d), deep stacks (no SPR shove path):

```ts
function strongFacingBet(betToPot: number, trials = 3000): { folds: number; continues: number } {
  const profile = { vpip: 0.25, pfr: 0.20, aggression: 1.1, bluffFreq: 0.12, creativeFreq: 0.05 }
  let folds = 0, continues = 0
  for (let i = 0; i < trials; i++) {
    const pot = 20
    const ctx: DecisionContext = {
      street: 'flop', toCall: Math.round(pot * betToPot), pot, currentBet: Math.round(pot * betToPot),
      playerBet: 0, chips: 2000, bb: 2, numActivePlayers: 2, position: 'BB',
      holeCards: [c(13, 'hearts'), c(12, 'diamonds')],
      community: [c(13, 'clubs'), c(7, 'spades'), c(2, 'diamonds')],
    }
    const a = decideBotAction(profile, ctx)
    if (a.type === 'fold') folds++
    else continues++
  }
  return { folds: folds / trials, continues: continues / trials }
}

describe('F3 — made hands respect bet size', () => {
  it('top pair folds >40% to a 3x-pot flop shove', () => {
    expect(strongFacingBet(3).folds).toBeGreaterThan(0.40)
  })
  it('top pair rarely folds to a half-pot bet', () => {
    expect(strongFacingBet(0.5).folds).toBeLessThan(0.10)
  })
})
```

- [ ] **Step 2:** Run → FAIL (today folds = 0 at any size on flop).
- [ ] **Step 3: Implement** at the top of the `hasStrongHand` block (before check-raise/raise rolls):

```ts
    // Bet-size sensitivity: non-monster made hands fold to big bets at a rate
    // rising with size and falling with strength. Monsters and rivers handled elsewhere.
    if (!hasMonster && (ctx.street === 'flop' || ctx.street === 'turn') && betToPotRatio > 0.7) {
      const sizePressure = Math.min((betToPotRatio - 0.7) / 1.3, 1)        // 1.0 at 2x pot
      const strengthShield = Math.max(0, Math.min((strength - 0.30) / 0.25, 1))
      const streetWeight = ctx.street === 'turn' ? 1.0 : 0.8
      const foldProb = Math.min(sizePressure * (1 - strengthShield * 0.65) * streetWeight, 0.92)
      if (Math.random() < foldProb) return { type: 'fold' }
    }
```

- [ ] **Step 4:** `yarn test` → PASS. **Step 5:** `git add -A && git commit -m "Top-pair-class hands fold to oversized bets on flop/turn"`

## Task 7 (F6): styleBias range shapes + limpFreq

**Files:** Modify `app/utils/ranges.ts`, `app/utils/botDecision.ts`; Test `tests/realism-fixes.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { handCategory } from '../app/utils/ranges'

describe('F6 — hand categories and styleBias', () => {
  it('categorizes correctly', () => {
    expect(handCategory('88')).toBe('pair')
    expect(handCategory('A5s')).toBe('suitedAce')
    expect(handCategory('87s')).toBe('suitedConnector')
    expect(handCategory('KQo')).toBe('bigCard')
    expect(handCategory('J4o')).toBe('other')
  })
  it('suited-connector bias widens those hands for a Negreanu-style bot', () => {
    // 87s (idx ~48, pct ~0.30) is outside a 22% range normally, inside with -0.10 bias
    const base = { vpip: 0.22, pfr: 0.18, aggression: 1.0, bluffFreq: 0.10, creativeFreq: 0.05 }
    const ctx = (profile: any): DecisionContext => ({
      street: 'preflop', toCall: 2, pot: 3, currentBet: 2, playerBet: 0, chips: 200, bb: 2,
      numActivePlayers: 6, raiseLevel: 0, position: 'MP',
      holeCards: [c(8, 'hearts'), c(7, 'hearts')],
    })
    let plainPlays = 0, biasedPlays = 0
    for (let i = 0; i < 2000; i++) {
      if (decideBotAction(base, ctx(base)).type !== 'fold') plainPlays++
      if (decideBotAction({ ...base, styleBias: { suitedConnector: -0.10 } }, ctx(base)).type !== 'fold') biasedPlays++
    }
    expect(biasedPlays).toBeGreaterThan(plainPlays + 300)
  })
  it('limpFreq=0 pro never open-limps; limpFreq=0.6 passive limps the gap band', () => {
    // Run 3000 first-in decisions from MP with a 30/15 profile, count calls
    const passive = { vpip: 0.30, pfr: 0.15, aggression: 0.8, bluffFreq: 0.08, creativeFreq: 0.04, limpFreq: 0.6 }
    const pro = { ...passive, limpFreq: 0 }
    let passiveLimps = 0, proLimps = 0
    for (let i = 0; i < 3000; i++) {
      const hole = dealRandomHole()
      const mk = (p: any) => decideBotAction(p, { street: 'preflop', toCall: 2, pot: 3, currentBet: 2, playerBet: 0, chips: 200, bb: 2, numActivePlayers: 6, raiseLevel: 0, position: 'MP', holeCards: hole })
      if (mk(passive).type === 'call') passiveLimps++
      if (mk(pro).type === 'call') proLimps++
    }
    expect(proLimps).toBe(0)
    expect(passiveLimps).toBeGreaterThan(100)
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** `ranges.ts`:

```ts
export type HandCategory = 'pair' | 'suitedAce' | 'suitedConnector' | 'bigCard' | 'other'

const RANK_VALS: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 }

/** Mutually exclusive, priority: pair > suitedAce > suitedConnector > bigCard > other. */
export function handCategory(notation: string): HandCategory {
  if (notation.length === 2) return 'pair'
  const hi = RANK_VALS[notation[0]!]!, lo = RANK_VALS[notation[1]!]!
  const suited = notation.endsWith('s')
  if (suited && hi === 14) return 'suitedAce'
  if (suited && hi <= 12 && hi - lo <= 2) return 'suitedConnector'
  if (hi >= 11 && lo >= 10) return 'bigCard'
  return 'other'
}
```

`botDecision.ts`: extend `BotProfile`:

```ts
  styleBias?: Partial<Record<'pair' | 'suitedAce' | 'suitedConnector' | 'bigCard' | 'other', number>>
  limpFreq?: number     // 0–1: chance to open-limp (vs fold) hands in the PFR–VPIP band first-in
  betSizeMult?: number  // sizing personality (Task 8)
  overbetFreq?: number  // sizing personality (Task 8)
```

In `decidePreflopAction` percentile computation, after POS_SHIFT and before jitter:

```ts
      const bias = profile.styleBias?.[handCategory(holeCardsToNotation(ctx.holeCards))] ?? 0
      handPct = Math.max(0, Math.min(1, handPct + bias))
```

(import `handCategory, holeCardsToNotation` from `./ranges`). In the `toCall <= bb && raiseLevel <= 1` branch, replace the non-blind path:

```ts
    if (!isBB && !isSB) {
      if (handPct < effectivePfr) {
        const raiseSize = Math.round(currentBet * (2.5 + profile.aggression * 0.5))
        return { type: 'raise', amount: Math.min(raiseSize, chips + playerBet) }
      }
      if (handPct < effectiveVpip && Math.random() < (profile.limpFreq ?? 0)) {
        return { type: 'call' } // open-limp / over-limp: passive-persona behavior
      }
      return { type: 'fold' }
    }
```

(keep BB/SB logic exactly as-is). Carry the new fields through `applyTilt` (copy them unchanged onto the returned object) and the profile assembly in `index.vue:163-173`, `scripts/simulate.ts:126-136`, `app/utils/simulateBrowser.ts` (persona → profile mapping).

- [ ] **Step 4:** `yarn test` → PASS. **Step 5:** `git add -A && git commit -m "Per-persona range shapes (styleBias) and explicit open-limp model (limpFreq)"`

## Task 8 (F7): Sizing personality + overbets

**Files:** Modify `app/utils/botDecision.ts`; Test `tests/realism-fixes.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe('F7 — sizing personality', () => {
  const monsterCtx = (profile: any): DecisionContext => ({
    street: 'river', toCall: 0, pot: 100, currentBet: 0, playerBet: 0, chips: 1000, bb: 2,
    numActivePlayers: 2, position: 'BTN',
    holeCards: [c(14, 'hearts'), c(14, 'diamonds')],
    community: [c(14, 'clubs'), c(7, 'spades'), c(2, 'diamonds'), c(9, 'hearts'), c(3, 'clubs')], // top set
  })
  it('overbettor (overbetFreq 1.0) bets > pot with a river monster', () => {
    const p = { vpip: 0.30, pfr: 0.25, aggression: 1.4, bluffFreq: 0.2, creativeFreq: 0.05, overbetFreq: 1.0 }
    const sizes: number[] = []
    for (let i = 0; i < 200; i++) {
      const a = decideBotAction(p, monsterCtx(p))
      if (a.type === 'raise') sizes.push(a.amount!)
    }
    expect(Math.max(...sizes)).toBeGreaterThan(100) // some bet exceeds pot
  })
  it('small-ball (betSizeMult 0.8) sizes smaller than big-bet (1.2) on average', () => {
    const mk = (mult: number) => {
      const p = { vpip: 0.30, pfr: 0.25, aggression: 1.0, bluffFreq: 0.15, creativeFreq: 0.05, betSizeMult: mult, overbetFreq: 0 }
      const sizes: number[] = []
      for (let i = 0; i < 400; i++) {
        const a = decideBotAction(p, monsterCtx(p))
        if (a.type === 'raise') sizes.push(a.amount!)
      }
      return sizes.reduce((s, x) => s + x, 0) / sizes.length
    }
    expect(mk(0.8)).toBeLessThan(mk(1.2))
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** in `botDecision.ts`. Add a helper near the top:

```ts
/** Pot-fraction bet size with persona sizing personality applied. */
function sizedBet(pot: number, baseFrac: number, profile: BotProfile, bb: number): number {
  const mult = profile.betSizeMult ?? 1.0
  return Math.max(Math.round(pot * baseFrac * mult), bb)
}

/** Roll for an overbet (1.2–1.5x pot); returns the size or null. */
function maybeOverbet(pot: number, profile: BotProfile, bb: number): number | null {
  const freq = (profile.overbetFreq ?? 0.03) * (profile.aggression >= 1.3 ? 1.5 : 1.0)
  if (Math.random() >= freq) return null
  return Math.max(Math.round(pot * (1.2 + Math.random() * 0.3)), bb)
}
```

Thread `profile.betSizeMult` through every postflop pot-fraction bet (c-bet, barrel, probe, donk, river value/bluff) by replacing `Math.round(pot * (X + ...))` with `sizedBet(pot, X + profile.aggression * Y + Math.random() * Z, profile, bb)`. In the river value branches (monster bet for raiser ~line 884-889 and non-raiser ~line 895-905) and river bluff branches, call `maybeOverbet` first:

```ts
      const ob = maybeOverbet(pot, profile, bb)
      const betSize = ob ?? sizedBet(pot, 0.55 + profile.aggression * 0.15 + Math.random() * 0.15, profile, bb)
      return { type: 'raise', amount: betSize + playerBet }
```

Preflop opens use position-based base (config.botSizing values inlined as named constants to avoid a config import cycle — `const OPEN_MULT_EP = 2.5, OPEN_MULT_LATE = 2.2`):

```ts
      const latePos = ['BTN', 'D', 'D/BTN', 'D/SB', 'CO'].includes(ctx.position ?? '')
      const openMult = (latePos ? OPEN_MULT_LATE : OPEN_MULT_EP) + (profile.aggression - 1) * 0.4
      const raiseSize = Math.round(bb * openMult * (profile.betSizeMult ?? 1.0))
```

(Apply in both the `toCall === 0` open and the first-in raise added in Task 7.) Note in `holdem.config.ts` `botSizing` comment that the engine consumes these values via named constants in botDecision.ts — OR delete the block in Task 12; decision recorded there.

- [ ] **Step 4:** `yarn test` → PASS. **Step 5:** `git add -A && git commit -m "Sizing personality: betSizeMult, position-based opens, river overbets"`

## Task 9 (F5): Persona config retune

**Files:** Modify `holdem.config.ts:119-147`; existing tests are the spec here (`tests/phase4-pro-bots.test.ts` relationships must keep passing)

- [ ] **Step 1:** Replace the 20 pro persona rows with the retuned table (VPIP/PFR/agg/bluff/creative/tilt/consistency/3bet/4bet/5bet + new fields). Exact values:

```ts
{ name: 'Hill Phellmuth',   vpip: 0.18, pfr: 0.11, aggression: 0.95, bluffFreq: 0.08, creativeFreq: 0.04, tiltMultiplier: 2.5, consistency: 0.96, threeBetFreq: 0.04, fourBetFreq: 0.02,  fiveBetFreq: 0.008, donkBetFreq: 0, limpFreq: 0.55, styleBias: { bigCard: -0.04, suitedConnector: 0.04, other: 0.02 }, leak: '...' },
{ name: 'Naniel Degreanu',  vpip: 0.30, pfr: 0.19, aggression: 1.05, bluffFreq: 0.14, creativeFreq: 0.10, tiltMultiplier: 0.5, consistency: 0.96, threeBetFreq: 0.06, fourBetFreq: 0.025, fiveBetFreq: 0.008, donkBetFreq: 0, limpFreq: 0.15, betSizeMult: 0.85, styleBias: { suitedConnector: -0.06, pair: -0.02 }, leak: '...' },
{ name: 'Ihil Pvey',        vpip: 0.25, pfr: 0.20, aggression: 1.45, bluffFreq: 0.15, creativeFreq: 0.06, tiltMultiplier: 0.3, consistency: 0.99, threeBetFreq: 0.09, fourBetFreq: 0.04,  fiveBetFreq: 0.01,  donkBetFreq: 0, betSizeMult: 1.05, leak: '...' },
{ name: 'Boyle Drunson',    vpip: 0.27, pfr: 0.20, aggression: 1.40, bluffFreq: 0.16, creativeFreq: 0.09, tiltMultiplier: 0.4, consistency: 0.96, threeBetFreq: 0.07, fourBetFreq: 0.035, fiveBetFreq: 0.01,  donkBetFreq: 0, styleBias: { pair: -0.04, suitedConnector: -0.03 }, leak: '...' },
{ name: 'Tennifer Jilly',   vpip: 0.30, pfr: 0.15, aggression: 0.90, bluffFreq: 0.12, creativeFreq: 0.07, tiltMultiplier: 1.3, consistency: 0.91, threeBetFreq: 0.05, fourBetFreq: 0.02,  fiveBetFreq: 0.008, donkBetFreq: 0, limpFreq: 0.35, leak: '...' },
{ name: 'Lhil Paak',        vpip: 0.26, pfr: 0.20, aggression: 1.20, bluffFreq: 0.16, creativeFreq: 0.11, tiltMultiplier: 0.6, consistency: 0.93, threeBetFreq: 0.08, fourBetFreq: 0.035, fiveBetFreq: 0.01,  donkBetFreq: 0, leak: '...' },
{ name: 'Entonio Asfandiari', vpip: 0.28, pfr: 0.22, aggression: 1.30, bluffFreq: 0.18, creativeFreq: 0.08, tiltMultiplier: 0.9, consistency: 0.94, threeBetFreq: 0.08, fourBetFreq: 0.04, fiveBetFreq: 0.012, donkBetFreq: 0, leak: '...' },
{ name: 'Kabe Gaplan',      vpip: 0.25, pfr: 0.18, aggression: 1.00, bluffFreq: 0.11, creativeFreq: 0.05, tiltMultiplier: 0.8, consistency: 0.95, threeBetFreq: 0.06, fourBetFreq: 0.025, fiveBetFreq: 0.008, donkBetFreq: 0, leak: '...' },
{ name: 'Bean-Robert Jellande', vpip: 0.38, pfr: 0.25, aggression: 1.35, bluffFreq: 0.22, creativeFreq: 0.09, tiltMultiplier: 1.4, consistency: 0.90, threeBetFreq: 0.10, fourBetFreq: 0.05, fiveBetFreq: 0.015, donkBetFreq: 0, limpFreq: 0.10, leak: '...' },
{ name: 'Mike the Mouth',   vpip: 0.28, pfr: 0.22, aggression: 1.25, bluffFreq: 0.17, creativeFreq: 0.06, tiltMultiplier: 2.2, consistency: 0.91, threeBetFreq: 0.08, fourBetFreq: 0.04,  fiveBetFreq: 0.01,  donkBetFreq: 0, leak: '...' },
{ name: 'Mhris Coneymaker', vpip: 0.29, pfr: 0.18, aggression: 1.05, bluffFreq: 0.14, creativeFreq: 0.05, tiltMultiplier: 1.1, consistency: 0.92, threeBetFreq: 0.06, fourBetFreq: 0.025, fiveBetFreq: 0.008, donkBetFreq: 0, limpFreq: 0.20, leak: '...' },
{ name: 'Rhip Ceese',       vpip: 0.24, pfr: 0.19, aggression: 1.25, bluffFreq: 0.12, creativeFreq: 0.07, tiltMultiplier: 0.3, consistency: 0.98, threeBetFreq: 0.07, fourBetFreq: 0.035, fiveBetFreq: 0.01,  donkBetFreq: 0, leak: '...' },
{ name: 'Utu Sngar',        vpip: 0.30, pfr: 0.25, aggression: 1.50, bluffFreq: 0.20, creativeFreq: 0.12, tiltMultiplier: 1.2, consistency: 0.93, threeBetFreq: 0.11, fourBetFreq: 0.05,  fiveBetFreq: 0.012, donkBetFreq: 0, betSizeMult: 1.10, leak: '...' },
{ name: 'Sanessa Velbst',   vpip: 0.28, pfr: 0.23, aggression: 1.40, bluffFreq: 0.19, creativeFreq: 0.07, tiltMultiplier: 0.8, consistency: 0.95, threeBetFreq: 0.12, fourBetFreq: 0.06,  fiveBetFreq: 0.015, donkBetFreq: 0, styleBias: { suitedAce: -0.04 }, leak: '...' },
{ name: 'Serik Eidel',      vpip: 0.21, pfr: 0.17, aggression: 1.05, bluffFreq: 0.11, creativeFreq: 0.05, tiltMultiplier: 0.3, consistency: 0.98, threeBetFreq: 0.06, fourBetFreq: 0.03,  fiveBetFreq: 0.01,  donkBetFreq: 0, leak: '...' },
{ name: 'Dom Twan',         vpip: 0.32, pfr: 0.26, aggression: 1.50, bluffFreq: 0.24, creativeFreq: 0.10, tiltMultiplier: 0.5, consistency: 0.95, threeBetFreq: 0.12, fourBetFreq: 0.06,  fiveBetFreq: 0.02,  donkBetFreq: 0, betSizeMult: 1.20, overbetFreq: 0.18, styleBias: { other: -0.03 }, leak: '...' },
{ name: 'Aatrik Pantonius', vpip: 0.24, pfr: 0.20, aggression: 1.25, bluffFreq: 0.14, creativeFreq: 0.06, tiltMultiplier: 0.4, consistency: 0.97, threeBetFreq: 0.09, fourBetFreq: 0.04,  fiveBetFreq: 0.015, donkBetFreq: 0, leak: '...' },
{ name: 'Ncotty Sguyen',    vpip: 0.30, pfr: 0.20, aggression: 1.15, bluffFreq: 0.16, creativeFreq: 0.08, tiltMultiplier: 1.2, consistency: 0.91, threeBetFreq: 0.07, fourBetFreq: 0.03,  fiveBetFreq: 0.008, donkBetFreq: 0, limpFreq: 0.15, leak: '...' },
{ name: 'Cohnny Jhan',      vpip: 0.22, pfr: 0.18, aggression: 1.10, bluffFreq: 0.11, creativeFreq: 0.05, tiltMultiplier: 0.5, consistency: 0.97, threeBetFreq: 0.06, fourBetFreq: 0.03,  fiveBetFreq: 0.01,  donkBetFreq: 0, leak: '...' },
{ name: 'Krynn Benney',     vpip: 0.25, pfr: 0.21, aggression: 1.30, bluffFreq: 0.17, creativeFreq: 0.08, tiltMultiplier: 0.6, consistency: 0.95, threeBetFreq: 0.09, fourBetFreq: 0.045, fiveBetFreq: 0.012, donkBetFreq: 0, leak: '...' },
```

Keep each existing `leak` string verbatim. Fictional bots: keep all stats; add `limpFreq` only — Tight Tony 0.20, Loose Lucy 0.35, Calling Carl 0.60, Tricky Tina 0.10. Keep presets unchanged.

- [ ] **Step 2:** Update profile assembly in `index.vue`, `scripts/simulate.ts`, `simulateBrowser.ts` to pass `limpFreq`, `styleBias`, `betSizeMult`, `overbetFreq` from persona → BotProfile.
- [ ] **Step 3:** `yarn test` → verify phase4-pro-bots relationship tests still pass (Degreanu still ties-or-leads the loosest-pro check at 0.30 vs Jilly 0.30 — assertion is `toBe(Math.max(...))`, 0.30 === 0.30 ✓; Matusow 2.2 between 2.0 and 2.5 ✓; Degreanu in top-3 creativeFreq ✓ — order in array breaks the tie). Fix any assertion that hard-codes old values, preserving its intent.
- [ ] **Step 4:** `git add -A && git commit -m "Retune pro personas to realistic live stats; escalation freqs halved"`

## Task 10 (F8a): Card-aware test harness

**Files:** Modify `app/utils/botDecision.ts:1116-1274` (`simulateBotStats`, `simulateEscalationStats`); Test: existing phase4 suites

- [ ] **Step 1:** In both simulators, deal real cards per iteration (Fisher-Yates over a 52-card deck built inline), rotate positions `['UTG','MP','CO','BTN','SB','BB']`, pass `position` and `holeCards` in every ctx, and `community: deck.slice(2, 5)` for the postflop ctx.
- [ ] **Step 2:** `yarn test` → re-baseline any phase4 tolerance that now fails ONLY if observed value is defensibly realistic (document each change in the commit message; expected: VPIP observed lands closer to config than before, PFR slightly under).
- [ ] **Step 3:** `git add -A && git commit -m "Test harness deals real cards — unit stats now exercise the card-aware path"`

## Task 11 (F8b): Sim instrumentation

**Files:** Modify `scripts/simulate.ts`

- [ ] **Step 1:** Extend `BotStats` with `wtsdCount`, `wonAtShowdown`, `threeBetOpps`, `threeBetsMade`, `vs3BetOpps`, `vs3BetFolds`. Count `threeBetOpps`/`threeBetsMade` at decision time inside `runBettingRound` (when `street === 'preflop' && preflopRaiseLevel === 1` before calling `decideBotAction`; increment made on raise). Count `vs3BetOpps`/`vs3BetFolds` when `preflopRaiseLevel === 2`. After winner determination: for each non-folded player in a 2+ player showdown, `wtsdCount++`, and `wonAtShowdown++` for winners.
- [ ] **Step 2:** Output table: rename `AF (cfg)` → `AF` + `Agg`; add `WTSD%` (wtsd/flopsSeen), `W$SD%` (won/wtsd), `3Bet/opp%`, `vs3B fold%`. Keep the config-deviation flags.
- [ ] **Step 3:** Run `./node_modules/.bin/vite-node scripts/simulate.ts 500 8 --pros` → table renders, sanity-check columns. Commit: `git commit -m "Sim reports WTSD, W\$SD, per-opportunity 3-bet%, fold-to-3-bet"`

## Task 12 (F8d): Remove dead config blocks; README touch-ups

**Files:** Modify `holdem.config.ts`, `README.md`

- [ ] **Step 1:** Delete `botRanges`, `botEscalation`, `botEquityThresholds`, and `botSizing` blocks from `holdem.config.ts` (engine consumes named constants in botDecision.ts; `ranges.ts` owns display ranges). Verify: `grep -rn "botRanges\|botEscalation\|botEquityThresholds\|botSizing" app/ scripts/ tests/` → no hits.
- [ ] **Step 2:** README: update persona stat mentions that changed (grep persona names), the bot-AI feature bullets that reference removed config blocks, and add one line documenting limpFreq/styleBias/betSizeMult/overbetFreq persona fields.
- [ ] **Step 3:** `yarn test` green. Commit: `git commit -m "Remove unused bot config blocks; README reflects new persona fields"`

## Task 13 (F8c): Wire hero adaptation + betSizingTell

**Files:** Modify `app/stores/heroProfile.ts`, `app/pages/index.vue`; Test `tests/realism-fixes.test.ts` (store-level)

- [ ] **Step 1: Failing store test**

```ts
import { setActivePinia, createPinia } from 'pinia'
import { useHeroProfileStore } from '../app/stores/heroProfile'

describe('F8c — betSizingTell', () => {
  it('detects big-with-value tell after 8 showdowns', () => {
    setActivePinia(createPinia())
    const store = useHeroProfileStore()
    for (let i = 0; i < 4; i++) {
      store.recordHeroBetSizing(0.9); store.finalizeHandSizing({ shown: true, strong: true })
      store.recordHeroBetSizing(0.3); store.finalizeHandSizing({ shown: true, strong: false })
    }
    expect(store.betSizingTell?.hasTell).toBe(true)
    expect(store.betSizingTell?.bigWithValue).toBe(true)
  })
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement** in `heroProfile.ts`:

```ts
  interface ShowdownSizing { avgSizing: number; wasStrong: boolean }
  const showdownSizings = ref<ShowdownSizing[]>([])
  const pendingSizings = ref<number[]>([])

  function recordHeroBetSizing(betToPot: number) { pendingSizings.value.push(betToPot) }

  function finalizeHandSizing(showdown: { shown: boolean; strong: boolean } | null) {
    if (showdown?.shown && pendingSizings.value.length > 0) {
      const avg = pendingSizings.value.reduce((s, x) => s + x, 0) / pendingSizings.value.length
      showdownSizings.value.push({ avgSizing: avg, wasStrong: showdown.strong })
      if (showdownSizings.value.length > 30) showdownSizings.value.shift()
    }
    pendingSizings.value = []
  }

  const betSizingTell = computed(() => {
    const strong = showdownSizings.value.filter(r => r.wasStrong)
    const weak = showdownSizings.value.filter(r => !r.wasStrong)
    if (strong.length < 4 || weak.length < 4) return undefined
    const avg = (rs: ShowdownSizing[]) => rs.reduce((s, r) => s + r.avgSizing, 0) / rs.length
    const strongAvgSizing = avg(strong), weakAvgSizing = avg(weak)
    if (Math.abs(strongAvgSizing - weakAvgSizing) < 0.15) return { hasTell: false, bigWithValue: false, strongAvgSizing, weakAvgSizing }
    return { hasTell: true, bigWithValue: strongAvgSizing > weakAvgSizing, strongAvgSizing, weakAvgSizing }
  })
```

Export all three. **Step 4** in `index.vue`:
- Wrap hero raise entry points: `function heroRaise(amount: number) { if (gs.street.value !== 'preflop') heroProfileStore.recordHeroBetSizing(amount / Math.max(gs.pot.value, 1)); engine.handleRaise(amount) }` — swap the keyboard handler (line 273) and the template's raise binding to `heroRaise`.
- In `endHand`, replace the hardcoded `faced3Bet: false...` block with log-derived values (preflop slice of `gs.handActionLog.value`, hero name prefix; faced3Bet = hero raised then a later non-hero `raises to`/`ALL-IN` line exists in preflop while hero active; foldedTo3Bet = faced3Bet && a later hero `folds` line in preflop; facedCbet = hero not last preflop raiser && first flop-section bet line is non-hero && hero has any flop-section line after it; foldedToCbet = facedCbet && hero `folds` in flop section), and call `heroProfileStore.finalizeHandSizing(...)` with `shown` = hero reached a 2+ player showdown, `strong` = `bestHand(heroCards, community).rank >= 2`.
- Pass `betSizingTell: heroProfileStore.betSizingTell` into the `heroProfile` object at line 180-188.
- [ ] **Step 5:** `yarn test` → PASS. Manual: play 3 hands on :3000, no console errors. Commit: `git commit -m "Wire hero fold-to-3bet/c-bet tracking and bet-sizing tell — adaptation features now live"`

## Task 14: Final validation + calibration

- [ ] **Step 1:** `yarn test` → full suite green.
- [ ] **Step 2:** Run `./node_modules/.bin/vite-node scripts/simulate.ts 3000 8 --pros` twice. Check acceptance bands (spec): 3-bet pots 6–14%, all-ins ≤6%, flops 35–55%, showdowns 12–25%, rebuys <8/bot, VPIP ±3pp / PFR ±4pp (non-tilt pros), Phellmuth VPIP 16–24%, per-opp 3-bet ±3pp of config.
- [ ] **Step 3:** If a band misses, tune in this order and re-run: (a) first-in raise threshold (Task 7 — try `effectivePfr * 1.15` if VPIP/PFR low), (b) F2 `sizePenalty` exponent ±0.15, (c) F3 `foldProb` cap ±0.1, (d) c-bet/barrel base rates ±10%. One knob per iteration, document each in the commit.
- [ ] **Step 4:** Run a 6-player fictional sim (`--fictional`) — confirm loose-passive bots limp and the table still functions.
- [ ] **Step 5:** Update CHANGELOG.md (new version entry: local-only + realism overhaul), bump `package.json` version to 0.18.0. Commit: `git commit -m "v0.18.0 — local-only build, bot realism overhaul (combo-weighted ranges, episodic tilt, size-aware defense)"`

## Self-review notes

- Spec coverage: F1→T4, F2→T5, F3→T6, F4→T3, F5→T9, F6→T7, F7→T8, F8a→T10, F8b→T11, F8c→T13, F8d→T12, acceptance→T14, local-only→T1-T2. ✓
- Type consistency: `BotProfile.styleBias/limpFreq/betSizeMult/overbetFreq` defined in T7/T8, consumed in T9/T13; `handPercentile`/`handCategory` defined T3/T7. ✓
- Calibration knobs are explicitly enumerated (T14 step 3) rather than left vague. ✓
