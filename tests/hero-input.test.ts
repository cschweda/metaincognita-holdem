/**
 * Hero input guards on the table page:
 *
 *  - f/c/r are game hotkeys only when pressed bare — Cmd+R / Ctrl+R must
 *    reload the page, not fire a half-pot raise;
 *  - a queued "Pre-call" is a call of the price that was on offer when it was
 *    queued. If someone raises behind it, the queue is dropped and the hero
 *    decides for themselves;
 *  - the free "Buy More Chips" re-buy does not exist in career mode, where a
 *    buy-in is paid from the bankroll.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hotkeyAction, resolveQueuedAction } from '../app/utils/heroInput'
import { freeRebuyAllowed } from '../app/utils/careerRules'

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods })

const indexVue = readFileSync(join(import.meta.dirname, '..', 'app', 'pages', 'index.vue'), 'utf8')

describe('hotkeys', () => {
  it('maps bare f / c / r, either case', () => {
    expect(hotkeyAction(key('f'))).toBe('fold')
    expect(hotkeyAction(key('C'))).toBe('call')
    expect(hotkeyAction(key('r'))).toBe('raise')
  })

  it('ignores Cmd+R, Ctrl+R and Alt+R', () => {
    expect(hotkeyAction(key('r', { metaKey: true }))).toBeNull()
    expect(hotkeyAction(key('r', { ctrlKey: true }))).toBeNull()
    expect(hotkeyAction(key('r', { altKey: true }))).toBeNull()
  })

  it('ignores Ctrl+F and Cmd+C too', () => {
    expect(hotkeyAction(key('f', { ctrlKey: true }))).toBeNull()
    expect(hotkeyAction(key('c', { metaKey: true }))).toBeNull()
  })

  it('ignores every other key', () => {
    expect(hotkeyAction(key('x'))).toBeNull()
    expect(hotkeyAction(key('Enter'))).toBeNull()
  })

  it('the table page routes its keydown handler through the guard', () => {
    const handler = indexVue.slice(indexVue.indexOf('function onGameKeydown'), indexVue.indexOf('// Keep-alive: bind on activation'))
    expect(handler).toContain('hotkeyAction(e)')
  })
})

describe('queued pre-actions', () => {
  it('a queued call fires at the price it was queued for', () => {
    expect(resolveQueuedAction({ type: 'call', price: 6 }, 6)).toBe('call')
  })

  it('a queued call is dropped when the price has gone up', () => {
    expect(resolveQueuedAction({ type: 'call', price: 6 }, 40)).toBeNull()
  })

  it('a queued call is dropped when there is no longer anything to call', () => {
    expect(resolveQueuedAction({ type: 'call', price: 6 }, 0)).toBeNull()
  })

  it('a queued check fires only when checking is still free', () => {
    expect(resolveQueuedAction({ type: 'check', price: 0 }, 0)).toBe('check')
    expect(resolveQueuedAction({ type: 'check', price: 0 }, 10)).toBeNull()
  })

  it('a queued fold always fires', () => {
    expect(resolveQueuedAction({ type: 'fold', price: 0 }, 0)).toBe('fold')
    expect(resolveQueuedAction({ type: 'fold', price: 6 }, 40)).toBe('fold')
  })

  it('the table page consumes its queue through the guard', () => {
    const watcher = indexVue.slice(indexVue.indexOf('// Handle queued actions when hero\'s turn comes'), indexVue.indexOf('</script>'))
    expect(watcher).toContain('resolveQueuedAction(')
    // the unconditional "call whatever it costs now" is gone
    expect(watcher).not.toMatch(/action === 'call' && gs\.toCall\.value > 0\)/)
  })
})

describe('career mode has no free re-buy', () => {
  it('a free re-buy needs the config switch and a non-career table', () => {
    expect(freeRebuyAllowed(false, true)).toBe(true)
    expect(freeRebuyAllowed(true, true)).toBe(false)
    expect(freeRebuyAllowed(false, false)).toBe(false)
  })

  it('the showdown "Buy More Chips" button is gated on it', () => {
    const at = indexVue.indexOf('Buy More Chips')
    expect(at).toBeGreaterThan(0)
    const button = indexVue.slice(indexVue.lastIndexOf('<UButton', at), at)
    expect(button).toContain('freeRebuyAllowed(careerMode')
  })

  it('a busted career hero is offered the career exit instead', () => {
    const block = indexVue.slice(indexVue.indexOf('<!-- Showdown actions -->'), indexVue.indexOf('<!-- Stats column -->'))
    expect(block).toMatch(/endCareerSession\('felted'\)/)
  })

  it('handleRebuy refuses to run in career mode', () => {
    const fn = indexVue.slice(indexVue.indexOf('function handleRebuy()'), indexVue.indexOf('function backToSetup()'))
    expect(fn).toContain('freeRebuyAllowed(careerMode')
  })
})
