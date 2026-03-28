<script setup lang="ts">
defineOptions({ name: 'index' })
/**
 * Main game page — orchestrates the full poker game loop: setup, dealing,
 * sequential bot actions with visible action labels, hero betting controls,
 * showdown, and hand recording. Uses shared composables for game state
 * and engine logic; keeps page-specific concerns here (setup, timeout,
 * tilt tracking, session stats, hero adaptation).
 */
import config from '@config'
import { assignPositions } from '~/utils/seats'
import type { Card } from '~/utils/cards'
import type { GameSettings } from '~/components/SetupScreen.vue'
import { decideBotAction, applyTilt, updateTilt, decayTilt, createTiltState } from '~/utils/botDecision'
import { bestHand } from '~/utils/handAnalysis'
import { calculateSidePots, awardPots } from '~/utils/sidePots'
import type { HeroProfile } from '~/utils/botDecision'
import { displayCard } from '~/utils/cards'
import { useGameState } from '~/composables/useGameState'
import { useGameEngine } from '~/composables/useGameEngine'
import type { PlayerState } from '~/composables/useGameState'
import { useHeroProfileStore } from '~/stores/heroProfile'
import { isPro as isProBot } from '~/utils/botDescriptions'

const phase = ref<'setup' | 'table' | 'timeout' | 'busted'>('setup')
const { session, initSession, recordHand, resetSession, saveSessionToSupabase, downloadJSON, downloadCSV, supabaseReady } = useSessionStats()
const settings = ref<GameSettings | null>(null)
const heroProfileStore = useHeroProfileStore()

// ─── KeepAlive: pause/resume timeout when navigating to/from stats ──
onActivated(() => {
  if (phase.value === 'table') resetTimeout()
})
onDeactivated(() => {
  if (timeoutTimer) clearTimeout(timeoutTimer)
})

// ─── Hero Timeout ──────────────────────────────────────────────
let timeoutTimer: ReturnType<typeof setTimeout> | null = null

function resetTimeout() {
  if (timeoutTimer) clearTimeout(timeoutTimer)
  if (phase.value !== 'table') return
  timeoutTimer = setTimeout(() => {
    handleTimeout()
  }, config.session.heroTimeoutMs)
}

function handleTimeout() {
  if (phase.value !== 'table') return
  const heroState = gs.playerStates.value[0]
  if (heroState && !heroState.folded && gs.waitingForHero.value) {
    heroState.folded = true
    heroState.lastAction = 'fold'
    gs.waitingForHero.value = false
  }
  saveSessionToSupabase()
  phase.value = 'timeout'
}

function resumeFromTimeout() {
  phase.value = 'table'
  resetTimeout()
  dealNewHand()
}

function onHeroActivity() {
  resetTimeout()
}

// ─── Computed config ──────────────────────────────────────────
const stake = computed(() => config.stakes.find(s => s.level === (settings.value?.stakeLevel || 3))!)
const bb = computed(() => stake.value?.bb || 2)
const sb = computed(() => stake.value?.sb || 1)
const startingStack = computed(() => bb.value * (settings.value?.stackBB || 100))

const positions = computed(() => {
  if (!settings.value) return []
  return assignPositions(settings.value.playerCount, gs.dealerSeat.value)
})

const heroPosition = computed(() => positions.value[0] || 'BTN')

const opponentStats = computed(() => {
  if (!settings.value) return []
  return settings.value.botConfigs.slice(0, settings.value.playerCount - 1).map(bot => ({
    name: bot.name,
    handsPlayed: 25,
    vpip: bot.vpip * 100,
    pfr: bot.pfr * 100,
    af: bot.aggression,
    wtsd: bot.vpip > 0.25 ? 35 : 22,
  }))
})

const queuedAction = ref<string | null>(null)

// ─── Bot Profile Modal ────────────────────────────────────────
const botModalOpen = ref(false)
const selectedBotIndex = ref<number | null>(null)

const selectedBotConfig = computed(() => {
  if (selectedBotIndex.value === null || !settings.value) return null
  return settings.value.botConfigs[selectedBotIndex.value]
})

const selectedBotIsPro = computed(() => {
  if (!selectedBotConfig.value) return false
  return isProBot(selectedBotConfig.value.preset)
})

function openBotSettings(seatIndex: number) {
  if (seatIndex === 0) return // hero
  selectedBotIndex.value = seatIndex - 1
  botModalOpen.value = true
}

function resetBotToDefault() {
  if (selectedBotIndex.value === null || !settings.value) return
  const bot = settings.value.botConfigs[selectedBotIndex.value]
  const original = config.personas.find(p => p.name === bot.preset)
  if (!original) return
  bot.vpip = original.vpip
  bot.pfr = original.pfr
  bot.aggression = original.aggression
  bot.bluffFreq = original.bluffFreq
  bot.creativeFreq = original.creativeFreq
  bot.threeBetFreq = original.threeBetFreq
  bot.fourBetFreq = original.fourBetFreq
  bot.fiveBetFreq = original.fiveBetFreq
  bot.donkBetFreq = original.donkBetFreq
  bot.tiltMultiplier = original.tiltMultiplier
  bot.name = original.name
}

// ─── Game State & Engine ──────────────────────────────────────
const gs = useGameState(bb)

const engine = useGameEngine({
  gameState: gs,
  bb,
  sb,
  positions,
  makeBotDecision: (p: PlayerState, raiseLevel: number, streetContext?) => {
    const botConfig = settings.value?.botConfigs[p.id - 1]
    if (!botConfig) return { type: 'fold' }

    const baseProfile = {
      vpip: botConfig.vpip,
      pfr: botConfig.pfr,
      aggression: botConfig.aggression,
      bluffFreq: botConfig.bluffFreq,
      creativeFreq: botConfig.creativeFreq,
      threeBetFreq: botConfig.threeBetFreq,
      fourBetFreq: botConfig.fourBetFreq,
      fiveBetFreq: botConfig.fiveBetFreq,
      donkBetFreq: botConfig.donkBetFreq,
    }

    const profile = applyTilt(baseProfile, p.tilt, config.tilt, p.tiltMultiplier)

    const personaConfig = config.personas.find(per => per.name === botConfig.name)
    const consistency = personaConfig?.consistency ?? 0.95

    const heroProfile: HeroProfile | undefined = heroProfileStore.handsTracked >= config.sessionMemory.windowSize
      ? {
          vpip: heroProfileStore.heroVpip,
          foldTo3Bet: heroProfileStore.heroFoldTo3Bet,
          foldToCbet: heroProfileStore.heroFoldToCbet,
          aggression: heroProfileStore.heroAggression,
          handsTracked: heroProfileStore.handsTracked,
        }
      : undefined

    return decideBotAction(
      profile,
      {
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
      },
      consistency,
      heroProfile,
    )
  },
  onEndHand: () => endHand(),
  onHeroActivity: () => onHeroActivity(),
})

// ─── Game Flow ─────────────────────────────────────────────────
function handleStart(gameSettings: GameSettings) {
  settings.value = gameSettings
  gs.dealerSeat.value = Math.floor(Math.random() * gameSettings.playerCount)
  phase.value = 'table'
  initSession(gameSettings.stakeLevel, gameSettings.playerCount, startingStack.value)
  heroProfileStore.reset()
  resetTimeout()
  setTimeout(dealNewHand, 300)
}

function findPersonaTiltMultiplier(name?: string): number {
  if (!name) return 1.0
  const persona = config.personas.find(p => p.name === name)
  return persona?.tiltMultiplier ?? 1.0
}

function shuffleDeck(): Card[] {
  const deck: Card[] = []
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades']
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit })
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function dealNewHand() {
  const count = settings.value?.playerCount || 2
  const deck = shuffleDeck()
  let idx = 0

  const states: PlayerState[] = []
  for (let i = 0; i < count; i++) {
    const isHero = i === 0
    const botConfig = !isHero ? settings.value!.botConfigs[i - 1] : null
    const prevState = gs.playerStates.value[i]
    const prevTilt = prevState?.tilt || createTiltState()
    decayTilt(prevTilt)

    states.push({
      id: i,
      name: isHero ? settings.value!.heroName : (botConfig?.name || `Bot ${i}`),
      chips: prevState && !prevState.eliminated ? prevState.chips : startingStack.value,
      holeCards: [deck[idx++], deck[idx++]],
      folded: false,
      eliminated: prevState?.eliminated || false,
      isHero,
      lastAction: null,
      currentBetAmount: 0,
      betThisRound: 0,
      totalInvested: 0,
      tilt: prevTilt,
      tiltMultiplier: !isHero ? (findPersonaTiltMultiplier(botConfig?.name) ?? 1.0) : 1.0,
    })
  }
  gs.playerStates.value = states

  idx++ // burn
  const community = [deck[idx++], deck[idx++], deck[idx++]]
  idx++ // burn
  community.push(deck[idx++])
  idx++ // burn
  community.push(deck[idx++])
  gs.allCommunity.value = community

  gs.resetGameState()
  queuedAction.value = null

  const playerCards = states
    .filter(p => !p.eliminated)
    .map(p => {
      const pos = positions.value[p.id] || ''
      const cards = p.holeCards ? p.holeCards.map(c => displayCard(c)).join(' ') : '??'
      return `  ${p.name} (${pos}): ${cards}${p.isHero ? ' ← Hero' : ''}`
    })
  gs.handActionLog.value = [
    `--- DEAL ---`,
    ...playerCards,
    `--- PREFLOP ---`,
  ]

  gs.dealerSeat.value = (gs.dealerSeat.value + 1) % count
  setTimeout(() => engine.postBlindsAndStartBetting(), 400)
}

function endHand() {
  gs.activeSeat.value = -1
  gs.waitingForHero.value = false
  // Only save streetAtEnd if it hasn't already been set by advanceStreet (river→showdown)
  if (gs.street.value !== 'showdown') {
    gs.streetAtEnd.value = gs.street.value
  }
  gs.street.value = 'showdown'

  let winnerId = -1
  if (gs.activePlayers.value.length === 1) {
    // Everyone folded — last player standing wins
    winnerId = gs.activePlayers.value[0].id
    gs.activePlayers.value[0].chips += gs.pot.value
  } else {
    // Showdown — use all 5 community cards for evaluation
    const community = gs.allCommunity.value.slice(0, 5)
    const contributors = gs.playerStates.value
      .filter(p => !p.eliminated)
      .map(p => ({
        id: p.id,
        totalInvested: p.totalInvested,
        folded: p.folded,
        holeCards: p.holeCards,
      }))

    const pots = calculateSidePots(contributors)
    const { awards } = awardPots(
      pots,
      gs.playerStates.value.map(p => ({ id: p.id, holeCards: p.holeCards })),
      community,
    )

    // Apply chip awards
    let maxAward = 0
    for (const [pid, amount] of awards) {
      gs.playerStates.value[pid].chips += amount
      if (amount > maxAward) {
        maxAward = amount
        winnerId = pid
      }
    }
  }

  gs.heroWonHand.value = winnerId === 0
  gs.heroWinAmount.value = gs.pot.value
  gs.handWinnerId.value = winnerId
  gs.handWinnerName.value = gs.playerStates.value[winnerId]?.name || 'Unknown'

  // Record winner for table flow dynamics
  if (winnerId >= 0) engine.recordHandWinner(winnerId)

  // Update tilt for bots
  for (const p of gs.playerStates.value) {
    if (p.isHero || p.eliminated) continue
    const won = p.id === winnerId
    const chipsAtStart = startingStack.value
    const lostBigPot = !won && !p.folded && gs.pot.value > chipsAtStart * config.tilt.bigLossThreshold
    updateTilt(p.tilt, won, lostBigPot, config.tilt, p.tiltMultiplier)
  }

  // Record hero actions for adaptation
  const heroState = gs.playerStates.value[0]
  if (heroState) {
    heroProfileStore.recordHeroAction({
      enteredPot: !heroState.folded || gs.heroTotalWagered.value > bb.value,
      faced3Bet: false, // simplified — would need action tracking for full accuracy
      foldedTo3Bet: false,
      facedCbet: false,
      foldedToCbet: false,
      raiseCount: gs.handActionLog.value.filter(a => a.includes(heroState.name) && (a.includes('raises') || a.includes('ALL-IN'))).length,
      callCount: gs.handActionLog.value.filter(a => a.includes(heroState.name) && a.includes('calls')).length,
      checkCount: gs.handActionLog.value.filter(a => a.includes(heroState.name) && a.includes('checks')).length,
    })
  }

  // Record hand for session stats
  if (heroState) {
    const heroWon = winnerId === 0
    const holeStr = heroState.holeCards ? heroState.holeCards.map(c => displayCard(c)).join(' ') : ''
    const boardStr = gs.visibleCommunity.value.map(c => displayCard(c)).join(' ')

    const allPlayerHands = gs.playerStates.value.map((p, i) => ({
      name: p.name,
      position: positions.value[i] || '',
      holeCards: p.holeCards ? p.holeCards.map(c => displayCard(c)).join(' ') : '',
      folded: p.folded,
      isHero: p.isHero,
      chips: p.chips + (p.id === winnerId ? gs.pot.value : 0),
      seatIndex: i,
    }))

    recordHand({
      handNumber: session.value.handsPlayed + 1,
      holeCards: holeStr,
      board: boardStr,
      result: heroState.folded ? 'folded' : (heroWon ? 'won' : 'lost'),
      profit: heroWon ? gs.pot.value : (heroState.folded ? 0 : -gs.pot.value),
      position: positions.value[0] || '',
      potSize: gs.pot.value,
      actions: [...gs.handActionLog.value],
      players: allPlayerHands,
      winnerName: gs.handWinnerName.value,
    }, heroState.chips)
  }

  // Eliminate busted bots
  for (const p of gs.playerStates.value) {
    if (p.chips <= 0 && !p.eliminated && !p.isHero) {
      p.eliminated = true
    }
  }
}

function handleRebuy() {
  saveSessionToSupabase()
  initSession(settings.value!.stakeLevel, settings.value!.playerCount, startingStack.value)
  gs.playerStates.value = []
  phase.value = 'table'
  resetTimeout()
  setTimeout(dealNewHand, 300)
}

function backToSetup() {
  if (timeoutTimer) clearTimeout(timeoutTimer)
  saveSessionToSupabase()
  phase.value = 'setup'
  settings.value = null
  gs.playerStates.value = []
  gs.allCommunity.value = []
  gs.dealt.value = false
}

function formatPot(n: number): string {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`
  if (Number.isInteger(n)) return `$${n}`
  return `$${n.toFixed(2)}`
}

// Handle queued actions when hero's turn comes
watch(() => gs.waitingForHero.value, (isHeroTurn) => {
  if (isHeroTurn && queuedAction.value) {
    const action = queuedAction.value
    queuedAction.value = null
    nextTick(() => {
      if (action === 'fold') { engine.handleFold(); return }
      if (action === 'check' && gs.toCall.value === 0) { engine.handleCheck(); return }
      if (action === 'call' && gs.toCall.value > 0) { engine.handleCall(gs.toCall.value); return }
    })
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <SetupScreen
      v-if="phase === 'setup'"
      @start="handleStart"
    />

    <!-- Timeout Screen -->
    <div v-else-if="phase === 'timeout'" class="flex items-center justify-center min-h-screen">
      <div class="max-w-md text-center space-y-6 p-8">
        <div class="text-6xl">⏸</div>
        <h2 class="text-2xl font-bold">Session Paused</h2>
        <p class="text-gray-400">
          No activity for 5 minutes. Your session has been saved and any hand in progress was folded.
        </p>
        <div class="bg-gray-800/50 rounded-xl p-4 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-400">Hands played</span>
            <span class="text-white font-mono">{{ session.handsPlayed }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Stack</span>
            <span class="text-white font-mono">${{ gs.hero.value?.chips || 0 }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Profit</span>
            <span :class="session.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'" class="font-mono">
              {{ session.totalProfit >= 0 ? '+' : '' }}${{ session.totalProfit }}
            </span>
          </div>
        </div>
        <div class="flex gap-3 justify-center">
          <UButton color="primary" size="lg" @click="resumeFromTimeout">
            Resume Playing
          </UButton>
          <UButton variant="outline" color="neutral" size="lg" @click="backToSetup">
            End Session
          </UButton>
        </div>
      </div>
    </div>

    <!-- Busted Screen -->
    <div v-else-if="phase === 'busted'" class="flex items-center justify-center min-h-screen">
      <div class="max-w-md text-center space-y-6 p-8">
        <div class="text-6xl">💀</div>
        <h2 class="text-2xl font-bold text-red-400">Busted!</h2>
        <p class="text-gray-400">
          You've lost your entire stack. Session has been saved.
        </p>
        <div class="bg-gray-800/50 rounded-xl p-4 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-400">Hands played</span>
            <span class="text-white font-mono">{{ session.handsPlayed }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Final result</span>
            <span class="text-red-400 font-mono">-${{ session.startingStack }}</span>
          </div>
        </div>
        <div class="flex gap-3 justify-center">
          <UButton v-if="config.session.rebuyEnabled" color="primary" size="lg" @click="handleRebuy">
            Re-buy (${{ startingStack }})
          </UButton>
          <UButton variant="outline" color="neutral" size="lg" @click="backToSetup">
            End Session
          </UButton>
          <NuxtLink to="/stats">
            <UButton variant="ghost" color="neutral" size="lg">
              View Stats
            </UButton>
          </NuxtLink>
        </div>
        <p class="text-xs text-gray-600">
          Re-buy starts a new session — your bust-out is recorded separately.
        </p>
      </div>
    </div>

    <!-- Game Table -->
    <div v-else-if="phase === 'table'" class="p-4">
      <!-- Top bar -->
      <div class="flex items-center justify-between mb-4 max-w-7xl mx-auto">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          icon="i-lucide-arrow-left"
          @click="backToSetup"
        >
          Setup
        </UButton>

        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-400">
            {{ stake?.name }} — ${{ stake?.sb }}/${{ stake?.bb }}
          </span>
          <span class="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 uppercase tracking-wide">
            {{ gs.street.value }}
          </span>
          <div
            v-if="gs.hero.value"
            class="flex items-center gap-1.5 bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-1"
          >
            <span class="text-xs text-gray-400">Stack</span>
            <span
              class="text-base font-bold font-mono"
              :class="gs.hero.value.chips >= startingStack ? 'text-green-400' : 'text-red-400'"
            >
              {{ formatPot(gs.hero.value.chips) }}
            </span>
            <span
              v-if="gs.hero.value.chips !== startingStack"
              class="text-xs font-mono"
              :class="gs.hero.value.chips >= startingStack ? 'text-green-500/60' : 'text-red-500/60'"
            >
              ({{ gs.hero.value.chips >= startingStack ? '+' : '' }}{{ formatPot(gs.hero.value.chips - startingStack) }})
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <SupabaseStatus />
          <NuxtLink to="/bots">
            <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-users">
              Bots
            </UButton>
          </NuxtLink>
          <NuxtLink to="/stats">
            <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-bar-chart-2">
              Stats
            </UButton>
          </NuxtLink>
          <UColorModeButton />
        </div>
      </div>

      <!-- Main layout -->
      <div class="flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto items-start">
        <div class="flex-1 min-w-0 space-y-4">
          <PokerTable :player-count="settings?.playerCount || 6">
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
                :show-cards="gs.playerStates.value[seatIndex].isHero || (gs.street.value === 'showdown' && !gs.playerStates.value[seatIndex].folded)"
                :is-hero="gs.playerStates.value[seatIndex].isHero"
                :is-active="gs.activeSeat.value === seatIndex"
                :folded="gs.playerStates.value[seatIndex].folded"
                :eliminated="gs.playerStates.value[seatIndex].eliminated"
                :stake-level="settings?.stakeLevel || 3"
                :peekable="!gs.playerStates.value[seatIndex].isHero && !gs.playerStates.value[seatIndex].folded"
                :last-action="gs.playerStates.value[seatIndex].lastAction"
                :current-bet-amount="gs.playerStates.value[seatIndex].currentBetAmount"
                :tilted="gs.playerStates.value[seatIndex].tilt.tilted"
                :tilt-severity="gs.playerStates.value[seatIndex].tilt.severity"
                @settings="openBotSettings(seatIndex)"
              />
            </template>
          </PokerTable>

          <!-- Action status (between table and bet controls) -->
          <div
            v-if="gs.dealt.value && !gs.heroTurn.value && gs.street.value !== 'showdown' && gs.activePlayers.value.length > 1"
            class="flex justify-center"
          >
            <div class="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl px-5 py-2.5 shadow-lg max-w-md">
              <!-- Header: name + dots -->
              <div class="flex items-center gap-3">
                <div class="flex gap-1.5 shrink-0">
                  <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 0ms;" />
                  <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 150ms;" />
                  <div class="w-2 h-2 rounded-full bg-green-400 animate-bounce" style="animation-delay: 300ms;" />
                </div>
                <span class="text-sm font-medium text-white">
                  {{ gs.playerStates.value[gs.activeSeat.value]?.name || 'Bot' }}
                  <span class="text-gray-400 font-normal">is thinking</span>
                </span>
              </div>
              <!-- Thinking insight -->
              <div v-if="gs.botThinkingInsight.value && gs.botThinkingInsight.value.factors.length > 0" class="mt-1.5 space-y-0.5 border-t border-gray-700/30 pt-1.5">
                <div
                  v-for="(factor, fi) in gs.botThinkingInsight.value.factors"
                  :key="fi"
                  class="text-[0.65rem] font-mono leading-tight"
                  :class="fi === 0 ? 'text-gray-300' : 'text-gray-500'"
                >
                  <span class="text-gray-600 mr-1">{{ fi === 0 ? '>' : ' ' }}</span>{{ factor }}
                </div>
              </div>
            </div>
          </div>

          <!-- Queued action (before hero's turn) -->
          <div
            v-if="queuedAction && !gs.heroTurn.value && !gs.hero.value?.folded && gs.street.value !== 'showdown'"
            class="flex justify-center"
          >
            <div class="inline-flex items-center gap-3 bg-gray-800/60 border border-gray-600/40 rounded-full px-5 py-2">
              <span class="text-xs text-gray-400">Queued:</span>
              <span class="text-sm font-semibold uppercase" :class="{
                'text-red-400': queuedAction === 'fold',
                'text-gray-300': queuedAction === 'check',
                'text-blue-400': queuedAction === 'call',
              }">{{ queuedAction }}</span>
              <button
                class="text-xs text-gray-500 hover:text-white underline underline-offset-2 transition-colors"
                @click="queuedAction = null"
              >
                cancel
              </button>
            </div>
          </div>

          <!-- Pre-action buttons (when not hero's turn yet) -->
          <div
            v-if="!gs.heroTurn.value && !gs.hero.value?.folded && gs.street.value !== 'showdown' && gs.dealt.value && !queuedAction"
            class="flex justify-center gap-2"
          >
            <UTooltip text="Queue a fold — will execute when it's your turn. Click cancel to change your mind.">
              <UButton size="xs" variant="ghost" color="error" @click="queuedAction = 'fold'">
                Pre-fold
              </UButton>
            </UTooltip>
            <UTooltip :text="gs.toCall.value > 0 ? 'Queue a call — will execute when it\'s your turn' : 'Queue a check — will execute when it\'s your turn'">
              <UButton size="xs" variant="ghost" color="neutral" @click="queuedAction = gs.toCall.value > 0 ? 'call' : 'check'">
                Pre-{{ gs.toCall.value > 0 ? 'call' : 'check' }}
              </UButton>
            </UTooltip>
          </div>

          <!-- Hero's turn indicator -->
          <div
            v-if="gs.heroTurn.value"
            class="flex justify-center"
          >
            <div class="inline-flex items-center gap-3 bg-amber-900/30 border border-amber-700/40 rounded-full px-5 py-2.5">
              <div class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span class="text-sm font-semibold text-amber-200">
                Your Turn
                <span class="text-amber-400/60 font-normal ml-1">{{ gs.toCall.value > 0 ? `— $${gs.toCall.value} to call` : '— check or bet' }}</span>
              </span>
            </div>
          </div>

          <!-- Bet Controls (only when it's hero's turn) -->
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

          <!-- Showdown actions -->
          <div v-if="gs.street.value === 'showdown'" class="flex justify-center gap-3">
            <template v-if="gs.heroBusted.value">
              <UButton
                v-if="config.session.rebuyEnabled"
                color="primary"
                size="lg"
                @click="handleRebuy"
              >
                Buy More Chips (${{ startingStack }})
              </UButton>
              <UButton
                variant="outline"
                color="neutral"
                size="lg"
                @click="() => { saveSessionToSupabase(); phase = 'busted' }"
              >
                Cash Out
              </UButton>
            </template>
            <UButton
              v-else
              color="primary"
              size="lg"
              @click="dealNewHand"
            >
              Deal Next Hand
            </UButton>
          </div>
        </div>

        <!-- Stats column -->
        <div class="w-full lg:w-80 space-y-3">
        <StatsPanel
          :hole-cards="gs.heroHoleCards.value as [import('~/utils/cards').Card, import('~/utils/cards').Card] | null"
          :community="gs.visibleCommunity.value"
          :street="gs.street.value"
          :num-opponents="gs.activePlayers.value.length - 1"
          :position="heroPosition"
          :pot="gs.pot.value"
          :to-call="gs.toCall.value"
          :hero-chips="gs.hero.value?.chips || 0"
          :player-stats="opponentStats"
          :hero-turn="gs.heroTurn.value"
          :hero-folded="gs.hero.value?.folded || false"
          :hero-won="gs.heroWonHand.value"
          :win-amount="gs.heroWinAmount.value"
          :hero-wagered="gs.heroTotalWagered.value"
          :hero-net-profit="gs.heroWonHand.value ? gs.heroWinAmount.value - gs.heroTotalWagered.value : -gs.heroTotalWagered.value"
          :winner-name="gs.handWinnerName.value"
          :winner-cards="gs.handWinnerId.value >= 0 && gs.playerStates.value[gs.handWinnerId.value]?.holeCards ? gs.playerStates.value[gs.handWinnerId.value].holeCards!.map(c => displayCard(c)).join(' ') : ''"
          :session-stats="session"
          :supabase-connected="supabaseReady"
          @fold="engine.handleFold"
          @check="engine.handleCheck"
          @call="engine.handleCall"
          @export-json="downloadJSON"
          @export-csv="downloadCSV"
          @reset-session="resetSession"
        />
        </div>
      </div>

      <!-- Bot Profile Modal -->
      <BotProfileModal
        v-if="selectedBotConfig"
        v-model:open="botModalOpen"
        :bot-config="selectedBotConfig"
        :is-pro="selectedBotIsPro"
        @reset="resetBotToDefault"
      />
    </div>
  </div>
</template>
