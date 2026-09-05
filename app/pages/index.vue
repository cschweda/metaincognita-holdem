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
import { parseHeroHandRecord, actedInLine } from '~/utils/heroRecord'
import { computeObservedStats } from '~/utils/observedStats'
import { bestHand, HAND_RANK_NAMES, describeHand } from '~/utils/handAnalysis'
import { calculateSidePots, awardPots } from '~/utils/sidePots'
import type { HeroProfile } from '~/utils/botDecision'
import { displayCard } from '~/utils/cards'
import { useGameState } from '~/composables/useGameState'
import { useGameEngine } from '~/composables/useGameEngine'
import { useCommentary } from '~/composables/useCommentary'
import type { PlayerState } from '~/composables/useGameState'
import { useHeroProfileStore } from '~/stores/heroProfile'
import { useCareerStore } from '~/stores/career'
import { useNemesisStore } from '~/stores/nemesis'
import { blendProfiles } from '~/utils/heroModel'
import { shuffle } from '~/utils/shuffle'
import { isPro as isProBot } from '~/utils/botDescriptions'

const phase = ref<'setup' | 'table' | 'timeout' | 'busted'>('setup')
const { session, initSession, recordHand, resetSession, downloadJSON, downloadCSV } = useSessionStats()
const settings = ref<GameSettings | null>(null)
const heroProfileStore = useHeroProfileStore()
const careerStore = useCareerStore()
const nemesisStore = useNemesisStore()
// Mirror of the session store's pending sizing list — the book classifies
// showdown sizings itself rather than reaching into another store's internals
let heroPendingSizings: number[] = []
const careerMode = ref(false)

// Career sessions arrive with a pendingSession set by /career's Play button.
// Lock the table to the tier: stake, 6-max roster sample, 100bb buy-in.
// Consumed in onActivated, not onMounted: this page is kept alive, so a
// 2nd+ arrival from /career reactivates the cached instance (the buy-in is
// already debited — onMounted would never fire and the session never start).
// careerMode guards re-activation DURING a running session, when
// pendingSession is still set (it clears on settle).
onActivated(() => {
  if (careerStore.state.pendingSession && !careerMode.value) startCareerSession()
})

function startCareerSession() {
  const pending = careerStore.state.pendingSession!
  const roster = (config.career.tiers[pending.tier] ?? []) as string[]
  const opponents = shuffle(roster).slice(0, config.career.playerCount - 1)
  const botConfigs = opponents.map((name) => {
    const p = config.personas.find(x => x.name === name)!
    return {
      preset: p.name, name: p.name,
      vpip: p.vpip, pfr: p.pfr, aggression: p.aggression,
      bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq,
      tiltMultiplier: p.tiltMultiplier ?? 1.0,
      threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq,
      fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq,
      limpFreq: p.limpFreq, styleBias: p.styleBias,
      betSizeMult: p.betSizeMult, overbetFreq: p.overbetFreq,
      leak: p.leak,
    }
  })
  careerMode.value = true
  handleStart({
    playerCount: config.career.playerCount,
    stakeLevel: pending.tier,
    customBB: null,
    stackBB: config.career.buyInBB,
    heroName: 'Hero',
    botConfigs,
    guestMode: false,
    commentaryMode: 'hero',
    studyMode: false,
    nemesisEnabled: true, // career sessions always face the book
  })
}

function endCareerSession(endedBy: 'leave' | 'felted' | 'timeout') {
  engine.cleanup() // leaving mid-hand: kill pending bot actions/street advances
  const cashOut = endedBy === 'felted' ? 0 : (gs.hero.value?.chips ?? 0)
  careerStore.settle(cashOut, session.value.handsPlayed, endedBy)
  careerMode.value = false
  navigateTo('/career')
}

// ─── KeepAlive: freeze the game while another route is shown ──
// Deactivation pauses the engine (bots hold at their next "thinking" sleep)
// instead of letting the hand play itself in the background; activation
// resumes it — unless the user had paused TV-mode themselves.
let pausedByNav = false
onActivated(() => {
  if (phase.value === 'table') resetTimeout()
  if (pausedByNav) {
    engine.paused.value = false
    pausedByNav = false
  }
})
onDeactivated(() => {
  if (timeoutTimer) clearTimeout(timeoutTimer)
  if (phase.value === 'table' && !engine.paused.value) {
    engine.paused.value = true
    pausedByNav = true
  }
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
  engine.cleanup() // the abandoned hand must not keep advancing behind the pane
  const heroState = gs.playerStates.value[0]
  if (heroState && !heroState.folded && gs.waitingForHero.value) {
    heroState.folded = true
    heroState.lastAction = 'fold'
    gs.waitingForHero.value = false
  }
  if (careerMode.value) {
    // Inactivity ends the career session; current stack settles like a leave.
    // (Chips already committed to the abandoned pot are forfeited — same as
    // walking away from a real table mid-hand.)
    endCareerSession('timeout')
    return
  }
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

// Observed at this table — parsed from the session's recorded hands, never
// from persona config. The panel asks for 10 hands before it prints reads.
const opponentStats = computed(() => {
  if (!settings.value) return []
  const observed = computeObservedStats(session.value?.hands ?? [])
  return settings.value.botConfigs.slice(0, settings.value.playerCount - 1).map(bot =>
    observed.get(bot.name) ?? { name: bot.name, handsPlayed: 0, vpip: 0, pfr: 0, af: 0, wtsd: 0 })
})

// Showdown players — all non-folded players with cards and hand descriptions
const showdownPlayers = computed(() => {
  if (gs.street.value !== 'showdown') return []
  return gs.playerStates.value
    .filter(p => !p.folded && !p.eliminated && p.holeCards)
    .map(p => ({
      name: p.isHero ? 'Hero' : p.name,
      cards: p.holeCards!.map(c => displayCard(c)).join(' '),
      hand: gs.visibleCommunity.value.length >= 3 ? describeHand(p.holeCards!, gs.visibleCommunity.value) : '',
      isHero: p.isHero,
      isWinner: p.name === gs.handWinnerName.value || (p.isHero && gs.heroWonHand.value),
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
  bot.limpFreq = original.limpFreq
  bot.styleBias = original.styleBias
  bot.betSizeMult = original.betSizeMult
  bot.overbetFreq = original.overbetFreq
  bot.tiltMultiplier = original.tiltMultiplier ?? 1.0
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
      limpFreq: botConfig.limpFreq,
      styleBias: botConfig.styleBias,
      betSizeMult: botConfig.betSizeMult,
      overbetFreq: botConfig.overbetFreq,
    }

    const profile = applyTilt(baseProfile, p.tilt, config.tilt, p.tiltMultiplier)

    const personaConfig = config.personas.find(per => per.name === botConfig.name)
    const consistency = personaConfig?.consistency ?? 0.95

    const sessionProfile: HeroProfile | undefined = heroProfileStore.handsTracked >= config.sessionMemory.windowSize
      ? {
          vpip: heroProfileStore.heroVpip,
          foldTo3Bet: heroProfileStore.heroFoldTo3Bet,
          foldToCbet: heroProfileStore.heroFoldToCbet,
          aggression: heroProfileStore.heroAggression,
          handsTracked: heroProfileStore.handsTracked,
          betSizingTell: heroProfileStore.betSizingTell,
        }
      : undefined

    // Nemesis: blend the live session read with the persistent book, then
    // scale this bot's exploitation by its own familiarity with the hero
    let heroProfile: HeroProfile | undefined = sessionProfile
    if (settings.value?.nemesisEnabled) {
      const blended = blendProfiles(sessionProfile, nemesisStore.bookProfile, config.nemesis)
      heroProfile = blended
        ? { ...blended, readStrength: nemesisStore.familiarityFor(botConfig.name) }
        : undefined
    }

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
        // Street-sliced board only — decideBotAction re-slices defensively,
        // but never hand the full runout to a decision in the first place.
        community: gs.visibleCommunity.value.length > 0 ? gs.visibleCommunity.value : undefined,
        wasPreflopRaiser: streetContext?.wasPreflopRaiser,
        preflopCallers: streetContext?.preflopCallers,
        streetHistory: streetContext?.streetHistory as any,
        tableDynamics: streetContext?.tableDynamics,
        tableReads: streetContext?.tableReads,
      },
      consistency,
      heroProfile,
    )
  },
  onEndHand: () => endHand(),
  onHeroActivity: () => onHeroActivity(),
  studyMode: () => !!settings.value?.studyMode,
})

const commentary = useCommentary({ ...gs, positions, bb })

// ─── Session milestones (derived from hand records) ──────────────
const sessionMilestones = computed(() => {
  if (!session.value?.hands?.length) return []
  const milestones: { label: string; hand: number }[] = []
  const seen = new Set<string>()

  // Track hand type firsts and records
  let biggestWin = 0, biggestWinHand = 0
  let winStreak = 0, bestStreak = 0, bestStreakHand = 0

  for (const h of session.value.hands) {
    const num = h.handNumber
    if (h.result === 'won') {
      winStreak++
      if (winStreak > bestStreak) { bestStreak = winStreak; bestStreakHand = num }
      if (h.profit > biggestWin) { biggestWin = h.profit; biggestWinHand = num }

      // Hand type firsts from the board
      const desc = (h.board || '').toLowerCase()
      const actions = h.actions?.join(' ') || ''

      // Check for hand rank milestones based on what hero won with
      if (!seen.has('first-win')) { milestones.push({ label: 'First win', hand: num }); seen.add('first-win') }
      if (h.potSize >= 100 && !seen.has('big-pot')) { milestones.push({ label: 'First $100+ pot', hand: num }); seen.add('big-pot') }
      if (h.potSize >= 500 && !seen.has('huge-pot')) { milestones.push({ label: 'First $500+ pot', hand: num }); seen.add('huge-pot') }
      if (actions.includes('ALL-IN') && !seen.has('allin-win')) { milestones.push({ label: 'First all-in win', hand: num }); seen.add('allin-win') }
    } else {
      winStreak = 0
    }
  }

  if (bestStreak >= 3) milestones.push({ label: `Best win streak: ${bestStreak}`, hand: bestStreakHand })
  if (biggestWin > 0) milestones.push({ label: `Biggest win: $${biggestWin}`, hand: biggestWinHand })

  return milestones
})

// ─── Keyboard shortcuts ──────────────────────────────────────────
function onGameKeydown(e: KeyboardEvent) {
  if (phase.value !== 'table') return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (!gs.heroTurn.value) return

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault()
    engine.handleFold()
  }
  else if (e.key === 'c' || e.key === 'C') {
    e.preventDefault()
    if (gs.toCall.value > 0) engine.handleCall(Math.min(gs.toCall.value, gs.maxRaise.value))
    else engine.handleCheck()
  }
  else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); heroRaise(Math.round(gs.pot.value * 0.5)) }
}
// Keep-alive: bind on activation, unbind on deactivation — with only the
// mounted/unmounted pair, the cached page keeps intercepting f/c/r on every
// other route (and phase stays 'table', so the guard doesn't help).
// onActivated also fires on initial mount; duplicate addEventListener with
// the same function reference is a no-op.
onMounted(() => window.addEventListener('keydown', onGameKeydown))
onActivated(() => window.addEventListener('keydown', onGameKeydown))
onDeactivated(() => window.removeEventListener('keydown', onGameKeydown))
onUnmounted(() => window.removeEventListener('keydown', onGameKeydown))

// ─── Game Flow ─────────────────────────────────────────────────
function handleStart(gameSettings: GameSettings) {
  engine.cleanup() // invalidate any pending timers/loops from a prior game
  engine.resetTableReads() // a new table is a new read
  settings.value = gameSettings
  gs.dealerSeat.value = Math.floor(Math.random() * gameSettings.playerCount)
  phase.value = 'table'
  initSession(gameSettings.stakeLevel, gameSettings.playerCount, startingStack.value)
  heroProfileStore.reset()
  // Set commentary directly from setup choice — no localStorage middleman
  commentary.enabled.value = gameSettings.commentaryMode !== 'off'
  commentary.mode.value = gameSettings.commentaryMode === 'tv' ? 'tv' : 'hero'
  engine.paused.value = false
  pausedByNav = false
  resetTimeout()
  engine.schedule(dealNewHand, 300)
}

// Hero raise wrapper — records postflop bet sizing for the bots' tell detection
function heroRaise(amount: number) {
  if (gs.street.value !== 'preflop' && gs.pot.value > 0) {
    heroProfileStore.recordHeroBetSizing(amount / gs.pot.value)
    heroPendingSizings.push(amount / gs.pot.value)
  }
  engine.handleRaise(amount)
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
  engine.schedule(() => engine.postBlindsAndStartBetting(), 400)
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
    gs.heroWonHand.value = winnerId === 0
    gs.heroWinAmount.value = gs.pot.value
    gs.handWinnerId.value = winnerId
    gs.handWinnerName.value = gs.playerStates.value[winnerId]?.name || 'Unknown'
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
      gs.dealerSeat.value,
    )

    // Apply chip awards and detect splits
    let maxAward = 0
    const awardList: { pid: number; amount: number }[] = []
    for (const [pid, amount] of awards) {
      gs.playerStates.value[pid].chips += amount
      awardList.push({ pid, amount })
      if (amount > maxAward) {
        maxAward = amount
        winnerId = pid
      }
    }
    // Check for split pot (multiple players got equal max award)
    const maxWinners = awardList.filter(a => a.amount === maxAward)
    if (maxWinners.length > 1) {
      const names = maxWinners.map(w => gs.playerStates.value[w.pid]?.name).filter(Boolean)
      gs.handWinnerName.value = `Split: ${names.join(' & ')}`
      gs.handWinnerId.value = maxWinners[0].pid
      gs.heroWonHand.value = maxWinners.some(w => w.pid === 0)
      gs.heroWinAmount.value = gs.pot.value
    } else {
      gs.heroWonHand.value = winnerId === 0
      gs.heroWinAmount.value = gs.pot.value
      gs.handWinnerId.value = winnerId
      gs.handWinnerName.value = gs.playerStates.value[winnerId]?.name || 'Unknown'
    }
  }

  // Record winner for table flow dynamics
  if (winnerId >= 0) engine.recordHandWinner(winnerId)

  // Update tilt for bots — only hands they actually played (invested chips or showdown)
  const nonFoldedCount = gs.playerStates.value.filter(pl => !pl.folded && !pl.eliminated).length
  for (const p of gs.playerStates.value) {
    if (p.isHero || p.eliminated) continue
    const won = p.id === winnerId
    const chipsAtStart = startingStack.value
    const lostBigPot = !won && !p.folded && gs.pot.value > chipsAtStart * config.tilt.bigLossThreshold
    const participated = gs.handActionLog.value.some(a =>
      actedInLine(a, p.name) && (a.includes('calls') || a.includes('raises') || a.includes('ALL-IN')))
      || (!p.folded && nonFoldedCount > 1)
    updateTilt(p.tilt, won, lostBigPot, config.tilt, p.tiltMultiplier, participated)
  }

  // Record hero actions for adaptation — 3-bet/c-bet facing derived from the log
  const heroState = gs.playerStates.value[0]
  if (heroState) {
    const heroRecord = parseHeroHandRecord(
      gs.handActionLog.value,
      heroState.name,
      { heroFolded: heroState.folded, heroTotalWagered: gs.heroTotalWagered.value, bb: bb.value },
    )
    heroProfileStore.recordHeroAction(heroRecord)
    // The book learns in every mode (exploitation is gated separately)
    nemesisStore.record(
      heroRecord,
      settings.value?.botConfigs.slice(0, (settings.value?.playerCount ?? 1) - 1).map(b => b.name) ?? [],
    )

    // Bet-sizing tell: classify hero's hand at multi-player showdowns
    const othersAtShowdown = gs.playerStates.value.filter(p => !p.isHero && !p.folded && !p.eliminated).length
    const heroAtShowdown = !heroState.folded && othersAtShowdown > 0 && gs.visibleCommunity.value.length === 5
    let heroStrong = false
    if (heroAtShowdown && heroState.holeCards) {
      const heroResult = bestHand(heroState.holeCards, gs.visibleCommunity.value)
      heroStrong = !!heroResult && heroResult.rank >= 2 // two pair or better
    }
    heroProfileStore.finalizeHandSizing(heroAtShowdown ? { shown: true, strong: heroStrong } : null)
    if (heroAtShowdown && heroPendingSizings.length > 0) {
      const avg = heroPendingSizings.reduce((sum, x) => sum + x, 0) / heroPendingSizings.length
      nemesisStore.recordSizing(avg, heroStrong)
    }
    heroPendingSizings = []
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
  engine.cleanup()
  engine.resetTableReads() // a new table is a new read
  initSession(settings.value!.stakeLevel, settings.value!.playerCount, startingStack.value)
  gs.playerStates.value = []
  phase.value = 'table'
  resetTimeout()
  engine.schedule(dealNewHand, 300)
}

function backToSetup() {
  engine.cleanup() // mid-hand exit: stop pending bot actions/street advances
  if (timeoutTimer) clearTimeout(timeoutTimer)
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
          <UButton v-if="careerMode" color="primary" size="lg" @click="() => endCareerSession('felted')">
            Back to Career
          </UButton>
          <UButton v-if="!careerMode && config.session.rebuyEnabled" color="primary" size="lg" @click="handleRebuy">
            Re-buy (${{ startingStack }})
          </UButton>
          <UButton v-if="!careerMode" variant="outline" color="neutral" size="lg" @click="backToSetup">
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
      <div class="flex flex-wrap items-center justify-between gap-y-2 mb-4 max-w-7xl mx-auto">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          icon="i-lucide-arrow-left"
          @click="careerMode ? endCareerSession('leave') : backToSetup()"
        >
          {{ careerMode ? 'Leave table' : 'Setup' }}
        </UButton>

        <div class="flex flex-wrap items-center gap-2 sm:gap-4">
          <span class="text-xs text-gray-600 font-mono">Hand #{{ session.handsPlayed + (gs.dealt.value ? 1 : 0) }}</span>
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
              class="text-base font-bold font-mono tabular-nums min-w-[3.5rem] text-right"
              :class="gs.hero.value.chips >= startingStack ? 'text-green-400' : 'text-red-400'"
            >
              {{ formatPot(gs.hero.value.chips) }}
            </span>
            <span
              class="text-xs font-mono tabular-nums min-w-[3rem]"
              :class="gs.hero.value.chips !== startingStack
                ? (gs.hero.value.chips >= startingStack ? 'text-green-500/60' : 'text-red-500/60')
                : 'invisible'"
            >
              ({{ gs.hero.value.chips >= startingStack ? '+' : '' }}{{ formatPot(gs.hero.value.chips - startingStack) }})
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <NuxtLink to="/stats">
            <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-bar-chart-2">
              Stats
            </UButton>
          </NuxtLink>
        </div>
      </div>

      <!-- Main layout -->
      <div class="flex flex-col xl:flex-row gap-4 max-w-[110rem] mx-auto items-start">
        <!-- Commentary column (left). Sticks below the app bar (h-9 = 2.25rem)
             plus the original 1rem gap, so it doesn't slide under the hub exit
             while you scroll a long hand. -->
        <div class="hidden xl:block w-80 shrink-0 xl:sticky xl:top-13">
          <CommentaryPanel
            :lines="commentary.lines.value"
            :enabled="commentary.enabled.value"
            :mode="commentary.mode.value"
            :norman-silence="commentary.normanSilence.value"
            :norman-serious="commentary.normanSerious.value"
            :lon-analysis="commentary.lonAnalysis.value"
            :hand-over="gs.street.value === 'showdown'"
            :paused="engine.paused.value"
            @update:enabled="commentary.enabled.value = $event"
            @update:mode="commentary.mode.value = $event"
            @update:norman-silence="commentary.normanSilence.value = $event"
            @update:norman-serious="commentary.normanSerious.value = $event"
            @update:lon-analysis="commentary.lonAnalysis.value = $event"
            @update:paused="engine.paused.value = $event"
          />
        </div>
        <!-- w-full: the parent is items-start, so without an explicit width this
             column shrink-wraps below xl and the table collapses to ~315px. -->
        <div class="w-full flex-1 min-w-0 space-y-4">
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
                class="w-14 h-20 sm:w-20 sm:h-[7rem] rounded-lg border border-dashed border-green-800/40"
              />
            </template>

            <template #pot>
              <div class="text-center text-yellow-400 font-bold text-sm font-mono tabular-nums min-w-[5rem]">
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
                :show-cards="gs.playerStates.value[seatIndex].isHero || (gs.street.value === 'showdown' && !gs.playerStates.value[seatIndex].folded) || (commentary.enabled.value && commentary.mode.value === 'tv')"
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
            class="flex justify-center min-h-[2.75rem]"
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
              <UButton size="xs" variant="ghost" color="error" @click="() => { queuedAction = 'fold' }">
                Pre-fold
              </UButton>
            </UTooltip>
            <UTooltip :text="gs.toCall.value > 0 ? 'Queue a call — will execute when it\'s your turn' : 'Queue a check — will execute when it\'s your turn'">
              <UButton size="xs" variant="ghost" color="neutral" @click="() => { queuedAction = gs.toCall.value > 0 ? 'call' : 'check' }">
                Pre-{{ gs.toCall.value > 0 ? 'call' : 'check' }}
              </UButton>
            </UTooltip>
          </div>

          <!-- Hero's turn indicator -->
          <div
            v-if="gs.heroTurn.value"
            class="flex justify-center"
          >
            <div class="inline-flex items-center gap-3 bg-amber-900/40 border-2 border-amber-500/60 rounded-full px-6 py-3 shadow-lg shadow-amber-500/10 animate-pulse">
              <div class="w-3 h-3 rounded-full bg-amber-400" />
              <span class="text-base font-bold text-amber-200">
                Your Turn
                <span class="text-amber-400/70 font-normal ml-1 font-mono tabular-nums">{{ gs.toCall.value > 0 ? `— $${gs.toCall.value} to call` : '— check or bet' }}</span>
              </span>
              <span class="text-[0.55rem] text-amber-500/50 ml-1">F/C/R</span>
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
            @raise="heroRaise"
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
                @click="() => { phase = 'busted' }"
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
            <UButton
              v-if="careerMode && !gs.dealt.value || careerMode && gs.street.value === 'showdown'"
              variant="outline"
              color="neutral"
              size="lg"
              @click="() => endCareerSession('leave')"
            >
              Leave table (bank ${{ gs.hero.value?.chips ?? 0 }})
            </UButton>
          </div>
        </div>

        <!-- Stats column -->
        <div class="w-full xl:w-80 xl:sticky xl:top-4 shrink-0 space-y-3">
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
          :winner-hand="gs.handWinnerId.value >= 0 && gs.playerStates.value[gs.handWinnerId.value]?.holeCards && gs.visibleCommunity.value.length >= 3 ? describeHand(gs.playerStates.value[gs.handWinnerId.value].holeCards!, gs.visibleCommunity.value) : ''"
          :showdown-players="showdownPlayers"
          :session-stats="session"
          :milestones="sessionMilestones"
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

      <!-- Footer -->
      <div class="flex items-center justify-center gap-4 py-4 mt-4 border-t border-gray-800/40 text-xs text-gray-600">
        <NuxtLink to="/bots" class="hover:text-gray-400 transition-colors">Bots</NuxtLink>
        <span>&middot;</span>
        <NuxtLink to="/analysis" class="hover:text-gray-400 transition-colors">Bot Analysis</NuxtLink>
        <span>&middot;</span>
        <NuxtLink to="/replay-hand" class="hover:text-gray-400 transition-colors">Hand Replay</NuxtLink>
        <span>&middot;</span>
        <a href="https://github.com/cschweda/metaincognita-holdem" target="_blank" rel="noopener" class="hover:text-gray-400 transition-colors flex items-center gap-1">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub
        </a>
      </div>
    </div>
  </div>
</template>
