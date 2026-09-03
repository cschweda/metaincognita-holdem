/**
 * Headless bot-vs-bot simulation — no hero, all pros.
 * Generates PokerStars-format hand histories for analysis.
 *
 * Usage:
 *   npx tsx scripts/simulate.ts [numHands] [numPlayers]
 *   npx tsx scripts/simulate.ts 100
 *   npx tsx scripts/simulate.ts 500 8
 *   npx tsx scripts/simulate.ts 1000 6 --seed=42   (deterministic run)
 *
 * Output: scripts/output/sim-<timestamp>.txt
 */
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
import config from '../holdem.config'
import { assignPositions } from '../app/utils/seats'
import { decideBotAction, applyTilt, updateTilt, decayTilt, createTiltState } from '../app/utils/botDecision'
import type { BotProfile, TiltState, BotAction } from '../app/utils/botDecision'
import { bestHand } from '../app/utils/handAnalysis'
import { calculateSidePots, awardPots } from '../app/utils/sidePots'
import { toPokerStarsFormat } from '../app/utils/pokerStarsExport'
import type { Card, Suit } from '../app/utils/cards'
import { RANK_DISPLAY, SUIT_SYMBOLS } from '../app/utils/cards'
import { mulberry32 } from '../app/utils/rng'
import type { Rng } from '../app/utils/rng'
import { shuffle } from '../app/utils/shuffle'
import { getTableDynamics as sharedTableDynamics } from '../app/utils/gameSimulation'
import { startBettingRound, runBettingRound } from '../app/utils/bettingEngine'
import type { BettingRound, EngineAction } from '../app/utils/bettingEngine'
import { createTableReadState, noteTableAction, finishTableHand, readTable } from '../app/utils/tableReads'

// ─── Config ───────────────────────────────────────────────────

const NUM_HANDS = parseInt(process.argv[2] || '100', 10)
const NUM_PLAYERS = Math.min(Math.max(parseInt(process.argv[3] || '6', 10), 2), 8)
const seedArg = process.argv.find(a => a.startsWith('--seed='))
const SEED = seedArg ? parseInt(seedArg.split('=')[1]!, 10) : undefined
const rng: Rng = SEED !== undefined ? mulberry32(SEED) : Math.random
const STAKE = config.stakes.find(s => s.level === 3)! // Medium $1/$2
const BB = STAKE.bb
const SB = STAKE.sb
const STARTING_STACK = BB * 100

// ─── Types ────────────────────────────────────────────────────

interface SimPlayer {
  id: number
  name: string
  chips: number
  holeCards: [Card, Card] | null
  folded: boolean
  eliminated: boolean
  betThisRound: number
  totalInvested: number
  lastAction: string | null
  tilt: TiltState
  tiltMultiplier: number
  profile: BotProfile
  consistency: number
}

interface HandRecord {
  handNumber: number
  players: { name: string; position: string; holeCards: string; folded: boolean; isHero: boolean; chips: number; seatIndex: number }[]
  board: string
  actions: string[]
  potSize: number
  result: string
  profit: number
  winnerName: string
}

// ─── Helpers ──────────────────────────────────────────────────

function displayCard(c: Card): string {
  return `${RANK_DISPLAY[c.rank]}${SUIT_SYMBOLS[c.suit]}`
}

function shuffleDeck(): Card[] {
  const deck: Card[] = []
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit })
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function findSeatByPosition(positions: string[], label: string): number {
  return positions.findIndex(p => p === label || p.includes(label))
}

// ─── Setup Players ────────────────────────────────────────────

// Pick players — filter by --pros flag if present.
// --players="Name1,Name2,..." pins an exact lineup (repeatable comparison runs).
const FICTIONAL = ['Tight Tony', 'Loose Lucy', 'Aggressive Alex', 'Calling Carl', 'Tricky Tina', 'Solid Sam', 'Wild Wendy']
const prosOnly = process.argv.includes('--pros')
const fictionalOnly = process.argv.includes('--fictional')
const playersArg = process.argv.find(a => a.startsWith('--players='))
const pool = prosOnly
  ? config.personas.filter(p => !FICTIONAL.includes(p.name))
  : fictionalOnly
    ? config.personas.filter(p => FICTIONAL.includes(p.name))
    : config.personas
let selectedPersonas: typeof config.personas
if (playersArg) {
  const names = playersArg.slice('--players='.length).split(',').map(s => s.trim())
  selectedPersonas = names.map(n => {
    const p = config.personas.find(per => per.name === n)
    if (!p) { console.error(`Unknown persona: "${n}"`); process.exit(1) }
    return p
  })
} else {
  const shuffledPersonas = shuffle(pool, rng)
  selectedPersonas = shuffledPersonas.slice(0, NUM_PLAYERS)
}

function createPlayers(): SimPlayer[] {
  return selectedPersonas.map((persona, i) => ({
    id: i,
    name: persona.name,
    chips: STARTING_STACK,
    holeCards: null,
    folded: false,
    eliminated: false,
    betThisRound: 0,
    totalInvested: 0,
    lastAction: null,
    tilt: createTiltState(),
    tiltMultiplier: persona.tiltMultiplier ?? 1.0,
    consistency: persona.consistency ?? 0.95,
    profile: {
      vpip: persona.vpip,
      pfr: persona.pfr,
      aggression: persona.aggression,
      bluffFreq: persona.bluffFreq,
      creativeFreq: persona.creativeFreq,
      threeBetFreq: persona.threeBetFreq,
      fourBetFreq: persona.fourBetFreq,
      fiveBetFreq: persona.fiveBetFreq,
      donkBetFreq: persona.donkBetFreq,
      limpFreq: persona.limpFreq,
      styleBias: persona.styleBias,
      betSizeMult: persona.betSizeMult,
      overbetFreq: persona.overbetFreq,
    },
  }))
}

// ─── Simulation ───────────────────────────────────────────────

function simulateHand(
  players: SimPlayer[],
  dealerSeat: number,
  handNumber: number,
): HandRecord {
  const count = players.length
  const positions = assignPositions(count, dealerSeat)
  const deck = shuffleDeck()
  let idx = 0

  // Deal hole cards
  for (const p of players) {
    if (p.eliminated) { p.holeCards = null; continue }
    decayTilt(p.tilt)
    p.holeCards = [deck[idx++], deck[idx++]]
    p.folded = false
    p.betThisRound = 0
    p.totalInvested = 0
    p.lastAction = null
  }

  // Community cards
  idx++ // burn
  const community: Card[] = [deck[idx++], deck[idx++], deck[idx++]]
  idx++ // burn
  community.push(deck[idx++])
  idx++ // burn
  community.push(deck[idx++])

  let pot = 0
  let currentBet = 0
  let lastRaiseIncrement = 0
  let street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' = 'preflop'
  let preflopRaiseLevel = 0
  let preflopRaiserId = -1
  let preflopCallerCount = 0
  const playerStreetActions = new Map<number, { flop?: string; turn?: string }>()
  const actions: string[] = []

  const activePlayers = () => players.filter(p => !p.folded && !p.eliminated)
  const activeWithChips = () => activePlayers().filter(p => p.chips > 0)

  // Log deal
  const playerCards = players.filter(p => !p.eliminated).map(p => {
    const pos = positions[p.id] || ''
    const cards = p.holeCards ? p.holeCards.map(c => displayCard(c)).join(' ') : '??'
    return `  ${p.name} (${pos}): ${cards}`
  })
  actions.push('--- DEAL ---', ...playerCards, '--- PREFLOP ---')

  // Post blinds
  const sbSeat = findSeatByPosition(positions, 'SB')
  const bbSeat = findSeatByPosition(positions, 'BB')

  if (sbSeat >= 0 && !players[sbSeat].eliminated) {
    const p = players[sbSeat]
    const amt = Math.min(SB, p.chips)
    p.chips -= amt
    p.betThisRound = amt
    p.totalInvested += amt
    p.lastAction = 'sb'
    pot += amt
  }
  if (bbSeat >= 0 && !players[bbSeat].eliminated) {
    const p = players[bbSeat]
    const amt = Math.min(BB, p.chips)
    p.chips -= amt
    p.betThisRound = amt
    p.totalInvested += amt
    p.lastAction = 'bb'
    pot += amt
  }
  currentBet = BB
  lastRaiseIncrement = BB

  // ─── Betting Round ──────────────────────────────────────────

  function playBettingRound(startSeat: number) {
    const round: BettingRound = {
      players, currentBet, lastRaiseIncrement, pot, bb: BB,
      needsToAct: new Set<number>(),
    }
    startBettingRound(round)
    runBettingRound(round, startSeat, (ep) => {
      const p = ep as SimPlayer
      const tiltedProfile = applyTilt(p.profile, p.tilt, config.tilt, p.tiltMultiplier)
      const raiseLevel = street === 'preflop' ? preflopRaiseLevel : 0

      // Per-opportunity escalation tracking (HUD-style: opportunities, not hands)
      const bsTrack = street === 'preflop' ? botStats.get(p.name) : undefined
      if (bsTrack && raiseLevel === 1) bsTrack.threeBetOpps++
      if (bsTrack && raiseLevel === 2) bsTrack.vs3BetOpps++

      const action = decideBotAction(
        tiltedProfile,
        {
          street,
          toCall: round.currentBet - p.betThisRound,
          pot: round.pot,
          currentBet: round.currentBet,
          playerBet: p.betThisRound,
          chips: p.chips,
          bb: BB,
          numActivePlayers: activePlayers().length,
          raiseLevel,
          position: positions[p.id] || '',
          holeCards: p.holeCards ?? undefined,
          community: street === 'preflop' ? []
            : street === 'flop' ? community.slice(0, 3)
            : street === 'turn' ? community.slice(0, 4)
            : community,
          wasPreflopRaiser: p.id === preflopRaiserId,
          preflopCallers: preflopCallerCount,
          checkedThisStreet: (playerStreetActions.get(p.id) as any)?.[street] === 'check',
          streetHistory: playerStreetActions.get(p.id) as any,
          tableDynamics: getTableDynamics(p.id),
          tableReads: readTable(tableReadState, config.strategy.tableReads),
          rng,
        },
        p.consistency,
      )

      // Per-opportunity escalation outcomes
      if (bsTrack && raiseLevel === 1 && action.type === 'raise') bsTrack.threeBetsMade++
      if (bsTrack && raiseLevel === 2 && action.type === 'fold') bsTrack.vs3BetFolds++

      return action as EngineAction
    }, (ep, _action, result) => {
      const p = ep as SimPlayer
      if (result.type === 'raise') noteTableAction(tableReadState, 'bet')
      else if (result.type === 'check') noteTableAction(tableReadState, 'check')
      if (result.type === 'fold') {
        p.lastAction = 'fold'
        actions.push(`${p.name} folds`)
      } else if (result.type === 'check') {
        p.lastAction = 'check'
        actions.push(`${p.name} checks`)
      } else if (result.type === 'call') {
        p.lastAction = 'call'
        actions.push(`${p.name} calls $${result.amount}`)
      } else {
        p.lastAction = result.isAllIn ? 'all-in' : 'raise'
        actions.push(result.isAllIn ? `${p.name} goes ALL-IN $${result.amount}` : `${p.name} raises to $${result.amount}`)
        if (street === 'preflop') {
          preflopRaiseLevel++
          preflopRaiserId = p.id
        }
      }

      // Track street actions
      if (street === 'preflop' && result.type === 'call') preflopCallerCount++
      if (street !== 'preflop') {
        const existing = playerStreetActions.get(p.id) || {}
        const key = street as 'flop' | 'turn'
        if (street === 'flop' || street === 'turn') {
          existing[key] = result.type === 'raise' ? (round.currentBet <= 0 ? 'bet' : 'raise') : result.type
          playerStreetActions.set(p.id, existing)
        }
      }
    })
    currentBet = round.currentBet
    pot = round.pot
    lastRaiseIncrement = round.lastRaiseIncrement
  }

  // ─── Play Streets ───────────────────────────────────────────

  // Preflop
  const preflopStart = (bbSeat + 1) % count
  playBettingRound(preflopStart)

  const streets: ('flop' | 'turn' | 'river')[] = ['flop', 'turn', 'river']
  const streetCards = [
    community.slice(0, 3),
    [community[3]],
    [community[4]],
  ]
  const streetNames = ['FLOP', 'TURN', 'RIVER']

  for (let si = 0; si < streets.length; si++) {
    if (activePlayers().length <= 1) break
    if (activeWithChips().length <= 1 && activePlayers().length >= 2) {
      // All-in scenario — just deal remaining streets
      street = streets[si]
      const cards = si === 0
        ? streetCards[0].map(c => displayCard(c)).join(' ')
        : displayCard(streetCards[si][0])
      actions.push(`--- ${streetNames[si]}: ${cards} ---`)
      continue
    }

    street = streets[si]
    const cards = si === 0
      ? streetCards[0].map(c => displayCard(c)).join(' ')
      : displayCard(streetCards[si][0])
    actions.push(`--- ${streetNames[si]}: ${cards} ---`)

    // Reset round bets
    for (const p of players) {
      p.betThisRound = 0
      if (!p.folded) p.lastAction = null
    }
    currentBet = 0
    lastRaiseIncrement = BB
    preflopRaiseLevel = 0

    // Find first active seat after dealer
    let startSeat = (dealerSeat + 1) % count
    for (let i = 0; i < count; i++) {
      const p = players[startSeat]
      if (!p.folded && !p.eliminated && p.chips > 0) break
      startSeat = (startSeat + 1) % count
    }
    playBettingRound(startSeat)
  }

  // ─── Determine Winner ───────────────────────────────────────

  street = 'showdown'
  let winnerId = -1
  let winnerName = ''

  const remaining = activePlayers()
  // Computed once and reused below (board-string construction) instead of
  // re-scanning `actions` a second time for the same substring.
  const reachedFlop = actions.some(a => a.includes('--- FLOP'))
  finishTableHand(tableReadState, { sawFlop: reachedFlop, showdown: remaining.length > 1 }, config.strategy.tableReads.windowHands)
  if (remaining.length === 1) {
    winnerId = remaining[0].id
    winnerName = remaining[0].name
    remaining[0].chips += pot
  } else {
    // Showdown — side pot calculation + hand evaluation
    const contributors = players.filter(p => !p.eliminated).map(p => ({
      id: p.id, totalInvested: p.totalInvested, folded: p.folded, holeCards: p.holeCards,
    }))
    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      players.map(p => ({ id: p.id, holeCards: p.holeCards })),
      community,
      dealerSeat,
    )
    let maxAward = 0
    for (const [pid, amount] of awards) {
      players[pid].chips += amount
      if (amount > maxAward) { maxAward = amount; winnerId = pid; winnerName = players[pid].name }
    }
  }

  // WTSD / W$SD tracking — multi-player showdowns only
  if (remaining.length > 1) {
    for (const p of remaining) {
      const bs = botStats.get(p.name)
      if (!bs) continue
      bs.wtsdCount++
      if (p.id === winnerId) bs.wonAtShowdown++
    }
  }

  // Update table flow window
  if (winnerId >= 0) {
    recentWinners.push(winnerId)
    if (recentWinners.length > TABLE_FLOW_WINDOW) recentWinners.shift()
  }

  // Update tilt — only hands the bot actually played (invested chips or showdown)
  for (const p of players) {
    if (p.eliminated) continue
    const won = p.id === winnerId
    const lostBigPot = !won && !p.folded && pot > STARTING_STACK * config.tilt.bigLossThreshold
    const participated = actions.some(a =>
      a.startsWith(`${p.name} `) && (a.includes('calls') || a.includes('raises') || a.includes('ALL-IN')))
      || (!p.folded && remaining.length > 1)
    updateTilt(p.tilt, won, lostBigPot, config.tilt, p.tiltMultiplier, participated, rng)
  }

  // Eliminate busted players
  for (const p of players) {
    if (p.chips <= 0 && !p.eliminated) {
      p.eliminated = true
    }
  }

  // Build board string (only streets that were reached) — reachedFlop is
  // computed once above, before the table-read hand close.
  const reachedTurn = actions.some(a => a.includes('TURN'))
  const reachedRiver = actions.some(a => a.includes('RIVER'))
  let boardStr = ''
  if (reachedFlop) boardStr = community.slice(0, 3).map(c => displayCard(c)).join(' ')
  if (reachedTurn) boardStr += ' ' + displayCard(community[3])
  if (reachedRiver) boardStr += ' ' + displayCard(community[4])
  boardStr = boardStr.trim()

  return {
    handNumber,
    players: players.map((p, i) => ({
      name: p.name,
      position: positions[i] || '',
      holeCards: p.holeCards ? p.holeCards.map(c => displayCard(c)).join(' ') : '',
      folded: p.folded,
      isHero: false,
      chips: p.chips,
      seatIndex: i,
    })),
    board: boardStr,
    actions,
    potSize: pot,
    result: winnerId >= 0 ? 'won' : 'unknown',
    profit: 0,
    winnerName,
  }
}

// ─── Run ──────────────────────────────────────────────────────

console.log(`\nSimulating ${NUM_HANDS} hands with ${NUM_PLAYERS} players...`)
console.log(`Players: ${selectedPersonas.map(p => p.name).join(', ')}`)
console.log(`Stakes: $${SB}/$${BB}, Starting stack: $${STARTING_STACK}\n`)

const players = createPlayers()
let dealerSeat = 0
const allHands: HandRecord[] = []

// Per-bot stat tracking
interface BotStats {
  handsDealt: number
  vpipCount: number    // entered pot voluntarily
  pfrCount: number     // raised preflop
  threeBetCount: number
  flopsSeen: number
  postflopBets: number // bets/raises postflop
  postflopCalls: number
  postflopFolds: number
  wonCount: number
  rebuys: number
  // Per-opportunity escalation + showdown tracking (HUD-style stats)
  threeBetOpps: number   // times this bot faced exactly one raise preflop
  threeBetsMade: number  // times it re-raised in that spot
  vs3BetOpps: number     // times it faced a 3-bet
  vs3BetFolds: number    // times it folded to the 3-bet
  wtsdCount: number      // went to showdown (after seeing flop)
  wonAtShowdown: number  // won at showdown
  topups: number         // cash-game top-ups (refilled below 40bb without busting)
}

const botStats = new Map<string, BotStats>()
for (const p of selectedPersonas) {
  botStats.set(p.name, {
    handsDealt: 0, vpipCount: 0, pfrCount: 0, threeBetCount: 0,
    flopsSeen: 0, postflopBets: 0, postflopCalls: 0, postflopFolds: 0, wonCount: 0, rebuys: 0,
    threeBetOpps: 0, threeBetsMade: 0, vs3BetOpps: 0, vs3BetFolds: 0, wtsdCount: 0, wonAtShowdown: 0, topups: 0,
  })
}

// Global stats
const stats = {
  totalPots: 0,
  preflopFoldOuts: 0,
  flopsSeen: 0,
  turnsSeen: 0,
  riversSeen: 0,
  showdowns: 0,
  threeBetp: 0,
  allIns: 0,
}

// Table Flow: rolling window of recent winners
const TABLE_FLOW_WINDOW = config.tableFlow?.windowSize ?? 20
const recentWinners: number[] = [] // circular buffer of winner IDs

// Table reads — public table-wide signals over a rolling window (see app/utils/tableReads.ts).
// Module-scope state: this script assumes one run per process (a fresh `tsx`
// invocation each time) — it is never reset, so importing and re-running
// simulateHand repeatedly within one long-lived process would carry a stale
// window across "runs".
const tableReadState = createTableReadState()

function getTableDynamics(playerId: number) {
  return sharedTableDynamics(
    recentWinners,
    players.filter(p => !p.eliminated).map(p => p.chips),
    BB,
    playerId,
    config.tableFlow?.minHands ?? 10,
  )
}

const progressInterval = Math.max(1, Math.floor(NUM_HANDS / 20)) // report ~20 times

for (let h = 1; h <= NUM_HANDS; h++) {
  // Rebuy busted players FIRST — before alive check (fixes heads-up ending after 1 bust)
  // Cash-game behavior: pros also TOP UP short stacks (below 40bb) rather than
  // grinding a sub-25bb stack in push/fold mode forever.
  for (const p of players) {
    if (p.eliminated) {
      p.eliminated = false
      p.chips = STARTING_STACK
      p.tilt = createTiltState()
      const bs = botStats.get(p.name)
      if (bs) bs.rebuys = (bs.rebuys || 0) + 1
    } else if (p.chips < STARTING_STACK * 0.4) {
      const bs = botStats.get(p.name)
      if (bs) bs.topups = (bs.topups || 0) + 1
      p.chips = STARTING_STACK
    }
  }

  const alive = players.filter(p => !p.eliminated)
  if (alive.length < 2) {
    console.log(`  [!] Only ${alive.length} player(s) remaining — stopping at hand ${h - 1}.`)
    break
  }

  const hand = simulateHand(players, dealerSeat, h)
  allHands.push(hand)

  // Per-bot stat collection from hand actions
  const flopIdx = hand.actions.findIndex(a => a.includes('--- FLOP'))
  const preflopActions = flopIdx >= 0 ? hand.actions.slice(0, flopIdx) : hand.actions
  const postflopActions = flopIdx >= 0 ? hand.actions.slice(flopIdx) : []

  for (const p of hand.players) {
    const bs = botStats.get(p.name)
    if (!bs) continue
    if (!p.holeCards) continue // eliminated this hand — wasn't dealt in
    bs.handsDealt++
    if (p.name === hand.winnerName) bs.wonCount++

    // Check preflop actions — match "Name calls" or "Name raises"
    const namePrefix = p.name + ' '
    const playerPreflopActions = preflopActions.filter(a => a.startsWith(namePrefix))
    const raised = playerPreflopActions.some(a => a.includes('raises') || a.includes('ALL-IN'))
    const called = playerPreflopActions.some(a => a.includes('calls'))
    if (raised || called) bs.vpipCount++
    if (raised) bs.pfrCount++

    // 3-bet tracking: count if this player made the 2nd+ raise in preflop
    if (raised) {
      const allPreflopRaises = preflopActions.filter(a => (a.includes('raises to') || a.includes('ALL-IN')) && !a.startsWith('---'))
      const playerFirstRaise = allPreflopRaises.findIndex(a => a.startsWith(namePrefix))
      // If there was already a raise before this player's raise, it's a 3-bet+
      if (playerFirstRaise >= 1) bs.threeBetCount++
    }

    // Saw the flop = flop happened and this player had not folded BEFORE it
    // (p.folded is the end-of-hand flag — using it here would exclude players
    // who folded on later streets and wreck the WTSD denominator)
    const foldedPreflop = playerPreflopActions.some(a => a.includes('folds'))
    if (flopIdx >= 0 && !foldedPreflop) bs.flopsSeen++

    // Postflop actions — AF = (bets + raises) / calls
    const playerPostflop = postflopActions.filter(a => a.startsWith(namePrefix))
    bs.postflopBets += playerPostflop.filter(a => a.includes('raises') || a.includes('ALL-IN') || a.includes('bets')).length
    bs.postflopCalls += playerPostflop.filter(a => a.includes('calls')).length
    bs.postflopFolds += playerPostflop.filter(a => a.includes('folds')).length
  }

  // Global stats
  stats.totalPots += hand.potSize
  if (flopIdx < 0) stats.preflopFoldOuts++
  if (flopIdx >= 0) stats.flopsSeen++
  if (hand.actions.some(a => a.includes('--- TURN'))) stats.turnsSeen++
  if (hand.actions.some(a => a.includes('--- RIVER'))) stats.riversSeen++
  const preflopRaises = preflopActions.filter(a => (a.includes('raises to') || a.includes('ALL-IN')) && !a.startsWith('---'))
  if (preflopRaises.length >= 2) stats.threeBetp++
  if (hand.actions.some(a => a.includes('ALL-IN'))) stats.allIns++
  const nonFolded = hand.players.filter(p => !p.folded)
  if (nonFolded.length >= 2 && flopIdx >= 0) stats.showdowns++

  // Progress
  if (h % progressInterval === 0 || h === NUM_HANDS) {
    const pct = ((h / NUM_HANDS) * 100).toFixed(0)
    const avgPot = (stats.totalPots / h).toFixed(1)
    process.stdout.write(`\r  [${pct}%] Hand ${h}/${NUM_HANDS} — avg pot $${avgPot}, ${stats.flopsSeen} flops, ${stats.threeBetp} 3-bet pots`)
  }

  dealerSeat = (dealerSeat + 1) % players.length
}
console.log() // newline after progress

// ─── Write Output ─────────────────────────────────────────────
// Uses the SAME toPokerStarsFormat() as the live game — no divergence

const outputDir = resolve(__dirname, 'output')
mkdirSync(outputDir, { recursive: true })

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const filename = `sim-${NUM_HANDS}h-${NUM_PLAYERS}p-${timestamp}.txt`
const filepath = resolve(outputDir, filename)

const stakeLevel = { sb: SB, bb: BB }
const output = allHands.map(h => toPokerStarsFormat(h, stakeLevel, 'Bot Simulation')).join('\n')
writeFileSync(filepath, output)

// ─── Print Stats ──────────────────────────────────────────────

const handsPlayed = allHands.length
console.log(`\n=== SIMULATION COMPLETE ===`)
console.log(`Hands played: ${handsPlayed}`)
console.log(`Output: ${filepath}`)
console.log()
console.log(`--- Aggregate Stats ---`)
console.log(`Avg pot size:        $${(stats.totalPots / handsPlayed).toFixed(1)}`)
console.log(`Preflop fold-outs:   ${stats.preflopFoldOuts} (${(stats.preflopFoldOuts / handsPlayed * 100).toFixed(1)}%)`)
console.log(`Flops seen:          ${stats.flopsSeen} (${(stats.flopsSeen / handsPlayed * 100).toFixed(1)}%)`)
console.log(`Turns seen:          ${stats.turnsSeen} (${(stats.turnsSeen / handsPlayed * 100).toFixed(1)}%)`)
console.log(`Rivers seen:         ${stats.riversSeen} (${(stats.riversSeen / handsPlayed * 100).toFixed(1)}%)`)
console.log(`Showdowns:           ${stats.showdowns} (${(stats.showdowns / handsPlayed * 100).toFixed(1)}%)`)
console.log(`3-bet pots:          ${stats.threeBetp} (${(stats.threeBetp / handsPlayed * 100).toFixed(1)}%)`)
console.log(`All-in hands:        ${stats.allIns} (${(stats.allIns / handsPlayed * 100).toFixed(1)}%)`)
console.log()

// Per-player chip counts
console.log(`--- Final Chip Counts ---`)
for (const p of players) {
  const bs = botStats.get(p.name)!
  // Top-up cost ~= 0.75x starting stack each (refill from <40bb); approximate
  const totalInvested = STARTING_STACK + (bs.rebuys * STARTING_STACK) + Math.round(bs.topups * STARTING_STACK * 0.75)
  const netProfit = p.chips - totalInvested
  const extras = [bs.rebuys > 0 ? `${bs.rebuys} rebuys` : '', bs.topups > 0 ? `${bs.topups} topups` : ''].filter(Boolean).join(', ')
  const rebuyStr = extras ? ` [${extras}]` : ''
  console.log(`  ${p.name.padEnd(22)} $${p.chips.toString().padStart(6)}  (${netProfit >= 0 ? '+' : ''}$${netProfit})${rebuyStr}`)
}

// Per-bot behavioral stats vs config
// 3Bet% is PER OPPORTUNITY (faced exactly one raise), matching HUD semantics
// and the configured threeBetFreq. WTSD = showdowns / flops seen.
console.log()
console.log(`--- Per-Bot Stats (Observed vs Config) ---`)
console.log(`${'Name'.padEnd(22)} ${'VPIP'.padStart(7)} ${'(cfg)'.padStart(6)} ${'PFR'.padStart(6)} ${'(cfg)'.padStart(6)} ${'AF'.padStart(5)} ${'Agg'.padStart(5)} ${'3Bet'.padStart(6)} ${'(cfg)'.padStart(6)} ${'v3B-F'.padStart(6)} ${'WTSD'.padStart(6)} ${'W$SD'.padStart(6)} ${'Win%'.padStart(5)}`)
console.log('-'.repeat(112))
for (const persona of selectedPersonas) {
  const bs = botStats.get(persona.name)!
  const obsVpip = bs.handsDealt > 0 ? bs.vpipCount / bs.handsDealt : 0
  const obsPfr = bs.handsDealt > 0 ? bs.pfrCount / bs.handsDealt : 0
  const obsWinRate = bs.handsDealt > 0 ? bs.wonCount / bs.handsDealt : 0
  const obsAF = bs.postflopCalls > 0 ? bs.postflopBets / bs.postflopCalls : 0
  const obs3betOpp = bs.threeBetOpps > 0 ? bs.threeBetsMade / bs.threeBetOpps : 0
  const obsVs3BetFold = bs.vs3BetOpps > 0 ? bs.vs3BetFolds / bs.vs3BetOpps : 0
  const obsWtsd = bs.flopsSeen > 0 ? bs.wtsdCount / bs.flopsSeen : 0
  const obsWsd = bs.wtsdCount > 0 ? bs.wonAtShowdown / bs.wtsdCount : 0

  const vpipFlag = Math.abs(obsVpip - persona.vpip) > 0.05 ? '!' : ' '
  const pfrFlag = Math.abs(obsPfr - persona.pfr) > 0.05 ? '!' : ' '
  const threeBetFlag = persona.threeBetFreq !== undefined && Math.abs(obs3betOpp - persona.threeBetFreq) > 0.03 ? '!' : ' '

  console.log(
    `${persona.name.padEnd(22)}`
    + ` ${(obsVpip * 100).toFixed(1).padStart(5)}%${vpipFlag}`
    + ` ${(persona.vpip * 100).toFixed(0).padStart(4)}%`
    + ` ${(obsPfr * 100).toFixed(1).padStart(4)}%${pfrFlag}`
    + ` ${(persona.pfr * 100).toFixed(0).padStart(4)}%`
    + ` ${obsAF.toFixed(2).padStart(5)}`
    + ` ${persona.aggression.toFixed(2).padStart(5)}`
    + ` ${(obs3betOpp * 100).toFixed(1).padStart(4)}%${threeBetFlag}`
    + ` ${((persona.threeBetFreq ?? 0) * 100).toFixed(0).padStart(4)}%`
    + ` ${(obsVs3BetFold * 100).toFixed(0).padStart(4)}%`
    + ` ${(obsWtsd * 100).toFixed(1).padStart(5)}%`
    + ` ${(obsWsd * 100).toFixed(1).padStart(5)}%`
    + ` ${(obsWinRate * 100).toFixed(1).padStart(4)}%`
  )
}
console.log()
console.log(`(!) = observed VPIP/PFR off by >5pp, or 3-bet/opp off by >3pp, from config`)
console.log(`Reference bands (live full-ring): WTSD 22-32%, W$SD 45-55%, fold-to-3bet 55-75%`)
