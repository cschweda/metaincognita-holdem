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
  normanSilence: number
  lonAnalysis: number
  handOver?: boolean
}>()

const emit = defineEmits<{
  'update:enabled': [value: boolean]
  'update:mode': [value: CommentaryMode]
  'update:normanSilence': [value: number]
  'update:lonAnalysis': [value: number]
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const userScrolled = ref(false)

function switchToTV() {
  if (props.mode === 'tv') return
  // No warning needed if the hand is over (showdown) — cards are already revealed
  if (props.handOver) {
    emit('update:mode', 'tv')
    return
  }
  if (confirm('TV Broadcast mode flips all bot cards face-up — like watching the WSOP on TV. You still make all your own decisions.\n\nEnable TV mode?')) {
    emit('update:mode', 'tv')
  }
}

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
  aside: 'text-gray-400',
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
          @click="switchToTV"
        >
          TV Broadcast
        </button>
      </div>
      <!-- Voice sliders (TV mode only) -->
      <div v-if="enabled && mode === 'tv'" class="space-y-1.5">
        <div class="space-y-0.5">
          <div class="flex items-center justify-between">
            <span class="text-[0.55rem] text-blue-400/70">Mon Analysis</span>
            <span class="text-[0.55rem] text-gray-500 tabular-nums">{{ lonAnalysis >= 95 ? 'Max' : lonAnalysis <= 5 ? 'Actions only' : `${lonAnalysis}%` }}</span>
          </div>
          <input
            type="range"
            :value="lonAnalysis"
            min="0"
            max="100"
            step="5"
            class="w-full h-1 appearance-none rounded-full bg-gray-700 cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
                   [&::-webkit-slider-thumb]:cursor-pointer"
            @input="emit('update:lonAnalysis', parseInt(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div class="space-y-0.5">
          <div class="flex items-center justify-between">
            <span class="text-[0.55rem] text-amber-400/70">Chorman Quips</span>
            <span class="text-[0.55rem] text-gray-500 tabular-nums">{{ normanSilence >= 100 ? 'Off' : normanSilence >= 90 ? 'Rare' : normanSilence === 0 ? 'Max' : `${100 - normanSilence}%` }}</span>
          </div>
          <input
            type="range"
            :value="100 - normanSilence"
            min="0"
            max="100"
            step="5"
            class="w-full h-1 appearance-none rounded-full bg-gray-700 cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500
                   [&::-webkit-slider-thumb]:cursor-pointer"
            @input="emit('update:normanSilence', 100 - parseInt(($event.target as HTMLInputElement).value))"
          />
        </div>
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
          <span class="font-semibold mr-1" :class="line.voice === 'lon' ? 'text-blue-400/70' : 'text-amber-400/70'">{{ line.voice === 'lon' ? 'Mon:' : 'Chorman:' }}</span>
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
