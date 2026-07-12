/**
 * Side pot calculation for multi-way all-in scenarios.
 *
 * When players are all-in for different amounts, the pot is split into
 * buckets. Each bucket has a set of eligible players (those who contributed
 * enough to compete for that portion). The best hand among eligible players
 * wins each bucket.
 */
import type { Card } from './cards'
import { rank7 } from './handAnalysis'

export interface PotContributor {
  id: number
  totalInvested: number  // total chips put in this hand (blinds + all bets)
  folded: boolean
  holeCards: [Card, Card] | null
}

export interface SidePot {
  amount: number
  eligible: number[]  // player IDs who can win this pot
}

/**
 * Calculate main pot and side pots from player contributions.
 * Returns pots ordered from main pot (everyone eligible) to
 * smallest side pot (fewest eligible).
 */
export function calculateSidePots(contributors: PotContributor[]): SidePot[] {
  // Only consider non-folded players for pot eligibility,
  // but ALL players' investments contribute to pot sizes
  const active = contributors.filter(c => !c.folded)
  if (active.length === 0) return []

  // Get unique investment levels from non-folded players, sorted ascending
  const investLevels = [...new Set(active.map(c => c.totalInvested))].sort((a, b) => a - b)

  const pots: SidePot[] = []
  let prevLevel = 0

  for (const level of investLevels) {
    const increment = level - prevLevel
    if (increment <= 0) continue

    // Count how many players (including folded) invested at least this much
    const contributorsAtLevel = contributors.filter(c => c.totalInvested >= level).length
    const amount = increment * contributorsAtLevel

    // Only non-folded players who invested at least this level are eligible to win
    const eligible = active
      .filter(c => c.totalInvested >= level)
      .map(c => c.id)

    if (amount > 0 && eligible.length > 0) {
      pots.push({ amount, eligible })
    }

    prevLevel = level
  }

  return pots
}

/**
 * Determine winners for each pot and return chip awards.
 * Returns a map of playerId → chips won.
 */
export function awardPots(
  pots: SidePot[],
  players: { id: number; holeCards: [Card, Card] | null }[],
  community: Card[],
  buttonSeat?: number,
): { awards: Map<number, number>; potWinners: { potAmount: number; winnerId: number; winnerName?: string }[] } {
  const awards = new Map<number, number>()
  const potWinners: { potAmount: number; winnerId: number }[] = []

  for (const pot of pots) {
    // Find best hand among eligible players (rank7: integer strength, equal ⇔ tie)
    let bestVal = -1
    let bestId = -1
    const tiedIds: number[] = []

    for (const pid of pot.eligible) {
      const player = players.find(p => p.id === pid)
      if (!player?.holeCards) continue

      const val = rank7([...player.holeCards, ...community])

      if (val > bestVal) {
        bestVal = val
        bestId = pid
        tiedIds.length = 0
        tiedIds.push(pid)
      } else if (val === bestVal) {
        tiedIds.push(pid)
      }
    }

    // Award pot (split if tied)
    if (tiedIds.length > 1) {
      // Odd chip goes to the first tied player clockwise from the button
      // (standard flop-game rule). Without a button, keep ascending-id order.
      const n = players.length
      const orderedIds = buttonSeat === undefined
        ? tiedIds
        : [...tiedIds].sort((a, b) =>
            ((a - buttonSeat - 1 + 2 * n) % n) - ((b - buttonSeat - 1 + 2 * n) % n))
      const share = Math.floor(pot.amount / orderedIds.length)
      const remainder = pot.amount - share * orderedIds.length
      for (let i = 0; i < orderedIds.length; i++) {
        const award = share + (i === 0 ? remainder : 0)
        awards.set(orderedIds[i], (awards.get(orderedIds[i]) || 0) + award)
      }
      potWinners.push({ potAmount: pot.amount, winnerId: orderedIds[0] })
    } else if (bestId >= 0) {
      awards.set(bestId, (awards.get(bestId) || 0) + pot.amount)
      potWinners.push({ potAmount: pot.amount, winnerId: bestId })
    }
  }

  return { awards, potWinners }
}
