import { describe, it, expect } from 'vitest'
import { getTableDynamics } from '../app/utils/gameSimulation'

describe('getTableDynamics', () => {
  it('returns undefined below minHands', () => {
    expect(getTableDynamics([1, 1, 2], [100, 100, 100], 2, 1, 10)).toBeUndefined()
  })

  it('computes dominant player and rates', () => {
    const winners = [1, 1, 1, 1, 1, 1, 2, 2, 0, 0]
    const d = getTableDynamics(winners, [200, 400, 200], 2, 2, 10)!
    expect(d.dominantPlayerId).toBe(1)
    expect(d.dominantWinRate).toBeCloseTo(0.6)
    expect(d.myRecentWinRate).toBeCloseTo(0.2)
    expect(d.avgStackDepth).toBeCloseTo((200 + 400 + 200) / 3 / 2)
    expect(d.handsInWindow).toBe(10)
  })
})
