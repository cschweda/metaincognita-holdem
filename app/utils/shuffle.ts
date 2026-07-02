/**
 * Unbiased Fisher-Yates shuffle.
 *
 * Returns a new array; does not mutate the input. Use this instead of
 * `arr.sort(() => Math.random() - 0.5)`, which is NOT a uniform shuffle: the
 * comparator is inconsistent, so V8's sort leaves earlier elements more likely
 * to stay near the front. That bias is harmless for a coin flip but skews things
 * like "which bots sit at the table."
 *
 * Note: uses Math.random() (V8's xorshift128+). That is statistically sound for
 * a play-money simulator but is NOT cryptographically secure — do not rely on it
 * for provably-fair real-money dealing.
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
