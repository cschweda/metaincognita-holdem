<script setup lang="ts">
/**
 * Full hero stats page — cross-session analytics from Supabase.
 * Shows lifetime stats, session history, hand history, and trends.
 */
import { useSupabase, ensureAnonSession } from '~/composables/useSupabase'

interface SessionRow {
  id: string
  started_at: string
  ended_at: string | null
  stake_level: number
  player_count: number
  starting_stack: number
  hands_played: number
  hands_won: number
  hands_lost: number
  hands_folded: number
  final_stack: number | null
  peak_stack: number | null
  total_profit: number
}

interface HandRow {
  id: string
  session_id: string
  hand_number: number
  hole_cards: string
  board: string | null
  result: string
  profit: number
  position: string
  pot_size: number
  stake_level: number
  player_count: number
  played_at: string
}

const loading = ref(true)
const error = ref<string | null>(null)
const sessions = ref<SessionRow[]>([])
const hands = ref<HandRow[]>([])
const userId = ref<string | null>(null)
const activeTab = ref<'overview' | 'sessions' | 'hands'>('overview')

onMounted(async () => {
  const sb = useSupabase()
  if (!sb) {
    error.value = 'Supabase not configured. Add SUPABASE_URL and SUPABASE_KEY to your .env file.'
    loading.value = false
    return
  }

  userId.value = await ensureAnonSession()
  if (!userId.value) {
    error.value = 'Could not establish anonymous session. Enable Anonymous auth in Supabase Dashboard > Authentication > Providers.'
    loading.value = false
    return
  }

  await loadData(sb)
})

async function loadData(sb: ReturnType<typeof useSupabase>) {
  if (!sb) return
  loading.value = true

  const [sessResult, handsResult] = await Promise.all([
    sb.from('sessions').select('*').order('started_at', { ascending: false }).limit(50),
    sb.from('hands').select('*').order('played_at', { ascending: false }).limit(500),
  ])

  if (sessResult.error) {
    error.value = `Sessions: ${sessResult.error.message}`
  } else {
    sessions.value = sessResult.data || []
  }

  if (handsResult.error) {
    error.value = `Hands: ${handsResult.error.message}`
  } else {
    hands.value = handsResult.data || []
  }

  loading.value = false
}

// ─── Computed Lifetime Stats ───────────────────────────────────

const lifetimeStats = computed(() => {
  const totalHands = hands.value.length
  const won = hands.value.filter(h => h.result === 'won').length
  const lost = hands.value.filter(h => h.result === 'lost').length
  const folded = hands.value.filter(h => h.result === 'folded').length
  const totalProfit = hands.value.reduce((sum, h) => sum + h.profit, 0)
  const totalSessions = sessions.value.length
  const biggestWin = hands.value.reduce((max, h) => Math.max(max, h.profit), 0)
  const biggestLoss = hands.value.reduce((min, h) => Math.min(min, h.profit), 0)
  const avgPot = totalHands > 0 ? hands.value.reduce((sum, h) => sum + h.pot_size, 0) / totalHands : 0

  return { totalHands, won, lost, folded, totalProfit, totalSessions, biggestWin, biggestLoss, avgPot }
})

const winRate = computed(() => {
  if (lifetimeStats.value.totalHands === 0) return 0
  return (lifetimeStats.value.won / lifetimeStats.value.totalHands) * 100
})

// ─── Position Stats ────────────────────────────────────────────

const positionStats = computed(() => {
  const map = new Map<string, { played: number; won: number; profit: number }>()
  for (const h of hands.value) {
    const pos = h.position || 'Unknown'
    const entry = map.get(pos) || { played: 0, won: 0, profit: 0 }
    entry.played++
    if (h.result === 'won') entry.won++
    entry.profit += h.profit
    map.set(pos, entry)
  }
  return [...map.entries()]
    .map(([position, stats]) => ({ position, ...stats, winRate: (stats.won / stats.played) * 100 }))
    .sort((a, b) => b.profit - a.profit)
})

// ─── Profit Over Time (last 50 hands) ─────────────────────────

const profitTimeline = computed(() => {
  const recent = [...hands.value].reverse().slice(-50)
  let running = 0
  return recent.map(h => {
    running += h.profit
    return running
  })
})

const profitTrendClass = computed(() => {
  const timeline = profitTimeline.value
  if (timeline.length < 2) return 'text-gray-400'
  return timeline[timeline.length - 1] >= timeline[0] ? 'text-green-400' : 'text-red-400'
})

// ─── Helpers ───────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatProfit(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${n}`
}

const stakeNames: Record<number, string> = { 1: 'Micro', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Big', 6: 'Nosebleed' }
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Header -->
    <div class="max-w-5xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">Hero Stats</h1>
          <p class="text-sm text-gray-500 mt-0.5">Cross-session analytics from Supabase</p>
        </div>
        <NuxtLink to="/">
          <UButton variant="outline" color="neutral" size="sm" icon="i-lucide-arrow-left">
            Back to Table
          </UButton>
        </NuxtLink>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <div class="flex items-center gap-3 text-gray-400">
          <div class="flex gap-1">
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
          </div>
          Loading stats from Supabase...
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-red-900/20 border border-red-800/30 p-6 text-center">
        <p class="text-red-400 text-sm">{{ error }}</p>
        <NuxtLink to="/" class="text-xs text-gray-500 mt-2 inline-block hover:text-gray-300">
          Play some hands first, then come back
        </NuxtLink>
      </div>

      <!-- No data -->
      <div v-else-if="hands.length === 0" class="text-center py-20">
        <p class="text-gray-400">No hands recorded yet.</p>
        <NuxtLink to="/">
          <UButton color="primary" class="mt-4">Play Your First Hand</UButton>
        </NuxtLink>
      </div>

      <!-- Stats content -->
      <template v-else>
        <!-- Tab bar -->
        <div class="flex border-b border-gray-800 mb-6">
          <button
            v-for="tab in (['overview', 'sessions', 'hands'] as const)"
            :key="tab"
            class="px-4 py-2 text-sm font-medium capitalize transition-colors"
            :class="activeTab === tab
              ? 'text-white border-b-2 border-green-500'
              : 'text-gray-500 hover:text-gray-300'"
            @click="activeTab = tab"
          >
            {{ tab }}
          </button>
        </div>

        <!-- ═══ OVERVIEW ═══ -->
        <div v-if="activeTab === 'overview'" class="space-y-6">
          <!-- Big numbers -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-center">
              <div class="text-3xl font-bold font-mono text-white">{{ lifetimeStats.totalHands }}</div>
              <div class="text-xs text-gray-500 mt-1 uppercase">Hands Played</div>
            </div>
            <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-center">
              <div class="text-3xl font-bold font-mono" :class="lifetimeStats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'">
                {{ formatProfit(lifetimeStats.totalProfit) }}
              </div>
              <div class="text-xs text-gray-500 mt-1 uppercase">Lifetime Profit</div>
            </div>
            <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-center">
              <div class="text-3xl font-bold font-mono" :class="winRate >= 30 ? 'text-green-400' : 'text-red-400'">
                {{ winRate.toFixed(1) }}%
              </div>
              <div class="text-xs text-gray-500 mt-1 uppercase">Win Rate</div>
            </div>
            <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-center">
              <div class="text-3xl font-bold font-mono text-white">{{ lifetimeStats.totalSessions }}</div>
              <div class="text-xs text-gray-500 mt-1 uppercase">Sessions</div>
            </div>
          </div>

          <!-- Win/Loss/Fold -->
          <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-gray-300 mb-3">Results Breakdown</h3>
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <span class="text-xs text-green-400 w-12">Won</span>
                <div class="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full bg-green-500 rounded-full transition-all" :style="{ width: `${lifetimeStats.totalHands ? (lifetimeStats.won / lifetimeStats.totalHands) * 100 : 0}%` }" />
                </div>
                <span class="text-xs text-white font-mono w-10 text-right">{{ lifetimeStats.won }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-red-400 w-12">Lost</span>
                <div class="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full bg-red-500 rounded-full transition-all" :style="{ width: `${lifetimeStats.totalHands ? (lifetimeStats.lost / lifetimeStats.totalHands) * 100 : 0}%` }" />
                </div>
                <span class="text-xs text-white font-mono w-10 text-right">{{ lifetimeStats.lost }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-400 w-12">Folded</span>
                <div class="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full bg-gray-500 rounded-full transition-all" :style="{ width: `${lifetimeStats.totalHands ? (lifetimeStats.folded / lifetimeStats.totalHands) * 100 : 0}%` }" />
                </div>
                <span class="text-xs text-white font-mono w-10 text-right">{{ lifetimeStats.folded }}</span>
              </div>
            </div>
          </div>

          <!-- Notable stats -->
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-center">
              <div class="text-lg font-bold font-mono text-green-400">{{ formatProfit(lifetimeStats.biggestWin) }}</div>
              <div class="text-[0.65rem] text-gray-500 uppercase">Biggest Win</div>
            </div>
            <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-center">
              <div class="text-lg font-bold font-mono text-red-400">{{ formatProfit(lifetimeStats.biggestLoss) }}</div>
              <div class="text-[0.65rem] text-gray-500 uppercase">Biggest Loss</div>
            </div>
            <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-center">
              <div class="text-lg font-bold font-mono text-white">${{ Math.round(lifetimeStats.avgPot) }}</div>
              <div class="text-[0.65rem] text-gray-500 uppercase">Avg Pot Size</div>
            </div>
          </div>

          <!-- Profit trend (text sparkline) -->
          <div v-if="profitTimeline.length > 1" class="bg-gray-900/80 border border-gray-800 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-gray-300 mb-3">Profit Trend (last {{ profitTimeline.length }} hands)</h3>
            <div class="flex items-end gap-[2px] h-16">
              <div
                v-for="(val, i) in profitTimeline"
                :key="i"
                class="flex-1 rounded-t-sm transition-all"
                :class="val >= 0 ? 'bg-green-500/70' : 'bg-red-500/70'"
                :style="{ height: `${Math.max(4, Math.abs(val) / Math.max(...profitTimeline.map(Math.abs)) * 100)}%` }"
              />
            </div>
            <div class="flex justify-between text-[0.6rem] text-gray-600 mt-1">
              <span>Oldest</span>
              <span :class="profitTrendClass" class="font-mono">{{ formatProfit(profitTimeline[profitTimeline.length - 1]) }}</span>
              <span>Latest</span>
            </div>
          </div>

          <!-- Position stats -->
          <div v-if="positionStats.length > 0" class="bg-gray-900/80 border border-gray-800 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-gray-300 mb-3">Performance by Position</h3>
            <div class="space-y-2">
              <div
                v-for="ps in positionStats"
                :key="ps.position"
                class="flex items-center justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-2"
              >
                <span class="font-semibold text-white w-12">{{ ps.position }}</span>
                <span class="text-gray-400">{{ ps.played }} hands</span>
                <span :class="ps.winRate >= 30 ? 'text-green-400' : 'text-red-400'" class="font-mono">
                  {{ ps.winRate.toFixed(0) }}% win
                </span>
                <span :class="ps.profit >= 0 ? 'text-green-400' : 'text-red-400'" class="font-mono w-16 text-right">
                  {{ formatProfit(ps.profit) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ SESSIONS ═══ -->
        <div v-if="activeTab === 'sessions'" class="space-y-3">
          <div
            v-for="s in sessions"
            :key="s.id"
            class="bg-gray-900/80 border border-gray-800 rounded-xl p-4"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-white font-semibold">{{ stakeNames[s.stake_level] || 'Unknown' }} — {{ s.player_count }} players</span>
              <span class="text-xs text-gray-500">{{ formatDate(s.started_at) }}</span>
            </div>
            <div class="grid grid-cols-4 gap-2 text-xs">
              <div>
                <span class="text-gray-500">Hands</span>
                <div class="text-white font-mono">{{ s.hands_played }}</div>
              </div>
              <div>
                <span class="text-gray-500">Won</span>
                <div class="text-green-400 font-mono">{{ s.hands_won }}</div>
              </div>
              <div>
                <span class="text-gray-500">Lost</span>
                <div class="text-red-400 font-mono">{{ s.hands_lost }}</div>
              </div>
              <div>
                <span class="text-gray-500">Profit</span>
                <div :class="s.total_profit >= 0 ? 'text-green-400' : 'text-red-400'" class="font-mono">
                  {{ formatProfit(s.total_profit) }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="sessions.length === 0" class="text-center text-gray-500 text-sm py-8">
            No sessions recorded yet.
          </div>
        </div>

        <!-- ═══ HANDS ═══ -->
        <div v-if="activeTab === 'hands'">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-gray-500 border-b border-gray-800">
                  <th class="text-left py-2 px-2">#</th>
                  <th class="text-left py-2 px-2">Cards</th>
                  <th class="text-left py-2 px-2">Board</th>
                  <th class="text-left py-2 px-2">Pos</th>
                  <th class="text-left py-2 px-2">Result</th>
                  <th class="text-right py-2 px-2">Profit</th>
                  <th class="text-right py-2 px-2">Pot</th>
                  <th class="text-right py-2 px-2">Time</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="h in hands"
                  :key="h.id"
                  class="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <td class="py-1.5 px-2 text-gray-500">{{ h.hand_number }}</td>
                  <td class="py-1.5 px-2 font-mono text-white">{{ h.hole_cards }}</td>
                  <td class="py-1.5 px-2 font-mono text-gray-400">{{ h.board || '—' }}</td>
                  <td class="py-1.5 px-2 text-gray-300">{{ h.position }}</td>
                  <td class="py-1.5 px-2">
                    <span
                      class="px-1.5 py-0.5 rounded text-[0.6rem] font-semibold uppercase"
                      :class="{
                        'bg-green-900/50 text-green-400': h.result === 'won',
                        'bg-red-900/50 text-red-400': h.result === 'lost',
                        'bg-gray-800 text-gray-500': h.result === 'folded',
                      }"
                    >
                      {{ h.result }}
                    </span>
                  </td>
                  <td class="py-1.5 px-2 text-right font-mono" :class="h.profit >= 0 ? 'text-green-400' : 'text-red-400'">
                    {{ formatProfit(h.profit) }}
                  </td>
                  <td class="py-1.5 px-2 text-right font-mono text-gray-400">${{ h.pot_size }}</td>
                  <td class="py-1.5 px-2 text-right text-gray-600">{{ formatDate(h.played_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="hands.length === 0" class="text-center text-gray-500 text-sm py-8">
            No hands recorded yet.
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
