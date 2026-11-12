/**
 * Hero input guards for the table page — pure, so they can be tested without
 * mounting the page.
 */

export type HotkeyAction = 'fold' | 'call' | 'raise'

/**
 * The game action a keypress stands for: bare F / C / R only. With Cmd, Ctrl
 * or Alt held the key belongs to the browser (Cmd+R reloads, Ctrl+F finds,
 * Cmd+C copies) and must not move chips.
 */
export function hotkeyAction(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): HotkeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  switch (e.key.toLowerCase()) {
    case 'f': return 'fold'
    case 'c': return 'call'
    case 'r': return 'raise'
    default: return null
  }
}

/** A pre-action queued while waiting for the hero's turn. */
export interface QueuedAction {
  type: string   // 'fold' | 'check' | 'call'
  price: number  // what it cost to call when the action was queued
}

/**
 * What a queued pre-action does once the hero's turn arrives — or null when
 * it no longer applies and the hero should decide for themselves.
 *
 * A queued call is consent to the price that was on offer when it was
 * queued, nothing more: if a raise behind has changed the price, it is
 * dropped. A queued check is dropped as soon as there is something to call.
 * A queued fold always goes through.
 */
export function resolveQueuedAction(queued: QueuedAction, toCall: number): 'fold' | 'check' | 'call' | null {
  if (queued.type === 'fold') return 'fold'
  if (queued.type === 'check') return toCall === 0 ? 'check' : null
  if (queued.type === 'call') return toCall > 0 && toCall === queued.price ? 'call' : null
  return null
}

/**
 * The raise-TO total for a bet of `frac` of the pot. Facing a bet, the pot a
 * raise is measured against is the pot after the hero calls — "pot" means
 * call, then raise by everything now in the middle. `pot` includes every bet
 * already made this street (the engine's convention).
 */
export function potFractionRaiseTo(s: { pot: number; toCall: number; heroBet: number }, frac: number): number {
  return Math.round(s.heroBet + s.toCall + frac * (s.pot + s.toCall))
}
