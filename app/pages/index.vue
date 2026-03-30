<script setup lang="ts">
/**
 * Main game page — shows setup screen or poker table.
 * Phase 1: Visual foundation with authentic deal sequence + live stats.
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
const street = ref<'preflop' | 'flop' | 'turn' | 'river' | 'showdown'>('preflop')
const dealt = ref(false)

// All 5 community cards generated at deal time, revealed per street
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
      // Hero always sees their cards; bots revealed at showdown
      showCards: isHero,
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

/**
 * Deal from a shuffled deck (Fisher-Yates) to avoid duplicate cards.
 */
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
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]]
  }

  let idx = 0

  // Deal 2 hole cards to each player
  const cards = new Map<number, [Card, Card]>()
  for (let i = 0; i < count; i++) {
    cards.set(i, [deck[idx++], deck[idx++]])
  }
  holeCards.value = cards

  // Burn + flop (3), burn + turn (1), burn + river (1) = 3 burns + 5 community
  idx++ // burn before flop
  const community: Card[] = [deck[idx++], deck[idx++], deck[idx++]]
  idx++ // burn before turn
  community.push(deck[idx++])
  idx++ // burn before river
  community.push(deck[idx++])

  allCommunity.value = community
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

      <!-- Main layout: Table + Stats Panel -->
      <div class="flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto items-start">
        <!-- Poker Table -->
        <div class="flex-1 min-w-0">
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
                :peekable="!players[seatIndex].isHero"
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

        <!-- Stats Panel -->
        <StatsPanel
          :hole-cards="heroHoleCards as [import('~/utils/cards').Card, import('~/utils/cards').Card] | null"
          :community="visibleCommunity"
          :street="street"
          :num-opponents="(settings?.playerCount || 2) - 1"
          :position="heroPosition"
        />
      </div>
    </div>
  </div>
</template>
