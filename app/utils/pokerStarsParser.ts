/**
 * PokerStars hand history parser — inverse of pokerStarsExport.ts.
 * Parses PS-format text into structured data for replay.
 */
import type { Card, Suit } from './cards'

const RANK_MAP: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}
const SUIT_MAP: Record<string, Suit> = {
  s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs',
}

function parseCard(s: string): Card | null {
  s = s.trim()
  if (s.length !== 2) return null
  const rank = RANK_MAP[s[0]]
  const suit = SUIT_MAP[s[1]]
  if (!rank || !suit) return null
  return { rank, suit }
}

function parseCards(str: string): Card[] {
  return str.replace(/[[\]]/g, '').trim().split(/\s+/).map(parseCard).filter((c): c is Card => c !== null)
}

export interface PSPlayer {
  seatNumber: number
  name: string
  chips: number
  holeCards: [Card, Card] | null
  position: string
}

export interface PSAction {
  player: string
  type: 'fold' | 'check' | 'call' | 'raise' | 'bet' | 'all-in' | 'sb' | 'bb'
  amount: number
}

export interface PSStreet {
  name: 'preflop' | 'flop' | 'turn' | 'river'
  newCards: Card[]
  actions: PSAction[]
}

export interface PSHandHistory {
  handId: string
  stakes: { sb: number; bb: number }
  tableName: string
  maxPlayers: number
  buttonSeat: number
  players: PSPlayer[]
  streets: PSStreet[]
  winners: { player: string; amount: number }[]
  board: Card[]
  totalPot: number
}

export interface ParseResult {
  success: boolean
  hand?: PSHandHistory
  error?: string
}

const POSITION_TEMPLATES: Record<number, string[]> = {
  2: ['D/SB', 'BB'],
  3: ['D', 'SB', 'BB'],
  4: ['D', 'SB', 'BB', 'UTG'],
  5: ['D', 'SB', 'BB', 'UTG', 'CO'],
  6: ['D', 'SB', 'BB', 'UTG', 'MP', 'CO'],
  7: ['D', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'CO'],
  8: ['D', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'CO'],
}

export function parsePokerStarsHand(text: string): ParseResult {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length < 3) return { success: false, error: 'Too few lines to be a valid hand history' }

  // Header
  const headerMatch = lines[0].match(/^PokerStars Hand #(\d+):.+?\(\$([0-9.]+)\/\$([0-9.]+)\)/)
  if (!headerMatch) return { success: false, error: 'Missing PokerStars hand header (line 1)' }
  const handId = headerMatch[1]
  const stakes = { sb: parseFloat(headerMatch[2]), bb: parseFloat(headerMatch[3]) }

  // Table
  const tableMatch = lines[1].match(/^Table '(.+?)' (\d+)-max Seat #(\d+) is the button$/)
  if (!tableMatch) return { success: false, error: 'Missing table info (line 2)' }
  const tableName = tableMatch[1]
  const maxPlayers = parseInt(tableMatch[2])
  const buttonSeat = parseInt(tableMatch[3])

  // Seats
  const players: PSPlayer[] = []
  let lineIdx = 2
  while (lineIdx < lines.length) {
    const seatMatch = lines[lineIdx].match(/^Seat (\d+): (.+?) \(\$([0-9.]+) in chips\)$/)
    if (!seatMatch) break
    players.push({
      seatNumber: parseInt(seatMatch[1]),
      name: seatMatch[2],
      chips: parseFloat(seatMatch[3]),
      holeCards: null,
      position: '',
    })
    lineIdx++
  }
  if (players.length < 2) return { success: false, error: 'Need at least 2 players' }

  // Assign positions from button seat
  const template = POSITION_TEMPLATES[players.length] || POSITION_TEMPLATES[Math.min(players.length, 8)]
  if (template) {
    const sorted = [...players].sort((a, b) => a.seatNumber - b.seatNumber)
    const btnIdx = sorted.findIndex(p => p.seatNumber === buttonSeat)
    if (btnIdx >= 0) {
      for (let i = 0; i < sorted.length; i++) {
        const posIdx = (i - btnIdx + sorted.length) % sorted.length
        sorted[i].position = template[posIdx] || ''
      }
    }
  }

  // Parse remaining lines into streets and actions
  const streets: PSStreet[] = []
  let currentStreet: PSStreet | null = null
  const winners: { player: string; amount: number }[] = []
  let inSummary = false
  let totalPot = 0
  const board: Card[] = []

  for (; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]

    // Street markers
    if (line === '*** HOLE CARDS ***') {
      currentStreet = { name: 'preflop', newCards: [], actions: [] }
      streets.push(currentStreet)
      continue
    }
    const flopMatch = line.match(/^\*\*\* FLOP \*\*\* \[(.+?)\]$/)
    if (flopMatch) {
      currentStreet = { name: 'flop', newCards: parseCards(flopMatch[1]), actions: [] }
      streets.push(currentStreet)
      board.push(...currentStreet.newCards)
      continue
    }
    const turnMatch = line.match(/^\*\*\* TURN \*\*\* \[.+?\] \[(.+?)\]$/)
    if (turnMatch) {
      currentStreet = { name: 'turn', newCards: parseCards(turnMatch[1]), actions: [] }
      streets.push(currentStreet)
      board.push(...currentStreet.newCards)
      continue
    }
    const riverMatch = line.match(/^\*\*\* RIVER \*\*\* \[.+?\] \[(.+?)\]$/)
    if (riverMatch) {
      currentStreet = { name: 'river', newCards: parseCards(riverMatch[1]), actions: [] }
      streets.push(currentStreet)
      board.push(...currentStreet.newCards)
      continue
    }
    if (line === '*** SHOW DOWN ***' || line === '*** SUMMARY ***') {
      currentStreet = null
      if (line === '*** SUMMARY ***') inSummary = true
      continue
    }

    // Dealt to
    const dealtMatch = line.match(/^Dealt to (.+?) \[(.+?)\]$/)
    if (dealtMatch) {
      const p = players.find(pl => pl.name === dealtMatch[1])
      const cards = parseCards(dealtMatch[2])
      if (p && cards.length === 2) p.holeCards = cards as [Card, Card]
      continue
    }

    // Shows (showdown)
    const showsMatch = line.match(/^(.+?): shows \[(.+?)\]/)
    if (showsMatch) {
      const p = players.find(pl => pl.name === showsMatch[1])
      const cards = parseCards(showsMatch[2])
      if (p && cards.length === 2 && !p.holeCards) p.holeCards = cards as [Card, Card]
      continue
    }

    // Collected
    const collectedMatch = line.match(/^(.+?) collected \$([0-9.]+) from pot$/)
    if (collectedMatch) {
      winners.push({ player: collectedMatch[1], amount: parseFloat(collectedMatch[2]) })
      continue
    }

    // Summary pot
    const potMatch = line.match(/^Total pot \$([0-9.]+)/)
    if (potMatch) { totalPot = parseFloat(potMatch[1]); continue }

    // Summary board
    const boardMatch = line.match(/^Board \[(.+?)\]$/)
    if (boardMatch && board.length === 0) { board.push(...parseCards(boardMatch[1])); continue }

    // Summary seat cards (fallback for hole cards)
    if (inSummary) {
      const seatCardsMatch = line.match(/^Seat \d+: (.+?) .+?showed \[(.+?)\]/)
      if (seatCardsMatch) {
        const p = players.find(pl => pl.name === seatCardsMatch[1])
        const cards = parseCards(seatCardsMatch[2])
        if (p && cards.length === 2 && !p.holeCards) p.holeCards = cards as [Card, Card]
      }
      continue
    }

    // Blind posts
    const blindMatch = line.match(/^(.+?): posts (?:small|big) blind \$([0-9.]+)$/)
    if (blindMatch) {
      const isSmall = line.includes('small blind')
      if (currentStreet) {
        currentStreet.actions.push({ player: blindMatch[1], type: isSmall ? 'sb' : 'bb', amount: parseFloat(blindMatch[2]) })
      }
      continue
    }

    // Actions
    if (!currentStreet) continue

    if (line.match(/^(.+?): folds$/)) {
      const name = line.match(/^(.+?): folds$/)![1]
      currentStreet.actions.push({ player: name, type: 'fold', amount: 0 })
    } else if (line.match(/^(.+?): checks$/)) {
      const name = line.match(/^(.+?): checks$/)![1]
      currentStreet.actions.push({ player: name, type: 'check', amount: 0 })
    } else if (line.match(/^(.+?): calls \$([0-9.]+)/)) {
      const m = line.match(/^(.+?): calls \$([0-9.]+)/)!
      currentStreet.actions.push({ player: m[1], type: 'call', amount: parseFloat(m[2]) })
    } else if (line.match(/^(.+?): raises to \$([0-9.]+)/)) {
      const m = line.match(/^(.+?): raises to \$([0-9.]+)/)!
      currentStreet.actions.push({ player: m[1], type: 'raise', amount: parseFloat(m[2]) })
    } else if (line.match(/^(.+?): raises \$[0-9.]+ to \$([0-9.]+)/)) {
      const m = line.match(/^(.+?): raises \$[0-9.]+ to \$([0-9.]+)/)!
      currentStreet.actions.push({ player: m[1], type: 'raise', amount: parseFloat(m[2]) })
    } else if (line.match(/^(.+?): bets \$([0-9.]+) and is all-in/)) {
      const m = line.match(/^(.+?): bets \$([0-9.]+) and is all-in/)!
      currentStreet.actions.push({ player: m[1], type: 'all-in', amount: parseFloat(m[2]) })
    } else if (line.match(/^(.+?): bets \$([0-9.]+)/)) {
      const m = line.match(/^(.+?): bets \$([0-9.]+)/)!
      currentStreet.actions.push({ player: m[1], type: 'bet', amount: parseFloat(m[2]) })
    } else if (line.match(/^(.+?) goes ALL-IN \$([0-9.]+)/)) {
      const m = line.match(/^(.+?) goes ALL-IN \$([0-9.]+)/)!
      currentStreet.actions.push({ player: m[1], type: 'all-in', amount: parseFloat(m[2]) })
    }
  }

  if (streets.length === 0) return { success: false, error: 'No betting actions found' }

  return {
    success: true,
    hand: { handId, stakes, tableName, maxPlayers, buttonSeat, players, streets, winners, board, totalPot },
  }
}

/** Parse multiple hands from a single text (split on blank line + header) */
export function parseMultipleHands(text: string): ParseResult[] {
  const hands = text.split(/\n\s*\n(?=PokerStars Hand #)/)
  return hands.filter(h => h.trim().length > 0).map(h => parsePokerStarsHand(h.trim()))
}
