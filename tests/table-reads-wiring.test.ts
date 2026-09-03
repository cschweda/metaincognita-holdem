/**
 * The live engine and both pages must feed and forward the table-read
 * tracker. There is no unit harness for the keep-alive engine, so this pins
 * the wiring at source level (the probe gate pins the behavior).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const src = (p: string) => readFileSync(p, 'utf-8')

describe('table reads are wired into the live game', () => {
  it('the engine counts actions, closes hands, and forwards the reads', () => {
    const engine = src('app/composables/useGameEngine.ts')
    expect(engine).toMatch(/noteTableAction\(/)
    expect(engine).toMatch(/finishTableHand\(/)
    expect(engine).toMatch(/tableReads: readTable\(/)
    expect(engine).toMatch(/resetTableReads/)
  })
  it('both table pages pass the reads to the bot brain', () => {
    expect(src('app/pages/index.vue')).toMatch(/tableReads: streetContext\?\.tableReads/)
    expect(src('app/pages/replay.vue')).toMatch(/tableReads: streetContext\?\.tableReads/)
  })
  it('a new game resets the window', () => {
    // Start and rebuy must both reset the tracker (spec: "setup, rebuy,
    // career session start"), not just one of them.
    expect((src('app/pages/index.vue').match(/engine\.resetTableReads\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
