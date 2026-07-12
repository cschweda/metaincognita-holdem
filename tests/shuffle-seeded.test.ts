import { describe, it, expect } from 'vitest'
import { shuffle } from '../app/utils/shuffle'
import { simShuffleDeck } from '../app/utils/gameSimulation'
import { mulberry32 } from '../app/utils/rng'

describe('seeded shuffle', () => {
  const input = Array.from({ length: 52 }, (_, i) => i)
  it('same seed → same order', () => {
    expect(shuffle(input, mulberry32(7))).toEqual(shuffle(input, mulberry32(7)))
  })
  it('different seeds → different order', () => {
    expect(shuffle(input, mulberry32(7))).not.toEqual(shuffle(input, mulberry32(8)))
  })
  it('does not mutate input and keeps all elements', () => {
    const out = shuffle(input, mulberry32(7))
    expect(input[0]).toBe(0)
    expect([...out].sort((a, b) => a - b)).toEqual(input)
  })
})

describe('seeded simShuffleDeck', () => {
  it('same seed → same deck order', () => {
    expect(simShuffleDeck(mulberry32(11))).toEqual(simShuffleDeck(mulberry32(11)))
  })
  it('unseeded still returns a full 52-card deck', () => {
    expect(simShuffleDeck()).toHaveLength(52)
  })
})
