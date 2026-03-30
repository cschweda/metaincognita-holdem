<script setup lang="ts">
/**
 * The poker table — CSS ellipse with felt texture, walnut rail, and green glow.
 * Seats are positioned around the table using polar coordinates.
 * The table felt stays dark emerald green in both light and dark mode.
 */
import { computed } from 'vue'
import { getSeatCoordinates } from '~/utils/seats'

const props = defineProps<{
  playerCount: number
  communityCards?: { rank: number; suit: string }[]
}>()

const seats = computed(() => {
  return Array.from({ length: props.playerCount }, (_, i) => ({
    index: i,
    coords: getSeatCoordinates(i, props.playerCount),
  }))
})
</script>

<template>
  <div class="relative w-full max-w-5xl aspect-[16/10] mx-auto">
    <!-- Outer rail (walnut) -->
    <div
      class="absolute inset-0 rounded-[50%] shadow-2xl"
      style="
        background: linear-gradient(135deg, #6b4423 0%, #5c3a1e 40%, #3d2713 100%);
        box-shadow:
          inset 0 2px 8px rgba(255, 255, 255, 0.15),
          inset 0 -4px 12px rgba(0, 0, 0, 0.4),
          0 8px 32px rgba(0, 0, 0, 0.5);
      "
    />

    <!-- Inner felt (always emerald green, immune to color mode) -->
    <div
      class="absolute rounded-[50%]"
      style="
        inset: 5%;
        background: radial-gradient(ellipse at center, #0d7a48 0%, #0a5c36 50%, #074a2b 100%);
        box-shadow:
          inset 0 4px 20px rgba(0, 0, 0, 0.4),
          inset 0 0 60px rgba(16, 185, 100, 0.15);
      "
    >
      <!-- Center glow -->
      <div
        class="absolute inset-0 rounded-[50%] opacity-30"
        style="
          background: radial-gradient(ellipse at center, rgba(16, 185, 100, 0.3) 0%, transparent 60%);
        "
      />

      <!-- Community cards area -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="flex gap-2">
          <slot name="community" />
        </div>
      </div>

      <!-- Pot display -->
      <div class="absolute left-1/2 -translate-x-1/2 top-[30%]">
        <slot name="pot" />
      </div>
    </div>

    <!-- Player seats -->
    <div
      v-for="seat in seats"
      :key="seat.index"
      class="absolute -translate-x-1/2 -translate-y-1/2 z-10"
      :style="{
        left: `${seat.coords.x}%`,
        top: `${seat.coords.y}%`,
      }"
    >
      <slot name="seat" :seat-index="seat.index" />
    </div>
  </div>
</template>
