/**
 * Table reads: a rolling window of public table-wide signals (bets, checks,
 * flops seen, showdowns) → three booleans the bots may act on. Thresholds
 * sit outside the measured range of a normal pro table (passivity
 * 0.41–0.56, showdown-per-flop 0.42–0.71 over 30-hand windows).
 */
import { describe, it, expect } from 'vitest'
import { createTableReadState, noteTableAction, finishTableHand, readTable, tableReadStats } from '../app/utils/tableReads'
import config from '../holdem.config'

const cfg = config.strategy.tableReads

function play(state: ReturnType<typeof createTableReadState>, hands: number, per: { bets: number; checks: number; sawFlop: boolean; showdown: boolean }) {
  for (let i = 0; i < hands; i++) {
    for (let b = 0; b < per.bets; b++) noteTableAction(state, 'bet')
    for (let c = 0; c < per.checks; c++) noteTableAction(state, 'check')
    finishTableHand(state, { sawFlop: per.sawFlop, showdown: per.showdown }, cfg.windowHands)
  }
}

describe('tableReads tracker', () => {
  it('is silent below minHands', () => {
    const s = createTableReadState()
    play(s, cfg.minHands - 1, { bets: 1, checks: 9, sawFlop: true, showdown: true })
    expect(readTable(s, cfg)).toBeUndefined()
  })

  it('keeps only the last windowHands hands', () => {
    const s = createTableReadState()
    play(s, cfg.windowHands, { bets: 9, checks: 1, sawFlop: true, showdown: false })   // aggressive early
    play(s, cfg.windowHands, { bets: 1, checks: 9, sawFlop: true, showdown: true })    // then a station table
    expect(s.hands).toHaveLength(cfg.windowHands)
    expect(readTable(s, cfg)).toEqual({ passive: true, showdownHeavy: true, showdownLight: false })
  })

  it('a normal pro table produces no read', () => {
    // showdown-per-flop 1.0 would trip showdownHeavy; mix in flops without showdown
    const t = createTableReadState()
    for (let i = 0; i < 30; i++) {
      noteTableAction(t, 'bet'); noteTableAction(t, 'check')
      finishTableHand(t, { sawFlop: true, showdown: i % 2 === 0 }, cfg.windowHands)   // 0.50 showdown-per-flop
    }
    expect(readTable(t, cfg)).toEqual({ passive: false, showdownHeavy: false, showdownLight: false })
  })

  it('passivity counts only bets and checks, and flags a check-heavy table', () => {
    const s = createTableReadState()
    play(s, 12, { bets: 3, checks: 7, sawFlop: true, showdown: false })   // 0.70 ≥ passiveAt
    expect(tableReadStats(s).passivity).toBeCloseTo(0.7, 2)
    expect(readTable(s, cfg)!.passive).toBe(true)
  })

  it('showdown-per-flop ignores hands that never saw a flop', () => {
    const s = createTableReadState()
    play(s, 10, { bets: 1, checks: 1, sawFlop: false, showdown: false })  // preflop fold-outs
    play(s, 10, { bets: 1, checks: 1, sawFlop: true, showdown: true })    // every flop → showdown
    expect(tableReadStats(s).showdownPerFlop).toBe(1)
    expect(readTable(s, cfg)!.showdownHeavy).toBe(true)
  })

  it('flags a weak-tight table (flops seen, few showdowns)', () => {
    const s = createTableReadState()
    play(s, 20, { bets: 2, checks: 8, sawFlop: true, showdown: false })   // 0.0 showdown-per-flop, passive
    expect(readTable(s, cfg)).toEqual({ passive: true, showdownHeavy: false, showdownLight: true })
  })

  it('showdown reads stay off until minFlops flops are in the window', () => {
    const s = createTableReadState()
    // 8 no-flop hands (preflop fold-outs) pad past minHands and keep
    // passivity high without touching the flop count.
    play(s, 8, { bets: 2, checks: 8, sawFlop: false, showdown: false })
    // 3 flops, every one reaching showdown — the raw ratio would trip
    // showdownHeavy, but 3 < minFlops (5).
    play(s, 3, { bets: 0, checks: 0, sawFlop: true, showdown: true })
    expect(tableReadStats(s).showdownPerFlop).toBe(1) // sanity: the raw ratio would fire
    expect(readTable(s, cfg)).toEqual({ passive: true, showdownHeavy: false, showdownLight: false })
  })

  it('config thresholds sit outside the normal-table range', () => {
    expect(cfg.passiveAt).toBeGreaterThan(0.56)
    expect(cfg.showdownHeavyAt).toBeGreaterThan(0.71)
    expect(cfg.showdownLightAt).toBeLessThan(0.42)
  })
})
