/**
 * Observed opponent stats — computed from the session's recorded hands
 * (action log + end-of-hand player status), never from persona config.
 */
import { describe, it, expect } from 'vitest'
import { computeObservedStats, wentToShowdown } from '../app/utils/observedStats'
import type { HandRecord, PlayerHand } from '../app/composables/useSessionStats'

const pl = (name: string, folded = false, isHero = false): PlayerHand =>
  ({ name, position: 'BTN', holeCards: 'Ah Kd', folded, isHero })

const rec = (o: { board?: string; players: PlayerHand[]; actions: string[]; result?: HandRecord['result'] }): HandRecord => ({
  handNumber: 1, holeCards: 'Ah Kd', board: o.board ?? '', result: o.result ?? 'lost', profit: 0,
  position: 'BTN', potSize: 10, actions: o.actions, players: o.players,
})

const FLOP = '--- FLOP: As Td 7c ---'
const TURN = '--- TURN: 2h ---'
const RIVER = '--- RIVER: 9s ---'

describe('computeObservedStats', () => {
  it('VPIP counts a preflop call or raise, not a big-blind check-through', () => {
    const hands = [
      rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Ann calls $2', 'Hero checks', FLOP, 'Hero checks', 'Ann checks'] }),
      rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Hero calls $2', 'Ann checks', FLOP, 'Ann checks', 'Hero checks'] }),
    ]
    expect(computeObservedStats(hands).get('Ann')!.vpip).toBe(50)
  })

  it('a postflop call is not VPIP', () => {
    const hands = [rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Hero calls $2', 'Ann checks', FLOP, 'Hero raises to $5', 'Ann calls $5'] })]
    expect(computeObservedStats(hands).get('Ann')!.vpip).toBe(0)
  })

  it('PFR counts only preflop raises', () => {
    const hands = [
      rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Ann raises to $6', 'Hero calls $6', FLOP] }),
      rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Ann calls $2', 'Hero checks', FLOP, 'Ann raises to $4'] }),
    ]
    const ann = computeObservedStats(hands).get('Ann')!
    expect(ann.pfr).toBe(50)
    expect(ann.vpip).toBe(100)
  })

  it('an all-in counts as a raise', () => {
    const hands = [rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Ann goes ALL-IN $200', 'Hero folds'] })]
    expect(computeObservedStats(hands).get('Ann')!.pfr).toBe(100)
  })

  it('aggression factor is (bets + raises) / calls across all streets', () => {
    const hands = [rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Ann raises to $6', 'Hero raises to $18', 'Ann calls $18', FLOP, 'Hero checks', 'Ann raises to $20'] })]
    expect(computeObservedStats(hands).get('Ann')!.af).toBe(2)
  })

  it('aggression factor with no calls is capped, not infinite', () => {
    const hands = [rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Ann raises to $6', 'Hero folds'] })]
    expect(computeObservedStats(hands).get('Ann')!.af).toBe(5)
  })

  it('WTSD is showdowns over flops seen', () => {
    const hands = [
      rec({ board: 'As Td 7c 2h 9s', players: [pl('Hero', false, true), pl('Ann')], actions: ['Ann calls $2', 'Hero checks', FLOP, 'Hero checks', 'Ann checks', TURN, 'Hero checks', 'Ann checks', RIVER, 'Hero checks', 'Ann checks'] }),
      rec({ board: 'As Td 7c', players: [pl('Hero', false, true), pl('Ann', true)], actions: ['Ann calls $2', 'Hero checks', FLOP, 'Hero raises to $4', 'Ann folds'] }),
      rec({ board: '', players: [pl('Hero', false, true), pl('Ann', true)], actions: ['Hero raises to $6', 'Ann folds'] }),
    ]
    expect(computeObservedStats(hands).get('Ann')!.wtsd).toBe(50)
  })

  it('handsPlayed counts every hand the player was dealt into', () => {
    const hands = [
      rec({ players: [pl('Hero', false, true), pl('Ann', true)], actions: ['Hero raises to $6', 'Ann folds'] }),
      rec({ players: [pl('Hero', false, true), pl('Bob', true)], actions: ['Hero raises to $6', 'Bob folds'] }),
    ]
    const stats = computeObservedStats(hands)
    expect(stats.get('Ann')!.handsPlayed).toBe(1)
    expect(stats.get('Bob')!.handsPlayed).toBe(1)
  })

  it('a name that is a prefix of another name does not absorb its actions', () => {
    const hands = [rec({ players: [pl('Hero', false, true), pl('Ann'), pl('Ann Smith')], actions: ['Ann Smith raises to $6', 'Ann folds', 'Hero folds'] })]
    const stats = computeObservedStats(hands)
    expect(stats.get('Ann')!.pfr).toBe(0)
    expect(stats.get('Ann Smith')!.pfr).toBe(100)
  })

  it('the hero is not included', () => {
    const hands = [rec({ players: [pl('Hero', false, true), pl('Ann')], actions: ['Ann calls $2', 'Hero checks'] })]
    expect(computeObservedStats(hands).has('Hero')).toBe(false)
  })
})

describe('wentToShowdown', () => {
  it('is false when the pot was uncontested', () => {
    expect(wentToShowdown({ board: 'As Td 7c 2h 9s', players: [pl('Hero', false, true), pl('Ann', true)] })).toBe(false)
  })

  it('is false when the board never reached the river', () => {
    expect(wentToShowdown({ board: 'As Td 7c', players: [pl('Hero', false, true), pl('Ann')] })).toBe(false)
  })

  it('is true with a full board and two or more unfolded players', () => {
    expect(wentToShowdown({ board: 'As Td 7c 2h 9s', players: [pl('Hero', false, true), pl('Ann')] })).toBe(true)
  })

  it('tolerates missing data', () => {
    expect(wentToShowdown({ board: null, players: null })).toBe(false)
  })
})
