# Round 8 Leak Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three measured bot leaks (size-blind river defense, an unreachable 25bb push/fold mode, size-blind 3-bet defense), make the bots bluff rivers at their configured rate, widen big-blind defense against small opens, and promote the composite probe that found them into the CI gate.

**Architecture:** Targeted patches inside the existing branches of `decidePreflopAction` / `decidePostflopAction` in `app/utils/botDecision.ts`. No new decision model and no post-processing layer. Every new constant lives in `holdem.config.ts` → `strategy`. A new `scripts/composite-probe.ts` reuses the existing probe's table loop through an additive option on `runStrategy`, so pure-strategy probe numbers stay byte-identical. Four small extractions (`app/utils/botConfig.ts`, `app/utils/heroRecord.ts`) make untested UI logic unit-testable.

**Tech Stack:** TypeScript, Nuxt 4 (Vue 3, `~` alias = `app/`, `@config` = `holdem.config.ts`), Vitest 4, vite-node for scripts. Scripts under `scripts/` must import with **relative paths** — vite-node ignores the vitest aliases.

**Spec:** `docs/superpowers/specs/2026-09-05-round8-leak-fixes-design.md`

## Global Constraints

- Every new tuning constant goes in `holdem.config.ts` → `strategy` (`strategy.river.*`, `strategy.preflop.*`). No magic numbers in branch logic.
- **Degenerate lines must always lose.** Any-two / spam / station probe strategies stay clearly negative at every depth; a pure nit may sit at +0 to +5 bb/100 at 20–25bb.
- After **any** change to `app/utils/botDecision.ts`, run all of:
  - `yarn test`
  - `yarn typecheck`
  - `yarn probe all 10000 20260712` and the same at depths `25`, `20`, `15`
  - `yarn probe:composite all 30000 20260712,999,7,4242` (from Task 6 onward)
- Gate bound is unchanged: every probe cell must be `< +10` bb/100.
- TDD: write the failing test, run it and watch it fail, implement, watch it pass, commit.
- **Commit messages end with the descriptive content. Never add a `Co-Authored-By` or any other AI-attribution trailer** (standing user rule, overrides the default commit template).
- Nothing is pushed. Commits land on `main`.
- Composite-probe deltas are noisy: per-seed bb/100 SD is ≈ 8–10 over 30k hands, so judge every cell on the **4-seed mean**, never one seed.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `app/pages/index.vue` | footer link host; delegates hero-record parsing | 1, 4 |
| `package.json` | `repository` field; `probe:composite` script | 1, 6 |
| `CHANGELOG.md` | link definitions, 0.20.0 corrections, Unreleased entries | 1, 2, 13 |
| `tests/links.test.ts` | **new** — pins repo host and link-definition coverage | 1 |
| `README.md` | intro, decision-flow docs, probe table, Round 8 audit entry | 2, 13 |
| `app/utils/botConfig.ts` | **new** — pure persona/preset → `BotConfig` mapping | 3 |
| `tests/bot-config.test.ts` | **new** — every strategy field survives a preset switch | 3 |
| `app/utils/heroRecord.ts` | **new** — pure hand-log → `HeroHandRecord` parsing | 4 |
| `tests/hero-record.test.ts` | **new** — name-collision and blank-name cases | 4 |
| `scripts/exploit-probe.ts` | richer hero context + optional baseline profile | 5 |
| `scripts/composite-probe.ts` | **new** — baseline-plus-deviation probe | 6 |
| `holdem.config.ts` | `strategy.river`, new `strategy.preflop` knobs | 7, 9, 10, 11 |
| `app/utils/botDecision.ts` | the five bot-brain patches | 7–11 |
| `tests/river-defense.test.ts` | **new** — size-aware river defense + bluff rates | 7, 8 |
| `tests/short-stack.test.ts` | **new** — push/fold band, commit rule, jam calls | 9 |
| `tests/reraise-size.test.ts` | **new** — 3-bet/4-bet size penalty, BB defense | 10, 11 |
| `tests/composite-probe.test.ts` | **new** — five seeded gate cells | 12 |
| `tests/exploit-probe.test.ts` | adds the 20bb depth | 12 |
| `tests/phase4-bot-ai.test.ts` | drops the dead `shortStackThreshold` pin | 9 |

---

### Task 1: Repository links

Every GitHub URL in the app and the changelog points at `cschweda/holdem-simulator`, which 404s. The real remote is `cschweda/metaincognita-holdem`. Twenty-one headings in `CHANGELOG.md` also have no link definition at all.

**Files:**
- Modify: `app/pages/index.vue:1111`, `CHANGELOG.md:1113-1132`, `package.json`
- Test: `tests/links.test.ts` (create)

**Interfaces:**
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```ts
// tests/links.test.ts
/**
 * Repository links. The canonical repo is cschweda/metaincognita-holdem;
 * an older name (holdem-simulator) was templated from package.json `name`
 * and 404s everywhere it appears (Round 8). Every CHANGELOG heading for a
 * version that has a git tag must also carry a link definition, or the
 * rendered list shows a mix of links and bare bracketed text.
 */
import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'

const REPO = 'cschweda/metaincognita-holdem'
const FILES = ['README.md', 'CHANGELOG.md', 'app/pages/index.vue', 'package.json']

describe('repository links', () => {
  for (const f of FILES) {
    it(`${f} has no stale holdem-simulator GitHub URL`, () => {
      const src = readFileSync(f, 'utf-8')
      expect(src).not.toMatch(/github\.com\/cschweda\/holdem-simulator/)
    })
  }

  it('package.json names the canonical repository', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    expect(pkg.repository).toBe(`github:${REPO}`)
  })

  it('every CHANGELOG version heading with a tag has a link definition', () => {
    const src = readFileSync('CHANGELOG.md', 'utf-8')
    const headings = [...src.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(m => m[1]!)
    const defs = new Set([...src.matchAll(/^\[(\d+\.\d+\.\d+)\]:/gm)].map(m => m[1]!))
    // v0.11.0 was never tagged (the release went out as v0.11.1), so it
    // deliberately has no compare link — nothing to compare against.
    const untagged = new Set(['0.11.0'])
    const missing = headings.filter(h => !defs.has(h) && !untagged.has(h))
    expect(missing).toEqual([])
  })

  it('every CHANGELOG link definition points at the canonical repo', () => {
    const src = readFileSync('CHANGELOG.md', 'utf-8')
    const defs = [...src.matchAll(/^\[[^\]]+\]: (\S+)/gm)].map(m => m[1]!)
    expect(defs.length).toBeGreaterThan(20)
    for (const url of defs) expect(url).toContain(REPO)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/links.test.ts`
Expected: FAIL — stale URLs in `CHANGELOG.md` and `app/pages/index.vue`, no `repository` field, 20 missing definitions.

- [ ] **Step 3: Fix the host everywhere and add the repository field**

```bash
sed -i '' 's#github\.com/cschweda/holdem-simulator#github.com/cschweda/metaincognita-holdem#g' CHANGELOG.md app/pages/index.vue
```

In `package.json`, add after the `"private": true,` line:

```json
  "repository": "github:cschweda/metaincognita-holdem",
```

- [ ] **Step 4: Add the twenty missing link definitions**

In `CHANGELOG.md`, insert these lines immediately after the `[0.20.0]:` definition and before `[0.10.2]:` (v0.11.0 is intentionally absent — it has no tag):

```
[0.19.0]: https://github.com/cschweda/metaincognita-holdem/compare/v0.18.1...v0.19.0
[0.18.1]: https://github.com/cschweda/metaincognita-holdem/compare/v0.18.0...v0.18.1
[0.18.0]: https://github.com/cschweda/metaincognita-holdem/compare/v0.17.2...v0.18.0
[0.17.2]: https://github.com/cschweda/metaincognita-holdem/compare/v0.17.1...v0.17.2
[0.17.1]: https://github.com/cschweda/metaincognita-holdem/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/cschweda/metaincognita-holdem/compare/v0.16.1...v0.17.0
[0.16.1]: https://github.com/cschweda/metaincognita-holdem/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/cschweda/metaincognita-holdem/compare/v0.15.3...v0.16.0
[0.15.3]: https://github.com/cschweda/metaincognita-holdem/compare/v0.15.2...v0.15.3
[0.15.2]: https://github.com/cschweda/metaincognita-holdem/compare/v0.15.1...v0.15.2
[0.15.1]: https://github.com/cschweda/metaincognita-holdem/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/cschweda/metaincognita-holdem/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/cschweda/metaincognita-holdem/compare/v0.13.2...v0.14.0
[0.13.2]: https://github.com/cschweda/metaincognita-holdem/compare/v0.13.1...v0.13.2
[0.13.1]: https://github.com/cschweda/metaincognita-holdem/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/cschweda/metaincognita-holdem/compare/v0.12.2...v0.13.0
[0.12.2]: https://github.com/cschweda/metaincognita-holdem/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/cschweda/metaincognita-holdem/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/cschweda/metaincognita-holdem/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/cschweda/metaincognita-holdem/compare/v0.10.2...v0.11.1
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `yarn vitest run tests/links.test.ts`
Expected: PASS (25 assertions).

- [ ] **Step 6: Verify the canonical URL actually resolves**

Run: `curl -s -o /dev/null -w '%{http_code}\n' -L https://github.com/cschweda/metaincognita-holdem/compare/v0.19.0...v0.20.0`
Expected: `200`.

- [ ] **Step 7: Commit**

```bash
git add tests/links.test.ts CHANGELOG.md app/pages/index.vue package.json
git commit -m "Fix the repository host on every GitHub link; backfill 20 CHANGELOG link definitions (Round 8)"
```

---

### Task 2: Documentation corrections

The README intro still advertises a Tauri desktop build that was deleted in 0.20.0, the released 0.20.0 changelog section contradicts itself in four places, and line 121 carries a stray typo ("werwhae") introduced in the working tree.

**Files:**
- Modify: `README.md:16`, `CHANGELOG.md` (lines 17, 62, 74, 78-79, 121)

**Interfaces:**
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Revert the stray typo**

In `CHANGELOG.md:121`, change `werwhae scored as monsters` back to `were scored as monsters`.

Verify: `git diff --stat CHANGELOG.md` should now show only the Task 1 link changes plus this line.

- [ ] **Step 2: Remove the Tauri sentence from the README intro**

In `README.md:16`, delete the sentence `Runs in the browser or as a native desktop app (macOS, Windows, Linux) via Tauri 2.` The app is web-only as of 0.20.0 (`CHANGELOG.md:63`, `README.md:1233`).

- [ ] **Step 3: Correct the four self-contradictions in the 0.20.0 section**

These were written while the round was in progress and promoted verbatim at release.

- Line 17 — ends `...two findings remain open by design decision (thinking-insight leak, stale public/analysis.html)`. Both were fixed in the same release (lines 33 and 61). Replace the clause with: `both remaining Round 6 findings were closed in this release (the thinking-insight pill is gated behind the study toggle, and the static analysis report is gone).`
- Line 62 — ends `A real table-read adaptation is on the roadmap, to be built with probe coverage.` Table reads shipped in this same release (line 14). Delete that sentence.
- Line 74 — says the Round 7 findings were `logged as open findings` and recommends the CSP `can drop unsafe-eval and the iconify origin`. Replace with: `every finding was worked through in the same round (see the README audit log); the CSP dropped 'unsafe-eval' and deliberately kept the iconify origin as an icon-bundle fallback.`
- Lines 78–79 — `836 tests / 27 files` and `all six strategies` are both stale. Set the test count to `983 tests / 43 files` (matching the shipped README) and the battery to `all nine strategies at 100bb and 25bb`.

- [ ] **Step 4: Verify no contradiction survives**

```bash
grep -n 'Tauri 2\|werwhae\|remain open by design\|all six strategies\|836 tests' README.md CHANGELOG.md
```
Expected: no output.

- [ ] **Step 5: Run the link test (it reads both files)**

Run: `yarn vitest run tests/links.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "Docs: drop the removed Tauri target from the intro, reconcile the 0.20.0 notes with what shipped"
```

---

### Task 3: Preset switching keeps every strategy field

`applyPreset` in `app/components/SetupScreen.vue:102` copies only seven of the twelve strategy fields. Switching a seat from Calling Carl to a pro leaves Carl's `donkBetFreq: 0.22` and `limpFreq: 0.65` attached to the pro. `generateDefaultBots` (line 68) does the mapping correctly but separately — two copies of one mapping is why they drifted.

**Files:**
- Create: `app/utils/botConfig.ts`
- Modify: `app/components/SetupScreen.vue` (imports; `generateDefaultBots`; `applyPreset`)
- Test: `tests/bot-config.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  export interface BotStrategyFields {
    vpip: number; pfr: number; aggression: number; bluffFreq: number; creativeFreq: number
    tiltMultiplier: number
    threeBetFreq?: number; fourBetFreq?: number; fiveBetFreq?: number; donkBetFreq?: number
    limpFreq?: number
    styleBias?: Partial<Record<'pair' | 'suitedAce' | 'suitedConnector' | 'bigCard' | 'other', number>>
    betSizeMult?: number; overbetFreq?: number
    leak?: string
  }
  export function botStrategyFromPreset(preset: Record<string, unknown>): BotStrategyFields
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/bot-config.test.ts
/**
 * One mapping from a persona/preset to a bot's strategy fields, shared by the
 * setup screen's initial roster and its preset dropdown. Round 8: applyPreset
 * copied seven of twelve fields, so switching a seat away from a persona with
 * a donk/limp tendency left that tendency attached to the new persona.
 */
import { describe, it, expect } from 'vitest'
import { botStrategyFromPreset } from '../app/utils/botConfig'
import config from '../holdem.config'

const persona = (name: string) => config.personas.find(p => p.name === name)!
const preset = (name: string) => config.botPresets.find(p => p.name === name)!

describe('botStrategyFromPreset', () => {
  it('carries every strategy field of a persona that has them', () => {
    const carl = botStrategyFromPreset(persona('Calling Carl'))
    expect(carl.donkBetFreq).toBe(0.22)
    expect(carl.limpFreq).toBe(0.65)
    expect(carl.tiltMultiplier).toBe(0.8)
  })

  it('carries the shaping fields a pro persona defines', () => {
    const negreanu = botStrategyFromPreset(persona('Naniel Degreanu'))
    expect(negreanu.betSizeMult).toBe(0.85)
    expect(negreanu.styleBias).toEqual({ suitedConnector: -0.06, pair: -0.02 })
    const twan = botStrategyFromPreset(persona('Dom Twan'))
    expect(twan.overbetFreq).toBe(0.18)
  })

  it('clears fields a generic preset does not define (no leakage between presets)', () => {
    const nit = botStrategyFromPreset(preset('Nit'))
    expect(nit.donkBetFreq).toBeUndefined()
    expect(nit.limpFreq).toBeUndefined()
    expect(nit.styleBias).toBeUndefined()
    expect(nit.betSizeMult).toBeUndefined()
    expect(nit.overbetFreq).toBeUndefined()
    expect(nit.leak).toBeUndefined()
    expect(nit.tiltMultiplier).toBe(1.0)
  })

  it('every field of the interface is populated from a full persona', () => {
    const lucy = botStrategyFromPreset(persona('Loose Lucy'))
    const expected = ['vpip', 'pfr', 'aggression', 'bluffFreq', 'creativeFreq', 'tiltMultiplier',
      'threeBetFreq', 'fourBetFreq', 'fiveBetFreq', 'donkBetFreq', 'limpFreq', 'styleBias', 'leak']
    for (const k of expected) expect(lucy[k as keyof typeof lucy]).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/bot-config.test.ts`
Expected: FAIL — `Cannot find module '../app/utils/botConfig'`.

- [ ] **Step 3: Create the shared mapping**

```ts
// app/utils/botConfig.ts
/**
 * One persona/preset → bot strategy mapping, shared by the setup screen's
 * initial roster and its preset dropdown. Keeping it in one place is the
 * point: the two copies had drifted, and the dropdown's copy silently kept
 * the previous persona's donk/limp/sizing fields (Round 8).
 */
export interface BotStrategyFields {
  vpip: number
  pfr: number
  aggression: number
  bluffFreq: number
  creativeFreq: number
  tiltMultiplier: number
  threeBetFreq?: number
  fourBetFreq?: number
  fiveBetFreq?: number
  donkBetFreq?: number
  limpFreq?: number
  styleBias?: Partial<Record<'pair' | 'suitedAce' | 'suitedConnector' | 'bigCard' | 'other', number>>
  betSizeMult?: number
  overbetFreq?: number
  leak?: string
}

/**
 * Every optional field is assigned unconditionally — assigning `undefined`
 * is what clears a previous persona's value when a seat switches to a
 * generic preset that has no opinion on it.
 */
export function botStrategyFromPreset(preset: Record<string, unknown>): BotStrategyFields {
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
  return {
    vpip: num(preset.vpip) ?? 0.22,
    pfr: num(preset.pfr) ?? 0.17,
    aggression: num(preset.aggression) ?? 1.0,
    bluffFreq: num(preset.bluffFreq) ?? 0.12,
    creativeFreq: num(preset.creativeFreq) ?? 0.05,
    tiltMultiplier: num(preset.tiltMultiplier) ?? 1.0,
    threeBetFreq: num(preset.threeBetFreq),
    fourBetFreq: num(preset.fourBetFreq),
    fiveBetFreq: num(preset.fiveBetFreq),
    donkBetFreq: num(preset.donkBetFreq),
    limpFreq: num(preset.limpFreq),
    styleBias: preset.styleBias as BotStrategyFields['styleBias'],
    betSizeMult: num(preset.betSizeMult),
    overbetFreq: num(preset.overbetFreq),
    leak: typeof preset.leak === 'string' ? preset.leak : undefined,
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `yarn vitest run tests/bot-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it from both call sites in the setup screen**

In `app/components/SetupScreen.vue`, add to the imports:

```ts
import { botStrategyFromPreset } from '~/utils/botConfig'
```

Replace the body of `generateDefaultBots`'s `.map(...)` with:

```ts
  return selected.map(persona => ({
    preset: persona.name,
    name: persona.name,
    ...botStrategyFromPreset(persona as unknown as Record<string, unknown>),
  }))
```

Replace the field assignments in `applyPreset` (everything from `bot.vpip = preset.vpip` through `bot.leak = (preset as any).leak`) with:

```ts
  Object.assign(bot, botStrategyFromPreset(preset as unknown as Record<string, unknown>))
```

Leave the surrounding lines (`bot.preset = presetName` and the `if ('leak' in preset) bot.name = presetName` block) exactly as they are.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `yarn vitest run && yarn typecheck`
Expected: PASS. No bot-behavior test moves — this is setup-screen wiring only.

- [ ] **Step 7: Commit**

```bash
git add app/utils/botConfig.ts tests/bot-config.test.ts app/components/SetupScreen.vue
git commit -m "Setup: one shared persona→bot mapping so a preset switch cannot inherit the old persona's donk/limp/sizing (Round 8)"
```

---

### Task 4: Hero hand-record parsing survives name collisions

`index.vue`'s `endHand` derives the hero's VPIP, fold-to-3-bet, fold-to-c-bet and aggression by scanning the action log with `a.includes(heroName)`. A hero named `Sam` matches every `Solid Sam calls $4` line, so the bots' read on the player is corrupted. The same substring test drives the bots' tilt `participated` flag. The setup screen also accepts an empty hero name.

**Files:**
- Create: `app/utils/heroRecord.ts`
- Modify: `app/pages/index.vue` (`endHand` hero-record block, bot tilt `participated`), `app/components/SetupScreen.vue` (`handleStart`)
- Test: `tests/hero-record.test.ts` (create)

**Interfaces:**
- Consumes: `HeroHandRecord` from `~/stores/heroProfile`.
- Produces:
  ```ts
  export function actedInLine(line: string, name: string): boolean
  export function parseHeroHandRecord(
    log: string[],
    heroName: string,
    opts: { heroFolded: boolean; heroTotalWagered: number; bb: number },
  ): HeroHandRecord
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/hero-record.test.ts
/**
 * The bots' read on the hero is derived by scanning the hand's action log.
 * Round 8: the scan used `line.includes(heroName)`, so a hero named "Sam"
 * absorbed every "Solid Sam ..." line and the resulting VPIP / fold-to-3-bet
 * / aggression numbers were wrong at any table with a name-sharing bot.
 */
import { describe, it, expect } from 'vitest'
import { actedInLine, parseHeroHandRecord } from '../app/utils/heroRecord'

const opts = { heroFolded: false, heroTotalWagered: 10, bb: 2 }

describe('actedInLine', () => {
  it('matches only the actor at the start of the line', () => {
    expect(actedInLine('Sam calls $4', 'Sam')).toBe(true)
    expect(actedInLine('Solid Sam calls $4', 'Sam')).toBe(false)
    expect(actedInLine('Solid Sam calls $4', 'Solid Sam')).toBe(true)
  })

  it('ignores street markers', () => {
    expect(actedInLine('--- FLOP: A♠ K♦ 2♣ ---', 'Sam')).toBe(false)
  })
})

describe('parseHeroHandRecord', () => {
  it('does not credit a name-sharing bot\'s actions to the hero', () => {
    const log = [
      'Solid Sam raises to $6',
      'Sam folds',
      '--- FLOP: A♠ K♦ 2♣ ---',
      'Solid Sam raises to $10',
    ]
    const r = parseHeroHandRecord(log, 'Sam', { ...opts, heroFolded: true, heroTotalWagered: 0 })
    expect(r.raiseCount).toBe(0)
    expect(r.callCount).toBe(0)
    expect(r.facedCbet).toBe(false)   // hero folded preflop
  })

  it('counts the hero\'s own raises and calls', () => {
    const log = ['Sam raises to $6', 'Tight Tony calls $6', '--- FLOP: A♠ K♦ 2♣ ---', 'Sam checks', 'Tight Tony raises to $8', 'Sam calls $8']
    const r = parseHeroHandRecord(log, 'Sam', opts)
    expect(r.raiseCount).toBe(1)
    expect(r.callCount).toBe(1)
    expect(r.checkCount).toBe(1)
    expect(r.enteredPot).toBe(true)
  })

  it('detects facing and folding to a 3-bet', () => {
    const log = ['Hero raises to $6', 'Wild Wendy raises to $20', 'Hero folds']
    const r = parseHeroHandRecord(log, 'Hero', { ...opts, heroFolded: true })
    expect(r.faced3Bet).toBe(true)
    expect(r.foldedTo3Bet).toBe(true)
  })

  it('detects facing and folding to a c-bet', () => {
    const log = ['Hero calls $2', 'Solid Sam raises to $6', 'Hero calls $4',
      '--- FLOP: A♠ K♦ 2♣ ---', 'Solid Sam raises to $8', 'Hero folds']
    const r = parseHeroHandRecord(log, 'Hero', { ...opts, heroFolded: true })
    expect(r.facedCbet).toBe(true)
    expect(r.foldedToCbet).toBe(true)
  })

  it('a hero who only posted the big blind did not enter the pot', () => {
    const log = ['Hero folds']
    const r = parseHeroHandRecord(log, 'Hero', { heroFolded: true, heroTotalWagered: 2, bb: 2 })
    expect(r.enteredPot).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/hero-record.test.ts`
Expected: FAIL — `Cannot find module '../app/utils/heroRecord'`.

- [ ] **Step 3: Create the module**

```ts
// app/utils/heroRecord.ts
/**
 * Derive the hero's per-hand behavior record from the hand action log —
 * the input to the bots' session read and to the Nemesis book.
 *
 * Every line the engine logs starts with the actor's name ("Hero calls $4",
 * "--- FLOP: ... ---"), so the actor test anchors at the start of the line.
 * A substring test misattributes a name-sharing bot's actions to the hero.
 */
import type { HeroHandRecord } from '~/stores/heroProfile'

/** True when `name` is the actor of this log line (not merely mentioned in it). */
export function actedInLine(line: string, name: string): boolean {
  return name.length > 0 && line.startsWith(`${name} `)
}

const isRaiseLine = (a: string) => a.includes('raises') || a.includes('ALL-IN')

export function parseHeroHandRecord(
  log: string[],
  heroName: string,
  opts: { heroFolded: boolean; heroTotalWagered: number; bb: number },
): HeroHandRecord {
  const byHero = (a: string) => actedInLine(a, heroName)
  const flopMarkIdx = log.findIndex(a => a.startsWith('--- FLOP'))
  const preflopLog = flopMarkIdx >= 0 ? log.slice(0, flopMarkIdx) : log
  const turnMarkIdx = log.findIndex(a => a.startsWith('--- TURN'))
  const flopLog = flopMarkIdx >= 0
    ? log.slice(flopMarkIdx + 1, turnMarkIdx >= 0 ? turnMarkIdx : undefined)
    : []

  // Hero faced a 3-bet: hero raised preflop, then someone else re-raised
  const heroOpenIdx = preflopLog.findIndex(a => byHero(a) && isRaiseLine(a))
  const reRaiseAfterIdx = heroOpenIdx >= 0
    ? preflopLog.findIndex((a, i) => i > heroOpenIdx && !byHero(a) && isRaiseLine(a))
    : -1
  const faced3Bet = reRaiseAfterIdx >= 0
  const foldedTo3Bet = faced3Bet
    && preflopLog.some((a, i) => i > reRaiseAfterIdx && byHero(a) && a.includes('folds'))

  // Hero faced a c-bet: someone else led the flop while hero was still in
  const heroFoldedPreflop = preflopLog.some(a => byHero(a) && a.includes('folds'))
  const flopLeadIdx = flopLog.findIndex(isRaiseLine)
  const facedCbet = !heroFoldedPreflop && flopLeadIdx >= 0 && !byHero(flopLog[flopLeadIdx]!)
  const foldedToCbet = facedCbet
    && flopLog.some((a, i) => i > flopLeadIdx && byHero(a) && a.includes('folds'))

  return {
    enteredPot: !opts.heroFolded || opts.heroTotalWagered > opts.bb,
    faced3Bet,
    foldedTo3Bet,
    facedCbet,
    foldedToCbet,
    raiseCount: log.filter(a => byHero(a) && isRaiseLine(a)).length,
    callCount: log.filter(a => byHero(a) && a.includes('calls')).length,
    checkCount: log.filter(a => byHero(a) && a.includes('checks')).length,
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `yarn vitest run tests/hero-record.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it from the game page**

In `app/pages/index.vue`, add to the imports:

```ts
import { parseHeroHandRecord, actedInLine } from '~/utils/heroRecord'
```

In `endHand`, replace the whole block from `const log = gs.handActionLog.value` through the `const heroRecord = { ... }` literal with:

```ts
    const heroRecord = parseHeroHandRecord(
      gs.handActionLog.value,
      heroState.name,
      { heroFolded: heroState.folded, heroTotalWagered: gs.heroTotalWagered.value, bb: bb.value },
    )
```

In the bot tilt loop just above it, replace the `participated` expression with the same actor test:

```ts
    const participated = gs.handActionLog.value.some(a =>
      actedInLine(a, p.name) && (a.includes('calls') || a.includes('raises') || a.includes('ALL-IN')))
      || (!p.folded && nonFoldedCount > 1)
```

- [ ] **Step 6: Reject a blank hero name at setup**

In `app/components/SetupScreen.vue`'s `handleStart`, replace `heroName: heroName.value,` with:

```ts
    heroName: heroName.value.trim() || config.betting.defaultHeroName,
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `yarn vitest run && yarn typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/utils/heroRecord.ts tests/hero-record.test.ts app/pages/index.vue app/components/SetupScreen.vue
git commit -m "Hero read: parse the action log by actor, not substring, so a name-sharing bot cannot corrupt it (Round 8)"
```

---

### Task 5: Richer hero context in the exploit probe

The composite probe needs a scripted hero that can consult a baseline bot decision and see the same table context a bot sees. This task extends `ProbeCtx` and adds an **optional** baseline profile. Pure strategies must consume the random stream exactly as today, so the baseline decision is computed only when a caller asks for one.

**Files:**
- Modify: `scripts/exploit-probe.ts`
- Test: `tests/exploit-probe.test.ts` (existing determinism tests cover it; one new assertion)

**Interfaces:**
- Produces:
  ```ts
  export interface ProbeCtx {
    street: Street; toCall: number; pot: number; currentBet: number; playerBet: number
    chips: number; raiseLevel: number; holeCards: [Card, Card]; community: Card[]
    position: string; wasRaiser: boolean
    // added in Round 8:
    bb: number
    numActivePlayers: number
    preflopCallers: number
    toActBehind: number                    // players still owing an action after this one
    streetHistory: { flop?: string; turn?: string }
    mem: Record<string, unknown>           // per-hand scratch, cleared each hand
    base?: BotAction                       // baseline bot decision (only when opts.baselineProfile is set)
    tag: (t: string) => void               // label this hand for per-hand EV reporting
  }
  export interface ProbeOpts { baselineProfile?: BotProfile }
  export function runStrategy(
    name: string, fn: ProbeFn, numHands: number, seed?: number,
    depthBB?: number, heroSeats?: number, opts?: ProbeOpts,
  ): { name: string; handsPlayed: number; probeNet: number; bb100: number; probeSteals: number
       probeShowdownWins: number; depthBB: number; heroSeats: number
       tableReadWindows: { total: number; passive: number; showdownHeavy: number; stationRead: number }
       tagStats: Record<string, { n: number; net: number }> }
  ```

- [ ] **Step 1: Write the failing test**

Append to `tests/exploit-probe.test.ts`:

```ts
describe('probe context (Round 8)', () => {
  it('a strategy that only reads the new context fields is still deterministic', () => {
    const seen: Record<string, number> = { bb: 0, active: 0, behind: 0, tagged: 0 }
    const spy = (c: any) => {
      seen.bb = c.bb
      seen.active = Math.max(seen.active, c.numActivePlayers)
      seen.behind = Math.max(seen.behind, c.toActBehind)
      if (c.street === 'river') { c.tag('river'); seen.tagged++ }
      return c.toCall === 0 ? { type: 'check' } : { type: 'fold' }
    }
    const a = runStrategy('spy', spy, 300, SEED)
    expect(seen.bb).toBe(2)
    expect(seen.active).toBeGreaterThan(1)
    expect(seen.behind).toBeGreaterThanOrEqual(0)
    expect(a.tagStats).toBeDefined()
    const b = runStrategy('spy', spy, 300, SEED)
    expect(b.bb100).toBe(a.bb100)
  })

  it('a baseline profile makes ctx.base available without changing pure runs', () => {
    const withBase = runStrategy('base-reader', (c: any) => c.base!, 300, SEED, 100, 1, {
      baselineProfile: { vpip: 0.22, pfr: 0.17, aggression: 1.0, bluffFreq: 0.12, creativeFreq: 0.05 },
    })
    expect(withBase.handsPlayed).toBe(300)
    // The pure battery is unaffected by the new option
    const pure = runStrategy('station', STRATEGIES['station']!, 300, SEED)
    expect(pure.bb100).toBeCloseTo(runStrategy('station', STRATEGIES['station']!, 300, SEED).bb100, 10)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/exploit-probe.test.ts -t "Round 8"`
Expected: FAIL — `c.tag is not a function`, `bb` undefined.

- [ ] **Step 3: Extend the context type and options**

In `scripts/exploit-probe.ts`, replace the `ProbeCtx` interface with (note the added `export` — Task 6 derives its context type from it):

```ts
export interface ProbeCtx {
  street: Street
  toCall: number
  pot: number
  currentBet: number
  playerBet: number
  chips: number
  raiseLevel: number
  holeCards: [Card, Card]
  community: Card[]     // street-sliced board (what the hero can see)
  position: string
  wasRaiser: boolean    // was the probe the last preflop aggressor?
  // Round 8: the composite probe's hero needs the same table context a bot
  // sees, plus per-hand scratch space and an optional baseline decision.
  bb: number
  numActivePlayers: number
  preflopCallers: number
  toActBehind: number
  streetHistory: { flop?: string; turn?: string }
  mem: Record<string, unknown>
  base?: BotAction
  tag: (t: string) => void
}

export interface ProbeOpts {
  /**
   * When set, every hero decision is preceded by a baseline bot decision with
   * this profile, exposed as `ctx.base`. Computing it consumes RNG draws, so
   * only composite runs pass it — pure strategies keep today's exact stream
   * and therefore today's exact recorded numbers.
   */
  baselineProfile?: BotProfile
}
```

- [ ] **Step 4: Thread the new fields through the hand loop**

In `runStrategy`, change the signature to:

```ts
export function runStrategy(name: string, fn: ProbeFn, numHands: number, seed?: number, depthBB: number = DEFAULT_DEPTH_BB, heroSeats: number = 1, opts: ProbeOpts = {}) {
```

Immediately after `const tableReadWindows = ...`, add:

```ts
  const tagStats: Record<string, { n: number; net: number }> = {}
```

Inside the per-hand loop, immediately after `const chipsBefore = players.map(p => p.chips)`, add:

```ts
    const mem: Record<string, unknown> = {}
    const handTags: string[] = []
```

In `playBettingRound`'s decide callback, replace the `if (p.isProbe) { ... }` block's context construction with:

```ts
        const visible = street === 'preflop' ? [] : street === 'flop' ? community.slice(0, 3) : street === 'turn' ? community.slice(0, 4) : community
        if (p.isProbe) {
          const botCtx = {
            street, toCall, pot: round.pot, currentBet: round.currentBet, playerBet: p.betThisRound, chips: p.chips,
            bb: BB, numActivePlayers: active().length,
            raiseLevel: street === 'preflop' ? preflopRaiseLevel : 0,
            position: positions[p.id] || '',
            holeCards: p.holeCards ?? undefined, community: visible,
            wasPreflopRaiser: p.id === preflopRaiserId,
            preflopCallers: preflopCallerCount,
            checkedThisStreet: (streetActions.get(p.id) as any)?.[street] === 'check',
            streetHistory: streetActions.get(p.id) as any,
            tableReads: readTable(tableReadState, TR),
            rng,
          }
          const base = opts.baselineProfile ? decideBotAction(opts.baselineProfile, botCtx) : undefined
          let action = fn({
            street, toCall, pot: round.pot, currentBet: round.currentBet, playerBet: p.betThisRound,
            chips: p.chips, raiseLevel: street === 'preflop' ? preflopRaiseLevel : 0,
            holeCards: p.holeCards!, community: visible,
            position: positions[p.id] || '',
            wasRaiser: preflopRaiserId === p.id,
            bb: BB,
            numActivePlayers: active().length,
            preflopCallers: preflopCallerCount,
            toActBehind: Math.max(round.needsToAct.size - 1, 0),
            streetHistory: (streetActions.get(p.id) as any) ?? {},
            mem,
            base,
            tag: (t: string) => handTags.push(t),
          })
          // sanitize: raise must exceed currentBet or it's a call
          if (action.type === 'raise' && (action.amount ?? 0) <= round.currentBet) {
            action = toCall > 0 ? { type: 'call' } : { type: 'check' }
          }
          return action as EngineAction
        }
```

Leave the bot branch below it untouched apart from reusing `visible` for its `community` field.

- [ ] **Step 5: Record per-hand tag EV and return it**

Replace `probeNet += heroes.reduce((s, h) => s + h.chips, 0) - probeChipsBefore` with:

```ts
    const handNet = heroes.reduce((s, h) => s + h.chips, 0) - probeChipsBefore
    probeNet += handNet
    for (const t of new Set(handTags)) {
      const e = (tagStats[t] ??= { n: 0, net: 0 })
      e.n++
      e.net += handNet
    }
```

Add `tagStats` to the returned object:

```ts
  return { name, handsPlayed, probeNet, bb100, probeSteals, probeShowdownWins, depthBB, heroSeats, tableReadWindows, tagStats }
```

- [ ] **Step 6: Run the new test and watch it pass**

Run: `yarn vitest run tests/exploit-probe.test.ts`
Expected: PASS, including the existing determinism and multi-seat tests.

- [ ] **Step 7: Prove the refactor changed no pure-strategy number**

Run and record the full output:

```bash
yarn probe all 10000 20260712 | tee /tmp/round8-probe-after-refactor.txt
```

Compare against the numbers in the README probe table (`README.md`, "Exploit Probe" section — open-jam −319, 3bet-jam −252, overbet-spam −1190, minraise-spam −1052, station −1142, nit-value −19, steal-fold −20, donk-33 −28, fit-or-fold −321 at 100bb).
Expected: every cell identical to the recorded value. **If any cell moved, stop — the extra context construction consumed a draw it should not have.**

- [ ] **Step 8: Commit**

```bash
git add scripts/exploit-probe.ts tests/exploit-probe.test.ts
git commit -m "Probe: richer hero context, per-hand tags, and an optional baseline profile (pure strategies byte-identical)"
```

---

### Task 6: Composite probe script

A pure degenerate hero pays the blind tax on every hand, which masks postflop leaks worth +15 to +20 bb/100. A hero that plays a solid persona's own logic and deviates in exactly one way isolates the leak: the delta against the untouched baseline is the leak's EV.

**Files:**
- Create: `scripts/composite-probe.ts`
- Modify: `package.json` (add the `probe:composite` script)

**Interfaces:**
- Consumes: `runStrategy`, `ProbeOpts` from `scripts/exploit-probe.ts` (Task 5).
- Produces:
  ```ts
  export const COMPOSITE: Record<string, ProbeFn>
  export const BASELINE: BotProfile          // Solid Sam
  export function runComposite(name: string, numHands: number, seed: number, depthBB?: number):
    { name: string; bb100: number; overrides: number; tagStats: Record<string, { n: number; net: number }> }
  ```

- [ ] **Step 1: Create the script**

```ts
// scripts/composite-probe.ts
/**
 * Composite exploit probe — a scripted hero that plays a SOLID baseline
 * (Solid Sam's own bot logic) and deviates in exactly ONE way. The delta in
 * bb/100 against the untouched baseline is that deviation's EV, which is how
 * Round 8 found leaks the pure-degenerate battery masks: a hero who jams any
 * two cards pays so much blind tax that a +18 bb/100 river leak disappears
 * inside a −300 bb/100 line.
 *
 * Usage:
 *   yarn probe:composite all 30000 20260712,999,7,4242
 *   yarn probe:composite river-33 30000 20260712 100
 *   yarn probe:composite pf-exploit 30000 20260712 24
 *
 * Read the 4-seed MEAN, never a single seed: per-seed bb/100 SD is ~8-10.
 */
import config from '../holdem.config'
import { runStrategy } from './exploit-probe'
import type { BotProfile, BotAction } from '../app/utils/botDecision'
import { handPercentile } from '../app/utils/ranges'
import { bestHand } from '../app/utils/handAnalysis'
import type { Card } from '../app/utils/cards'

const STAKE = config.stakes.find(s => s.level === 3)!
const BB = STAKE.bb

const SAM = config.personas.find(p => p.name === 'Solid Sam')!
export const BASELINE: BotProfile = {
  vpip: SAM.vpip, pfr: SAM.pfr, aggression: SAM.aggression, bluffFreq: SAM.bluffFreq,
  creativeFreq: SAM.creativeFreq, threeBetFreq: SAM.threeBetFreq, fourBetFreq: SAM.fourBetFreq,
  fiveBetFreq: SAM.fiveBetFreq, donkBetFreq: SAM.donkBetFreq, limpFreq: SAM.limpFreq,
  styleBias: SAM.styleBias, betSizeMult: SAM.betSizeMult, overbetFreq: SAM.overbetFreq,
}

type Ctx = Parameters<Parameters<typeof runStrategy>[1]>[0]

const isPremium = (h: [Card, Card]) => {
  const [a, b] = [h[0].rank, h[1].rank].sort((x, y) => y - x)
  return (a === b && a >= 12) || (a === 14 && b === 13) // QQ+ / AK
}
const betPot = (c: Ctx, frac: number): BotAction =>
  ({ type: 'raise', amount: Math.min(c.playerBet + c.toCall + Math.max(Math.round(c.pot * frac), BB), c.chips + c.playerBet) })
const raiseToBB = (c: Ctx, bbs: number): BotAction =>
  ({ type: 'raise', amount: Math.min(Math.max(Math.round(bbs * BB), c.currentBet + BB), c.chips + c.playerBet) })
const jam = (c: Ctx): BotAction => ({ type: 'raise', amount: c.chips + c.playerBet })
const pf = (c: Ctx) => c.street === 'preflop'
/** A river spot the baseline would have checked — the leak's entry point. */
const riverCheck = (c: Ctx) => c.street === 'river' && c.toCall === 0 && c.base!.type === 'check'
const topPairPlus = (c: Ctx) => {
  const r = bestHand(c.holeCards, c.community)
  if (!r) return false
  if (r.rank >= 2) return true
  if (r.rank !== 1) return false
  const boardMax = Math.max(...c.community.map(x => x.rank))
  return r.score[1]! >= boardMax && c.holeCards.some(x => x.rank === r.score[1])
}

/** Bet `frac` pot on every river the baseline checks. */
const riverBet = (frac: number) => (c: Ctx): BotAction => {
  if (riverCheck(c)) { c.tag('riverbet'); return betPot(c, frac) }
  return c.base!
}
/** 3-bet premiums to `bbs`, then jam any flop once the pot is committing. */
const prem3bet = (bbs: number) => (c: Ctx): BotAction => {
  if (pf(c) && c.raiseLevel === 1 && c.toCall > 0 && isPremium(c.holeCards)) {
    c.mem.p3 = true
    c.tag('prem3bet')
    return raiseToBB(c, bbs)
  }
  if (c.street === 'flop' && c.mem.p3 && c.pot >= c.chips * 0.5) return jam(c)
  return c.base!
}

export const COMPOSITE: Record<string, (c: Ctx) => BotAction> = {
  'base': c => c.base!,
  'river-33': riverBet(0.33),
  'river-50': riverBet(0.50),
  'river-66': riverBet(0.66),
  'river-100': riverBet(1.00),
  'river-call-tp': c => {
    if (c.street === 'river' && c.toCall > 0 && c.toCall <= c.pot && topPairPlus(c) && c.base!.type === 'fold') {
      c.tag('rivercall')
      return { type: 'call' }
    }
    return c.base!
  },
  'turn-river-33': c => {
    if ((c.street === 'turn' || c.street === 'river') && c.toCall === 0 && c.base!.type === 'check') return betPot(c, 0.33)
    return c.base!
  },
  'prem3bet-25-fj': prem3bet(25),
  'prem3bet-50-fj': prem3bet(50),
  'wide5-3bet-50-fj': c => {
    if (pf(c) && c.raiseLevel === 1 && c.toCall > 0 && handPercentile(c.holeCards) < 0.05) {
      c.mem.p3 = true
      c.tag('wide3bet')
      return raiseToBB(c, 50)
    }
    if (c.street === 'flop' && c.mem.p3 && c.pot >= c.chips * 0.5) return jam(c)
    return c.base!
  },
  'open-any-late': c => {
    if (pf(c) && c.raiseLevel === 0 && c.toCall > 0 && c.toActBehind <= 1 && c.base!.type !== 'raise') return raiseToBB(c, 2.5)
    return c.base!
  },
  // Short-stack line: only meaningful at depthBB below 25.
  'pf-exploit': c => {
    if (!pf(c)) return c.base!
    const pct = handPercentile(c.holeCards)
    if (c.toCall >= c.chips * 0.5) {
      if (pct < 0.07) { c.tag('jamcall'); return jam(c) }
      return { type: 'fold' }
    }
    if (c.raiseLevel === 0 && c.toCall > 0) {
      if (pct < 0.20) { c.tag('open'); return raiseToBB(c, 2.2) }
      return { type: 'fold' }
    }
    return c.base!
  },
}

export function runComposite(name: string, numHands: number, seed: number, depthBB = 100) {
  const fn = COMPOSITE[name]
  if (!fn) throw new Error(`unknown composite strategy: ${name}`)
  let overrides = 0
  const wrapped = (c: Ctx) => {
    const a = fn(c)
    if (a !== c.base) overrides++
    return a
  }
  const r = runStrategy(name, wrapped, numHands, seed, depthBB, 1, { baselineProfile: BASELINE })
  return { name, bb100: r.bb100, overrides, tagStats: r.tagStats }
}

function main() {
  const which = process.argv[2] || 'all'
  const numHands = parseInt(process.argv[3] || '30000', 10)
  const seeds = (process.argv[4] || '20260712,999,7,4242').split(',').map(s => parseInt(s, 10))
  const depthBB = process.argv[5] !== undefined ? parseInt(process.argv[5], 10) : 100
  const toRun = which === 'all' ? Object.keys(COMPOSITE) : which.split(',')

  console.log(`\nComposite probe — hero = ${SAM.name}'s own logic + one deviation`)
  console.log(`${numHands} hands x seeds ${seeds.join('/')}, stacks reset to ${depthBB}bb every hand\n`)
  console.log(`${'strategy'.padEnd(20)}${seeds.map(s => `@${s}`.padStart(11)).join('')}${'mean'.padStart(9)}${'delta'.padStart(9)}${'overrides'.padStart(11)}   tagged EV`)
  console.log('-'.repeat(100))

  let baseMean = 0
  for (const s of ['base', ...toRun.filter(t => t !== 'base')]) {
    const rs = seeds.map(seed => runComposite(s, numHands, seed, depthBB))
    const mean = rs.reduce((a, r) => a + r.bb100, 0) / rs.length
    if (s === 'base') baseMean = mean
    const delta = mean - baseMean
    const tags: Record<string, { n: number; net: number }> = {}
    for (const r of rs) {
      for (const [t, e] of Object.entries(r.tagStats)) {
        const x = (tags[t] ??= { n: 0, net: 0 })
        x.n += e.n
        x.net += e.net
      }
    }
    const tagStr = Object.entries(tags)
      .map(([t, e]) => `${t}: n=${e.n} ${(e.net / BB / e.n).toFixed(2)}bb/hand`).join('; ')
    console.log(
      `${s.padEnd(20)}${rs.map(r => r.bb100.toFixed(1).padStart(11)).join('')}` +
      `${mean.toFixed(1).padStart(9)}${(s === 'base' ? '' : (delta >= 0 ? '+' : '') + delta.toFixed(1)).padStart(9)}` +
      `${String(rs[0]!.overrides).padStart(11)}   ${tagStr}`)
  }
  console.log('\nEvery deviation should be <= 0 against a leak-free engine.')
  console.log('Judge the MEAN column: per-seed SD is ~8-10 bb/100 over 30k hands.')
}

if (!process.env.VITEST) main()
```

- [ ] **Step 2: Add the script to package.json**

Add after the existing `"probe"` line:

```json
    "probe:composite": "vite-node scripts/composite-probe.ts",
```

- [ ] **Step 3: Run it and record the pre-fix baseline**

```bash
yarn probe:composite all 30000 20260712,999,7,4242 | tee /tmp/round8-composite-before.txt
```

Expected (the leaks are still open at this point, these are the numbers Task 7–11 must close):
`base` ≈ +8; `river-33` ≈ +26 (Δ ≈ +18); `river-50` ≈ +27 (Δ ≈ +19); `prem3bet-25-fj` Δ ≈ +8; `prem3bet-50-fj` Δ ≈ +5; `wide5-3bet-50-fj` Δ ≈ +10.

- [ ] **Step 4: Record the short-stack cell separately**

```bash
yarn probe:composite base,pf-exploit 30000 20260712,999,7,4242 24 | tee /tmp/round8-composite-24bb-before.txt
```

Expected: `pf-exploit` Δ ≈ +17.

- [ ] **Step 5: Commit**

```bash
git add scripts/composite-probe.ts package.json
git commit -m "Composite probe: a solid-baseline hero plus one deviation, to measure leaks the pure battery masks"
```

---

### Task 7: Size-aware river defense

Measured: the bots defend a flat ~45% against river bets from ⅓ pot to 1.5× pot, where the minimum defense frequency runs from 75% down to 40%. Betting ⅓ pot on every river the baseline would check is worth +18 bb/100. The cause is that the river shares the turn's size-blind call-down rule, plus a separate "fold top pair to pot-sized bets" rule that only fires above 0.8× pot.

**Files:**
- Modify: `holdem.config.ts` (`strategy` block), `app/utils/botDecision.ts` (`decidePostflopAction`, facing-a-bet section)
- Test: `tests/river-defense.test.ts` (create)

**Interfaces:**
- Consumes: `mdf`, `passiveBoost`, `sizingExploit` (already computed in `decidePostflopAction`).
- Produces: `config.strategy.river` with fields `strongBase`, `strongShield`, `strongMin`, `strongMax`, `weakBase`, `weakMin`, `weakMax`, `maxBluffRate`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/river-defense.test.ts
/**
 * River defense must respond to bet size. Round 8 measured a flat ~45%
 * defense against every size from 1/3 pot to 1.5x pot, against a minimum
 * defense frequency running 75% -> 40%; betting small on every river the
 * baseline would check was worth +18 bb/100 to a scripted hero.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, type BotProfile } from '../app/utils/botDecision'
import { bestHand } from '../app/utils/handAnalysis'
import { mulberry32 } from '../app/utils/rng'
import type { Card, Suit } from '../app/utils/cards'
import config from '../holdem.config'

const BB = 2
const LINEUP = ['Tennifer Jilly', 'Krynn Benney', 'Hill Phellmuth', 'Mhris Coneymaker',
  'Entonio Asfandiari', 'Naniel Degreanu', 'Aatrik Pantonius', 'Solid Sam', 'Ihil Pvey']

const profileOf = (name: string): BotProfile => {
  const p = config.personas.find(x => x.name === name)!
  return {
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq,
    creativeFreq: p.creativeFreq, threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
    fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq, limpFreq: p.limpFreq,
    styleBias: p.styleBias, betSizeMult: p.betSizeMult, overbetFreq: p.overbetFreq,
  }
}

function deck(rng: () => number): Card[] {
  const d: Card[] = []
  for (const s of ['hearts', 'diamonds', 'clubs', 'spades'] as Suit[]) {
    for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s })
  }
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j]!, d[i]!] }
  return d
}

type Cls = 'air' | 'pair<top' | 'top pair' | 'two pair+'
const classify = (hole: [Card, Card], board: Card[]): Cls => {
  const r = bestHand(hole, board)!
  if (r.rank >= 2) return 'two pair+'
  if (r.rank !== 1) return 'air'
  const boardMax = Math.max(...board.map(x => x.rank))
  return (r.score[1]! >= boardMax && hole.some(x => x.rank === r.score[1])) ? 'top pair' : 'pair<top'
}

/** Heads-up river, bot checked and now faces `frac` x pot. Returns defense rates. */
function riverDefense(frac: number, n = 18000) {
  const stat: Record<Cls, { n: number; def: number }> = {
    'air': { n: 0, def: 0 }, 'pair<top': { n: 0, def: 0 }, 'top pair': { n: 0, def: 0 }, 'two pair+': { n: 0, def: 0 },
  }
  for (const name of LINEUP) {
    const rng = mulberry32(4)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const hole: [Card, Card] = [d[0]!, d[1]!]
      const board = d.slice(2, 7)
      const pot = 30 * BB
      const bet = Math.round(pot * frac)
      const a = decideBotAction(profileOf(name), {
        street: 'river', toCall: bet, pot: pot + bet, currentBet: bet, playerBet: 0,
        chips: 85 * BB, bb: BB, numActivePlayers: 2, position: 'BB',
        holeCards: hole, community: board, checkedThisStreet: true,
        streetHistory: { flop: 'call', turn: 'call' }, preflopCallers: 1, rng,
      })
      const s = stat[classify(hole, board)]
      s.n++
      if (a.type !== 'fold') s.def++
    }
  }
  const overall = (Object.values(stat).reduce((a, s) => a + s.def, 0)) / (Object.values(stat).reduce((a, s) => a + s.n, 0))
  return { overall, byClass: Object.fromEntries(Object.entries(stat).map(([k, v]) => [k, v.def / v.n])) as Record<Cls, number> }
}

describe('river defense scales with bet size', () => {
  const third = riverDefense(0.33)
  const pot = riverDefense(1.0)
  const over = riverDefense(1.5)

  it('defends far more against a third-pot bet than against a pot-sized bet', () => {
    expect(third.overall).toBeGreaterThan(pot.overall + 0.08)
  })

  it('overall defense lands in the MDF-anchored band at each size', () => {
    expect(third.overall).toBeGreaterThan(0.58)
    expect(third.overall).toBeLessThan(0.70)
    expect(pot.overall).toBeGreaterThan(0.42)
    expect(pot.overall).toBeLessThan(0.58)
    expect(over.overall).toBeGreaterThan(0.33)
    expect(over.overall).toBeLessThan(0.48)
  })

  it('is monotone non-increasing in bet size', () => {
    expect(pot.overall).toBeLessThanOrEqual(third.overall)
    expect(over.overall).toBeLessThanOrEqual(pot.overall)
  })

  it('top pair calls a small bet and folds enough to a big one', () => {
    expect(third.byClass['top pair']).toBeGreaterThan(0.85)
    expect(over.byClass['top pair']).toBeLessThan(0.65)
  })

  it('air still folds and monsters still continue', () => {
    expect(third.byClass['air']).toBeLessThan(0.10)
    expect(third.byClass['two pair+']).toBeGreaterThan(0.65)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/river-defense.test.ts`
Expected: FAIL — `third.overall` ≈ 0.46, not > 0.58; the size-monotonicity assertion fails.

- [ ] **Step 3: Add the config block**

In `holdem.config.ts`, inside the `strategy` object, immediately after the `barrel: { ... },` entry, add:

```ts
    // River defense (Round 8). Continuation is anchored to the minimum
    // defense frequency the bet size implies (mdf = 1 - potOdds, split
    // across multiway defenders), scaled by how far up its class the hand
    // sits. The old rules were size-blind, so the table defended a flat
    // ~45% against everything from a third-pot bet to a 1.5x-pot overbet
    // and a hero could print +18 bb/100 betting small on every river.
    river: {
      strongBase: 1.15,     // top-pair class: share of MDF at the bottom of the class
      strongShield: 0.45,   // ...plus this much at the top of the class
      strongMin: 0.25,
      strongMax: 0.97,
      weakBase: 0.95,       // second pair and worse: share of MDF
      weakMin: 0.05,
      weakMax: 0.85,
      maxBluffRate: 0.35,   // cap on any single river bluff frequency
    },
```

- [ ] **Step 4: Replace the size-blind river rules**

In `app/utils/botDecision.ts`, inside `decidePostflopAction`'s `if (hasStrongHand) { ... }` block:

Narrow the call-down rule to the turn — replace

```ts
    if (!hasMonster && toCall > 0 && ctx.street !== 'flop') {
      const marginShield = Math.max(0, Math.min((strength - 0.35) / 0.20, 1)) // 0 at 0.35 → 1 at 0.55
      const baseContinue = ctx.street === 'turn'
        ? 0.55 + marginShield * 0.45
        : 0.35 + marginShield * 0.50
      const continueProb = Math.min(baseContinue * passiveBoost, 1.0)
      if (rng() > continueProb) return { type: 'fold' }
    }
```

with

```ts
    // Turn call-down discipline: marginal made hands continue less often vs
    // sustained pressure; passives call down more.
    if (!hasMonster && toCall > 0 && ctx.street === 'turn') {
      const marginShield = Math.max(0, Math.min((strength - 0.35) / 0.20, 1)) // 0 at 0.35 → 1 at 0.55
      const continueProb = Math.min((0.55 + marginShield * 0.45) * passiveBoost, 1.0)
      if (rng() > continueProb) return { type: 'fold' }
    }

    // River: continuation is anchored to the MDF this bet size implies, so a
    // third-pot stab must be called far more often than a pot-sized one. The
    // old rule was size-blind and folded ~55% to everything (Round 8 #1).
    if (!hasMonster && toCall > 0 && ctx.street === 'river') {
      const shield = Math.max(0, Math.min((strength - STRAT.postflop.strongStrength) / 0.20, 1))
      const continueProb = Math.max(STRAT.river.strongMin, Math.min(
        mdf * (STRAT.river.strongBase + shield * STRAT.river.strongShield) * passiveBoost * sizingExploit,
        STRAT.river.strongMax))
      if (rng() > continueProb) return { type: 'fold' }
    }
```

Then delete the now-redundant rule further down the same block:

```ts
    // Fold top pair to pot-sized+ bets on the river (could be beaten)
    if (ctx.street === 'river' && betToPotRatio > 0.8 && strength < 0.50 && rng() > profile.vpip) {
      return { type: 'fold' }
    }
```

- [ ] **Step 5: Give weak made hands the same treatment on the river**

Replace the `if (hasWeakMade) { ... }` block with:

```ts
  // Weak made hands — call small bets on flop, tighten by street.
  if (hasWeakMade) {
    if (ctx.street === 'river') {
      const continueProb = Math.max(STRAT.river.weakMin, Math.min(
        mdf * STRAT.river.weakBase * passiveBoost * sizingExploit, STRAT.river.weakMax))
      return rng() < continueProb ? { type: 'call' } : { type: 'fold' }
    }
    if (betToPotRatio < 0.4 && rng() < profile.vpip * 0.7 * streetFactor) return { type: 'call' }
    if (isWithinMDF && rng() < 0.80) return { type: 'call' } // MDF defense (some mixing)
    if (rng() < profile.vpip * 0.2 * streetFactor) return { type: 'call' }
    return { type: 'fold' }
  }
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `yarn vitest run tests/river-defense.test.ts`
Expected: PASS. If `third.overall` overshoots 0.70, lower `river.strongBase` toward 1.05; if it undershoots 0.58, raise it toward 1.25. Change one constant at a time and re-run.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `yarn vitest run && yarn typecheck`
Expected: PASS. Watch `tests/realism-fixes.test.ts` (board-relative river raise rates) and `tests/table-reads-effects.test.ts` — both exercise river paths.

- [ ] **Step 8: Run both probe batteries**

```bash
yarn probe all 10000 20260712
yarn probe all 10000 20260712 25
yarn probe all 10000 20260712 20
yarn probe all 10000 20260712 15
yarn probe:composite base,river-33,river-50,river-66,river-100,river-call-tp 30000 20260712,999,7,4242
```

Expected: every standard cell `< +10`; `station` still below −1000 at 100bb (bots now call it down more, so it should *lose more*); `river-33` and `river-50` deltas fall from ≈ +18 to `<= +5`; `river-call-tp` stays `<= +10`.

- [ ] **Step 9: Commit**

```bash
git add holdem.config.ts app/utils/botDecision.ts tests/river-defense.test.ts
git commit -m "River defense: anchor continuation to the MDF the bet size implies (Round 8 #1)"
```

---

### Task 8: River bluffs fire at the configured rate

Measured: when checked to on the river, bots bet 0% of air and 5% of weak pairs, so ~95% of their river bets are value. Two causes, both in `postflopHandStrength`: an unpaired hand keeps the "two overcards" equity credit (0.15–0.25) that only makes sense while cards are still to come, and a busted draw keeps its draw-equity floor on a board with no cards left. Both keep the hand out of the `hasNothing` bucket the bluff branches read.

**Files:**
- Modify: `app/utils/botDecision.ts` (`postflopHandStrength`, `decidePostflopAction` draw detection and the two river bluff sites)
- Test: `tests/river-defense.test.ts` (extend)

**Interfaces:**
- Consumes: `config.strategy.river.maxBluffRate` (Task 7).

- [ ] **Step 1: Write the failing test**

Append to `tests/river-defense.test.ts` (the helpers above are reused):

```ts
/** Heads-up river, bot is checked to in position as the non-raiser. */
function riverBetRate(name: string, n = 4000) {
  const stat: Record<Cls, { n: number; bet: number }> = {
    'air': { n: 0, bet: 0 }, 'pair<top': { n: 0, bet: 0 }, 'top pair': { n: 0, bet: 0 }, 'two pair+': { n: 0, bet: 0 },
  }
  const rng = mulberry32(5)
  for (let i = 0; i < n; i++) {
    const d = deck(rng)
    const hole: [Card, Card] = [d[0]!, d[1]!]
    const board = d.slice(2, 7)
    const a = decideBotAction(profileOf(name), {
      street: 'river', toCall: 0, pot: 30 * BB, currentBet: 0, playerBet: 0,
      chips: 85 * BB, bb: BB, numActivePlayers: 2, position: 'BTN',
      holeCards: hole, community: board,
      streetHistory: { flop: 'call', turn: 'call' }, preflopCallers: 1, rng,
    })
    const s = stat[classify(hole, board)]
    s.n++
    if (a.type === 'raise') s.bet++
  }
  return Object.fromEntries(Object.entries(stat).map(([k, v]) => [k, v.bet / Math.max(v.n, 1)])) as Record<Cls, number>
}

describe('river bluffs fire at the persona rate', () => {
  it('an aggressive persona bluffs air on the river', () => {
    const twan = riverBetRate('Dom Twan')
    expect(twan['air']).toBeGreaterThan(0.05)
    expect(twan['air']).toBeLessThan(config.strategy.river.maxBluffRate)
  })

  it('a tight persona bluffs far less than an aggressive one', () => {
    expect(riverBetRate('Tight Tony')['air']).toBeLessThan(riverBetRate('Dom Twan')['air'])
  })

  it('bluffs stay a minority of river bets (value still dominates)', () => {
    const sam = riverBetRate('Solid Sam')
    expect(sam['air']).toBeLessThan(sam['two pair+'] * 0.5)
  })

  it('a missed draw on the river is air, not a made hand', () => {
    // 4 hearts on board + 2 hearts... no: hole cards make a 4-flush that never got there
    const hole: [Card, Card] = [{ rank: 12, suit: 'hearts' }, { rank: 11, suit: 'hearts' }]
    const board: Card[] = [
      { rank: 9, suit: 'hearts' }, { rank: 4, suit: 'hearts' }, { rank: 2, suit: 'clubs' },
      { rank: 7, suit: 'spades' }, { rank: 3, suit: 'diamonds' },
    ]
    // Facing a pot-sized river bet with queen-high and a busted flush draw:
    // this must fold essentially always.
    let folds = 0
    const rng = mulberry32(9)
    for (let i = 0; i < 2000; i++) {
      const a = decideBotAction(profileOf('Solid Sam'), {
        street: 'river', toCall: 60, pot: 120, currentBet: 60, playerBet: 0,
        chips: 170, bb: BB, numActivePlayers: 2, position: 'BB',
        holeCards: hole, community: board, checkedThisStreet: true,
        streetHistory: { flop: 'call', turn: 'call' }, preflopCallers: 1, rng,
      })
      if (a.type === 'fold') folds++
    }
    expect(folds / 2000).toBeGreaterThan(0.90)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/river-defense.test.ts -t "river bluffs"`
Expected: FAIL — `twan['air']` is 0.

- [ ] **Step 3: Scope the overcard credit to streets with cards to come**

In `postflopHandStrength`, replace

```ts
  if (result.rank === 0) {
    const boardMax = Math.max(...community.map(c => c.rank))
    const overcards = holeCards.filter(c => c.rank > boardMax).length
    if (overcards === 1) strength = 0.15
    if (overcards === 2) {
```

with

```ts
  // Overcards are equity only while cards are still to come. On the river an
  // unpaired hand is air — which is exactly the hand that should be bluffing
  // rather than folding into every bet (Round 8 #2).
  if (result.rank === 0 && community.length < 5) {
    const boardMax = Math.max(...community.map(c => c.rank))
    const overcards = holeCards.filter(c => c.rank > boardMax).length
    if (overcards === 1) strength = 0.15
    if (overcards === 2) {
```

- [ ] **Step 4: Stop crediting draw equity on the river**

In `decidePostflopAction`, replace

```ts
  const decisionDraws: DrawInfo[] = cardAware ? detectDraws(ctx.holeCards!, ctx.community!) : []
```

with

```ts
  // A "draw" on the river has no cards left to come — a busted flush draw is
  // air, and treating it as a made hand kept it out of the bluffing bucket
  // and made it call rivers it should fold (Round 8 #2).
  const decisionDraws: DrawInfo[] = cardAware && ctx.street !== 'river'
    ? detectDraws(ctx.holeCards!, ctx.community!)
    : []
```

- [ ] **Step 5: Cap the two river bluff frequencies**

In the third-barrel block, replace

```ts
      const barrelRate = hasMonster ? 0.85
        : hasNothing ? profile.bluffFreq * 0.45 * profile.aggression * riverBluffBoost * ipAggBoost
        : 0  // strong hands and weak made hands CHECK the river (polarization)
```

with

```ts
      const barrelRate = hasMonster ? 0.85
        : hasNothing ? Math.min(profile.bluffFreq * 0.45 * profile.aggression * riverBluffBoost * ipAggBoost, STRAT.river.maxBluffRate)
        : 0  // strong hands and weak made hands CHECK the river (polarization)
```

In the non-raiser river block, replace

```ts
      if (hasNothing && rng() < profile.bluffFreq * 0.35 * profile.aggression) {
```

with

```ts
      if (hasNothing && rng() < Math.min(profile.bluffFreq * 0.35 * profile.aggression, STRAT.river.maxBluffRate)) {
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `yarn vitest run tests/river-defense.test.ts`
Expected: PASS, both describe blocks.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `yarn vitest run && yarn typecheck`
Expected: PASS.

- [ ] **Step 8: Run both probe batteries**

```bash
for d in 100 25 20 15; do yarn probe all 10000 20260712 $d; done
yarn probe:composite all 30000 20260712,999,7,4242
```

Expected: all standard cells `< +10`; `river-33` / `river-50` deltas `<= +5`; `river-call-tp` `<= +10`. Bots now bluff rivers, so `station` should lose *more*, not less.

- [ ] **Step 9: Commit**

```bash
git add app/utils/botDecision.ts tests/river-defense.test.ts
git commit -m "River: overcards and busted draws are air, so bluffs fire at the persona rate (Round 8 #2)"
```

---

### Task 9: Short-stack play

Measured: any bot under 25bb facing any bet — including just the big blind — either open-jams its top 18–26% or folds. It never opens small, never limps, never calls, and reuses the shoving range as its jam-*calling* range. Because bots never rebuy, one lost pot parks a bot there until it busts. At exactly 25bb nothing triggers, so the CI gate's "25bb" cell never exercises the mode at all.

**Files:**
- Modify: `holdem.config.ts` (`strategy.preflop`), `app/utils/botDecision.ts` (`decidePreflopAction`), `tests/phase4-bot-ai.test.ts` (drop the dead config pin)
- Test: `tests/short-stack.test.ts` (create)

**Interfaces:**
- Produces: `config.strategy.preflop.pushFoldBB`, `.commitRatio`, `.shortReJamScale`, `.shortJamCallScale`; module-private `applyCommitRule`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/short-stack.test.ts
/**
 * Short-stack play. Round 8 measured pure push/fold from 25bb down: bots
 * open-jammed 18-26% and folded everything else, never opening small and
 * never calling, and they reused the shove range as the jam-CALLING range.
 * Push/fold now starts at 12bb; between 12bb and 25bb the normal logic runs
 * with a commit rule, and jam calls are priced off the jam's size.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, type BotProfile } from '../app/utils/botDecision'
import { mulberry32 } from '../app/utils/rng'
import type { Card, Suit } from '../app/utils/cards'
import config from '../holdem.config'

const BB = 2
const LINEUP = ['Tennifer Jilly', 'Krynn Benney', 'Hill Phellmuth', 'Mhris Coneymaker',
  'Entonio Asfandiari', 'Naniel Degreanu', 'Aatrik Pantonius', 'Solid Sam', 'Ihil Pvey']

const profileOf = (name: string): BotProfile => {
  const p = config.personas.find(x => x.name === name)!
  return {
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq,
    creativeFreq: p.creativeFreq, threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
    fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq, limpFreq: p.limpFreq,
    styleBias: p.styleBias, betSizeMult: p.betSizeMult, overbetFreq: p.overbetFreq,
  }
}

function deck(rng: () => number): Card[] {
  const d: Card[] = []
  for (const s of ['hearts', 'diamonds', 'clubs', 'spades'] as Suit[]) {
    for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s })
  }
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j]!, d[i]!] }
  return d
}

/** First to act at `stackBB`, facing only the big blind, from `pos`. */
function openMix(stackBB: number, pos = 'BTN', n = 18000) {
  let fold = 0, limp = 0, jamOpen = 0, small = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(3)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const chips = stackBB * BB
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: BB, pot: 1.5 * BB, currentBet: BB, playerBet: 0,
        chips, bb: BB, numActivePlayers: 6, raiseLevel: 0, position: pos,
        holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type === 'fold') fold++
      else if (a.type === 'call') limp++
      else if ((a.amount ?? 0) >= chips) jamOpen++
      else small++
    }
  }
  return { fold: fold / total, limp: limp / total, jamOpen: jamOpen / total, small: small / total }
}

/** Continue rate facing an all-in of `jamBB` with `stackBB` behind. */
function jamCallRate(stackBB: number, jamBB: number, n = 18000) {
  let cont = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(7)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const chips = stackBB * BB
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: Math.min(jamBB, stackBB) * BB, pot: (jamBB + 1.5) * BB,
        currentBet: jamBB * BB, playerBet: 0, chips, bb: BB, numActivePlayers: 4,
        raiseLevel: 1, position: 'BB', holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
  }
  return cont / total
}

describe('push/fold band', () => {
  it('a 24bb stack opens by raising, not by shoving', () => {
    const m = openMix(24)
    expect(m.jamOpen).toBeLessThan(0.02)
    expect(m.small).toBeGreaterThan(0.15)
  })

  it('a 12bb stack is in push/fold mode', () => {
    const m = openMix(config.strategy.preflop.pushFoldBB)
    expect(m.jamOpen).toBeGreaterThan(0.15)
    expect(m.small).toBeLessThan(0.02)
  })

  it('late position shoves wider than early position at 10bb', () => {
    expect(openMix(10, 'BTN').jamOpen).toBeGreaterThan(openMix(10, 'UTG').jamOpen)
  })

  it('there is no behavior cliff at exactly 25bb', () => {
    const under = openMix(24.9)
    const at = openMix(25)
    expect(Math.abs(under.jamOpen - at.jamOpen)).toBeLessThan(0.05)
    expect(Math.abs(under.small - at.small)).toBeLessThan(0.10)
  })
})

describe('jam calls are priced off the jam size', () => {
  it('calls a 12bb jam wider than a 25bb jam', () => {
    expect(jamCallRate(30, 12)).toBeGreaterThan(jamCallRate(30, 25))
  })

  it('a short jam still gets a disciplined range, not a station call', () => {
    expect(jamCallRate(30, 12)).toBeLessThan(0.18)
  })

  it('a 100bb open-jam is still premium-only', () => {
    expect(jamCallRate(100, 100)).toBeLessThan(0.03)
  })
})

describe('commit rule', () => {
  it('a raise that would cost 40%+ of a 20bb stack goes all-in instead', () => {
    let raises = 0, allIns = 0
    const rng = mulberry32(11)
    for (let i = 0; i < 6000; i++) {
      const d = deck(rng)
      const chips = 20 * BB
      const a = decideBotAction(profileOf('Dom Twan'), {
        street: 'preflop', toCall: 3 * BB, pot: 5 * BB, currentBet: 3 * BB, playerBet: 0,
        chips, bb: BB, numActivePlayers: 4, raiseLevel: 1, position: 'BTN',
        holeCards: [d[0]!, d[1]!], rng,
      })
      if (a.type === 'raise') {
        raises++
        if ((a.amount ?? 0) >= chips) allIns++
      }
    }
    expect(raises).toBeGreaterThan(50)
    expect(allIns / raises).toBeGreaterThan(0.8)
  })

  it('does not apply at 100bb', () => {
    let raises = 0, allIns = 0
    const rng = mulberry32(11)
    for (let i = 0; i < 6000; i++) {
      const d = deck(rng)
      const chips = 100 * BB
      const a = decideBotAction(profileOf('Dom Twan'), {
        street: 'preflop', toCall: 3 * BB, pot: 5 * BB, currentBet: 3 * BB, playerBet: 0,
        chips, bb: BB, numActivePlayers: 4, raiseLevel: 1, position: 'BTN',
        holeCards: [d[0]!, d[1]!], rng,
      })
      if (a.type === 'raise') { raises++; if ((a.amount ?? 0) >= chips) allIns++ }
    }
    expect(allIns / raises).toBeLessThan(0.05)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/short-stack.test.ts`
Expected: FAIL — at 24bb `jamOpen` ≈ 0.26 and `small` ≈ 0.

- [ ] **Step 3: Add the config knobs**

In `holdem.config.ts`, inside `strategy.preflop`, add after `jamRaisePortion: 0.4,`:

```ts
      // Short stacks (Round 8). Pure push/fold below pushFoldBB; between it
      // and 25bb the normal branches run, with any raise costing commitRatio
      // of the stack promoted to all-in. The old code pushed or folded from
      // 25bb down, so a bot that lost one pot never played a normal hand
      // again (bots do not rebuy), and it reused its shove range as its
      // jam-CALLING range.
      pushFoldBB: 12,
      commitRatio: 0.40,
      shortReJamScale: 0.70,   // re-jam range vs a small raise, as a share of the shove range
      shortJamCallScale: 0.45, // calling range vs a jam, as a share of the shove range
      shortJamCallFloor: 0.04, // continue range vs a 25bb jam
      shortJamCallCeil: 0.10,  // ...and vs a 12bb-or-shorter jam
```

- [ ] **Step 4: Replace the push/fold block**

In `decidePreflopAction`, replace the whole `if (stackBB < 25 && toCall > 0 && ctx.holeCards) { ... }` block with:

```ts
  // ─── Short-stack push/fold mode ────────────────────────
  // Below pushFoldBB there is no room to play post-flop, so the whole game
  // is shove-or-fold. Between pushFoldBB and 25bb the normal branches run
  // and the commit rule (applyCommitRule) promotes committing raises to
  // all-ins. Position-aware: late position shoves wider.
  if (stackBB < STRAT.preflop.pushFoldBB && toCall > 0 && ctx.holeCards) {
    const handPct = handRankIndex(ctx.holeCards) >= 0
      ? handPercentile(ctx.holeCards)
      : chenToPercentile(chenPlusScore(ctx.holeCards, ctx.position ?? '', { vpip: profile.vpip, aggression: profile.aggression }))
    const latePos = ['BTN', 'D', 'D/BTN', 'CO', 'D/SB'].includes(ctx.position ?? '')
    // Desperate stacks (<10BB) shove widest
    const shoveThreshold = stackBB < 10
      ? (latePos ? 0.35 : 0.28)
      : (latePos ? 0.25 : 0.18)
    // Calling a shove is not the same decision as making one: you have no
    // fold equity, so the range must be tighter than the shoving range.
    const facingJam = toCall >= chips * STRAT.preflop.commitRatio
    const scale = toCall <= bb ? 1
      : facingJam ? STRAT.preflop.shortJamCallScale
      : STRAT.preflop.shortReJamScale
    if (handPct < shoveThreshold * scale) {
      return { type: 'raise', amount: chips + playerBet } // all-in
    }
    return { type: 'fold' }
  }
```

- [ ] **Step 5: Widen jam calls as the jam gets shorter**

Inside the `if (jamLike) { ... }` block, replace

```ts
    const continueRange = Math.max(profile.fourBetFreq ?? 0.025, STRAT.preflop.jamContinueFloor) * jamSizeFactor
```

with

```ts
    let continueRange = Math.max(profile.fourBetFreq ?? 0.025, STRAT.preflop.jamContinueFloor) * jamSizeFactor
    // A 12-25bb open-shove is a much wider range than a 100bb one, and the
    // table has to call it wider or short stacks print money (Round 8 #3).
    if (raiseLevel <= 1 && jamBB < 25) {
      const t = Math.max(0, Math.min((25 - jamBB) / (25 - STRAT.preflop.pushFoldBB), 1))
      const shortRange = STRAT.preflop.shortJamCallFloor
        + (STRAT.preflop.shortJamCallCeil - STRAT.preflop.shortJamCallFloor) * t
      continueRange = Math.max(continueRange, shortRange)
    }
```

- [ ] **Step 6: Add the commit rule**

Rename the existing function: change `function decidePreflopAction(profile: BotProfile, ctx: DecisionContext, rand: number): BotAction {` to `function decidePreflopCore(profile: BotProfile, ctx: DecisionContext, rand: number): BotAction {`.

Immediately above it, add:

```ts
/**
 * Between pushFoldBB and 25bb, a raise that costs a large share of the stack
 * has no fold-equity-preserving retreat: raising to 40% of stack and folding
 * to the shove is the worst of both. Promote it to an all-in. Outside that
 * band the raise stands as sized.
 */
function applyCommitRule(action: BotAction, ctx: DecisionContext): BotAction {
  if (action.type !== 'raise') return action
  const stackBB = ctx.chips / ctx.bb
  if (stackBB <= STRAT.preflop.pushFoldBB || stackBB > 25) return action
  const allIn = ctx.chips + ctx.playerBet
  const total = action.amount ?? 0
  if (total >= allIn) return action
  if (total - ctx.playerBet >= ctx.chips * STRAT.preflop.commitRatio) {
    return { type: 'raise', amount: allIn }
  }
  return action
}

function decidePreflopAction(profile: BotProfile, ctx: DecisionContext, rand: number): BotAction {
  return applyCommitRule(decidePreflopCore(profile, ctx, rand), ctx)
}
```

- [ ] **Step 7: Remove the dead config pin**

`config.sessionMemory.shortStackThreshold` is read by nothing in `app/`. Delete the field from `holdem.config.ts` and delete this test from `tests/phase4-bot-ai.test.ts`:

```ts
  it('short stack threshold triggers push/fold mode', () => {
    expect(config.sessionMemory.shortStackThreshold).toBe(20) // standard
  })
```

Verify nothing else reads it: `grep -rn 'shortStackThreshold' app scripts tests holdem.config.ts` → no output.

- [ ] **Step 8: Run the test and watch it pass**

Run: `yarn vitest run tests/short-stack.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full suite and typecheck**

Run: `yarn vitest run && yarn typecheck`
Expected: PASS.

- [ ] **Step 10: Run both probe batteries**

```bash
for d in 100 25 20 15; do yarn probe all 10000 20260712 $d; done
yarn probe:composite base,pf-exploit 30000 20260712,999,7,4242 24
yarn probe:composite all 30000 20260712,999,7,4242
```

Expected: every standard cell `< +10` at all four depths (watch `nit-value` at 20 and 24bb — it was +4.0 and +9.5 before this task); the 24bb `pf-exploit` delta falls from ≈ +17 to `<= +5`.

- [ ] **Step 11: Commit**

```bash
git add holdem.config.ts app/utils/botDecision.ts tests/short-stack.test.ts tests/phase4-bot-ai.test.ts
git commit -m "Short stacks: push/fold below 12bb, commit rule to 25bb, jam calls priced off jam size (Round 8 #3)"
```

---

### Task 10: Size-aware 3-bet and 4-bet defense

Measured: after a button open, the pooled pros fold 81% / call 17% / 4-bet 2% against a 3-bet — identically from 7.5bb to 60bb. Only a raise costing 60% of the stack is treated as jam-like. Opens already have a continuous size penalty; re-raises do not.

**Files:**
- Modify: `holdem.config.ts` (`strategy.preflop`), `app/utils/botDecision.ts` (`decidePreflopCore`, `raiseLevel === 2` and `=== 3` branches, `jamLike`)
- Test: `tests/reraise-size.test.ts` (create)

**Interfaces:**
- Produces: `config.strategy.preflop.threeBetRefBB`, `.threeBetRefMult`, `.fourBetRefBB`, `.fourBetRefMult`, `.reraiseSizePenaltyExp`; changes `.jamToCallStackRatio` from 0.6 to 0.45.

- [ ] **Step 1: Write the failing test**

```ts
// tests/reraise-size.test.ts
/**
 * Defense against re-raises must scale with size. Round 8 measured an
 * identical fold/call/4-bet mix (81/17/2) against every 3-bet from 7.5bb to
 * 60bb, so 3-betting premiums huge and jamming any flop was free money.
 * Opens already had this penalty; re-raises did not.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, type BotProfile } from '../app/utils/botDecision'
import { mulberry32 } from '../app/utils/rng'
import type { Card, Suit } from '../app/utils/cards'
import config from '../holdem.config'

const BB = 2
const LINEUP = ['Tennifer Jilly', 'Krynn Benney', 'Hill Phellmuth', 'Mhris Coneymaker',
  'Entonio Asfandiari', 'Naniel Degreanu', 'Aatrik Pantonius', 'Solid Sam', 'Ihil Pvey']

const profileOf = (name: string): BotProfile => {
  const p = config.personas.find(x => x.name === name)!
  return {
    vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq,
    creativeFreq: p.creativeFreq, threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
    fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq, limpFreq: p.limpFreq,
    styleBias: p.styleBias, betSizeMult: p.betSizeMult, overbetFreq: p.overbetFreq,
  }
}

function deck(rng: () => number): Card[] {
  const d: Card[] = []
  for (const s of ['hearts', 'diamonds', 'clubs', 'spades'] as Suit[]) {
    for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s })
  }
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j]!, d[i]!] }
  return d
}

/** Opened to 2.5bb from the button with 100bb; now faces a 3-bet to `toBB`. */
function vs3Bet(toBB: number, n = 18000) {
  let cont = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(1)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: (toBB - 2.5) * BB, pot: (toBB + 4) * BB,
        currentBet: toBB * BB, playerBet: 2.5 * BB, chips: 97.5 * BB, bb: BB,
        numActivePlayers: 3, raiseLevel: 2, position: 'BTN', holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
  }
  return cont / total
}

/** 3-bet to 9bb, now facing a 4-bet to `toBB`. */
function vs4Bet(toBB: number, n = 18000) {
  let cont = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(2)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: (toBB - 9) * BB, pot: (toBB + 11) * BB,
        currentBet: toBB * BB, playerBet: 9 * BB, chips: 91 * BB, bb: BB,
        numActivePlayers: 2, raiseLevel: 3, position: 'BTN', holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
  }
  return cont / total
}

describe('defense vs 3-bets scales with size', () => {
  it('a standard 3-bet is defended much wider than a huge one', () => {
    expect(vs3Bet(9)).toBeGreaterThan(vs3Bet(25) + 0.05)
  })

  it('continue rate is monotone non-increasing from 9bb to 60bb', () => {
    const r = [9, 15, 25, 40, 60].map(vs3Bet)
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeLessThanOrEqual(r[i - 1]! + 0.005)
  })

  it('a standard-size 3-bet still gets a real defense (not a nit fold)', () => {
    expect(vs3Bet(9)).toBeGreaterThan(0.14)
  })

  it('a 50bb 3-bet is jam-like and gets a premium-only continue', () => {
    expect(vs3Bet(50)).toBeLessThan(0.05)
  })
})

describe('defense vs 4-bets scales with size', () => {
  it('a standard 4-bet is defended wider than a huge one', () => {
    expect(vs4Bet(22)).toBeGreaterThan(vs4Bet(60))
  })

  it('a standard 4-bet still gets its configured continue range', () => {
    expect(vs4Bet(22)).toBeGreaterThan(0.02)
  })
})

describe('jam-like threshold', () => {
  it('is 45% of stack', () => {
    expect(config.strategy.preflop.jamToCallStackRatio).toBe(0.45)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/reraise-size.test.ts`
Expected: FAIL — `vs3Bet(9)` and `vs3Bet(25)` are equal; `jamToCallStackRatio` is 0.6.

- [ ] **Step 3: Add the config knobs**

In `holdem.config.ts` → `strategy.preflop`, change `jamToCallStackRatio: 0.6,` to `jamToCallStackRatio: 0.45,` and add after it:

```ts
      // Re-raise size awareness (Round 8). Opens already shrink defense
      // ranges continuously with size; re-raises did not, so the fold/call
      // mix vs a 3-bet was identical from 7.5bb to 60bb and 3-betting
      // premiums huge was free money. The reference size is the larger of a
      // standard bb-denominated re-raise and a normal multiple of what this
      // bot already put in.
      threeBetRefBB: 9,
      threeBetRefMult: 3.5,
      fourBetRefBB: 25,
      fourBetRefMult: 2.5,
      reraiseSizePenaltyExp: 0.85,
```

- [ ] **Step 4: Apply the penalty at raiseLevel 2**

In `decidePreflopCore`'s `if (raiseLevel === 2) { ... }` block, replace the four constant lines at the top with:

```ts
  if (raiseLevel === 2) {
    // Size penalty: a 9bb 3-bet and a 40bb 3-bet are different decisions.
    const ref3 = Math.max(STRAT.preflop.threeBetRefBB * bb, STRAT.preflop.threeBetRefMult * playerBet)
    const pen3 = currentBet <= ref3 ? 1 : Math.pow(ref3 / currentBet, STRAT.preflop.reraiseSizePenaltyExp)
    const reraiseFreq = profile.fourBetFreq ?? (profile.pfr * 0.15 * profile.aggression)
    const valueFreq = reraiseFreq * 0.6 * Math.sqrt(pen3)
    const bluffRate4 = (reraiseFreq * 0.4) / Math.max(effectiveVpip, 0.15) * Math.pow(pen3, 1.5)
    // Facing 3-bet: tighter defense but still wide by modern standards
    const flatCallFreq4 = effectiveVpip * 0.45 * pen3
```

Leave the rest of the block unchanged.

- [ ] **Step 5: Apply the penalty at raiseLevel 3**

Replace the two constant lines in `if (raiseLevel === 3) { ... }` with:

```ts
  if (raiseLevel === 3) {
    // Facing 4-bet: pure hand value territory — raw percentile, no position shift
    const ref4 = Math.max(STRAT.preflop.fourBetRefBB * bb, STRAT.preflop.fourBetRefMult * playerBet)
    const pen4 = currentBet <= ref4 ? 1 : Math.pow(ref4 / currentBet, STRAT.preflop.reraiseSizePenaltyExp)
    const reraiseFreq = profile.fiveBetFreq ?? 0.01
    const flatCallFreq5 = effectiveVpip * 0.20 * pen4
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `yarn vitest run tests/reraise-size.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `yarn vitest run && yarn typecheck`
Expected: PASS. `tests/phase6-escalation.test.ts` uses a 7.5bb 3-bet and a 20bb 4-bet with `playerBet: 0`, so the bb-denominated reference applies and both are unpenalized — those bands must not move.

- [ ] **Step 8: Run both probe batteries**

```bash
for d in 100 25 20 15; do yarn probe all 10000 20260712 $d; done
yarn probe:composite all 30000 20260712,999,7,4242
```

Expected: every standard cell `< +10`. **`3bet-jam` and `nit-value` are the sensitive pair here** — lowering `jamToCallStackRatio` widens what counts as a jam. If `3bet-jam` creeps toward zero, the defense went too tight; if `nit-value` crosses +10, too loose. `prem3bet-25-fj` / `prem3bet-50-fj` / `wide5-3bet-50-fj` deltas must fall to `<= +5`.

- [ ] **Step 9: Commit**

```bash
git add holdem.config.ts app/utils/botDecision.ts tests/reraise-size.test.ts
git commit -m "Preflop: continuous size penalty on 3-bet and 4-bet defense, jam-like at 45% of stack (Round 8 #4)"
```

---

### Task 11: Big-blind defense against small opens

Measured: the big blind folds 86% against a 2.5bb open. It is already 1bb invested and getting 3.5:1, so folding 86% is a real leak — though a smaller one than Tasks 7–10, since any-two late-position opens still lose overall.

**Files:**
- Modify: `holdem.config.ts` (`strategy.preflop`), `app/utils/botDecision.ts` (`decidePreflopCore`, `raiseLevel <= 1` cold-call branch)
- Test: `tests/reraise-size.test.ts` (extend)

**Interfaces:**
- Produces: `config.strategy.preflop.bbDefenseBoost`, `.bbDefenseFullBB`, `.bbDefenseFadeBB`.

- [ ] **Step 1: Write the failing test**

Append to `tests/reraise-size.test.ts`:

```ts
/** In the big blind facing an open to `toBB` from the cutoff, no callers. */
function bbDefense(toBB: number, n = 18000) {
  let cont = 0, total = 0
  for (const name of LINEUP) {
    const rng = mulberry32(5)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const a = decideBotAction(profileOf(name), {
        street: 'preflop', toCall: (toBB - 1) * BB, pot: (toBB + 1.5) * BB,
        currentBet: toBB * BB, playerBet: BB, chips: 99 * BB, bb: BB,
        numActivePlayers: 4, raiseLevel: 1, position: 'BB', holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
  }
  return cont / total
}

describe('big blind defends small opens', () => {
  it('defends a 2.5bb open at a realistic rate', () => {
    const d = bbDefense(2.5)
    expect(d).toBeGreaterThan(0.20)
    expect(d).toBeLessThan(0.40)
  })

  it('defends less as the open gets bigger', () => {
    expect(bbDefense(2.5)).toBeGreaterThan(bbDefense(5))
    expect(bbDefense(5)).toBeGreaterThan(bbDefense(8))
  })

  it('the boost is fully faded out by 6bb', () => {
    expect(bbDefense(8)).toBeLessThan(0.14)
  })

  it('does not leak into other positions', () => {
    let cont = 0, total = 0
    const rng = mulberry32(6)
    for (let i = 0; i < 6000; i++) {
      const d = deck(rng)
      const a = decideBotAction(profileOf('Solid Sam'), {
        street: 'preflop', toCall: 2.5 * BB, pot: 4 * BB, currentBet: 2.5 * BB, playerBet: 0,
        chips: 100 * BB, bb: BB, numActivePlayers: 4, raiseLevel: 1, position: 'MP',
        holeCards: [d[0]!, d[1]!], rng,
      })
      total++
      if (a.type !== 'fold') cont++
    }
    expect(cont / total).toBeLessThan(0.20)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn vitest run tests/reraise-size.test.ts -t "big blind"`
Expected: FAIL — `bbDefense(2.5)` ≈ 0.14, below the 0.20 floor.

- [ ] **Step 3: Add the config knobs**

In `holdem.config.ts` → `strategy.preflop`, add:

```ts
      // Big-blind pot discount (Round 8). The BB is already 1bb in, so a
      // 2-3bb open lays it better than 3:1 and folding 86% is a leak. The
      // discount fades out linearly and is gone by bbDefenseFadeBB.
      bbDefenseBoost: 2.4,
      bbDefenseFullBB: 3,
      bbDefenseFadeBB: 6,
```

- [ ] **Step 4: Apply it to the big blind's flat range**

In `decidePreflopCore`'s `if (raiseLevel <= 1) { ... }` branch, immediately after the `flatCallFreq` declaration, add:

```ts
    // The BB already has 1bb in the pot: against a small open it is getting
    // a price no other seat gets, and the flat range should reflect that.
    const bbDefenseMult = ctx.position === 'BB'
      ? openSizeBB <= STRAT.preflop.bbDefenseFullBB
        ? STRAT.preflop.bbDefenseBoost
        : openSizeBB >= STRAT.preflop.bbDefenseFadeBB
          ? 1
          : 1 + (STRAT.preflop.bbDefenseBoost - 1)
            * (STRAT.preflop.bbDefenseFadeBB - openSizeBB)
            / (STRAT.preflop.bbDefenseFadeBB - STRAT.preflop.bbDefenseFullBB)
      : 1
```

Then change the `if (handPct < flatCallFreq)` test at the end of that branch to:

```ts
    if (handPct < flatCallFreq * bbDefenseMult) {
      return { type: 'call' }
    }
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `yarn vitest run tests/reraise-size.test.ts`
Expected: PASS. If `bbDefense(2.5)` overshoots 0.40, lower `bbDefenseBoost` toward 2.0.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `yarn vitest run && yarn typecheck`
Expected: PASS. Watch the persona VPIP bands in `tests/phase4-all-personas.test.ts` (±0.08) and `tests/phase4-bot-behavior.test.ts` — observed VPIP should move under 3 points.

- [ ] **Step 7: Run both probe batteries**

```bash
for d in 100 25 20 15; do yarn probe all 10000 20260712 $d; done
yarn probe:composite all 30000 20260712,999,7,4242
```

Expected: every standard cell `< +10`; `steal-fold` and `open-any-late` should lose *more* than before, since the blinds now fight back.

- [ ] **Step 8: Commit**

```bash
git add holdem.config.ts app/utils/botDecision.ts tests/reraise-size.test.ts
git commit -m "Big blind: defend small opens at the price the pot lays (Round 8 #5)"
```

---

### Task 12: Gate the composite cells in CI

The composite probe found these leaks; without a gate cell, nothing stops the next tuning pass from reopening them. Also add a 20bb depth to the standard battery — `nit-value` measured +9.5 at 24bb and +4.0 at 20bb before Task 9, right at the bound, and no cell covered that band.

**Files:**
- Create: `tests/composite-probe.test.ts`
- Modify: `tests/exploit-probe.test.ts` (depth list)

**Interfaces:**
- Consumes: `COMPOSITE`, `runComposite` from `scripts/composite-probe.ts` (Task 6).

- [ ] **Step 1: Write the test**

```ts
// tests/composite-probe.test.ts
/**
 * Composite engine-leak gate.
 *
 * The pure-degenerate battery (tests/exploit-probe.test.ts) cannot see a
 * postflop leak: a hero who jams any two cards pays so much blind tax that
 * an +18 bb/100 river leak vanishes inside a -300 bb/100 line. These cells
 * run a hero on a SOLID baseline (Solid Sam's own logic) with exactly one
 * deviation, so the delta against the baseline IS the leak's EV.
 *
 * Each cell must stay below the same +10 bb/100 bound as the pure battery.
 * These are the five deviations that were profitable in Round 8.
 */
import { describe, it, expect } from 'vitest'
import { COMPOSITE, runComposite } from '../scripts/composite-probe'

const HANDS = 20000
const MAX_BB100 = 10
const SEEDS = [20260712, 999]

/** Mean bb/100 over the seeds — a single seed's SD is ~8-10 bb/100. */
function meanBB100(name: string, depthBB: number): number {
  const rs = SEEDS.map(s => runComposite(name, HANDS, s, depthBB))
  return rs.reduce((a, r) => a + r.bb100, 0) / rs.length
}

describe('composite probe covers the deviations that were profitable', () => {
  it('includes the river, premium-3-bet and short-stack cells', () => {
    expect(Object.keys(COMPOSITE)).toEqual(expect.arrayContaining(
      ['base', 'river-33', 'river-50', 'prem3bet-25-fj', 'prem3bet-50-fj', 'pf-exploit']))
  })
})

describe('no single deviation from solid play beats the pro bots', () => {
  const cells: Array<[string, number]> = [
    ['river-33', 100],
    ['river-50', 100],
    ['river-call-tp', 100],
    ['prem3bet-25-fj', 100],
    ['prem3bet-50-fj', 100],
    ['wide5-3bet-50-fj', 100],
    ['pf-exploit', 24],
  ]
  for (const [name, depthBB] of cells) {
    it(`${name} is unprofitable at ${depthBB}bb`, () => {
      const bb100 = meanBB100(name, depthBB)
      expect(bb100, `${name} won ${bb100.toFixed(1)} bb/100 over ${HANDS} hands x ${SEEDS.length} seeds at ${depthBB}bb — possible engine leak`)
        .toBeLessThan(MAX_BB100)
    }, 300_000)
  }
})

describe('composite probe determinism', () => {
  it('is byte-identical for a fixed seed', () => {
    const a = runComposite('river-33', 300, SEEDS[0]!)
    const b = runComposite('river-33', 300, SEEDS[0]!)
    expect(a).toEqual(b)
  }, 60_000)
})
```

- [ ] **Step 2: Run it**

Run: `yarn vitest run tests/composite-probe.test.ts`
Expected: PASS — all seven cells below +10. If one fails, the corresponding task's fix is incomplete; go back to it rather than raising the bound.

- [ ] **Step 3: Add the 20bb depth to the standard gate**

In `tests/exploit-probe.test.ts`, change `for (const depthBB of [100, 25]) {` to:

```ts
// 20bb sits inside the commit-rule band (12-25bb), which no other depth
// exercises; nit-value measured +9.5 at 24bb before Round 8's short-stack fix.
for (const depthBB of [100, 25, 20]) {
```

- [ ] **Step 4: Run the whole suite and time it**

Run: `time yarn vitest run`
Expected: PASS. Note the wall-clock — the gate grew by one depth (9 cells) plus 7 composite cells. If it exceeds roughly 10 minutes on this machine, drop the composite `HANDS` to 15000 and re-verify each cell still separates from the bound.

- [ ] **Step 5: Commit**

```bash
git add tests/composite-probe.test.ts tests/exploit-probe.test.ts
git commit -m "CI: gate the five composite leak cells and add a 20bb depth to the standard battery"
```

---

### Task 13: Documentation and audit log

**Files:**
- Modify: `README.md` (decision-flow sections, probe section, Security audit log), `CHANGELOG.md` (Unreleased)
- Modify: `/Users/cschweda/.claude/projects/-Volumes-satechi-webdev-metaincognita-holdem/memory/round8-review-findings.md` and `MEMORY.md`

- [ ] **Step 1: Collect the final numbers**

```bash
for d in 100 25 20 15; do echo "=== ${d}bb ==="; yarn probe all 10000 20260712 $d; done | tee /tmp/round8-probe-final.txt
yarn probe:composite all 30000 20260712,999,7,4242 | tee /tmp/round8-composite-final.txt
yarn probe:composite base,pf-exploit 30000 20260712,999,7,4242 24 | tee -a /tmp/round8-composite-final.txt
yarn vitest run 2>&1 | tail -5   # record the final test/file counts
```

- [ ] **Step 2: Update the README decision-flow docs**

In "Preflop Decision Flow", replace the short-stack bullet (item 4, "If below 25 BB and facing a raise, switch to push/fold mode") with a description of the three-band scheme: pure push/fold below 12bb, normal play with a commit rule from 12 to 25bb, and jam-calling ranges priced off the jam's size. In the "Facing an open" and "Facing a 3-bet" bullets, note that defense ranges now shrink continuously with re-raise size, and that the BB defends small opens at the price the pot lays.

In "Postflop Decision Flow", under "When facing a bet", replace the "Strong hands" and "Weak made hands" bullets' river claims with the MDF-anchored rule, and note under river play that unpaired hands and busted draws are air on the river, so bluffs fire at the persona's rate.

- [ ] **Step 3: Refresh the probe section**

Replace the probe results table with the final 100bb and 25bb columns from `/tmp/round8-probe-final.txt`, add the new `yarn probe:composite` usage line, and add a second table for the composite cells (strategy, what it tests, Δ bb/100 before, Δ after).

- [ ] **Step 4: Add the Round 8 audit entry**

Per the project's audit-log convention, collapse the Round 7 block into a `<details>` element and add Round 8 above it, expanded, marked "current". Include the five findings from the spec's Findings section as a severity table (river defense High, short-stack mode High, 3-bet size Medium, BB defense Low, plus the Info row for the wiring and link fixes), each with its measured before/after numbers and a Fixed status.

- [ ] **Step 5: Add the CHANGELOG Unreleased entries**

Under `## [Unreleased]`, add `### Fixed` entries for the five bot fixes (each naming its bb/100 delta), the preset-switch field loss, the hero-record name collision, and the dead links; an `### Added` entry for the composite probe and its gate cells; and a `### Removed` entry for `sessionMemory.shortStackThreshold`.

- [ ] **Step 6: Update the memory files**

Rewrite `round8-review-findings.md` so it records the round as fixed rather than open: keep the measured leak numbers, add the post-fix numbers, and note that the composite probe now lives at `scripts/composite-probe.ts` with CI cells. Update `composite-probe-methodology.md` to point at the committed script instead of the scratchpad. Update both one-line entries in `MEMORY.md` to match.

- [ ] **Step 7: Final verification**

```bash
yarn vitest run && yarn typecheck
git status --short
```
Expected: suite and typecheck green; working tree clean apart from the docs being committed in the next step.

- [ ] **Step 8: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "Round 8 audit log: five measured leaks fixed, composite probe gate, refreshed decision-flow docs"
```

---

## Self-Review

**Spec coverage.** Section 1 → Task 7. Section 2 → Task 8. Section 3 → Task 9. Section 4 → Task 10. Section 5 → Task 11. Section 6 → Tasks 5, 6, 12. Section 7 → Tasks 1, 2, 3, 4. Section 8 → every task's verification steps plus Task 13. No spec section is unimplemented.

**Deliberate deviation from the spec.** Section 6 called for extracting the probe's hand loop into an exported `runTable`. This plan instead extends `ProbeCtx` and adds an optional `baselineProfile` to `runStrategy` (Task 5). Same outcome — the composite probe reuses one table loop, and pure strategies keep today's exact RNG stream — with a much smaller diff through a 200-line loop whose byte-identity is the thing being protected. Task 5 Step 7 verifies that identity explicitly against the recorded README numbers.

**Placeholder scan.** Every code step carries real code. Task 13 is prose-only by nature (it is documentation), but each step names the exact file, section and source of the numbers.

**Type consistency.** `botStrategyFromPreset` (Task 3), `parseHeroHandRecord` / `actedInLine` (Task 4), `ProbeCtx` / `ProbeOpts` / `runStrategy` (Task 5), `COMPOSITE` / `runComposite` / `BASELINE` (Task 6) are each defined once and used with matching signatures downstream. `config.strategy.river.*` is defined in Task 7 and consumed in Task 8; `config.strategy.preflop.pushFoldBB` is defined in Task 9 and consumed in Task 10's jam-call widening. `decidePreflopCore` / `decidePreflopAction` / `applyCommitRule` are introduced together in Task 9.

**Risk note.** Tasks 7 and 10 both change constants the probe is sensitive to in opposite directions (`nit-value` versus `3bet-jam`). Each has its own probe step so a regression is attributed to one commit, and both list which cell to watch.
