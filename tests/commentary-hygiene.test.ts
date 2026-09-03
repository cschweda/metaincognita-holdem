/**
 * Commentary information hygiene: the TV booth may tease the undealt runout
 * only after the hero is out of the hand. While the hero is live, nothing the
 * booth says may depend on cards that have not been dealt yet.
 */
import { describe, it, expect } from 'vitest'
import { foreshadowAllowed } from '../app/utils/commentaryStrategic'
import { HAND_RANKS } from '../app/utils/handAnalysis'
import type { Card } from '../app/utils/cards'

const R: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 }
const S: Record<string, Card['suit']> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
const c = (s: string): Card => ({ rank: R[s[0]!] ?? parseInt(s[0]!, 10), suit: S[s[1]!]! })
const B = (...xs: string[]) => xs.map(c)

// Bot holds 8-7 on a 9-T-2 flop; the runout J-6 makes a straight by the river.
const flop = B('9h', 'Td', '2c')
const runout = B('9h', 'Td', '2c', 'Js', '6d')
const bot = (folded = false) => ({ holeCards: B('8s', '7c'), folded, isHero: false })
const hero = (folded: boolean) => ({ holeCards: B('As', 'Kd'), folded, isHero: true })

describe('foreshadowAllowed', () => {
  it('never fires while the hero is still in the hand, even if a bot will improve', () => {
    expect(foreshadowAllowed([hero(false), bot()], flop, runout, HAND_RANKS.STRAIGHT)).toBe(false)
  })

  it('fires after the hero has folded when a live player will improve by the river', () => {
    expect(foreshadowAllowed([hero(true), bot()], flop, runout, HAND_RANKS.STRAIGHT)).toBe(true)
  })

  it('does not fire when nobody improves', () => {
    const brick = B('9h', 'Td', '2c', '3s', '4d')
    expect(foreshadowAllowed([hero(true), bot()], flop, brick, HAND_RANKS.STRAIGHT)).toBe(false)
  })

  it('ignores players who have already folded', () => {
    expect(foreshadowAllowed([hero(true), bot(true)], flop, runout, HAND_RANKS.STRAIGHT)).toBe(false)
  })

  it('does not fire before the full runout is known', () => {
    expect(foreshadowAllowed([hero(true), bot()], flop, B('9h', 'Td', '2c', 'Js'), HAND_RANKS.STRAIGHT)).toBe(false)
  })
})
