<script setup lang="ts">
/**
 * Main game page — shows setup screen or poker table.
 * Phase 1: Visual foundation with authentic deal sequence.
 */
import config from '~/holdem.config'
import { assignPositions } from '~/utils/seats'
import type { Card } from '~/utils/cards'
import type { GameSettings } from '~/components/SetupScreen.vue'

const phase = ref<'setup' | 'table'>('setup')
const settings = ref<GameSettings | null>(null)

// Deal state
const dealerSeat = ref(0)
const holeCards = ref<Map<number, [Card, Card]>>(new Map())
const communityCards = ref<Card[]>([])
const street = ref<'preflop' | 'flop' | 'turn' | 'river' | 'showdown'>('preflop')
const dealt = ref(false)

// All 5 community cards are generated at deal time, but only revealed per street
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

const players = computed(() => {
  if (!settings.value) return []
  const stake = config.stakes.find(s => s.level === settings.value!.stakeLevel)!
  const startingStack = stake.bb * settings.value.stackBB

  return Array.from({ length: settings.value.playerCount }, (_, i) => {
    const isHero = i === 0
    const botConfig = !isHero ? settings.value!.botConfigs[i - 1] : null
    return {
      id: i,
      name: isHero ? settings.value!.heroName : (botConfig?.name || `Bot ${i}`),
      chips: startingStack,
      position: positions.value[i] || '',
      isHero,
      holeCards: holeCards.value.get(i) || null,
      // Hero always sees their cards; bots only at showdown
      showCards: isHero || street.value === 'showdown',
      folded: false,
    }
  })
})

const nextStreetLabel = computed(() => {
  switch (street.value) {
    case 'preflop': return 'Deal Flop'
    case 'flop': return 'Deal Turn'
    case 'turn': return 'Deal River'
    case 'river': return 'Showdown'
    case 'showdown': return 'New Hand'
    default: return 'Deal'
  }
})

function handleStart(gameSettings: GameSettings) {
  settings.value = gameSettings
  phase.value = 'table'
  setTimeout(dealNewHand, 300)
}

function randomCard(): Card {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
  return {
    rank: Math.floor(Math.random() * 13) + 2,
    suit: suits[Math.floor(Math.random() * 4)],
  }
}

function dealNewHand() {
  const count = settings.value?.playerCount || 2

  // Deal hole cards to all players
  const cards = new Map<number, [Card, Card]>()
  for (let i = 0; i < count; i++) {
    cards.set(i, [randomCard(), randomCard()])
  }
  holeCards.value = cards

  // Pre-generate all 5 community cards (revealed in stages)
  allCommunity.value = Array.from({ length: 5 }, () => randomCard())
  communityCards.value = []

  street.value = 'preflop'
  dealt.value = true
}

function advanceStreet() {
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
      break
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
  communityCards.value = []
  dealt.value = false
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Setup Screen -->
    <SetupScreen
      v-if="phase === 'setup'"
      @start="handleStart"
    />

    <!-- Game Table -->
    <div v-else class="p-4">
      <!-- Top bar -->
      <div class="flex items-center justify-between mb-4 max-w-5xl mx-auto">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          icon="i-lucide-arrow-left"
          @click="backToSetup"
        >
          Setup
        </UButton>

        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-400">
            {{ config.stakes.find(s => s.level === settings?.stakeLevel)?.name }}
            — ${{ config.stakes.find(s => s.level === settings?.stakeLevel)?.sb }}/${{ config.stakes.find(s => s.level === settings?.stakeLevel)?.bb }}
          </span>
          <span class="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 uppercase tracking-wide">
            {{ street }}
          </span>
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

      <!-- Poker Table -->
      <PokerTable :player-count="settings?.playerCount || 6">
        <template #community>
          <PlayingCard
            v-for="(card, i) in visibleCommunity"
            :key="i"
            :card="card"
            :face-up="true"
            size="md"
          />
          <!-- Empty slots for unrevealed community cards -->
          <div
            v-for="i in (5 - visibleCommunity.length)"
            :key="'empty-' + i"
            class="w-14 h-20 rounded-lg border border-dashed border-green-800/40"
          />
        </template>

        <template #pot>
          <div class="text-center text-yellow-400 font-bold text-sm">
            Pot: ${{ (config.stakes.find(s => s.level === settings?.stakeLevel)?.bb || 2) * 3 }}
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
            :is-active="seatIndex === 0 && street !== 'showdown'"
            :folded="false"
            :stake-level="settings?.stakeLevel || 3"
          />
        </template>
      </PokerTable>

      <!-- Street advancement controls -->
      <div class="flex justify-center mt-6 gap-3">
        <UButton
          v-if="dealt"
          color="primary"
          size="lg"
          @click="advanceStreet"
        >
          {{ nextStreetLabel }}
        </UButton>
      </div>
    </div>
  </div>
</template>
