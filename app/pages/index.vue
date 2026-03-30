<script setup lang="ts">
/**
 * Main game page — shows setup screen or poker table.
 * Phase 1: Visual foundation with authentic deal sequence, live stats, and bet controls.
 */
import config from '@config'
import { assignPositions } from '~/utils/seats'
import type { Card } from '~/utils/cards'
import type { GameSettings } from '~/components/SetupScreen.vue'

const phase = ref<'setup' | 'table'>('setup')
const settings = ref<GameSettings | null>(null)

// Deal state
const dealerSeat = ref(0)
const holeCards = ref<Map<number, [Card, Card]>>(new Map())
const street = ref<'preflop' | 'flop' | 'turn' | 'river' | 'showdown'>('preflop')
const dealt = ref(false)

// Betting state (simulated for Phase 1 — real game loop comes in Phase 3)
const pot = ref(0)
const heroChips = ref(0)
const currentBet = ref(0)       // current bet hero must match
const heroBet = ref(0)          // what hero has already put in this round
const heroFolded = ref(false)

const allCommunity = ref<Card[]>([])

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

const positions = computed(() => {
  if (!settings.value) return []
  return assignPositions(settings.value.playerCount, dealerSeat.value)
})

const heroPosition = computed(() => positions.value[0] || 'BTN')
const heroHoleCards = computed(() => holeCards.value.get(0) || null)

// Stake info
const stake = computed(() => config.stakes.find(s => s.level === (settings.value?.stakeLevel || 3))!)
const bb = computed(() => stake.value?.bb || 2)
const startingStack = computed(() => bb.value * (settings.value?.stackBB || 100))

// Bet control props
const toCall = computed(() => Math.max(0, currentBet.value - heroBet.value))
const minRaise = computed(() => Math.max(currentBet.value + bb.value, currentBet.value * 2))
const maxRaise = computed(() => heroChips.value)
const heroTurn = computed(() => dealt.value && !heroFolded.value && street.value !== 'showdown')

// Generate opponent stats from bot persona configs (simulated — real tracking in Phase 5)
const opponentStats = computed(() => {
  if (!settings.value) return []
  return settings.value.botConfigs.slice(0, settings.value.playerCount - 1).map(bot => ({
    name: bot.name,
    handsPlayed: 25, // simulated sample size
    vpip: bot.vpip * 100,
    pfr: bot.pfr * 100,
    af: bot.aggression,
    wtsd: bot.vpip > 0.25 ? 35 : 22, // loose players see more showdowns
  }))
})

const players = computed(() => {
  if (!settings.value) return []

  return Array.from({ length: settings.value.playerCount }, (_, i) => {
    const isHero = i === 0
    const botConfig = !isHero ? settings.value!.botConfigs[i - 1] : null
    return {
      id: i,
      name: isHero ? settings.value!.heroName : (botConfig?.name || `Bot ${i}`),
      chips: isHero ? heroChips.value : startingStack.value,
      position: positions.value[i] || '',
      isHero,
      holeCards: holeCards.value.get(i) || null,
      showCards: isHero,
      folded: isHero ? heroFolded.value : false,
    }
  })
})

function handleStart(gameSettings: GameSettings) {
  settings.value = gameSettings
  phase.value = 'table'
  setTimeout(dealNewHand, 300)
}

function dealNewHand() {
  const count = settings.value?.playerCount || 2

  // Build and shuffle a full 52-card deck
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

  let idx = 0
  const cards = new Map<number, [Card, Card]>()
  for (let i = 0; i < count; i++) {
    cards.set(i, [deck[idx++], deck[idx++]])
  }
  holeCards.value = cards

  idx++ // burn
  const community: Card[] = [deck[idx++], deck[idx++], deck[idx++]]
  idx++ // burn
  community.push(deck[idx++])
  idx++ // burn
  community.push(deck[idx++])
  allCommunity.value = community

  // Reset betting state
  heroChips.value = startingStack.value
  pot.value = bb.value + (bb.value / 2) // SB + BB
  currentBet.value = bb.value
  heroBet.value = 0
  heroFolded.value = false
  street.value = 'preflop'
  dealt.value = true
}

function advanceStreet() {
  currentBet.value = 0
  heroBet.value = 0

  switch (street.value) {
    case 'preflop':
      street.value = 'flop'
      break
    case 'flop':
      street.value = 'turn'
      break
    case 'turn':
      street.value = 'river'
      break
    case 'river':
      street.value = 'showdown'
      break
    case 'showdown':
      dealNewHand()
      return
  }

  // Simulate a random bot bet for the new street (so there's something to react to)
  if (street.value !== 'showdown') {
    const betSizes = [0, 0, 0.33, 0.5, 0.66, 0.75, 1.0]
    const randomBet = betSizes[Math.floor(Math.random() * betSizes.length)]
    if (randomBet > 0) {
      const betAmount = Math.round(pot.value * randomBet)
      currentBet.value = betAmount
      pot.value += betAmount
    }
  }
}

function handleFold() {
  heroFolded.value = true
  // Skip to next hand after a beat
  setTimeout(() => {
    dealNewHand()
  }, 1500)
}

function handleCheck() {
  advanceStreet()
}

function handleCall(amount: number) {
  heroChips.value -= amount
  heroBet.value += amount
  pot.value += amount
  advanceStreet()
}

function handleRaise(amount: number) {
  // Guard: never bet more than stack
  const cappedAmount = Math.min(amount, heroChips.value + heroBet.value)
  const totalToAdd = cappedAmount - heroBet.value
  heroChips.value -= totalToAdd
  heroBet.value = cappedAmount
  pot.value += totalToAdd
  currentBet.value = cappedAmount
  advanceStreet()
}

// Check for hero bust-out after each hand
function checkBustOut() {
  if (heroChips.value <= 0) {
    heroFolded.value = true
    // Could show a game-over screen here in Phase 3
  }
}

function rotateDealerAndDeal() {
  if (!settings.value) return
  dealerSeat.value = (dealerSeat.value + 1) % settings.value.playerCount
  dealNewHand()
}

function backToSetup() {
  phase.value = 'setup'
  settings.value = null
  holeCards.value = new Map()
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
    <!-- Setup Screen -->
    <SetupScreen
      v-if="phase === 'setup'"
      @start="handleStart"
    />

    <!-- Game Table + Stats -->
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
          <!-- Hero bankroll -->
          <div class="flex items-center gap-1.5 bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-1">
            <span class="text-xs text-gray-400">Stack</span>
            <span
              class="text-base font-bold font-mono"
              :class="heroChips >= startingStack ? 'text-green-400' : 'text-red-400'"
            >
              {{ formatPot(heroChips) }}
            </span>
            <span
              v-if="heroChips !== startingStack"
              class="text-xs font-mono"
              :class="heroChips >= startingStack ? 'text-green-500/60' : 'text-red-500/60'"
            >
              ({{ heroChips >= startingStack ? '+' : '' }}{{ formatPot(heroChips - startingStack) }})
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            @click="rotateDealerAndDeal"
          >
            Rotate Dealer
          </UButton>
          <UColorModeToggle />
        </div>
      </div>

      <!-- Main layout: Table + Stats Panel -->
      <div class="flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto items-start">
        <!-- Table + Controls column -->
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
                class="w-16 h-[5.5rem] rounded-lg border border-dashed border-green-800/40"
              />
            </template>

            <template #pot>
              <div class="text-center text-yellow-400 font-bold text-sm">
                Pot: {{ formatPot(pot) }}
              </div>
            </template>

            <template #seat="{ seatIndex }">
              <PlayerSeat
                v-if="players[seatIndex]"
                :name="players[seatIndex].name"
                :chips="players[seatIndex].chips"
                :position="players[seatIndex].position"
                :hole-cards="players[seatIndex].holeCards"
                :show-cards="players[seatIndex].showCards"
                :is-hero="players[seatIndex].isHero"
                :is-active="seatIndex === 0 && heroTurn"
                :folded="players[seatIndex].folded"
                :stake-level="settings?.stakeLevel || 3"
                :peekable="!players[seatIndex].isHero"
              />
            </template>
          </PokerTable>

          <!-- Bet Controls -->
          <BetControls
            v-if="dealt && street !== 'showdown'"
            :pot="pot"
            :to-call="toCall"
            :min-raise="minRaise"
            :max-raise="maxRaise"
            :bb="bb"
            :enabled="heroTurn"
            @fold="handleFold"
            @check="handleCheck"
            @call="handleCall"
            @raise="handleRaise"
          />

          <!-- Showdown / folded state -->
          <div v-if="street === 'showdown' || heroFolded" class="flex justify-center">
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
          :num-opponents="(settings?.playerCount || 2) - 1"
          :position="heroPosition"
          :pot="pot"
          :to-call="toCall"
          :hero-chips="heroChips"
          :player-stats="opponentStats"
        />
      </div>
    </div>
  </div>
</template>
