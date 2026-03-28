/**
 * Shared game engine — betting round orchestration, action processing,
 * street advancement, and hero action handlers. Used by both index.vue
 * and replay.vue with customizable bot decision and end-hand callbacks.
 */
import { displayCard } from '~/utils/cards'
import { assignPositions } from '~/utils/seats'
import type { useGameState, PlayerState } from '~/composables/useGameState'

export interface GameEngineOptions {
  gameState: ReturnType<typeof useGameState>
  bb: Ref<number>
  sb: Ref<number>
  positions: Ref<string[]>
  makeBotDecision: (p: PlayerState, raiseLevel: number, streetContext?: {
    wasPreflopRaiser: boolean
    preflopCallers: number
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

  // Track preflop raise level for escalation
  let preflopRaiseLevel = 0

  // Street awareness — track per-player actions and preflop aggressor
  let preflopRaiserId = -1  // seat id of last preflop raiser
  let preflopCallerCount = 0
  const playerStreetActions = new Map<number, {
    flop?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
    turn?: 'bet' | 'call' | 'check' | 'raise' | 'fold'
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
    if (recentWinnerIds.length < 10) return undefined
    const winCounts = new Map<number, number>()
    for (const id of recentWinnerIds) winCounts.set(id, (winCounts.get(id) ?? 0) + 1)
    const total = recentWinnerIds.length
    let dominantId = -1, dominantWins = 0
    for (const [id, wins] of winCounts) {
      if (wins > dominantWins) { dominantId = id; dominantWins = wins }
    }
    const myWins = winCounts.get(botId) ?? 0
    const avgStack = gs.playerStates.value.reduce((s, p) => s + (p.eliminated ? 0 : p.chips), 0) /
      gs.playerStates.value.filter(p => !p.eliminated).length
    return {
      dominantPlayerId: dominantId,
      dominantWinRate: dominantWins / total,
      myRecentWinRate: myWins / total,
      avgStackDepth: avgStack / bb.value,
      handsInWindow: total,
    }
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
    preflopRaiseLevel = 0 // no raises yet — blinds don't count
    preflopRaiserId = -1
    preflopCallerCount = 0
    playerStreetActions.clear()

    const preflopStart = (bbSeat + 1) % gs.playerStates.value.length
    setTimeout(() => runBettingRound(preflopStart), 600)
  }

  function applyAction(p: PlayerState, action: { type: string; amount?: number }) {
    if (action.type === 'fold') {
      p.folded = true
      p.lastAction = 'fold'
      p.currentBetAmount = 0
      gs.handActionLog.value.push(`${p.name} folds`)
    } else if (action.type === 'check') {
      p.lastAction = 'check'
      p.currentBetAmount = 0
      gs.handActionLog.value.push(`${p.name} checks`)
    } else if (action.type === 'call') {
      const callAmt = Math.min(gs.currentBet.value - p.betThisRound, p.chips)
      p.chips -= callAmt
      p.betThisRound += callAmt
      p.totalInvested += callAmt
      if (p.id === 0) gs.heroTotalWagered.value += callAmt
      gs.pot.value += callAmt
      p.lastAction = 'call'
      p.currentBetAmount = callAmt
      gs.handActionLog.value.push(`${p.name} calls $${callAmt}`)
    } else if (action.type === 'raise') {
      const raiseTotal = Math.min(action.amount!, p.chips + p.betThisRound)
      const toAdd = raiseTotal - p.betThisRound
      p.chips -= toAdd
      p.betThisRound = raiseTotal
      p.totalInvested += toAdd
      gs.pot.value += toAdd
      gs.currentBet.value = raiseTotal
      if (p.id === 0) gs.heroTotalWagered.value += toAdd
      p.lastAction = p.chips <= 0 ? 'all-in' : 'raise'
      p.currentBetAmount = raiseTotal
      gs.handActionLog.value.push(
        p.chips <= 0
          ? `${p.name} goes ALL-IN $${raiseTotal}`
          : `${p.name} raises to $${raiseTotal}`,
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
  }

  async function runBettingRound(startSeat: number, resume: boolean = false) {
    const count = gs.playerStates.value.length

    // All-in check: if fewer than 2 players have chips, skip betting entirely
    if (gs.activeNonAllIn.value.length <= 1 && gs.activePlayers.value.length >= 2) {
      gs.activeSeat.value = -1
      gs.waitingForHero.value = false
      const delay = gs.playerStates.value[0]?.folded ? 200 : 800
      setTimeout(() => advanceStreet(), delay)
      return
    }

    if (!resume) {
      gs.needsToAct.value = new Set(
        gs.playerStates.value
          .filter(p => !p.folded && !p.eliminated && p.chips > 0)
          .map(p => p.id),
      )
    }

    let seat = startSeat
    let loops = 0

    while (gs.needsToAct.value.size > 0) {
      const p = gs.playerStates.value[seat]

      if (!gs.needsToAct.value.has(p.id)) {
        seat = (seat + 1) % count
        loops++
        if (loops >= count * 4) break
        continue
      }

      if (gs.activePlayers.value.length <= 1) break

      gs.activeSeat.value = seat

      if (p.isHero) {
        // Check for queued action (index.vue specific, handled via queuedAction ref outside engine)
        gs.waitingForHero.value = true
        return // Hero takes over
      }

      // Bot decision with thinking delay
      const heroOut = gs.playerStates.value[0]?.folded
      const delay = heroOut
        ? botDelay.heroFoldedMin + Math.random() * (botDelay.heroFoldedMax - botDelay.heroFoldedMin)
        : botDelay.min + Math.random() * (botDelay.max - botDelay.min)
      await sleep(delay)

      const currentRaiseLevel = gs.street.value === 'preflop' ? preflopRaiseLevel : 0
      const action = makeBotDecision(p, currentRaiseLevel, {
        wasPreflopRaiser: p.id === preflopRaiserId,
        preflopCallers: preflopCallerCount,
        streetHistory: playerStreetActions.get(p.id),
        opponentReads: handsForMemory >= 5 ? {
          avgAggression: recentTableBets / Math.max(recentTableBets + recentTableChecks, 1) * 2,
          recentBluffRate: recentShowdowns > 0 ? recentShowdownBluffs / recentShowdowns : 0.15,
          tableIsPassive: recentTableChecks > recentTableBets * 2,
        } : undefined,
        tableDynamics: getTableDynamics(p.id),
      })
      applyAction(p, action)

      gs.needsToAct.value.delete(p.id)

      if (action.type === 'raise') {
        for (const ap of gs.activePlayers.value) {
          if (ap.id !== p.id && ap.chips > 0 && !ap.folded) {
            gs.needsToAct.value.add(ap.id)
          }
        }
      }

      if (gs.activePlayers.value.length <= 1) break

      seat = (seat + 1) % count
      loops++
      if (loops >= count * 4) break
    }

    gs.activeSeat.value = -1
    gs.waitingForHero.value = false

    if (gs.activePlayers.value.length <= 1) {
      const delay = gs.playerStates.value[0]?.folded ? 300 : 1000
      setTimeout(() => onEndHand(), delay)
      return
    }

    const delay = gs.playerStates.value[0]?.folded ? 200 : 800
    setTimeout(() => advanceStreet(), delay)
  }

  function advanceStreet() {
    for (const p of gs.playerStates.value) {
      p.betThisRound = 0
      if (!p.folded) p.lastAction = null
    }
    gs.currentBet.value = 0
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
      setTimeout(() => advanceStreet(), delay)
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
    setTimeout(() => runBettingRound(startSeat), delay)
  }

  // ─── Hero Actions ──────────────────────────────────────────────

  function handleFold() {
    onHeroActivity?.()
    if (!gs.hero.value) return
    applyAction(gs.hero.value, { type: 'fold' })
    gs.needsToAct.value.delete(gs.hero.value.id)
    gs.waitingForHero.value = false
    resumeBettingAfterHero()
  }

  function handleCheck() {
    onHeroActivity?.()
    if (!gs.hero.value) return
    applyAction(gs.hero.value, { type: 'check' })
    gs.needsToAct.value.delete(gs.hero.value.id)
    gs.waitingForHero.value = false
    resumeBettingAfterHero()
  }

  function handleCall(_amount?: number) {
    onHeroActivity?.()
    if (!gs.hero.value) return
    applyAction(gs.hero.value, { type: 'call' })
    gs.needsToAct.value.delete(gs.hero.value.id)
    gs.waitingForHero.value = false
    resumeBettingAfterHero()
  }

  function handleRaise(amount: number) {
    onHeroActivity?.()
    if (!gs.hero.value) return
    const cappedAmount = Math.min(amount, gs.hero.value.chips + gs.hero.value.betThisRound)
    applyAction(gs.hero.value, { type: 'raise', amount: cappedAmount })
    gs.needsToAct.value.delete(gs.hero.value.id)
    for (const ap of gs.activePlayers.value) {
      if (ap.id !== gs.hero.value.id && ap.chips > 0 && !ap.folded) {
        gs.needsToAct.value.add(ap.id)
      }
    }
    gs.waitingForHero.value = false
    resumeBettingAfterHero()
  }

  function resumeBettingAfterHero() {
    if (gs.activePlayers.value.length <= 1) {
      const delay = gs.playerStates.value[0]?.folded ? 300 : 1000
      setTimeout(() => onEndHand(), delay)
      return
    }

    if (gs.needsToAct.value.size === 0) {
      const delay = gs.playerStates.value[0]?.folded ? 200 : 800
      setTimeout(() => advanceStreet(), delay)
      return
    }

    const nextSeat = (0 + 1) % gs.playerStates.value.length
    setTimeout(() => runBettingRound(nextSeat, true), 400)
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
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
