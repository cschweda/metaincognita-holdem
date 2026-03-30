<script setup lang="ts">
defineOptions({ name: 'index' })
/**
 * Main game page — poker table with simulated betting rounds.
 * Bots act visibly in sequence with action labels.
 * Folded players lose their cards. Active seat pulses.
 */
import config from '@config'
import { assignPositions } from '~/utils/seats'
import type { Card } from '~/utils/cards'
import type { GameSettings } from '~/components/SetupScreen.vue'
import { decideBotAction, applyTilt, updateTilt, decayTilt, createTiltState, type TiltState } from '~/utils/botDecision'
import { displayCard } from '~/utils/cards'

const phase = ref<'setup' | 'table' | 'timeout' | 'busted'>('setup')
const { session, initSession, recordHand, resetSession, saveSessionToSupabase, downloadJSON, downloadCSV, supabaseReady } = useSessionStats()
const settings = ref<GameSettings | null>(null)

// ─── KeepAlive: pause/resume timeout when navigating to/from stats ──
onActivated(() => {
  if (phase.value === 'table') resetTimeout()
})
onDeactivated(() => {
  if (timeoutTimer) clearTimeout(timeoutTimer)
})

// ─── Hero Timeout ──────────────────────────────────────────────
let timeoutTimer: ReturnType<typeof setTimeout> | null = null

function resetTimeout() {
  if (timeoutTimer) clearTimeout(timeoutTimer)
  if (phase.value !== 'table') return
  timeoutTimer = setTimeout(() => {
    handleTimeout()
  }, config.session.heroTimeoutMs)
}

function handleTimeout() {
  if (phase.value !== 'table') return
  // Auto-fold hero if in a hand
  const heroState = playerStates.value[0]
  if (heroState && !heroState.folded && waitingForHero.value) {
    heroState.folded = true
    heroState.lastAction = 'fold'
    waitingForHero.value = false
  }
  // Save session and show timeout screen
  if (!guestMode.value) saveSessionToSupabase()
  phase.value = 'timeout'
}

function resumeFromTimeout() {
  phase.value = 'table'
  resetTimeout()
  dealNewHand()
}

// Reset timeout on any hero interaction
function onHeroActivity() {
  resetTimeout()
}

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
const heroWonHand = ref(false)
const heroWinAmount = ref(0)
const heroTotalWagered = ref(0)   // total chips hero put in this hand
const dealerSeat = ref(0)
const street = ref<'preflop' | 'flop' | 'turn' | 'river' | 'showdown'>('preflop')
const dealt = ref(false)
const activeSeat = ref(-1)
const pot = ref(0)
const currentBet = ref(0)
const waitingForHero = ref(false)
const allCommunity = ref<Card[]>([])
const animating = ref(false)
const handActionLog = ref<string[]>([]) // play-by-play for current hand
const streetAtEnd = ref<string>('preflop') // street when hand ended (for community card display)

// ─── Computed ──────────────────────────────────────────────────
const stake = computed(() => config.stakes.find(s => s.level === (settings.value?.stakeLevel || 3))!)
const bb = computed(() => stake.value?.bb || 2)
const sb = computed(() => stake.value?.sb || 1)
const startingStack = computed(() => bb.value * (settings.value?.stackBB || 100))

const positions = computed(() => {
  if (!settings.value) return []
  return assignPositions(settings.value.playerCount, dealerSeat.value)
})

const heroPosition = computed(() => positions.value[0] || 'BTN')
const hero = computed(() => playerStates.value[0])
const heroHoleCards = computed(() => hero.value?.holeCards || null)

const visibleCommunity = computed(() => {
  // At showdown, only show cards that were actually dealt (not future streets)
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
const minRaise = computed(() => Math.max(currentBet.value + bb.value, currentBet.value * 2))
const maxRaise = computed(() => hero.value?.chips || 0)
const heroTurn = computed(() => waitingForHero.value && !hero.value?.folded && street.value !== 'showdown')

const activePlayers = computed(() => playerStates.value.filter(p => !p.folded && !p.eliminated))
const activeNonAllIn = computed(() => activePlayers.value.filter(p => p.chips > 0))

const opponentStats = computed(() => {
  if (!settings.value) return []
  return settings.value.botConfigs.slice(0, settings.value.playerCount - 1).map(bot => ({
    name: bot.name,
    handsPlayed: 25,
    vpip: bot.vpip * 100,
    pfr: bot.pfr * 100,
    af: bot.aggression,
    wtsd: bot.vpip > 0.25 ? 35 : 22,
  }))
})

// ─── Game Flow ─────────────────────────────────────────────────
const guestMode = ref(false)

function handleStart(gameSettings: GameSettings) {
  settings.value = gameSettings
  guestMode.value = gameSettings.guestMode
  dealerSeat.value = Math.floor(Math.random() * gameSettings.playerCount)
  phase.value = 'table'
  if (!guestMode.value) {
    initSession(gameSettings.stakeLevel, gameSettings.playerCount, startingStack.value)
  }
  resetTimeout()
  setTimeout(dealNewHand, 300)
}

function shuffleDeck(): Card[] {
  const deck: Card[] = []
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
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

function dealNewHand() {
  const count = settings.value?.playerCount || 2
  const deck = shuffleDeck()
  let idx = 0

  // Initialize player states
  const states: PlayerState[] = []
  for (let i = 0; i < count; i++) {
    const isHero = i === 0
    const botConfig = !isHero ? settings.value!.botConfigs[i - 1] : null
    const prevState = playerStates.value[i]
    // Carry over tilt state from previous hand, decay it
    const prevTilt = prevState?.tilt || createTiltState()
    decayTilt(prevTilt)

    states.push({
      id: i,
      name: isHero ? settings.value!.heroName : (botConfig?.name || `Bot ${i}`),
      chips: prevState && !prevState.eliminated ? prevState.chips : startingStack.value,
      holeCards: [deck[idx++], deck[idx++]],
      folded: false,
      eliminated: prevState?.eliminated || false,
      isHero,
      lastAction: null,
      currentBetAmount: 0,
      betThisRound: 0,
      tilt: prevTilt,
    })
  }
  playerStates.value = states

  idx++ // burn
  const community = [deck[idx++], deck[idx++], deck[idx++]]
  idx++ // burn
  community.push(deck[idx++])
  idx++ // burn
  community.push(deck[idx++])
  allCommunity.value = community

  // Reset
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

  // Rotate dealer
  dealerSeat.value = (dealerSeat.value + 1) % count

  // Post blinds then run preflop betting
  setTimeout(() => postBlindsAndStartBetting(), 400)
}

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
    if (p.id === 0) heroTotalWagered.value += amt
    pot.value += amt
  }

  currentBet.value = bb.value

  // Preflop: action starts left of BB (UTG)
  const startSeat = (bbSeat + 1) % playerStates.value.length
  setTimeout(() => runBettingRound(startSeat), 600)
}

// ─── Betting Round ─────────────────────────────────────────────
// Track who still needs to act. A raise resets everyone except the raiser.
const needsToAct = ref<Set<number>>(new Set())

async function runBettingRound(startSeat: number) {
  const count = playerStates.value.length

  // Initialize: every active player with chips needs to act
  needsToAct.value = new Set(
    playerStates.value
      .filter(p => !p.folded && !p.eliminated && p.chips > 0)
      .map(p => p.id)
  )

  let seat = startSeat
  let loops = 0

  while (needsToAct.value.size > 0) {
    const p = playerStates.value[seat]

    // Skip players who don't need to act
    if (!needsToAct.value.has(p.id)) {
      seat = (seat + 1) % count
      loops++
      if (loops >= count * 4) break // safety
      continue
    }

    // Only one player left?
    if (activePlayers.value.length <= 1) break

    activeSeat.value = seat

    if (p.isHero) {
      waitingForHero.value = true
      return // Hero takes over; resumes via resumeBettingAfterHero
    }

    // Bot decision with thinking delay
    await sleep(800 + Math.random() * 1200)
    const action = makeBotDecision(p)

    applyAction(p, action)

    // This player has acted
    needsToAct.value.delete(p.id)

    // A raise means everyone else needs to act again
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
    if (loops >= count * 4) break // safety
  }

  activeSeat.value = -1
  waitingForHero.value = false

  if (activePlayers.value.length <= 1) {
    setTimeout(() => endHand(), 1000)
    return
  }

  // Street complete — advance
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
  const botConfig = settings.value?.botConfigs[p.id - 1]
  if (!botConfig) return { type: 'fold' }

  // Base profile from config
  const baseProfile = {
    vpip: botConfig.vpip,
    pfr: botConfig.pfr,
    aggression: botConfig.aggression,
    bluffFreq: botConfig.bluffFreq,
    creativeFreq: botConfig.creativeFreq,
  }

  // Apply tilt modifiers (widens range, boosts aggression + bluffs)
  const profile = applyTilt(baseProfile, p.tilt, config.tilt)

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
  onHeroActivity()
  if (!hero.value) return
  applyAction(hero.value, { type: 'fold' })
  needsToAct.value.delete(hero.value.id)
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleCheck() {
  onHeroActivity()
  if (!hero.value) return
  applyAction(hero.value, { type: 'check' })
  needsToAct.value.delete(hero.value.id)
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleCall(amount: number) {
  onHeroActivity()
  if (!hero.value) return
  applyAction(hero.value, { type: 'call' })
  needsToAct.value.delete(hero.value.id)
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleRaise(amount: number) {
  onHeroActivity()
  if (!hero.value) return
  const cappedAmount = Math.min(amount, hero.value.chips + hero.value.betThisRound)
  applyAction(hero.value, { type: 'raise', amount: cappedAmount })
  needsToAct.value.delete(hero.value.id)
  // Raise reopens action for everyone else
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

  // Continue from next seat after hero
  const nextSeat = (0 + 1) % playerStates.value.length
  setTimeout(() => runBettingRound(nextSeat), 400)
}

// ─── Street Advancement ────────────────────────────────────────
function advanceStreet() {
  // Reset per-round state
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
      handActionLog.value.push(`--- TURN: ${displayCard(allCommunity.value[3])} ---`)
      break
    case 'turn':
      street.value = 'river'
      handActionLog.value.push(`--- RIVER: ${displayCard(allCommunity.value[4])} ---`)
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
  streetAtEnd.value = street.value // remember what street we were on
  street.value = 'showdown'

  // Determine winner
  let winnerId = -1
  if (activePlayers.value.length === 1) {
    winnerId = activePlayers.value[0].id
    activePlayers.value[0].chips += pot.value
  } else {
    const winner = activePlayers.value[Math.floor(Math.random() * activePlayers.value.length)]
    winnerId = winner.id
    winner.chips += pot.value
  }

  // Track hero result for stats panel
  heroWonHand.value = winnerId === 0
  heroWinAmount.value = pot.value
  // heroTotalWagered is already tracked incrementally via applyAction + blinds

  // Update tilt state for all non-hero players
  for (const p of playerStates.value) {
    if (p.isHero || p.eliminated) continue

    const won = p.id === winnerId
    const chipsAtStart = startingStack.value // approximate
    const lostBigPot = !won && !p.folded && pot.value > chipsAtStart * config.tilt.bigLossThreshold

    updateTilt(p.tilt, won, lostBigPot, config.tilt)
  }

  // Record hand for session stats
  const heroState = playerStates.value[0]
  if (heroState) {
    const heroWon = winnerId === 0
    const heroProfit = heroWon ? pot.value - (startingStack.value - heroState.chips + pot.value) : -(startingStack.value - heroState.chips)
    const holeStr = heroState.holeCards ? heroState.holeCards.map(c => displayCard(c)).join(' ') : ''
    const boardStr = visibleCommunity.value.map(c => displayCard(c)).join(' ')

    if (!guestMode.value) recordHand({
      handNumber: session.value.handsPlayed + 1,
      holeCards: holeStr,
      board: boardStr,
      result: heroState.folded ? 'folded' : (heroWon ? 'won' : 'lost'),
      profit: heroWon ? pot.value : (heroState.folded ? 0 : -pot.value),
      position: positions.value[0] || '',
      potSize: pot.value,
      actions: [...handActionLog.value],
    }, heroState.chips)
  }

  // Eliminate busted players
  for (const p of playerStates.value) {
    if (p.chips <= 0 && !p.eliminated) {
      p.eliminated = true
    }
  }

  // Hero bust-out check
  if (heroState && heroState.chips <= 0) {
    if (!guestMode.value) saveSessionToSupabase()
    phase.value = 'busted'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function handleRebuy() {
  // Save the bust-out session, start a fresh one
  if (!guestMode.value) saveSessionToSupabase()
  initSession(settings.value!.stakeLevel, settings.value!.playerCount, startingStack.value)
  // Reset all player states
  playerStates.value = []
  phase.value = 'table'
  resetTimeout()
  setTimeout(dealNewHand, 300)
}

function backToSetup() {
  if (timeoutTimer) clearTimeout(timeoutTimer)
  if (!guestMode.value) saveSessionToSupabase()
  phase.value = 'setup'
  settings.value = null
  playerStates.value = []
  allCommunity.value = []
  dealt.value = false
}

function formatPot(n: number): string {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`
  if (Number.isInteger(n)) return `$${n}`
  return `$${n.toFixed(2)}`
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <SetupScreen
      v-if="phase === 'setup'"
      @start="handleStart"
    />

    <!-- Timeout Screen -->
    <div v-else-if="phase === 'timeout'" class="flex items-center justify-center min-h-screen">
      <div class="max-w-md text-center space-y-6 p-8">
        <div class="text-6xl">⏸</div>
        <h2 class="text-2xl font-bold">Session Paused</h2>
        <p class="text-gray-400">
          No activity for 5 minutes. Your session has been saved and any hand in progress was folded.
        </p>
        <div class="bg-gray-800/50 rounded-xl p-4 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-400">Hands played</span>
            <span class="text-white font-mono">{{ session.handsPlayed }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Stack</span>
            <span class="text-white font-mono">${{ hero?.chips || 0 }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Profit</span>
            <span :class="session.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'" class="font-mono">
              {{ session.totalProfit >= 0 ? '+' : '' }}${{ session.totalProfit }}
            </span>
          </div>
        </div>
        <div class="flex gap-3 justify-center">
          <UButton color="primary" size="lg" @click="resumeFromTimeout">
            Resume Playing
          </UButton>
          <UButton variant="outline" color="neutral" size="lg" @click="backToSetup">
            End Session
          </UButton>
        </div>
      </div>
    </div>

    <!-- Busted Screen -->
    <div v-else-if="phase === 'busted'" class="flex items-center justify-center min-h-screen">
      <div class="max-w-md text-center space-y-6 p-8">
        <div class="text-6xl">💀</div>
        <h2 class="text-2xl font-bold text-red-400">Busted!</h2>
        <p class="text-gray-400">
          You've lost your entire stack. Session has been saved.
        </p>
        <div class="bg-gray-800/50 rounded-xl p-4 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-400">Hands played</span>
            <span class="text-white font-mono">{{ session.handsPlayed }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Final result</span>
            <span class="text-red-400 font-mono">-${{ session.startingStack }}</span>
          </div>
        </div>
        <div class="flex gap-3 justify-center">
          <UButton v-if="config.session.rebuyEnabled" color="primary" size="lg" @click="handleRebuy">
            Re-buy (${{ startingStack }})
          </UButton>
          <UButton variant="outline" color="neutral" size="lg" @click="backToSetup">
            End Session
          </UButton>
          <NuxtLink to="/stats">
            <UButton variant="ghost" color="neutral" size="lg">
              View Stats
            </UButton>
          </NuxtLink>
        </div>
        <p class="text-xs text-gray-600">
          Re-buy starts a new session — your bust-out is recorded separately.
        </p>
      </div>
    </div>

    <!-- Game Table -->
    <div v-else-if="phase === 'table'" class="p-4">
      <!-- Top bar -->
      <div class="flex items-center justify-between mb-4 max-w-7xl mx-auto">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          icon="i-lucide-arrow-left"
          @click="backToSetup"
        >
          Setup
        </UButton>

        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-400">
            {{ stake?.name }} — ${{ stake?.sb }}/${{ stake?.bb }}
          </span>
          <span class="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 uppercase tracking-wide">
            {{ street }}
          </span>
          <div
            v-if="hero"
            class="flex items-center gap-1.5 bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-1"
          >
            <span class="text-xs text-gray-400">Stack</span>
            <span
              class="text-base font-bold font-mono"
              :class="hero.chips >= startingStack ? 'text-green-400' : 'text-red-400'"
            >
              {{ formatPot(hero.chips) }}
            </span>
            <span
              v-if="hero.chips !== startingStack"
              class="text-xs font-mono"
              :class="hero.chips >= startingStack ? 'text-green-500/60' : 'text-red-500/60'"
            >
              ({{ hero.chips >= startingStack ? '+' : '' }}{{ formatPot(hero.chips - startingStack) }})
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <template v-if="guestMode">
            <span class="text-[0.6rem] text-gray-500 bg-gray-800/60 border border-gray-700/40 rounded-full px-2.5 py-1">
              Guest Mode
            </span>
          </template>
          <template v-else>
            <SupabaseStatus />
            <NuxtLink to="/stats">
              <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-bar-chart-2">
                Stats
              </UButton>
            </NuxtLink>
          </template>
          <UColorModeToggle />
        </div>
      </div>

      <!-- Main layout -->
      <div class="flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto items-start">
        <div class="flex-1 min-w-0 space-y-4">
          <PokerTable :player-count="settings?.playerCount || 6">
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
                :stake-level="settings?.stakeLevel || 3"
                :peekable="!playerStates[seatIndex].isHero && !playerStates[seatIndex].folded"
                :last-action="playerStates[seatIndex].lastAction"
                :current-bet-amount="playerStates[seatIndex].currentBetAmount"
                :tilted="playerStates[seatIndex].tilt.tilted"
                :tilt-severity="playerStates[seatIndex].tilt.severity"
              />
            </template>
          </PokerTable>

          <!-- Bet Controls (only when it's hero's turn) -->
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

          <!-- Deal next hand -->
          <div v-if="street === 'showdown'" class="flex justify-center">
            <UButton
              color="primary"
              size="lg"
              @click="dealNewHand"
            >
              Deal Next Hand
            </UButton>
          </div>
        </div>

        <!-- Stats column -->
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
            <!-- Progress bar -->
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

        <StatsPanel
          :hole-cards="heroHoleCards as [import('~/utils/cards').Card, import('~/utils/cards').Card] | null"
          :community="visibleCommunity"
          :street="street"
          :num-opponents="activePlayers.length - 1"
          :position="heroPosition"
          :pot="pot"
          :to-call="toCall"
          :hero-chips="hero?.chips || 0"
          :player-stats="opponentStats"
          :hero-turn="heroTurn"
          :hero-folded="hero?.folded || false"
          :hero-won="heroWonHand"
          :win-amount="heroWinAmount"
          :hero-wagered="heroTotalWagered"
          :hero-net-profit="heroWonHand ? heroWinAmount - heroTotalWagered : -heroTotalWagered"
          :session-stats="session"
          :supabase-connected="supabaseReady"
          @fold="handleFold"
          @check="handleCheck"
          @call="handleCall"
          @export-json="downloadJSON"
          @export-csv="downloadCSV"
          @reset-session="resetSession"
        />
        </div>
      </div>
    </div>
  </div>
</template>
