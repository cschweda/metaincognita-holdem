<script setup lang="ts">
/**
 * Main game page — poker table with simulated betting rounds.
 * Bots act visibly in sequence with action labels.
 * Folded players lose their cards. Active seat pulses.
 */
import config from '@config'
import { assignPositions } from '~/utils/seats'
import type { Card } from '~/utils/cards'
import type { GameSettings } from '~/components/SetupScreen.vue'

const phase = ref<'setup' | 'table'>('setup')
const settings = ref<GameSettings | null>(null)

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
  switch (street.value) {
    case 'preflop': return []
    case 'flop': return allCommunity.value.slice(0, 3)
    case 'turn': return allCommunity.value.slice(0, 4)
    case 'river':
    case 'showdown': return allCommunity.value.slice(0, 5)
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
function handleStart(gameSettings: GameSettings) {
  settings.value = gameSettings
  // Randomize dealer seat
  dealerSeat.value = Math.floor(Math.random() * gameSettings.playerCount)
  phase.value = 'table'
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
    })
  }
  // Skip eliminated players' cards
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
  }

  if (bbSeat >= 0) {
    const p = playerStates.value[bbSeat]
    const amt = Math.min(bb.value, p.chips)
    p.chips -= amt
    p.betThisRound = amt
    p.lastAction = 'bb'
    p.currentBetAmount = amt
    pot.value += amt
  }

  currentBet.value = bb.value

  // Preflop: action starts left of BB (UTG)
  const startSeat = (bbSeat + 1) % playerStates.value.length
  setTimeout(() => runBettingRound(startSeat), 600)
}

// ─── Betting Round ─────────────────────────────────────────────
async function runBettingRound(startSeat: number) {
  const count = playerStates.value.length
  let seat = startSeat
  let lastRaiserSeat = -1
  let acted = 0

  while (true) {
    const p = playerStates.value[seat]

    // Skip folded, eliminated, all-in
    if (p.folded || p.eliminated || p.chips <= 0) {
      seat = (seat + 1) % count
      acted++
      if (acted >= count * 2) break // safety
      if (seat === lastRaiserSeat) break
      continue
    }

    // Only one player left?
    if (activePlayers.value.length <= 1) break

    activeSeat.value = seat

    if (p.isHero) {
      // Wait for hero input
      waitingForHero.value = true
      return // Hero takes over; betting resumes after hero acts
    }

    // Bot decision
    await sleep(800 + Math.random() * 1200)
    const action = decideBotAction(p)

    if (action.type === 'fold') {
      p.folded = true
      p.lastAction = 'fold'
      p.currentBetAmount = 0
    } else if (action.type === 'check') {
      p.lastAction = 'check'
      p.currentBetAmount = 0
    } else if (action.type === 'call') {
      const callAmt = Math.min(currentBet.value - p.betThisRound, p.chips)
      p.chips -= callAmt
      p.betThisRound += callAmt
      pot.value += callAmt
      p.lastAction = 'call'
      p.currentBetAmount = callAmt
    } else if (action.type === 'raise') {
      const raiseTotal = Math.min(action.amount!, p.chips + p.betThisRound)
      const toAdd = raiseTotal - p.betThisRound
      p.chips -= toAdd
      p.betThisRound = raiseTotal
      pot.value += toAdd
      currentBet.value = raiseTotal
      p.lastAction = p.chips <= 0 ? 'all-in' : 'raise'
      p.currentBetAmount = raiseTotal
      lastRaiserSeat = seat
    }

    // Check if only one player left
    if (activePlayers.value.length <= 1) break

    seat = (seat + 1) % count
    acted++
    if (acted >= count * 3) break // safety

    // If we've gone all the way around to the raiser, done
    if (seat === lastRaiserSeat) break

    // If everyone has matched the bet and had a chance to act
    const allMatched = activePlayers.value.every(
      ap => ap.betThisRound >= currentBet.value || ap.chips <= 0
    )
    if (allMatched && acted >= activePlayers.value.length) break
  }

  activeSeat.value = -1
  waitingForHero.value = false

  // Check if hand is over (only one player left)
  if (activePlayers.value.length <= 1) {
    setTimeout(() => endHand(), 1000)
    return
  }

  // Advance to next street
  setTimeout(() => advanceStreet(), 800)
}

function decideBotAction(p: PlayerState): { type: string; amount?: number } {
  const toCallAmt = currentBet.value - p.betThisRound
  const botConfig = settings.value?.botConfigs[p.id - 1]
  const aggression = botConfig?.aggression || 1.0
  const vpip = botConfig?.vpip || 0.25

  // Simple persona-driven decisions
  const rand = Math.random()

  if (toCallAmt === 0) {
    // No bet to face: check or bet
    if (rand < 0.35 * aggression) {
      const betSize = Math.round(pot.value * (0.4 + Math.random() * 0.4))
      return { type: 'raise', amount: Math.max(betSize, bb.value) + p.betThisRound }
    }
    return { type: 'check' }
  }

  // Facing a bet
  const potOdds = toCallAmt / (pot.value + toCallAmt)

  // Tight players fold more
  if (rand > vpip * 1.5) {
    return { type: 'fold' }
  }

  // Aggressive players raise more
  if (rand < 0.15 * aggression && p.chips > currentBet.value * 2) {
    const raiseSize = currentBet.value * (2 + Math.random())
    return { type: 'raise', amount: Math.round(Math.min(raiseSize, p.chips + p.betThisRound)) }
  }

  return { type: 'call' }
}

// ─── Hero Actions ──────────────────────────────────────────────
function handleFold() {
  if (!hero.value) return
  hero.value.folded = true
  hero.value.lastAction = 'fold'
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleCheck() {
  if (!hero.value) return
  hero.value.lastAction = 'check'
  hero.value.currentBetAmount = 0
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleCall(amount: number) {
  if (!hero.value) return
  const callAmt = Math.min(amount, hero.value.chips)
  hero.value.chips -= callAmt
  hero.value.betThisRound += callAmt
  pot.value += callAmt
  hero.value.lastAction = 'call'
  hero.value.currentBetAmount = callAmt
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function handleRaise(amount: number) {
  if (!hero.value) return
  const cappedAmount = Math.min(amount, hero.value.chips + hero.value.betThisRound)
  const toAdd = cappedAmount - hero.value.betThisRound
  hero.value.chips -= toAdd
  hero.value.betThisRound = cappedAmount
  pot.value += toAdd
  currentBet.value = cappedAmount
  hero.value.lastAction = hero.value.chips <= 0 ? 'all-in' : 'raise'
  hero.value.currentBetAmount = cappedAmount
  waitingForHero.value = false
  resumeBettingAfterHero()
}

function resumeBettingAfterHero() {
  const heroIdx = 0
  const nextSeat = (heroIdx + 1) % playerStates.value.length

  // Check if only one left
  if (activePlayers.value.length <= 1) {
    setTimeout(() => endHand(), 1000)
    return
  }

  // Check if everyone has matched
  const allMatched = activePlayers.value.every(
    ap => ap.betThisRound >= currentBet.value || ap.chips <= 0
  )
  if (allMatched) {
    setTimeout(() => advanceStreet(), 800)
    return
  }

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
    case 'preflop': street.value = 'flop'; break
    case 'flop': street.value = 'turn'; break
    case 'turn': street.value = 'river'; break
    case 'river':
      street.value = 'showdown'
      endHand()
      return
  }

  // Postflop: action starts left of dealer
  const startSeat = (dealerSeat.value + 1) % playerStates.value.length
  setTimeout(() => runBettingRound(startSeat), 600)
}

function endHand() {
  activeSeat.value = -1
  waitingForHero.value = false
  street.value = 'showdown'

  // Award pot to winner (simplified — last player standing or random at showdown)
  if (activePlayers.value.length === 1) {
    activePlayers.value[0].chips += pot.value
  } else {
    // Simplified: give pot to a random active player (real evaluator in Phase 2)
    const winner = activePlayers.value[Math.floor(Math.random() * activePlayers.value.length)]
    winner.chips += pot.value
  }

  // Eliminate busted players
  for (const p of playerStates.value) {
    if (p.chips <= 0 && !p.eliminated) {
      p.eliminated = true
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backToSetup() {
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

    <div v-else class="p-4">
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

        <UColorModeToggle />
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

          <!-- Waiting indicator (bots acting) -->
          <div
            v-if="dealt && !heroTurn && street !== 'showdown' && activePlayers.length > 1"
            class="flex justify-center"
          >
            <div class="inline-flex items-center gap-3 bg-gray-800/80 border border-gray-700/50 rounded-full px-5 py-2.5 shadow-lg">
              <div class="flex gap-1">
                <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
                <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
                <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
              </div>
              <span class="text-sm font-medium text-gray-200">
                {{ playerStates[activeSeat]?.name || 'Bot' }}
                <span class="text-gray-400 font-normal">is thinking</span>
              </span>
            </div>
          </div>

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

        <!-- Stats Panel -->
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
          @fold="handleFold"
          @check="handleCheck"
          @call="handleCall"
        />
      </div>
    </div>
  </div>
</template>
