/**
 * Range chart: a "15% range" is 15% of the 1,326 dealt combos (pairs 6,
 * suited 4, offsuit 12), not 15% of the 169 hand classes — and the text under
 * each range is generated from the same hand list the chart lights up, so the
 * two cannot disagree.
 */
import { describe, it, expect } from 'vitest'
import { getOpenRange, getActionRange, getRelevantRanges, describeRange, rangeCombos } from '../app/utils/ranges'

describe('range percentages are combo-weighted', () => {
  it('counts combos per class: pair 6, suited 4, offsuit 12', () => {
    expect(rangeCombos(['AA'])).toBe(6)
    expect(rangeCombos(['AKs'])).toBe(4)
    expect(rangeCombos(['AKo'])).toBe(12)
    expect(rangeCombos(['AA', 'AKs', 'AKo'])).toBe(22)
  })

  it.each(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'])('%s: the shown percentage is the lit hands\' share of 1,326 combos', (pos) => {
    const r = getOpenRange(pos)
    expect(r.combos).toBe(rangeCombos(r.hands))
    expect(r.percentage).toBeCloseTo((r.combos / 1326) * 100, 1)
  })

  it('a UTG open is about 15% of dealt hands, not 15% of hand classes', () => {
    const r = getOpenRange('UTG')
    // 15% of 169 classes was 25 classes = 162 combos = 12.2% of hands
    expect(r.percentage).toBeGreaterThan(14)
    expect(r.percentage).toBeLessThan(16)
  })

  it('action ranges are combo-weighted too', () => {
    for (const a of ['3-bet', 'call-3bet', '4-bet', '5-bet']) {
      const r = getActionRange(a)
      expect(r.percentage).toBeCloseTo((rangeCombos(r.hands) / 1326) * 100, 1)
    }
  })
})

describe('range descriptions come from the lit hands', () => {
  it('names the pair floor and the weakest suited / offsuit hand actually included', () => {
    expect(describeRange(['AA', 'KK', 'QQ', 'AKs', 'AQs', 'AKo']))
      .toBe('Pairs QQ+ · 2 suited (weakest AQs) · 1 offsuit (weakest AKo)')
  })

  it('lists pairs individually when they are not a run down from aces', () => {
    expect(describeRange(['AA', 'QQ'])).toBe('Pairs AA QQ')
  })

  it('every range\'s description is exactly describeRange of its hands', () => {
    const all = [...getRelevantRanges('UTG', 'preflop'), ...getRelevantRanges('BTN', 'preflop'), getActionRange('5-bet')]
    for (const r of all) expect(r.description).toBe(describeRange(r.hands))
  })

  it('no description names a hand that is not lit', () => {
    // The old 4-bet text promised "KK+, AKs… rare bluffs with suited aces"
    // while the chart lit QQ and JJ and no bluff at all.
    for (const r of [getActionRange('3-bet'), getActionRange('4-bet'), getActionRange('5-bet'), getOpenRange('CO')]) {
      const weakest = [...r.description.matchAll(/weakest (\w+)/g)].map(m => m[1]!)
      const pairs = (r.description.match(/Pairs ([^·]+)/)?.[1] ?? '').trim().split(' ').filter(Boolean).map(p => p.replace('+', ''))
      expect(weakest.length + pairs.length).toBeGreaterThan(0)
      for (const hand of [...weakest, ...pairs]) expect(r.hands, `${r.action}: ${hand}`).toContain(hand)
      expect(r.description).not.toMatch(/bluff|blocker/i)
    }
  })
})
