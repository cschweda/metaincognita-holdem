// tests/hero-record.test.ts
/**
 * The bots' read on the hero is derived by scanning the hand's action log.
 * Round 8: the scan used `line.includes(heroName)`, so a hero named "Sam"
 * absorbed every "Solid Sam ..." line and the resulting VPIP / fold-to-3-bet
 * / aggression numbers were wrong at any table with a name-sharing bot.
 */
import { describe, it, expect } from 'vitest'
import { actedInLine, parseHeroHandRecord } from '../app/utils/heroRecord'

const opts = { heroFolded: false, heroTotalWagered: 10, bb: 2 }

describe('actedInLine', () => {
  it('matches only the actor at the start of the line', () => {
    expect(actedInLine('Sam calls $4', 'Sam')).toBe(true)
    expect(actedInLine('Solid Sam calls $4', 'Sam')).toBe(false)
    expect(actedInLine('Solid Sam calls $4', 'Solid Sam')).toBe(true)
  })

  it('ignores street markers', () => {
    expect(actedInLine('--- FLOP: A♠ K♦ 2♣ ---', 'Sam')).toBe(false)
  })
})

describe('parseHeroHandRecord', () => {
  it('does not credit a name-sharing bot\'s actions to the hero', () => {
    const log = [
      'Solid Sam raises to $6',
      'Sam folds',
      '--- FLOP: A♠ K♦ 2♣ ---',
      'Solid Sam raises to $10',
    ]
    const r = parseHeroHandRecord(log, 'Sam', { ...opts, heroFolded: true, heroTotalWagered: 0 })
    expect(r.raiseCount).toBe(0)
    expect(r.callCount).toBe(0)
    expect(r.facedCbet).toBe(false)   // hero folded preflop
  })

  it('counts the hero\'s own raises and calls', () => {
    const log = ['Sam raises to $6', 'Tight Tony calls $6', '--- FLOP: A♠ K♦ 2♣ ---', 'Sam checks', 'Tight Tony raises to $8', 'Sam calls $8']
    const r = parseHeroHandRecord(log, 'Sam', opts)
    expect(r.raiseCount).toBe(1)
    expect(r.callCount).toBe(1)
    expect(r.checkCount).toBe(1)
    expect(r.enteredPot).toBe(true)
  })

  it('detects facing and folding to a 3-bet', () => {
    const log = ['Hero raises to $6', 'Wild Wendy raises to $20', 'Hero folds']
    const r = parseHeroHandRecord(log, 'Hero', { ...opts, heroFolded: true })
    expect(r.faced3Bet).toBe(true)
    expect(r.foldedTo3Bet).toBe(true)
  })

  it('detects facing and folding to a c-bet', () => {
    const log = ['Hero calls $2', 'Solid Sam raises to $6', 'Hero calls $4',
      '--- FLOP: A♠ K♦ 2♣ ---', 'Solid Sam raises to $8', 'Hero folds']
    const r = parseHeroHandRecord(log, 'Hero', { ...opts, heroFolded: true })
    expect(r.facedCbet).toBe(true)
    expect(r.foldedToCbet).toBe(true)
  })

  it('a hero who only posted the big blind did not enter the pot', () => {
    const log = ['Hero folds']
    const r = parseHeroHandRecord(log, 'Hero', { heroFolded: true, heroTotalWagered: 2, bb: 2 })
    expect(r.enteredPot).toBe(false)
  })
})
