/**
 * Browser-compatible bot-vs-bot simulation engine.
 * Runs headless hands using the same decision engine as the game.
 * Yields progress callbacks so the UI can update.
 */
import config from '@config'
import { assignPositions } from './seats'
import { decideBotAction, applyTilt, updateTilt, decayTilt, createTiltState } from './botDecision'
import type { BotProfile, TiltState } from './botDecision'
import { bestHand, HAND_RANK_NAMES, HAND_RANKS } from './handAnalysis'
import { calculateSidePots, awardPots } from './sidePots'
import { toPokerStarsFormat } from './pokerStarsExport'
import type { Card } from './cards'

const FICTIONAL = ['Tight Tony', 'Loose Lucy', 'Aggressive Alex', 'Calling Carl', 'Tricky Tina', 'Solid Sam', 'Wild Wendy']

interface SimPlayer {
  id: number; name: string; chips: number; holeCards: [Card, Card] | null
  folded: boolean; eliminated: boolean; betThisRound: number; totalInvested: number
  lastAction: string | null; tilt: TiltState; tiltMultiplier: number
  consistency: number; profile: BotProfile
}

export interface HandInsight {
  type: 'leak' | 'good-play' | 'interesting' | 'teaching'
  player: string
  text: string
}

export interface SimHandRecord {
  handNumber: number; potSize: number; winnerName: string
  reachedFlop: boolean; reachedRiver: boolean; reachedShowdown: boolean
  was3Bet: boolean; wasAllIn: boolean
  players: { name: string; holeCards: string; position: string; folded: boolean; chips: number }[]
  board: string; actions: string[]
  interestScore: number
  interestReason: string
  insights: HandInsight[]
  psFormat: string
}

export interface SimBotStat {
  name: string; vpipCfg: number; pfrCfg: number; afCfg: number
  handsPlayed: number; vpipHands: number; pfrHands: number
  raiseCount: number; callCount: number; wins: number
  finalChips: number; rebuys: number
}

export interface SimResult {
  hands: number; players: number
  avgPot: number; preflopFoldOuts: number
  flopsSeen: number; turnsSeen: number; riversSeen: number
  showdowns: number; threeBetPots: number; allInHands: number
  botStats: SimBotStat[]
  interestingHands: SimHandRecord[]
  allHandsPS: string // full PokerStars hand history for all hands
}

import { simDisplayCard as displayCard, simShuffleDeck as shuffleDeck, simFindSeat as findSeat } from './gameSimulation'

export async function runSimulation(
  numHands: number,
  numPlayers: number,
  onProgress: (pct: number, hand: number) => void,
  stakeLevel: number = 3,
  abortSignal?: { aborted: boolean },
): Promise<SimResult> {
  const STAKE = config.stakes.find(s => s.level === stakeLevel) || config.stakes.find(s => s.level === 3)!
  const BB = STAKE.bb, SB = STAKE.sb, STARTING_STACK = BB * 100
  const TABLE_FLOW_WINDOW = 20

  // Pro bots only
  const pool = config.personas.filter(p => !FICTIONAL.includes(p.name))
  const selected = [...pool].sort(() => Math.random() - 0.5).slice(0, numPlayers)

  const players: SimPlayer[] = selected.map((p, i) => ({
    id: i, name: p.name, chips: STARTING_STACK, holeCards: null,
    folded: false, eliminated: false, betThisRound: 0, totalInvested: 0,
    lastAction: null, tilt: createTiltState(), tiltMultiplier: p.tiltMultiplier ?? 1.0,
    consistency: p.consistency ?? 0.95,
    profile: { vpip: p.vpip, pfr: p.pfr, aggression: p.aggression, bluffFreq: p.bluffFreq, creativeFreq: p.creativeFreq, threeBetFreq: p.threeBetFreq, fourBetFreq: p.fourBetFreq, fiveBetFreq: p.fiveBetFreq, donkBetFreq: p.donkBetFreq },
  }))

  const recentWinners: number[] = []
  const botStats = new Map<number, SimBotStat>()
  for (const p of players) {
    const persona = selected[p.id]
    botStats.set(p.id, { name: p.name, vpipCfg: persona.vpip, pfrCfg: persona.pfr, afCfg: persona.aggression, handsPlayed: 0, vpipHands: 0, pfrHands: 0, raiseCount: 0, callCount: 0, wins: 0, finalChips: STARTING_STACK, rebuys: 0 })
  }

  let totalPot = 0, preflopFoldOuts = 0, flopsSeen = 0, turnsSeen = 0, riversSeen = 0, showdowns = 0, threeBetPots = 0, allInHands = 0
  let dealerSeat = 0
  const allHands: SimHandRecord[] = []

  function getTableDynamics(botId: number) {
    if (recentWinners.length < 5) return { dominantWinRate: 0, myRecentWinRate: 0, avgStackDepth: 100, handsInWindow: recentWinners.length }
    const wins = new Map<number, number>()
    for (const w of recentWinners) wins.set(w, (wins.get(w) ?? 0) + 1)
    let domId = -1, domWins = 0
    for (const [id, cnt] of wins) { if (cnt > domWins) { domWins = cnt; domId = id } }
    return { dominantPlayerId: domId, dominantWinRate: domWins / recentWinners.length, myRecentWinRate: (wins.get(botId) ?? 0) / recentWinners.length, avgStackDepth: players.reduce((s, p) => s + p.chips, 0) / players.length / BB, handsInWindow: recentWinners.length }
  }

  for (let h = 0; h < numHands; h++) {
    // Yield to UI every 10 hands
    if (h % 10 === 0) {
      if (abortSignal?.aborted) break
      onProgress(h / numHands, h)
      await new Promise(r => setTimeout(r, 0))
    }

    // Rebuy eliminated players
    for (const p of players) {
      if (p.eliminated) { p.chips = STARTING_STACK; p.eliminated = false; botStats.get(p.id)!.rebuys++ }
    }

    const count = players.length
    const positions = assignPositions(count, dealerSeat)
    const deck = shuffleDeck()
    let idx = 0

    for (const p of players) {
      if (p.eliminated) { p.holeCards = null; continue }
      decayTilt(p.tilt)
      p.holeCards = [deck[idx++], deck[idx++]]
      p.folded = false; p.betThisRound = 0; p.totalInvested = 0; p.lastAction = null
      botStats.get(p.id)!.handsPlayed++
    }

    idx++
    const community: Card[] = [deck[idx++], deck[idx++], deck[idx++]]
    idx++; community.push(deck[idx++]); idx++; community.push(deck[idx++])

    let pot = 0, currentBet = 0
    let street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' = 'preflop'
    let preflopRaiseLevel = 0, preflopRaiserId = -1, preflopCallerCount = 0
    const playerStreetActions = new Map<number, { flop?: string; turn?: string }>()
    const actions: string[] = []
    let handHadAllIn = false

    const active = () => players.filter(p => !p.folded && !p.eliminated)
    const activeChips = () => active().filter(p => p.chips > 0)

    // Blinds
    const sbSeat = findSeat(positions, 'SB')
    const bbSeat = findSeat(positions, 'BB')
    if (sbSeat >= 0 && !players[sbSeat].eliminated) {
      const p = players[sbSeat]; const amt = Math.min(SB, p.chips)
      p.chips -= amt; p.betThisRound = amt; p.totalInvested += amt; pot += amt
    }
    if (bbSeat >= 0 && !players[bbSeat].eliminated) {
      const p = players[bbSeat]; const amt = Math.min(BB, p.chips)
      p.chips -= amt; p.betThisRound = amt; p.totalInvested += amt; pot += amt
    }
    currentBet = BB

    function runBettingRound(startSeat: number) {
      const needsToAct = new Set(players.filter(p => !p.folded && !p.eliminated && p.chips > 0).map(p => p.id))
      let seat = startSeat, loops = 0
      while (needsToAct.size > 0) {
        const p = players[seat]
        if (!needsToAct.has(p.id)) { seat = (seat + 1) % count; loops++; if (loops >= count * 4) break; continue }
        if (active().length <= 1) break

        const tiltedProfile = applyTilt(p.profile, p.tilt, config.tilt, p.tiltMultiplier)
        const action = decideBotAction(tiltedProfile, {
          street, toCall: currentBet - p.betThisRound, pot, currentBet, playerBet: p.betThisRound,
          chips: p.chips, bb: BB, numActivePlayers: active().length,
          raiseLevel: street === 'preflop' ? preflopRaiseLevel : 0,
          position: positions[p.id] || '', holeCards: p.holeCards ?? undefined, community,
          wasPreflopRaiser: p.id === preflopRaiserId, preflopCallers: preflopCallerCount,
          checkedThisStreet: (playerStreetActions.get(p.id) as any)?.[street] === 'check',
          streetHistory: playerStreetActions.get(p.id) as any, tableDynamics: getTableDynamics(p.id),
        }, p.consistency)

        if (action.type === 'fold') { p.folded = true; p.lastAction = 'fold'; actions.push(`${p.name} folds`) }
        else if (action.type === 'check') { p.lastAction = 'check'; actions.push(`${p.name} checks`) }
        else if (action.type === 'call') {
          const amt = Math.min(currentBet - p.betThisRound, p.chips)
          p.chips -= amt; p.betThisRound += amt; p.totalInvested += amt; pot += amt; p.lastAction = 'call'
          actions.push(`${p.name} calls $${amt}`)
          if (street === 'preflop') { botStats.get(p.id)!.vpipHands++; preflopCallerCount++ }
          botStats.get(p.id)!.callCount++
        } else if (action.type === 'raise') {
          const raiseTotal = Math.min(action.amount!, p.chips + p.betThisRound)
          const toAdd = raiseTotal - p.betThisRound
          p.chips -= toAdd; p.betThisRound = raiseTotal; p.totalInvested += toAdd; pot += toAdd; currentBet = raiseTotal
          p.lastAction = p.chips <= 0 ? 'all-in' : 'raise'
          if (p.chips <= 0) handHadAllIn = true
          actions.push(p.chips <= 0 ? `${p.name} goes ALL-IN $${raiseTotal}` : `${p.name} raises to $${raiseTotal}`)
          if (street === 'preflop') { preflopRaiseLevel++; preflopRaiserId = p.id; botStats.get(p.id)!.vpipHands++; botStats.get(p.id)!.pfrHands++ }
          botStats.get(p.id)!.raiseCount++
          for (const ap of active()) { if (ap.id !== p.id && ap.chips > 0) needsToAct.add(ap.id) }
        }

        if (street !== 'preflop') {
          const existing = playerStreetActions.get(p.id) || {}
          const key = street as 'flop' | 'turn'
          if (key === 'flop' || key === 'turn') { existing[key] = action.type; playerStreetActions.set(p.id, existing) }
        }
        needsToAct.delete(p.id)
        if (active().length <= 1) break
        seat = (seat + 1) % count; loops++; if (loops >= count * 4) break
      }
    }

    // Play streets
    runBettingRound((bbSeat + 1) % count)
    const reachedFlop = active().length > 1
    if (!reachedFlop) preflopFoldOuts++

    const streets: ('flop' | 'turn' | 'river')[] = ['flop', 'turn', 'river']
    const streetCards = [community.slice(0, 3), [community[3]], [community[4]]]
    const streetNames = ['FLOP', 'TURN', 'RIVER']
    let reachedTurn = false, reachedRiver = false

    for (let si = 0; si < streets.length; si++) {
      if (active().length <= 1) break
      street = streets[si]
      const cards = si === 0 ? streetCards[0].map(displayCard).join(' ') : displayCard(streetCards[si][0])
      actions.push(`--- ${streetNames[si]}: ${cards} ---`)
      if (si === 0) flopsSeen++
      if (si === 1) { turnsSeen++; reachedTurn = true }
      if (si === 2) { riversSeen++; reachedRiver = true }
      if (activeChips().length <= 1 && active().length >= 2) continue
      for (const p of players) { p.betThisRound = 0; if (!p.folded) p.lastAction = null }
      currentBet = 0
      let startSeat = (dealerSeat + 1) % count
      for (let i = 0; i < count; i++) { const p = players[startSeat]; if (!p.folded && !p.eliminated && p.chips > 0) break; startSeat = (startSeat + 1) % count }
      runBettingRound(startSeat)
    }

    // Showdown
    street = 'showdown'
    let winnerId = -1, winnerName = ''
    const remaining = active()
    const isShowdown = remaining.length > 1

    if (remaining.length === 1) {
      winnerId = remaining[0].id; winnerName = remaining[0].name; remaining[0].chips += pot
    } else {
      const contributors = players.filter(p => !p.eliminated).map(p => ({ id: p.id, totalInvested: p.totalInvested, folded: p.folded, holeCards: p.holeCards }))
      const pots = calculateSidePots(contributors)
      const { awards } = awardPots(pots, players.map(p => ({ id: p.id, holeCards: p.holeCards })), community)
      let maxAward = 0
      for (const [pid, amount] of awards) { players[pid].chips += amount; if (amount > maxAward) { maxAward = amount; winnerId = pid; winnerName = players[pid].name } }
    }

    if (isShowdown) showdowns++
    if (preflopRaiseLevel >= 2) threeBetPots++
    if (handHadAllIn) allInHands++
    totalPot += pot

    if (winnerId >= 0) { botStats.get(winnerId)!.wins++; recentWinners.push(winnerId); if (recentWinners.length > TABLE_FLOW_WINDOW) recentWinners.shift() }
    for (const p of players) { if (!p.eliminated) { const won = p.id === winnerId; updateTilt(p.tilt, won, !won && !p.folded && pot > STARTING_STACK * config.tilt.bigLossThreshold, config.tilt, p.tiltMultiplier) } }
    for (const p of players) { if (p.chips <= 0 && !p.eliminated) p.eliminated = true }
    for (const p of players) { botStats.get(p.id)!.finalChips = p.chips }

    // Score hand interest
    let interestScore = 0, interestReason = ''
    if (pot > STARTING_STACK * 2) { interestScore += 3; interestReason = 'Huge pot' }
    if (isShowdown && remaining.length >= 3) { interestScore += 2; interestReason += (interestReason ? ' + ' : '') + 'Multiway showdown' }
    if (handHadAllIn && isShowdown) { interestScore += 2; interestReason += (interestReason ? ' + ' : '') + 'All-in showdown' }
    if (preflopRaiseLevel >= 3) { interestScore += 2; interestReason += (interestReason ? ' + ' : '') + '4-bet+ pot' }
    // Cooler detection
    if (isShowdown && remaining.length >= 2) {
      const handResults = remaining.filter(p => p.holeCards).map(p => bestHand(Array.from(p.holeCards!), community)).filter(Boolean)
      if (handResults.length >= 2 && handResults[0]!.rank >= HAND_RANKS.STRAIGHT && handResults[1]!.rank >= HAND_RANKS.STRAIGHT) {
        interestScore += 4; interestReason += (interestReason ? ' + ' : '') + 'Cooler'
      }
    }

    // ─── Hand insights: leaks, good plays, teaching moments ───
    const insights: HandInsight[] = []

    // Analyze each player's play
    for (const p of players) {
      if (p.eliminated || !p.holeCards) continue
      const chen = chenScore(p.holeCards)
      const pos = positions[p.id] || ''
      const isEP = ['UTG', 'UTG+1'].includes(pos)
      const isLP = ['BTN', 'D', 'D/BTN', 'CO'].includes(pos)

      // Leak: called preflop with junk from early position
      if (!p.folded && chen <= 4 && isEP && actions.some(a => a.startsWith(p.name) && (a.includes('calls') || a.includes('raises')))) {
        insights.push({ type: 'leak', player: p.name, text: `Entered the pot from ${pos} with ${p.holeCards.map(displayCard).join(' ')} (Chen ${chen}). This hand is too weak for early position.` })
      }

      // Good play: folded a marginal hand under pressure
      if (p.folded && chen >= 7 && chen <= 9 && preflopRaiseLevel >= 2) {
        insights.push({ type: 'good-play', player: p.name, text: `Folded ${p.holeCards.map(displayCard).join(' ')} to a 3-bet. Disciplined laydown of a marginal hand.` })
      }

      // Leak: called all-in with weak hand
      if (!p.folded && handHadAllIn && p.id !== winnerId) {
        const hand = community.length >= 3 ? bestHand(Array.from(p.holeCards), community) : null
        if (hand && hand.rank <= HAND_RANKS.ONE_PAIR && pot > STARTING_STACK) {
          insights.push({ type: 'leak', player: p.name, text: `Called an all-in with only ${HAND_RANK_NAMES[hand.rank]} in a $${pot} pot. Likely a losing call long-term.` })
        }
      }
    }

    // Board-level insights
    if (isShowdown && remaining.length >= 2) {
      const showdownHands = remaining.filter(p => p.holeCards).map(p => ({
        name: p.name, result: bestHand(Array.from(p.holeCards!), community), cards: p.holeCards!,
      })).filter(h => h.result).sort((a, b) => b.result!.rank - a.result!.rank || b.result!.score[0] - a.result!.score[0])

      // Teaching: show what the winning hand was and why
      if (showdownHands.length >= 1) {
        const winner = showdownHands[0]
        insights.push({ type: 'teaching', player: winner.name, text: `Won at showdown with ${HAND_RANK_NAMES[winner.result!.rank]} (${winner.cards.map(displayCard).join(' ')}).` })
      }

      // Teaching: loser's hand and why they lost
      if (showdownHands.length >= 2) {
        const loser = showdownHands[showdownHands.length - 1]
        if (loser.result!.rank < showdownHands[0].result!.rank) {
          insights.push({ type: 'teaching', player: loser.name, text: `Lost at showdown with ${HAND_RANK_NAMES[loser.result!.rank]} — beaten by ${HAND_RANK_NAMES[showdownHands[0].result!.rank]}.` })
        }
      }

      // Interesting: overbet bluff that got called
      const bluffActions = actions.filter(a => a.includes('ALL-IN') || (a.includes('raises to') && a.match(/\$(\d+)/)?.[1] && parseInt(a.match(/\$(\d+)/)![1]) > pot * 0.8))
      for (const a of bluffActions) {
        const blufferName = a.split(' ')[0]
        const bluffer = showdownHands.find(h => h.name === blufferName)
        if (bluffer && bluffer.result!.rank <= HAND_RANKS.ONE_PAIR && bluffer.name !== showdownHands[0].name) {
          insights.push({ type: 'interesting', player: blufferName, text: `Made a large bet/raise with only ${HAND_RANK_NAMES[bluffer.result!.rank]} — bluff that got caught.` })
          break
        }
      }
    }

    // Big fold insight
    for (const p of players) {
      if (!p.folded || !p.holeCards) continue
      if (community.length >= 3) {
        const wouldHaveHad = bestHand(Array.from(p.holeCards), community)
        if (wouldHaveHad && wouldHaveHad.rank >= HAND_RANKS.TWO_PAIR) {
          insights.push({ type: 'interesting', player: p.name, text: `Folded but would have made ${HAND_RANK_NAMES[wouldHaveHad.rank]} on the board. Sometimes good folds cost you.` })
        }
      }
    }

    let boardStr = ''
    if (reachedFlop) boardStr = community.slice(0, 3).map(displayCard).join(' ')
    if (reachedTurn) boardStr += ' ' + displayCard(community[3])
    if (reachedRiver) boardStr += ' ' + displayCard(community[4])

    // Build PokerStars format
    const psHand = {
      hand_number: h + 1, session_id: 'sim', hole_cards: '', board: boardStr.trim(),
      result: 'sim', profit: 0, position: '', pot_size: pot, stake_level: 3,
      player_count: numPlayers, played_at: new Date().toISOString(), actions,
      players: players.filter(p2 => !p2.eliminated || p2.holeCards).map(p2 => ({
        name: p2.name, position: positions[p2.id] || '', holeCards: p2.holeCards ? p2.holeCards.map(displayCard).join(' ') : '',
        folded: p2.folded, isHero: false, chips: p2.chips, seatIndex: p2.id,
      })),
    }
    const psFormat = toPokerStarsFormat(psHand as any, { sb: SB, bb: BB })

    allHands.push({
      handNumber: h + 1, potSize: pot, winnerName, reachedFlop, reachedRiver, reachedShowdown: isShowdown,
      was3Bet: preflopRaiseLevel >= 2, wasAllIn: handHadAllIn,
      players: players.map(p => ({ name: p.name, holeCards: p.holeCards ? p.holeCards.map(displayCard).join(' ') : '', position: positions[p.id] || '', folded: p.folded, chips: p.chips })),
      board: boardStr.trim(), actions, interestScore, interestReason, insights, psFormat,
    })

    dealerSeat = (dealerSeat + 1) % count
  }

  onProgress(1, numHands)

  // Pick most interesting hands
  const interesting = [...allHands].sort((a, b) => b.interestScore - a.interestScore).slice(0, 3)

  return {
    hands: numHands, players: numPlayers,
    avgPot: Math.round(totalPot / numHands),
    preflopFoldOuts, flopsSeen, turnsSeen, riversSeen, showdowns, threeBetPots, allInHands,
    botStats: [...botStats.values()],
    interestingHands: interesting,
    allHandsPS: allHands.map(h => h.psFormat).join('\n\n'),
  }
}
