/**
 * Strategic commentary generators — dynamically generated poker observations
 * used when Chorman's "serious" slider is high. Context-aware, not canned.
 */
import type { Card } from './cards'
import { RANK_DISPLAY } from './cards'
import { bestHand, HAND_RANK_NAMES, HAND_RANKS, detectDraws, estimateEquity } from './handAnalysis'
import type { PlayerState } from '~/composables/useGameState'
import { pick } from './commentaryQuips'

export function strategicFlopObs(heroCards: [Card, Card] | null, community: Card[], players: PlayerState[]): string | null {
  if (!heroCards || community.length < 3) return null
  const hand = bestHand(Array.from(heroCards), community)
  const draws = detectDraws(Array.from(heroCards), community)
  const numActive = players.filter(p => !p.folded && !p.eliminated).length
  const boardRanks = community.slice(0, 3).map(c => c.rank)
  const boardMax = Math.max(...boardRanks)

  const obs: string[] = []

  if (draws.length > 0) {
    const totalOuts = draws.reduce((s, d) => s + d.outs, 0)
    const hitPct = Math.round(totalOuts * 2)
    obs.push(`${totalOuts} outs — roughly ${hitPct}% to improve on the next card.`)
  }

  if (hand && hand.rank >= HAND_RANKS.TWO_PAIR && numActive >= 3) {
    obs.push(`Strong hand multiway. Protect it — bet to charge the draws.`)
  }

  if (hand && hand.rank === HAND_RANKS.ONE_PAIR) {
    const pairRank = hand.score[1]
    if (pairRank < boardMax) obs.push(`Only second pair. Be cautious — anyone with a ${RANK_DISPLAY[boardMax]} has you beat.`)
    else if (hand.score[2] <= 9) obs.push(`Top pair but the kicker is weak. Vulnerable to better kickers.`)
  }

  const suits = community.slice(0, 3).map(c => c.suit)
  if (suits[0] === suits[1] && suits[1] === suits[2]) {
    const heroHasFlush = heroCards.some(c => c.suit === suits[0])
    if (!heroHasFlush) obs.push(`Monotone board and we don't have a card of that suit. Dangerous.`)
    else obs.push(`Monotone board but we have one of that suit. Flush draw with 9 outs.`)
  }

  if (boardRanks.includes(14) && !heroCards.some(c => c.rank === 14)) {
    obs.push(`Ace on board and we don't have one. If someone bets, they're likely representing it.`)
  }

  return obs.length > 0 ? pick(obs) : null
}

export function strategicActionObs(playerName: string, actionType: string, amount: number, pot: number, heroCards: [Card, Card] | null, community: Card[]): string | null {
  const obs: string[] = []

  if (actionType === 'raise' || actionType === 'bet') {
    const potRatio = amount / Math.max(pot, 1)
    if (potRatio > 1.2) obs.push(`That's an overbet — more than the pot. Usually means a very strong hand or a big bluff. Not much in between.`)
    else if (potRatio < 0.25) obs.push(`Tiny bet. That's either a blocking bet to see the next card cheap, or a trap. Proceed carefully.`)
    else if (potRatio > 0.7 && potRatio <= 1.0) obs.push(`Full pot-sized bet. Trying to price out draws and get value from made hands.`)
  }

  if (actionType === 'call' && community.length >= 3) {
    obs.push(`A call here means they've got something — a pair, a draw, or they're floating to steal later.`)
  }

  if (actionType === 'all-in') {
    if (heroCards && community.length >= 3) {
      const eq = estimateEquity(heroCards, community, 1, 150)
      if (eq >= 60) obs.push(`We're ${eq}% to win here. The math says call.`)
      else if (eq >= 40) obs.push(`Close spot — ${eq}% equity. Depends on pot odds.`)
      else obs.push(`Only ${eq}% equity against this shove. Tough call.`)
    }
  }

  return obs.length > 0 ? pick(obs) : null
}

export function strategicShowdownObs(heroWon: boolean, pot: number, heroCards: [Card, Card] | null, community: Card[]): string | null {
  if (!heroCards || community.length < 5) return null
  const hand = bestHand(Array.from(heroCards), community)
  if (!hand) return null

  const obs: string[] = []
  if (heroWon) {
    if (hand.rank >= HAND_RANKS.FLUSH) obs.push(`Big hand holds up. That's the kind of result you build sessions on.`)
    else if (hand.rank === HAND_RANKS.ONE_PAIR) obs.push(`Won with just one pair. Sometimes that's all it takes — especially when the board is dry.`)
  } else {
    if (hand.rank >= HAND_RANKS.TWO_PAIR) obs.push(`Losing with two pair or better is tough. That's a cooler — nothing you could have done differently.`)
    else if (hand.rank === HAND_RANKS.ONE_PAIR) obs.push(`One pair wasn't enough here. On a board this coordinated, stronger hands are out there.`)
  }

  return obs.length > 0 ? pick(obs) : null
}
