<script setup lang="ts">
/**
 * Hand history replay viewer — deterministic step-by-step playback of
 * PokerStars-format hands. All cards face-up. No interaction.
 * Accepts paste input or ?hand= query param.
 */
import { parsePokerStarsHand, parseMultipleHands } from '~/utils/pokerStarsParser'
import type { PSHandHistory, PSAction } from '~/utils/pokerStarsParser'
import type { Card } from '~/utils/cards'
import { displayCard } from '~/utils/cards'

defineOptions({ name: 'replay-hand' })
useHead({ title: 'Hand Replay Viewer' })

interface PlaybackStep {
  type: 'blind' | 'deal' | 'action' | 'street' | 'showdown' | 'award'
  description: string
  player?: string
  actionType?: string
  amount?: number
  newCards?: Card[]
}

// ─── Input state ──────────────────────────────────────────
const inputText = ref('')
const parseError = ref<string | null>(null)
const parsedHands = ref<PSHandHistory[]>([])
const selectedHandIndex = ref(0)
const phase = ref<'input' | 'viewing'>('input')

// ─── Playback state ───────────────────────────────────────
const stepIndex = ref(0)
const playing = ref(false)
const speed = ref(1000)
const playerChips = ref(new Map<string, number>())
const playerBetThisRound = ref(new Map<string, number>())
const playerFolded = ref(new Set<string>())
const playerLastAction = ref(new Map<string, string>())
const pot = ref(0)
const currentBet = ref(0)
const visibleBoard = ref<Card[]>([])
const currentStreet = ref('preflop')
let playTimer: ReturnType<typeof setInterval> | null = null

const hand = computed(() => parsedHands.value[selectedHandIndex.value] || null)

// Build flat action queue from parsed hand
const actionQueue = computed<PlaybackStep[]>(() => {
  const h = hand.value
  if (!h) return []
  const steps: PlaybackStep[] = []

  for (const street of h.streets) {
    // Street card reveal
    if (street.name !== 'preflop' && street.newCards.length > 0) {
      const cardStr = street.newCards.map(displayCard).join(' ')
      steps.push({ type: 'street', description: `--- ${street.name.toUpperCase()}: ${cardStr} ---`, newCards: street.newCards })
    }

    // Actions
    for (const a of street.actions) {
      const desc = a.type === 'sb' ? `${a.player} posts SB $${a.amount}`
        : a.type === 'bb' ? `${a.player} posts BB $${a.amount}`
        : a.type === 'fold' ? `${a.player} folds`
        : a.type === 'check' ? `${a.player} checks`
        : a.type === 'call' ? `${a.player} calls $${a.amount}`
        : a.type === 'raise' ? `${a.player} raises to $${a.amount}`
        : a.type === 'bet' ? `${a.player} bets $${a.amount}`
        : a.type === 'all-in' ? `${a.player} ALL-IN $${a.amount}`
        : `${a.player} ${a.type}`
      steps.push({ type: a.type === 'sb' || a.type === 'bb' ? 'blind' : 'action', description: desc, player: a.player, actionType: a.type, amount: a.amount })
    }
  }

  // Awards
  for (const w of h.winners) {
    steps.push({ type: 'award', description: `${w.player} wins $${w.amount}`, player: w.player, amount: w.amount })
  }

  return steps
})

function resetPlayback() {
  const h = hand.value
  if (!h) return
  stepIndex.value = -1
  pot.value = 0
  currentBet.value = 0
  visibleBoard.value = []
  currentStreet.value = 'preflop'
  playerChips.value = new Map(h.players.map(p => [p.name, p.chips]))
  playerBetThisRound.value = new Map()
  playerFolded.value = new Set()
  playerLastAction.value = new Map()
}

function applyStep(idx: number) {
  const step = actionQueue.value[idx]
  if (!step) return

  if (step.type === 'street') {
    visibleBoard.value = [...visibleBoard.value, ...(step.newCards || [])]
    currentStreet.value = step.description.includes('FLOP') ? 'flop' : step.description.includes('TURN') ? 'turn' : 'river'
    // Reset round bets
    playerBetThisRound.value = new Map()
    currentBet.value = 0
    playerLastAction.value = new Map()
  } else if (step.type === 'blind' || step.type === 'action') {
    const name = step.player!
    const type = step.actionType!
    const amount = step.amount || 0

    if (type === 'fold') {
      playerFolded.value = new Set([...playerFolded.value, name])
      playerLastAction.value = new Map([...playerLastAction.value, [name, 'fold']])
    } else if (type === 'check') {
      playerLastAction.value = new Map([...playerLastAction.value, [name, 'check']])
    } else if (type === 'call') {
      const chips = playerChips.value.get(name) || 0
      const paid = Math.min(amount, chips)
      playerChips.value = new Map([...playerChips.value, [name, chips - paid]])
      pot.value += paid
      playerBetThisRound.value = new Map([...playerBetThisRound.value, [name, (playerBetThisRound.value.get(name) || 0) + paid]])
      playerLastAction.value = new Map([...playerLastAction.value, [name, 'call']])
    } else if (type === 'raise' || type === 'bet' || type === 'all-in') {
      const chips = playerChips.value.get(name) || 0
      const alreadyIn = playerBetThisRound.value.get(name) || 0
      const totalBet = type === 'raise' ? amount : amount // for bet/all-in, amount is the bet size
      const toAdd = type === 'raise' ? Math.min(totalBet - alreadyIn, chips) : Math.min(amount, chips)
      playerChips.value = new Map([...playerChips.value, [name, chips - toAdd]])
      pot.value += toAdd
      const newBetTotal = alreadyIn + toAdd
      playerBetThisRound.value = new Map([...playerBetThisRound.value, [name, newBetTotal]])
      if (newBetTotal > currentBet.value) currentBet.value = newBetTotal
      playerLastAction.value = new Map([...playerLastAction.value, [name, type === 'all-in' ? 'all-in' : type === 'bet' ? 'bet' : 'raise']])
    } else if (type === 'sb' || type === 'bb') {
      const chips = playerChips.value.get(name) || 0
      const paid = Math.min(amount, chips)
      playerChips.value = new Map([...playerChips.value, [name, chips - paid]])
      pot.value += paid
      playerBetThisRound.value = new Map([...playerBetThisRound.value, [name, paid]])
      if (paid > currentBet.value) currentBet.value = paid
      playerLastAction.value = new Map([...playerLastAction.value, [name, type]])
    }
  } else if (step.type === 'award') {
    const chips = playerChips.value.get(step.player!) || 0
    playerChips.value = new Map([...playerChips.value, [step.player!, chips + (step.amount || 0)]])
  }

  stepIndex.value = idx
}

function stepForward() {
  const next = stepIndex.value + 1
  if (next < actionQueue.value.length) applyStep(next)
  else stopPlayback()
}

function stepBack() {
  const target = stepIndex.value - 1
  if (target < -1) return
  resetPlayback()
  for (let i = 0; i <= target; i++) applyStep(i)
}

function togglePlay() {
  if (playing.value) { stopPlayback() }
  else {
    playing.value = true
    playTimer = setInterval(() => {
      if (stepIndex.value >= actionQueue.value.length - 1) { stopPlayback(); return }
      stepForward()
    }, speed.value)
  }
}

function stopPlayback() {
  playing.value = false
  if (playTimer) { clearInterval(playTimer); playTimer = null }
}

function setSpeed(ms: number) {
  speed.value = ms
  if (playing.value) {
    if (playTimer) clearInterval(playTimer)
    playTimer = setInterval(() => {
      if (stepIndex.value >= actionQueue.value.length - 1) { stopPlayback(); return }
      stepForward()
    }, ms)
  }
}

// ─── Input handling ───────────────────────────────────────

function parseAndLoad() {
  parseError.value = null
  const text = inputText.value.trim()
  if (!text) { parseError.value = 'Please paste a PokerStars hand history'; return }

  const results = parseMultipleHands(text)
  const successful = results.filter(r => r.success && r.hand)
  if (successful.length === 0) {
    parseError.value = results[0]?.error || 'Could not parse any valid hands'
    return
  }

  parsedHands.value = successful.map(r => r.hand!)
  selectedHandIndex.value = 0
  phase.value = 'viewing'
  nextTick(() => { resetPlayback(); applyStep(0) })
}

function selectHand(idx: number) {
  stopPlayback()
  selectedHandIndex.value = idx
  nextTick(() => { resetPlayback(); applyStep(0) })
}

function backToInput() {
  stopPlayback()
  phase.value = 'input'
}

async function loadSample() {
  try {
    const res = await fetch('/sample-hands.txt')
    if (!res.ok) { parseError.value = 'Could not load sample hands file'; return }
    const text = await res.text()
    // Take first 3 hands only
    const hands = text.split(/\n\s*\n(?=PokerStars Hand #)/).slice(0, 3)
    inputText.value = hands.join('\n\n')
    parseAndLoad()
  } catch { parseError.value = 'Failed to fetch sample hands' }
}

// ─── Query param / mount ──────────────────────────────────

onMounted(() => {
  const route = useRoute()
  if (route.query.hand) {
    inputText.value = decodeURIComponent(route.query.hand as string)
    parseAndLoad()
  }
})

// ─── Keyboard shortcuts ──────────────────────────────────

function onKeydown(e: KeyboardEvent) {
  if (phase.value !== 'viewing') return
  if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
  if (e.code === 'Space') { e.preventDefault(); togglePlay() }
  if (e.code === 'ArrowRight' || e.key === 'n') stepForward()
  if (e.code === 'ArrowLeft' || e.key === 'p') stepBack()
  if (e.key === 'Escape') backToInput()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); stopPlayback() })

// ─── Computed for template ───────────────────────────────

const progressPct = computed(() => actionQueue.value.length > 1 ? (stepIndex.value / (actionQueue.value.length - 1)) * 100 : 0)
const activePlayer = computed(() => {
  const step = actionQueue.value[stepIndex.value]
  return step?.player || null
})

// ─── Per-player hand analysis for stats panel ────────────
import { bestHand, HAND_RANK_NAMES, detectDraws, estimateEquity, describeHand } from '~/utils/handAnalysis'

interface PlayerAnalysis {
  name: string
  position: string
  cards: string
  handDesc: string
  handRank: number
  equity: number
  draws: { type: string; outs: number }[]
  folded: boolean
  isLeader: boolean
}

const playerAnalyses = computed<PlayerAnalysis[]>(() => {
  if (!hand.value || visibleBoard.value.length < 3) return []
  const analyses: PlayerAnalysis[] = []
  let bestRank = -1

  for (const p of hand.value.players) {
    if (!p.holeCards) continue
    const folded = playerFolded.value.has(p.name)
    const result = bestHand(Array.from(p.holeCards), visibleBoard.value)
    const draws = folded ? [] : detectDraws(Array.from(p.holeCards), visibleBoard.value)
    const desc = folded ? 'Folded' : (result ? describeHand(p.holeCards, visibleBoard.value) : 'Unknown')
    const rank = result?.rank ?? -1
    if (!folded && rank > bestRank) bestRank = rank

    analyses.push({
      name: p.name,
      position: p.position,
      cards: p.holeCards.map(c => displayCard(c)).join(' '),
      handDesc: desc,
      handRank: rank,
      equity: folded ? 0 : estimateEquity(p.holeCards, visibleBoard.value, hand.value!.players.filter(pp => pp.holeCards && !playerFolded.value.has(pp.name)).length - 1 || 1, 150),
      draws,
      folded,
      isLeader: false,
    })
  }

  // Mark the leader(s)
  for (const a of analyses) {
    if (!a.folded && a.handRank === bestRank) a.isLeader = true
  }

  return analyses
})
</script>

<template>
  <div class="min-h-screen bg-[#0a0a0f] text-gray-200">
    <!-- Input phase -->
    <div v-if="phase === 'input'" class="max-w-3xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Hand History Replay</h1>
          <p class="text-gray-500 text-sm mt-1">Paste a PokerStars-format hand history to watch it play out visually.</p>
        </div>
        <NuxtLink to="/">
          <UButton variant="outline" color="neutral" size="sm" icon="i-lucide-arrow-left">Back</UButton>
        </NuxtLink>
      </div>

      <textarea
        v-model="inputText"
        class="w-full h-64 bg-gray-900 border border-gray-700 rounded-xl p-4 text-xs font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-green-500/50 resize-y"
        placeholder="Paste a PokerStars hand history here...

PokerStars Hand #1: Hold'em No Limit ($1/$2) - 2026-04-01 12:00:00 ET
Table 'Holdem Simulator' 6-max Seat #1 is the button
Seat 1: Player1 ($200 in chips)
..."
      />

      <div v-if="parseError" class="mt-3 bg-red-900/20 border border-red-800/30 rounded-lg px-4 py-3 text-sm text-red-400">
        {{ parseError }}
      </div>

      <div class="flex items-center gap-3 mt-4">
        <UButton color="primary" size="lg" @click="parseAndLoad">
          Load &amp; Replay
        </UButton>
        <UButton variant="outline" color="neutral" size="lg" @click="loadSample">
          Load Sample Hands
        </UButton>
        <span class="text-xs text-gray-600">Supports single or multiple hands. All cards shown face-up.</span>
      </div>
    </div>

    <!-- Viewing phase -->
    <div v-if="phase === 'viewing' && hand" class="max-w-[100rem] mx-auto px-4 py-4 flex gap-4 items-start">
      <div class="flex-1 min-w-0">
      <!-- Top bar -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-arrow-left" @click="backToInput">Back</UButton>
          <span class="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-400 uppercase font-bold tracking-wider">Replay</span>
          <span class="text-sm text-gray-400">Hand #{{ hand.handId }}</span>
          <span class="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 uppercase">{{ currentStreet }}</span>
          <span class="text-xs text-gray-500">${{ hand.stakes.sb }}/${{ hand.stakes.bb }}</span>
        </div>
        <!-- Hand selector -->
        <div v-if="parsedHands.length > 1" class="flex items-center gap-2">
          <UButton size="xs" variant="ghost" color="neutral" :disabled="selectedHandIndex === 0" @click="selectHand(selectedHandIndex - 1)">Prev</UButton>
          <span class="text-xs text-gray-500">{{ selectedHandIndex + 1 }} / {{ parsedHands.length }}</span>
          <UButton size="xs" variant="ghost" color="neutral" :disabled="selectedHandIndex >= parsedHands.length - 1" @click="selectHand(selectedHandIndex + 1)">Next</UButton>
        </div>
      </div>

      <!-- Table -->
      <PokerTable :player-count="hand.players.length">
        <template #community>
          <PlayingCard
            v-for="(card, i) in visibleBoard"
            :key="i"
            :card="card"
            :face-up="true"
            size="md"
          />
          <div
            v-for="i in (5 - visibleBoard.length)"
            :key="'empty-' + i"
            class="w-20 h-[7rem] rounded-lg border border-dashed border-green-800/40"
          />
        </template>

        <template #pot>
          <div class="text-center text-yellow-400 font-bold text-sm font-mono tabular-nums min-w-[5rem]">
            Pot: ${{ pot }}
          </div>
        </template>

        <template #seat="{ seatIndex }">
          <PlayerSeat
            v-if="hand.players[seatIndex]"
            :name="hand.players[seatIndex].name"
            :chips="playerChips.get(hand.players[seatIndex].name) ?? hand.players[seatIndex].chips"
            :position="hand.players[seatIndex].position"
            :hole-cards="hand.players[seatIndex].holeCards"
            :show-cards="true"
            :is-hero="false"
            :is-active="activePlayer === hand.players[seatIndex].name"
            :folded="playerFolded.has(hand.players[seatIndex].name)"
            :eliminated="false"
            :stake-level="3"
            :peekable="false"
            :last-action="playerLastAction.get(hand.players[seatIndex].name) || null"
            :current-bet-amount="playerBetThisRound.get(hand.players[seatIndex].name) || 0"
          />
        </template>
      </PokerTable>

      <!-- Playback controls -->
      <div class="flex items-center justify-between mt-4 bg-gray-900/80 border border-gray-700/50 rounded-xl px-4 py-3">
        <div class="flex items-center gap-2">
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-skip-back" :disabled="stepIndex <= 0" @click="stepBack" />
          <UButton
            size="sm"
            :color="playing ? 'warning' : 'primary'"
            :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
            @click="togglePlay"
          >
            {{ playing ? 'Pause' : 'Play' }}
          </UButton>
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-skip-forward" :disabled="stepIndex >= actionQueue.length - 1" @click="stepForward" />
        </div>

        <div class="flex-1 mx-4">
          <div class="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-green-500 rounded-full transition-all duration-200" :style="{ width: `${progressPct}%` }" />
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-500 tabular-nums">{{ stepIndex + 1 }} / {{ actionQueue.length }}</span>
          <div class="flex gap-1">
            <button
              v-for="s in [{ label: '0.5x', ms: 2000 }, { label: '1x', ms: 1000 }, { label: '2x', ms: 500 }, { label: '3x', ms: 333 }]"
              :key="s.ms"
              class="px-2 py-0.5 rounded text-[0.6rem] font-semibold transition-colors"
              :class="speed === s.ms ? 'bg-green-700/60 text-green-200' : 'text-gray-500 hover:text-gray-300'"
              @click="setSpeed(s.ms)"
            >
              {{ s.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Action log -->
      <div class="mt-4 bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 max-h-48 overflow-y-auto">
        <div class="text-[0.6rem] text-gray-500 uppercase tracking-wider mb-2">Action Log</div>
        <div class="space-y-0.5">
          <div
            v-for="(step, i) in actionQueue"
            :key="i"
            class="text-xs font-mono px-2 py-0.5 rounded transition-colors"
            :class="{
              'bg-green-900/30 text-green-300': i === stepIndex,
              'text-gray-500': i < stepIndex && i !== stepIndex,
              'text-gray-700': i > stepIndex,
              'text-cyan-400 font-semibold': step.type === 'street',
              'text-yellow-400': step.type === 'award',
            }"
          >
            {{ step.description }}
          </div>
        </div>
      </div>

      <!-- Keyboard hint -->
      <div class="mt-3 text-center text-[0.55rem] text-gray-700">
        Space = play/pause &middot; Arrow keys = step &middot; Esc = back
      </div>
      </div>

      <!-- Stats panel (right side) -->
      <div v-if="visibleBoard.length >= 3 && playerAnalyses.length > 0" class="hidden xl:block w-80 shrink-0 sticky top-4">
        <div class="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-clip text-sm h-[min(calc(100vh-6rem),800px)] flex flex-col">
          <div class="px-4 py-2.5 border-b border-gray-700/50 shrink-0">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Hand Analysis</span>
            <span class="text-[0.55rem] text-gray-600 ml-2">{{ currentStreet.toUpperCase() }}</span>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            <div
              v-for="pa in playerAnalyses"
              :key="pa.name"
              class="rounded-lg p-2.5 border"
              :class="pa.folded
                ? 'bg-gray-800/20 border-gray-800/30 opacity-40'
                : pa.isLeader
                  ? 'bg-green-900/20 border-green-700/30'
                  : 'bg-gray-800/40 border-gray-800/40'"
            >
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-semibold" :class="pa.isLeader ? 'text-green-400' : 'text-white'">{{ pa.name }}</span>
                  <span class="text-[0.55rem] text-gray-600">{{ pa.position }}</span>
                </div>
                <span class="text-xs font-mono text-gray-400">{{ pa.cards }}</span>
              </div>

              <div class="text-xs font-semibold" :class="pa.folded ? 'text-gray-600' : 'text-white'">{{ pa.handDesc }}</div>

              <template v-if="!pa.folded">
                <!-- Equity bar -->
                <div class="flex items-center gap-2 mt-1.5">
                  <div class="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-300"
                      :class="pa.equity >= 50 ? 'bg-green-500' : pa.equity >= 25 ? 'bg-yellow-500' : 'bg-red-500'"
                      :style="{ width: `${Math.max(2, pa.equity)}%` }"
                    />
                  </div>
                  <span class="text-xs font-mono tabular-nums w-10 text-right" :class="pa.equity >= 50 ? 'text-green-400' : pa.equity >= 25 ? 'text-yellow-400' : 'text-red-400'">{{ pa.equity }}%</span>
                </div>

                <!-- Draws -->
                <div v-if="pa.draws.length > 0" class="mt-1">
                  <div v-for="d in pa.draws" :key="d.type" class="text-[0.6rem] text-blue-400/70">
                    {{ d.type }} ({{ d.outs }} outs)
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
