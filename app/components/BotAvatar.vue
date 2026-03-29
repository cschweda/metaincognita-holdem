<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  size?: 'sm' | 'md' | 'lg'
  isPro?: boolean
}>(), {
  size: 'md',
  isPro: false,
})

const HUES = [15, 30, 200, 220, 260, 280, 310, 340, 45, 170, 190, 330, 0, 55, 240]

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return props.name.slice(0, 2).toUpperCase()
})

const bgColor = computed(() => {
  let hash = 0
  for (const ch of props.name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  const hue = HUES[Math.abs(hash) % HUES.length]
  return `hsl(${hue}, 50%, 38%)`
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-8 h-8 text-xs'
    case 'lg': return 'w-16 h-16 text-lg'
    default: return 'w-11 h-11 text-sm'
  }
})
</script>

<template>
  <div
    class="rounded-full flex items-center justify-center font-bold text-white select-none shrink-0"
    :class="[sizeClasses, isPro ? 'ring-2 ring-amber-500/60' : '']"
    :style="{ backgroundColor: bgColor }"
  >
    {{ initials }}
  </div>
</template>
