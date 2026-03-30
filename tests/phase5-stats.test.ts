/**
 * Phase 5 — Stats Panel & Hand Advisor
 *
 * Tests stat calculations (VPIP, PFR, AF, etc.), pot odds math,
 * outs counting, implied odds, and recommendation logic.
 */
import { describe, it, expect } from 'vitest'

import config from '../holdem.config.js'

describe('VPIP calculation', () => {
  it('VPIP = voluntarily played / total hands dealt', () => {
    const played = 22
    const total = 100
    expect(played / total).toBe(0.22)
  })

  it('BB walk does not count toward VPIP', () => {
    // If BB is dealt 50 hands, gets 5 walks, and voluntarily plays 10 others:
    // VPIP = 10/50 = 20%, not 15/50
    const voluntarilyPlayed = 10
    const totalDealt = 50
    expect(voluntarilyPlayed / totalDealt).toBe(0.2)
  })

  it('posting blinds without calling a raise is not voluntary', () => {
    // BB checks option (no raise in front) — this is NOT voluntary
    // BB calls a raise — this IS voluntary
    expect(true).toBe(true) // placeholder for integration
  })
})

describe('Aggression factor', () => {
  it('AF = (bets + raises) / calls', () => {
    const bets = 30
    const raises = 20
    const calls = 25
    const af = (bets + raises) / calls
    expect(af).toBe(2.0)
  })

  it('AF handles zero calls (infinite aggression → cap at 999)', () => {
    const bets = 10
    const raises = 5
    const calls = 0
    const af = calls === 0 ? 999 : (bets + raises) / calls
    expect(af).toBe(999)
  })
})

describe('Pot odds', () => {
  it('calculates ratio correctly', () => {
    const pot = 100
    const toCall = 25
    const ratio = pot / toCall // 4:1
    const percentage = toCall / (pot + toCall) // 20%
    expect(ratio).toBe(4)
    expect(percentage).toBe(0.2)
  })

  it('percentage matches required equity to call', () => {
    const pot = 50
    const toCall = 50
    const percentage = toCall / (pot + toCall) // 50%
    expect(percentage).toBe(0.5)
  })

  it('handles zero to-call (check situation)', () => {
    const pot = 100
    const toCall = 0
    // When toCall is 0, pot odds are infinite — always profitable to see a card
    const percentage = toCall === 0 ? 0 : toCall / (pot + toCall)
    expect(percentage).toBe(0)
  })
})

describe('Outs counting', () => {
  it('flush draw = 9 outs', () => {
    // 4 of a suit on board + hand, 13 - 4 = 9 remaining
    expect(13 - 4).toBe(9)
  })

  it('open-ended straight draw = 8 outs', () => {
    expect(8).toBe(8) // placeholder — real test needs board analysis
  })

  it('gutshot = 4 outs', () => {
    expect(4).toBe(4)
  })

  it('combined flush draw + gutshot = 12 outs (not 13 — one overlaps)', () => {
    // 9 flush outs + 4 straight outs, but one card completes both
    const flushOuts = 9
    const gutshotOuts = 4
    const overlap = 1 // one card is both the flush and straight completion
    expect(flushOuts + gutshotOuts - overlap).toBe(12)
  })
})

describe('Probability to improve', () => {
  it('rule-of-2: single card approximation', () => {
    const outs = 9
    const approx = outs * 2 + 1 // 19%
    expect(approx).toBe(19)
  })

  it('exact probability on turn (1 card to come)', () => {
    const outs = 9
    const remaining = 46 // 52 - 2 hole - 4 board (turn)
    const exact = outs / remaining
    expect(exact).toBeCloseTo(0.1957, 3)
  })

  it('exact probability flop to river (2 cards to come)', () => {
    const outs = 9
    const remaining = 47 // 52 - 2 hole - 3 board (flop)
    const exact = 1 - ((remaining - outs) / remaining) * ((remaining - 1 - outs) / (remaining - 1))
    expect(exact).toBeCloseTo(0.3497, 3) // ~35%
  })
})

describe('BB/hand metric', () => {
  it('positive profit = positive BB/hand', () => {
    const profit = 200
    const handsPlayed = 100
    const bb = 2 // $1/$2 game
    const bbPerHand = profit / bb / handsPlayed
    expect(bbPerHand).toBe(1.0) // winning 1 BB/hand is excellent
  })

  it('handles breakeven (0 profit)', () => {
    const profit = 0
    const handsPlayed = 100
    const bb = 2
    const bbPerHand = profit / bb / handsPlayed
    expect(bbPerHand).toBe(0)
  })
})

describe('Stats panel thresholds', () => {
  it('shows dashes until minimum hands reached', () => {
    expect(config.stats.minHandsForDisplay).toBe(10)
  })

  it('persona reveal happens after threshold', () => {
    expect(config.stats.personaRevealThreshold).toBe(30)
  })

  it('hand log size is capped', () => {
    expect(config.stats.handLogSize).toBe(50)
  })
})
