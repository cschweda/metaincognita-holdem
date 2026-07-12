/**
 * Unbiased Fisher-Yates shuffle.
 *
 * Returns a new array; does not mutate the input. Use this instead of
 * `arr.sort(() => Math.random() - 0.5)`, which is NOT a uniform shuffle: the
 * comparator is inconsistent, so V8's sort leaves earlier elements more likely
 * to stay near the front. That bias is harmless for a coin flip but skews things
 * like "which bots sit at the table."
 *
 * Note: defaults to Math.random() (V8's xorshift128+). That is statistically
 * sound for a play-money simulator but is NOT cryptographically secure — do not
 * rely on it for provably-fair real-money dealing. Pass a seeded Rng (see
 * utils/rng.ts) for deterministic, reproducible shuffles in sims and tests.
 */
import type { Rng } from './rng'

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
