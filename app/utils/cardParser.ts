/**
 * Card parsing utilities — converts display-format card strings
 * (e.g., "A♠", "K♥", "10♦") back into Card objects.
 * Used by replay.vue and anywhere else that needs to parse
 * displayCard() output.
 */
import type { Card, Suit } from './cards'

const RANK_PARSE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

const SUIT_PARSE: Record<string, Suit> = {
  '\u2665': 'hearts', '\u2666': 'diamonds',
  '\u2663': 'clubs', '\u2660': 'spades',
}

/** Parse a single display-format card string (e.g., "A♠") into a Card. */
export function parseDisplayCard(str: string): Card | null {
  str = str.trim()
  if (str.length < 2) return null
  const suitChar = str[str.length - 1]
  const rankStr = str.slice(0, -1)
  const rank = RANK_PARSE[rankStr]
  const suit = SUIT_PARSE[suitChar]
  if (!rank || !suit) return null
  return { rank, suit }
}

/** Parse a space-separated string of display cards into an array. */
export function parseDisplayCards(str: string): Card[] {
  if (!str) return []
  return str.split(' ').map(s => parseDisplayCard(s)).filter((c): c is Card => c !== null)
}

/** Parse a hole cards string (e.g., "A♠ K♥") into a [Card, Card] tuple. */
export function parseDisplayHoleCards(str: string): [Card, Card] | null {
  const cards = parseDisplayCards(str)
  if (cards.length < 2) return null
  return [cards[0], cards[1]]
}
