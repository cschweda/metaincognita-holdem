<script setup lang="ts">
/**
 * A single playing card with face/back display and flip animation.
 * Uses CSS 3D transforms for the flip effect.
 */
import { computed } from 'vue'
import {
  RANK_DISPLAY,
  SUIT_SYMBOLS,
  SUIT_COLORS,
  PIP_LAYOUTS,
  type Card,
} from '~/utils/cards'

const props = withDefaults(defineProps<{
  card?: Card | null
  faceUp?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  card: null,
  faceUp: false,
  size: 'md',
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-10 h-14 text-xs'
    case 'lg': return 'w-20 h-28 text-lg'
    default: return 'w-14 h-20 text-sm'
  }
})

const isCourtCard = computed(() => {
  return props.card && props.card.rank >= 11
})

const courtSymbol = computed(() => {
  if (!props.card) return ''
  switch (props.card.rank) {
    case 11: return '♞' // Jack
    case 12: return '♛' // Queen
    case 13: return '♚' // King
    default: return ''
  }
})

const pips = computed(() => {
  if (!props.card || props.card.rank > 10) return []
  return PIP_LAYOUTS[props.card.rank] || []
})
</script>

<template>
  <div
    class="relative preserve-3d transition-transform duration-500"
    :class="[sizeClasses, { 'rotate-y-180': faceUp && card }]"
    style="perspective: 600px;"
  >
    <!-- Card face -->
    <div
      class="absolute inset-0 backface-hidden rounded-lg border shadow-md rotate-y-180 flex flex-col overflow-hidden"
      :class="[
        'bg-white dark:bg-gray-50 border-gray-200',
      ]"
    >
      <template v-if="card">
        <!-- Top-left rank + suit -->
        <div
          class="absolute top-0.5 left-1 flex flex-col items-center leading-none"
          :class="SUIT_COLORS[card.suit]"
        >
          <span class="font-bold">{{ RANK_DISPLAY[card.rank] }}</span>
          <span class="-mt-0.5">{{ SUIT_SYMBOLS[card.suit] }}</span>
        </div>

        <!-- Center area -->
        <div class="flex-1 flex items-center justify-center" :class="SUIT_COLORS[card.suit]">
          <template v-if="isCourtCard">
            <div class="text-3xl leading-none" :class="{ 'text-2xl': size === 'sm', 'text-4xl': size === 'lg' }">
              {{ courtSymbol }}
            </div>
          </template>
          <template v-else-if="card.rank === 14">
            <div class="text-3xl leading-none" :class="{ 'text-2xl': size === 'sm', 'text-4xl': size === 'lg' }">
              {{ SUIT_SYMBOLS[card.suit] }}
            </div>
          </template>
          <template v-else>
            <!-- Number card pip layout -->
            <div class="grid grid-cols-3 grid-rows-5 gap-0 w-full h-full p-1.5">
              <template v-for="row in 5" :key="row">
                <template v-for="col in 3" :key="`${row}-${col}`">
                  <div class="flex items-center justify-center text-[0.55em]">
                    <span v-if="pips.some(([r, c]) => r === row - 1 && c === col - 1)">
                      {{ SUIT_SYMBOLS[card.suit] }}
                    </span>
                  </div>
                </template>
              </template>
            </div>
          </template>
        </div>

        <!-- Bottom-right rank + suit (rotated) -->
        <div
          class="absolute bottom-0.5 right-1 flex flex-col items-center leading-none rotate-180"
          :class="SUIT_COLORS[card.suit]"
        >
          <span class="font-bold">{{ RANK_DISPLAY[card.rank] }}</span>
          <span class="-mt-0.5">{{ SUIT_SYMBOLS[card.suit] }}</span>
        </div>
      </template>
    </div>

    <!-- Card back -->
    <div
      class="absolute inset-0 backface-hidden rounded-lg border border-gray-600 shadow-md overflow-hidden"
      style="
        background:
          repeating-linear-gradient(
            45deg,
            #8b1a1a 0px,
            #8b1a1a 4px,
            #1a1a5c 4px,
            #1a1a5c 8px
          );
      "
    >
      <!-- Gold border inset -->
      <div
        class="absolute inset-1 rounded border-2 border-yellow-600/60 flex items-center justify-center"
        style="background: repeating-linear-gradient(
          -45deg,
          #8b1a1a 0px,
          #8b1a1a 3px,
          #1a1a5c 3px,
          #1a1a5c 6px
        );"
      >
        <div class="w-6 h-6 rounded-full border border-yellow-600/50 bg-yellow-900/30 flex items-center justify-center">
          <span class="text-yellow-500/60 text-[0.5rem]">♠</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preserve-3d {
  transform-style: preserve-3d;
}
.backface-hidden {
  backface-visibility: hidden;
}
.rotate-y-180 {
  transform: rotateY(180deg);
}
</style>
