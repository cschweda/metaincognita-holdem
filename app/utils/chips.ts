/**
 * Chip denomination and display utilities.
 */
import config from '~/holdem.config'

export interface ChipStack {
  color: string
  value: number
  count: number
}

/**
 * Returns the chip tier name for a given stake level.
 */
export function getChipTier(stakeLevel: number): string {
  return config.stakeToChipTier[stakeLevel as keyof typeof config.stakeToChipTier] || 'medium'
}

/**
 * Breaks a chip amount into denominations for display.
 * Uses greedy algorithm: largest denomination first.
 */
export function breakIntoChips(amount: number, stakeLevel: number): ChipStack[] {
  const tier = getChipTier(stakeLevel)
  const denominations = [...config.chipDenominations[tier as keyof typeof config.chipDenominations]]
    .sort((a, b) => b.value - a.value)

  const stacks: ChipStack[] = []
  let remaining = amount

  for (const denom of denominations) {
    const count = Math.floor(remaining / denom.value)
    if (count > 0) {
      stacks.push({ color: denom.color, value: denom.value, count })
      remaining = Math.round((remaining - count * denom.value) * 100) / 100
    }
  }

  return stacks
}

/**
 * Tailwind classes for chip colors.
 */
export const CHIP_COLORS: Record<string, string> = {
  white: 'bg-gray-100 border-gray-300 text-gray-800',
  red: 'bg-red-600 border-red-800 text-white',
  green: 'bg-green-600 border-green-800 text-white',
  black: 'bg-gray-900 border-gray-700 text-white',
  purple: 'bg-purple-600 border-purple-800 text-white',
  orange: 'bg-orange-500 border-orange-700 text-white',
}
