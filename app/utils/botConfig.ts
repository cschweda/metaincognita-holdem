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

// ─── Hand records and /replay ────────────────────────────────────────────

interface NamedSource { name: string; consistency?: number }
interface BotSources { personas: readonly NamedSource[]; botPresets: readonly NamedSource[] }

const STRATEGY_KEYS = ['vpip', 'pfr', 'aggression', 'bluffFreq', 'creativeFreq', 'tiltMultiplier',
  'threeBetFreq', 'fourBetFreq', 'fiveBetFreq', 'donkBetFreq', 'limpFreq', 'betSizeMult', 'overbetFreq'] as const

const findSource = (name: string | undefined, src: BotSources): NamedSource | undefined =>
  name === undefined ? undefined
    : src.personas.find(p => p.name === name) ?? src.botPresets.find(p => p.name === name)

/**
 * What a hand record keeps about a bot so /replay can seat the same opponent:
 * the preset it was built from, and its strategy numbers only when they no
 * longer match that preset (sliders moved). Display names are free text and
 * cannot be relied on to find the persona again.
 */
export function recordedBotSpec(
  bot: BotStrategyFields & { preset?: string; name: string },
  src: BotSources,
): { preset: string; profile?: BotStrategyFields } {
  const preset = bot.preset || bot.name
  const source = findSource(preset, src)
  const base = source ? botStrategyFromPreset(source as unknown as Record<string, unknown>) : null
  const same = !!base
    && STRATEGY_KEYS.every(k => bot[k] === base[k])
    && JSON.stringify(bot.styleBias ?? null) === JSON.stringify(base.styleBias ?? null)
  if (same) return { preset }
  const profile = botStrategyFromPreset(bot as unknown as Record<string, unknown>)
  return { preset, profile }
}

/** The opponent /replay should seat for a recorded player. */
export function replayOpponent(
  player: { name: string; preset?: string; profile?: BotStrategyFields },
  src: BotSources,
): { profile: BotStrategyFields; consistency: number } {
  const source = findSource(player.preset, src) ?? findSource(player.name, src)
  const profile = player.profile
    ?? (source ? botStrategyFromPreset(source as unknown as Record<string, unknown>)
      : botStrategyFromPreset({}))
  return { profile, consistency: source?.consistency ?? 0.95 }
}
