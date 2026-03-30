<script setup lang="ts">
defineOptions({ name: 'replay' })
/**
 * Hand Replay page — loads a recorded hand and lets the hero replay it.
 * Same cards, same board, same opponents. Hero can make different decisions;
 * bots use the same decision engine. Shows comparison at the end.
 * Uses shared composables for game state and engine logic.
 */
import config from '@config'
import { assignPositions } from '~/utils/seats'
import type { Card, Suit } from '~/utils/cards'
import { displayCard } from '~/utils/cards'
import { decideBotAction, createTiltState } from '~/utils/botDecision'
import { bestHand } from '~/utils/handAnalysis'
import { calculateSidePots, awardPots } from '~/utils/sidePots'
import type { PlayerHand } from '~/composables/useSessionStats'
import { useSupabase, ensureAnonSession } from '~/composables/useSupabase'
import { useGameState } from '~/composables/useGameState'
import { useGameEngine } from '~/composables/useGameEngine'
import type { PlayerState } from '~/composables/useGameState'

// ─── Route Query ──────────────────────────────────────────────
const route = useRoute()
const handId = computed(() => route.query.hand as string || '')

// ─── State ────────────────────────────────────────────────────
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const replayPhase = ref<'loading' | 'ready' | 'playing' | 'finished'>('loading')

// Original hand data
const originalHand = ref<{
  handNumber: number
  holeCards: string
  board: string
  result: string
  profit: number
  position: string
  potSize: number
  actions: string[]
  players: PlayerHand[]
  stakeLevel: number
  playerCount: number
} | null>(null)

// ─── Parse card strings back to Card objects ──────────────────
import { parseDisplayCards as parseCards, parseDisplayHoleCards as parseHoleCards } from '~/utils/cardParser'

// ─── Load hand data ───────────────────────────────────────────
onMounted(async () => {
  if (!handId.value) {
    errorMsg.value = 'No hand ID provided.'
    loading.value = false
    return
  }
  let found = loadFromLocalStorage()
  if (!found) found = await loadFromSupabase()
  if (!found) errorMsg.value = 'Hand not found.'
  loading.value = false
})

function loadFromLocalStorage(): boolean {
  try {
    const saved = localStorage.getItem('holdem-session-stats')
    if (!saved) return false
    const session = JSON.parse(saved)
    if (!session.hands) return false

    let hand: any = null
    if (handId.value.startsWith('local-')) {
      const idx = parseInt(handId.value.replace('local-', ''), 10)
      if (idx >= 0 && idx < session.hands.length) hand = session.hands[idx]
    } else {
      hand = session.hands.find((h: any) => String(h.handNumber) === handId.value)
    }
    if (!hand) return false

    originalHand.value = {
      handNumber: hand.handNumber, holeCards: hand.holeCards,
      board: hand.board, result: hand.result, profit: hand.profit,
      position: hand.position, potSize: hand.potSize,
      actions: hand.actions || [], players: hand.players || [],
      stakeLevel: session.stakeLevel, playerCount: session.playerCount,
    }
    replayPhase.value = 'ready'
    return true
  } catch { return false }
}

async function loadFromSupabase(): Promise<boolean> {
  const sb = useSupabase()
  if (!sb) return false
  const userId = await ensureAnonSession()
  if (!userId) return false
  try {
    const { data, error } = await sb.from('hands').select('*').eq('id', handId.value).single()
    if (error || !data) return false
    originalHand.value = {
      handNumber: data.hand_number, holeCards: data.hole_cards,
      board: data.board || '', result: data.result, profit: data.profit,
      position: data.position, potSize: data.pot_size,
      actions: data.actions || [], players: data.players || [],
      stakeLevel: data.stake_level, playerCount: data.player_count,
    }
    replayPhase.value = 'ready'
    return true
  } catch { return false }
}

// ─── Game config from original hand ───────────────────────────
const stake = computed(() => {
  const lvl = originalHand.value?.stakeLevel || 3
  return config.stakes.find(s => s.level === lvl)!
})
const bb = computed(() => stake.value?.bb || 2)
const sb = computed(() => stake.value?.sb || 1)
const playerCount = computed(() => originalHand.value?.playerCount || 6)
const startingStack = computed(() => bb.value * 100)

const positions = computed(() => {
  if (!originalHand.value) return []
  return assignPositions(playerCount.value, gs.dealerSeat.value)
})

// Replay result
const replayResult = ref<{ result: string; profit: number } | null>(null)

// ─── Game State & Engine ──────────────────────────────────────
const gs = useGameState(bb)

const engine = useGameEngine({
  gameState: gs,
  bb,
  sb,
  positions,
  makeBotDecision: (p: PlayerState, raiseLevel: number, streetContext?) => {
    if (!originalHand.value) return { type: 'fold' }
    const player = originalHand.value.players[p.id]
    if (!player) return { type: 'fold' }

    const profile = botProfileForPlayer(player)
    return decideBotAction(profile, {
      street: gs.street.value as 'preflop' | 'flop' | 'turn' | 'river',
      toCall: gs.currentBet.value - p.betThisRound,
      pot: gs.pot.value,
      currentBet: gs.currentBet.value,
      playerBet: p.betThisRound,
      chips: p.chips,
      bb: bb.value,
      numActivePlayers: gs.activePlayers.value.length,
      raiseLevel,
      position: positions.value[p.id] || '',
      holeCards: p.holeCards ?? undefined,
      community: gs.allCommunity.value.length > 0 ? gs.allCommunity.value : undefined,
      wasPreflopRaiser: streetContext?.wasPreflopRaiser,
      preflopCallers: streetContext?.preflopCallers,
      streetHistory: streetContext?.streetHistory as any,
      opponentReads: streetContext?.opponentReads,
      tableDynamics: streetContext?.tableDynamics,
    })
  },
  onEndHand: () => endHand(),
  botDelay: { min: 600, max: 1400, heroFoldedMin: 150, heroFoldedMax: 350 },
})

// ─── Bot profiles from original player names ──────────────────
function botProfileForPlayer(player: PlayerHand) {
  const persona = config.personas.find(p => p.name === player.name)
  if (persona) {
    return {
      vpip: persona.vpip, pfr: persona.pfr, aggression: persona.aggression,
      bluffFreq: persona.bluffFreq, creativeFreq: persona.creativeFreq,
      threeBetFreq: persona.threeBetFreq, fourBetFreq: persona.fourBetFreq,
      fiveBetFreq: persona.fiveBetFreq,
    }
  }
  const preset = config.botPresets.find(p => p.name === player.name)
  if (preset) {
    return {
      vpip: preset.vpip, pfr: preset.pfr, aggression: preset.aggression,
      bluffFreq: preset.bluffFreq, creativeFreq: preset.creativeFreq,
      threeBetFreq: preset.threeBetFreq, fourBetFreq: preset.fourBetFreq,
      fiveBetFreq: preset.fiveBetFreq,
    }
  }
  return { vpip: 0.22, pfr: 0.18, aggression: 1.2, bluffFreq: 0.14, creativeFreq: 0.05 }
}

// ─── Determine dealer seat from original hand ─────────────────
function findDealerSeat(): number {
  if (!originalHand.value) return 0
  const count = playerCount.value
  for (let d = 0; d < count; d++) {
    const pos = assignPositions(count, d)
    if (pos[0] === originalHand.value.position) return d
  }
  return 0
}

// ─── Start Replay ─────────────────────────────────────────────
function startReplay() {
  if (!originalHand.value) return

  replayPhase.value = 'playing'
  replayResult.value = null
  gs.dealerSeat.value = findDealerSeat()

  const players = originalHand.value.players
  const count = playerCount.value
  const boardCards = parseCards(originalHand.value.board)
  const knownCards = new Set<string>()
  for (const c of boardCards) knownCards.add(`${c.rank}-${c.suit}`)

  const states: PlayerState[] = []
  for (let i = 0; i < count; i++) {
    const player = players[i]
    if (!player) continue
    const hc = parseHoleCards(player.holeCards)
    if (hc) {
      knownCards.add(`${hc[0].rank}-${hc[0].suit}`)
      knownCards.add(`${hc[1].rank}-${hc[1].suit}`)
    }
    states.push({
      id: i, name: player.name, chips: startingStack.value,
      holeCards: hc, folded: false, eliminated: false, isHero: player.isHero,
      lastAction: null, currentBetAmount: 0, betThisRound: 0, totalInvested: 0,
      tilt: createTiltState(), tiltMultiplier: 1.0,
    })
  }
  gs.playerStates.value = states

  // Ensure 5 community cards
  const fullBoard = [...boardCards]
  if (fullBoard.length < 5) {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
    const available: Card[] = []
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        if (!knownCards.has(`${rank}-${suit}`)) available.push({ rank, suit })
      }
    }
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]]
    }
    while (fullBoard.length < 5 && available.length > 0) fullBoard.push(available.pop()!)
  }
  gs.allCommunity.value = fullBoard

  gs.resetGameState()
  gs.handActionLog.value = [`--- PREFLOP: ${positions.value[0] || ''} ---`]

  setTimeout(() => engine.postBlindsAndStartBetting(), 400)
}

function endHand() {
  gs.activeSeat.value = -1
  gs.waitingForHero.value = false
  if (gs.street.value !== 'showdown') {
    gs.streetAtEnd.value = gs.street.value
  }
  gs.street.value = 'showdown'

  let winnerId = -1
  if (gs.activePlayers.value.length === 1) {
    winnerId = gs.activePlayers.value[0].id
    gs.activePlayers.value[0].chips += gs.pot.value
  } else {
    const community = gs.allCommunity.value.slice(0, 5)
    const contributors = gs.playerStates.value.map(p => ({
      id: p.id, totalInvested: p.totalInvested, folded: p.folded, holeCards: p.holeCards,
    }))
    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      gs.playerStates.value.map(p => ({ id: p.id, holeCards: p.holeCards })),
      community,
    )
    let maxAward = 0
    for (const [pid, amount] of awards) {
      gs.playerStates.value[pid].chips += amount
      if (amount > maxAward) { maxAward = amount; winnerId = pid }
    }
  }

  gs.heroWonHand.value = winnerId === 0
  gs.heroWinAmount.value = gs.pot.value

  const heroState = gs.playerStates.value[0]
  if (heroState) {
    const heroWon = winnerId === 0
    const heroProfit = heroWon ? gs.pot.value - gs.heroTotalWagered.value : -gs.heroTotalWagered.value
    replayResult.value = {
      result: heroState.folded ? 'folded' : (heroWon ? 'won' : 'lost'),
      profit: heroState.folded ? 0 : heroProfit,
    }
  }
  replayPhase.value = 'finished'
}

function formatPot(n: number): string {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`
  if (Number.isInteger(n)) return `$${n}`
  return `$${n.toFixed(2)}`
}

function formatProfit(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${n}`
}

function resultLabel(result: string): string {
  if (result === 'won') return 'WON'
  if (result === 'lost') return 'LOST'
  return 'FOLDED'
}

function resultClass(result: string): string {
  if (result === 'won') return 'text-green-400'
  if (result === 'lost') return 'text-red-400'
  return 'text-gray-400'
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="flex items-center gap-3 text-gray-400">
        <div class="flex gap-1">
          <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
          <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
          <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
        </div>
        Loading hand data...
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="flex items-center justify-center min-h-screen">
      <div class="max-w-md text-center space-y-4 p-8">
        <div class="text-4xl text-gray-600">?</div>
        <p class="text-gray-400">{{ errorMsg }}</p>
        <NuxtLink to="/stats">
          <UButton color="primary">Back to Stats</UButton>
        </NuxtLink>
      </div>
    </div>

    <!-- Ready to replay -->
    <div v-else-if="replayPhase === 'ready' && originalHand" class="flex items-center justify-center min-h-screen">
      <div class="max-w-lg text-center space-y-6 p-8">
        <h2 class="text-2xl font-bold">Hand #{{ originalHand.handNumber }} Replay</h2>
        <p class="text-gray-400 text-sm">
          Same cards, same board, same opponents. Make different decisions and see how it plays out.
        </p>

        <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-3 text-left">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 uppercase">Original Result</span>
            <span
              class="px-2 py-0.5 rounded text-xs font-bold uppercase"
              :class="{
                'bg-green-900/50 text-green-400': originalHand.result === 'won',
                'bg-red-900/50 text-red-400': originalHand.result === 'lost',
                'bg-gray-800 text-gray-500': originalHand.result === 'folded',
              }"
            >
              {{ resultLabel(originalHand.result) }} {{ formatProfit(originalHand.profit) }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-gray-500">Your Cards</span>
              <div class="text-white font-mono text-lg">{{ originalHand.holeCards }}</div>
            </div>
            <div>
              <span class="text-gray-500">Position</span>
              <div class="text-white font-mono text-lg">{{ originalHand.position }}</div>
            </div>
            <div v-if="originalHand.board">
              <span class="text-gray-500">Board</span>
              <div class="text-white font-mono">{{ originalHand.board }}</div>
            </div>
            <div>
              <span class="text-gray-500">Pot</span>
              <div class="text-yellow-400 font-mono">${{ originalHand.potSize }}</div>
            </div>
          </div>
          <div class="text-xs text-gray-600">
            {{ originalHand.players.length }} players at {{ stake?.name }} stakes (${{ sb }}/${{ bb }})
          </div>
        </div>

        <UButton color="primary" size="lg" @click="startReplay">
          Start Replay
        </UButton>
        <div class="flex justify-center">
          <NuxtLink to="/stats">
            <UButton variant="ghost" color="neutral" size="sm">Back to Stats</UButton>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Playing / Finished -->
    <div v-else-if="(replayPhase === 'playing' || replayPhase === 'finished') && originalHand" class="p-4">
      <!-- Top bar -->
      <div class="flex items-center justify-between mb-4 max-w-7xl mx-auto">
        <NuxtLink to="/stats">
          <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-arrow-left">Stats</UButton>
        </NuxtLink>

        <div class="flex items-center gap-4">
          <span class="text-xs px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 uppercase tracking-wide font-semibold">
            REPLAY
          </span>
          <span class="text-sm text-gray-400">
            Hand #{{ originalHand.handNumber }} — {{ stake?.name }} ${{ sb }}/${{ bb }}
          </span>
          <span class="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 uppercase tracking-wide">
            {{ gs.street.value }}
          </span>
          <div
            v-if="gs.hero.value"
            class="flex items-center gap-1.5 bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-1"
          >
            <span class="text-xs text-gray-400">Stack</span>
            <span class="text-base font-bold font-mono text-white">
              {{ formatPot(gs.hero.value.chips) }}
            </span>
          </div>
        </div>

        <UColorModeButton />
      </div>

      <!-- Main layout -->
      <div class="flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto items-start">
        <div class="flex-1 min-w-0 space-y-4">
          <PokerTable :player-count="playerCount">
            <template #community>
              <PlayingCard
                v-for="(card, i) in gs.visibleCommunity.value"
                :key="i"
                :card="card"
                :face-up="true"
                size="md"
              />
              <div
                v-for="i in (5 - gs.visibleCommunity.value.length)"
                :key="'empty-' + i"
                class="w-20 h-[7rem] rounded-lg border border-dashed border-green-800/40"
              />
            </template>

            <template #pot>
              <div class="text-center text-yellow-400 font-bold text-sm">
                Pot: {{ formatPot(gs.pot.value) }}
              </div>
            </template>

            <template #seat="{ seatIndex }">
              <PlayerSeat
                v-if="gs.playerStates.value[seatIndex]"
                :name="gs.playerStates.value[seatIndex].name"
                :chips="gs.playerStates.value[seatIndex].chips"
                :position="positions[seatIndex] || ''"
                :hole-cards="gs.playerStates.value[seatIndex].holeCards"
                :show-cards="gs.playerStates.value[seatIndex].isHero"
                :is-hero="gs.playerStates.value[seatIndex].isHero"
                :is-active="gs.activeSeat.value === seatIndex"
                :folded="gs.playerStates.value[seatIndex].folded"
                :eliminated="gs.playerStates.value[seatIndex].eliminated"
                :stake-level="originalHand.stakeLevel"
                :peekable="!gs.playerStates.value[seatIndex].isHero && !gs.playerStates.value[seatIndex].folded"
                :last-action="gs.playerStates.value[seatIndex].lastAction"
                :current-bet-amount="gs.playerStates.value[seatIndex].currentBetAmount"
              />
            </template>
          </PokerTable>

          <!-- Bet Controls -->
          <BetControls
            v-if="gs.heroTurn.value"
            :pot="gs.pot.value"
            :to-call="gs.toCall.value"
            :min-raise="gs.minRaise.value"
            :max-raise="gs.maxRaise.value"
            :bb="bb"
            :enabled="true"
            @fold="engine.handleFold"
            @check="engine.handleCheck"
            @call="engine.handleCall"
            @raise="engine.handleRaise"
          />

          <!-- Comparison panel at showdown -->
          <div v-if="replayPhase === 'finished' && replayResult" class="max-w-3xl mx-auto space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <!-- Original -->
              <div
                class="rounded-xl border p-5 text-center space-y-2"
                :class="{
                  'border-green-700/40 bg-green-900/20': originalHand.result === 'won',
                  'border-red-700/40 bg-red-900/20': originalHand.result === 'lost',
                  'border-gray-700/40 bg-gray-800/30': originalHand.result === 'folded',
                }"
              >
                <div class="text-xs text-gray-500 uppercase tracking-wider">Original</div>
                <div class="text-xl font-bold" :class="resultClass(originalHand.result)">
                  {{ resultLabel(originalHand.result) }}
                </div>
                <div class="text-2xl font-bold font-mono" :class="originalHand.profit >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ formatProfit(originalHand.profit) }}
                </div>
                <div class="text-xs text-gray-500">Pot: ${{ originalHand.potSize }}</div>
              </div>

              <!-- Replay -->
              <div
                class="rounded-xl border p-5 text-center space-y-2"
                :class="{
                  'border-green-700/40 bg-green-900/20': replayResult.result === 'won',
                  'border-red-700/40 bg-red-900/20': replayResult.result === 'lost',
                  'border-gray-700/40 bg-gray-800/30': replayResult.result === 'folded',
                }"
              >
                <div class="text-xs text-amber-400 uppercase tracking-wider">Replay</div>
                <div class="text-xl font-bold" :class="resultClass(replayResult.result)">
                  {{ resultLabel(replayResult.result) }}
                </div>
                <div class="text-2xl font-bold font-mono" :class="replayResult.profit >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ formatProfit(replayResult.profit) }}
                </div>
                <div class="text-xs text-gray-500">Pot: {{ formatPot(gs.pot.value) }}</div>
              </div>
            </div>

            <div v-if="replayResult.profit !== originalHand.profit" class="text-center text-sm">
              <span class="text-gray-400">Difference: </span>
              <span
                class="font-mono font-bold"
                :class="replayResult.profit > originalHand.profit ? 'text-green-400' : 'text-red-400'"
              >
                {{ formatProfit(replayResult.profit - originalHand.profit) }}
              </span>
            </div>

            <div class="flex justify-center gap-3">
              <UButton color="primary" size="lg" @click="startReplay">Replay Again</UButton>
              <NuxtLink to="/stats">
                <UButton variant="outline" color="neutral" size="lg">Back to Stats</UButton>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Side panel -->
        <div class="w-full lg:w-80 space-y-3">
          <div
            v-if="gs.dealt.value && !gs.heroTurn.value && gs.street.value !== 'showdown' && gs.activePlayers.value.length > 1"
            class="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4"
          >
            <div class="flex items-center gap-4">
              <div class="flex gap-1.5">
                <div class="w-3 h-3 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
                <div class="w-3 h-3 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
                <div class="w-3 h-3 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
              </div>
              <div>
                <div class="text-base font-semibold text-white">
                  {{ gs.playerStates.value[gs.activeSeat.value]?.name || 'Bot' }}
                </div>
                <div class="text-xs text-gray-400">is thinking...</div>
              </div>
            </div>
            <div class="mt-3 w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div class="h-full bg-green-500/60 rounded-full animate-pulse" style="width: 60%;" />
            </div>
          </div>

          <div v-if="gs.heroTurn.value" class="bg-amber-900/30 border border-amber-700/40 rounded-xl p-4">
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
              <div>
                <div class="text-base font-semibold text-amber-200">Your Turn</div>
                <div class="text-xs text-amber-400/60">{{ gs.toCall.value > 0 ? `$${gs.toCall.value} to call` : 'Check or bet' }}</div>
              </div>
            </div>
          </div>

          <div class="bg-gray-900/80 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Original Hand</div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Result</span>
              <span class="font-bold" :class="resultClass(originalHand.result)">
                {{ resultLabel(originalHand.result) }} {{ formatProfit(originalHand.profit) }}
              </span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Pot</span>
              <span class="text-yellow-400 font-mono">${{ originalHand.potSize }}</span>
            </div>
          </div>

          <div v-if="originalHand.actions.length > 0" class="bg-gray-900/80 border border-gray-700/50 rounded-xl p-4">
            <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Original Actions</div>
            <div class="max-h-40 overflow-y-auto space-y-0.5">
              <div
                v-for="(action, ai) in originalHand.actions"
                :key="ai"
                class="text-xs font-mono"
                :class="action.startsWith('---') ? 'text-yellow-500/70 font-semibold mt-1' : 'text-gray-400'"
              >
                {{ action }}
              </div>
            </div>
          </div>

          <div v-if="gs.handActionLog.value.length > 0" class="bg-gray-900/80 border border-gray-700/50 rounded-xl p-4">
            <div class="text-xs text-amber-400 uppercase tracking-wider font-semibold mb-2">Replay Actions</div>
            <div class="max-h-40 overflow-y-auto space-y-0.5">
              <div
                v-for="(action, ai) in gs.handActionLog.value"
                :key="ai"
                class="text-xs font-mono"
                :class="action.startsWith('---') ? 'text-yellow-500/70 font-semibold mt-1' : 'text-gray-300'"
              >
                {{ action }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
