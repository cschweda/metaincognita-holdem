<script setup lang="ts">
/**
 * Player nameplate — name, chip count, position badge, hole cards, and chip stack.
 * Bot cards can be clicked to peek (flip face-up then back).
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
  stakeLevel?: number
  peekable?: boolean
}>(), {
  holeCards: null,
  showCards: false,
  isHero: false,
  isActive: false,
  folded: false,
  stakeLevel: 3,
  peekable: false,
})

const peeking = ref(false)

function togglePeek() {
  if (!props.peekable || props.isHero || !props.holeCards) return
  peeking.value = !peeking.value
}

const cardsVisible = computed(() => props.showCards || peeking.value)

const formattedChips = computed(() => {
  if (props.chips >= 1000) return `$${(props.chips / 1000).toFixed(1)}k`
  return `$${props.chips}`
})
</script>

<template>
  <div
    class="flex flex-col items-center gap-1 transition-all duration-300"
    :class="{ 'opacity-40': folded }"
  >
    <!-- Hole cards -->
    <div
      class="flex gap-0.5 -mb-1"
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
        <div class="w-10 h-14 rounded-lg border border-dashed border-gray-600/30" />
        <div class="w-10 h-14 rounded-lg border border-dashed border-gray-600/30" />
      </template>
    </div>

    <!-- Peek indicator -->
    <div
      v-if="peeking && !isHero"
      class="text-[0.55rem] text-yellow-400/70 -mt-0.5"
    >
      peeking
    </div>

    <!-- Nameplate -->
    <div
      class="rounded-lg px-3 py-1.5 text-center min-w-24 border shadow-lg transition-shadow duration-300"
      :class="[
        isHero
          ? 'bg-amber-900/80 border-amber-600/50 text-amber-50'
          : 'bg-gray-800/80 border-gray-600/40 text-gray-100',
        isActive ? 'ring-2 ring-green-400/60 shadow-green-400/20' : '',
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

    <!-- Chip stack visual -->
    <ChipStack
      v-if="chips > 0"
      :amount="chips"
      :stake-level="stakeLevel"
      compact
    />
  </div>
</template>
