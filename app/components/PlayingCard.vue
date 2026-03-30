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
    case 'sm': return 'w-13 h-[4.5rem] text-xs'
    case 'lg': return 'w-24 h-[8.5rem] text-xl'
    default: return 'w-16 h-[5.5rem] text-sm'
  }
})

const isCourtCard = computed(() => {
  return props.card && props.card.rank >= 11 && props.card.rank <= 13
})

const courtSymbol = computed(() => {
  if (!props.card) return ''
  switch (props.card.rank) {
    case 11: return '♞'
    case 12: return '♛'
    case 13: return '♚'
    default: return ''
  }
})

const pips = computed(() => {
  if (!props.card || props.card.rank > 10) return []
  return PIP_LAYOUTS[props.card.rank] || []
})
</script>

<template>
  <!-- Perspective wrapper -->
  <div :class="sizeClasses" class="card-perspective">
    <!-- Inner container that flips -->
    <div
      class="card-inner"
      :class="{ 'is-flipped': faceUp && card }"
    >
      <!-- Card back (default visible side) -->
      <div class="card-face card-back">
        <div class="card-back-pattern">
          <div class="card-back-inset">
            <div class="card-back-center">
              <span>♠</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Card face (hidden until flipped) -->
      <div class="card-face card-front">
        <template v-if="card">
          <!-- Top-left rank + suit -->
          <div class="card-corner card-corner-top" :class="SUIT_COLORS[card.suit]">
            <span class="font-bold leading-none">{{ RANK_DISPLAY[card.rank] }}</span>
            <span class="leading-none -mt-0.5">{{ SUIT_SYMBOLS[card.suit] }}</span>
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
          <div class="card-corner card-corner-bottom" :class="SUIT_COLORS[card.suit]">
            <span class="font-bold leading-none">{{ RANK_DISPLAY[card.rank] }}</span>
            <span class="leading-none -mt-0.5">{{ SUIT_SYMBOLS[card.suit] }}</span>
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
  border: 1px solid;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.card-front {
  transform: rotateY(180deg);
  background: white;
  border-color: #d1d5db;
  display: flex;
  flex-direction: column;
}

.card-back {
  border-color: #4b5563;
}

.card-back-pattern {
  width: 100%;
  height: 100%;
  background: repeating-linear-gradient(
    45deg,
    #8b1a1a 0px, #8b1a1a 4px,
    #1a1a5c 4px, #1a1a5c 8px
  );
  padding: 4px;
}

.card-back-inset {
  width: 100%;
  height: 100%;
  border-radius: 0.25rem;
  border: 2px solid rgba(202, 138, 4, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(
    -45deg,
    #8b1a1a 0px, #8b1a1a 3px,
    #1a1a5c 3px, #1a1a5c 6px
  );
}

.card-back-center {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: 1px solid rgba(202, 138, 4, 0.4);
  background: rgba(120, 53, 15, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(234, 179, 8, 0.5);
  font-size: 0.5rem;
}

.card-corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card-corner-top {
  top: 2px;
  left: 4px;
}

.card-corner-bottom {
  bottom: 2px;
  right: 4px;
  transform: rotate(180deg);
}
</style>
