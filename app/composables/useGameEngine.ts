/**
 * Shared game engine — betting round orchestration, action processing,
 * street advancement, and hero action handlers. Used by both index.vue
 * and replay.vue with customizable bot decision and end-hand callbacks.
 */
import { displayCard } from '~/utils/cards'
import type { Card } from '~/utils/cards'
import { assignPositions } from '~/utils/seats'
import { chenScore, chenPlusScore, bestHand, detectDraws, HAND_RANK_NAMES } from '~/utils/handAnalysis'
import config from '@config'
import { getTableDynamics as sharedTableDynamics } from '~/utils/gameSimulation'
import { applyEngineAction, startBettingRound } from '~/utils/bettingEngine'
import type { BettingRound } from '~/utils/bettingEngine'
import type { useGameState, PlayerState } from '~/composables/useGameState'

export interface GameEngineOptions {
  gameState: ReturnType<typeof useGameState>
  bb: Ref<number>
  sb: Ref<number>
  positions: Ref<string[]>
  makeBotDecision: (p: PlayerState, raiseLevel: number, streetContext?: {
    wasPreflopRaiser: boolean
    preflopCallers: number
    checkedThisStreet?: boolean
    streetHistory?: { flop?: string; turn?: string }
    opponentReads?: { avgAggression: number; recentBluffRate: number; tableIsPassive: boolean }
    tableDynamics?: { dominantPlayerId?: number; dominantWinRate: number; myRecentWinRate: number; avgStackDepth: number; handsInWindow: number }
  }) => { type: string; amount?: number }
  onEndHand: () => void
  onHeroActivity?: () => void
  botDelay?: { min: number; max: number; heroFoldedMin: number; heroFoldedMax: number }
}

export function useGameEngine(options: GameEngineOptions) {
  const { gameState: gs, bb, sb, positions, makeBotDecision, onEndHand, onHeroActivity } = options
  const botDelay = options.botDelay ?? { min: 800, max: 2000, heroFoldedMin: 150, heroFoldedMax: 350 }
  const paused = ref(false)

  // Timeout tracking for cleanup on unmount
  const pendingTimeouts: ReturnType<typeof setTimeout>[] = []
  function scheduleTimeout(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      const idx = pendingTimeouts.indexOf(id)
      if (idx >= 0) pendingTimeouts.splice(idx, 1)
      fn()
    }, ms)
    pendingTimeouts.push(id)
    return id
  }
  function cleanup() {
    for (const id of pendingTimeouts) clearTimeout(id)
    pendingTimeouts.length = 0
  }

  // Track preflop raise level for escalation
  let preflopRaiseLevel = 0

  // Street awareness — track per-player actions and preflop aggressor
  let preflopRaiserId = -1  // seat id of last preflop raiser
  let preflopCallerCount = 0
  const playerStreetActions = new Map<number, {
    flop?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
    turn?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
    river?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
  }>()

  // Bot memory — track table-level tendencies across hands
  let recentTableBets = 0
  let recentTableChecks = 0
  let recentShowdownBluffs = 0
  let recentShowdowns = 0
  let handsForMemory = 0

  // Table Flow — rolling window of recent hand winners
  const TABLE_FLOW_WINDOW = 20
  const recentWinnerIds: number[] = []

  function getTableDynamics(botId: number) {
    return sharedTableDynamics(
      recentWinnerIds,
      gs.playerStates.value.filter(p => !p.eliminated).map(p => p.chips),
      bb.value,
      botId,
      config.tableFlow.minHands,
    )
  }

  function findSeatByPosition(label: string): number {
    return positions.value.findIndex(p => p === label || p.includes(label))
  }

  function postBlindsAndStartBetting() {
    const sbSeat = findSeatByPosition('SB')
    const bbSeat = findSeatByPosition('BB')

    if (sbSeat >= 0) {
      const p = gs.playerStates.value[sbSeat]
      const amt = Math.min(sb.value, p.chips)
      p.chips -= amt
      p.betThisRound = amt
      p.totalInvested += amt
      p.lastAction = 'sb'
      p.currentBetAmount = amt
      gs.pot.value += amt
      if (p.id === 0) gs.heroTotalWagered.value += amt
    }

    if (bbSeat >= 0) {
      const p = gs.playerStates.value[bbSeat]
      const amt = Math.min(bb.value, p.chips)
      p.chips -= amt
      p.betThisRound = amt
      p.totalInvested += amt
      p.lastAction = 'bb'
      p.currentBetAmount = amt
      gs.pot.value += amt
      if (p.id === 0) gs.heroTotalWagered.value += amt
    }

    gs.currentBet.value = bb.value
    gs.lastRaiseIncrement.value = bb.value // initial raise increment = BB
    preflopRaiseLevel = 0 // no raises yet — blinds don't count
    preflopRaiserId = -1
    preflopCallerCount = 0
    playerStreetActions.clear()

    const preflopStart = (bbSeat + 1) % gs.playerStates.value.length
    scheduleTimeout(() => runBettingRound(preflopStart), 600)
  }

  // Bridge the reactive state to the shared rules module. Player objects are
  // mutated through their reactive proxies; scalar refs are snapshotted in and
  // written back after each engine call. needsToAct is shared by reference.
  function engineRound(): BettingRound {
    return {
      players: gs.playerStates.value,
      currentBet: gs.currentBet.value,
      lastRaiseIncrement: gs.lastRaiseIncrement.value,
      pot: gs.pot.value,
      bb: bb.value,
      needsToAct: gs.needsToAct.value,
    }
  }
  function writeBack(r: BettingRound) {
    gs.currentBet.value = r.currentBet
    gs.lastRaiseIncrement.value = r.lastRaiseIncrement
    gs.pot.value = r.pot
  }

  /**
   * Apply a player action and return whether it reopens betting (full raise).
   * All betting legality (min-raise, half-raise rule, clamps, needsToAct)
   * lives in the shared bettingEngine module; this wrapper adds the UI/log
   * bookkeeping the live game needs.
   */
  function applyAction(p: PlayerState, action: { type: string; amount?: number }): boolean {
    const betBefore = p.betThisRound
    const r = engineRound()
    const result = applyEngineAction(r, p.id,
      action.type === 'raise'
        ? { type: 'raise', amount: action.amount ?? 0 }
        : { type: action.type as 'fold' | 'check' | 'call' })
    writeBack(r)

    if (result.type === 'fold') {
      p.lastAction = 'fold'
      p.currentBetAmount = 0
      gs.handActionLog.value.push(`${p.name} folds`)
    } else if (result.type === 'check') {
      p.lastAction = 'check'
      p.currentBetAmount = 0
      gs.handActionLog.value.push(`${p.name} checks`)
    } else if (result.type === 'call') {
      if (p.id === 0) gs.heroTotalWagered.value += result.amount
      p.lastAction = 'call'
      p.currentBetAmount = result.amount
      gs.handActionLog.value.push(`${p.name} calls $${result.amount}`)
    } else if (result.type === 'raise') {
      if (p.id === 0) gs.heroTotalWagered.value += result.amount - betBefore
      p.lastAction = result.isAllIn ? 'all-in' : 'raise'
      p.currentBetAmount = result.amount
      gs.handActionLog.value.push(
        result.isAllIn
          ? `${p.name} goes ALL-IN $${result.amount}`
          : `${p.name} raises to $${result.amount}`,
      )
      // Track escalation on preflop
      if (gs.street.value === 'preflop') {
        preflopRaiseLevel++
        preflopRaiserId = p.id
      }
    }

    // Track street actions for awareness
    const street = gs.street.value
    if (street === 'preflop' && (action.type === 'call')) {
      preflopCallerCount++
    }
    if (street !== 'preflop' && street !== 'showdown') {
      const existing = playerStreetActions.get(p.id) || {}
      const streetKey = street as 'flop' | 'turn' | 'river'
      if (action.type === 'raise') {
        existing[streetKey] = gs.currentBet.value <= 0 ? 'bet' : 'raise'
      } else {
        existing[streetKey] = action.type as any
      }
      playerStreetActions.set(p.id, existing)

      // Table memory tracking
      if (action.type === 'raise') recentTableBets++
      if (action.type === 'check') recentTableChecks++
    }

    return result.reopened
  }

  async function runBettingRound(startSeat: number, resume: boolean = false) {
    const count = gs.playerStates.value.length

    // All-in check: if fewer than 2 players have chips, skip betting entirely
    if (gs.activeNonAllIn.value.length <= 1 && gs.activePlayers.value.length >= 2) {
      gs.activeSeat.value = -1
      gs.waitingForHero.value = false
      const delay = gs.playerStates.value[0]?.folded ? 200 : 800
      scheduleTimeout(() => advanceStreet(), delay)
      return
    }

    if (!resume) {
      const r = engineRound()
      startBettingRound(r)
      gs.needsToAct.value = r.needsToAct
    }

    let seat = startSeat
    // The real terminal condition is needsToAct becoming empty. The skip guard
    // below breaks ONLY if a full orbit passes with nobody able to act (a stuck
    // state) — unlike the old `loops >= count*4` cap, it can never truncate a
    // legitimate multi-raise, multiway betting round mid-action.
    let skips = 0

    while (gs.needsToAct.value.size > 0) {
      const p = gs.playerStates.value[seat]

      if (!gs.needsToAct.value.has(p.id)) {
        seat = (seat + 1) % count
        if (++skips > count) break
        continue
      }

      if (gs.activePlayers.value.length <= 1) break

      gs.activeSeat.value = seat

      if (p.isHero) {
        // Check for queued action (index.vue specific, handled via queuedAction ref outside engine)
        gs.waitingForHero.value = true
        return // Hero takes over
      }

      // Bot decision with thinking delay — show insight during the wait
      const heroOut = gs.playerStates.value[0]?.folded
      const delay = heroOut
        ? botDelay.heroFoldedMin + Math.random() * (botDelay.heroFoldedMax - botDelay.heroFoldedMin)
        : botDelay.min + Math.random() * (botDelay.max - botDelay.min)

      // Build thinking insight (only when hero can see it)
      if (!heroOut) {
        gs.botThinkingInsight.value = buildThinkingInsight(p, gs)
      }
      await sleep(delay, paused)
      gs.botThinkingInsight.value = null

      const currentRaiseLevel = gs.street.value === 'preflop' ? preflopRaiseLevel : 0
      const currentStreet = gs.street.value as 'flop' | 'turn' | 'river'
      const playerActions = playerStreetActions.get(p.id)
      const checkedThisStreet = playerActions?.[currentStreet] === 'check'
      const action = makeBotDecision(p, currentRaiseLevel, {
        wasPreflopRaiser: p.id === preflopRaiserId,
        preflopCallers: preflopCallerCount,
        checkedThisStreet,
        streetHistory: playerStreetActions.get(p.id),
        opponentReads: handsForMemory >= 5 ? {
          avgAggression: recentTableBets / Math.max(recentTableBets + recentTableChecks, 1) * 2,
          recentBluffRate: recentShowdowns > 0 ? recentShowdownBluffs / recentShowdowns : 0.15,
          tableIsPassive: recentTableChecks > recentTableBets * 2,
        } : undefined,
        tableDynamics: getTableDynamics(p.id),
      })
      // applyAction delegates to the shared engine, which owns all
      // needsToAct bookkeeping (actor removal + half-raise-aware reopens)
      applyAction(p, action)
      skips = 0 // an action occurred — reset the orbit guard

      if (gs.activePlayers.value.length <= 1) break

      seat = (seat + 1) % count
    }

    gs.activeSeat.value = -1
    gs.waitingForHero.value = false

    if (gs.activePlayers.value.length <= 1) {
      const delay = gs.playerStates.value[0]?.folded ? 300 : 1000
      scheduleTimeout(() => onEndHand(), delay)
      return
    }

    const delay = gs.playerStates.value[0]?.folded ? 200 : 800
    scheduleTimeout(() => advanceStreet(), delay)
  }

  function advanceStreet() {
    for (const p of gs.playerStates.value) {
      p.betThisRound = 0
      if (!p.folded) p.lastAction = null
    }
    gs.currentBet.value = 0
    gs.lastRaiseIncrement.value = bb.value // reset for new street
    preflopRaiseLevel = 0 // reset for postflop

    switch (gs.street.value) {
      case 'preflop':
        gs.street.value = 'flop'
        gs.handActionLog.value.push(
          `--- FLOP: ${gs.allCommunity.value.slice(0, 3).map(c => displayCard(c)).join(' ')} ---`,
        )
        break
      case 'flop':
        gs.street.value = 'turn'
        if (gs.allCommunity.value[3]) {
          gs.handActionLog.value.push(`--- TURN: ${displayCard(gs.allCommunity.value[3])} ---`)
        }
        break
      case 'turn':
        gs.street.value = 'river'
        if (gs.allCommunity.value[4]) {
          gs.handActionLog.value.push(`--- RIVER: ${displayCard(gs.allCommunity.value[4])} ---`)
        }
        break
      case 'river':
        gs.streetAtEnd.value = 'river' // save before changing — visibleCommunity depends on this
        gs.street.value = 'showdown'
        onEndHand()
        return
    }

    // All-in runout: if fewer than 2 players have chips, skip betting and deal next street
    if (gs.activeNonAllIn.value.length <= 1) {
      // Auto-advance to next street (no betting possible)
      const delay = 800
      scheduleTimeout(() => advanceStreet(), delay)
      return
    }

    const count = gs.playerStates.value.length
    let startSeat = (gs.dealerSeat.value + 1) % count
    for (let i = 0; i < count; i++) {
      const p = gs.playerStates.value[startSeat]
      if (!p.folded && !p.eliminated && p.chips > 0) break
      startSeat = (startSeat + 1) % count
    }
    const delay = gs.playerStates.value[0]?.folded ? 150 : 600
    scheduleTimeout(() => runBettingRound(startSeat), delay)
  }

  // ─── Hero Actions ──────────────────────────────────────────────

  function handleFold() {
    onHeroActivity?.()
    if (!gs.hero.value) return
    applyAction(gs.hero.value, { type: 'fold' })
    gs.waitingForHero.value = false
    resumeBettingAfterHero()
  }

  function handleCheck() {
    onHeroActivity?.()
    if (!gs.hero.value) return
    applyAction(gs.hero.value, { type: 'check' })
    gs.waitingForHero.value = false
    resumeBettingAfterHero()
  }

  function handleCall(_amount?: number) {
    onHeroActivity?.()
    if (!gs.hero.value) return
    applyAction(gs.hero.value, { type: 'call' })
    gs.waitingForHero.value = false
    resumeBettingAfterHero()
  }

  function handleRaise(amount: number) {
    onHeroActivity?.()
    if (!gs.hero.value) return
    // Legality (stack clamp, min-raise, half-raise reopens) lives in the engine
    applyAction(gs.hero.value, { type: 'raise', amount })
    gs.waitingForHero.value = false
    resumeBettingAfterHero()
  }

  function resumeBettingAfterHero() {
    if (gs.activePlayers.value.length <= 1) {
      const delay = gs.playerStates.value[0]?.folded ? 300 : 1000
      scheduleTimeout(() => onEndHand(), delay)
      return
    }

    if (gs.needsToAct.value.size === 0) {
      const delay = gs.playerStates.value[0]?.folded ? 200 : 800
      scheduleTimeout(() => advanceStreet(), delay)
      return
    }

    const nextSeat = (0 + 1) % gs.playerStates.value.length
    scheduleTimeout(() => runBettingRound(nextSeat, true), 400)
  }

  function recordHandWinner(winnerId: number) {
    recentWinnerIds.push(winnerId)
    if (recentWinnerIds.length > TABLE_FLOW_WINDOW) recentWinnerIds.shift()
  }

  return {
    findSeatByPosition,
    postBlindsAndStartBetting,
    applyAction,
    runBettingRound,
    advanceStreet,
    handleFold,
    handleCheck,
    handleCall,
    handleRaise,
    resumeBettingAfterHero,
    recordHandWinner,
    cleanup,
    paused,
  }
}

function sleep(ms: number, pauseRef?: Ref<boolean>): Promise<void> {
  return new Promise(resolve => {
    setTimeout(async () => {
      // If paused, wait until unpaused
      if (pauseRef?.value) {
        await new Promise<void>(unpause => {
          const stop = watch(pauseRef, (v) => { if (!v) { stop(); unpause() } })
        })
      }
      resolve()
    }, ms)
  })
}

/**
 * Build a snapshot of what the bot is "thinking about" for display during
 * the thinking delay. Computes Chen/Chen+, hand strength, board texture,
 * and reasoning factors based on the current game state.
 */
function buildThinkingInsight(
  p: PlayerState,
  gs: ReturnType<typeof import('~/composables/useGameState').useGameState>,
) {
  const factors: string[] = []
  const street = gs.street.value
  const community = gs.allCommunity.value
  const holeCards = p.holeCards
  const position = '' // position comes from outside, but we can derive from activeSeat context
  const toCall = Math.max(0, gs.currentBet.value - p.betThisRound)
  const pot = gs.pot.value
  const stackBB = p.chips / Math.max(1, gs.currentBet.value > 0 ? gs.currentBet.value : 2)

  let chen: number | undefined
  let chenPlus: number | undefined
  let handStrength: string | undefined
  let boardTexture: string | undefined

  // Preflop
  if (street === 'preflop' && holeCards) {
    chen = chenScore(holeCards)
    chenPlus = chenPlusScore(holeCards, '')
    factors.push(`Hand strength: Chen ${chen}, Chen+ ${chenPlus}`)

    if (chen >= 12) factors.push('Premium hand — looking to raise for value')
    else if (chen >= 8) factors.push('Solid hand — playable from most positions')
    else if (chen >= 5) factors.push('Speculative hand — needs the right price')
    else factors.push('Weak hand — need a good reason to play')

    if (toCall > 0) {
      factors.push(`Facing $${toCall} to call into $${pot} pot`)
      if (toCall > pot * 0.5) factors.push('Large bet relative to pot — need a strong hand')
    }

    if (p.chips < 50) factors.push(`Short stack ($${p.chips}) — push/fold territory`)
  }

  // Postflop
  if (street !== 'preflop' && holeCards && community.length >= 3) {
    const visibleCommunity = street === 'flop' ? community.slice(0, 3)
      : street === 'turn' ? community.slice(0, 4)
      : community.slice(0, 5)

    // Hand strength
    const result = bestHand(holeCards, visibleCommunity)
    if (result) {
      handStrength = HAND_RANK_NAMES[result.rank] || 'Unknown'
      factors.push(`Made hand: ${handStrength}`)
    } else {
      handStrength = 'High Card'
      factors.push('No made hand — playing high card')
    }

    // Draws
    const draws = detectDraws(holeCards, visibleCommunity)
    if (draws.length > 0) {
      const drawDesc = draws.map(d => `${d.type} (${d.outs} outs)`).join(', ')
      factors.push(`Draws: ${drawDesc}`)
    }

    // Board texture
    const ranks = visibleCommunity.map((c: Card) => c.rank).sort((a: number, b: number) => b - a)
    const highCard = ranks[0]
    const textureParts: string[] = []
    if (highCard === 14) textureParts.push('Ace-high')
    else if (highCard >= 11) textureParts.push('Broadway-heavy')
    else textureParts.push('Low board')

    const suitCounts = new Map<string, number>()
    for (const c of visibleCommunity) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1)
    const maxSuit = Math.max(...suitCounts.values())
    if (maxSuit >= 3) textureParts.push('monotone')
    else if (maxSuit === 2) textureParts.push('two-tone')
    else textureParts.push('rainbow')

    const uniqueRanks = [...new Set(ranks)].sort((a: number, b: number) => a - b)
    let connPairs = 0
    for (let i = 1; i < uniqueRanks.length; i++) {
      if (uniqueRanks[i] - uniqueRanks[i - 1] <= 2) connPairs++
    }
    if (connPairs >= 2) textureParts.push('connected')
    else if (connPairs === 0) textureParts.push('dry')

    boardTexture = textureParts.join(', ')
    factors.push(`Board: ${boardTexture}`)

    // Pot odds
    if (toCall > 0) {
      const potOdds = ((toCall / (pot + toCall)) * 100).toFixed(0)
      factors.push(`Pot odds: need ${potOdds}% equity to call $${toCall}`)
    }
  }

  return {
    chenScore: chen,
    chenPlusScore: chenPlus,
    handStrength,
    boardTexture,
    factors,
  }
}
