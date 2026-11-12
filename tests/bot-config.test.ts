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

// ─── What a hand record remembers about each bot, and what /replay rebuilds ──
import { recordedBotSpec, replayOpponent } from '../app/utils/botConfig'

describe('a recorded hand remembers who the bot really was', () => {
  const twan = { preset: 'Dom Twan', name: 'Dom Twan', ...botStrategyFromPreset(persona('Dom Twan')) }

  it('stores only the preset for an untouched persona', () => {
    expect(recordedBotSpec(twan, config)).toEqual({ preset: 'Dom Twan' })
  })

  it('a renamed bot is still replayed as its persona', () => {
    const spec = recordedBotSpec({ ...twan, name: 'Uncle Bob' }, config)
    const o = replayOpponent({ name: 'Uncle Bob', ...spec }, config)
    expect(o.profile.overbetFreq).toBe(0.18)
    expect(o.consistency).toBe(persona('Dom Twan').consistency)
  })

  it('a bot whose sliders were moved is replayed with those settings', () => {
    const spec = recordedBotSpec({ ...twan, vpip: 0.61, bluffFreq: 0.02 }, config)
    expect(spec.profile).toBeDefined()
    const o = replayOpponent({ name: 'Dom Twan', ...spec }, config)
    expect(o.profile.vpip).toBe(0.61)
    expect(o.profile.bluffFreq).toBe(0.02)
    expect(o.profile.overbetFreq).toBe(0.18) // untouched fields come along
  })

  it('an old record with only a name still resolves by name', () => {
    expect(replayOpponent({ name: 'Calling Carl' }, config).profile.limpFreq).toBe(0.65)
    expect(replayOpponent({ name: 'Nobody' }, config).profile.vpip).toBe(0.22)
  })
})
