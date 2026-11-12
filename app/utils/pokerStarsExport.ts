/**
 * Export hand history in PokerStars cash-game hand-history format
 * (no-limit hold'em, USD).
 *
 * The recorded hand (HandRecord / PlayerHand) holds the app's own play-by-play
 * log — `X calls $N` (chips added), `X raises to $N` / `X goes ALL-IN $N`
 * (the raise-TO total for the street), `--- FLOP: … ---` — and no blind
 * posts. This module replays that log to rebuild what each player put in on
 * each street, and from that writes the lines a PokerStars file has:
 *
 *  - header with currency code, `YYYY/MM/DD HH:MM:SS ET` and a long hand number;
 *  - seats with the stack at the deal; blind posts derived from the positions;
 *  - `Dealt to` for the hero only;
 *  - `bets $X` for an opening bet, `raises $X to $Y` for a raise,
 *    `… and is all-in` on whichever action emptied the stack; a shove over
 *    players who are all all-in already is the call it amounts to;
 *  - `Uncalled bet ($X) returned to …`;
 *  - `*** SHOW DOWN ***` only when two or more players reach it, with hand
 *    descriptions, and one `collected` line per winner per pot
 *    (`from pot` / `from main pot` / `from side pot`);
 *  - a summary that says where each player folded and what the winners held.
 *
 * `players[].chips` is read as the stack at the deal, before blinds.
 * Pots are settled with the game's own side-pot code (utils/sidePots.ts), so
 * the amounts are the ones the table actually paid.
 */
import type { HandRecord, PlayerHand } from '~/composables/useSessionStats'
import type { Card, Suit } from './cards'
import { bestHand } from './handAnalysis'
import { calculateSidePots, awardPots } from './sidePots'

export interface PokerStarsExportOptions {
  /**
   * 'hero' (default) writes `Dealt to` for the hero only, as PokerStars does.
   * 'all' deals every player in — not a conforming file; for a face-up replay.
   */
  dealtTo?: 'hero' | 'all'
}

// ─── Cards ─────────────────────────────────────────────────────────
const SUITS: Record<string, { letter: string; suit: Suit }> = {
  '♠': { letter: 's', suit: 'spades' }, '♥': { letter: 'h', suit: 'hearts' },
  '♦': { letter: 'd', suit: 'diamonds' }, '♣': { letter: 'c', suit: 'clubs' },
  's': { letter: 's', suit: 'spades' }, 'h': { letter: 'h', suit: 'hearts' },
  'd': { letter: 'd', suit: 'diamonds' }, 'c': { letter: 'c', suit: 'clubs' },
}
const RANKS: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

interface PSCard { text: string; card: Card }

/** "A♠", "10♥" or "As", "Th" → PokerStars text plus the Card for evaluation. */
function readCard(raw: string): PSCard | null {
  const s = SUITS[raw.slice(-1)]
  const rankText = raw.slice(0, -1).toUpperCase()
  const rank = RANKS[rankText]
  if (!s || !rank) return null
  return { text: `${rankText === '10' ? 'T' : rankText}${s.letter}`, card: { rank, suit: s.suit } }
}

function readCards(cards: string | null | undefined): PSCard[] {
  if (!cards) return []
  return cards.split(/\s+/).filter(Boolean).map(readCard).filter((c): c is PSCard => c !== null)
}

const cardText = (cards: PSCard[]) => cards.map(c => c.text).join(' ')

// ─── Money ─────────────────────────────────────────────────────────
const cents = (n: number) => Math.round(n * 100) / 100

/** PokerStars amount style: whole dollars bare ($12), cents two-decimal ($12.50). */
function money(n: number): string {
  const v = cents(n)
  return `$${Number.isInteger(v) ? String(v) : v.toFixed(2)}`
}

// ─── Showdown descriptions ─────────────────────────────────────────
const RANK_NAME: Record<number, string> = {
  2: 'Deuce', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
}
const one = (rank: number) => RANK_NAME[rank] ?? '?'
const many = (rank: number) => (rank === 6 ? 'Sixes' : `${one(rank)}s`)

/** The made hand in PokerStars wording: "a pair of Queens", "a flush, Ace high". */
function describeShowdownHand(hole: Card[], board: Card[]): string {
  const result = bestHand(hole, board)
  if (!result) return ''
  const [cat, a = 0, b = 0] = result.score
  // A straight is named low card to high; the wheel runs Ace to Five.
  const run = (high: number) => (high === 5 ? 'Ace to Five' : `${one(high - 4)} to ${one(high)}`)
  switch (cat) {
    case 8: return a === 14 ? 'a Royal Flush' : `a straight flush, ${run(a)}`
    case 7: return `four of a kind, ${many(a)}`
    case 6: return `a full house, ${many(a)} full of ${many(b)}`
    case 5: return `a flush, ${one(a)} high`
    case 4: return `a straight, ${run(a)}`
    case 3: return `three of a kind, ${many(a)}`
    case 2: return `two pair, ${many(a)} and ${many(b)}`
    case 1: return `a pair of ${many(a)}`
    default: return `high card ${one(a)}`
  }
}

// ─── Header pieces ─────────────────────────────────────────────────
/** `2026/11/11 14:03:22` in US Eastern time — the zone PokerStars stamps as ET. */
function easternTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

/**
 * Trackers identify a hand by its number, and the app numbers hands 1, 2, 3…
 * in every session. Prefixing the time the hand was played keeps hands of
 * different sessions apart.
 */
function handId(handNumber: number, playedAt: Date | null, recorded?: unknown): string {
  if (/^\d+$/.test(String(recorded ?? ''))) return String(recorded) // the record brings its own
  if (!playedAt) return String(handNumber)
  return `${Math.floor(playedAt.getTime() / 1000)}${String(handNumber).padStart(4, '0')}`
}

function readDate(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d
}

// ─── Replay of the action log ──────────────────────────────────────
interface Seat {
  p: PlayerHand
  seat: number            // 0-based seat index
  hole: PSCard[]
  recorded: number | null // stack recorded on the hand, if any
  allIn: boolean          // has nothing left to bet
  stackPin: number | null // the stack an all-in proves the player started with
  invested: number        // total put in this hand, net of an uncalled bet returned
  peak: number            // the most the player had in front at any point
  street: number          // put in on the current street
  folded: boolean
  foldStreet: number      // 0 preflop … 3 river
  won: number
}

const STREET_FOLD_TEXT = ['before Flop', 'on the Flop', 'on the Turn', 'on the River']
const ACTION_RE = /^(.+?) (folds|checks|calls|raises to|goes ALL-IN)(?: \$([0-9.]+))?(?: \(timed out\))?$/
const STREET_RE = /^--- (FLOP|TURN|RIVER)\b(?::\s*(.*?))?\s*---$/
const isButtonPosition = (pos: string) => pos === 'BTN' || pos.startsWith('D')
const isSmallBlind = (pos: string) => pos === 'SB' || pos === 'D/SB'

/**
 * Convert a recorded hand to PokerStars hand-history text.
 * Accepts a HandRecord or a stored row (snake_case fields). The stake and the
 * button recorded on the hand win over the arguments when present.
 */
export function toPokerStarsFormat(
  hand: HandRecord | any,
  stakeLevel: { sb: number; bb: number } = { sb: 1, bb: 2 },
  tableName: string = 'Metaincognita',
  options: PokerStarsExportOptions = {},
): string {
  const allPlayers: PlayerHand[] = hand.players || []
  const actions: string[] = hand.actions || []
  const sb: number = typeof hand.sb === 'number' && typeof hand.bb === 'number' ? hand.sb : stakeLevel.sb
  const bb: number = typeof hand.sb === 'number' && typeof hand.bb === 'number' ? hand.bb : stakeLevel.bb
  const handNumber: number = hand.handNumber || hand.hand_number || 1
  const recordedAt = readDate(hand.playedAt ?? hand.played_at)
  const tableSize: number = allPlayers.length || hand.player_count || 6

  // Seats dealt into the hand. A busted seat has neither a position nor cards.
  const seats: Seat[] = allPlayers
    .map((p, i): Seat => ({
      p, seat: p.seatIndex ?? i, hole: readCards(p.holeCards),
      recorded: typeof p.chips === 'number' && p.chips > 0 ? p.chips : null,
      allIn: false, stackPin: null, invested: 0, peak: 0, street: 0, folded: false, foldStreet: 0, won: 0,
    }))
    .filter(s => s.p.position || s.hole.length > 0)
    .sort((x, y) => x.seat - y.seat)
  const byName = new Map(seats.map(s => [s.p.name, s]))

  const buttonSeat: number = typeof hand.buttonSeat === 'number'
    ? hand.buttonSeat
    : (seats.find(s => isButtonPosition(s.p.position))?.seat ?? seats[0]?.seat ?? 0)
  const sbSeat = seats.find(s => isSmallBlind(s.p.position))
  const bbSeat = seats.find(s => s.p.position === 'BB')

  // The cards on the table, by street, from the recorded board; a street
  // marker in the log fills in whatever the board string lacks.
  const board = readCards(hand.board || hand.board_cards)

  const body: string[] = []
  let streetIdx = 0   // 0 preflop, 1 flop, 2 turn, 3 river
  let streetBet = 0   // the bet to match on this street

  const put = (s: Seat, amount: number) => {
    s.invested = cents(s.invested + amount)
    s.street = cents(s.street + amount)
    s.peak = Math.max(s.peak, s.invested)
  }
  /** Did this action leave the player with nothing behind? */
  const isAllIn = (s: Seat) => s.recorded !== null && s.invested >= s.recorded - 0.001
  const goAllIn = (s: Seat) => { s.allIn = true; s.stackPin = s.invested }

  // What nobody matched on the street goes back to the bettor.
  const closeStreet = () => {
    const top = seats.reduce<Seat | null>((best, s) => (!best || s.street > best.street ? s : best), null)
    if (!top || top.folded) return
    const next = Math.max(0, ...seats.filter(s => s !== top).map(s => s.street))
    const uncalled = cents(top.street - next)
    if (uncalled <= 0) return
    top.invested = cents(top.invested - uncalled)
    top.street = next
    body.push(`Uncalled bet (${money(uncalled)}) returned to ${top.p.name}`)
  }

  const openStreet = (idx: number) => {
    closeStreet()
    for (const s of seats) s.street = 0
    streetBet = 0
    streetIdx = idx
    const flop = cardText(board.slice(0, 3))
    if (idx === 1) body.push(`*** FLOP *** [${flop}]`)
    else if (idx === 2) body.push(`*** TURN *** [${flop}] [${cardText(board.slice(3, 4))}]`)
    else body.push(`*** RIVER *** [${cardText(board.slice(0, 4))}] [${cardText(board.slice(4, 5))}]`)
  }

  // Blinds — not in the log; the engine posts them from the positions and
  // sets the bet to a full big blind even when the blind itself is short.
  const postBlind = (s: Seat | undefined, label: string, blind: number) => {
    if (!s) return
    const amount = s.recorded !== null ? Math.min(blind, s.recorded) : blind
    put(s, amount)
    const allIn = isAllIn(s)
    if (allIn) goAllIn(s)
    body.push(`${s.p.name}: posts ${label} ${money(amount)}${allIn ? ' and is all-in' : ''}`)
  }
  postBlind(sbSeat, 'small blind', sb)
  postBlind(bbSeat, 'big blind', bb)
  streetBet = bb

  body.push('*** HOLE CARDS ***')
  for (const s of seats) {
    if (s.hole.length === 2 && (options.dealtTo === 'all' || s.p.isHero)) {
      body.push(`Dealt to ${s.p.name} [${cardText(s.hole)}]`)
    }
  }

  for (const line of actions) {
    const marker = line.match(STREET_RE)
    if (marker) {
      const idx = marker[1] === 'FLOP' ? 1 : marker[1] === 'TURN' ? 2 : 3
      const have = idx === 1 ? 0 : idx + 1 // board cards before this street
      if (board.length < have + (idx === 1 ? 3 : 1)) board.splice(have, board.length, ...readCards(marker[2]))
      openStreet(idx)
      continue
    }
    const m = line.match(ACTION_RE)
    const s = m && byName.get(m[1]!)
    if (!m || !s) continue // deal header, card lines, anything unknown
    const name = s.p.name
    const amount = m[3] ? parseFloat(m[3]) : 0

    if (m[2] === 'folds') {
      s.folded = true
      s.foldStreet = streetIdx
      body.push(`${name}: folds`)
    } else if (m[2] === 'checks' || (m[2] === 'calls' && amount <= 0)) {
      body.push(`${name}: checks`)
    } else if (m[2] === 'calls') {
      put(s, amount)
      const allIn = isAllIn(s)
      if (allIn) goAllIn(s)
      body.push(`${name}: calls ${money(amount)}${allIn ? ' and is all-in' : ''}`)
    } else {
      // "raises to $N" / "goes ALL-IN $N": N is the player's total for the street
      const allIn = m[2] === 'goes ALL-IN'
      const others = seats.filter(o => o !== s)
      const toMatch = Math.max(0, ...others.map(o => o.street))
      if (amount > toMatch && !others.some(o => !o.folded && !o.allIn)) {
        // Everyone left is all-in: the engine lets the player shove over
        // them, but nobody can call the extra, so the action is a call of
        // what the others have in (PokerStars offers nothing else there).
        // The chips held back stay in the stack, which the shove still fixes.
        if (allIn) s.stackPin = cents(s.invested + amount - s.street)
        const added = cents(toMatch - s.street)
        if (added > 0) {
          put(s, added)
          body.push(`${name}: calls ${money(added)}`)
        } else {
          body.push(`${name}: checks`)
        }
        continue
      }
      const added = cents(amount - s.street)
      const suffix = allIn ? ' and is all-in' : ''
      put(s, added)
      if (allIn) goAllIn(s)
      if (amount <= streetBet) {
        // an all-in for less than the bet is a call
        body.push(`${name}: calls ${money(added)}${suffix}`)
      } else if (streetBet === 0) {
        body.push(`${name}: bets ${money(amount)}${suffix}`)
        streetBet = amount
      } else {
        body.push(`${name}: raises ${money(amount - streetBet)} to ${money(amount)}${suffix}`)
        streetBet = amount
      }
    }
  }

  // A player the record marks folded but the log never shows folding
  // (an abandoned hand) is out all the same.
  for (const s of seats) {
    if (s.p.folded && !s.folded) { s.folded = true; s.foldStreet = streetIdx }
  }
  let live = seats.filter(s => !s.folded)
  if (live.length === 0 && seats.length > 0) live = [seats[seats.length - 1]!]
  const showdown = live.length > 1

  // A showdown is always on the river: deal any street the log left out.
  if (showdown) {
    for (let idx = streetIdx + 1; idx <= 3; idx++) {
      if (board.length >= idx + 2) openStreet(idx)
    }
  }
  closeStreet()

  // ─── Pots ────────────────────────────────────────────────────────
  const totalPot = cents(seats.reduce((sum, s) => sum + s.invested, 0))
  const community = board.slice(0, 5).map(c => c.card)
  const canEvaluate = showdown && community.length === 5 && live.some(s => s.hole.length === 2)
  const describe = (s: Seat) => (canEvaluate && s.hole.length === 2
    ? describeShowdownHand(s.hole.map(c => c.card), community) : '')
  // Clockwise from the seat after the button: showdown order
  const clockwise = (list: Seat[]) => [...list].sort((x, y) =>
    ((x.seat - buttonSeat - 1 + 2 * tableSize) % tableSize) - ((y.seat - buttonSeat - 1 + 2 * tableSize) % tableSize))

  interface Pot { amount: number; label: string; winners: { s: Seat; amount: number }[] }
  const pots: Pot[] = []

  if (canEvaluate) {
    const holeOf = (s: Seat) => (s.hole.length === 2 ? [s.hole[0]!.card, s.hole[1]!.card] as [Card, Card] : null)
    const sidePots = calculateSidePots(seats.map(s => ({
      id: s.seat, totalInvested: s.invested, folded: s.folded, holeCards: holeOf(s),
    })))
    // awardPots reads the table size from the list it is given: every seat,
    // dealt in or not, so the odd chip goes where the game sent it.
    const everySeat = Array.from({ length: Math.max(tableSize, ...seats.map(s => s.seat + 1)) }, (_, id) => {
      const s = seats.find(x => x.seat === id)
      return { id, holeCards: s ? holeOf(s) : null }
    })
    sidePots.forEach((pot, i) => {
      const { awards } = awardPots([pot], everySeat, community, buttonSeat)
      const label = sidePots.length === 1 ? 'pot'
        : i === 0 ? 'main pot'
        : sidePots.length === 2 ? 'side pot' : `side pot-${i}`
      pots.push({
        amount: pot.amount, label,
        winners: seats.filter(s => awards.has(s.seat)).map(s => ({ s, amount: awards.get(s.seat)! })),
      })
    })
  } else if (totalPot > 0) {
    // No showdown — or one this record cannot settle (board or cards
    // missing): the pot goes to the last player in, or to whoever the record names.
    let winners = live
    if (showdown) {
      const named = String(hand.winnerName || hand.winner_name || '').replace(/^Split:\s*/, '').split(' & ')
      const byRecord = live.filter(s => named.includes(s.p.name) || (hand.result === 'won' && s.p.isHero))
      winners = byRecord.length > 0 ? byRecord : [live[0]!]
    }
    const share = cents(totalPot / winners.length)
    pots.push({ amount: totalPot, label: 'pot', winners: winners.map(s => ({ s, amount: share })) })
  }
  for (const pot of pots) for (const w of pot.winners) w.s.won = cents(w.s.won + w.amount)

  // ─── Showdown / collection ───────────────────────────────────────
  if (showdown) {
    body.push('*** SHOW DOWN ***')
    for (const s of clockwise(live)) {
      if (s.hole.length !== 2) { body.push(`${s.p.name}: mucks hand`); continue }
      const desc = describe(s)
      body.push(`${s.p.name}: shows [${cardText(s.hole)}]${desc ? ` (${desc})` : ''}`)
    }
  }
  // Side pots are paid before the main pot
  for (const pot of [...pots].reverse()) {
    for (const w of pot.winners) body.push(`${w.s.p.name} collected ${money(w.amount)} from ${pot.label}`)
  }
  if (!showdown && live[0]) body.push(`${live[0].p.name}: doesn't show hand`)

  // ─── Summary ─────────────────────────────────────────────────────
  body.push('*** SUMMARY ***')
  const potBreakdown = pots.length > 1
    ? ` ${pots.map((pot, i) => `${i === 0 ? 'Main pot' : pots.length === 2 ? 'Side pot' : `Side pot-${i}`} ${money(pot.amount)}.`).join(' ')}`
    : ''
  body.push(`Total pot ${money(totalPot)}${potBreakdown} | Rake $0`)
  if (board.length > 0) body.push(`Board [${cardText(board.slice(0, 5))}]`)

  for (const s of seats) {
    const role = `${s.seat === buttonSeat ? ' (button)' : ''}${s === sbSeat ? ' (small blind)' : ''}${s === bbSeat ? ' (big blind)' : ''}`
    let outcome: string
    if (s.folded) {
      outcome = `folded ${STREET_FOLD_TEXT[s.foldStreet]}${s.foldStreet === 0 && s.invested === 0 ? ' (didn\'t bet)' : ''}`
    } else if (!showdown) {
      outcome = `collected (${money(s.won)})`
    } else if (s.hole.length !== 2) {
      outcome = 'mucked'
    } else {
      const desc = describe(s)
      outcome = `showed [${cardText(s.hole)}] and ${s.won > 0 ? `won (${money(s.won)})` : 'lost'}${desc ? ` with ${desc}` : ''}`
    }
    body.push(`Seat ${s.seat + 1}: ${s.p.name}${role} ${outcome}`)
  }

  // ─── Header (last: an all-in fixes what the stack must have been) ─
  const lines: string[] = [
    `PokerStars Hand #${handId(handNumber, recordedAt, hand.handId)}: Hold'em No Limit (${money(sb)}/${money(bb)} USD) - ${easternTime(recordedAt ?? new Date())} ET`,
    `Table '${tableName}' ${tableSize}-max Seat #${buttonSeat + 1} is the button`,
  ]
  for (const s of seats) {
    // What the player put in bounds the stack from below; going all-in pins
    // it exactly. Both hold even for a record whose `chips` is not the stack
    // at the deal (hands stored before that was recorded).
    const stack = s.stackPin ?? Math.max(s.recorded ?? bb * 100, s.peak)
    lines.push(`Seat ${s.seat + 1}: ${s.p.name} (${money(stack)} in chips)`)
  }

  return [...lines, ...body, '', ''].join('\n')
}

/**
 * Export several hands as one PokerStars hand-history file. A hand recorded
 * without its players (an abandoned, timed-out hand) has no seats to write
 * and is left out.
 */
export function exportHandsAsPokerStars(
  hands: (HandRecord | any)[],
  stakeLevel: { sb: number; bb: number } = { sb: 1, bb: 2 },
): string {
  return hands
    .filter(h => Array.isArray(h?.players) && h.players.length >= 2)
    .map(h => toPokerStarsFormat(h, stakeLevel))
    .join('\n')
}
