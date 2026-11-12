// @vitest-environment happy-dom
/**
 * Stats page data (localStorage only — there is no backend):
 *
 *  - deleting hands one after another must remove exactly the hands asked
 *    for. Row ids are the index at load time, so the second delete used to
 *    splice a stale index out of the stored session;
 *  - the Sessions tab lists the stored session instead of an array nothing
 *    ever filled;
 *  - per-hand profit is the hero's real net for the hand (the change in their
 *    stack), so a fold costs what was invested, a split pot is partial, and
 *    the hands add up to the session total;
 *  - no copy claims the data lives in "the cloud".
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { useStatsData } from '../app/composables/useStatsData'
import { useSessionStats } from '../app/composables/useSessionStats'
import type { HandRecord, SessionData } from '../app/composables/useSessionStats'

const KEY = 'holdem-session-stats'

const hand = (n: number, result: HandRecord['result'] = 'won', profit = 10): HandRecord => ({
  handNumber: n, holeCards: 'A♥ K♦', board: '', result, profit,
  position: 'BTN', potSize: 20, actions: [], players: [],
})

function seed(hands: HandRecord[]): SessionData {
  const s: SessionData = {
    id: 'sess-1', startedAt: '2026-11-11T10:00:00.000Z', stakeLevel: 3, playerCount: 6,
    startingStack: 200, handsPlayed: hands.length, handsWon: 0, handsLost: 0, handsFolded: 0,
    currentStack: 230, peakStack: 240, totalProfit: 30, hands,
  }
  localStorage.setItem(KEY, JSON.stringify(s))
  return s
}

const stored = (): SessionData => JSON.parse(localStorage.getItem(KEY)!)

describe('deleting hands', () => {
  beforeEach(() => localStorage.clear())

  it('two deletes in a row remove exactly those two hands from storage', async () => {
    seed([hand(1), hand(2), hand(3), hand(4)])
    const stats = useStatsData()
    await stats.init()
    const idOf = (n: number) => stats.hands.value.find(h => h.hand_number === n)!.id

    const first = idOf(1), last = idOf(4)
    await stats.deleteHand(first)
    await stats.deleteHand(last)

    expect(stats.hands.value.map(h => h.hand_number)).toEqual([2, 3])
    expect(stored().hands.map(h => h.handNumber)).toEqual([2, 3])
  })

  it('deleting a middle hand then its neighbour does not take the wrong one', async () => {
    seed([hand(1), hand(2), hand(3), hand(4)])
    const stats = useStatsData()
    await stats.init()
    const idOf = (n: number) => stats.hands.value.find(h => h.hand_number === n)!.id

    const two = idOf(2), three = idOf(3)
    await stats.deleteHand(two)
    await stats.deleteHand(three)

    expect(stored().hands.map(h => h.handNumber)).toEqual([1, 4])
  })

  it('an unknown id deletes nothing', async () => {
    seed([hand(1), hand(2)])
    const stats = useStatsData()
    await stats.init()
    await stats.deleteHand('local-99')
    expect(stored().hands).toHaveLength(2)
    expect(stats.hands.value).toHaveLength(2)
  })
})

describe('the sessions list', () => {
  beforeEach(() => localStorage.clear())

  it('holds the stored session', async () => {
    seed([hand(1, 'won'), hand(2, 'lost', -8), hand(3, 'folded', -2)])
    const stats = useStatsData()
    await stats.init()

    expect(stats.sessions.value).toHaveLength(1)
    expect(stats.sessions.value[0]).toMatchObject({
      id: 'sess-1', started_at: '2026-11-11T10:00:00.000Z', stake_level: 3, player_count: 6,
      starting_stack: 200, hands_played: 3, hands_won: 1, hands_lost: 1, hands_folded: 1,
      final_stack: 230, peak_stack: 240, total_profit: 30,
    })
    expect(stats.lifetimeStats.value.totalSessions).toBe(1)
    expect(stats.lifetimeStats.value.handsPerSession).toBe(3)
  })

  it('is empty when nothing has been played', async () => {
    const stats = useStatsData()
    await stats.init()
    expect(stats.sessions.value).toEqual([])
    seed([])
    const again = useStatsData()
    await again.init()
    expect(again.sessions.value).toEqual([])
  })

  it('follows a hand deletion', async () => {
    seed([hand(1, 'won'), hand(2, 'lost', -8)])
    const stats = useStatsData()
    await stats.init()
    await stats.deleteHand(stats.hands.value.find(h => h.hand_number === 2)!.id)
    expect(stats.sessions.value[0]).toMatchObject({ hands_played: 1, hands_won: 1, hands_lost: 0 })
  })

  it('is cleared with the session', async () => {
    seed([hand(1)])
    const stats = useStatsData()
    await stats.init()
    await stats.deleteSession('sess-1')
    expect(stats.sessions.value).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('per-hand profit is the hero\'s net for the hand', () => {
  beforeEach(() => localStorage.clear())
  // recordHand derives profit from the stack trail; whatever the caller
  // passes is ignored (the old page formula passed ±the whole pot).
  const rec = (n: number, result: HandRecord['result']) => {
    const { profit: _ignored, ...r } = hand(n, result)
    return r
  }

  it('a fold costs what was invested, not zero', () => {
    const stats = useSessionStats()
    stats.initSession(3, 6, 200)
    stats.recordHand(rec(1, 'folded'), 198) // posted the big blind and folded
    expect(stats.session.value.hands[0]!.profit).toBe(-2)
  })

  it('a win is the pot minus the hero\'s own chips in it', () => {
    const stats = useSessionStats()
    stats.initSession(3, 6, 200)
    stats.recordHand(rec(1, 'won'), 230) // $60 pot, $30 of it the hero's
    expect(stats.session.value.hands[0]!.profit).toBe(30)
  })

  it('a loss is the hero\'s investment, not the whole pot', () => {
    const stats = useSessionStats()
    stats.initSession(3, 6, 200)
    stats.recordHand(rec(1, 'lost'), 150) // three-way $150 pot
    expect(stats.session.value.hands[0]!.profit).toBe(-50)
  })

  it('a split pot is the partial result', () => {
    const stats = useSessionStats()
    stats.initSession(3, 6, 200)
    stats.recordHand(rec(1, 'won'), 201.5) // chopped, picked up dead blinds
    expect(stats.session.value.hands[0]!.profit).toBe(1.5)
  })

  it('hands add up to the session total', () => {
    const stats = useSessionStats()
    stats.initSession(3, 6, 200)
    stats.recordHand(rec(1, 'folded'), 198)
    stats.recordHand(rec(2, 'won'), 240)
    stats.recordHand(rec(3, 'lost'), 175)
    const sum = stats.session.value.hands.reduce((s, h) => s + h.profit, 0)
    expect(sum).toBe(stats.session.value.totalProfit)
    expect(sum).toBe(-25)
  })

  it('"New Session" at a running table starts from the stack on the table', () => {
    const stats = useSessionStats()
    stats.initSession(3, 6, 200)
    stats.recordHand(rec(1, 'won'), 350)
    stats.resetSession()
    stats.recordHand(rec(1, 'folded'), 348)
    expect(stats.session.value.hands[0]!.profit).toBe(-2)
    expect(stats.session.value.totalProfit).toBe(-2)
  })
})

describe('copy', () => {
  const appDir = join(import.meta.dirname, '..', 'app')
  const vueFiles = (dir: string): string[] => readdirSync(join(appDir, dir))
    .filter(f => f.endsWith('.vue')).map(f => join(appDir, dir, f))

  it('nothing in the UI says data is stored in the cloud', () => {
    for (const file of [...vueFiles('pages'), ...vueFiles('components')]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\bthe cloud\b/i)
    }
  })
})

describe('hand order (stored oldest-first)', () => {
  beforeEach(() => localStorage.clear())

  it('Recent Hands shows the newest hands, newest first', async () => {
    seed(Array.from({ length: 30 }, (_, i) => hand(i + 1)))
    const stats = useStatsData()
    await stats.init()
    const recent = stats.recentHands.value.map(h => h.hand_number)
    expect(recent).toHaveLength(20)
    expect(recent[0]).toBe(30)
    expect(recent[19]).toBe(11)
  })

  it('the profit timeline runs forward and ends at the running total', async () => {
    seed([hand(1, 'won', 10), hand(2, 'lost', -30), hand(3, 'won', 5)])
    const stats = useStatsData()
    await stats.init()
    expect(stats.profitTimeline.value).toEqual([10, -20, -15])
  })
})

describe('a running table respects deletions made on the stats page', () => {
  beforeEach(() => localStorage.clear())

  it('a deleted hand does not come back when the next hand is recorded', async () => {
    const table = useSessionStats()
    table.initSession(3, 6, 200)
    table.recordHand(hand(1), 210)
    table.recordHand(hand(2), 190)
    table.recordHand(hand(3), 195)

    const page = useStatsData()
    await page.init()
    await page.deleteHand(page.hands.value.find(h => h.hand_number === 2)!.id)

    table.adoptStoredHands() // what the game page does when it is shown again
    table.recordHand(hand(4), 205)
    expect(stored().hands.map(h => h.handNumber)).toEqual([1, 3, 4])
    expect(stored().currentStack).toBe(205)
  })

  it('a deleted session stays empty of old hands', async () => {
    const table = useSessionStats()
    table.initSession(3, 6, 200)
    table.recordHand(hand(1), 210)
    localStorage.removeItem(KEY)

    table.adoptStoredHands()
    table.recordHand(hand(2), 220)
    expect(stored().hands.map(h => h.handNumber)).toEqual([2])
  })
})

describe('the Hands tab', () => {
  beforeEach(() => localStorage.clear())
  it('lists the newest hand first, like Recent Hands', async () => {
    seed([hand(1), hand(2), hand(3)])
    const stats = useStatsData()
    await stats.init()
    expect(stats.displayedHands.value.map(h => h.hand_number)).toEqual([3, 2, 1])
  })
})
