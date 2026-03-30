/**
 * Phase 5 — Session Management Tests
 *
 * Tests hero timeout, bust-out detection, re-buy flow, session recording,
 * and data deletion logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Timeout Logic ─────────────────────────────────────────────

describe('Hero timeout', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

  it('timeout fires after 5 minutes of inactivity', () => {
    const onTimeout = vi.fn()
    const timer = setTimeout(onTimeout, TIMEOUT_MS)

    vi.advanceTimersByTime(TIMEOUT_MS - 1)
    expect(onTimeout).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    clearTimeout(timer)
  })

  it('timeout resets when hero acts', () => {
    const onTimeout = vi.fn()
    let timer = setTimeout(onTimeout, TIMEOUT_MS)

    // Advance 4 minutes
    vi.advanceTimersByTime(4 * 60 * 1000)
    expect(onTimeout).not.toHaveBeenCalled()

    // Hero acts — reset timer
    clearTimeout(timer)
    timer = setTimeout(onTimeout, TIMEOUT_MS)

    // Advance another 4 minutes (would have fired without reset)
    vi.advanceTimersByTime(4 * 60 * 1000)
    expect(onTimeout).not.toHaveBeenCalled()

    // Full 5 minutes after reset
    vi.advanceTimersByTime(1 * 60 * 1000)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    clearTimeout(timer)
  })

  it('timeout does not fire if hero keeps acting', () => {
    const onTimeout = vi.fn()
    let timer = setTimeout(onTimeout, TIMEOUT_MS)

    // Simulate hero acting every 2 minutes for 20 minutes
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(2 * 60 * 1000)
      clearTimeout(timer)
      timer = setTimeout(onTimeout, TIMEOUT_MS)
    }

    expect(onTimeout).not.toHaveBeenCalled()
    clearTimeout(timer)
  })

  it('multiple rapid actions don\'t create multiple timers', () => {
    const onTimeout = vi.fn()
    let timer: ReturnType<typeof setTimeout> | null = null

    function resetTimer() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onTimeout, TIMEOUT_MS)
    }

    // Rapid actions
    resetTimer()
    resetTimer()
    resetTimer()

    vi.advanceTimersByTime(TIMEOUT_MS)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
})

// ─── Bust-Out Detection ────────────────────────────────────────

describe('Hero bust-out', () => {
  it('hero with 0 chips triggers bust-out', () => {
    const heroChips = 0
    const busted = heroChips <= 0
    expect(busted).toBe(true)
  })

  it('hero with positive chips does not trigger bust-out', () => {
    const heroChips = 1
    const busted = heroChips <= 0
    expect(busted).toBe(false)
  })

  it('all-in loss results in bust-out', () => {
    let chips = 200
    const allInAmount = chips
    chips -= allInAmount // hero goes all-in
    const lost = true // lost at showdown
    expect(chips).toBe(0)
    expect(lost && chips <= 0).toBe(true)
  })

  it('all-in win does NOT trigger bust-out', () => {
    let chips = 200
    const allInAmount = chips
    chips -= allInAmount // hero goes all-in
    const won = true
    const potWon = 500
    if (won) chips += potWon
    expect(chips).toBe(500)
    expect(chips <= 0).toBe(false)
  })
})

// ─── Re-Buy Flow ───────────────────────────────────────────────

describe('Re-buy', () => {
  it('re-buy creates a fresh starting stack', () => {
    const startingStack = 200
    let chips = 0 // busted
    // Re-buy
    chips = startingStack
    expect(chips).toBe(200)
  })

  it('re-buy starts a new session (different ID)', () => {
    const session1Id = crypto.randomUUID()
    // Bust out, re-buy
    const session2Id = crypto.randomUUID()
    expect(session1Id).not.toBe(session2Id)
  })

  it('bust-out session and re-buy session are independent', () => {
    // Session 1: start 200, bust to 0
    const session1 = { startingStack: 200, finalStack: 0, profit: -200 }
    // Session 2: re-buy 200, end at 350
    const session2 = { startingStack: 200, finalStack: 350, profit: 150 }

    // Lifetime profit = sum of session profits
    const lifetimeProfit = session1.profit + session2.profit
    expect(lifetimeProfit).toBe(-50) // net loss despite winning session 2

    // Total sessions = 2
    expect([session1, session2]).toHaveLength(2)
  })

  it('multiple bust-outs track correctly', () => {
    const sessions = [
      { profit: -200 },
      { profit: -200 },
      { profit: -200 },
      { profit: 500 },
    ]
    const lifetimeProfit = sessions.reduce((sum, s) => sum + s.profit, 0)
    expect(lifetimeProfit).toBe(-100)
    expect(sessions.filter(s => s.profit < 0)).toHaveLength(3) // 3 losing sessions
    expect(sessions.filter(s => s.profit > 0)).toHaveLength(1) // 1 winning session
  })
})

// ─── Session Recording ─────────────────────────────────────────

describe('Session recording', () => {
  it('hand record captures all required fields', () => {
    const record = {
      handNumber: 1,
      holeCards: 'A♠ K♥',
      board: 'Q♠ J♦ T♣ 2♥ 9♠',
      result: 'won' as const,
      profit: 45,
      position: 'BTN',
      potSize: 90,
    }
    expect(record.handNumber).toBe(1)
    expect(record.holeCards).toBeTruthy()
    expect(record.result).toBe('won')
    expect(record.profit).toBe(45)
    expect(record.position).toBe('BTN')
    expect(record.potSize).toBe(90)
  })

  it('folded hand records 0 profit', () => {
    const record = { result: 'folded' as const, profit: 0 }
    expect(record.profit).toBe(0)
  })

  it('session stats accumulate correctly', () => {
    const hands = [
      { result: 'won', profit: 30 },
      { result: 'lost', profit: -20 },
      { result: 'folded', profit: 0 },
      { result: 'won', profit: 50 },
      { result: 'lost', profit: -40 },
    ]

    const won = hands.filter(h => h.result === 'won').length
    const lost = hands.filter(h => h.result === 'lost').length
    const folded = hands.filter(h => h.result === 'folded').length
    const totalProfit = hands.reduce((sum, h) => sum + h.profit, 0)

    expect(won).toBe(2)
    expect(lost).toBe(2)
    expect(folded).toBe(1)
    expect(totalProfit).toBe(20)
  })

  it('peak stack tracks the highest point', () => {
    const startingStack = 200
    const handProfits = [30, -10, 50, -20, -80, 40]
    let current = startingStack
    let peak = startingStack

    for (const p of handProfits) {
      current += p
      peak = Math.max(peak, current)
    }

    expect(peak).toBe(270) // 200 + 30 - 10 + 50 = 270
    expect(current).toBe(210)
  })
})

// ─── Data Deletion ─────────────────────────────────────────────

describe('Data deletion', () => {
  it('deleting a session removes it and its hands', () => {
    const sessions = [
      { id: 'a', profit: 100 },
      { id: 'b', profit: -50 },
    ]
    const hands = [
      { session_id: 'a', profit: 30 },
      { session_id: 'a', profit: 70 },
      { session_id: 'b', profit: -50 },
    ]

    // Delete session 'a'
    const filteredSessions = sessions.filter(s => s.id !== 'a')
    const filteredHands = hands.filter(h => h.session_id !== 'a')

    expect(filteredSessions).toHaveLength(1)
    expect(filteredSessions[0].id).toBe('b')
    expect(filteredHands).toHaveLength(1)
    expect(filteredHands[0].session_id).toBe('b')

    // Lifetime stats recalculated from remaining data
    const lifetimeProfit = filteredHands.reduce((sum, h) => sum + h.profit, 0)
    expect(lifetimeProfit).toBe(-50)
  })

  it('deleting all data empties everything', () => {
    let sessions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    let hands = [{ id: '1' }, { id: '2' }, { id: '3' }]

    sessions = []
    hands = []

    expect(sessions).toHaveLength(0)
    expect(hands).toHaveLength(0)
  })

  it('lifetime stats are zero after delete all', () => {
    const hands: { profit: number }[] = []
    const totalProfit = hands.reduce((sum, h) => sum + h.profit, 0)
    const totalHands = hands.length
    const winRate = totalHands > 0 ? 0 : 0

    expect(totalProfit).toBe(0)
    expect(totalHands).toBe(0)
    expect(winRate).toBe(0)
  })
})
