<script setup lang="ts">
defineOptions({ name: 'career' })
import config from '@config'
import { useCareerStore } from '~/stores/career'

const career = useCareerStore()
const showRetireModal = ref(false)

const tiers = computed(() =>
  config.stakes.map(s => ({
    ...s,
    roster: (config.career.tiers[s.level] ?? []) as string[],
    isCurrent: s.level === career.state.currentTier,
    reached: s.level <= career.state.peakTier,
  })),
)

const movementNotice = computed(() => {
  switch (career.lastMovement) {
    case 'up': return { text: `Moved up to ${career.tierStake.name}!`, tone: 'text-green-400' }
    case 'down': return { text: `Dropped down to ${career.tierStake.name}.`, tone: 'text-orange-400' }
    case 'bust': return { text: 'Career over — run archived. Fresh start at the micros.', tone: 'text-red-400' }
    default: return null
  }
})

function playSession() {
  career.startSession()
  navigateTo('/')
}

function confirmRetire() {
  career.retire()
  showRetireModal.value = false
}

const fmt = (n: number) => n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white p-6">
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Career</h1>
          <p class="text-sm text-gray-400">Run started {{ new Date(career.state.runStartedAt).toLocaleDateString() }}</p>
        </div>
        <NuxtLink to="/" class="text-sm text-gray-400 hover:text-white">← Table</NuxtLink>
      </div>

      <div v-if="movementNotice" class="rounded-lg border border-gray-800 bg-gray-900 p-3 flex justify-between items-center">
        <span :class="movementNotice.tone" class="font-semibold">{{ movementNotice.text }}</span>
        <UButton size="xs" variant="ghost" color="neutral" @click="() => career.clearMovement()">Dismiss</UButton>
      </div>
      <div v-if="career.hadAbandoned" class="rounded-lg border border-gray-800 bg-gray-900 p-3 text-sm text-gray-400">
        A session was interrupted (page closed mid-game) — the buy-in was refunded.
      </div>
      <div v-if="career.storageWarning" class="rounded-lg border border-orange-900 bg-orange-950/40 p-3 text-sm text-orange-300">
        Browser storage is unavailable — career progress can't be saved right now.
      </div>

      <!-- Bankroll + actions -->
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center justify-between">
        <div>
          <div class="text-sm text-gray-400">Bankroll</div>
          <div class="text-3xl font-bold font-mono">{{ fmt(career.state.bankroll) }}</div>
          <div class="text-xs text-gray-500 mt-1">
            Peak {{ fmt(career.state.peakBankroll) }} · {{ career.state.totalHands }} hands this run
          </div>
        </div>
        <div class="flex gap-2">
          <UButton color="primary" size="lg" :disabled="career.state.bankroll < career.currentBuyIn" @click="playSession">
            Play {{ career.tierStake.name }} — buy-in {{ fmt(career.currentBuyIn) }}
          </UButton>
          <UButton variant="outline" color="neutral" size="lg" @click="() => { showRetireModal = true }">Retire</UButton>
        </div>
      </div>

      <!-- Ladder -->
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-2">
        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">The Ladder</h2>
        <div
          v-for="t in [...tiers].reverse()"
          :key="t.level"
          class="flex items-center justify-between rounded-lg px-3 py-2"
          :class="t.isCurrent ? 'bg-green-950/40 border border-green-800' : 'bg-gray-950/40'"
        >
          <div class="flex items-center gap-3">
            <span class="font-mono text-xs w-16" :class="t.isCurrent ? 'text-green-400' : 'text-gray-500'">${{ t.sb }}/${{ t.bb }}</span>
            <span :class="t.isCurrent ? 'text-white font-semibold' : t.reached ? 'text-gray-300' : 'text-gray-600'">{{ t.name }}</span>
            <span v-if="t.isCurrent" class="text-xs text-green-400">← you</span>
          </div>
          <div class="text-xs text-gray-500 truncate max-w-[45%]">{{ t.roster.join(' · ') }}</div>
        </div>
        <div v-if="career.promotionProgress" class="pt-2 space-y-1 text-xs text-gray-400">
          <div class="flex justify-between">
            <span>Bankroll toward promotion ({{ config.career.promoteBuyIns }} buy-ins of the next stake)</span>
            <span class="font-mono">{{ Math.round(career.promotionProgress.bankrollPct * 100) }}%</span>
          </div>
          <div class="h-1.5 rounded bg-gray-800"><div class="h-1.5 rounded bg-green-600" :style="{ width: `${career.promotionProgress.bankrollPct * 100}%` }" /></div>
          <div class="flex justify-between">
            <span>Hands at this tier ({{ config.career.promoteMinHands }} needed)</span>
            <span class="font-mono">{{ Math.round(career.promotionProgress.handsPct * 100) }}%</span>
          </div>
          <div class="h-1.5 rounded bg-gray-800"><div class="h-1.5 rounded bg-green-600" :style="{ width: `${career.promotionProgress.handsPct * 100}%` }" /></div>
        </div>
        <div v-else class="pt-2 text-xs text-yellow-500">Top of the ladder — nowhere left to climb.</div>
      </div>

      <!-- Per-tier results -->
      <div v-if="career.perTierStats.length" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">This Run</h2>
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 text-xs">
            <th class="pb-2">Tier</th><th class="pb-2">Sessions</th><th class="pb-2">Hands</th><th class="pb-2">Net</th><th class="pb-2">bb/100</th>
          </tr></thead>
          <tbody>
            <tr v-for="t in career.perTierStats" :key="t.tier" class="border-t border-gray-800">
              <td class="py-1.5">{{ config.stakes.find(s => s.level === t.tier)?.name }}</td>
              <td class="py-1.5 font-mono">{{ t.sessions }}</td>
              <td class="py-1.5 font-mono">{{ t.hands }}</td>
              <td class="py-1.5 font-mono" :class="t.net >= 0 ? 'text-green-400' : 'text-red-400'">{{ t.net >= 0 ? '+' : '' }}{{ fmt(t.net) }}</td>
              <td class="py-1.5 font-mono">{{ t.bb100.toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Hall of fame -->
      <div v-if="career.state.archivedRuns.length" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Past Runs</h2>
        <div v-for="(run, i) in [...career.state.archivedRuns].reverse()" :key="i" class="flex justify-between text-sm border-t border-gray-800 py-1.5 first:border-t-0">
          <span class="text-gray-400">{{ new Date(run.startedAt).toLocaleDateString() }} → {{ new Date(run.endedAt).toLocaleDateString() }}</span>
          <span class="font-mono">peak {{ fmt(run.peakBankroll) }} · {{ config.stakes.find(s => s.level === run.peakTier)?.name }} · {{ run.totalHands }} hands</span>
          <span :class="run.endedBy === 'retired' ? 'text-green-400' : 'text-red-400'">{{ run.endedBy }}</span>
        </div>
      </div>

      <UModal v-model:open="showRetireModal">
        <template #content>
          <div class="p-6 space-y-4">
            <h3 class="text-lg font-semibold">Retire this career?</h3>
            <p class="text-sm text-gray-400">
              The run is archived to Past Runs ({{ fmt(career.state.bankroll) }} final, peak {{ fmt(career.state.peakBankroll) }})
              and a fresh career starts at {{ fmt(config.career.startingBankroll) }}.
            </p>
            <div class="flex gap-2 justify-end">
              <UButton variant="ghost" color="neutral" @click="() => { showRetireModal = false }">Cancel</UButton>
              <UButton color="primary" @click="confirmRetire">Retire</UButton>
            </div>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>
