/**
 * Regression tests for the five engine defects found in the 2026-11-11 review.
 * Each one moved real chips wrongly at the live table:
 *
 *  1. Side pots dropped a folded player's chips when they sat below a pot level.
 *  2. A player with chips was never asked to answer an all-in when they were
 *     the only one left with chips (the "all-in runout" guard fired too early).
 *  3. A short all-in raise never had to be called by players who had already
 *     acted — they saw the showdown for less than the all-in player put in.
 *  4. Busted bots kept their seat in the position rotation and posted blinds.
 *  5. The All-In button sent the hero's remaining stack as a raise-TO amount,
 *     leaving the chips already in front of them behind.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { ref, computed, watch } from 'vue'
import { mount } from '@vue/test-utils'
import { calculateSidePots } from '../app/utils/sidePots'
import { startBettingRound, applyEngineAction } from '../app/utils/bettingEngine'
import type { BettingRound, EnginePlayer } from '../app/utils/bettingEngine'
import { assignLivePositions, nextLiveSeat } from '../app/utils/seats'

// Nuxt auto-imports these; the composables and components reference them bare.
Object.assign(globalThis, { ref, computed, watch })

const potTotal = (c: { totalInvested: number; folded: boolean }[]) =>
  calculateSidePots(c.map((x, id) => ({ id, holeCards: null, ...x })))
    .reduce((s, p) => s + p.amount, 0)

describe('1. side pots conserve every chip invested', () => {
  it('keeps a folded blind that is smaller than the main-pot level', () => {
    expect(potTotal([
      { totalInvested: 100, folded: false },
      { totalInvested: 100, folded: false },
      { totalInvested: 2, folded: true },
    ])).toBe(202)
  })

  it('keeps several folded contributions of different sizes', () => {
    expect(potTotal([
      { totalInvested: 50, folded: false },
      { totalInvested: 50, folded: false },
      { totalInvested: 5, folded: true },
      { totalInvested: 1, folded: true },
    ])).toBe(106)
  })

  it('keeps a folded contribution larger than every live stack', () => {
    expect(potTotal([
      { totalInvested: 100, folded: false },
      { totalInvested: 100, folded: false },
      { totalInvested: 150, folded: true },
    ])).toBe(350)
  })

  it('splits folded money across the levels it reaches', () => {
    // A all-in 40, B and C in for 100, D folded after putting in 60.
    const pots = calculateSidePots([
      { id: 0, totalInvested: 40, folded: false, holeCards: null },
      { id: 1, totalInvested: 100, folded: false, holeCards: null },
      { id: 2, totalInvested: 100, folded: false, holeCards: null },
      { id: 3, totalInvested: 60, folded: true, holeCards: null },
    ])
    expect(pots).toEqual([
      { amount: 160, eligible: [0, 1, 2] }, // 40 × 4
      { amount: 140, eligible: [1, 2] }, //   60 + 60 + D's remaining 20
    ])
  })
})

function mkRound(chips: number[], currentBet = 0, bb = 2): BettingRound {
  const players: EnginePlayer[] = chips.map((c, i) => ({
    id: i, chips: c, betThisRound: 0, totalInvested: 0, folded: false,
  }))
  return { players, currentBet, lastRaiseIncrement: bb, pot: 0, bb, needsToAct: new Set() }
}

describe('3. a short all-in raise must still be called', () => {
  function shortAllIn() {
    // P0 bets 100, P1 calls, P2 is all-in for 150 (min raise would be 200).
    const r = mkRound([1000, 1000, 150])
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'raise', amount: 100 })
    applyEngineAction(r, 1, { type: 'call' })
    const res = applyEngineAction(r, 2, { type: 'raise', amount: 150 })
    return { r, res }
  }

  it('puts players who owe the difference back on the clock', () => {
    const { r, res } = shortAllIn()
    expect(res.reopened).toBe(false) // betting is not reopened…
    expect([...r.needsToAct].sort()).toEqual([0, 1]) // …but the 50 is owed
  })

  it('lets them call the difference', () => {
    const { r } = shortAllIn()
    applyEngineAction(r, 0, { type: 'call' })
    applyEngineAction(r, 1, { type: 'call' })
    expect(r.players.map(p => p.totalInvested)).toEqual([150, 150, 150])
    expect(r.needsToAct.size).toBe(0)
  })

  it('does not let a player who already acted re-raise', () => {
    const { r } = shortAllIn()
    const res = applyEngineAction(r, 0, { type: 'raise', amount: 600 })
    expect(res.type).toBe('call')
    expect(r.players[0]!.betThisRound).toBe(150)
    expect(r.currentBet).toBe(150)
  })

  it('still lets a player who has not acted yet raise', () => {
    // P0 bets 100, P1 all-in short for 150, P2 has not acted: full options.
    const r = mkRound([1000, 150, 1000])
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'raise', amount: 100 })
    applyEngineAction(r, 1, { type: 'raise', amount: 150 })
    const res = applyEngineAction(r, 2, { type: 'raise', amount: 400 })
    expect(res.type).toBe('raise')
    expect(r.currentBet).toBe(400)
  })

  it('a later full raise lifts the restriction', () => {
    const r = mkRound([1000, 150, 1000])
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'raise', amount: 100 })
    applyEngineAction(r, 1, { type: 'raise', amount: 150 })
    applyEngineAction(r, 2, { type: 'raise', amount: 400 })
    const res = applyEngineAction(r, 0, { type: 'raise', amount: 900 })
    expect(res.type).toBe('raise')
  })
})

describe('2. who has to act when a street starts', () => {
  it('nobody, when a lone stack faces only all-in players it has covered', () => {
    const r = mkRound([500, 0, 0])
    startBettingRound(r)
    expect(r.needsToAct.size).toBe(0)
  })

  it('the lone stack, when an all-in blind is bigger than its own bet', () => {
    // Heads-up: BB is all-in posting 2, SB has posted 1 and still owes 1.
    const r = mkRound([199, 0], 2)
    r.players[0]!.betThisRound = 1
    r.players[1]!.betThisRound = 2
    startBettingRound(r)
    expect([...r.needsToAct]).toEqual([0])
  })
})

describe('2. live table: an all-in is answered', () => {
  let useGameState: typeof import('../app/composables/useGameState').useGameState
  let useGameEngine: typeof import('../app/composables/useGameEngine').useGameEngine
  beforeAll(async () => {
    useGameState = (await import('../app/composables/useGameState')).useGameState
    useGameEngine = (await import('../app/composables/useGameEngine')).useGameEngine
  })
  afterEach(() => vi.useRealTimers())

  function table(positionsBySeat: string[], chips: number[]) {
    const bb = ref(2), sb = ref(1)
    const gs = useGameState(bb)
    const c = (rank: number, suit: string) => ({ rank, suit })
    gs.playerStates.value = chips.map((ch, i) => ({
      id: i, name: i === 0 ? 'Hero' : `Bot${i}`, chips: ch,
      holeCards: [c(2 + i, 'hearts'), c(9 + i, 'spades')],
      folded: false, eliminated: false, isHero: i === 0, lastAction: null,
      currentBetAmount: 0, betThisRound: 0, totalInvested: 0,
      tilt: { severity: 0, handsRemaining: 0 }, tiltMultiplier: 1,
    })) as never
    gs.resetGameState()
    const asked: number[] = []
    let script: { type: string; amount?: number }[] = []
    const engine = useGameEngine({
      gameState: gs, bb, sb, positions: ref(positionsBySeat),
      makeBotDecision: (p) => { asked.push(p.id); return script.shift() ?? { type: 'call' } },
      onEndHand: () => {},
      botDelay: { min: 10, max: 10, heroFoldedMin: 10, heroFoldedMax: 10 },
    })
    return { gs, engine, asked, setScript: (s: typeof script) => { script = s } }
  }

  it('heads-up: the bot gets to call or fold the hero shove', async () => {
    vi.useFakeTimers()
    const t = table(['D/SB', 'BB'], [200, 200])
    t.engine.postBlindsAndStartBetting()
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.gs.waitingForHero.value).toBe(true)
    t.engine.handleRaise(200)
    await vi.advanceTimersByTimeAsync(20000)
    expect(t.asked).toEqual([1])
    expect(t.gs.playerStates.value.map(p => p.totalInvested)).toEqual([200, 200])
  })

  it('three-way: the big blind acts after a shove and an all-in call', async () => {
    vi.useFakeTimers()
    // seat 2 button, hero small blind, seat 1 big blind
    const t = table(['SB', 'BB', 'D/BTN'], [200, 200, 200])
    t.setScript([{ type: 'raise', amount: 200 }, { type: 'fold' }])
    t.engine.postBlindsAndStartBetting()
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.gs.waitingForHero.value).toBe(true)
    t.engine.handleCall()
    await vi.advanceTimersByTimeAsync(20000)
    expect(t.asked).toEqual([2, 1])
    expect(t.gs.playerStates.value[1]!.folded).toBe(true)
  })
})

describe('4. busted seats leave the rotation', () => {
  it('labels only live seats, clockwise from the button', () => {
    // six seats, seats 1 and 4 busted, button on seat 2
    const alive = [true, false, true, true, false, true]
    expect(assignLivePositions(alive, 2)).toEqual(['UTG', '', 'D/BTN', 'SB', '', 'BB'])
  })

  it('goes heads-up when two seats are left', () => {
    expect(assignLivePositions([true, false, false, true], 3)).toEqual(['BB', '', '', 'D/SB'])
  })

  it('matches the full-table layout when nobody is busted', () => {
    expect(assignLivePositions([true, true, true], 1)).toEqual(['BB', 'D/BTN', 'SB'])
  })

  it('moves the button to the next live seat', () => {
    const alive = [true, false, true, true, false, true]
    expect(nextLiveSeat(alive, 0)).toBe(2)
    expect(nextLiveSeat(alive, 3)).toBe(5)
    expect(nextLiveSeat(alive, 5)).toBe(0)
  })
})

describe('5. the All-In button commits the whole stack', () => {
  it('raises to stack + chips already in front of the hero', async () => {
    const BetControls = (await import('../app/components/BetControls.vue')).default
    // Hero is the big blind: 2 posted, 198 behind, limped to.
    const w = mount(BetControls, {
      props: { pot: 4, toCall: 0, minRaise: 4, maxRaise: 198, heroBet: 2, bb: 2 },
      global: { stubs: { UTooltip: { template: '<div><slot /></div>' } } },
    })
    const allIn = w.findAll('button').find(b => b.text().startsWith('All-In'))!
    await allIn.trigger('click')
    expect(w.emitted('raise')![0]).toEqual([200])
  })
})

describe('3. two short all-ins that add up to a full raise reopen the betting', () => {
  it('reopens for a player who had already acted', () => {
    // P0 bets 100 (min raise is to 200). P1 all-in 160, P2 all-in 220:
    // neither is a full raise over the bet in front of it, but together they
    // raise P0's 100 by 120 — more than the 100 a full raise needs.
    const r = mkRound([1000, 160, 220, 1000])
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'raise', amount: 100 })
    applyEngineAction(r, 1, { type: 'raise', amount: 160 })
    const res = applyEngineAction(r, 2, { type: 'raise', amount: 220 })
    expect(res.reopened).toBe(true)
    applyEngineAction(r, 3, { type: 'fold' })
    const reraise = applyEngineAction(r, 0, { type: 'raise', amount: 600 })
    expect(reraise.type).toBe('raise')
    expect(r.currentBet).toBe(600)
  })
  it('one short all-in alone still does not', () => {
    const r = mkRound([1000, 160, 1000])
    startBettingRound(r)
    applyEngineAction(r, 0, { type: 'raise', amount: 100 })
    const res = applyEngineAction(r, 1, { type: 'raise', amount: 160 })
    expect(res.reopened).toBe(false)
  })
})
