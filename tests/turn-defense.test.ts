/**
 * Turn defense must respond to bet size, the same way the river's now does.
 * Round 8 found a flat, size-blind turn call-down rule (no bet-size term at
 * all below the separate >0.7x-pot overbet check): the composite probe's
 * turn-river-33 cell (bet a third of pot on both the turn and river whenever
 * checked to) was quoted at +19.0 bb/100 at 8 seeds x 30,000 hands when this
 * task was opened — the largest leak in the battery, and bigger than the
 * river leak Round 8 originally set out to fix. An independent re-measurement
 * of the same commit at task start read +11.9, not +19.0 (see
 * task-11b-report.md for the likely cause — a same-round BB-defense review
 * fix that landed after the +19.0 figure was quoted); either way the fix
 * below brings it under the brief's +10 target. The river half of that line
 * was already fixed (see river-defense.test.ts); this closes the turn half.
 */
import { describe, it, expect } from 'vitest'
import { decideBotAction, type BotProfile } from '../app/utils/botDecision'
import { bestHand, detectDraws } from '../app/utils/handAnalysis'
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

type Cls = 'air' | 'pair<top' | 'top pair' | 'two pair+' | 'draw'

/**
 * Classify with the same bucket precedence decidePostflopAction uses
 * (hasMonster > hasStrongHand > hasDraw > hasWeakMade > hasNothing), built
 * only from what's exported (bestHand, detectDraws) plus the one piece of
 * postflopHandStrength's math that changes the bucket a rank-0 hand falls
 * into: the overcard credit scoped to community.length < 5 (botDecision.ts).
 *
 * A rank-0 hand with a flush or straight draw always classifies 'draw' here,
 * never 'air': the largest draw-equity credit postflopHandStrength can add
 * (a flush draw, 0.33 * 0.95 = 0.3135) sits below strongStrength (0.35), so
 * it can never read as hasStrongHand and skip the untouched hasDraw branch.
 * A rank-0 hand with 1-2 overcards and no draw is grouped with 'pair<top'
 * (not 'air'): botDecision.ts's overcard credit puts it at strength
 * 0.15-0.25, inside the hasWeakMade band, because a card is still to come.
 * Only a rank-0 hand with neither a draw nor an overcard is true 'air'
 * (hasNothing, strength 0.08) — that is the bucket the "air still folds"
 * assertion below means to exercise.
 */
const classify = (hole: [Card, Card], board: Card[]): Cls => {
  const r = bestHand(hole, board)!
  if (r.rank >= 2) return 'two pair+'
  const draws = detectDraws(hole, board)
  const hasFlushOrStraightDraw = draws.some(d => d.type.includes('Flush') || d.type.includes('straight'))
  if (r.rank === 0 && hasFlushOrStraightDraw) return 'draw'
  const boardMax = Math.max(...board.map(x => x.rank))
  if (r.rank === 1) {
    return (r.score[1]! >= boardMax && hole.some(x => x.rank === r.score[1])) ? 'top pair' : 'pair<top'
  }
  const overcards = hole.filter(x => x.rank > boardMax).length
  return overcards > 0 ? 'pair<top' : 'air'
}

/** Heads-up turn, bot checked and now faces `frac` x pot with one card still to come. */
function turnDefense(frac: number, n = 18000) {
  const stat: Record<Cls, { n: number; def: number }> = {
    'air': { n: 0, def: 0 }, 'pair<top': { n: 0, def: 0 }, 'top pair': { n: 0, def: 0 },
    'two pair+': { n: 0, def: 0 }, 'draw': { n: 0, def: 0 },
  }
  for (const name of LINEUP) {
    const rng = mulberry32(4)
    for (let i = 0; i < n / LINEUP.length; i++) {
      const d = deck(rng)
      const hole: [Card, Card] = [d[0]!, d[1]!]
      const board = d.slice(2, 6) // TURN: 4 community cards, one still to come
      const pot = 30 * BB
      const bet = Math.round(pot * frac)
      const a = decideBotAction(profileOf(name), {
        // Deep stack (400bb), not the river test's 85bb: unlike the river,
        // the turn has an unrelated SPR auto-commit rule (`isShallowSPR &&
        // spr < 2 && hasStrongHand`, above the block this task changes) that
        // a growing turn pot against an 85bb stack pushes through well below
        // 1.5x pot, forcing every strong hand to shove regardless of bet
        // size and swamping the size-sensitivity this test measures. 400bb
        // keeps spr > 4 (not even "shallow") at every size swept here.
        chips: 400 * BB, bb: BB, numActivePlayers: 2, position: 'BB',
        street: 'turn', toCall: bet, pot: pot + bet, currentBet: bet, playerBet: 0,
        holeCards: hole, community: board, checkedThisStreet: true,
        streetHistory: { flop: 'call' }, preflopCallers: 1, rng,
      })
      const s = stat[classify(hole, board)]
      s.n++
      if (a.type !== 'fold') s.def++
    }
  }
  const overall = (Object.values(stat).reduce((a, s) => a + s.def, 0)) / (Object.values(stat).reduce((a, s) => a + s.n, 0))
  return { overall, byClass: Object.fromEntries(Object.entries(stat).map(([k, v]) => [k, v.def / v.n])) as Record<Cls, number> }
}

describe('turn defense scales with bet size', () => {
  const third = turnDefense(0.33)
  const half = turnDefense(0.5)
  const pot = turnDefense(1.0)
  const over = turnDefense(1.5)

  // Margin is 0.16, not the river test's 0.08: the population here is
  // dominated by hands that fall through to the pre-existing, still-turn-
  // generic weak-made fallback (betToPotRatio < 0.4 / isWithinMDF), which
  // already had some (much shallower) size-sensitivity of its own before
  // this task, so a small margin clears even with the old, size-blind
  // hasStrongHand rule in place — measured (see task-11b-report.md's
  // neutralisation check): old code's own third-vs-pot gap is 0.132, this
  // task's is 0.196. 0.16 sits between them so this fails on the old rule
  // and passes on the new one, instead of passing either way.
  it('defends far more against a third-pot bet than against a pot-sized bet', () => {
    expect(third.overall).toBeGreaterThan(pot.overall + 0.16)
  })

  it('is monotone non-increasing across 0.33, 0.5, 1.0 and 1.5x pot', () => {
    expect(half.overall).toBeLessThanOrEqual(third.overall)
    expect(pot.overall).toBeLessThanOrEqual(half.overall)
    expect(over.overall).toBeLessThanOrEqual(pot.overall)
  })

  // The overall check above is a legitimate shape invariant, but it does not
  // by itself discriminate this task's fix from its absence: the old,
  // size-blind hasStrongHand rule happens to sit inside an overall population
  // that is *already* non-increasing across these four sizes, purely from
  // the weak-made fallback noted above — confirmed by neutralising (see
  // task-11b-report.md). The top-pair class isolates the exact branch this
  // task changes and is a real discriminator: under the old rule, top pair's
  // continue rate is flat-to-wobbly across bet size (it even *rises* from
  // 0.33x to 0.5x, 0.687 -> 0.704, in the measured neutralised state — the
  // old rule has no bet-size term, so this is sampling wobble, not signal),
  // failing the first check below; under this task's rule it is cleanly
  // monotonic.
  it('is monotone non-increasing across 0.33, 0.5, 1.0 and 1.5x pot (top-pair class)', () => {
    expect(half.byClass['top pair']).toBeLessThanOrEqual(third.byClass['top pair'])
    expect(pot.byClass['top pair']).toBeLessThanOrEqual(half.byClass['top pair'])
    expect(over.byClass['top pair']).toBeLessThanOrEqual(pot.byClass['top pair'])
  })

  it('top pair calls a third-pot bet at a high rate and folds meaningfully more to a 1.5x-pot bet', () => {
    expect(third.byClass['top pair']).toBeGreaterThan(0.85)
    expect(over.byClass['top pair']).toBeLessThan(third.byClass['top pair'] - 0.15)
  })

  // Non-interference control, not a feature detector: hasNothing (true air)
  // and hasMonster are both handled by code this task never touches (the
  // monster-raise branch above the block this task changes, and the
  // unconditional "Nothing — mostly fold" tail below it), and neither reads
  // STRAT.turn.*. This is expected — and confirmed, not assumed — to read the
  // same whether the old size-blind rule or this task's rule is in place
  // (see task-11b-report.md's neutralisation check); it guards against a
  // *different* class of bug (this task's code accidentally capturing air or
  // monster hands), not against the turn call-down rule being size-blind.
  //
  // The 'two pair+' half of this check is a loose population bound, not a
  // tight one, because that bucket blends true monsters with board-discounted
  // two-pairs that were never hasMonster to begin with (see
  // postflopHandStrength's board-relative discounts) — verified this bound
  // alone is too loose to catch even a real regression here (deliberately
  // removed the `!hasMonster` guard from the new turn call-down block and
  // reran: third.byClass['two pair+'] only dropped to 0.887, still >0.65,
  // reverted immediately after). The dedicated hand-crafted test right below
  // carries the real weight for "monsters never fold."
  it('air still folds and monsters still continue', () => {
    expect(third.byClass['air']).toBeLessThan(0.10)
    expect(third.byClass['two pair+']).toBeGreaterThan(0.65)
  })

  // Hand-crafted, unambiguous monster (trips, strength 0.70 — no board-trips
  // or paired-board discount applies) facing a large turn bet. A true
  // hasMonster hand never folds anywhere in decidePostflopAction (it either
  // raises in the monster block or falls through to the unconditional
  // `return call` at the end of the hasStrongHand block — both blocks this
  // task's `!hasMonster` guards keep out of reach) — so this must be exactly
  // 0 folds, not just "mostly continues." Discriminates where the population
  // check above cannot: removing the `!hasMonster` guard (same mutation as
  // above) makes this fail outright (any fold at all), because turnMdf
  // compresses at 1.5x pot enough that a wrongly-routed monster's
  // continueProb drops well under 1.0 even at max shield (measured ~0.66,
  // see task-11b-report.md), not just "somewhat lower".
  it('a genuine monster never folds to a large turn bet', () => {
    const hole: [Card, Card] = [{ rank: 13, suit: 'clubs' }, { rank: 13, suit: 'diamonds' }]
    const board: Card[] = [
      { rank: 13, suit: 'hearts' }, { rank: 7, suit: 'spades' }, { rank: 2, suit: 'clubs' }, { rank: 4, suit: 'spades' },
    ]
    const rng = mulberry32(11)
    let folds = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      const a = decideBotAction(profileOf('Solid Sam'), {
        chips: 400 * BB, bb: BB, numActivePlayers: 2, position: 'BB',
        street: 'turn', toCall: 90, pot: 150, currentBet: 90, playerBet: 0,
        holeCards: hole, community: board, checkedThisStreet: true,
        streetHistory: { flop: 'call' }, preflopCallers: 1, rng,
      })
      if (a.type === 'fold') folds++
    }
    expect(folds).toBe(0)
  })

  // Non-interference control, not a feature detector, for the same reason as
  // the air/monster check above: this task deliberately does not touch draws
  // or the overcard credit — a card is still to come on the turn, so both
  // are live equity, not something to fold out (see the brief's "What this
  // task is NOT" section and the classify() docblock above). The hasDraw
  // branch in decidePostflopAction is textually untouched and structurally
  // unreachable from the code this task changes (hasDraw requires
  // !hasStrongHand, and the new turn.strongBase/weakBase branches are gated
  // on hasStrongHand / hasWeakMade, which are mutually exclusive with
  // hasDraw) — confirmed, not assumed, to read the same in both states up to
  // sampling noise (see task-11b-report.md's neutralisation check: the two
  // readings differ by ~0.035, an artifact of the shared-rng population
  // sweep — non-draw hands consume a different number of rng() draws under
  // the two rules, which shifts which cards later hands in the same run
  // happen to be dealt — not a difference in the draw formula itself, which
  // takes no input this task changed).
  //
  // Measured at the pot-sized bet (1.0x), not the third-pot bet third/half
  // use elsewhere in this file: the untouched draw formula's own first line
  // (`betToPotRatio < 0.4` → always call) puts both 0.33x and 0.5x pot at a
  // 100% ceiling regardless of what governs the rest of the draw formula, so
  // a regression that accidentally routed draws through the new turn.* logic
  // could plausibly still read ~100% there too and this test would not catch
  // it. At 1.0x pot the untouched formula falls through to real MDF-mixing
  // and lands at a distinctive, non-ceiling value.
  it('draws still continue at their existing rate — the draw path is untouched', () => {
    expect(pot.byClass['draw']).toBeGreaterThan(0.45)
    expect(pot.byClass['draw']).toBeLessThan(0.75)
  })
})
