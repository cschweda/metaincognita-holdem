<script setup lang="ts">
import config from '@config'
import { describeBotStyle } from '~/utils/botDescriptions'
import { useNemesisStore } from '~/stores/nemesis'
import type { BotConfig } from '~/components/SetupScreen.vue'

const props = defineProps<{
  botConfig: BotConfig
  isPro: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ reset: [] }>()

const statDefs = [
  { key: 'vpip' as const, label: 'VPIP', ...config.botCustomRanges.vpip, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
  { key: 'pfr' as const, label: 'PFR', ...config.botCustomRanges.pfr, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
  { key: 'aggression' as const, label: 'Aggression', ...config.botCustomRanges.aggression, fmt: (v: number) => v.toFixed(2) },
  { key: 'bluffFreq' as const, label: 'Bluff Freq', ...config.botCustomRanges.bluffFreq, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
  { key: 'creativeFreq' as const, label: 'Creative', ...config.botCustomRanges.creativeFreq, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
  { key: 'threeBetFreq' as const, label: '3-Bet Freq', ...config.botCustomRanges.threeBetFreq, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
]

const styleDesc = computed(() => describeBotStyle(props.botConfig))

// ─── Nemesis scouting report ──────────────────────────────────
const nemesis = useNemesisStore()
const showResetConfirm = ref(false)
const minReads = config.nemesis.minHandsForReads
const familiarity = computed(() => nemesis.familiarityFor(props.botConfig.name))
const famTier = computed(() => {
  const f = familiarity.value
  if (f >= 0.8) return { label: 'Nemesis', tone: 'text-red-400' }
  if (f >= 0.4) return { label: 'Regular', tone: 'text-orange-400' }
  if (f >= 0.1) return { label: 'Noticing you', tone: 'text-yellow-400' }
  return { label: 'Stranger', tone: 'text-gray-500' }
})
const handsFaced = computed(() => Math.round(nemesis.model.familiarity[props.botConfig.name] ?? 0))
function confirmReset() {
  nemesis.reset()
  showResetConfirm.value = false
}
</script>

<template>
  <UModal v-model:open="open" :dismissible="true">
    <template #header>
      <div class="flex items-center gap-3 p-4">
        <BotAvatar :name="botConfig.name" size="md" :is-pro="isPro" />
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-bold text-lg text-white">{{ botConfig.name }}</h3>
            <span
              v-if="isPro"
              class="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-700/30 uppercase tracking-wider font-semibold"
            >
              PRO
            </span>
          </div>
          <p v-if="botConfig.leak" class="text-xs text-gray-500 mt-0.5 italic line-clamp-2">{{ botConfig.leak }}</p>
        </div>
      </div>
    </template>

    <template #body>
      <div class="space-y-4 px-4 pb-4">
        <p class="text-xs text-gray-400">{{ styleDesc }}</p>

        <div class="bg-blue-900/15 border border-blue-800/30 rounded-lg px-3 py-2 text-xs text-blue-300/80">
          Changes apply to the next hand, not the current hand.
        </div>

        <div class="space-y-4">
          <div v-for="stat in statDefs" :key="stat.key">
            <div class="flex justify-between text-xs mb-1.5">
              <span class="text-gray-400">{{ stat.label }}</span>
              <span class="font-mono text-gray-300">{{ stat.fmt(botConfig[stat.key] ?? stat.min) }}</span>
            </div>
            <input
              type="range"
              :min="stat.min"
              :max="stat.max"
              :step="stat.step"
              :value="botConfig[stat.key] ?? stat.min"
              class="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500"
              @input="(botConfig as any)[stat.key] = parseFloat(($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <div class="flex items-center justify-between text-xs text-gray-500 pt-2">
          <span>Tilt: <span class="text-white font-mono">{{ botConfig.tiltMultiplier?.toFixed(1) ?? '1.0' }}x</span></span>
        </div>

        <!-- Nemesis scouting report -->
        <div class="border-t border-gray-800 pt-3 space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">What they know about you</h4>
            <span class="text-xs font-semibold" :class="famTier.tone">{{ famTier.label }} · {{ handsFaced }} hands</span>
          </div>
          <template v-if="nemesis.reads.length">
            <ul class="space-y-1">
              <li v-for="(read, i) in nemesis.reads" :key="i" class="text-xs text-gray-300">• {{ read }}</li>
            </ul>
            <p class="text-[0.65rem] text-gray-600">Reads are the table's shared book on you — this player acts on it to the degree they know your game.</p>
          </template>
          <p v-else class="text-xs text-gray-600">No book on you yet — fewer than {{ minReads }} hands observed.</p>
          <UButton size="xs" variant="ghost" color="error" @click="() => { showResetConfirm = true }">Reset what bots know</UButton>
          <div v-if="showResetConfirm" class="flex items-center gap-2 text-xs">
            <span class="text-gray-400">Wipe the book and all familiarity?</span>
            <UButton size="xs" color="error" @click="confirmReset">Wipe</UButton>
            <UButton size="xs" variant="ghost" color="neutral" @click="() => { showResetConfirm = false }">Cancel</UButton>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between px-4 pb-4">
        <UButton variant="ghost" color="error" size="sm" @click="emit('reset')">
          Reset to Default
        </UButton>
        <UButton color="primary" size="sm" @click="() => { open = false }">
          Done
        </UButton>
      </div>
    </template>
  </UModal>
</template>
