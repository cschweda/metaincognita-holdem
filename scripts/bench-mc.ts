/**
 * Micro-benchmark for the Monte Carlo hot paths (estimateEquity, analyzeHand).
 * Usage: npx vite-node scripts/bench-mc.ts
 * Used to verify the perf work in the engine-foundation round; keep for
 * before/after comparisons when touching handAnalysis simulation loops.
 */
import { estimateEquity, analyzeHand } from '../app/utils/handAnalysis'
import { mulberry32 } from '../app/utils/rng'
import type { Card } from '../app/utils/cards'

const hole: [Card, Card] = [{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }]
const board: Card[] = [
  { rank: 2, suit: 'clubs' }, { rank: 7, suit: 'diamonds' }, { rank: 12, suit: 'spades' },
]

// Warmup (JIT)
for (let i = 0; i < 5; i++) estimateEquity(hole, board, 3, 200, mulberry32(i))

let t = performance.now()
for (let i = 0; i < 50; i++) estimateEquity(hole, board, 3, 1000, mulberry32(i))
console.log(`estimateEquity x50 (1000 iters, 3 opps): ${(performance.now() - t).toFixed(0)}ms`)

t = performance.now()
for (let i = 0; i < 20; i++) analyzeHand(hole, board, 'flop', 3, 'BTN', 10, mulberry32(i))
console.log(`analyzeHand x20 (flop):                  ${(performance.now() - t).toFixed(0)}ms`)
