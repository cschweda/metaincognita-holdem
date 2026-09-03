// @vitest-environment happy-dom
/**
 * Persistence cost: recording a hand must serialize the session to
 * localStorage exactly once. The old deep watcher re-serialized the whole
 * history a second time one second after every explicit save.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSessionStats } from '../app/composables/useSessionStats'
import type { HandRecord } from '../app/composables/useSessionStats'

const hand = (n: number): HandRecord => ({
  handNumber: n, holeCards: 'Ah Kd', board: 'As Td 7c 2h 9s', result: 'won', profit: 10,
  position: 'BTN', potSize: 20, actions: ['Hero raises to $6', 'Ann folds'], players: [],
})

describe('session stats persistence', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear() })
  afterEach(() => { vi.useRealTimers() })

  it('recording a hand writes to localStorage exactly once', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const stats = useSessionStats()
    stats.initSession(3, 6, 200)
    setItem.mockClear()

    stats.recordHand(hand(1), 210)
    await vi.advanceTimersByTimeAsync(2000)

    expect(setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('holdem-session-stats')!).hands).toHaveLength(1)
  })

  it('starting a session persists it', () => {
    const stats = useSessionStats()
    stats.initSession(2, 4, 100)
    expect(JSON.parse(localStorage.getItem('holdem-session-stats')!).startingStack).toBe(100)
  })
})
