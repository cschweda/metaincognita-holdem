/**
 * Export hand history in PokerStars hand history text format.
 * Converts internal HandRecord/PlayerHand data (display cards like "A♠")
 * to PokerStars notation ("[As]") with proper street markers, blinds, and showdown.
 * Compatible with PokerTracker, Hold'em Manager, Equilab, and most poker analysis tools.
 */
import type { HandRecord, PlayerHand } from '~/composables/useSessionStats'

// Convert display card "A♠" to PokerStars notation "[As]"
function toPS(card: string): string {
  const suitMap: Record<string, string> = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' }
  // card is like "A♠" or "10♥"
  let rank = ''
  let suit = ''
  for (const [symbol, letter] of Object.entries(suitMap)) {
    if (card.includes(symbol)) {
      suit = letter
      rank = card.replace(symbol, '').trim()
      break
    }
  }
  if (rank === '10') rank = 'T'
  return `${rank}${suit}`
}

function cardsToPS(cards: string): string {
  if (!cards) return ''
  return cards.split(' ').filter(Boolean).map(toPS).join(' ')
}

function boardToPS(board: string): string {
  if (!board) return ''
  return board.split(' ').filter(Boolean).map(toPS).join(' ')
}

// Find the button seat from position data
function findButtonSeat(players: PlayerHand[]): number {
  const btn = players.find(p =>
    p.position === 'BTN' || p.position === 'D' || p.position === 'D/BTN' || p.position === 'D/SB'
  )
  return btn?.seatIndex ?? 0
}

// Map position to PokerStars-style description
function seatDescription(position: string, isButton: boolean): string {
  if (isButton) return '(button)'
  if (position === 'SB' || position === 'D/SB') return '(small blind)'
  if (position === 'BB') return '(big blind)'
  return ''
}

/**
 * Convert a HandRecord to PokerStars hand history format.
 */
export function toPokerStarsFormat(
  hand: HandRecord | any,
  stakeLevel: { sb: number; bb: number } = { sb: 1, bb: 2 },
  tableName: string = 'Holdem Simulator',
): string {
  const players: PlayerHand[] = hand.players || []
  const actions: string[] = hand.actions || []
  const board = hand.board || hand.board_cards || ''
  const boardCards = board.split(' ').filter(Boolean)
  const handId = hand.handNumber || hand.hand_number || 1
  const playedAt = hand.played_at ? new Date(hand.played_at) : new Date()
  const playerCount = players.length || hand.player_count || 6
  const buttonSeat = findButtonSeat(players)

  const dateStr = playedAt.toISOString().replace('T', ' ').replace(/\.\d+Z/, ' ET')

  const lines: string[] = []

  // Header
  lines.push(`PokerStars Hand #${handId}: Hold'em No Limit ($${stakeLevel.sb}/$${stakeLevel.bb}) - ${dateStr}`)
  lines.push(`Table '${tableName}' ${playerCount}-max Seat #${buttonSeat + 1} is the button`)

  // Seat list
  for (const p of players) {
    const seat = (p.seatIndex ?? 0) + 1
    const chips = p.chips || 200
    lines.push(`Seat ${seat}: ${p.name} ($${chips} in chips)`)
  }

  // Blinds
  const sbPlayer = players.find(p => p.position === 'SB' || p.position === 'D/SB')
  const bbPlayer = players.find(p => p.position === 'BB')
  if (sbPlayer) lines.push(`${sbPlayer.name}: posts small blind $${stakeLevel.sb}`)
  if (bbPlayer) lines.push(`${bbPlayer.name}: posts big blind $${stakeLevel.bb}`)

  // Hole cards — always show all players' cards when available
  // (needed for replay viewer to display all hands face-up)
  lines.push('*** HOLE CARDS ***')
  for (const p of players) {
    if (p.holeCards) lines.push(`Dealt to ${p.name} [${cardsToPS(p.holeCards)}]`)
  }

  // Parse actions into streets
  let currentStreet = 'preflop'
  const flopCards = boardCards.slice(0, 3)
  const turnCard = boardCards[3]
  const riverCard = boardCards[4]

  for (const action of actions) {
    // Street markers
    if (action.includes('--- FLOP:') || action.includes('--- FLOP ---')) {
      lines.push(`*** FLOP *** [${flopCards.map(toPS).join(' ')}]`)
      currentStreet = 'flop'
      continue
    }
    if (action.includes('--- TURN:') || action.includes('--- TURN ---')) {
      lines.push(`*** TURN *** [${flopCards.map(toPS).join(' ')}] [${turnCard ? toPS(turnCard) : ''}]`)
      currentStreet = 'turn'
      continue
    }
    if (action.includes('--- RIVER:') || action.includes('--- RIVER ---')) {
      lines.push(`*** RIVER *** [${flopCards.map(toPS).join(' ')} ${turnCard ? toPS(turnCard) : ''}] [${riverCard ? toPS(riverCard) : ''}]`)
      currentStreet = 'river'
      continue
    }
    // Skip deal header and player card lines
    if (action.includes('--- DEAL ---') || action.includes('--- PREFLOP ---')) continue
    if (action.trim().startsWith('  ') && action.includes(':')) continue // player card lines

    // Convert action format: "Hero raises to $8" → "Hero: raises $6 to $8"
    const foldMatch = action.match(/^(.+?) folds$/)
    if (foldMatch) { lines.push(`${foldMatch[1]}: folds`); continue }

    const checkMatch = action.match(/^(.+?) checks$/)
    if (checkMatch) { lines.push(`${checkMatch[1]}: checks`); continue }

    const callMatch = action.match(/^(.+?) calls \$(\d+)$/)
    if (callMatch) { lines.push(`${callMatch[1]}: calls $${callMatch[2]}`); continue }

    const raiseMatch = action.match(/^(.+?) raises to \$(\d+)$/)
    if (raiseMatch) { lines.push(`${raiseMatch[1]}: raises to $${raiseMatch[2]}`); continue }

    const allInMatch = action.match(/^(.+?) goes ALL-IN \$(\d+)$/)
    if (allInMatch) { lines.push(`${allInMatch[1]}: bets $${allInMatch[2]} and is all-in`); continue }
  }

  // Showdown
  lines.push('*** SHOW DOWN ***')
  // Determine winner: explicit winnerName, hero won, or last non-folded player
  const heroPlayer = players.find(p => p.isHero)
  let winner = hand.winnerName || hand.winner_name || ''
  if (!winner && hand.result === 'won') winner = heroPlayer?.name || 'Hero'
  if (!winner) {
    const nonFolded = players.filter(p => !p.folded)
    if (nonFolded.length === 1) winner = nonFolded[0].name
  }
  for (const p of players) {
    if (!p.folded && p.holeCards) {
      const isWinner = p.name === winner || (hand.result === 'won' && p.isHero)
      lines.push(`${p.name}: shows [${cardsToPS(p.holeCards)}]`)
    }
  }
  if (winner) {
    lines.push(`${winner} collected $${hand.potSize || hand.pot_size || 0} from pot`)
  }

  // Summary
  lines.push('*** SUMMARY ***')
  lines.push(`Total pot $${hand.potSize || hand.pot_size || 0} | Rake $0`)
  if (boardCards.length > 0) {
    lines.push(`Board [${boardCards.map(toPS).join(' ')}]`)
  }

  for (const p of players) {
    const seat = (p.seatIndex ?? 0) + 1
    const posDesc = seatDescription(p.position, (p.seatIndex ?? 0) === buttonSeat)
    if (p.folded) {
      lines.push(`Seat ${seat}: ${p.name} ${posDesc} folded`)
    } else if (p.holeCards) {
      const isWinner = p.name === winner || (hand.result === 'won' && p.isHero)
      if (isWinner) {
        lines.push(`Seat ${seat}: ${p.name} ${posDesc} showed [${cardsToPS(p.holeCards)}] and won ($${hand.potSize || hand.pot_size || 0})`)
      } else {
        lines.push(`Seat ${seat}: ${p.name} ${posDesc} showed [${cardsToPS(p.holeCards)}] and lost`)
      }
    }
  }

  lines.push('')
  lines.push('')

  return lines.join('\n')
}

/**
 * Export multiple hands in PokerStars format (concatenated).
 */
export function exportHandsAsPokerStars(
  hands: (HandRecord | any)[],
  stakeLevel: { sb: number; bb: number } = { sb: 1, bb: 2 },
): string {
  return hands.map(h => toPokerStarsFormat(h, stakeLevel)).join('\n')
}
