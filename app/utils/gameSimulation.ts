/**
 * Shared simulation utilities — used by both the browser simulation
 * (simulateBrowser.ts) and the CLI script (scripts/simulate.ts).
 * Eliminates code duplication between the two.
 */
import type { Card, Suit } from './cards'
import { RANK_DISPLAY, SUIT_SYMBOLS } from './cards'
import type { Rng } from './rng'

/** Format a card for display (e.g., "A♠"). */
export function simDisplayCard(c: Card): string {
  return `${RANK_DISPLAY[c.rank]}${SUIT_SYMBOLS[c.suit]}`
}

/** Fisher-Yates shuffle a fresh 52-card deck. Pass a seeded Rng for determinism. */
export function simShuffleDeck(rng: Rng = Math.random): Card[] {
  const deck: Card[] = []
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  for (const suit of suits) for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/** Find a seat index by position label (e.g., "SB", "BB"). */
export function simFindSeat(positions: string[], label: string): number {
  return positions.findIndex(p => p === label || p.includes(label))
}

export interface TableDynamics {
  dominantPlayerId?: number
  dominantWinRate: number
  myRecentWinRate: number
  avgStackDepth: number
  handsInWindow: number
}

/**
 * Table Flow — who's on a heater, who's running cold, from a rolling window
 * of recent hand winners. One implementation shared by the live engine and
 * both simulators (the copies had drifted to different min-hands gates).
 * Returns undefined until minHands hands are observed.
 */
export function getTableDynamics(
  recentWinnerIds: readonly number[],
  playersChips: readonly number[],
  bb: number,
  botId: number,
  minHands: number,
): TableDynamics | undefined {
  if (recentWinnerIds.length < minHands) return undefined
  const winCounts = new Map<number, number>()
  for (const id of recentWinnerIds) winCounts.set(id, (winCounts.get(id) ?? 0) + 1)
  const total = recentWinnerIds.length
  let dominantId = -1
  let dominantWins = 0
  for (const [id, wins] of winCounts) {
    if (wins > dominantWins) { dominantId = id; dominantWins = wins }
  }
  const avgStack = playersChips.reduce((s, c) => s + c, 0) / Math.max(playersChips.length, 1)
  return {
    dominantPlayerId: dominantId,
    dominantWinRate: dominantWins / total,
    myRecentWinRate: (winCounts.get(botId) ?? 0) / total,
    avgStackDepth: avgStack / bb,
    handsInWindow: total,
  }
}
