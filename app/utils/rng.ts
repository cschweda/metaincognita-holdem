/**
 * Injectable random source. Everything that deals cards or makes bot
 * decisions accepts an Rng (defaulting to Math.random) so simulations,
 * the exploit probe, and tests can run deterministically from a seed.
 */
export type Rng = () => number

/** Mulberry32 — tiny, fast, statistically solid seeded PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
