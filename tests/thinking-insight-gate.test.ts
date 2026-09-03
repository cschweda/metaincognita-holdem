/**
 * The "bot is thinking" pill prints the acting bot's hand strength and
 * reasoning. That is hidden information while the hero is still in the
 * hand, so it may only be shown after the hero folds — or when the player
 * has explicitly switched study mode on.
 */
import { describe, it, expect } from 'vitest'
import { canRevealBotThinking } from '../app/utils/thinkingInsight'

describe('canRevealBotThinking', () => {
  it('hides the insight while the hero is in the hand', () => {
    expect(canRevealBotThinking({ heroFolded: false, studyMode: false })).toBe(false)
  })

  it('shows it once the hero has folded', () => {
    expect(canRevealBotThinking({ heroFolded: true, studyMode: false })).toBe(true)
  })

  it('shows it mid-hand only in study mode', () => {
    expect(canRevealBotThinking({ heroFolded: false, studyMode: true })).toBe(true)
  })
})
