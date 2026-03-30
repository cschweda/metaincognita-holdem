/**
 * Headless bot-vs-bot simulation — no hero, all pros.
 * Generates PokerStars-format hand histories for analysis.
 *
 * Usage:
 *   npx tsx scripts/simulate.ts [numHands] [numPlayers]
 *   npx tsx scripts/simulate.ts 100
 *   npx tsx scripts/simulate.ts 500 8
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

// ─── Config ───────────────────────────────────────────────────

const NUM_HANDS = parseInt(process.argv[2] || '100', 10)
const NUM_PLAYERS = Math.min(Math.max(parseInt(process.argv[3] || '6', 10), 2), 8)
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
    const j = Math.floor(Math.random() * (i + 1));
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

// Pick players — filter by --pros flag if present
const FICTIONAL = ['Tight Tony', 'Loose Lucy', 'Aggressive Alex', 'Calling Carl', 'Tricky Tina', 'Solid Sam', 'Wild Wendy']
const prosOnly = process.argv.includes('--pros')
const fictionalOnly = process.argv.includes('--fictional')
const pool = prosOnly
  ? config.personas.filter(p => !FICTIONAL.includes(p.name))
  : fictionalOnly
    ? config.personas.filter(p => FICTIONAL.includes(p.name))
    : config.personas
const shuffledPersonas = [...pool].sort(() => Math.random() - 0.5)
const selectedPersonas = shuffledPersonas.slice(0, NUM_PLAYERS)

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

  // ─── Betting Round ──────────────────────────────────────────

  function runBettingRound(startSeat: number) {
    const needsToAct = new Set(
      players.filter(p => !p.folded && !p.eliminated && p.chips > 0).map(p => p.id),
    )

    let seat = startSeat
    let loops = 0

    while (needsToAct.size > 0) {
      const p = players[seat]
      if (!needsToAct.has(p.id)) {
        seat = (seat + 1) % count
        loops++
        if (loops >= count * 4) break
        continue
      }

      if (activePlayers().length <= 1) break

      // Bot decision
      const tiltedProfile = applyTilt(p.profile, p.tilt, config.tilt, p.tiltMultiplier)
      const raiseLevel = street === 'preflop' ? preflopRaiseLevel : 0

      const action = decideBotAction(
        tiltedProfile,
        {
          street,
          toCall: currentBet - p.betThisRound,
          pot,
          currentBet,
          playerBet: p.betThisRound,
          chips: p.chips,
          bb: BB,
          numActivePlayers: activePlayers().length,
          raiseLevel,
          position: positions[p.id] || '',
          holeCards: p.holeCards ?? undefined,
          community: community,
          wasPreflopRaiser: p.id === preflopRaiserId,
          preflopCallers: preflopCallerCount,
          checkedThisStreet: (playerStreetActions.get(p.id) as any)?.[street] === 'check',
          streetHistory: playerStreetActions.get(p.id) as any,
          tableDynamics: getTableDynamics(p.id),
        },
        p.consistency,
      )

      // Apply action
      if (action.type === 'fold') {
        p.folded = true
        p.lastAction = 'fold'
        actions.push(`${p.name} folds`)
      } else if (action.type === 'check') {
        p.lastAction = 'check'
        actions.push(`${p.name} checks`)
      } else if (action.type === 'call') {
        const callAmt = Math.min(currentBet - p.betThisRound, p.chips)
        p.chips -= callAmt
        p.betThisRound += callAmt
        p.totalInvested += callAmt
        pot += callAmt
        p.lastAction = 'call'
        actions.push(`${p.name} calls $${callAmt}`)
      } else if (action.type === 'raise') {
        const raiseTotal = Math.min(action.amount!, p.chips + p.betThisRound)
        const toAdd = raiseTotal - p.betThisRound
        p.chips -= toAdd
        p.betThisRound = raiseTotal
        p.totalInvested += toAdd
        pot += toAdd
        currentBet = raiseTotal
        p.lastAction = p.chips <= 0 ? 'all-in' : 'raise'
        actions.push(p.chips <= 0 ? `${p.name} goes ALL-IN $${raiseTotal}` : `${p.name} raises to $${raiseTotal}`)
        if (street === 'preflop') {
          preflopRaiseLevel++
          preflopRaiserId = p.id
        }
        // Re-open action for everyone else
        for (const ap of activePlayers()) {
          if (ap.id !== p.id && ap.chips > 0 && !ap.folded) {
            needsToAct.add(ap.id)
          }
        }
      }

      // Track street actions
      if (street === 'preflop' && action.type === 'call') preflopCallerCount++
      if (street !== 'preflop') {
        const existing = playerStreetActions.get(p.id) || {}
        const key = street as 'flop' | 'turn'
        if (street === 'flop' || street === 'turn') {
          existing[key] = action.type === 'raise' ? (currentBet <= 0 ? 'bet' : 'raise') : action.type
          playerStreetActions.set(p.id, existing)
        }
      }

      needsToAct.delete(p.id)
      if (activePlayers().length <= 1) break
      seat = (seat + 1) % count
      loops++
      if (loops >= count * 4) break
    }
  }

  // ─── Play Streets ───────────────────────────────────────────

  // Preflop
  const preflopStart = (bbSeat + 1) % count
  runBettingRound(preflopStart)

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
    preflopRaiseLevel = 0

    // Find first active seat after dealer
    let startSeat = (dealerSeat + 1) % count
    for (let i = 0; i < count; i++) {
      const p = players[startSeat]
      if (!p.folded && !p.eliminated && p.chips > 0) break
      startSeat = (startSeat + 1) % count
    }
    runBettingRound(startSeat)
  }

  // ─── Determine Winner ───────────────────────────────────────

  street = 'showdown'
  let winnerId = -1
  let winnerName = ''

  const remaining = activePlayers()
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
    )
    let maxAward = 0
    for (const [pid, amount] of awards) {
      players[pid].chips += amount
      if (amount > maxAward) { maxAward = amount; winnerId = pid; winnerName = players[pid].name }
    }
  }

  // Update table flow window
  if (winnerId >= 0) {
    recentWinners.push(winnerId)
    if (recentWinners.length > TABLE_FLOW_WINDOW) recentWinners.shift()
  }

  // Update tilt
  for (const p of players) {
    if (p.eliminated) continue
    const won = p.id === winnerId
    const lostBigPot = !won && !p.folded && pot > STARTING_STACK * config.tilt.bigLossThreshold
    updateTilt(p.tilt, won, lostBigPot, config.tilt, p.tiltMultiplier)
  }

  // Eliminate busted players
  for (const p of players) {
    if (p.chips <= 0 && !p.eliminated) {
      p.eliminated = true
    }
  }

  // Build board string (only streets that were reached)
  const reachedFlop = actions.some(a => a.includes('FLOP'))
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
}

const botStats = new Map<string, BotStats>()
for (const p of selectedPersonas) {
  botStats.set(p.name, {
    handsDealt: 0, vpipCount: 0, pfrCount: 0, threeBetCount: 0,
    flopsSeen: 0, postflopBets: 0, postflopCalls: 0, postflopFolds: 0, wonCount: 0, rebuys: 0,
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

function getTableDynamics(playerId: number) {
  if (recentWinners.length < (config.tableFlow?.minHands ?? 10)) return undefined
  const winCounts = new Map<number, number>()
  for (const id of recentWinners) winCounts.set(id, (winCounts.get(id) ?? 0) + 1)
  const total = recentWinners.length
  let dominantId = -1, dominantWins = 0
  for (const [id, wins] of winCounts) {
    if (wins > dominantWins) { dominantId = id; dominantWins = wins }
  }
  const myWins = winCounts.get(playerId) ?? 0
  const avgStack = players.reduce((s, p) => s + (p.eliminated ? 0 : p.chips), 0) / players.filter(p => !p.eliminated).length
  return {
    dominantPlayerId: dominantId,
    dominantWinRate: dominantWins / total,
    myRecentWinRate: myWins / total,
    avgStackDepth: avgStack / BB,
    handsInWindow: total,
  }
}

const progressInterval = Math.max(1, Math.floor(NUM_HANDS / 20)) // report ~20 times

for (let h = 1; h <= NUM_HANDS; h++) {
  // Rebuy busted players FIRST — before alive check (fixes heads-up ending after 1 bust)
  for (const p of players) {
    if (p.eliminated) {
      p.eliminated = false
      p.chips = STARTING_STACK
      p.tilt = createTiltState()
      const bs = botStats.get(p.name)
      if (bs) bs.rebuys = (bs.rebuys || 0) + 1
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
    bs.handsDealt++
    if (p.name === hand.winnerName) bs.wonCount++

    // Check preflop actions — match "Name calls" or "Name raises"
    const namePrefix = p.name + ' '
    const playerPreflopActions = preflopActions.filter(a => a.startsWith(namePrefix))
    const raised = playerPreflopActions.some(a => a.includes('raises') || a.includes('ALL-IN'))
    const called = playerPreflopActions.some(a => a.includes('calls'))
    if (raised || called) bs.vpipCount++
    if (raised) bs.pfrCount++

    if (!p.folded && flopIdx >= 0) bs.flopsSeen++

    // Postflop actions
    const playerPostflop = postflopActions.filter(a => a.startsWith(namePrefix))
    bs.postflopBets += playerPostflop.filter(a => a.includes('raises') || a.includes('ALL-IN')).length
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

  dealerSeat = (dealerSeat + 1) % NUM_PLAYERS
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
  const totalInvested = STARTING_STACK + (bs.rebuys * STARTING_STACK)
  const netProfit = p.chips - totalInvested
  const rebuyStr = bs.rebuys > 0 ? ` [${bs.rebuys} rebuys]` : ''
  console.log(`  ${p.name.padEnd(22)} $${p.chips.toString().padStart(6)}  (${netProfit >= 0 ? '+' : ''}$${netProfit})${rebuyStr}`)
}

// Per-bot behavioral stats vs config
console.log()
console.log(`--- Per-Bot Stats (Observed vs Config) ---`)
console.log(`${'Name'.padEnd(22)} ${'VPIP'.padStart(8)} ${'(cfg)'.padStart(6)} ${'PFR'.padStart(7)} ${'(cfg)'.padStart(6)} ${'AF'.padStart(6)} ${'(cfg)'.padStart(6)} ${'3Bet%'.padStart(7)} ${'Flop%'.padStart(7)} ${'Win%'.padStart(6)}`)
console.log('-'.repeat(95))
for (const persona of selectedPersonas) {
  const bs = botStats.get(persona.name)!
  const obsVpip = bs.handsDealt > 0 ? bs.vpipCount / bs.handsDealt : 0
  const obsPfr = bs.handsDealt > 0 ? bs.pfrCount / bs.handsDealt : 0
  const obsFlopRate = bs.handsDealt > 0 ? bs.flopsSeen / bs.handsDealt : 0
  const obsWinRate = bs.handsDealt > 0 ? bs.wonCount / bs.handsDealt : 0
  const obsAF = bs.postflopCalls > 0 ? bs.postflopBets / bs.postflopCalls : 0
  const obs3bet = bs.handsDealt > 0 ? bs.threeBetCount / bs.handsDealt : 0

  const vpipDiff = obsVpip - persona.vpip
  const pfrDiff = obsPfr - persona.pfr
  const vpipFlag = Math.abs(vpipDiff) > 0.15 ? ' !' : ''
  const pfrFlag = Math.abs(pfrDiff) > 0.10 ? ' !' : ''

  console.log(
    `${persona.name.padEnd(22)}`
    + ` ${(obsVpip * 100).toFixed(1).padStart(6)}%${vpipFlag}`
    + ` ${(persona.vpip * 100).toFixed(0).padStart(4)}%`
    + ` ${(obsPfr * 100).toFixed(1).padStart(5)}%${pfrFlag}`
    + ` ${(persona.pfr * 100).toFixed(0).padStart(4)}%`
    + ` ${obsAF.toFixed(2).padStart(6)}`
    + ` ${persona.aggression.toFixed(2).padStart(5)}`
    + ` ${(obs3bet * 100).toFixed(1).padStart(5)}%`
    + ` ${(obsFlopRate * 100).toFixed(1).padStart(5)}%`
    + ` ${(obsWinRate * 100).toFixed(1).padStart(4)}%`
  )
}
console.log()
console.log(`(!) = observed stat deviates >15% (VPIP) or >10% (PFR) from config`)
