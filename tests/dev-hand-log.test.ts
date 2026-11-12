/**
 * The console hand log runs in every build. Its per-decision line prints
 * while the hand is live, so it must never carry a bot's hole cards — an
 * open console would otherwise show the whole table. The end-of-hand dump,
 * printed after the hand is decided, may.
 *
 * Also here: two config leftovers from the removed Supabase backend.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logDecision, renderHand } from '../app/utils/devHandLog'
import type { DecisionLogInput } from '../app/utils/devHandLog'
import type { PlayerState } from '../app/composables/useGameState'
import type { Card } from '../app/utils/cards'
import config from '../holdem.config'

const AS: Card = { rank: 14, suit: 'spades' }
const KD: Card = { rank: 13, suit: 'diamonds' }
const QH: Card = { rank: 12, suit: 'hearts' }

const decision = (over: Partial<DecisionLogInput>): DecisionLogInput => ({
  street: 'flop', name: 'Wild Wendy', position: 'CO', isHero: false,
  holeCards: [AS, KD], board: [QH, { rank: 7, suit: 'clubs' }, { rank: 2, suit: 'clubs' }],
  chipsBefore: 200, chipsAfter: 180, pot: 30, toCall: 0, bb: 2,
  action: 'raise', amount: 20, raiseTo: 20, isAllIn: false, tiltSeverity: 0,
  ...over,
})

describe('per-decision console line', () => {
  // The log is opt-in; these describe what it prints once switched on.
  beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => 'on', setItem: () => {}, removeItem: () => {} }))
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('does not print a bot\'s hole cards during the hand', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    logDecision(decision({}))
    const line = String(log.mock.calls[0]![0])
    expect(line).toContain('Wild Wendy')
    expect(line).not.toContain('A♠')
    expect(line).not.toContain('K♦')
    // the board is public and stays
    expect(line).toContain('Q♥')
  })

  it('still prints the hero\'s own cards', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    logDecision(decision({ name: 'Hero', isHero: true }))
    const line = String(log.mock.calls[0]![0])
    expect(line).toContain('A♠')
    expect(line).toContain('K♦')
  })

  it('the end-of-hand dump keeps every hand', () => {
    const bot: PlayerState = {
      id: 1, name: 'Wild Wendy', chips: 180, holeCards: [AS, KD], folded: false, eliminated: false,
      isHero: false, lastAction: null, currentBetAmount: 0, betThisRound: 0, totalInvested: 20,
      tilt: { tilted: false, severity: 0, handsRemaining: 0 } as PlayerState['tilt'], tiltMultiplier: 1,
    }
    const text = renderHand({
      handNumber: 1, players: [bot], positions: ['BTN', 'CO'], community: [], pot: 40,
      winnerName: 'Wild Wendy', winnerId: 1, actionLog: [], bb: 2, sb: 1,
    })
    expect(text).toContain('A♠ K♦')
  })

  it('the file header no longer claims both that cards are never printed mid-hand and that they are', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'app', 'utils', 'devHandLog.ts'), 'utf8')
    expect(src).not.toMatch(/prints a bot's hole cards at the moment it acts/)
    expect(src).not.toMatch(/only from the hand-end handler/)
  })
})

describe('config leftovers', () => {
  it('has no unused storage key', () => {
    expect(config).not.toHaveProperty('storage')
  })

  it('does not mention Supabase', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'holdem.config.ts'), 'utf8')
    expect(src).not.toMatch(/supabase/i)
  })
})

describe('the console log is opt-in', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
  const withSwitch = (value: string | null) =>
    vi.stubGlobal('localStorage', { getItem: () => value, setItem: () => {}, removeItem: () => {} })

  it('prints nothing by default', () => {
    withSwitch(null)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    logDecision(decision({ isHero: true }))
    expect(log).not.toHaveBeenCalled()
  })
  it('prints once switched on', () => {
    withSwitch('on')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    logDecision(decision({ isHero: true }))
    expect(log).toHaveBeenCalledTimes(1)
  })
})
