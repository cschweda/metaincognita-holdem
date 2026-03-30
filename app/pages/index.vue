<script setup lang="ts">
/**
 * Main game page — shows setup screen or poker table.
 * Phase 1: Visual foundation with demo deal animation.
 */
import config from '~/holdem.config.js'
import { assignPositions } from '~/utils/seats'
import type { Card } from '~/utils/cards'
import type { GameSettings } from '~/components/SetupScreen.vue'

const phase = ref<'setup' | 'table'>('setup')
const settings = ref<GameSettings | null>(null)

// Demo state for Phase 1 (no real game logic yet)
const dealerSeat = ref(0)
const demoHoleCards = ref<Map<number, [Card, Card]>>(new Map())
const demoCommunity = ref<Card[]>([])
const showHeroCards = ref(false)

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
      holeCards: demoHoleCards.value.get(i) || null,
      showCards: isHero && showHeroCards.value,
      folded: false,
    }
  })
})

function handleStart(gameSettings: GameSettings) {
  settings.value = gameSettings
  phase.value = 'table'
  // Demo deal after a short delay
  setTimeout(demoDealer, 500)
}

/**
 * Demo dealing — creates placeholder cards for visual testing.
 * Real deck/shuffle comes in Phase 2.
 */
function demoDealer() {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
  const cards = new Map<number, [Card, Card]>()

  for (let i = 0; i < (settings.value?.playerCount || 2); i++) {
    cards.set(i, [
      { rank: Math.floor(Math.random() * 13) + 2, suit: suits[Math.floor(Math.random() * 4)] },
      { rank: Math.floor(Math.random() * 13) + 2, suit: suits[Math.floor(Math.random() * 4)] },
    ])
  }
  demoHoleCards.value = cards
  showHeroCards.value = true

  // Demo community cards after a delay
  setTimeout(() => {
    demoCommunity.value = Array.from({ length: 5 }, () => ({
      rank: Math.floor(Math.random() * 13) + 2,
      suit: suits[Math.floor(Math.random() * 4)],
    }))
  }, 1000)
}

function rotateDealerDemo() {
  if (!settings.value) return
  dealerSeat.value = (dealerSeat.value + 1) % settings.value.playerCount
  demoHoleCards.value = new Map()
  demoCommunity.value = []
  showHeroCards.value = false
  setTimeout(demoDealer, 500)
}

function backToSetup() {
  phase.value = 'setup'
  settings.value = null
  demoHoleCards.value = new Map()
  demoCommunity.value = []
  showHeroCards.value = false
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 dark:bg-gray-950 text-white">
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

        <div class="text-sm text-gray-400">
          {{ config.stakes.find(s => s.level === settings?.stakeLevel)?.name }}
          — ${{ config.stakes.find(s => s.level === settings?.stakeLevel)?.sb }}/${{ config.stakes.find(s => s.level === settings?.stakeLevel)?.bb }}
        </div>

        <div class="flex items-center gap-2">
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            @click="rotateDealerDemo"
          >
            Rotate Dealer
          </UButton>
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            @click="demoDealer"
          >
            Re-Deal
          </UButton>
          <UColorModeToggle />
        </div>
      </div>

      <!-- Poker Table -->
      <PokerTable :player-count="settings?.playerCount || 6">
        <template #community>
          <PlayingCard
            v-for="(card, i) in demoCommunity"
            :key="i"
            :card="card"
            :face-up="true"
            size="md"
          />
        </template>

        <template #pot>
          <div
            v-if="demoCommunity.length > 0"
            class="text-center text-yellow-400 font-bold text-sm"
          >
            Pot: ${{ (config.stakes.find(s => s.level === settings?.stakeLevel)?.bb || 2) * 6 }}
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
            :is-active="seatIndex === 0"
            :folded="false"
            :stake-level="settings?.stakeLevel || 3"
          />
        </template>
      </PokerTable>
    </div>
  </div>
</template>
