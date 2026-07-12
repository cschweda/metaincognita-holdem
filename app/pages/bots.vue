<script setup lang="ts">
/**
 * Bot Personas gallery — visual showcase of all 27 bot personas with
 * avatars, stats, descriptions, and filtering by pro/fictional.
 */
import config from '@config'
import { describeBotStyle, isPro, FICTIONAL_NAMES } from '~/utils/botDescriptions'

type SortKey = 'name' | 'vpip' | 'aggression' | 'threeBetFreq'
type Filter = 'all' | 'pro' | 'fictional'

const filter = ref<Filter>('all')
const sortBy = ref<SortKey>('name')

const allPersonas = config.personas.map(p => ({
  ...p,
  isPro: isPro(p.name),
  style: describeBotStyle(p),
}))

const filteredPersonas = computed(() => {
  let list = [...allPersonas]

  if (filter.value === 'pro') list = list.filter(p => p.isPro)
  else if (filter.value === 'fictional') list = list.filter(p => !p.isPro)

  list.sort((a, b) => {
    switch (sortBy.value) {
      case 'vpip': return b.vpip - a.vpip
      case 'aggression': return b.aggression - a.aggression
      case 'threeBetFreq': return (b.threeBetFreq ?? 0) - (a.threeBetFreq ?? 0)
      default: return a.name.localeCompare(b.name)
    }
  })

  return list
})

const proCount = allPersonas.filter(p => p.isPro).length
const fictionalCount = allPersonas.filter(p => !p.isPro).length

interface StatDef {
  key: string
  label: string
  min: number
  max: number
  format: (v: number) => string
  color: string
}

const statDefs: StatDef[] = [
  { key: 'vpip', label: 'VPIP', min: 0.10, max: 0.50, format: v => `${(v * 100).toFixed(0)}%`, color: 'bg-blue-500' },
  { key: 'pfr', label: 'PFR', min: 0.05, max: 0.40, format: v => `${(v * 100).toFixed(0)}%`, color: 'bg-cyan-500' },
  { key: 'aggression', label: 'AGG', min: 0.30, max: 2.00, format: v => v.toFixed(2), color: 'bg-orange-500' },
  { key: 'bluffFreq', label: 'Bluff', min: 0.03, max: 0.30, format: v => `${(v * 100).toFixed(0)}%`, color: 'bg-red-500' },
  { key: 'threeBetFreq', label: '3-Bet', min: 0.03, max: 0.25, format: v => `${(v * 100).toFixed(0)}%`, color: 'bg-purple-500' },
  { key: 'tiltMultiplier', label: 'Tilt', min: 0.3, max: 2.5, format: v => `${v.toFixed(1)}x`, color: 'bg-amber-500' },
]

function statPct(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <div class="max-w-6xl mx-auto px-4 py-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">Bot Personas</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ allPersonas.length }} unique opponents with distinct playstyles</p>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink to="/">
            <UButton variant="outline" color="neutral" size="sm" icon="i-lucide-arrow-left">Back to Table</UButton>
          </NuxtLink>
          <UColorModeButton />
        </div>
      </div>

      <!-- Filter + Sort -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex gap-1 bg-gray-900/60 rounded-lg p-1">
          <button
            v-for="f in (['all', 'pro', 'fictional'] as const)"
            :key="f"
            class="px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-all"
            :class="filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
            @click="filter = f"
          >
            {{ f }}
            <span class="ml-1 text-[0.6rem] opacity-60">
              {{ f === 'all' ? allPersonas.length : f === 'pro' ? proCount : fictionalCount }}
            </span>
          </button>
        </div>

        <div class="flex items-center gap-2 text-xs text-gray-500">
          <span>Sort:</span>
          <select
            v-model="sortBy"
            class="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-300 focus:outline-none"
          >
            <option value="name">Name</option>
            <option value="vpip">VPIP</option>
            <option value="aggression">Aggression</option>
            <option value="threeBetFreq">3-Bet Freq</option>
          </select>
        </div>
      </div>

      <!-- Bot Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="persona in filteredPersonas"
          :key="persona.name"
          class="bg-gray-900/60 border border-gray-800/60 rounded-xl overflow-hidden hover:border-gray-700/60 transition-colors"
        >
          <!-- Card header -->
          <div class="p-4 flex items-start gap-3">
            <BotAvatar :name="persona.name" size="lg" :is-pro="persona.isPro" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-bold text-white truncate">{{ persona.name }}</h3>
                <span
                  v-if="persona.isPro"
                  class="text-[0.55rem] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-700/30 uppercase tracking-wider font-semibold shrink-0"
                >
                  PRO
                </span>
              </div>
              <p class="text-xs text-gray-400 italic line-clamp-2">{{ persona.leak }}</p>
            </div>
          </div>

          <!-- Stats -->
          <div class="px-4 pb-3 space-y-1.5">
            <div
              v-for="stat in statDefs"
              :key="stat.key"
              class="flex items-center gap-2 text-[0.65rem]"
            >
              <span class="w-10 text-gray-500 text-right">{{ stat.label }}</span>
              <div class="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="stat.color"
                  :style="{ width: statPct((persona as any)[stat.key], stat.min, stat.max) + '%', opacity: 0.7 }"
                />
              </div>
              <span class="w-10 text-right font-mono text-gray-400">{{ stat.format((persona as any)[stat.key]) }}</span>
            </div>
          </div>

          <!-- Style description -->
          <div class="px-4 pb-4 border-t border-gray-800/30 pt-3">
            <p class="text-[0.65rem] text-gray-500 leading-relaxed">{{ persona.style }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
