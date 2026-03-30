<script setup lang="ts">
defineOptions({ name: 'replay' })
/**
 * Hand Replay page — loads a recorded hand and lets the hero replay it.
 * Same poker table layout, same hole cards for all players, same board.
 * Hero can make different decisions; bots use the same decision engine.
 * At the end, shows a comparison of original vs replay result.
 */
import config from '@config'
import { assignPositions } from '~/utils/seats'
import type { Card, Suit } from '~/utils/cards'
import { displayCard, SUIT_SYMBOLS, RANK_DISPLAY } from '~/utils/cards'
import { decideBotAction, createTiltState, type TiltState } from '~/utils/botDecision'
import type { HandRecord, PlayerHand } from '~/composables/useSessionStats'
import { useSupabase, ensureAnonSession } from '~/composables/useSupabase'

// ─── Route Query ──────────────────────────────────────────────
const route = useRoute()
const handId = computed(() => route.query.hand as string || '')

// ─── State ────────────────────────────────────────────────────
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const replayPhase = ref<'loading' | 'ready' | 'playing' | 'finished'>('loading')

// Original hand data
const originalHand = ref<{
  handNumber: number
  holeCards: string
  board: string
  result: string
  profit: number
  position: string
  potSize: number
  actions: string[]
  players: PlayerHand[]
  stakeLevel: number
  playerCount: number
} | null>(null)

// ─── Parse card strings back to Card objects ──────────────────
const RANK_PARSE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

const SUIT_PARSE: Record<string, Suit> = {
  '\u2665': 'hearts',   // ♥
  '\u2666': 'diamonds', // ♦
  '\u2663': 'clubs',    // ♣
  '\u2660': 'spades',   // ♠
}

function parseCard(str: string): Card | null {
  str = str.trim()
  if (str.length < 2) return null
  // Last char is suit symbol
  const suitChar = str[str.length - 1]
  const rankStr = str.slice(0, -1)
  const rank = RANK_PARSE[rankStr]
  const suit = SUIT_PARSE[suitChar]
  if (!rank || !suit) return null
  return { rank, suit }
}

function parseCards(str: string): Card[] {
  if (!str) return []
  return str.split(' ').map(s => parseCard(s)).filter((c): c is Card => c !== null)
}

function parseHoleCards(str: string): [Card, Card] | null {
  const cards = parseCards(str)
  if (cards.length < 2) return null
  return [cards[0], cards[1]]
}

// ─── Load hand data ───────────────────────────────────────────
onMounted(async () => {
  if (!handId.value) {
    errorMsg.value = 'No hand ID provided.'
    loading.value = false
    return
  }

  // Try localStorage first
  let found = loadFromLocalStorage()
  if (!found) {
    found = await loadFromSupabase()
  }

  if (!found) {
    errorMsg.value = 'Hand not found.'
  }
  loading.value = false
})

function loadFromLocalStorage(): boolean {
  try {
    const saved = localStorage.getItem('holdem-session-stats')
    if (!saved) return false
    const session = JSON.parse(saved)
    if (!session.hands) return false

    // handId is either "local-<index>" or the hand number
    let hand: any = null
    let idx = -1

    if (handId.value.startsWith('local-')) {
      idx = parseInt(handId.value.replace('local-', ''), 10)
      if (idx >= 0 && idx < session.hands.length) {
        hand = session.hands[idx]
      }
    } else {
      // Try matching by hand number
      hand = session.hands.find((h: any) => String(h.handNumber) === handId.value)
    }

    if (!hand) return false

    originalHand.value = {
      handNumber: hand.handNumber,
      holeCards: hand.holeCards,
      board: hand.board,
      result: hand.result,
      profit: hand.profit,
      position: hand.position,
      potSize: hand.potSize,
      actions: hand.actions || [],
      players: hand.players || [],
      stakeLevel: session.stakeLevel,
      playerCount: session.playerCount,
    }
    replayPhase.value = 'ready'
    return true
  } catch {
    return false
  }
}

async function loadFromSupabase(): Promise<boolean> {
  const sb = useSupabase()
  if (!sb) return false

  const userId = await ensureAnonSession()
  if (!userId) return false

  try {
    const { data, error } = await sb
      .from('hands')
      .select('*')
      .eq('id', handId.value)
      .single()

    if (error || !data) return false

    originalHand.value = {
      handNumber: data.hand_number,
      holeCards: data.hole_cards,
      board: data.board || '',
      result: data.result,
      profit: data.profit,
      position: data.position,
      potSize: data.pot_size,
      actions: data.actions || [],
      players: data.players || [],
      stakeLevel: data.stake_level,
      playerCount: data.player_count,
    }
    replayPhase.value = 'ready'
    return true
  } catch {
    return false
  }
}

// ─── Game config from original hand ───────────────────────────
const stake = computed(() => {
  const lvl = originalHand.value?.stakeLevel || 3
  return config.stakes.find(s => s.level === lvl)!
})
const bb = computed(() => stake.value?.bb || 2)
const sb = computed(() => stake.value?.sb || 1)
const playerCount = computed(() => originalHand.value?.playerCount || 6)
const startingStack = computed(() => bb.value * 100)

// ─── Per-player state ──────────────────────────────────────────
interface PlayerState {
  id: number
  name: string
  chips: number
  holeCards: [Card, Card] | null
  folded: boolean
  eliminated: boolean
  isHero: boolean
  lastAction: string | null
  currentBetAmount: number
  betThisRound: number
  tilt: TiltState
}

const playerStates = ref<PlayerState[]>([])
const dealerSeat = ref(0)
const street = ref<'preflop' | 'flop' | 'turn' | 'river' | 'showdown'>('preflop')
const dealt = ref(false)
const activeSeat = ref(-1)
const pot = ref(0)
const currentBet = ref(0)
const waitingForHero = ref(false)
const allCommunity = ref<Card[]>([])
const animating = ref(false)
const handActionLog = ref<string[]>([])
const streetAtEnd = ref<string>('preflop')
const heroWonHand = ref(false)
const heroWinAmount = ref(0)
const heroTotalWagered = ref(0)

// Replay result
const replayResult = ref<{ result: string; profit: number } | null>(null)

// ─── Positions ────────────────────────────────────────────────
const positions = computed(() => {
  if (!originalHand.value) return []
  return assignPositions(playerCount.value, dealerSeat.value)
})

const heroPosition = computed(() => positions.value[0] || 'BTN')
const hero = computed(() => playerStates.value[0])
const heroHoleCards = computed(() => hero.value?.holeCards || null)

const visibleCommunity = computed(() => {
  const s = street.value === 'showdown' ? streetAtEnd.value : street.value
  switch (s) {
    case 'preflop': return []
    case 'flop': return allCommunity.value.slice(0, 3)
    case 'turn': return allCommunity.value.slice(0, 4)
    case 'river': return allCommunity.value.slice(0, 5)
    default: return []
  }
})

const toCall = computed(() => {
  if (!hero.value) return 0
  return Math.max(0, currentBet.value - hero.value.betThisRound)
})
const minRaise = computed(() => {
  if (currentBet.value === 0) return bb.value
  return currentBet.value + bb.value
})
const maxRaise = computed(() => hero.value?.chips || 0)
const heroTurn = computed(() => waitingForHero.value && !hero.value?.folded && street.value !== 'showdown')

const activePlayers = computed(() => playerStates.value.filter(p => !p.folded && !p.eliminated))
const activeNonAllIn = computed(() => activePlayers.value.filter(p => p.chips > 0))

// ─── Determine dealer seat from original hand ─────────────────
function findDealerSeat(): number {
  if (!originalHand.value) return 0
  // Figure out the dealer seat from the players' positions
  // The hero is always seat 0. We know the hero's position from the original hand.
  // assignPositions(count, dealerSeat) puts position[i] based on dealerSeat offset.
  // We need to find the dealerSeat such that positions[0] === originalHand.position
  const count = playerCount.value
  for (let d = 0; d < count; d++) {
    const pos = assignPositions(count, d)
    if (pos[0] === originalHand.value.position) return d
  }
  return 0
}

// ─── Bot profiles from original player names ──────────────────
function botProfileForPlayer(player: PlayerHand) {
  // Try to find a matching persona by name
  const persona = config.personas.find(p => p.name === player.name)
  if (persona) {
    return {
      vpip: persona.vpip,
      pfr: persona.pfr,
      aggression: persona.aggression,
      bluffFreq: persona.bluffFreq,
      creativeFreq: persona.creativeFreq,
    }
  }
  // Try bot presets
  const preset = config.botPresets.find(p => p.name === player.name)
  if (preset) {
    return {
      vpip: preset.vpip,
      pfr: preset.pfr,
      aggression: preset.aggression,
      bluffFreq: preset.bluffFreq,
      creativeFreq: preset.creativeFreq,
    }
  }
  // Default TAG profile
  return { vpip: 0.22, pfr: 0.18, aggression: 1.2, bluffFreq: 0.14, creativeFreq: 0.05 }
}

// ─── Start Replay ─────────────────────────────────────────────
function startReplay() {
  if (!originalHand.value) return

  replayPhase.value = 'playing'
  replayResult.value = null
  dealerSeat.value = findDealerSeat()

  const players = originalHand.value.players
  const count = playerCount.value

  // Parse all cards from the original hand
  const boardCards = parseCards(originalHand.value.board)

  // Collect all known cards (hole cards + board) to avoid duplicates when generating extras
  const knownCards = new Set<string>()
  for (const c of boardCards) knownCards.add(`${c.rank}-${c.suit}`)

  // Initialize player states with exact same hole cards
  const states: PlayerState[] = []
  for (let i = 0; i < count; i++) {
    const player = players[i]
    if (!player) continue
    const hc = parseHoleCards(player.holeCards)
    if (hc) {
      knownCards.add(`${hc[0].rank}-${hc[0].suit}`)
      knownCards.add(`${hc[1].rank}-${hc[1].suit}`)
    }
    states.push({
      id: i,
      name: player.name,
      chips: startingStack.value,
      holeCards: hc,
      folded: false,
      eliminated: false,
      isHero: player.isHero,
      lastAction: null,
      currentBetAmount: 0,
      betThisRound: 0,
      tilt: createTiltState(),
    })
  }
  playerStates.value = states

  // Ensure we have 5 community cards even if original hand ended early.
  // Generate random cards for missing streets (avoiding duplicates).
  const fullBoard = [...boardCards]
  if (fullBoard.length < 5) {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
    const available: Card[] = []
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        if (!knownCards.has(`${rank}-${suit}`)) {
          available.push({ rank, suit })
        }
      }
    }
    // Shuffle available cards
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]]
    }
    while (fullBoard.length < 5 && available.length > 0) {
      fullBoard.push(available.pop()!)
    }
  }
  allCommunity.value = fullBoard

  // Reset game state
  pot.value = 0
  currentBet.value = 0
  activeSeat.value = -1
  waitingForHero.value = false
  street.value = 'preflop'
  dealt.value = true
  heroWonHand.value = false
  heroWinAmount.value = 0
  heroTotalWagered.value = 0
  streetAtEnd.value = 'preflop'
  handActionLog.value = [`--- PREFLOP: ${positions.value[0] || ''} ---`]

  setTimeout(() => postBlindsAndStartBetting(), 400)
}

// ─── Betting Logic (mostly same as index.vue) ─────────────────
function findSeatByPosition(label: string): number {
  return positions.value.findIndex(p => p === label || p.includes(label))
}

function postBlindsAndStartBetting() {
  const sbSeat = findSeatByPosition('SB')
  const bbSeat = findSeatByPosition('BB')

  if (sbSeat >= 0) {
    const p = playerStates.value[sbSeat]
    const amt = Math.min(sb.value, p.chips)
    p.chips -= amt
    p.betThisRound = amt
    p.lastAction = 'sb'
    p.currentBetAmount = amt
    pot.value += amt
    if (p.id === 0) heroTotalWagered.value += amt
  }

  if (bbSeat >= 0) {
    const p = playerStates.value[bbSeat]
    const amt = Math.min(bb.value, p.chips)
    p.chips -= amt
    p.betThisRound = amt
    p.lastAction = 'bb'
    p.currentBetAmount = amt
    pot.value += amt
    if (p.id === 0) heroTotalWagered.value += amt
  }

  currentBet.value = bb.value

  const startSeat = (bbSeat + 1) % playerStates.value.length
  setTimeout(() => runBettingRound(startSeat), 600)
}

// ─── Betting Round ────────────────────────────────────────────
const needsToAct = ref<Set<number>>(new Set())

async function runBettingRound(startSeat: number, resume: boolean = false) {
  const count = playerStates.value.length

  if (!resume) {
    needsToAct.value = new Set(
      playerStates.value
        .filter(p => !p.folded && !p.eliminated && p.chips > 0)
        .map(p => p.id)
    )
  }

  let seat = startSeat
  let loops = 0

  while (needsToAct.value.size > 0) {
    const p = playerStates.value[seat]

    if (!needsToAct.value.has(p.id)) {
      seat = (seat + 1) % count
      loops++
      if (loops >= count * 4) break
      continue
    }

    if (activePlayers.value.length <= 1) break

    activeSeat.value = seat

    if (p.isHero) {
      waitingForHero.value = true
      return // Hero takes over
    }

    // Bot decision with thinking delay
    await sleep(600 + Math.random() * 800)
    const action = makeBotDecision(p)
    applyAction(p, action)
    needsToAct.value.delete(p.id)

    if (action.type === 'raise') {
      for (const ap of activePlayers.value) {
        if (ap.id !== p.id && ap.chips > 0 && !ap.folded) {
          needsToAct.value.add(ap.id)
        }
      }
    }

    if (activePlayers.value.length <= 1) break

    seat = (seat + 1) % count
    loops++
    if (loops >= count * 4) break
  }

  activeSeat.value = -1
  waitingForHero.value = false

  if (activePlayers.value.length <= 1) {
    setTimeout(() => endHand(), 1000)
    return
  }

  setTimeout(() => advanceStreet(), 800)
}

function applyAction(p: PlayerState, action: { type: string; amount?: number }) {
  if (action.type === 'fold') {
    p.folded = true
    p.lastAction = 'fold'
    p.currentBetAmount = 0
    handActionLog.value.push(`${p.name} folds`)
  } else if (action.type === 'check') {
    p.lastAction = 'check'
    p.currentBetAmount = 0
    handActionLog.value.push(`${p.name} checks`)
  } else if (action.type === 'call') {
    const callAmt = Math.min(currentBet.value - p.betThisRound, p.chips)
    p.chips -= callAmt
    p.betThisRound += callAmt
    if (p.id === 0) heroTotalWagered.value += callAmt
    pot.value += callAmt
    p.lastAction = 'call'
    p.currentBetAmount = callAmt
    handActionLog.value.push(`${p.name} calls $${callAmt}`)
  } else if (action.type === 'raise') {
    const raiseTotal = Math.min(action.amount!, p.chips + p.betThisRound)
    const toAdd = raiseTotal - p.betThisRound
    p.chips -= toAdd
    p.betThisRound = raiseTotal
    pot.value += toAdd
    currentBet.value = raiseTotal
    if (p.id === 0) heroTotalWagered.value += toAdd
    p.lastAction = p.chips <= 0 ? 'all-in' : 'raise'
    p.currentBetAmount = raiseTotal
    handActionLog.value.push(p.chips <= 0 ? `${p.name} goes ALL-IN $${raiseTotal}` : `${p.name} raises to $${raiseTotal}`)
  }
}

function makeBotDecision(p: PlayerState): { type: string; amount?: number } {
  if (!originalHand.value) return { type: 'fold' }

  const player = originalHand.value.players[p.id]
  if (!player) return { type: 'fold' }

  const profile = botProfileForPlayer(player)

  return decideBotAction(
    profile,
    {
      street: street.value as 'preflop' | 'flop' | 'turn' | 'river',
      toCall: currentBet.value - p.betThisRound,
      pot: pot.value,
      currentBet: currentBet.value,
      playerBet: p.betThisRound,
      chips: p.chips,
      bb: bb.value,
      numActivePlayers: activePlayers.value.length,
    },
  )
}

// ─── Hero Actions ──────────────────────────────────────────────
function handleFold() {
  if (!hero.value) return
  applyAction(hero.value, { type: 'fold' })
  needsToAct.value.delete(hero.value.id)
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleCheck() {
  if (!hero.value) return
  applyAction(hero.value, { type: 'check' })
  needsToAct.value.delete(hero.value.id)
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleCall(amount: number) {
  if (!hero.value) return
  applyAction(hero.value, { type: 'call' })
  needsToAct.value.delete(hero.value.id)
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleRaise(amount: number) {
  if (!hero.value) return
  const cappedAmount = Math.min(amount, hero.value.chips + hero.value.betThisRound)
  applyAction(hero.value, { type: 'raise', amount: cappedAmount })
  needsToAct.value.delete(hero.value.id)
  for (const ap of activePlayers.value) {
    if (ap.id !== hero.value.id && ap.chips > 0 && !ap.folded) {
      needsToAct.value.add(ap.id)
    }
  }
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function resumeBettingAfterHero() {
  if (activePlayers.value.length <= 1) {
    setTimeout(() => endHand(), 1000)
    return
  }

  if (needsToAct.value.size === 0) {
    setTimeout(() => advanceStreet(), 800)
    return
  }

  const nextSeat = (0 + 1) % playerStates.value.length
  setTimeout(() => runBettingRound(nextSeat, true), 400)
}

// ─── Street Advancement ────────────────────────────────────────
function advanceStreet() {
  for (const p of playerStates.value) {
    p.betThisRound = 0
    if (!p.folded) p.lastAction = null
  }
  currentBet.value = 0

  switch (street.value) {
    case 'preflop':
      street.value = 'flop'
      handActionLog.value.push(`--- FLOP: ${allCommunity.value.slice(0, 3).map(c => displayCard(c)).join(' ')} ---`)
      break
    case 'flop':
      street.value = 'turn'
      if (allCommunity.value[3]) handActionLog.value.push(`--- TURN: ${displayCard(allCommunity.value[3])} ---`)
      break
    case 'turn':
      street.value = 'river'
      if (allCommunity.value[4]) handActionLog.value.push(`--- RIVER: ${displayCard(allCommunity.value[4])} ---`)
      break
    case 'river':
      street.value = 'showdown'
      endHand()
      return
  }

  // Postflop: action starts first active player left of dealer
  const count = playerStates.value.length
  let startSeat = (dealerSeat.value + 1) % count
  for (let i = 0; i < count; i++) {
    const p = playerStates.value[startSeat]
    if (!p.folded && !p.eliminated && p.chips > 0) break
    startSeat = (startSeat + 1) % count
  }
  setTimeout(() => runBettingRound(startSeat), 600)
}

function endHand() {
  activeSeat.value = -1
  waitingForHero.value = false
  streetAtEnd.value = street.value
  street.value = 'showdown'

  let winnerId = -1
  if (activePlayers.value.length === 1) {
    winnerId = activePlayers.value[0].id
    activePlayers.value[0].chips += pot.value
  } else {
    const winner = activePlayers.value[Math.floor(Math.random() * activePlayers.value.length)]
    winnerId = winner.id
    winner.chips += pot.value
  }

  heroWonHand.value = winnerId === 0
  heroWinAmount.value = pot.value

  const heroState = playerStates.value[0]
  if (heroState) {
    const heroWon = winnerId === 0
    const heroProfit = heroWon ? pot.value - heroTotalWagered.value : -heroTotalWagered.value

    replayResult.value = {
      result: heroState.folded ? 'folded' : (heroWon ? 'won' : 'lost'),
      profit: heroState.folded ? 0 : heroProfit,
    }
  }

  replayPhase.value = 'finished'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatPot(n: number): string {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`
  if (Number.isInteger(n)) return `$${n}`
  return `$${n.toFixed(2)}`
}

function formatProfit(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${n}`
}

function resultLabel(result: string): string {
  if (result === 'won') return 'WON'
  if (result === 'lost') return 'LOST'
  return 'FOLDED'
}

function resultClass(result: string): string {
  if (result === 'won') return 'text-green-400'
  if (result === 'lost') return 'text-red-400'
  return 'text-gray-400'
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="flex items-center gap-3 text-gray-400">
        <div class="flex gap-1">
          <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
          <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
          <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
        </div>
        Loading hand data...
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="flex items-center justify-center min-h-screen">
      <div class="max-w-md text-center space-y-4 p-8">
        <div class="text-4xl text-gray-600">?</div>
        <p class="text-gray-400">{{ errorMsg }}</p>
        <NuxtLink to="/stats">
          <UButton color="primary">Back to Stats</UButton>
        </NuxtLink>
      </div>
    </div>

    <!-- Ready to replay -->
    <div v-else-if="replayPhase === 'ready' && originalHand" class="flex items-center justify-center min-h-screen">
      <div class="max-w-lg text-center space-y-6 p-8">
        <h2 class="text-2xl font-bold">Hand #{{ originalHand.handNumber }} Replay</h2>
        <p class="text-gray-400 text-sm">
          Same cards, same board, same opponents. Make different decisions and see how it plays out.
        </p>

        <!-- Original hand summary -->
        <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-3 text-left">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 uppercase">Original Result</span>
            <span
              class="px-2 py-0.5 rounded text-xs font-bold uppercase"
              :class="{
                'bg-green-900/50 text-green-400': originalHand.result === 'won',
                'bg-red-900/50 text-red-400': originalHand.result === 'lost',
                'bg-gray-800 text-gray-500': originalHand.result === 'folded',
              }"
            >
              {{ resultLabel(originalHand.result) }} {{ formatProfit(originalHand.profit) }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-gray-500">Your Cards</span>
              <div class="text-white font-mono text-lg">{{ originalHand.holeCards }}</div>
            </div>
            <div>
              <span class="text-gray-500">Position</span>
              <div class="text-white font-mono text-lg">{{ originalHand.position }}</div>
            </div>
            <div v-if="originalHand.board">
              <span class="text-gray-500">Board</span>
              <div class="text-white font-mono">{{ originalHand.board }}</div>
            </div>
            <div>
              <span class="text-gray-500">Pot</span>
              <div class="text-yellow-400 font-mono">${{ originalHand.potSize }}</div>
            </div>
          </div>
          <div class="text-xs text-gray-600">
            {{ originalHand.players.length }} players at {{ stake?.name }} stakes (${{ sb }}/${{ bb }})
          </div>
        </div>

        <UButton color="primary" size="lg" @click="startReplay">
          Start Replay
        </UButton>
        <div class="flex justify-center">
          <NuxtLink to="/stats">
            <UButton variant="ghost" color="neutral" size="sm">Back to Stats</UButton>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Playing / Finished -->
    <div v-else-if="(replayPhase === 'playing' || replayPhase === 'finished') && originalHand" class="p-4">
      <!-- Top bar -->
      <div class="flex items-center justify-between mb-4 max-w-7xl mx-auto">
        <NuxtLink to="/stats">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-arrow-left"
          >
            Stats
          </UButton>
        </NuxtLink>

        <div class="flex items-center gap-4">
          <span class="text-xs px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 uppercase tracking-wide font-semibold">
            REPLAY
          </span>
          <span class="text-sm text-gray-400">
            Hand #{{ originalHand.handNumber }} — {{ stake?.name }} ${{ sb }}/${{ bb }}
          </span>
          <span class="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 uppercase tracking-wide">
            {{ street }}
          </span>
          <div
            v-if="hero"
            class="flex items-center gap-1.5 bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-1"
          >
            <span class="text-xs text-gray-400">Stack</span>
            <span class="text-base font-bold font-mono text-white">
              {{ formatPot(hero.chips) }}
            </span>
          </div>
        </div>

        <UColorModeButton />
      </div>

      <!-- Main layout -->
      <div class="flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto items-start">
        <div class="flex-1 min-w-0 space-y-4">
          <PokerTable :player-count="playerCount">
            <template #community>
              <PlayingCard
                v-for="(card, i) in visibleCommunity"
                :key="i"
                :card="card"
                :face-up="true"
                size="md"
              />
              <div
                v-for="i in (5 - visibleCommunity.length)"
                :key="'empty-' + i"
                class="w-20 h-[7rem] rounded-lg border border-dashed border-green-800/40"
              />
            </template>

            <template #pot>
              <div class="text-center text-yellow-400 font-bold text-sm">
                Pot: {{ formatPot(pot) }}
              </div>
            </template>

            <template #seat="{ seatIndex }">
              <PlayerSeat
                v-if="playerStates[seatIndex]"
                :name="playerStates[seatIndex].name"
                :chips="playerStates[seatIndex].chips"
                :position="positions[seatIndex] || ''"
                :hole-cards="playerStates[seatIndex].holeCards"
                :show-cards="playerStates[seatIndex].isHero"
                :is-hero="playerStates[seatIndex].isHero"
                :is-active="activeSeat === seatIndex"
                :folded="playerStates[seatIndex].folded"
                :eliminated="playerStates[seatIndex].eliminated"
                :stake-level="originalHand.stakeLevel"
                :peekable="!playerStates[seatIndex].isHero && !playerStates[seatIndex].folded"
                :last-action="playerStates[seatIndex].lastAction"
                :current-bet-amount="playerStates[seatIndex].currentBetAmount"
              />
            </template>
          </PokerTable>

          <!-- Bet Controls -->
          <BetControls
            v-if="heroTurn"
            :pot="pot"
            :to-call="toCall"
            :min-raise="minRaise"
            :max-raise="maxRaise"
            :bb="bb"
            :enabled="true"
            @fold="handleFold"
            @check="handleCheck"
            @call="handleCall"
            @raise="handleRaise"
          />

          <!-- Comparison panel at showdown -->
          <div v-if="replayPhase === 'finished' && replayResult" class="max-w-3xl mx-auto space-y-4">
            <!-- Comparison cards -->
            <div class="grid grid-cols-2 gap-4">
              <!-- Original -->
              <div
                class="rounded-xl border p-5 text-center space-y-2"
                :class="{
                  'border-green-700/40 bg-green-900/20': originalHand.result === 'won',
                  'border-red-700/40 bg-red-900/20': originalHand.result === 'lost',
                  'border-gray-700/40 bg-gray-800/30': originalHand.result === 'folded',
                }"
              >
                <div class="text-xs text-gray-500 uppercase tracking-wider">Original</div>
                <div
                  class="text-xl font-bold"
                  :class="resultClass(originalHand.result)"
                >
                  {{ resultLabel(originalHand.result) }}
                </div>
                <div
                  class="text-2xl font-bold font-mono"
                  :class="originalHand.profit >= 0 ? 'text-green-400' : 'text-red-400'"
                >
                  {{ formatProfit(originalHand.profit) }}
                </div>
                <div class="text-xs text-gray-500">
                  Pot: ${{ originalHand.potSize }}
                </div>
              </div>

              <!-- Replay -->
              <div
                class="rounded-xl border p-5 text-center space-y-2"
                :class="{
                  'border-green-700/40 bg-green-900/20': replayResult.result === 'won',
                  'border-red-700/40 bg-red-900/20': replayResult.result === 'lost',
                  'border-gray-700/40 bg-gray-800/30': replayResult.result === 'folded',
                }"
              >
                <div class="text-xs text-amber-400 uppercase tracking-wider">Replay</div>
                <div
                  class="text-xl font-bold"
                  :class="resultClass(replayResult.result)"
                >
                  {{ resultLabel(replayResult.result) }}
                </div>
                <div
                  class="text-2xl font-bold font-mono"
                  :class="replayResult.profit >= 0 ? 'text-green-400' : 'text-red-400'"
                >
                  {{ formatProfit(replayResult.profit) }}
                </div>
                <div class="text-xs text-gray-500">
                  Pot: {{ formatPot(pot) }}
                </div>
              </div>
            </div>

            <!-- Difference -->
            <div
              v-if="replayResult.profit !== originalHand.profit"
              class="text-center text-sm"
            >
              <span class="text-gray-400">Difference: </span>
              <span
                class="font-mono font-bold"
                :class="replayResult.profit > originalHand.profit ? 'text-green-400' : 'text-red-400'"
              >
                {{ formatProfit(replayResult.profit - originalHand.profit) }}
              </span>
            </div>

            <!-- Actions -->
            <div class="flex justify-center gap-3">
              <UButton color="primary" size="lg" @click="startReplay">
                Replay Again
              </UButton>
              <NuxtLink to="/stats">
                <UButton variant="outline" color="neutral" size="lg">
                  Back to Stats
                </UButton>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Side panel -->
        <div class="w-full lg:w-80 space-y-3">
          <!-- Action status -->
          <div
            v-if="dealt && !heroTurn && street !== 'showdown' && activePlayers.length > 1"
            class="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4"
          >
            <div class="flex items-center gap-4">
              <div class="flex gap-1.5">
                <div class="w-3 h-3 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
                <div class="w-3 h-3 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
                <div class="w-3 h-3 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
              </div>
              <div>
                <div class="text-base font-semibold text-white">
                  {{ playerStates[activeSeat]?.name || 'Bot' }}
                </div>
                <div class="text-xs text-gray-400">is thinking...</div>
              </div>
            </div>
            <div class="mt-3 w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div class="h-full bg-green-500/60 rounded-full animate-pulse" style="width: 60%;" />
            </div>
          </div>

          <!-- Hero's turn indicator -->
          <div
            v-if="heroTurn"
            class="bg-amber-900/30 border border-amber-700/40 rounded-xl p-4"
          >
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
              <div>
                <div class="text-base font-semibold text-amber-200">Your Turn</div>
                <div class="text-xs text-amber-400/60">{{ toCall > 0 ? `$${toCall} to call` : 'Check or bet' }}</div>
              </div>
            </div>
          </div>

          <!-- Original hand info -->
          <div class="bg-gray-900/80 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Original Hand</div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Result</span>
              <span
                class="font-bold"
                :class="resultClass(originalHand.result)"
              >
                {{ resultLabel(originalHand.result) }} {{ formatProfit(originalHand.profit) }}
              </span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Pot</span>
              <span class="text-yellow-400 font-mono">${{ originalHand.potSize }}</span>
            </div>
          </div>

          <!-- Original play-by-play -->
          <div v-if="originalHand.actions.length > 0" class="bg-gray-900/80 border border-gray-700/50 rounded-xl p-4">
            <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Original Actions</div>
            <div class="max-h-40 overflow-y-auto space-y-0.5">
              <div
                v-for="(action, ai) in originalHand.actions"
                :key="ai"
                class="text-xs font-mono"
                :class="action.startsWith('---') ? 'text-yellow-500/70 font-semibold mt-1' : 'text-gray-400'"
              >
                {{ action }}
              </div>
            </div>
          </div>

          <!-- Replay play-by-play -->
          <div v-if="handActionLog.length > 0" class="bg-gray-900/80 border border-gray-700/50 rounded-xl p-4">
            <div class="text-xs text-amber-400 uppercase tracking-wider font-semibold mb-2">Replay Actions</div>
            <div class="max-h-40 overflow-y-auto space-y-0.5">
              <div
                v-for="(action, ai) in handActionLog"
                :key="ai"
                class="text-xs font-mono"
                :class="action.startsWith('---') ? 'text-yellow-500/70 font-semibold mt-1' : 'text-gray-300'"
              >
                {{ action }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
