<script setup lang="ts">
/**
 * Color-coded position badge — white for dealer/BTN, blue for SB,
 * yellow for BB, gray for all other positions (UTG, MP, CO, etc.).
 */
const props = defineProps<{
  position: string
}>()

const isDealer = computed(() =>
  props.position === 'D' || props.position === 'D/SB' || props.position === 'D/BTN' || props.position === 'BTN'
)

const badgeClass = computed(() => {
  if (isDealer.value) return 'bg-white text-gray-900 border-gray-300 font-bold'
  if (props.position === 'SB') return 'bg-blue-600/80 text-white border-blue-400'
  if (props.position === 'BB') return 'bg-yellow-600/80 text-white border-yellow-400'
  return 'bg-gray-600/60 text-gray-200 border-gray-500'
})
</script>

<template>
  <span
    class="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[0.6rem] border leading-none min-w-5"
    :class="badgeClass"
  >
    {{ position }}
  </span>
</template>
