// tests/bot-config.test.ts
/**
 * One mapping from a persona/preset to a bot's strategy fields, shared by the
 * setup screen's initial roster and its preset dropdown. Round 8: applyPreset
 * copied seven of twelve fields, so switching a seat away from a persona with
 * a donk/limp tendency left that tendency attached to the new persona.
 */
import { describe, it, expect } from 'vitest'
import { botStrategyFromPreset } from '../app/utils/botConfig'
import config from '../holdem.config'

const persona = (name: string) => config.personas.find(p => p.name === name)!
const preset = (name: string) => config.botPresets.find(p => p.name === name)!

describe('botStrategyFromPreset', () => {
  it('carries every strategy field of a persona that has them', () => {
    const carl = botStrategyFromPreset(persona('Calling Carl'))
    expect(carl.donkBetFreq).toBe(0.22)
    expect(carl.limpFreq).toBe(0.65)
    expect(carl.tiltMultiplier).toBe(0.8)
  })

  it('carries the shaping fields a pro persona defines', () => {
    const negreanu = botStrategyFromPreset(persona('Naniel Degreanu'))
    expect(negreanu.betSizeMult).toBe(0.85)
    expect(negreanu.styleBias).toEqual({ suitedConnector: -0.06, pair: -0.02 })
    const twan = botStrategyFromPreset(persona('Dom Twan'))
    expect(twan.overbetFreq).toBe(0.18)
  })

  it('clears fields a generic preset does not define (no leakage between presets)', () => {
    const nit = botStrategyFromPreset(preset('Nit'))
    expect(nit.donkBetFreq).toBeUndefined()
    expect(nit.limpFreq).toBeUndefined()
    expect(nit.styleBias).toBeUndefined()
    expect(nit.betSizeMult).toBeUndefined()
    expect(nit.overbetFreq).toBeUndefined()
    expect(nit.leak).toBeUndefined()
    expect(nit.tiltMultiplier).toBe(1.0)
  })

  it('every field of the interface is populated from a full persona', () => {
    const lucy = botStrategyFromPreset(persona('Loose Lucy'))
    const expected = ['vpip', 'pfr', 'aggression', 'bluffFreq', 'creativeFreq', 'tiltMultiplier',
      'threeBetFreq', 'fourBetFreq', 'fiveBetFreq', 'donkBetFreq', 'limpFreq', 'styleBias', 'leak']
    for (const k of expected) expect(lucy[k as keyof typeof lucy]).toBeDefined()
  })
})
