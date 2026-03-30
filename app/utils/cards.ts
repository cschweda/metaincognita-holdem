/**
 * Card representation and display utilities.
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

export interface Card {
  rank: number // 2–14 (14 = Ace)
  suit: Suit
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

// Card faces are always white — suit colors must be dark regardless of color mode
export const SUIT_COLORS: Record<Suit, string> = {
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
  clubs: 'text-gray-900',
  spades: 'text-gray-900',
}

export const RANK_DISPLAY: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
}

export function displayCard(card: Card): string {
  return `${RANK_DISPLAY[card.rank]}${SUIT_SYMBOLS[card.suit]}`
}

/**
 * Pip count layouts for number cards (2–10).
 * Each entry is an array of [row, col] positions on a 3×5 grid (col 0-2, row 0-4).
 * Used by the card component to position suit symbols.
 */
export const PIP_LAYOUTS: Record<number, [number, number][]> = {
  2:  [[0, 1], [4, 1]],
  3:  [[0, 1], [2, 1], [4, 1]],
  4:  [[0, 0], [0, 2], [4, 0], [4, 2]],
  5:  [[0, 0], [0, 2], [2, 1], [4, 0], [4, 2]],
  6:  [[0, 0], [0, 2], [2, 0], [2, 2], [4, 0], [4, 2]],
  7:  [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2], [4, 0], [4, 2]],
  8:  [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2], [3, 1], [4, 0], [4, 2]],
  9:  [[0, 0], [0, 2], [1, 0], [1, 2], [2, 1], [3, 0], [3, 2], [4, 0], [4, 2]],
  10: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2], [3, 0], [3, 1], [3, 2], [4, 0], [4, 2]],
}
