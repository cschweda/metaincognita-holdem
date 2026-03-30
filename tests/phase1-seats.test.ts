/**
 * Phase 1 — Seat Layout & Position Labels
 *
 * Tests that seat positions are correctly assigned for all table sizes (2–8)
 * and that position labels match standard poker conventions.
 */
import { describe, it, expect } from 'vitest'

// These will import from actual modules once built.
// For now, define the expected contract so tests are ready to wire up.

// Placeholder: replace with actual import
// import { assignPositions } from '~/utils/seats'

/**
 * Given a player count and dealer seat index, returns an array of position labels.
 * Positions go clockwise from the dealer: D, SB, BB, then remaining seats.
 */
function assignPositions(playerCount: number, dealerSeat: number): string[] {
  // Stub — replace with real implementation
  throw new Error('Not implemented — wire up to ~/utils/seats.ts')
}

describe('Seat positions — heads-up (2 players)', () => {
  it('dealer is SB, other player is BB', () => {
    const positions = assignPositions(2, 0)
    expect(positions).toEqual(['D/SB', 'BB'])
  })

  it('works when dealer is seat 1', () => {
    const positions = assignPositions(2, 1)
    expect(positions).toEqual(['BB', 'D/SB'])
  })
})

describe('Seat positions — 3 players', () => {
  it('assigns D/BTN, SB, BB', () => {
    const positions = assignPositions(3, 0)
    expect(positions).toEqual(['D/BTN', 'SB', 'BB'])
  })
})

describe('Seat positions — 4 players', () => {
  it('assigns D/BTN, SB, BB, UTG (no CO)', () => {
    const positions = assignPositions(4, 0)
    expect(positions).toEqual(['D/BTN', 'SB', 'BB', 'UTG'])
  })
})

describe('Seat positions — 5 players', () => {
  it('assigns D, SB, BB, UTG, CO', () => {
    const positions = assignPositions(5, 0)
    expect(positions).toEqual(['D', 'SB', 'BB', 'UTG', 'CO'])
  })
})

describe('Seat positions — 6 players', () => {
  it('assigns full position names', () => {
    const positions = assignPositions(6, 0)
    expect(positions).toEqual(['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'])
  })
})

describe('Seat positions — 7 players', () => {
  it('assigns full position names with UTG+1', () => {
    const positions = assignPositions(7, 0)
    expect(positions).toEqual(['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'CO'])
  })
})

describe('Seat positions — 8 players', () => {
  it('assigns full position names with UTG+1, MP+1', () => {
    const positions = assignPositions(8, 0)
    expect(positions).toEqual(['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'CO'])
  })
})

describe('Dealer rotation', () => {
  it('positions rotate correctly when dealer moves', () => {
    // Dealer at seat 2 in a 6-player game
    const positions = assignPositions(6, 2)
    // Seat 2 = BTN, seat 3 = SB, seat 4 = BB, seat 5 = UTG, seat 0 = MP, seat 1 = CO
    expect(positions[2]).toBe('BTN')
    expect(positions[3]).toBe('SB')
    expect(positions[4]).toBe('BB')
    expect(positions[5]).toBe('UTG')
    expect(positions[0]).toBe('MP')
    expect(positions[1]).toBe('CO')
  })
})
