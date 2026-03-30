<script setup lang="ts">
/**
 * Player seat display — nameplate (name, chip count, position badge), hole cards
 * with peek-to-reveal for bot cards, last-action badge (fold/check/call/raise/all-in/blinds),
 * tilt indicator, and fold/eliminated states. Hero seat is visually distinguished.
 */
import type { Card } from '~/utils/cards'

const props = withDefaults(defineProps<{
  name: string
  chips: number
  position: string
  holeCards?: [Card, Card] | null
  showCards?: boolean
  isHero?: boolean
  isActive?: boolean
  folded?: boolean
  eliminated?: boolean
  stakeLevel?: number
  peekable?: boolean
  lastAction?: string | null
  currentBetAmount?: number
  tilted?: boolean
  tiltSeverity?: number
}>(), {
  holeCards: null,
  showCards: false,
  isHero: false,
  isActive: false,
  folded: false,
  eliminated: false,
  stakeLevel: 3,
  peekable: false,
  lastAction: null,
  currentBetAmount: 0,
  tilted: false,
  tiltSeverity: 0,
})

const peeking = ref(false)

function togglePeek() {
  if (!props.peekable || props.isHero || !props.holeCards || props.folded) return
  peeking.value = !peeking.value
}

const cardsVisible = computed(() => props.showCards || peeking.value)

const formattedChips = computed(() => {
  if (props.chips >= 1000) return `$${(props.chips / 1000).toFixed(1)}k`
  return `$${props.chips}`
})

const actionBadge = computed(() => {
  if (!props.lastAction) return null
  switch (props.lastAction) {
    case 'fold': return { text: 'FOLD', color: 'bg-red-600/90 text-red-100' }
    case 'check': return { text: 'CHECK', color: 'bg-gray-600/90 text-gray-200' }
    case 'call': return { text: `CALL $${props.currentBetAmount}`, color: 'bg-blue-600/90 text-blue-100' }
    case 'raise': return { text: `RAISE $${props.currentBetAmount}`, color: 'bg-green-600/90 text-green-100' }
    case 'bet': return { text: `BET $${props.currentBetAmount}`, color: 'bg-green-600/90 text-green-100' }
    case 'all-in': return { text: 'ALL-IN', color: 'bg-amber-600/90 text-amber-100 animate-pulse' }
    case 'sb': return { text: `SB $${props.currentBetAmount}`, color: 'bg-gray-600/60 text-gray-300' }
    case 'bb': return { text: `BB $${props.currentBetAmount}`, color: 'bg-gray-600/60 text-gray-300' }
    default: return null
  }
})
</script>

<template>
  <div
    v-if="!eliminated"
    class="flex flex-col items-center gap-1 transition-all duration-300 relative"
    :class="{ 'opacity-30 grayscale': folded }"
  >
    <!-- Action badge (floats above everything) -->
    <div
      v-if="actionBadge"
      class="absolute -top-5 left-1/2 -translate-x-1/2 z-20
             px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wide
             shadow-lg whitespace-nowrap"
      :class="actionBadge.color"
    >
      {{ actionBadge.text }}
    </div>

    <!-- Hole cards (hidden once folded) -->
    <div
      v-if="!folded"
      class="flex gap-2"
      :class="{ 'cursor-pointer': peekable && !isHero && holeCards }"
      @click="togglePeek"
    >
      <template v-if="holeCards">
        <PlayingCard
          :card="holeCards[0]"
          :face-up="cardsVisible"
          size="sm"
        />
        <PlayingCard
          :card="holeCards[1]"
          :face-up="cardsVisible"
          size="sm"
        />
      </template>
      <template v-else>
        <div class="w-16 h-[5.5rem] rounded-lg border border-dashed border-gray-600/30" />
        <div class="w-16 h-[5.5rem] rounded-lg border border-dashed border-gray-600/30" />
      </template>
    </div>

    <!-- Folded indicator (replaces cards) -->
    <div v-if="folded" class="h-[5.5rem] flex items-center">
      <span class="text-xs text-red-400/60 uppercase tracking-wide font-semibold">Folded</span>
    </div>

    <!-- Tilt indicator -->
    <div
      v-if="tilted && !folded"
      class="text-[0.55rem] font-bold uppercase tracking-wider"
      :class="tiltSeverity >= 0.8 ? 'text-red-400 animate-pulse' : 'text-orange-400'"
    >
      {{ tiltSeverity >= 0.8 ? 'FULL TILT' : 'TILTED' }}
    </div>

    <!-- Nameplate -->
    <div
      class="rounded-lg px-3 py-1.5 text-center min-w-24 border shadow-lg transition-all duration-300"
      :class="[
        isHero
          ? 'bg-amber-900/80 border-amber-600/50 text-amber-50'
          : 'bg-gray-800/80 border-gray-600/40 text-gray-100',
        isActive
          ? 'ring-2 ring-green-400/70 shadow-green-400/30 scale-105'
          : '',
        folded ? 'border-red-900/30' : '',
        tilted && !folded ? 'border-red-500/40 shadow-red-500/10' : '',
      ]"
    >
      <div class="flex items-center justify-center gap-1.5">
        <PositionBadge :position="position" />
        <span class="font-semibold text-sm truncate max-w-20">{{ name }}</span>
      </div>
      <div class="text-xs mt-0.5 font-mono" :class="chips > 0 ? 'text-green-400' : 'text-red-400'">
        {{ formattedChips }}
      </div>
    </div>
  </div>
</template>
