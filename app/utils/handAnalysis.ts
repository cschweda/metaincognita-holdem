/**
 * Hand analysis engine — evaluates 5-card hand strength, detects flush/straight/overcard/set draws,
 * counts deduplicated outs, runs Monte Carlo equity simulations, computes hand improvement
 * probabilities, and generates preflop/postflop action recommendations.
 *
 * Powers the real-time StatsPanel advisor. Works at every street from preflop through river.
 */
import type { Card, Suit } from './cards'
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
  chenScore: number
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

export function bestHand(holeCards: Card[], community: Card[]): HandResult | null {
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

// ─── Monte Carlo Equity Estimate ───────────────────────────────
export function estimateEquity(
  holeCards: [Card, Card],
  community: Card[],
  numOpponents: number,
  iterations: number = 300,
): number {
  if (community.length === 5) {
    // At showdown, just evaluate directly — no simulation needed
    // But we don't know opponent cards, so still simulate
  }

  const usedKeys = new Set([
    ...holeCards.map(c => `${c.rank}-${c.suit}`),
    ...community.map(c => `${c.rank}-${c.suit}`),
  ])

  // Build remaining deck
  const deck: Card[] = []
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!usedKeys.has(`${rank}-${suit}`)) {
        deck.push({ rank, suit })
      }
    }
  }

  let wins = 0
  let ties = 0

  for (let i = 0; i < iterations; i++) {
    // Shuffle remaining deck (Fisher-Yates on a copy)
    const remaining = [...deck]
    for (let j = remaining.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [remaining[j], remaining[k]] = [remaining[k], remaining[j]]
    }

    let idx = 0

    // Complete the board
    const fullBoard = [...community]
    while (fullBoard.length < 5) {
      fullBoard.push(remaining[idx++])
    }

    // Deal opponent hands
    const heroResult = bestHand(holeCards, fullBoard)
    if (!heroResult) continue

    let heroBest = true
    let tied = false

    for (let opp = 0; opp < numOpponents; opp++) {
      const oppHole: Card[] = [remaining[idx++], remaining[idx++]]
      const oppResult = bestHand(oppHole, fullBoard)
      if (!oppResult) continue

      const cmp = compareScores(heroResult.score, oppResult.score)
      if (cmp < 0) {
        heroBest = false
        break
      }
      if (cmp === 0) tied = true
    }

    if (heroBest && !tied) wins++
    else if (heroBest && tied) ties++
  }

  return ((wins + ties * 0.5) / iterations) * 100
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

  if (result.rank >= 2) return result.name

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
  const hasStrongDraw = draws.some(d => d.outs >= 8)
  const totalDrawOuts = totalOuts(draws)

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
    return { action: 'CHECK', reasoning: `No made hand, no draw — check and hope to improve.` }
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
  iterations: number = 500,
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

  // Build remaining deck
  const usedKeys = new Set([
    ...holeCards.map(c => `${c.rank}-${c.suit}`),
    ...community.map(c => `${c.rank}-${c.suit}`),
  ])
  const deck: Card[] = []
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!usedKeys.has(`${rank}-${suit}`)) deck.push({ rank, suit })
    }
  }

  // Count how many times each rank is the best hand
  const counts = new Array(9).fill(0)
  const cardsNeeded = 5 - community.length

  for (let i = 0; i < iterations; i++) {
    // Shuffle remaining deck (partial Fisher-Yates for just the cards we need)
    const remaining = [...deck]
    for (let j = 0; j < cardsNeeded && j < remaining.length; j++) {
      const k = j + Math.floor(Math.random() * (remaining.length - j));
      [remaining[j], remaining[k]] = [remaining[k], remaining[j]]
    }

    const fullBoard = [...community, ...remaining.slice(0, cardsNeeded)]
    const result = bestHand(holeCards, fullBoard)
    if (result) counts[result.rank]++
  }

  return HAND_RANK_ORDER.map(({ rank, name }) => ({
    rank,
    name,
    current: currentRank >= rank,
    probability: Math.round((counts[rank] / iterations) * 1000) / 10,
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
): HandAnalysis {
  const chen = chenScore(holeCards)
  const { tier, label } = preflopTier(chen)

  const madeHand = community.length >= 3 ? bestHand(holeCards, community) : null
  const handDesc = describeHand(holeCards, community)
  const draws = detectDraws(holeCards, community)
  const outs = totalOuts(draws)

  // Cards remaining in deck
  const knownCards = 2 + community.length
  const remaining = 52 - knownCards

  const probNext = probNextCard(outs, remaining)
  const probRiver = community.length === 3 ? probByRiver(outs, remaining) : probNext

  // Equity (Monte Carlo)
  const equity = streetName === 'preflop'
    ? estimatePreflopEquity(chen, numOpponents)
    : estimateEquity(holeCards, community, numOpponents, 300)

  const { action, reasoning } = recommend(streetName, equity, draws, madeHand, chen, position, toCall > 0)

  // Hand improvement probabilities
  const handProbabilities = simulateHandProbabilities(holeCards, community, 400)

  return {
    madeHand,
    handDescription: handDesc,
    chenScore: chen,
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

// Simple preflop equity approximation from Chen score + opponents
function estimatePreflopEquity(chen: number, opponents: number): number {
  // Rough mapping: Chen 10+ = ~70-85%, Chen 8 = ~55-65%, etc.
  // Adjusted down for more opponents
  const base = Math.min(90, 30 + chen * 5)
  const oppPenalty = (opponents - 1) * 4
  return Math.max(15, base - oppPenalty)
}
