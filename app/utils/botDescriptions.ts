/**
 * Shared bot description utilities — used by SetupScreen, /bots page,
 * and the in-game BotProfileModal.
 */
import config from '@config'

export interface BotStats {
  vpip: number
  pfr: number
  aggression: number
  bluffFreq: number
  creativeFreq: number
  preset?: string
  name?: string
}

/**
 * Generate a dynamic bot name based on how stats have drifted from the preset default.
 */
export function dynamicBotName(bot: BotStats & { preset: string; name: string }): string {
  const presetParts = bot.preset.split(' ')
  const firstName = presetParts.length > 1 ? presetParts[presetParts.length - 1] : bot.preset

  const original = [...config.personas, ...config.botPresets].find(p => p.name === bot.preset)
  if (!original) return bot.name

  const vpipDrift = Math.abs(bot.vpip - original.vpip) > 0.05
  const aggrDrift = Math.abs(bot.aggression - original.aggression) > 0.2
  const bluffDrift = Math.abs(bot.bluffFreq - original.bluffFreq) > 0.06

  if (!vpipDrift && !aggrDrift && !bluffDrift) return original.name

  let adj = ''
  if (bot.vpip <= 0.14) adj = 'Nitty'
  else if (bot.vpip <= 0.19) adj = 'Tight'
  else if (bot.vpip >= 0.36) adj = 'Wild'
  else if (bot.vpip >= 0.30) adj = 'Loose'
  else if (bot.aggression >= 1.4) adj = 'Aggro'
  else if (bot.aggression <= 0.6) adj = 'Passive'
  else if (bot.bluffFreq >= 0.22) adj = 'Bluffy'
  else if (bot.bluffFreq <= 0.07) adj = 'Honest'
  else adj = 'Custom'

  return `${adj} ${firstName}`
}

/**
 * Generate a plain-English description of a bot's playstyle based on its stats.
 */
export function describeBotStyle(bot: BotStats): string {
  const parts: string[] = []

  if (bot.vpip <= 0.15) parts.push('extremely tight')
  else if (bot.vpip <= 0.20) parts.push('tight')
  else if (bot.vpip <= 0.28) parts.push('moderately selective')
  else if (bot.vpip <= 0.35) parts.push('loose')
  else parts.push('very loose')

  if (bot.aggression >= 1.4) parts.push('highly aggressive')
  else if (bot.aggression >= 1.1) parts.push('aggressive')
  else if (bot.aggression >= 0.8) parts.push('balanced')
  else parts.push('passive')

  let desc = `This is a ${parts.join(', ')} player`

  const pfrRatio = bot.pfr / bot.vpip
  if (pfrRatio > 0.8) desc += ' who raises most of the hands they play'
  else if (pfrRatio < 0.5) desc += ' who prefers calling over raising preflop'

  if (bot.bluffFreq >= 0.22) desc += '. Bluffs frequently — call them down with medium-strength hands.'
  else if (bot.bluffFreq >= 0.14) desc += '. Will bluff occasionally, especially in position.'
  else if (bot.bluffFreq <= 0.08) desc += '. Rarely bluffs — when they bet big, believe them.'
  else desc += '.'

  if (bot.creativeFreq >= 0.07) desc += ' Expect unorthodox plays like limp-reraises and check-raise bluffs.'

  return desc
}

/**
 * List of fictional bot names (non-pro).
 */
export const FICTIONAL_NAMES = ['Tight Tony', 'Loose Lucy', 'Aggressive Alex', 'Calling Carl', 'Tricky Tina', 'Solid Sam', 'Wild Wendy']

/**
 * Check if a persona name is a pro (not fictional).
 */
export function isPro(name: string): boolean {
  return !FICTIONAL_NAMES.includes(name) && config.personas.some(p => p.name === name)
}
