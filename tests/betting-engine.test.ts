/**
 * Contract tests for the shared no-limit betting rules module.
 * These rules were extracted from the live engine (the audited copy):
 * min-raise enforcement, the half-raise rule, and skip-guard termination.
 */
import { describe, it, expect } from 'vitest'
import { startBettingRound, applyEngineAction, runBettingRound } from '../app/utils/bettingEngine'
import type { BettingRound, EnginePlayer } from '../app/utils/bettingEngine'

function mkRound(chips: number[], currentBet = 0, bb = 2): BettingRound {
  const players: EnginePlayer[] = chips.map((c, i) => ({
    id: i, chips: c, betThisRound: 0, totalInvested: 0, folded: false,
  }))
  return { players, currentBet, lastRaiseIncrement: bb, pot: 0, bb, needsToAct: new Set() }
}

describe('applyEngineAction rules', () => {
  it('clamps a sub-min raise up to the minimum', () => {
    const r = mkRound([200, 200], 10)
    r.lastRaiseIncrement = 8 // prior raise 2 → 10, so min raise-to is 18
    startBettingRound(r)
    const res = applyEngineAction(r, 0, { type: 'raise', amount: 12 })
    expect(r.players[0]!.betThisRound).toBe(18)
    expect(res.reopened).toBe(true)
    expect(r.lastRaiseIncrement).toBe(8)
  })

  it('short all-in below min-raise does NOT reopen action', () => {
    const r = mkRound([200, 14, 200], 10)
    r.lastRaiseIncrement = 8
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'call' })
    const res = applyEngineAction(r, 1, { type: 'raise', amount: 14 }) // all-in, min was 18
    expect(res.isAllIn).toBe(true)
    expect(res.reopened).toBe(false)
    expect(r.currentBet).toBe(14)
    // player 0 already acted at bet 10; incomplete raise must not re-add them
    expect(r.needsToAct.has(0)).toBe(false)
    expect(r.needsToAct.has(2)).toBe(true) // hasn't acted yet this round
    // half-raise rule: incomplete raise does not reset the raise increment
    expect(r.lastRaiseIncrement).toBe(8)
  })

  it('full raise reopens everyone else with chips', () => {
    const r = mkRound([200, 200, 200], 10)
    r.lastRaiseIncrement = 8
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'call' })
    const res = applyEngineAction(r, 1, { type: 'raise', amount: 30 })
    expect(res.reopened).toBe(true)
    expect(r.needsToAct.has(0)).toBe(true)
    expect(r.lastRaiseIncrement).toBe(20)
  })

  it('opening bet on a fresh street has a BB minimum', () => {
    const r = mkRound([200, 200], 0)
    startBettingRound(r)
    const res = applyEngineAction(r, 0, { type: 'raise', amount: 1 }) // below bb=2
    expect(r.players[0]!.betThisRound).toBe(2)
    expect(res.reopened).toBe(true)
  })

  it('call is clamped to stack (all-in call)', () => {
    const r = mkRound([5, 200], 10)
    startBettingRound(r)
    const res = applyEngineAction(r, 0, { type: 'call' })
    expect(res.amount).toBe(5)
    expect(res.isAllIn).toBe(true)
    expect(r.pot).toBe(5)
  })

  it('fold removes the player from the hand and from needsToAct', () => {
    const r = mkRound([200, 200], 10)
    startBettingRound(r)
    const res = applyEngineAction(r, 0, { type: 'fold' })
    expect(res.type).toBe('fold')
    expect(r.players[0]!.folded).toBe(true)
    expect(r.needsToAct.has(0)).toBe(false)
  })
})

describe('runBettingRound', () => {
  it('multi-raise war terminates only when action is closed (no lap cap)', () => {
    const r = mkRound([10000, 10000], 0)
    startBettingRound(r)
    let raises = 0
    runBettingRound(r, 0, (p, round) => {
      const toCall = round.currentBet - p.betThisRound
      if (raises < 20) {
        raises++
        return { type: 'raise', amount: round.currentBet + Math.max(round.lastRaiseIncrement, round.bb) }
      }
      return toCall > 0 ? { type: 'call' } : { type: 'check' }
    })
    expect(raises).toBe(20) // old count*4 cap would have truncated at 8
    expect(r.needsToAct.size).toBe(0)
    const [a, b] = r.players
    expect(a!.betThisRound).toBe(b!.betThisRound)
  })

  it('skip-guard exits a stuck round (stale needsToAct, nobody can act)', () => {
    const r = mkRound([0, 0], 0)
    r.needsToAct = new Set([0, 1]) // stale entries; nobody has chips
    let calls = 0
    runBettingRound(r, 0, () => { calls++; return { type: 'check' } })
    expect(calls).toBe(0)
  })

  it('round ends immediately when only one player remains in hand', () => {
    const r = mkRound([200, 200, 200], 0)
    r.players[1]!.folded = true
    r.players[2]!.folded = true
    startBettingRound(r)
    let calls = 0
    runBettingRound(r, 0, () => { calls++; return { type: 'check' } })
    expect(calls).toBe(0)
  })

  it('onApplied hook sees every applied action with its result', () => {
    const r = mkRound([200, 200], 0)
    startBettingRound(r)
    const log: string[] = []
    runBettingRound(r, 0, (p, round) => {
      return round.currentBet - p.betThisRound > 0 ? { type: 'call' } : { type: 'check' }
    }, (p, _a, result) => {
      log.push(`${p.id}:${result.type}`)
    })
    expect(log).toEqual(['0:check', '1:check'])
  })
})
