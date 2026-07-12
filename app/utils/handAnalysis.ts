/**
 * Hand analysis engine — evaluates 5-card hand strength, detects flush/straight/overcard/set draws,
 * counts deduplicated outs, runs Monte Carlo equity simulations, computes hand improvement
 * probabilities, and generates preflop/postflop action recommendations.
 *
 * Powers the real-time StatsPanel advisor. Works at every street from preflop through river.
 */
import type { Card, Suit } from './cards'
import type { Rng } from './rng'
import { RANK_DISPLAY, SUIT_SYMBOLS } from './cards'

// ─── Hand Rank Constants ───────────────────────────────────────
export const HAND_RANKS = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
} as const

export const HAND_RANK_NAMES: Record<number, string> = {
  0: 'High Card',
  1: 'One Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
}

// ─── Types ─────────────────────────────────────────────────────
export interface HandResult {
  rank: number
  name: string
  score: number[]
  bestFive: Card[]
}

export interface DrawInfo {
  type: string
  outs: number
  cards: number[] // ranks of the out cards
}

export interface HandAnalysis {
  // Current hand
  madeHand: HandResult | null
  handDescription: string

  // Preflop strength
  chenScore: number       // classic chen formula (raw hand strength)
  chenMaxScore: number    // chen+ adjusted for position & playstyle
  preflopTier: 'premium' | 'strong' | 'playable' | 'marginal' | 'trash'
  preflopTierLabel: string

  // Draws and outs
  draws: DrawInfo[]
  totalOuts: number
  probNextCard: number  // % to improve by next card
  probByRiver: number   // % to improve by river (from flop)

  // Equity estimate (Monte Carlo)
  equity: number // 0-100

  // Hand improvement probabilities (% chance of making each hand by river)
  handProbabilities: HandProbability[]

  // Pot odds (placeholder until real betting)
  potOddsNeeded: number

  // Recommendation
  action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE'
  reasoning: string
}

export interface HandProbability {
  rank: number         // 0-8
  name: string         // "One Pair", "Flush", etc.
  current: boolean     // true if hero already has this hand or better
  probability: number  // 0-100, chance of making this hand by river
}

// ─── Chen Formula (preflop hand strength) ──────────────────────
export function chenScore(hole: [Card, Card]): number {
  const [a, b] = hole.map(c => c.rank).sort((x, y) => y - x)
  const suited = hole[0].suit === hole[1].suit

  let score = 0

  // Highest card score
  if (a === 14) score = 10
  else if (a === 13) score = 8
  else if (a === 12) score = 7
  else if (a === 11) score = 6
  else score = a / 2

  // Pair bonus
  if (a === b) {
    score = Math.max(score * 2, 5)
    return Math.ceil(score)
  }

  // Suited bonus
  if (suited) score += 2

  // Gap penalty
  const gap = a - b - 1
  if (gap === 1) score -= 1
  else if (gap === 2) score -= 2
  else if (gap === 3) score -= 4
  else if (gap >= 4) score -= 5

  // Straight potential bonus for connected/gapped low cards
  if (gap <= 1 && a < 12) score += 1

  return Math.max(Math.ceil(score), 0)
}

/**
 * Chen+ — position- and style-adjusted preflop hand strength.
 * Starts with classic chen, then adjusts:
 *   +1 to +3 for late position (CO/BTN play wider profitably)
 *   -1 to -2 for early position under pressure
 *   +1 for suited connectors when playstyle is loose/creative
 *   +1 for high-card hands when playstyle is tight/aggressive
 * Returns a score 0–20+ where higher = stronger in context.
 */
export function chenPlusScore(
  hole: [Card, Card],
  position: string,
  style?: { vpip?: number; aggression?: number; creativeFreq?: number },
): number {
  let score = chenScore(hole)
  const [a, b] = hole.map(c => c.rank).sort((x, y) => y - x)
  const suited = hole[0].suit === hole[1].suit
  const gap = a - b - 1
  const connected = gap <= 1

  // Position adjustment — late position makes hands more valuable
  // Kept moderate since these directly shift the percentile threshold
  const POS_ADJ: Record<string, number> = {
    'BTN': 2, 'D': 2, 'D/BTN': 2, 'D/SB': 1,
    'CO': 1, 'SB': 0, 'BB': 1,
    'MP': 0, 'MP+1': 0,
    'UTG': -1, 'UTG+1': -1,
  }
  score += POS_ADJ[position] ?? 0

  // Style adjustments (when bot/hero profile is available)
  if (style) {
    // Loose/creative players extract more value from suited connectors
    if (suited && connected && (style.vpip ?? 0) > 0.27) score += 1
    if ((style.creativeFreq ?? 0) > 0.08 && suited && gap <= 2) score += 1

    // Tight-aggressive players get more from big-card hands
    if ((style.vpip ?? 0) < 0.22 && (style.aggression ?? 0) > 1.2 && a >= 12) score += 1
  }

  return Math.max(score, 0)
}

export function preflopTier(score: number): { tier: HandAnalysis['preflopTier']; label: string } {
  if (score >= 10) return { tier: 'premium', label: 'Premium' }
  if (score >= 8) return { tier: 'strong', label: 'Strong' }
  if (score >= 6) return { tier: 'playable', label: 'Playable' }
  if (score >= 4) return { tier: 'marginal', label: 'Marginal' }
  return { tier: 'trash', label: 'Trash' }
}

// ─── 5-Card Hand Evaluator ─────────────────────────────────────
function evaluateFive(cards: Card[]): HandResult {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)

  const isFlush = suits.every(s => s === suits[0])

  // Straight detection
  let isStraight = false
  let straightHigh = 0

  // Normal straight
  if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
    isStraight = true
    straightHigh = ranks[0]
  }
  // Wheel: A-2-3-4-5
  if (!isStraight && ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    isStraight = true
    straightHigh = 5
  }

  // Rank frequency
  const freq = new Map<number, number>()
  for (const r of ranks) freq.set(r, (freq.get(r) || 0) + 1)
  const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const pattern = groups.map(g => g[1]).join('')

  // Classify
  if (isStraight && isFlush) {
    const name = straightHigh === 14 ? 'Royal Flush' : `${RANK_DISPLAY[straightHigh]}-high Straight Flush`
    return { rank: 8, name, score: [8, straightHigh], bestFive: cards }
  }
  if (pattern === '41') {
    return { rank: 7, name: `Four ${RANK_DISPLAY[groups[0][0]]}s`, score: [7, groups[0][0], groups[1][0]], bestFive: cards }
  }
  if (pattern === '32') {
    return { rank: 6, name: `${RANK_DISPLAY[groups[0][0]]}s full of ${RANK_DISPLAY[groups[1][0]]}s`, score: [6, groups[0][0], groups[1][0]], bestFive: cards }
  }
  if (isFlush) {
    return { rank: 5, name: `${RANK_DISPLAY[ranks[0]]}-high Flush`, score: [5, ...ranks], bestFive: cards }
  }
  if (isStraight) {
    return { rank: 4, name: `${RANK_DISPLAY[straightHigh]}-high Straight`, score: [4, straightHigh], bestFive: cards }
  }
  if (pattern === '311') {
    const kickers = groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a)
    return { rank: 3, name: `Three ${RANK_DISPLAY[groups[0][0]]}s`, score: [3, groups[0][0], ...kickers], bestFive: cards }
  }
  if (pattern === '221') {
    const pairs = groups.filter(g => g[1] === 2).map(g => g[0]).sort((a, b) => b - a)
    const kicker = groups.find(g => g[1] === 1)![0]
    return { rank: 2, name: `${RANK_DISPLAY[pairs[0]]}s and ${RANK_DISPLAY[pairs[1]]}s`, score: [2, pairs[0], pairs[1], kicker], bestFive: cards }
  }
  if (pattern === '2111') {
    const pairRank = groups[0][0]
    const kickers = groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a)
    return { rank: 1, name: `Pair of ${RANK_DISPLAY[pairRank]}s`, score: [1, pairRank, ...kickers], bestFive: cards }
  }

  // High card
  return { rank: 0, name: `${RANK_DISPLAY[ranks[0]]}-high`, score: [0, ...ranks], bestFive: cards }
}

// ─── Best Hand from N Cards ────────────────────────────────────
function combinations(arr: Card[], k: number): Card[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const result: Card[][] = []
  const [first, ...rest] = arr
  for (const combo of combinations(rest, k - 1)) {
    result.push([first, ...combo])
  }
  result.push(...combinations(rest, k))
  return result
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Reference evaluator — enumerates all C(n,5) 5-card combos and takes the max.
 * O(21) allocations per call, but obviously correct. Retained as the test
 * oracle that the fast bitmask evaluator (below) is proven equivalent to.
 */
export function bestHandOracle(holeCards: Card[], community: Card[]): HandResult | null {
  const all = [...holeCards, ...community]
  if (all.length < 5) return null

  const combos = combinations(all, 5)
  let best: HandResult | null = null
  for (const combo of combos) {
    const result = evaluateFive(combo)
    if (!best || compareScores(result.score, best.score) > 0) {
      best = result
    }
  }
  return best
}

// ─── Fast Bitmask Evaluator ────────────────────────────────────
/**
 * Evaluates 5–7 cards directly via rank/suit bitmasks — no 21-combo
 * enumeration. Produces the SAME category + tiebreak semantics as
 * evaluateFive, so score = [cat, ...tb] is byte-for-byte compatible with the
 * old evaluator (the equivalence is enforced by tests/bitmask-evaluator.test.ts).
 *
 * cat: 0 high card … 8 straight flush. tb: ordered tiebreak ranks.
 */
const SUIT_INDEX: Record<Suit, number> = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 }

function popcount(x: number): number {
  let c = 0
  while (x) { x &= x - 1; c++ }
  return c
}

/** Highest straight in a rank bitmask (bit r set = rank r present). Returns high (5–14) or 0. */
function highestStraight(mask: number): number {
  let m = mask
  if (m & (1 << 14)) m |= (1 << 1) // Ace plays low for the wheel (A-2-3-4-5)
  for (let hi = 14; hi >= 5; hi--) {
    const need = (1 << hi) | (1 << (hi - 1)) | (1 << (hi - 2)) | (1 << (hi - 3)) | (1 << (hi - 4))
    if ((m & need) === need) return hi
  }
  return 0
}

/** Top k ranks present in a bitmask, descending. */
function topRanks(mask: number, k: number): number[] {
  const out: number[] = []
  for (let r = 14; r >= 2 && out.length < k; r--) if (mask & (1 << r)) out.push(r)
  return out
}

/** Top k ranks present in a bitmask, descending, skipping the excluded ranks. */
function topRanksExcluding(mask: number, exclude: number[], k: number): number[] {
  const out: number[] = []
  for (let r = 14; r >= 2 && out.length < k; r--) {
    if (mask & (1 << r) && !exclude.includes(r)) out.push(r)
  }
  return out
}

interface Eval7 { cat: number; tb: number[]; flushSuit: number }

function eval7(cards: Card[]): Eval7 {
  const counts = new Int8Array(15) // counts[rank], rank 2..14
  const suitMask = [0, 0, 0, 0]
  let rankMask = 0
  for (const c of cards) {
    counts[c.rank]++
    suitMask[SUIT_INDEX[c.suit]]! |= (1 << c.rank)
    rankMask |= (1 << c.rank)
  }

  // Flush / straight flush
  let flushSuit = -1
  for (let s = 0; s < 4; s++) {
    if (popcount(suitMask[s]!) >= 5) { flushSuit = s; break }
  }
  if (flushSuit >= 0) {
    const sfHigh = highestStraight(suitMask[flushSuit]!)
    if (sfHigh) return { cat: 8, tb: [sfHigh], flushSuit }
  }

  // Rank multiplicities, highest-first within each group
  const quads: number[] = [], trips: number[] = [], pairs: number[] = []
  for (let r = 14; r >= 2; r--) {
    const n = counts[r]
    if (n === 4) quads.push(r)
    else if (n === 3) trips.push(r)
    else if (n === 2) pairs.push(r)
  }

  if (quads.length) {
    const q = quads[0]!
    return { cat: 7, tb: [q, topRanksExcluding(rankMask, [q], 1)[0]!], flushSuit }
  }

  if (trips.length >= 1 && (pairs.length >= 1 || trips.length >= 2)) {
    const t = trips[0]!
    const pairCand = Math.max(trips.length >= 2 ? trips[1]! : 0, pairs.length ? pairs[0]! : 0)
    return { cat: 6, tb: [t, pairCand], flushSuit }
  }

  if (flushSuit >= 0) {
    return { cat: 5, tb: topRanks(suitMask[flushSuit]!, 5), flushSuit }
  }

  const stHigh = highestStraight(rankMask)
  if (stHigh) return { cat: 4, tb: [stHigh], flushSuit }

  if (trips.length) {
    const t = trips[0]!
    return { cat: 3, tb: [t, ...topRanksExcluding(rankMask, [t], 2)], flushSuit }
  }

  if (pairs.length >= 2) {
    const hi = pairs[0]!, lo = pairs[1]!
    return { cat: 2, tb: [hi, lo, topRanksExcluding(rankMask, [hi, lo], 1)[0]!], flushSuit }
  }

  if (pairs.length === 1) {
    const p = pairs[0]!
    return { cat: 1, tb: [p, ...topRanksExcluding(rankMask, [p], 3)], flushSuit }
  }

  return { cat: 0, tb: topRanks(rankMask, 5), flushSuit }
}

/**
 * Allocation-free hand strength for 5–7 cards, packed into a single integer
 * that is monotonic with poker hand strength (higher = better). Use this in
 * hot loops (equity sims, side-pot resolution) instead of bestHand().score +
 * compareScores — it encodes category + all tiebreaks, so equal ints ⇔ true tie.
 */
export function rank7(cards: Card[]): number {
  const { cat, tb } = eval7(cards)
  let v = cat
  for (let i = 0; i < 5; i++) v = (v << 4) | (tb[i] ?? 0)
  return v
}

/** Just the hand category (0–8) for 5–7 cards. */
export function handCategory7(cards: Card[]): number {
  return eval7(cards).cat
}

function nameFor(cat: number, tb: number[]): string {
  switch (cat) {
    case 8: return tb[0] === 14 ? 'Royal Flush' : `${RANK_DISPLAY[tb[0]!]}-high Straight Flush`
    case 7: return `Four ${RANK_DISPLAY[tb[0]!]}s`
    case 6: return `${RANK_DISPLAY[tb[0]!]}s full of ${RANK_DISPLAY[tb[1]!]}s`
    case 5: return `${RANK_DISPLAY[tb[0]!]}-high Flush`
    case 4: return `${RANK_DISPLAY[tb[0]!]}-high Straight`
    case 3: return `Three ${RANK_DISPLAY[tb[0]!]}s`
    case 2: return `${RANK_DISPLAY[tb[0]!]}s and ${RANK_DISPLAY[tb[1]!]}s`
    case 1: return `Pair of ${RANK_DISPLAY[tb[0]!]}s`
    default: return `${RANK_DISPLAY[tb[0]!]}-high`
  }
}

/** Reconstruct the best five cards for display (bestFive is not used in hot paths). */
function pickBestFive(cards: Card[], cat: number, tb: number[], flushSuit: number): Card[] {
  const pool = [...cards]
  const used: Card[] = []
  const takeRank = (r: number, suitIdx?: number) => {
    const i = pool.findIndex(c => c.rank === r && (suitIdx === undefined || SUIT_INDEX[c.suit] === suitIdx))
    if (i >= 0) used.push(pool.splice(i, 1)[0]!)
  }

  if (cat === 8 || cat === 4) {
    const hi = tb[0]!
    const ranks = hi === 5 ? [5, 4, 3, 2, 14] : [hi, hi - 1, hi - 2, hi - 3, hi - 4]
    for (const r of ranks) takeRank(r, cat === 8 ? flushSuit : undefined)
    return used
  }
  if (cat === 5) {
    return pool.filter(c => SUIT_INDEX[c.suit] === flushSuit).sort((a, b) => b.rank - a.rank).slice(0, 5)
  }

  const spec: Record<number, number[]> = { 7: [4, 1], 6: [3, 2], 3: [3, 1, 1], 2: [2, 2, 1], 1: [2, 1, 1, 1], 0: [1, 1, 1, 1, 1] }
  const need = spec[cat]!
  for (let i = 0; i < need.length; i++) {
    for (let k = 0; k < need[i]!; k++) takeRank(tb[i]!)
  }
  return used
}

/**
 * Best 5-card hand from 5–7 cards. Fast bitmask path; identical rank/name/score
 * contract as the reference evaluator (bestHandOracle).
 */
export function bestHand(holeCards: Card[], community: Card[]): HandResult | null {
  const all = [...holeCards, ...community]
  if (all.length < 5) return null
  const { cat, tb, flushSuit } = eval7(all)
  return {
    rank: cat,
    name: nameFor(cat, tb),
    score: [cat, ...tb],
    bestFive: pickBestFive(all, cat, tb, flushSuit),
  }
}

// ─── Draw Detection ────────────────────────────────────────────
export function detectDraws(holeCards: Card[], community: Card[]): DrawInfo[] {
  if (community.length === 0) return []
  const all = [...holeCards, ...community]
  const draws: DrawInfo[] = []

  // Flush draw
  const suitCounts = new Map<Suit, number>()
  for (const c of all) suitCounts.set(c.suit, (suitCounts.get(c.suit) || 0) + 1)
  for (const [suit, count] of suitCounts) {
    if (count === 4) {
      const held = all.filter(c => c.suit === suit).map(c => c.rank)
      const outs = 13 - count // 9 outs
      draws.push({ type: `${SUIT_SYMBOLS[suit]} Flush draw`, outs, cards: held })
    }
  }

  // Straight draws
  const uniqueRanks = [...new Set(all.map(c => c.rank))].sort((a, b) => a - b)
  // Add low ace for wheel draws
  if (uniqueRanks.includes(14)) uniqueRanks.unshift(1)

  // Check all possible 5-card straight windows
  let bestStraightDraw: { type: string; outs: number; cards: number[] } | null = null
  for (let low = 1; low <= 10; low++) {
    const window = [low, low + 1, low + 2, low + 3, low + 4]
    const have = window.filter(r => uniqueRanks.includes(r) || (r === 1 && uniqueRanks.includes(14)))
    const need = window.filter(r => !uniqueRanks.includes(r) && !(r === 1 && uniqueRanks.includes(14)))

    if (have.length === 4 && need.length === 1) {
      // Open-ended or gutshot?
      // Check if the missing card is at the ends
      const missing = need[0]
      const isOpenEnded = missing === low || missing === low + 4

      // Count actual outs (4 cards of the missing rank, minus any already out)
      const outsCount = 4
      const type = isOpenEnded ? 'Open-ended straight draw' : 'Gutshot straight draw'

      if (!bestStraightDraw || outsCount > bestStraightDraw.outs) {
        bestStraightDraw = { type, outs: outsCount === 4 && isOpenEnded ? 8 : 4, cards: have }
      }
    }
  }

  // Also check for double-gutshot / OESD by looking for 4-in-a-row patterns
  if (!bestStraightDraw) {
    // Check for 3-card runs that could become straights
    for (let i = 0; i < uniqueRanks.length - 2; i++) {
      if (uniqueRanks[i + 2] - uniqueRanks[i] <= 4) {
        const span = uniqueRanks.filter(r => r >= uniqueRanks[i] && r <= uniqueRanks[i] + 4)
        if (span.length === 3) {
          // Backdoor straight draw (only on flop)
          // Not adding — too speculative for display
        }
      }
    }
  }

  if (bestStraightDraw) {
    draws.push(bestStraightDraw)
  }

  // Overcards (preflop-like draws on flop)
  if (community.length >= 3) {
    const boardMax = Math.max(...community.map(c => c.rank))
    const overcards = holeCards.filter(c => c.rank > boardMax)
    if (overcards.length > 0 && all.length <= 6) {
      // Each overcard has ~3 outs (pair up = 3 remaining cards of that rank)
      const outs = overcards.length * 3
      draws.push({
        type: `${overcards.length} overcard${overcards.length > 1 ? 's' : ''}`,
        outs,
        cards: overcards.map(c => c.rank),
      })
    }
  }

  // Set draw (pocket pair to set, or two pair to boat)
  const holeRanks = holeCards.map(c => c.rank)
  const boardRanks = community.map(c => c.rank)

  if (holeRanks[0] === holeRanks[1] && !boardRanks.includes(holeRanks[0])) {
    // Pocket pair, no set yet — 2 outs to hit set
    draws.push({ type: 'Set draw (pocket pair)', outs: 2, cards: [holeRanks[0]] })
  }

  // Two pair → full house outs
  // Count ranks that appear exactly twice across hole + board
  const allRanks = all.map(c => c.rank)
  const rankCounts = new Map<number, number>()
  for (const r of allRanks) rankCounts.set(r, (rankCounts.get(r) || 0) + 1)
  const pairedRanks = [...rankCounts.entries()].filter(([_, count]) => count === 2).map(([rank]) => rank)
  const tripRanks = [...rankCounts.entries()].filter(([_, count]) => count === 3).map(([rank]) => rank)

  // Must use at least one hole card for the pair to count
  const heroPairedRanks = pairedRanks.filter(r => holeRanks.includes(r))

  if (heroPairedRanks.length >= 1 && pairedRanks.length >= 2 && tripRanks.length === 0) {
    // Two pair — each paired rank has 2 remaining cards that make a full house
    let fullHouseOuts = 0
    const outCards: number[] = []
    for (const r of pairedRanks) {
      const remaining = 4 - (rankCounts.get(r) || 0)
      fullHouseOuts += remaining
      outCards.push(r)
    }
    if (fullHouseOuts > 0) {
      draws.push({ type: 'Full house draw', outs: fullHouseOuts, cards: outCards })
    }
  }

  // Trips → quads or full house
  const heroTripRanks = tripRanks.filter(r => holeRanks.includes(r))
  if (heroTripRanks.length > 0) {
    // 1 out to quads (4th card of trip rank)
    const quadsOuts = 1
    // Any board card pairing gives full house
    const nonTripBoardRanks = [...new Set(boardRanks.filter(r => !tripRanks.includes(r)))]
    const fullHouseOuts = nonTripBoardRanks.length * 3 // ~3 remaining cards per rank
    if (quadsOuts + fullHouseOuts > 0) {
      draws.push({ type: 'Quads/full house draw', outs: quadsOuts + Math.min(fullHouseOuts, 6), cards: heroTripRanks })
    }
  }

  // One pair (using a hole card) → trips draw
  if (heroPairedRanks.length === 1 && pairedRanks.length === 1 && tripRanks.length === 0) {
    const r = heroPairedRanks[0]
    const remaining = 4 - (rankCounts.get(r) || 0)
    if (remaining > 0) {
      draws.push({ type: 'Trips draw', outs: remaining, cards: [r] })
    }
  }

  return draws
}

// ─── Deduplicated Outs ─────────────────────────────────────────
export function totalOuts(draws: DrawInfo[]): number {
  // Simple: sum outs but cap overlap between flush + straight draws
  const flushDraw = draws.find(d => d.type.includes('Flush'))
  const straightDraw = draws.find(d => d.type.includes('straight'))

  let total = draws.reduce((sum, d) => sum + d.outs, 0)

  // If both flush and straight draw exist, subtract ~1 for overlap
  if (flushDraw && straightDraw) {
    total = Math.max(total - 1, 0)
  }

  return total
}

// ─── Probability Calculations ──────────────────────────────────
export function probNextCard(outs: number, cardsRemaining: number): number {
  if (cardsRemaining <= 0 || outs <= 0) return 0
  return (outs / cardsRemaining) * 100
}

export function probByRiver(outs: number, cardsRemaining: number): number {
  if (cardsRemaining <= 1 || outs <= 0) return 0
  const miss1 = (cardsRemaining - outs) / cardsRemaining
  const miss2 = (cardsRemaining - 1 - outs) / (cardsRemaining - 1)
  return (1 - miss1 * miss2) * 100
}

// ─── Monte Carlo Runouts (shared hot loop) ─────────────────────
/**
 * One pass of random runouts computing BOTH hero equity vs numOpponents
 * random hands AND the hero hand-category histogram. The deck is built
 * once and only the needed prefix is re-shuffled each iteration (uniform
 * over the drawn cards; far less work than a full Fisher-Yates per
 * iteration). analyzeHand gets equity and improvement probabilities
 * from a single pass instead of two independent simulations.
 */
function runoutStats(
  holeCards: [Card, Card],
  community: Card[],
  numOpponents: number,
  iterations: number,
  rng: Rng,
): { equityPct: number; categoryCounts: number[] } {
  const usedKeys = new Set([
    ...holeCards.map(c => `${c.rank}-${c.suit}`),
    ...community.map(c => `${c.rank}-${c.suit}`),
  ])
  const remaining: Card[] = []
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!usedKeys.has(`${rank}-${suit}`)) remaining.push({ rank, suit })
    }
  }

  const boardNeeded = 5 - community.length
  const cardsNeeded = boardNeeded + 2 * numOpponents
  const categoryCounts = new Array(9).fill(0)
  let wins = 0
  let ties = 0

  // Zero-allocation loop: one reusable 7-card buffer feeds rank7 (a pure
  // reader). Slots 2-6 hold the board; slots 0-1 swap between hero and
  // each opponent's hole cards.
  const seven: Card[] = new Array(7)
  for (let b = 0; b < community.length; b++) seven[b + 2] = community[b]!

  for (let i = 0; i < iterations; i++) {
    // Partial Fisher-Yates: shuffle only the prefix we will draw
    for (let j = 0; j < cardsNeeded && j < remaining.length; j++) {
      const k = j + Math.floor(rng() * (remaining.length - j))
      ;[remaining[j], remaining[k]] = [remaining[k]!, remaining[j]!]
    }

    let idx = 0
    for (let b = community.length; b < 5; b++) seven[b + 2] = remaining[idx++]!

    seven[0] = holeCards[0]
    seven[1] = holeCards[1]
    const heroRank = rank7(seven)
    categoryCounts[handCategory7(seven)]++

    let heroBest = true
    let tied = false
    for (let opp = 0; opp < numOpponents; opp++) {
      seven[0] = remaining[idx++]!
      seven[1] = remaining[idx++]!
      const oppRank = rank7(seven)
      if (oppRank > heroRank) {
        heroBest = false
        break
      }
      if (oppRank === heroRank) tied = true
    }
    if (heroBest && !tied) wins++
    else if (heroBest && tied) ties++
  }

  return { equityPct: ((wins + ties * 0.5) / iterations) * 100, categoryCounts }
}

// ─── Monte Carlo Equity Estimate ───────────────────────────────
export function estimateEquity(
  holeCards: [Card, Card],
  community: Card[],
  numOpponents: number,
  iterations: number = 1000,
  rng: Rng = Math.random,
): number {
  return runoutStats(holeCards, community, numOpponents, iterations, rng).equityPct
}

// ─── Hand Description (contextual) ────────────────────────────
export function describeHand(holeCards: [Card, Card], community: Card[]): string {
  if (community.length === 0) {
    // Preflop: describe the hole cards
    const [a, b] = [...holeCards].sort((x, y) => y.rank - x.rank)
    const paired = a.rank === b.rank
    const suited = a.suit === b.suit

    if (paired) return `Pocket ${RANK_DISPLAY[a.rank]}s`
    return `${RANK_DISPLAY[a.rank]}-${RANK_DISPLAY[b.rank]}${suited ? ' suited' : ' offsuit'}`
  }

  const result = bestHand(holeCards, community)
  if (!result) return 'Unknown'

  // Add context about hole card usage
  const boardRanks = community.map(c => c.rank)
  const holeRanks = holeCards.map(c => c.rank)

  if (result.rank === 1) {
    const pairRank = result.score[1]
    const boardMax = Math.max(...boardRanks)
    if (holeRanks.includes(pairRank)) {
      if (pairRank === boardMax || pairRank > boardMax) return `Top Pair, ${RANK_DISPLAY[result.score[2]]}-kicker`
      if (pairRank > Math.min(...boardRanks)) return `Middle Pair of ${RANK_DISPLAY[pairRank]}s`
      return `Bottom Pair of ${RANK_DISPLAY[pairRank]}s`
    }
    return result.name
  }

  // Two pair — show the kicker
  if (result.rank === 2) {
    // score = [2, highPairRank, lowPairRank, kicker]
    const kicker = result.score[3]
    if (kicker) return `${result.name}, ${RANK_DISPLAY[kicker]}-kicker`
    return result.name
  }

  // Full house — show over what
  if (result.rank === 6) {
    // score = [6, tripsRank, pairRank]
    return `${RANK_DISPLAY[result.score[1]]}s full of ${RANK_DISPLAY[result.score[2]]}s`
  }

  // Flush — show high card
  if (result.rank === 5) {
    return `${RANK_DISPLAY[result.score[1]]}-high Flush`
  }

  // Straight — show high card
  if (result.rank === 4) {
    return `Straight, ${RANK_DISPLAY[result.score[1]]}-high`
  }

  // Trips — show kicker
  if (result.rank === 3) {
    return `Three ${RANK_DISPLAY[result.score[1]]}s, ${RANK_DISPLAY[result.score[2]]}-kicker`
  }

  // Quads, straight flush — just the name
  if (result.rank >= 7) return result.name

  // High card — mention what we have
  const highCard = Math.max(...holeRanks)
  if (highCard === 14) return 'Ace-high'
  if (highCard === 13) return 'King-high'
  return result.name
}

// ─── Action Recommendation ─────────────────────────────────────
export function recommend(
  street: string,
  equity: number,
  draws: DrawInfo[],
  madeHand: HandResult | null,
  chenScoreVal: number,
  position: string,
  facingBet: boolean = true,
): { action: HandAnalysis['action']; reasoning: string } {
  // Helper: if not facing a bet, CALL becomes CHECK
  function maybeCheck(result: { action: HandAnalysis['action']; reasoning: string }) {
    if (!facingBet && result.action === 'CALL') {
      return { action: 'CHECK' as const, reasoning: result.reasoning.replace(/call/gi, 'check') }
    }
    return result
  }
  // Preflop logic
  if (street === 'preflop') {
    const isLate = ['BTN', 'CO', 'D', 'D/SB', 'D/BTN'].includes(position)

    if (chenScoreVal >= 10) {
      return { action: 'RAISE', reasoning: `Premium hand — raise for value from any position.` }
    }
    if (chenScoreVal >= 8) {
      return { action: 'RAISE', reasoning: `Strong hand — open-raise or 3-bet for value.` }
    }
    if (chenScoreVal >= 6) {
      if (isLate) {
        return { action: 'RAISE', reasoning: `Playable hand in late position — raise to steal blinds or see a flop.` }
      }
      return { action: 'CALL', reasoning: `Playable hand but early position — call or fold depending on action.` }
    }
    if (chenScoreVal >= 4) {
      if (isLate) {
        return { action: 'CALL', reasoning: `Marginal hand — only play in late position if cheap. Consider folding to a raise.` }
      }
      return { action: 'FOLD', reasoning: `Marginal hand in early position — fold.` }
    }
    return { action: 'FOLD', reasoning: `Weak hand — fold preflop.` }
  }

  // Postflop logic
  const handRank = madeHand?.rank ?? 0
  // On the river, no more cards to come — draws are irrelevant for recommendations
  const isRiver = street === 'river'
  const hasStrongDraw = !isRiver && draws.some(d => d.outs >= 8)
  const totalDrawOuts = isRiver ? 0 : totalOuts(draws)

  // Very strong hand
  if (equity >= 75) {
    return facingBet
      ? { action: 'RAISE', reasoning: `Very strong hand (${Math.round(equity)}% equity) — raise for value.` }
      : { action: 'RAISE', reasoning: `Very strong hand (${Math.round(equity)}% equity) — bet for value.` }
  }

  // Strong hand
  if (equity >= 55) {
    if (handRank >= 2) {
      return facingBet
        ? { action: 'RAISE', reasoning: `Strong made hand with ${Math.round(equity)}% equity — raise for value and protection.` }
        : { action: 'RAISE', reasoning: `Strong made hand with ${Math.round(equity)}% equity — bet for value and protection.` }
    }
    return facingBet
      ? { action: 'CALL', reasoning: `Decent equity (${Math.round(equity)}%) — call and reevaluate.` }
      : { action: 'CHECK', reasoning: `Decent equity (${Math.round(equity)}%) — check and see the next card.` }
  }

  // Drawing hand with good equity
  if (equity >= 35 || hasStrongDraw) {
    if (totalDrawOuts >= 12) {
      return facingBet
        ? { action: 'RAISE', reasoning: `Monster draw with ${totalDrawOuts} outs (${Math.round(equity)}% equity) — semi-bluff raise.` }
        : { action: 'RAISE', reasoning: `Monster draw with ${totalDrawOuts} outs (${Math.round(equity)}% equity) — semi-bluff bet.` }
    }
    if (facingBet) {
      return { action: 'CALL', reasoning: `${totalDrawOuts > 0 ? `${totalDrawOuts} outs to improve. ` : ''}${Math.round(equity)}% equity — call if pot odds justify.` }
    }
    return { action: 'CHECK', reasoning: `${totalDrawOuts > 0 ? `${totalDrawOuts} outs to improve. ` : ''}Check to see a free card.` }
  }

  // Marginal — depends on whether facing a bet
  if (facingBet) {
    // Facing a bet with weak equity — usually fold
    if (equity < 25) {
      return { action: 'FOLD', reasoning: `Only ${Math.round(equity)}% equity facing a bet${totalDrawOuts > 0 ? ` with ${totalDrawOuts} outs` : ''} — fold.` }
    }
    // Borderline — call only if pot odds are good
    return { action: 'CALL', reasoning: `Marginal hand (${Math.round(equity)}% equity) — calling is borderline. Consider pot odds.` }
  }

  // Not facing a bet — check for free
  if (equity >= 20 && totalDrawOuts >= 4) {
    return { action: 'CHECK', reasoning: `Weak hand but ${totalDrawOuts} outs to improve — check for a free card.` }
  }

  if (handRank === 0 && totalDrawOuts === 0) {
    return isRiver
      ? { action: 'CHECK', reasoning: `No made hand on the river — check and minimize losses.` }
      : { action: 'CHECK', reasoning: `No made hand, no draw — check and hope to improve.` }
  }

  return { action: 'CHECK', reasoning: `Marginal hand (${Math.round(equity)}% equity) — check and minimize losses.` }
}

// ─── Hand Improvement Probabilities (Monte Carlo) ──────────────
/**
 * Simulates random runouts from the current board and counts how
 * often each hand rank is achieved. Returns probabilities for all
 * 9 hand ranks, marking the current rank and anything below it.
 */
export function simulateHandProbabilities(
  holeCards: [Card, Card],
  community: Card[],
  iterations: number = 800,
  rng: Rng = Math.random,
): HandProbability[] {
  const currentResult = community.length >= 3 ? bestHand(holeCards, community) : null
  const currentRank = currentResult?.rank ?? -1

  // If we're at the river or showdown, no simulation needed — it's determined
  if (community.length >= 5) {
    return HAND_RANK_ORDER.map(({ rank, name }) => ({
      rank,
      name,
      current: currentRank >= rank,
      probability: currentRank === rank ? 100 : 0,
    }))
  }

  const { categoryCounts } = runoutStats(holeCards, community, 0, iterations, rng)
  return categoryProbabilities(categoryCounts, iterations, currentRank)
}

function categoryProbabilities(counts: number[], iterations: number, currentRank: number): HandProbability[] {
  return HAND_RANK_ORDER.map(({ rank, name }) => ({
    rank,
    name,
    current: currentRank >= rank,
    probability: Math.round((counts[rank]! / iterations) * 1000) / 10,
  }))
}

const HAND_RANK_ORDER = [
  { rank: 8, name: 'Straight Flush' },
  { rank: 7, name: 'Four of a Kind' },
  { rank: 6, name: 'Full House' },
  { rank: 5, name: 'Flush' },
  { rank: 4, name: 'Straight' },
  { rank: 3, name: 'Three of a Kind' },
  { rank: 2, name: 'Two Pair' },
  { rank: 1, name: 'One Pair' },
  { rank: 0, name: 'High Card' },
]

// ─── Full Analysis ─────────────────────────────────────────────
export function analyzeHand(
  holeCards: [Card, Card],
  community: Card[],
  streetName: string,
  numOpponents: number,
  position: string,
  toCall: number = 0,
  rng: Rng = Math.random,
): HandAnalysis {
  const chen = chenScore(holeCards)
  const chenMax = chenPlusScore(holeCards, position)
  const { tier, label } = preflopTier(chenMax)

  const madeHand = community.length >= 3 ? bestHand(holeCards, community) : null
  const handDesc = describeHand(holeCards, community)
  const draws = detectDraws(holeCards, community)
  const outs = totalOuts(draws)

  // Cards remaining in deck
  const knownCards = 2 + community.length
  const remaining = 52 - knownCards

  const probNext = probNextCard(outs, remaining)
  const probRiver = community.length === 3 ? probByRiver(outs, remaining) : probNext

  // Equity + improvement probabilities from ONE Monte Carlo pass postflop
  // (equity and the category histogram walk the same 1,000 runouts).
  // Preflop keeps the Chen-derived equity; the river is deterministic.
  const currentRank = madeHand?.rank ?? -1
  let equity: number
  let handProbabilities: HandProbability[]
  if (streetName === 'preflop') {
    equity = estimatePreflopEquity(chen, numOpponents)
    const { categoryCounts } = runoutStats(holeCards, community, 0, 800, rng)
    handProbabilities = categoryProbabilities(categoryCounts, 800, currentRank)
  } else if (community.length >= 5) {
    equity = estimateEquity(holeCards, community, numOpponents, 1000, rng)
    handProbabilities = simulateHandProbabilities(holeCards, community, 800, rng)
  } else {
    const stats = runoutStats(holeCards, community, numOpponents, 1000, rng)
    equity = stats.equityPct
    handProbabilities = categoryProbabilities(stats.categoryCounts, 1000, currentRank)
  }

  const { action, reasoning } = recommend(streetName, equity, draws, madeHand, chen, position, toCall > 0)

  return {
    madeHand,
    handDescription: handDesc,
    chenScore: chen,
    chenMaxScore: chenMax,
    preflopTier: tier,
    preflopTierLabel: label,
    draws,
    totalOuts: outs,
    probNextCard: Math.round(probNext * 10) / 10,
    probByRiver: Math.round(probRiver * 10) / 10,
    equity: Math.round(equity * 10) / 10,
    handProbabilities,
    potOddsNeeded: 0, // placeholder until real betting
    action,
    reasoning,
  }
}

/**
 * Preflop equity approximation calibrated against equity calculators.
 * Uses lookup for heads-up, 3-way, and 6-way, with interpolation between.
 * Much more accurate than the old linear formula (e.g., AA 6-way: 49% not 74%).
 */
function estimatePreflopEquity(chen: number, opponents: number): number {
  // [heads-up, 3-way, 6-way] — calibrated against pokerstove/equilab
  let hu: number, three: number, six: number
  if (chen >= 20)     { hu = 85; three = 73; six = 49 }  // AA
  else if (chen >= 16) { hu = 82; three = 69; six = 44 } // KK
  else if (chen >= 14) { hu = 80; three = 66; six = 40 } // QQ, AKs
  else if (chen >= 12) { hu = 77; three = 60; six = 35 } // JJ, AQs
  else if (chen >= 10) { hu = 68; three = 50; six = 28 } // TT, AJs+
  else if (chen >= 8)  { hu = 60; three = 42; six = 22 } // 99, broadways
  else if (chen >= 7)  { hu = 55; three = 38; six = 20 } // 88, suited conn
  else if (chen >= 6)  { hu = 52; three = 35; six = 18 } // 77, suited gap
  else if (chen >= 5)  { hu = 48; three = 32; six = 16 } // small pairs
  else if (chen >= 4)  { hu = 44; three = 28; six = 14 } // marginal
  else if (chen >= 3)  { hu = 40; three = 25; six = 13 } // weak
  else                 { hu = 35; three = 22; six = 12 } // junk

  if (opponents <= 1) return hu
  if (opponents <= 2) return three
  if (opponents >= 5) return six

  // Linear interpolation between 3-way and 6-way
  const t = (opponents - 2) / 3
  return Math.round((three + (six - three) * t) * 10) / 10
}
