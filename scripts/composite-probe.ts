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
import type { ProbeCtx } from './exploit-probe'
import type { BotProfile, BotAction } from '../app/utils/botDecision'
import { handPercentile } from '../app/utils/ranges'
import { bestHand } from '../app/utils/handAnalysis'
import type { Card } from '../app/utils/cards'

// exploit-probe.ts runs its own CLI `main()` at module top level, guarded
// only by `process.env.VITEST` (its own comment: vite-node gives a script no
// reliable "am I the entry point" signal, so it keys off Vitest's env marker
// instead). That guard assumes its only non-CLI importer is the vitest gate
// test, where Vitest sets VITEST itself. This script is a second, non-vitest
// importer: a plain `import { runStrategy } from './exploit-probe'` evaluates
// exploit-probe's module body — main() included — before any of THIS file's
// own top-level code runs, so it would consume our argv as its own and
// process.exit(1) the moment our strategy name isn't one of ITS strategies.
// Toggling VITEST around a dynamic import suppresses that side effect
// without touching the frozen file; it's restored immediately after so this
// file's own `if (!process.env.VITEST) main()` below still behaves correctly
// both under vitest and under a direct CLI run.
const hadVitest = process.env.VITEST
process.env.VITEST = '1'
const { runStrategy } = await import('./exploit-probe')
if (hadVitest === undefined) delete process.env.VITEST
else process.env.VITEST = hadVitest

const STAKE = config.stakes.find(s => s.level === 3)!
const BB = STAKE.bb

const SAM = config.personas.find(p => p.name === 'Solid Sam')!
export const BASELINE: BotProfile = {
  vpip: SAM.vpip, pfr: SAM.pfr, aggression: SAM.aggression, bluffFreq: SAM.bluffFreq,
  creativeFreq: SAM.creativeFreq, threeBetFreq: SAM.threeBetFreq, fourBetFreq: SAM.fourBetFreq,
  fiveBetFreq: SAM.fiveBetFreq, donkBetFreq: SAM.donkBetFreq, limpFreq: SAM.limpFreq,
  styleBias: SAM.styleBias, betSizeMult: SAM.betSizeMult, overbetFreq: SAM.overbetFreq,
}

type Ctx = ProbeCtx

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
/** A turn spot the baseline would have checked (Round 8, Task 11b). */
const turnCheck = (c: Ctx) => c.street === 'turn' && c.toCall === 0 && c.base!.type === 'check'
const topPairPlus = (c: Ctx) => {
  const r = bestHand(c.holeCards, c.community)
  if (!r) return false
  if (r.rank >= 2) return true
  if (r.rank !== 1) return false
  const boardMax = Math.max(...c.community.map(x => x.rank))
  return r.score[1]! >= boardMax && c.holeCards.some(x => x.rank === r.score[1])
}
/** Two pair or better, and not just playing the board — at least one of the
 * five winning cards is a hole card. Rules out "the board's own two pair"
 * (everyone has it), which topPairPlus above doesn't distinguish. */
const madeTwoPairPlusFromHole = (c: Ctx) => {
  const r = bestHand(c.holeCards, c.community)
  if (!r || r.rank < 2) return false
  return r.bestFive.some(bf => c.holeCards.some(h => h.rank === bf.rank && h.suit === bf.suit))
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
  if (c.street === 'flop' && c.mem.p3 && c.pot >= c.chips * 0.5) { c.tag('prem3bet-jam'); return jam(c) }
  return c.base!
}

export const COMPOSITE: Record<string, (c: Ctx) => BotAction> = {
  'base': c => c.base!,
  'river-33': riverBet(0.33),
  'river-50': riverBet(0.50),
  'river-66': riverBet(0.66),
  'river-100': riverBet(1.00),
  // Round 8 follow-up: river.strongBase/weakBase now defend 1.5x-pot river
  // bets at ~57%, up from ~45% pre-fix — correct against an any-two bettor,
  // but river-33..river-100 above only ever bet 33-100% of pot, and
  // overbet-spam is an any-two line (more calling just makes it lose
  // harder), so nothing measures whether that extra calling pays off a
  // genuine value overbet. This cell only bets when it actually has the
  // goods: two pair or better made with a hole card, 1.5x pot.
  'river-value-150': c => {
    if (riverCheck(c) && madeTwoPairPlusFromHole(c)) { c.tag('rivervalue150'); return betPot(c, 1.5) }
    return c.base!
  },
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
  // Turn-only isolation of turn-river-33 above (Round 8, Task 11b):
  // turn-river-33 conflates two streets, so it can't tell a turn leak from a
  // river one. This bets 1/3 pot on the turn alone whenever checked to and
  // the baseline would check, and never deviates on the river, so the turn's
  // own leak can be measured without the (already-fixed) river cell adding
  // to it.
  'turn-33': c => {
    if (turnCheck(c)) return betPot(c, 0.33)
    return c.base!
  },
  // Turn analog of river-value-150 (Round 8, Task 11b review finding).
  // turn-33/turn-river-33 are both pure any-two-cards bluff lines, so tuning
  // the turn's constants against them alone leaves the value direction
  // unmeasured: the turn's strongMin/weakBase/weakMin all shipped wider than
  // the river's already-vetted values, and wider calling could just as
  // easily overpay a genuine turn value bet as it starves a turn bluff. This
  // cell only bets when it actually has the goods — two pair or better made
  // with a hole card, not just playing the board — sized the same as the
  // river's value probe (1.5x pot; no bluffing component, no any-two-cards
  // element).
  'turn-value-150': c => {
    if (turnCheck(c) && madeTwoPairPlusFromHole(c)) { c.tag('turnvalue150'); return betPot(c, 1.5) }
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
    if (c.street === 'flop' && c.mem.p3 && c.pot >= c.chips * 0.5) { c.tag('wide3bet-jam'); return jam(c) }
    return c.base!
  },
  // Round 8 task-10 review finding: the continuous size penalty that task
  // added governs re-raise defense only BELOW the jam-like gate (toCall >=
  // chips * jamToCallStackRatio). At and above it, control passes entirely
  // to the pre-existing (Round 8 #3) reraiseJamFloor, which decays far more
  // slowly with size — so the HANDOFF itself is a step function, not a
  // continuation of the new penalty. No hand-strength gate (any two cards)
  // and no postflop follow-up (give up), since either would let the 3-bet
  // cells above partially catch this instead of isolating it. Sized off the
  // SPECIFIC opponent's remaining stack, not a fixed bb number: every hand
  // resets to depthBB (see exploit-probe.ts), and the player who set
  // c.currentBet has put in exactly that much this street, so
  // (c.chips + c.playerBet) - c.currentBet is their remaining stack
  // regardless of hero's own seat, prior action, or the table's depth —
  // which is what lets this cell keep landing just past the cliff at any
  // depthBB, not just the 100bb this task measures it at.
  'reraise-cliff-bluff': c => {
    if (!pf(c) || c.toCall <= 0) return c.base!
    if (c.raiseLevel !== 1 && c.raiseLevel !== 2) return c.base!
    const opponentStack = Math.max((c.chips + c.playerBet) - c.currentBet, BB)
    const crossover = c.currentBet + config.strategy.preflop.jamToCallStackRatio * opponentStack
    c.tag(c.raiseLevel === 1 ? 'reraise-cliff-3bet' : 'reraise-cliff-4bet')
    const amount = Math.min(Math.max(Math.round(crossover + BB), c.currentBet + BB), c.chips + c.playerBet)
    return { type: 'raise', amount }
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
      c.tag('pf-fold')
      return { type: 'fold' }
    }
    if (c.raiseLevel === 0 && c.toCall > 0) {
      if (pct < 0.20) { c.tag('open'); return raiseToBB(c, 2.2) }
      c.tag('pf-fold')
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
  console.log('\nTagged EV is the average WHOLE-HAND net for hands where that tag fired, not the incremental EV of the tagged decision alone (e.g. a tag that only fires on premium hands reads high regardless of how the hand was sized).')
  console.log('Every deviation should be <= 0 against a leak-free engine.')
  console.log('Judge the MEAN column: per-seed SD is ~8-10 bb/100 over 30k hands.')
}

if (!process.env.VITEST) main()
