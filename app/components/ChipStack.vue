<script setup lang="ts">
/**
 * Visual chip stack display — colored discs stacked with 3D offset.
 */
import { computed } from 'vue'
import { breakIntoChips, CHIP_COLORS } from '~/utils/chips'

const props = withDefaults(defineProps<{
  amount: number
  stakeLevel?: number
  compact?: boolean
}>(), {
  stakeLevel: 3,
  compact: false,
})

const stacks = computed(() => breakIntoChips(props.amount, props.stakeLevel))
</script>

<template>
  <div class="flex items-end gap-1">
    <div
      v-for="(stack, i) in stacks"
      :key="i"
      class="relative flex flex-col-reverse items-center"
    >
      <!-- Stacked chips (show up to 5 visually) -->
      <div
        v-for="chip in Math.min(stack.count, compact ? 3 : 5)"
        :key="chip"
        class="w-5 h-2 rounded-full border -mb-0.5 shadow-sm"
        :class="CHIP_COLORS[stack.color]"
      />
      <!-- Count label if more than displayed -->
      <span
        v-if="stack.count > (compact ? 3 : 5)"
        class="text-[0.5rem] text-gray-400 -mt-0.5"
      >
        ×{{ stack.count }}
      </span>
    </div>
  </div>
</template>
