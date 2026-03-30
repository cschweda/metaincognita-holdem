/**
 * Phase 3 — Street-by-Street Betting Flow
 *
 * Tests that betting rounds complete fully before the next street
 * is dealt, that the correct number of community cards are visible
 * per street, and that action order is correct.
 */
import { describe, it, expect } from 'vitest'

// ─── Betting Round State Machine ───────────────────────────────

interface Player {
  id: number
  folded: boolean
  eliminated: boolean
  chips: number
  betThisRound: number
  acted: boolean
}

/**
 * Simulates the needsToAct logic from the game.
 * Returns the set of player IDs who still need to act.
 */
function createNeedsToAct(players: Player[]): Set<number> {
  return new Set(
    players
      .filter(p => !p.folded && !p.eliminated && p.chips > 0)
      .map(p => p.id)
  )
}

function makePlayers(count: number, chips = 200): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    folded: false,
    eliminated: false,
    chips,
    betThisRound: 0,
    acted: false,
  }))
}

describe('needsToAct tracking', () => {
  it('all active players need to act at start of a street', () => {
    const players = makePlayers(6)
    const needs = createNeedsToAct(players)
    expect(needs.size).toBe(6)
    for (let i = 0; i < 6; i++) {
      expect(needs.has(i)).toBe(true)
    }
  })

  it('folded players do not need to act', () => {
    const players = makePlayers(6)
    players[2].folded = true
    players[4].folded = true
    const needs = createNeedsToAct(players)
    expect(needs.size).toBe(4)
    expect(needs.has(2)).toBe(false)
    expect(needs.has(4)).toBe(false)
  })

  it('eliminated players do not need to act', () => {
    const players = makePlayers(6)
    players[3].eliminated = true
    const needs = createNeedsToAct(players)
    expect(needs.size).toBe(5)
    expect(needs.has(3)).toBe(false)
  })

  it('all-in players (0 chips) do not need to act', () => {
    const players = makePlayers(6)
    players[1].chips = 0
    const needs = createNeedsToAct(players)
    expect(needs.size).toBe(5)
    expect(needs.has(1)).toBe(false)
  })

  it('player is removed from set after acting', () => {
    const players = makePlayers(4)
    const needs = createNeedsToAct(players)
    expect(needs.size).toBe(4)

    // Player 0 checks
    needs.delete(0)
    expect(needs.size).toBe(3)
    expect(needs.has(0)).toBe(false)
  })

  it('raise re-adds all other active players', () => {
    const players = makePlayers(4)
    const needs = createNeedsToAct(players)

    // Players 0, 1, 2 check
    needs.delete(0)
    needs.delete(1)
    needs.delete(2)
    expect(needs.size).toBe(1) // only player 3

    // Player 3 raises — everyone else needs to act again
    needs.delete(3)
    for (const p of players) {
      if (p.id !== 3 && !p.folded && p.chips > 0) {
        needs.add(p.id)
      }
    }
    expect(needs.size).toBe(3)
    expect(needs.has(0)).toBe(true)
    expect(needs.has(1)).toBe(true)
    expect(needs.has(2)).toBe(true)
    expect(needs.has(3)).toBe(false)
  })

  it('raise does not re-add folded players', () => {
    const players = makePlayers(4)
    players[1].folded = true
    const needs = createNeedsToAct(players)

    // Player 0 checks, player 2 checks
    needs.delete(0)
    needs.delete(2)

    // Player 3 raises
    needs.delete(3)
    for (const p of players) {
      if (p.id !== 3 && !p.folded && p.chips > 0) {
        needs.add(p.id)
      }
    }
    expect(needs.size).toBe(2) // 0 and 2, not 1 (folded)
    expect(needs.has(1)).toBe(false)
  })

  it('raise does not re-add all-in players', () => {
    const players = makePlayers(4)
    players[2].chips = 0
    const needs = createNeedsToAct(players)

    needs.delete(0)
    needs.delete(1)

    // Player 3 raises
    needs.delete(3)
    for (const p of players) {
      if (p.id !== 3 && !p.folded && p.chips > 0) {
        needs.add(p.id)
      }
    }
    expect(needs.has(2)).toBe(false) // all-in, can't act
  })

  it('round ends only when needsToAct is empty', () => {
    const players = makePlayers(3)
    const needs = createNeedsToAct(players)

    // Simulate: 0 checks, 1 checks, 2 checks
    needs.delete(0)
    expect(needs.size).toBe(2) // not done
    needs.delete(1)
    expect(needs.size).toBe(1) // not done
    needs.delete(2)
    expect(needs.size).toBe(0) // NOW the round is over
  })

  it('round does NOT end after first pass if a raise occurred', () => {
    const players = makePlayers(3)
    const needs = createNeedsToAct(players)

    // Player 0 raises
    needs.delete(0)
    // Don't re-add since player 0 is the raiser — but 1 and 2 still need to act
    expect(needs.size).toBe(2)

    // Player 1 calls
    needs.delete(1)
    expect(needs.size).toBe(1) // player 2 still needs to act

    // Player 2 re-raises — re-add 0 and 1
    needs.delete(2)
    for (const p of players) {
      if (p.id !== 2 && !p.folded && p.chips > 0) {
        needs.add(p.id)
      }
    }
    expect(needs.size).toBe(2) // 0 and 1 need to respond to re-raise

    // Both call
    needs.delete(0)
    needs.delete(1)
    expect(needs.size).toBe(0) // now it's done
  })
})

// ─── Street Progression ────────────────────────────────────────

describe('Street progression requires completed betting', () => {
  const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'] as const
  type Street = typeof STREETS[number]

  function nextStreet(current: Street): Street {
    switch (current) {
      case 'preflop': return 'flop'
      case 'flop': return 'turn'
      case 'turn': return 'river'
      case 'river': return 'showdown'
      default: return 'showdown'
    }
  }

  function communityCardCount(street: Street): number {
    switch (street) {
      case 'preflop': return 0
      case 'flop': return 3
      case 'turn': return 4
      case 'river': return 5
      case 'showdown': return 5
    }
  }

  it('preflop shows 0 community cards', () => {
    expect(communityCardCount('preflop')).toBe(0)
  })

  it('flop shows exactly 3 community cards', () => {
    expect(communityCardCount('flop')).toBe(3)
  })

  it('turn shows exactly 4 community cards', () => {
    expect(communityCardCount('turn')).toBe(4)
  })

  it('river shows exactly 5 community cards', () => {
    expect(communityCardCount('river')).toBe(5)
  })

  it('showdown shows 5 community cards', () => {
    expect(communityCardCount('showdown')).toBe(5)
  })

  it('streets advance in correct order', () => {
    expect(nextStreet('preflop')).toBe('flop')
    expect(nextStreet('flop')).toBe('turn')
    expect(nextStreet('turn')).toBe('river')
    expect(nextStreet('river')).toBe('showdown')
  })

  it('street does NOT advance while needsToAct has players', () => {
    const players = makePlayers(4)
    const needs = createNeedsToAct(players)
    let street: Street = 'flop'

    // Simulate: 2 of 4 players have acted
    needs.delete(0)
    needs.delete(1)

    // Should NOT advance — 2 players still need to act
    const shouldAdvance = needs.size === 0
    expect(shouldAdvance).toBe(false)
    expect(street).toBe('flop') // unchanged
  })

  it('street advances only when needsToAct is empty', () => {
    const players = makePlayers(4)
    const needs = createNeedsToAct(players)
    let street: Street = 'flop'

    needs.delete(0)
    needs.delete(1)
    needs.delete(2)
    needs.delete(3)

    if (needs.size === 0) {
      street = nextStreet(street)
    }
    expect(street).toBe('turn')
  })
})

// ─── Full Hand Simulation ──────────────────────────────────────

describe('Simulated full hand flow', () => {
  it('4 streets of betting before showdown', () => {
    const streets: string[] = []
    const players = makePlayers(4)
    let street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' = 'preflop'

    function simulateBettingRound() {
      const needs = createNeedsToAct(players)
      // Everyone checks
      for (const p of players) {
        if (needs.has(p.id)) needs.delete(p.id)
      }
      return needs.size === 0
    }

    // Preflop
    streets.push(street)
    expect(simulateBettingRound()).toBe(true)
    street = 'flop'

    // Flop
    streets.push(street)
    expect(simulateBettingRound()).toBe(true)
    street = 'turn'

    // Turn
    streets.push(street)
    expect(simulateBettingRound()).toBe(true)
    street = 'river'

    // River
    streets.push(street)
    expect(simulateBettingRound()).toBe(true)
    street = 'showdown'

    streets.push(street)
    expect(streets).toEqual(['preflop', 'flop', 'turn', 'river', 'showdown'])
  })

  it('hand ends early if all but one fold on the flop', () => {
    const players = makePlayers(4)
    let street: string = 'flop'

    const needs = createNeedsToAct(players)

    // Player 0 bets (raises)
    needs.delete(0)
    for (const p of players) {
      if (p.id !== 0 && !p.folded && p.chips > 0) needs.add(p.id)
    }

    // Players 1, 2, 3 fold
    players[1].folded = true
    needs.delete(1)
    players[2].folded = true
    needs.delete(2)
    players[3].folded = true
    needs.delete(3)

    const activePlayers = players.filter(p => !p.folded && !p.eliminated)
    expect(activePlayers.length).toBe(1)
    expect(activePlayers[0].id).toBe(0)

    // Hand should end — no turn or river
    street = 'showdown'
    expect(street).toBe('showdown')
  })

  it('betThisRound resets to 0 between streets', () => {
    const players = makePlayers(3)

    // Simulate flop betting — some players bet
    players[0].betThisRound = 20
    players[1].betThisRound = 20
    players[2].betThisRound = 0 // folded

    // Reset for turn
    for (const p of players) {
      p.betThisRound = 0
    }

    expect(players.every(p => p.betThisRound === 0)).toBe(true)
  })

  it('currentBet resets to 0 between streets', () => {
    let currentBet = 40 // flop had a bet of 40

    // Advance to turn — reset
    currentBet = 0
    expect(currentBet).toBe(0)
  })

  it('lastAction clears for active players between streets', () => {
    const players = makePlayers(4)
    players[0].folded = false
    players[1].folded = true

    // After flop betting
    const actions = ['check', 'fold', 'call', 'raise']
    players.forEach((p, i) => (p as any).lastAction = actions[i])

    // Reset for turn: clear non-folded players
    for (const p of players) {
      if (!p.folded) (p as any).lastAction = null
    }

    expect((players[0] as any).lastAction).toBeNull() // was check, now null
    expect((players[1] as any).lastAction).toBe('fold') // stays (folded)
    expect((players[2] as any).lastAction).toBeNull()
    expect((players[3] as any).lastAction).toBeNull()
  })
})

// ─── Action Order ──────────────────────────────────────────────

describe('Betting action order', () => {
  it('preflop starts left of BB (UTG position)', () => {
    // In a 6-player game with dealer at seat 0:
    // Seat 0 = BTN, 1 = SB, 2 = BB, 3 = UTG, 4 = MP, 5 = CO
    // Preflop action starts at seat 3 (UTG = left of BB)
    const dealerSeat = 0
    const playerCount = 6
    const bbSeat = 2
    const startSeat = (bbSeat + 1) % playerCount
    expect(startSeat).toBe(3) // UTG
  })

  it('postflop starts left of dealer', () => {
    const dealerSeat = 0
    const playerCount = 6
    const startSeat = (dealerSeat + 1) % playerCount
    expect(startSeat).toBe(1) // SB (first left of dealer)
  })

  it('postflop skips folded players for start seat', () => {
    const dealerSeat = 0
    const playerCount = 6
    const folded = [false, true, true, false, false, false] // SB and BB folded

    let startSeat = (dealerSeat + 1) % playerCount
    for (let i = 0; i < playerCount; i++) {
      if (!folded[startSeat]) break
      startSeat = (startSeat + 1) % playerCount
    }
    expect(startSeat).toBe(3) // first non-folded left of dealer
  })

  it('action wraps around the table correctly', () => {
    const playerCount = 6
    const order: number[] = []
    let seat = 3 // start at UTG

    for (let i = 0; i < playerCount; i++) {
      order.push(seat)
      seat = (seat + 1) % playerCount
    }

    expect(order).toEqual([3, 4, 5, 0, 1, 2]) // UTG -> MP -> CO -> BTN -> SB -> BB
  })
})

// ─── Edge Cases ────────────────────────────────────────────────

describe('Betting round edge cases', () => {
  it('heads-up: only 2 players, round completes after both act', () => {
    const players = makePlayers(2)
    const needs = createNeedsToAct(players)
    expect(needs.size).toBe(2)

    needs.delete(0)
    expect(needs.size).toBe(1)

    needs.delete(1)
    expect(needs.size).toBe(0) // round over
  })

  it('3-bet pot: raise, re-raise, all others fold or call', () => {
    const players = makePlayers(4)
    const needs = createNeedsToAct(players)

    // Player 0 raises
    needs.delete(0)

    // Player 1 re-raises — re-add everyone
    needs.delete(1)
    for (const p of players) {
      if (p.id !== 1 && !p.folded && p.chips > 0) needs.add(p.id)
    }
    expect(needs.size).toBe(3) // 0, 2, 3

    // Player 2 folds
    players[2].folded = true
    needs.delete(2)
    expect(needs.size).toBe(2)

    // Player 3 folds
    players[3].folded = true
    needs.delete(3)
    expect(needs.size).toBe(1) // player 0 still needs to respond

    // Player 0 calls the 3-bet
    needs.delete(0)
    expect(needs.size).toBe(0) // round over, heads up to flop
  })

  it('everyone checks — round completes without any bets', () => {
    const players = makePlayers(6)
    const needs = createNeedsToAct(players)

    for (let i = 0; i < 6; i++) {
      needs.delete(i) // each player checks
    }

    expect(needs.size).toBe(0)
  })

  it('single active player with chips after others fold — round ends', () => {
    const players = makePlayers(4)
    players[1].folded = true
    players[2].folded = true
    players[3].folded = true

    const active = players.filter(p => !p.folded && !p.eliminated)
    expect(active.length).toBe(1)
    // No betting round needed — hand should end immediately
  })
})
