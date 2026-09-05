// app/utils/botConfig.ts
/**
 * One persona/preset → bot strategy mapping, shared by the setup screen's
 * initial roster and its preset dropdown. Keeping it in one place is the
 * point: the two copies had drifted, and the dropdown's copy silently kept
 * the previous persona's donk/limp/sizing fields (Round 8).
 */
export interface BotStrategyFields {
  vpip: number
  pfr: number
  aggression: number
  bluffFreq: number
  creativeFreq: number
  tiltMultiplier: number
  threeBetFreq?: number
  fourBetFreq?: number
  fiveBetFreq?: number
  donkBetFreq?: number
  limpFreq?: number
  styleBias?: Partial<Record<'pair' | 'suitedAce' | 'suitedConnector' | 'bigCard' | 'other', number>>
  betSizeMult?: number
  overbetFreq?: number
  leak?: string
}

/**
 * Every optional field is assigned unconditionally — assigning `undefined`
 * is what clears a previous persona's value when a seat switches to a
 * generic preset that has no opinion on it.
 */
export function botStrategyFromPreset(preset: Record<string, unknown>): BotStrategyFields {
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
  return {
    vpip: num(preset.vpip) ?? 0.22,
    pfr: num(preset.pfr) ?? 0.17,
    aggression: num(preset.aggression) ?? 1.0,
    bluffFreq: num(preset.bluffFreq) ?? 0.12,
    creativeFreq: num(preset.creativeFreq) ?? 0.05,
    tiltMultiplier: num(preset.tiltMultiplier) ?? 1.0,
    threeBetFreq: num(preset.threeBetFreq),
    fourBetFreq: num(preset.fourBetFreq),
    fiveBetFreq: num(preset.fiveBetFreq),
    donkBetFreq: num(preset.donkBetFreq),
    limpFreq: num(preset.limpFreq),
    styleBias: preset.styleBias as BotStrategyFields['styleBias'],
    betSizeMult: num(preset.betSizeMult),
    overbetFreq: num(preset.overbetFreq),
    leak: typeof preset.leak === 'string' ? preset.leak : undefined,
  }
}
