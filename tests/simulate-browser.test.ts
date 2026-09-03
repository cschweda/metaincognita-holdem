/**
 * The browser simulator is one of the four table-read consumers and the only
 * one with no automated coverage: it relied on a Nuxt auto-import, so it
 * could not even load outside the app. This pins that it runs end to end
 * under a plain test runner, deterministically under a seed.
 */
import { describe, it, expect } from 'vitest'
import { runSimulation } from '../app/utils/simulateBrowser'

const run = (seed: number) => runSimulation(40, 6, () => {}, 3, undefined, seed)

describe('browser simulator', () => {
  it('plays a seeded session end to end with sane hand accounting', async () => {
    const r = await run(20260903)
    expect(r.hands).toBe(40)
    expect(r.players).toBe(6)
    expect(r.botStats).toHaveLength(6)
    expect(r.flopsSeen).toBeLessThanOrEqual(40)
    expect(r.showdowns).toBeLessThanOrEqual(r.flopsSeen)
    expect(r.hands).toBeGreaterThan(0)
  }, 30_000)

  it('is byte-identical for the same seed', async () => {
    const a = await run(777)
    const b = await run(777)
    expect(b.botStats).toEqual(a.botStats)
    expect(b.avgPot).toEqual(a.avgPot)
    expect(b.showdowns).toEqual(a.showdowns)
  }, 30_000)
})
