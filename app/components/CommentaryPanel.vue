<script setup lang="ts">
/**
 * Live commentary panel — scrolling color commentary with on/off toggle
 * and mode selector (Hero POV vs TV broadcast).
 */
import type { CommentaryLine, CommentaryMode } from '~/composables/useCommentary'

const props = defineProps<{
  lines: readonly CommentaryLine[]
  enabled: boolean
  mode: CommentaryMode
}>()

const emit = defineEmits<{
  'update:enabled': [value: boolean]
  'update:mode': [value: CommentaryMode]
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const userScrolled = ref(false)

function onScroll() {
  if (!scrollContainer.value) return
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value
  userScrolled.value = scrollHeight - scrollTop - clientHeight > 40
}

watch(() => props.lines.length, () => {
  if (userScrolled.value || !scrollContainer.value) return
  nextTick(() => {
    scrollContainer.value?.scrollTo({ top: scrollContainer.value.scrollHeight, behavior: 'smooth' })
  })
})

const typeStyles: Record<string, string> = {
  deal: 'text-amber-300',
  action: 'text-gray-300',
  street: 'text-cyan-300',
  showdown: 'text-green-400 font-semibold',
  aside: 'text-gray-500 italic',
}
</script>

<template>
  <div class="w-full bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-clip text-sm h-[min(calc(100vh-6rem),800px)] flex flex-col">
    <!-- Header with toggle -->
    <div class="px-4 py-2.5 border-b border-gray-700/50 shrink-0 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Commentary</span>
        <button
          class="relative w-9 h-5 rounded-full transition-colors"
          :class="enabled ? 'bg-green-600' : 'bg-gray-700'"
          @click="emit('update:enabled', !enabled)"
        >
          <div
            class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
            :class="enabled ? 'translate-x-[1.1rem]' : 'translate-x-0.5'"
          />
        </button>
      </div>
      <!-- Mode selector -->
      <div v-if="enabled" class="flex rounded-md overflow-hidden border border-gray-700/50">
        <button
          class="flex-1 py-1 text-[0.6rem] font-semibold uppercase tracking-wider transition-colors"
          :class="mode === 'hero' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
          @click="emit('update:mode', 'hero')"
        >
          Hero POV
        </button>
        <button
          class="flex-1 py-1 text-[0.6rem] font-semibold uppercase tracking-wider transition-colors"
          :class="mode === 'tv' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
          @click="emit('update:mode', 'tv')"
        >
          TV Broadcast
        </button>
      </div>
    </div>

    <!-- Commentary feed -->
    <div
      v-if="enabled"
      ref="scrollContainer"
      class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2"
      @scroll="onScroll"
    >
      <div v-if="lines.length === 0" class="text-center text-gray-600 text-xs py-8">
        Waiting for the action to start...
      </div>
      <div
        v-for="line in lines"
        :key="line.id"
        class="text-xs leading-relaxed"
        :class="typeStyles[line.type] || 'text-gray-400'"
      >
        <template v-if="mode === 'tv' && line.voice">
          <span class="font-semibold mr-1" :class="line.voice === 'lon' ? 'text-blue-400/70' : 'text-amber-400/70'">{{ line.voice === 'lon' ? 'Lon:' : 'Norman:' }}</span>
        </template>
        <span v-else class="text-gray-700 mr-1">&#9679;</span>{{ line.text }}
      </div>
    </div>

    <!-- Disabled state -->
    <div v-else class="flex-1 flex items-center justify-center">
      <span class="text-xs text-gray-600">Commentary off</span>
    </div>
  </div>
</template>
