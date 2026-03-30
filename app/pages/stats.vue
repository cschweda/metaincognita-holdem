<script setup lang="ts">
/**
 * Stats dashboard — loads cross-session data from Supabase (with localStorage fallback).
 * Shows lifetime aggregates, session drill-down, per-hand history with expandable
 * action logs, PokerStars-format export, and profit trends.
 * Uses Nuxt UI 4 modals for delete confirmations.
 */
import { useSupabase, ensureAnonSession, getCurrentUser } from '~/composables/useSupabase'
import { toPokerStarsFormat, exportHandsAsPokerStars } from '~/utils/pokerStarsExport'

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
  actions: string[] | null
  players: { name: string; position: string; holeCards: string; folded: boolean; isHero: boolean }[] | null
}

const loading = ref(true)
const showHandModal = ref(false)
const selectedHand = ref<HandRow | null>(null)

function openHandDetail(h: HandRow) {
  selectedHand.value = h
  showHandModal.value = true
}
const error = ref<string | null>(null)
const sessions = ref<SessionRow[]>([])
const hands = ref<HandRow[]>([])
const userId = ref<string | null>(null)
const activeTab = ref<'overview' | 'sessions' | 'hands'>('overview')
const isGitHubAuth = ref(false)
const localSession = ref<any>(null)
const selectedSession = ref<SessionRow | null>(null) // drill-down into session

// ─── Filters & Drill-down ─────────────────────────────────────
const positionFilter = ref<string | null>(null) // filter hands by position

// ─── Delete Modals ────────────────────────────────────────────
const showDeleteAllModal = ref(false)
const showDeleteSessionModal = ref(false)
const showDeleteHandModal = ref(false)
const deleteSessionTarget = ref<SessionRow | null>(null)
const deleteHandTarget = ref<HandRow | null>(null)
const deleteAllConfirmText = ref('')

// ─── Hand Analysis Modal ─────────────────────────────────────
const showAnalysisModal = ref(false)
const analysisHand = ref<HandRow | null>(null)

function openAnalysis(h: HandRow) {
  analysisHand.value = h
  showAnalysisModal.value = true
}

const copiedHandId = ref<string | null>(null)

async function copyHandToClipboard(h: HandRow) {
  const stakeLevel = getStakeFromLevel(h.stake_level)
  const text = toPokerStarsFormat(h, stakeLevel)
  await navigator.clipboard.writeText(text)
  copiedHandId.value = h.id
  setTimeout(() => { copiedHandId.value = null }, 2000)
}

onMounted(async () => {
  try {
    const saved = localStorage.getItem('holdem-session-stats')
    if (saved) localSession.value = JSON.parse(saved)
  } catch {}

  const sb = useSupabase()
  if (!sb) {
    loading.value = false
    return
  }

  userId.value = await ensureAnonSession()
  if (!userId.value) {
    loading.value = false
    return
  }

  const user = await getCurrentUser()
  isGitHubAuth.value = !!user && !user.is_anonymous

  if (isGitHubAuth.value) {
    await loadData(sb)
  } else {
    if (localSession.value?.hands) {
      hands.value = localSession.value.hands.map((h: any, i: number) => ({
        id: `local-${i}`,
        session_id: localSession.value.id,
        hand_number: h.handNumber,
        hole_cards: h.holeCards,
        board: h.board,
        result: h.result,
        profit: h.profit,
        position: h.position,
        pot_size: h.potSize,
        stake_level: localSession.value.stakeLevel,
        player_count: localSession.value.playerCount,
        played_at: new Date().toISOString(),
        actions: h.actions || null,
        players: h.players || null,
      }))
    }
    loading.value = false
  }
})

// ─── Delete Functions ──────────────────────────────────────────

async function deleteAllData() {
  const sb = useSupabase()

  if (sb && userId.value) {
    const { error: handsErr } = await sb.from('hands').delete().eq('user_id', userId.value)
    if (handsErr) console.warn('Failed to delete hands:', handsErr.message)
    const { error: sessErr } = await sb.from('sessions').delete().eq('user_id', userId.value)
    if (sessErr) console.warn('Failed to delete sessions:', sessErr.message)
  }

  localStorage.removeItem('holdem-session-stats')
  sessions.value = []
  hands.value = []
  localSession.value = null
  showDeleteAllModal.value = false
  deleteAllConfirmText.value = ''
}

async function deleteSession(sessionId: string) {
  const sb = useSupabase()

  if (sb && userId.value) {
    // Always scope deletes by user_id — defense-in-depth alongside RLS
    const { error: handsErr } = await sb.from('hands').delete().eq('session_id', sessionId).eq('user_id', userId.value)
    if (handsErr) console.warn('Failed to delete session hands:', handsErr.message)
    const { error: sessErr } = await sb.from('sessions').delete().eq('id', sessionId).eq('user_id', userId.value)
    if (sessErr) console.warn('Failed to delete session:', sessErr.message)
  }

  sessions.value = sessions.value.filter(s => s.id !== sessionId)
  hands.value = hands.value.filter(h => h.session_id !== sessionId)

  if (localSession.value?.id === sessionId) {
    localStorage.removeItem('holdem-session-stats')
    localSession.value = null
  }

  // If we were viewing this session, go back
  if (selectedSession.value?.id === sessionId) {
    selectedSession.value = null
  }

  showDeleteSessionModal.value = false
  deleteSessionTarget.value = null
}

async function deleteHand(handId: string) {
  const sb = useSupabase()

  if (sb && userId.value && !handId.startsWith('local-')) {
    const { error: err } = await sb.from('hands').delete().eq('id', handId).eq('user_id', userId.value)
    if (err) console.warn('Failed to delete hand:', err.message)
  }

  // Remove from local state
  hands.value = hands.value.filter(h => h.id !== handId)

  // If local hand, update localStorage
  if (handId.startsWith('local-') && localSession.value?.hands) {
    const idx = parseInt(handId.replace('local-', ''), 10)
    if (idx >= 0) {
      localSession.value.hands.splice(idx, 1)
      localStorage.setItem('holdem-session-stats', JSON.stringify(localSession.value))
    }
  }

  if (selectedHand.value?.id === handId) { showHandModal.value = false; selectedHand.value = null }
  showDeleteHandModal.value = false
  deleteHandTarget.value = null
}

function openDeleteHandModal(h: HandRow) {
  deleteHandTarget.value = h
  showDeleteHandModal.value = true
}

function drillIntoPosition(position: string) {
  positionFilter.value = position
  activeTab.value = 'hands'
}

function drillIntoHand(h: HandRow) {
  openHandDetail(h)
}

function openDeleteSessionModal(s: SessionRow) {
  deleteSessionTarget.value = s
  showDeleteSessionModal.value = true
}

async function loadData(sb: ReturnType<typeof useSupabase>) {
  if (!sb) return
  loading.value = true

  // Always filter by user_id — defense-in-depth alongside RLS policies
  const [sessResult, handsResult] = await Promise.all([
    sb.from('sessions').select('*').eq('user_id', userId.value).order('started_at', { ascending: false }).limit(50),
    sb.from('hands').select('*').eq('user_id', userId.value).order('played_at', { ascending: false }).limit(500),
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

  const avgProfit = totalSessions > 0 ? totalProfit / totalSessions : 0
  const handsPerSession = totalSessions > 0 ? Math.round(totalHands / totalSessions) : 0
  const foldPct = totalHands > 0 ? (folded / totalHands) * 100 : 0
  const showdownRate = totalHands > 0 ? ((won + lost) / totalHands) * 100 : 0
  const wonAtShowdown = (won + lost) > 0 ? (won / (won + lost)) * 100 : 0

  return {
    totalHands, won, lost, folded, totalProfit, totalSessions,
    biggestWin, biggestLoss, avgPot, avgProfit, handsPerSession,
    foldPct, showdownRate, wonAtShowdown,
  }
})

const winRate = computed(() => {
  if (lifetimeStats.value.totalHands === 0) return 0
  return (lifetimeStats.value.won / lifetimeStats.value.totalHands) * 100
})

const sessionSummary = computed(() => {
  const winning = sessions.value.filter(s => s.total_profit > 0).length
  const losing = sessions.value.filter(s => s.total_profit < 0).length
  const breakeven = sessions.value.filter(s => s.total_profit === 0).length
  const bestSession = sessions.value.reduce((best, s) => s.total_profit > best ? s.total_profit : best, 0)
  const worstSession = sessions.value.reduce((worst, s) => s.total_profit < worst ? s.total_profit : worst, 0)
  return { winning, losing, breakeven, bestSession, worstSession }
})

const positionStats = computed(() => {
  const source = selectedSession.value
    ? hands.value.filter(h => h.session_id === selectedSession.value!.id)
    : hands.value
  const map = new Map<string, { played: number; won: number; profit: number }>()
  for (const h of source) {
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

// Recent hands for overview (reverse chronological, already sorted from load)
const recentHands = computed(() => {
  const source = selectedSession.value
    ? hands.value.filter(h => h.session_id === selectedSession.value!.id)
    : hands.value
  return source.slice(0, 20)
})

// Session-specific hands for drill-down
const sessionHands = computed(() => {
  if (!selectedSession.value) return []
  return hands.value.filter(h => h.session_id === selectedSession.value!.id)
})

// ─── Profit Timeline ──────────────────────────────────────────

const profitTimeline = computed(() => {
  const source = selectedSession.value
    ? sessionHands.value
    : hands.value
  const recent = [...source].reverse().slice(-50)
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

// ─── Export Functions ──────────────────────────────────────────

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportLifetimeJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    lifetime: lifetimeStats.value,
    winRate: winRate.value,
    sessionSummary: sessionSummary.value,
    positionStats: positionStats.value,
    sessions: sessions.value,
    hands: hands.value,
  }
  downloadFile(JSON.stringify(data, null, 2), `holdem-lifetime-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
}

function exportLifetimeCSV() {
  const headers = ['Hand #', 'Session', 'Hole Cards', 'Board', 'Position', 'Result', 'Profit', 'Pot Size', 'Stake', 'Players', 'Played At']
  const rows = hands.value.map(h => [
    h.hand_number, h.session_id.slice(0, 8), h.hole_cards, h.board || '',
    h.position, h.result, h.profit, h.pot_size, h.stake_level, h.player_count, h.played_at,
  ].join(','))
  downloadFile([headers.join(','), ...rows].join('\n'), `holdem-lifetime-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
}

function exportSessionJSON(s: SessionRow) {
  const sessionHands = hands.value.filter(h => h.session_id === s.id)
  const data = { session: s, hands: sessionHands }
  downloadFile(JSON.stringify(data, null, 2), `holdem-session-${s.id.slice(0, 8)}.json`, 'application/json')
}

function exportSessionCSV(s: SessionRow) {
  const sHands = hands.value.filter(h => h.session_id === s.id)
  const headers = ['Hand #', 'Hole Cards', 'Board', 'Position', 'Result', 'Profit', 'Pot Size', 'Played At']
  const rows = sHands.map(h => [
    h.hand_number, h.hole_cards, h.board || '', h.position, h.result, h.profit, h.pot_size, h.played_at,
  ].join(','))
  downloadFile([headers.join(','), ...rows].join('\n'), `holdem-session-${s.id.slice(0, 8)}.csv`, 'text/csv')
}

function exportLifetimePokerStars() {
  const stakeLevel = hands.value[0] ? getStakeFromLevel(hands.value[0].stake_level) : { sb: 1, bb: 2 }
  const content = exportHandsAsPokerStars(hands.value, stakeLevel)
  downloadFile(content, `holdem-lifetime-${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain')
}

function exportSessionPokerStars(s: SessionRow) {
  const sHands = hands.value.filter(h => h.session_id === s.id)
  const stakeLevel = getStakeFromLevel(s.stake_level)
  const content = exportHandsAsPokerStars(sHands, stakeLevel)
  downloadFile(content, `holdem-session-${s.id.slice(0, 8)}.txt`, 'text/plain')
}

function exportSingleHandPokerStars(h: any) {
  const stakeLevel = getStakeFromLevel(h.stake_level)
  const content = toPokerStarsFormat(h, stakeLevel)
  downloadFile(content, `holdem-hand-${h.hand_number}.txt`, 'text/plain')
}

function getStakeFromLevel(level: number): { sb: number; bb: number } {
  const stakes: Record<number, { sb: number; bb: number }> = {
    1: { sb: 0.25, bb: 0.50 }, 2: { sb: 0.50, bb: 1 }, 3: { sb: 1, bb: 2 },
    4: { sb: 2.50, bb: 5 }, 5: { sb: 5, bb: 10 }, 6: { sb: 25, bb: 50 },
  }
  return stakes[level] || { sb: 1, bb: 2 }
}

// ─── Helpers ───────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatProfit(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${n}`
}

const stakeNames: Record<number, string> = { 1: 'Micro', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Big', 6: 'Nosebleed' }

function boardCards(board: string): string[] {
  return board.split(' ').filter(Boolean)
}

// Current view hands (lifetime or session drill-down, with optional position filter)
const displayedHands = computed(() => {
  let source = selectedSession.value ? sessionHands.value : hands.value
  if (positionFilter.value) {
    source = source.filter(h => h.position === positionFilter.value)
  }
  return source
})
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <div class="max-w-5xl mx-auto px-4 py-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <div class="flex items-center gap-3">
            <button
              v-if="selectedSession"
              class="text-gray-400 hover:text-white transition-colors"
              @click="selectedSession = null"
            >
              <span class="text-lg">&larr;</span>
            </button>
            <div>
              <h1 class="text-2xl font-bold">
                {{ selectedSession ? `Session ${selectedSession.id.slice(0, 8)}` : 'Hero Stats' }}
              </h1>
              <p class="text-sm text-gray-500 mt-0.5">
                <template v-if="selectedSession">
                  {{ stakeNames[selectedSession.stake_level] || 'Unknown' }} &middot;
                  {{ selectedSession.player_count }} players &middot;
                  {{ formatDate(selectedSession.started_at) }}
                </template>
                <template v-else-if="isGitHubAuth">Lifetime stats for your GitHub account</template>
                <template v-else>Current session stats (sign in with GitHub for lifetime tracking)</template>
              </p>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <SupabaseStatus />
          <NuxtLink to="/">
            <UButton variant="outline" color="neutral" size="sm" icon="i-lucide-arrow-left">
              Back to Table
            </UButton>
          </NuxtLink>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <div class="flex items-center gap-3 text-gray-400">
          <div class="flex gap-1">
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
            <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
          </div>
          Loading stats...
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-red-900/20 border border-red-800/30 p-6 text-center">
        <p class="text-red-400 text-sm">{{ error }}</p>
      </div>

      <!-- No data -->
      <div v-else-if="hands.length === 0" class="text-center py-20 space-y-4">
        <p class="text-gray-400">No hands recorded yet.</p>
        <p v-if="!isGitHubAuth" class="text-xs text-gray-600">
          Sign in with GitHub for persistent lifetime stats.
        </p>
        <NuxtLink to="/">
          <UButton color="primary" class="mt-4">Play Your First Hand</UButton>
        </NuxtLink>
      </div>

      <!-- Stats content -->
      <template v-else>
        <!-- Tab bar -->
        <div class="flex border-b border-gray-800 mb-6 gap-1">
          <button
            v-for="tab in (['overview', 'sessions', 'hands'] as const)"
            :key="tab"
            class="px-5 py-2.5 text-sm font-medium capitalize transition-all rounded-t-lg"
            :class="activeTab === tab
              ? 'text-white bg-gray-800/60 border-b-2 border-green-500'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'"
            @click="activeTab = tab; selectedSession = null; positionFilter = null"
          >
            {{ tab }}
            <span
              v-if="tab === 'sessions'"
              class="ml-1.5 text-[0.6rem] bg-gray-700/60 px-1.5 py-0.5 rounded-full"
            >{{ sessions.length }}</span>
            <span
              v-if="tab === 'hands'"
              class="ml-1.5 text-[0.6rem] bg-gray-700/60 px-1.5 py-0.5 rounded-full"
            >{{ displayedHands.length }}</span>
          </button>
        </div>

        <!-- ═══ OVERVIEW ═══ -->
        <div v-if="activeTab === 'overview'" class="space-y-6">
          <!-- Headline stat -->
          <div class="bg-gradient-to-br from-gray-900 to-gray-900/60 border border-gray-800 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">
                {{ selectedSession ? 'Session' : 'Lifetime' }} Profit
              </div>
              <div
                class="text-4xl font-bold font-mono"
                :class="lifetimeStats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'"
              >
                {{ formatProfit(lifetimeStats.totalProfit) }}
              </div>
            </div>
            <div class="text-right space-y-1">
              <div class="text-sm text-gray-400">{{ lifetimeStats.totalHands }} hands</div>
              <div class="text-sm text-gray-400">{{ winRate.toFixed(1) }}% win rate</div>
            </div>
          </div>

          <!-- Key metrics -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4">
              <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-2">Won</div>
              <div class="text-2xl font-bold font-mono text-green-400">{{ lifetimeStats.won }}</div>
            </div>
            <div class="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4">
              <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-2">Lost</div>
              <div class="text-2xl font-bold font-mono text-red-400">{{ lifetimeStats.lost }}</div>
            </div>
            <div class="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4">
              <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-2">Folded</div>
              <div class="text-2xl font-bold font-mono text-gray-400">{{ lifetimeStats.folded }}</div>
            </div>
            <div class="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4">
              <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-2">Avg Pot</div>
              <div class="text-2xl font-bold font-mono text-white">${{ Math.round(lifetimeStats.avgPot) }}</div>
            </div>
          </div>

          <!-- Advanced stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="bg-gray-900/40 border border-gray-800/40 rounded-xl p-3 text-center">
              <div class="text-lg font-bold font-mono text-white">{{ lifetimeStats.showdownRate.toFixed(0) }}%</div>
              <div class="text-[0.6rem] text-gray-500 uppercase">Showdown Rate</div>
            </div>
            <div class="bg-gray-900/40 border border-gray-800/40 rounded-xl p-3 text-center">
              <div class="text-lg font-bold font-mono" :class="lifetimeStats.wonAtShowdown >= 50 ? 'text-green-400' : 'text-red-400'">
                {{ lifetimeStats.wonAtShowdown.toFixed(0) }}%
              </div>
              <div class="text-[0.6rem] text-gray-500 uppercase">Won at Showdown</div>
            </div>
            <div class="bg-gray-900/40 border border-gray-800/40 rounded-xl p-3 text-center">
              <div class="text-lg font-bold font-mono text-green-400">{{ formatProfit(lifetimeStats.biggestWin) }}</div>
              <div class="text-[0.6rem] text-gray-500 uppercase">Biggest Win</div>
            </div>
            <div class="bg-gray-900/40 border border-gray-800/40 rounded-xl p-3 text-center">
              <div class="text-lg font-bold font-mono text-red-400">{{ formatProfit(lifetimeStats.biggestLoss) }}</div>
              <div class="text-[0.6rem] text-gray-500 uppercase">Biggest Loss</div>
            </div>
          </div>

          <!-- Profit trend -->
          <div v-if="profitTimeline.length > 1" class="bg-gray-900/60 border border-gray-800/60 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Profit Trend</span>
              <span :class="profitTrendClass" class="text-sm font-mono font-bold">
                {{ formatProfit(profitTimeline[profitTimeline.length - 1]) }}
              </span>
            </div>
            <div class="flex items-end gap-[2px] h-20">
              <div
                v-for="(val, i) in profitTimeline"
                :key="i"
                class="flex-1 rounded-t-sm transition-all"
                :class="val >= 0 ? 'bg-green-500/60' : 'bg-red-500/60'"
                :style="{ height: `${Math.max(4, Math.abs(val) / Math.max(...profitTimeline.map(Math.abs)) * 100)}%` }"
              />
            </div>
            <div class="flex justify-between text-[0.6rem] text-gray-600 mt-1">
              <span>Oldest</span>
              <span>Last {{ profitTimeline.length }} hands</span>
              <span>Latest</span>
            </div>
          </div>

          <!-- Position stats -->
          <div v-if="positionStats.length > 0" class="bg-gray-900/60 border border-gray-800/60 rounded-xl p-5">
            <div class="text-[0.65rem] text-gray-500 uppercase tracking-wider mb-3">By Position</div>
            <div class="space-y-1.5">
              <button
                v-for="ps in positionStats"
                :key="ps.position"
                class="w-full flex items-center gap-3 text-xs bg-gray-800/40 rounded-lg px-3 py-2 hover:bg-gray-800/60 transition-colors cursor-pointer text-left"
                @click="drillIntoPosition(ps.position)"
              >
                <span class="font-bold text-white w-10 text-center bg-gray-700/50 rounded px-2 py-0.5">{{ ps.position }}</span>
                <span class="text-gray-400 flex-1">{{ ps.played }} hands</span>
                <span :class="ps.winRate >= 30 ? 'text-green-400' : 'text-red-400'" class="font-mono w-16">
                  {{ ps.winRate.toFixed(0) }}% win
                </span>
                <span :class="ps.profit >= 0 ? 'text-green-400' : 'text-red-400'" class="font-mono w-16 text-right font-bold">
                  {{ formatProfit(ps.profit) }}
                </span>
                <span class="text-gray-600 text-[0.6rem]">&rsaquo;</span>
              </button>
            </div>
          </div>

          <!-- Recent Hands -->
          <div v-if="recentHands.length > 0" class="bg-gray-900/60 border border-gray-800/60 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[0.65rem] text-gray-500 uppercase tracking-wider">Recent Hands</span>
              <button
                class="text-[0.6rem] text-gray-500 hover:text-white transition-colors underline underline-offset-2"
                @click="activeTab = 'hands'; positionFilter = null"
              >
                View all
              </button>
            </div>
            <div class="space-y-1">
              <button
                v-for="h in recentHands"
                :key="h.id"
                class="w-full flex items-center gap-2 text-xs bg-gray-800/40 rounded-lg px-3 py-2 hover:bg-gray-800/60 transition-colors cursor-pointer text-left"
                @click="drillIntoHand(h)"
              >
                <span class="text-gray-600 w-8 text-right font-mono">#{{ h.hand_number }}</span>
                <span class="font-mono text-white w-14">{{ h.hole_cards }}</span>
                <span class="text-gray-600 w-8 text-center text-[0.6rem]">{{ h.position }}</span>
                <span class="font-mono text-gray-500 text-[0.65rem] flex-1 truncate">{{ h.board || '---' }}</span>
                <span
                  class="px-1.5 py-0.5 rounded text-[0.55rem] font-bold uppercase w-14 text-center"
                  :class="{
                    'bg-green-900/40 text-green-400': h.result === 'won',
                    'bg-red-900/40 text-red-400': h.result === 'lost',
                    'bg-gray-800/60 text-gray-500': h.result === 'folded',
                  }"
                >
                  {{ h.result }}
                </span>
                <span
                  class="font-mono w-14 text-right font-bold"
                  :class="h.profit >= 0 ? 'text-green-400' : 'text-red-400'"
                >
                  {{ formatProfit(h.profit) }}
                </span>
                <span class="text-gray-600 text-[0.6rem]">&rsaquo;</span>
              </button>
            </div>
          </div>

          <!-- Export & Delete -->
          <div class="flex items-center justify-between pt-4 border-t border-gray-800/40">
            <div class="flex gap-2">
              <UButton variant="outline" color="neutral" size="xs" icon="i-lucide-download" @click="exportLifetimeJSON">JSON</UButton>
              <UButton variant="outline" color="neutral" size="xs" icon="i-lucide-download" @click="exportLifetimeCSV">CSV</UButton>
              <UTooltip text="PokerStars hand history format — importable into PokerTracker, Hold'em Manager, Equilab">
                <UButton variant="outline" color="neutral" size="xs" icon="i-lucide-download" @click="exportLifetimePokerStars">PokerStars</UButton>
              </UTooltip>
            </div>
            <UButton
              variant="ghost"
              color="error"
              size="xs"
              icon="i-lucide-trash-2"
              @click="showDeleteAllModal = true"
            >
              Delete All Data
            </UButton>
          </div>
        </div>

        <!-- ═══ SESSIONS ═══ -->
        <div v-if="activeTab === 'sessions'" class="space-y-3">
          <div
            v-for="s in sessions"
            :key="s.id"
            class="bg-gray-900/60 border border-gray-800/60 rounded-xl overflow-hidden hover:border-gray-700/60 transition-colors"
          >
            <!-- Session header — clickable for drill-down -->
            <button
              class="w-full text-left p-4 hover:bg-gray-800/30 transition-colors"
              @click="selectedSession = s; activeTab = 'overview'"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-white font-semibold">{{ stakeNames[s.stake_level] || 'Unknown' }}</span>
                  <span class="text-[0.6rem] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{{ s.player_count }}p</span>
                </div>
                <div class="flex items-center gap-3">
                  <span
                    class="text-lg font-bold font-mono"
                    :class="s.total_profit >= 0 ? 'text-green-400' : 'text-red-400'"
                  >
                    {{ formatProfit(s.total_profit) }}
                  </span>
                  <span class="text-gray-600 text-xs">&rsaquo;</span>
                </div>
              </div>
              <div class="flex items-center gap-4 text-xs text-gray-500">
                <span>{{ s.hands_played }} hands</span>
                <span class="text-green-400/60">{{ s.hands_won }}W</span>
                <span class="text-red-400/60">{{ s.hands_lost }}L</span>
                <span class="text-gray-600">{{ s.hands_folded }}F</span>
                <span class="ml-auto">{{ formatDate(s.started_at) }}</span>
              </div>
            </button>

            <!-- Session actions -->
            <div class="flex items-center justify-between px-4 py-2 bg-gray-800/20 border-t border-gray-800/30">
              <div class="flex gap-1">
                <UButton variant="ghost" color="neutral" size="2xs" @click.stop="exportSessionJSON(s)">JSON</UButton>
                <UButton variant="ghost" color="neutral" size="2xs" @click.stop="exportSessionCSV(s)">CSV</UButton>
                <UButton variant="ghost" color="neutral" size="2xs" @click.stop="exportSessionPokerStars(s)">PS</UButton>
              </div>
              <UButton
                variant="ghost"
                color="error"
                size="2xs"
                icon="i-lucide-trash-2"
                @click.stop="openDeleteSessionModal(s)"
              >
                Delete
              </UButton>
            </div>
          </div>
          <div v-if="sessions.length === 0" class="text-center text-gray-500 text-sm py-8">
            No sessions recorded yet.
          </div>
        </div>

        <!-- ═══ HANDS ═══ -->
        <div v-if="activeTab === 'hands'">
          <!-- Breadcrumb / filter bar -->
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs text-gray-500">
              <button class="hover:text-white transition-colors" @click="selectedSession = null; positionFilter = null">All Hands</button>
              <template v-if="selectedSession">
                <span>&rsaquo;</span>
                <button class="hover:text-white transition-colors text-gray-400" @click="positionFilter = null">
                  Session {{ selectedSession.id.slice(0, 8) }}
                </button>
              </template>
              <template v-if="positionFilter">
                <span>&rsaquo;</span>
                <span class="text-white font-semibold">{{ positionFilter }}</span>
              </template>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">{{ displayedHands.length }} hands</span>
              <button
                v-if="positionFilter"
                class="text-xs text-gray-500 hover:text-white transition-colors underline underline-offset-2"
                @click="positionFilter = null"
              >
                Clear filter
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <template v-for="h in displayedHands" :key="h.id">
              <button
                class="w-full text-left px-4 py-3 flex items-center gap-3 bg-gray-900/60 border border-gray-800/60 rounded-xl hover:border-gray-700/60 hover:bg-gray-800/20 transition-colors cursor-pointer"
                @click="openHandDetail(h)"
              >
                <span class="text-xs text-gray-500 w-8">#{{ h.hand_number }}</span>
                <span class="font-mono text-white text-sm w-16">{{ h.hole_cards }}</span>
                <span class="font-mono text-gray-500 text-xs flex-1 truncate">{{ h.board || '---' }}</span>
                <span class="text-xs text-gray-400 w-8">{{ h.position }}</span>
                <span
                  class="px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase w-16 text-center"
                  :class="{
                    'bg-green-900/40 text-green-400': h.result === 'won',
                    'bg-red-900/40 text-red-400': h.result === 'lost',
                    'bg-gray-800/60 text-gray-500': h.result === 'folded',
                  }"
                >
                  {{ h.result }}
                </span>
                <span class="font-mono text-sm w-16 text-right font-bold" :class="h.profit >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ formatProfit(h.profit) }}
                </span>
                <span class="text-gray-600 text-[0.6rem]">&rsaquo;</span>
              </button>
            </template>
          </div>
          <div v-if="displayedHands.length === 0" class="text-center text-gray-500 text-sm py-8">
            No hands recorded yet.
          </div>
        </div>
      </template>
    </div>

    <!-- ═══ DELETE ALL MODAL ═══ -->
    <UModal
      v-model:open="showDeleteAllModal"
      title="Delete All Lifetime Data"
      :dismissible="true"
    >
      <template #body>
        <div class="space-y-4 p-6">
          <div class="flex items-center gap-3 text-red-400">
            <span class="text-2xl">&#9888;</span>
            <p class="text-sm font-semibold">This action is permanent and cannot be undone.</p>
          </div>
          <p class="text-sm text-gray-400">
            All sessions, hand histories, and statistics will be permanently deleted from both your device and the cloud. This includes {{ lifetimeStats.totalHands }} hands across {{ lifetimeStats.totalSessions }} sessions.
          </p>
          <div>
            <label class="text-xs text-gray-500 block mb-1.5">
              Type <span class="font-mono font-bold text-red-400">DELETE</span> to confirm
            </label>
            <input
              v-model="deleteAllConfirmText"
              type="text"
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              placeholder="Type DELETE here"
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="outline"
              @click="showDeleteAllModal = false; deleteAllConfirmText = ''"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              :disabled="deleteAllConfirmText !== 'DELETE'"
              @click="deleteAllData"
            >
              Delete Everything
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ═══ DELETE SESSION MODAL ═══ -->
    <UModal
      v-model:open="showDeleteSessionModal"
      title="Delete Session"
      :dismissible="true"
    >
      <template #body>
        <div class="space-y-4 p-6">
          <p class="text-sm text-gray-400">
            Delete this session and all its hand history? This cannot be undone.
          </p>
          <div v-if="deleteSessionTarget" class="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
            <div class="flex justify-between">
              <span class="text-gray-500">Stakes</span>
              <span class="text-white">{{ stakeNames[deleteSessionTarget.stake_level] || 'Unknown' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Hands</span>
              <span class="text-white font-mono">{{ deleteSessionTarget.hands_played }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Result</span>
              <span :class="deleteSessionTarget.total_profit >= 0 ? 'text-green-400' : 'text-red-400'" class="font-mono font-bold">
                {{ formatProfit(deleteSessionTarget.total_profit) }}
              </span>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="outline"
              @click="showDeleteSessionModal = false; deleteSessionTarget = null"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              @click="deleteSession(deleteSessionTarget!.id)"
            >
              Delete Session
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ═══ DELETE HAND MODAL ═══ -->
    <UModal
      v-model:open="showDeleteHandModal"
      title="Delete Hand"
      :dismissible="true"
    >
      <template #body>
        <div class="space-y-4 p-6">
          <p class="text-sm text-gray-400">
            Delete this hand from your history? This cannot be undone.
          </p>
          <div v-if="deleteHandTarget" class="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
            <div class="flex justify-between">
              <span class="text-gray-500">Hand</span>
              <span class="text-white font-mono">#{{ deleteHandTarget.hand_number }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Cards</span>
              <span class="text-white font-mono">{{ deleteHandTarget.hole_cards }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Result</span>
              <span :class="deleteHandTarget.profit >= 0 ? 'text-green-400' : 'text-red-400'" class="font-mono font-bold">
                {{ formatProfit(deleteHandTarget.profit) }}
              </span>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="outline"
              @click="showDeleteHandModal = false; deleteHandTarget = null"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              @click="deleteHand(deleteHandTarget!.id)"
            >
              Delete Hand
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ═══ HAND DETAIL MODAL ═══ -->
    <UModal
      v-model:open="showHandModal"
      :dismissible="true"
      :ui="{ width: 'max-w-2xl' }"
    >
      <template #body>
        <div v-if="selectedHand" class="p-6 space-y-5">
          <!-- Header: result + profit -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-500 font-mono">#{{ selectedHand.hand_number }}</span>
              <span
                class="px-3 py-1 rounded-lg text-sm font-bold"
                :class="{
                  'bg-green-600/20 text-green-400': selectedHand.result === 'won',
                  'bg-red-600/15 text-red-400': selectedHand.result === 'lost',
                  'bg-gray-700/40 text-gray-400': selectedHand.result === 'folded',
                }"
              >
                {{ selectedHand.result === 'won' ? 'WON' : selectedHand.result === 'lost' ? 'LOST' : 'FOLDED' }}
              </span>
              <span :class="selectedHand.profit >= 0 ? 'text-green-400' : 'text-red-400'" class="font-mono font-bold text-xl">
                {{ formatProfit(selectedHand.profit) }}
              </span>
            </div>
            <span class="text-xs text-gray-500">
              Pot: <span class="text-yellow-400 font-mono">${{ selectedHand.pot_size }}</span>
              &middot; {{ selectedHand.position }}
            </span>
          </div>

          <!-- Action buttons -->
          <div class="flex items-center gap-2 flex-wrap">
            <NuxtLink v-if="selectedHand.players && selectedHand.players.length > 0" :to="`/replay-hand?hand=${encodeURIComponent(toPokerStarsFormat(selectedHand, getStakeFromLevel(selectedHand.stake_level)))}`">
              <UTooltip text="Watch the hand play out step-by-step with all cards face-up. Pause and study each action.">
                <UButton variant="outline" color="primary" size="xs" icon="i-lucide-eye">Watch</UButton>
              </UTooltip>
            </NuxtLink>
            <NuxtLink v-if="selectedHand.players && selectedHand.players.length > 0" :to="`/replay?hand=${selectedHand.id}`">
              <UTooltip text="Re-play the hand interactively — make different decisions, see what happens.">
                <UButton variant="outline" color="neutral" size="xs" icon="i-lucide-rotate-ccw">Practice</UButton>
              </UTooltip>
            </NuxtLink>
            <UButton v-if="selectedHand.actions && selectedHand.actions.length > 0" variant="outline" color="info" size="xs" icon="i-lucide-search" @click="openAnalysis(selectedHand)">Analyze</UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              :icon="copiedHandId === selectedHand.id ? 'i-lucide-check' : 'i-lucide-clipboard'"
              @click="copyHandToClipboard(selectedHand)"
            >
              {{ copiedHandId === selectedHand.id ? 'Copied' : 'Copy' }}
            </UButton>
            <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-download" @click="exportSingleHandPokerStars(selectedHand)">Export</UButton>
            <UButton variant="ghost" color="error" size="xs" icon="i-lucide-trash-2" @click="openDeleteHandModal(selectedHand)">Delete</UButton>
          </div>

          <!-- Cards -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-gray-900/50 rounded-lg p-3">
              <div class="text-[0.6rem] text-gray-500 uppercase mb-1">Your Hand</div>
              <div class="text-xl font-mono font-bold text-white">{{ selectedHand.hole_cards }}</div>
            </div>
            <div v-if="selectedHand.board" class="bg-gray-900/50 rounded-lg p-3">
              <div class="text-[0.6rem] text-gray-500 uppercase mb-1">Board</div>
              <div class="flex items-center gap-2">
                <span class="text-lg font-mono text-white">{{ boardCards(selectedHand.board).slice(0, 3).join(' ') }}</span>
                <span v-if="boardCards(selectedHand.board).length >= 4" class="text-lg font-mono text-amber-300">{{ boardCards(selectedHand.board)[3] }}</span>
                <span v-if="boardCards(selectedHand.board).length >= 5" class="text-lg font-mono text-red-300">{{ boardCards(selectedHand.board)[4] }}</span>
              </div>
            </div>
            <div v-else class="bg-gray-900/50 rounded-lg p-3">
              <div class="text-xs text-gray-600">Hand ended preflop</div>
            </div>
          </div>

          <!-- Players -->
          <div v-if="selectedHand.players && selectedHand.players.length > 0">
            <div class="text-[0.6rem] text-gray-500 uppercase mb-1.5">Players</div>
            <div class="grid grid-cols-2 gap-1.5">
              <div
                v-for="(player, pi) in selectedHand.players"
                :key="pi"
                class="flex items-center justify-between bg-gray-900/40 rounded px-2.5 py-1.5 text-xs"
                :class="player.folded ? 'opacity-40' : ''"
              >
                <div class="flex items-center gap-1.5">
                  <span :class="player.isHero ? 'text-amber-400' : 'text-gray-300'" class="font-semibold">{{ player.name }}</span>
                  <span class="text-gray-600 text-[0.55rem]">{{ player.position }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="font-mono text-white">{{ player.holeCards || '?' }}</span>
                  <span v-if="player.folded" class="text-red-400/50 text-[0.5rem]">FOLD</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Hand History -->
          <div v-if="selectedHand.players && selectedHand.players.length > 0">
            <div class="text-[0.6rem] text-gray-500 uppercase mb-1.5">Hand History</div>
            <div class="bg-gray-900/50 rounded-lg p-3 max-h-72 overflow-y-auto">
              <pre class="text-[0.65rem] font-mono leading-relaxed whitespace-pre-wrap"><template v-for="(line, li) in toPokerStarsFormat(selectedHand, getStakeFromLevel(selectedHand.stake_level)).split('\n')" :key="li"><span :class="[
                line.startsWith('***') ? 'text-yellow-500/80 font-semibold' : '',
                line.startsWith('Dealt to') ? 'text-amber-400' : '',
                line.includes('collected') ? 'text-green-400 font-semibold' : '',
                line.startsWith('Seat') && line.includes('won') ? 'text-green-400' : '',
                line.startsWith('Seat') && line.includes('lost') ? 'text-red-400/70' : '',
                line.startsWith('Seat') && line.includes('folded') ? 'text-gray-600' : '',
                line.startsWith('PokerStars') || line.startsWith('Table') ? 'text-gray-500' : '',
                line.startsWith('Board') || line.startsWith('Total') ? 'text-gray-400' : '',
              ]">{{ line }}
</span></template></pre>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ═══ HAND ANALYSIS MODAL ═══ -->
    <HandAnalysisModal
      v-if="analysisHand"
      :hand="analysisHand"
      v-model:open="showAnalysisModal"
      @close="analysisHand = null"
    />
  </div>
</template>
