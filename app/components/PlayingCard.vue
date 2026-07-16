<script setup lang="ts">
/**
 * Playing card with CSS 3D flip animation between face-down and face-up states.
 * Shows rank in corners + large center suit symbol. Supports sm/md/lg sizes.
 * Red for hearts/diamonds, dark for clubs/spades.
 */
import { computed } from 'vue'
import { RANK_DISPLAY, SUIT_SYMBOLS, type Card } from '~/utils/cards'

const props = withDefaults(defineProps<{
  card?: Card | null
  faceUp?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  card: null,
  faceUp: false,
  size: 'md',
})

// Each size shrinks below the `sm` breakpoint (640px) so the table fits phone
// viewports without per-usage overrides.
const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return { card: 'w-10 h-14 sm:w-16 sm:h-[5.5rem]', rank: 'text-sm sm:text-base', suit: 'text-lg sm:text-2xl', corner: 'text-[0.6rem] sm:text-xs' }
    case 'lg': return { card: 'w-20 h-[7.25rem] sm:w-28 sm:h-[10rem]', rank: 'text-xl sm:text-3xl', suit: 'text-3xl sm:text-5xl', corner: 'text-sm sm:text-base' }
    default: return { card: 'w-14 h-20 sm:w-20 sm:h-[7rem]', rank: 'text-base sm:text-xl', suit: 'text-xl sm:text-3xl', corner: 'text-xs sm:text-sm' }
  }
})

const isRed = computed(() => {
  return props.card && (props.card.suit === 'hearts' || props.card.suit === 'diamonds')
})

const suitColor = computed(() => isRed.value ? '#dc2626' : '#1a1a1a')
</script>

<template>
  <div :class="sizeClasses.card" class="card-perspective">
    <div class="card-inner" :class="{ 'is-flipped': faceUp && card }">

      <!-- Card back -->
      <div class="card-face card-back">
        <div class="absolute inset-[3px] rounded-md border border-yellow-700/40"
          style="background: repeating-linear-gradient(45deg, #6b1a1a 0px, #6b1a1a 3px, #1a1a4c 3px, #1a1a4c 6px);"
        />
      </div>

      <!-- Card face -->
      <div class="card-face card-front">
        <template v-if="card">
          <!-- Top-left corner: rank + small suit -->
          <div class="absolute top-1 left-1.5 flex flex-col items-center leading-none" :style="{ color: suitColor }">
            <span class="font-bold" :class="sizeClasses.corner">{{ RANK_DISPLAY[card.rank] }}</span>
            <span :class="sizeClasses.corner">{{ SUIT_SYMBOLS[card.suit] }}</span>
          </div>

          <!-- Center: large suit -->
          <div class="absolute inset-0 flex items-center justify-center" :style="{ color: suitColor }">
            <span class="font-normal leading-none" :class="sizeClasses.suit">
              {{ SUIT_SYMBOLS[card.suit] }}
            </span>
          </div>

          <!-- Bottom-right corner: rank + small suit (rotated) -->
          <div class="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180" :style="{ color: suitColor }">
            <span class="font-bold" :class="sizeClasses.corner">{{ RANK_DISPLAY[card.rank] }}</span>
            <span :class="sizeClasses.corner">{{ SUIT_SYMBOLS[card.suit] }}</span>
          </div>
        </template>
      </div>

    </div>
  </div>
</template>

<style scoped>
.card-perspective {
  perspective: 800px;
}
.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.5s ease;
}
.card-inner.is-flipped {
  transform: rotateY(180deg);
}
.card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 0.5rem;
  overflow: hidden;
}
.card-front {
  transform: rotateY(180deg);
  background: #fafaf9;
  border: 1px solid #d4d4d4;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
.card-back {
  background: #2a1a3e;
  border: 1px solid #4b3560;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
</style>
