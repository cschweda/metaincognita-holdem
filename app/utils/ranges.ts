/**
 * Preflop hand ranges by position (RFI) and by action (3-bet, 4-bet, 5-bet).
 *
 * Provides the ranked list of all 169 starting hands, position-based opening
 * percentages, and escalation ranges. Used by StatsPanel to display relevant
 * ranges for the hero's current position and street.
 *
 * Format: "AKs" = Ace-King suited, "AKo" = offsuit, "AA" = pair.
 * Percentages approximate standard 6-max NL Hold'em cash game ranges.
 */

// All 169 distinct starting hands, ranked roughly by expected value.
// This is a standard hand ranking used by most poker training sites.
const ALL_HANDS = [
  'AA', 'KK', 'QQ', 'JJ', 'AKs',
  'TT', 'AQs', 'AKo', 'AJs', 'KQs',
  '99', 'ATs', 'AQo', 'KJs', 'QJs',
  'KTs', '88', 'AJo', 'QTs', 'A9s',
  'JTs', 'KQo', '77', 'A8s', 'K9s',
  'ATo', 'Q9s', 'J9s', 'T9s', 'A7s',
  'KJo', '66', 'A5s', 'A6s', 'QJo',
  'K8s', 'A4s', 'T8s', 'A3s', 'J8s',
  '98s', 'KTo', '55', 'A9o', 'Q8s',
  'K7s', 'A2s', 'JTo', '87s', 'QTo',
  'K6s', '44', 'T7s', '97s', 'A8o',
  'K5s', 'J7s', '76s', 'Q7s', 'A7o',
  '33', 'K9o', 'A5o', 'K4s', '86s',
  'A6o', 'Q9o', 'T9o', '96s', '65s',
  'K3s', 'J9o', 'A4o', '22', 'T6s',
  '75s', 'K2s', 'Q6s', 'A3o', '85s',
  'J6s', '54s', 'Q5s', 'A2o', 'K8o',
  '64s', 'T8o', '98o', 'Q4s', 'J5s',
  '87o', 'Q3s', '95s', '74s', 'K7o',
  'J8o', 'Q2s', 'T5s', '53s', 'J4s',
  '84s', '97o', 'K6o', '76o', 'J3s',
  'T4s', '63s', 'T7o', '94s', '93s', 'J2s',
  '43s', 'K5o', '86o', 'T3s', '73s',
  '65o', 'Q8o', '96o', '52s', 'T2s',
  'K4o', '92s', '83s', 'Q7o', '42s',
  '75o', '54o', 'K3o', '82s', 'J7o',
  '62s', 'Q6o', '32s', '72s', '85o',
  'K2o', 'T6o', 'Q5o', 'J6o', '64o',
  'Q4o', '95o', '53o', 'J5o', 'Q3o',
  '74o', 'T5o', 'J4o', 'Q2o', '84o',
  '43o', 'J3o', 'T4o', '94o', '93o', '63o',
  'J2o', 'T3o', '73o', '52o', 'T2o',
  '92o', '42o', '83o', '62o', '82o',
  '32o', '72o',
]

export { ALL_HANDS }

import type { Card } from './cards'

const RANK_CHARS: Record<number, string> = {
  14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T',
  9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2',
}

/**
 * Convert [Card, Card] hole cards to 169-hand notation (e.g., "AKs", "77", "T9o").
 */
export function holeCardsToNotation(hole: [Card, Card]): string {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank)
  const high = RANK_CHARS[a.rank]
  const low = RANK_CHARS[b.rank]
  if (a.rank === b.rank) return `${high}${low}`
  return `${high}${low}${a.suit === b.suit ? 's' : 'o'}`
}

/**
 * Get the hand's rank index in ALL_HANDS (0 = best, 168 = worst).
 * Returns -1 if not found (shouldn't happen with a standard deck).
 */
export function handRankIndex(hole: [Card, Card]): number {
  return ALL_HANDS.indexOf(holeCardsToNotation(hole))
}

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
  return idx < 0 ? 1 : HAND_PERCENTILE[idx]!
}

export type HandCategory = 'pair' | 'suitedAce' | 'suitedConnector' | 'bigCard' | 'other'

const RANK_VALS: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 }

/**
 * Categorize a hand in 169-notation for per-persona range shaping.
 * Mutually exclusive, priority: pair > suitedAce > suitedConnector > bigCard > other.
 */
export function handCategory(notation: string): HandCategory {
  if (notation.length === 2) return 'pair'
  const hi = RANK_VALS[notation[0]!]!
  const lo = RANK_VALS[notation[1]!]!
  const suited = notation.endsWith('s')
  if (suited && hi === 14) return 'suitedAce'
  if (suited && hi <= 12 && hi - lo <= 2) return 'suitedConnector'
  if (hi >= 11 && lo >= 10) return 'bigCard'
  return 'other'
}

export interface RangeInfo {
  position: string
  action: string
  percentage: number
  hands: string[]
  description: string
}

/**
 * Position-based opening ranges (RFI — raise first in).
 * Percentages and hands reflect standard 6-max NL Hold'em.
 */
const OPEN_RANGES: Record<string, { pct: number; desc: string }> = {
  'UTG':    { pct: 15, desc: 'Very tight — only premium and strong hands' },
  'UTG+1':  { pct: 17, desc: 'Slightly wider than UTG, still mostly premiums' },
  'MP':     { pct: 22, desc: 'Adding suited broadways and medium pairs' },
  'MP+1':   { pct: 22, desc: 'Similar to MP — suited broadways and medium pairs' },
  'CO':     { pct: 30, desc: 'Wide — suited connectors, more offsuit broadways' },
  'BTN':    { pct: 42, desc: 'Widest open — suited gappers, weak suited aces, most broadways' },
  'D':      { pct: 42, desc: 'Widest open — suited gappers, weak suited aces, most broadways' },
  'D/BTN':  { pct: 42, desc: 'Widest open — suited gappers, weak suited aces, most broadways' },
  'D/SB':   { pct: 42, desc: 'Heads-up dealer — wide opening range' },
  'SB':     { pct: 36, desc: 'Wide but out of position — strong hands + some steals' },
  'BB':     { pct: 40, desc: 'Defending range vs steal — wide calling range' },
}

/**
 * Action-based ranges (how the range narrows when facing aggression).
 */
const ACTION_RANGES: Record<string, { pct: number; desc: string }> = {
  'open':      { pct: -1, desc: 'Position-dependent opening range' }, // use position range
  '3-bet':     { pct: 8,  desc: 'Value: QQ+, AKs. Bluffs: A5s-A2s type blockers' },
  'call-3bet': { pct: 12, desc: 'Suited broadways, TT-JJ, AQo — hands too strong to fold but not 4-bet' },
  '4-bet':     { pct: 3.5, desc: 'KK+, AKs for value. Rare bluffs with suited aces' },
  'call-4bet': { pct: 5,  desc: 'QQ, AKo, JJ — calling but not 5-betting' },
  '5-bet':     { pct: 1.5, desc: 'Almost always AA/KK. Very rare bluff' },
}

function getHandsForPercentage(pct: number): string[] {
  const count = Math.round((pct / 100) * ALL_HANDS.length)
  return ALL_HANDS.slice(0, Math.min(count, ALL_HANDS.length))
}

/**
 * Returns the opening range for a position.
 */
export function getOpenRange(position: string): RangeInfo {
  const info = OPEN_RANGES[position] || OPEN_RANGES['MP']
  const hands = getHandsForPercentage(info.pct)
  return {
    position,
    action: 'Open raise',
    percentage: info.pct,
    hands,
    description: info.desc,
  }
}

/**
 * Returns a range for a specific action (3-bet, 4-bet, etc.)
 */
export function getActionRange(action: string): RangeInfo {
  const info = ACTION_RANGES[action] || ACTION_RANGES['open']
  if (info.pct < 0) {
    return { position: '', action, percentage: 0, hands: [], description: info.desc }
  }
  const hands = getHandsForPercentage(info.pct)
  return {
    position: '',
    action: formatActionLabel(action),
    percentage: info.pct,
    hands,
    description: info.desc,
  }
}

function formatActionLabel(action: string): string {
  switch (action) {
    case '3-bet': return '3-Bet'
    case 'call-3bet': return 'Call vs 3-Bet'
    case '4-bet': return '4-Bet'
    case 'call-4bet': return 'Call vs 4-Bet'
    case '5-bet': return '5-Bet'
    default: return action
  }
}

/**
 * Returns all relevant ranges for a given position and street context.
 */
export function getRelevantRanges(position: string, street: string): RangeInfo[] {
  const ranges: RangeInfo[] = []

  if (street === 'preflop') {
    // Always show the position's opening range
    ranges.push(getOpenRange(position))

    // Show escalation ranges for context
    ranges.push(getActionRange('3-bet'))
    ranges.push(getActionRange('4-bet'))
  }

  return ranges
}

/**
 * Categorizes a hand list into pairs, suited, and offsuit groups.
 */
export function categorizeHands(hands: string[]): { pairs: string[]; suited: string[]; offsuit: string[] } {
  return {
    pairs: hands.filter(h => h.length === 2), // AA, KK, etc.
    suited: hands.filter(h => h.endsWith('s')),
    offsuit: hands.filter(h => h.endsWith('o')),
  }
}
