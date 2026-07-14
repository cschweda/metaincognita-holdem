/**
 * The hub exit — the gold METAINCOGNITA wordmark that leaves the simulator for
 * the hub floor at metaincognita.com, where all nine games live.
 *
 * These are contract tests, not cosmetic ones. Every assertion maps to a rule in
 * METAINCOGNITA-GUIDELINES §5 that a well-meaning refactor could plausibly break:
 *
 *   - a REAL anchor — a router push would keep you inside the SPA;
 *   - the SAME TAB — target="_blank" leaves the simulator running behind you.
 *     This is an exit, not a side trip;
 *   - EVERY route, index included. Its neighbours ("Back", "Leave table",
 *     "Setup") hide themselves contextually; this one never may. A player deep
 *     in a hand must always be able to get out;
 *   - an accessible name CONTAINING the visible wordmark verbatim, or it fails
 *     WCAG 2.5.3 Label in Name — "Meta Incognita" reads fine and fails on the
 *     space.
 *
 * The first component tests in this repo; the other 29 suites are pure engine
 * math and stay in the default node environment.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import AppHubLink from '../app/components/AppHubLink.vue'
import DefaultLayout from '../app/layouts/default.vue'
import App from '../app/app.vue'

const HUB_URL = 'https://metaincognita.com'
const WORDMARK = 'METAINCOGNITA'

/** Every real route in app/pages. The bar must be on all of them. */
const ROUTES = ['/', '/career', '/stats', '/bots', '/analysis', '/replay', '/replay-hand']

/**
 * Nuxt auto-imports these; a bare vitest mount does not.
 *
 * NuxtLink/RouterLink are stubbed to a *tagged* anchor, so a router link can
 * never be silently mistaken for a real one: if someone swaps the hub exit's
 * `<a href>` for a `<NuxtLink to>`, it renders `data-router-link` and the
 * "real anchor" test fails instead of quietly passing.
 */
const stubs = {
  UIcon: { template: '<span />' },
  NuxtLink: { template: '<a data-router-link><slot /></a>' },
  RouterLink: { template: '<a data-router-link><slot /></a>' },
}

function mountLink() {
  return mount(AppHubLink, { global: { stubs } })
}

/** The layout as a given route actually renders it, with a live router installed. */
async function mountLayoutAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTES.map(p => ({ path: p, component: { template: '<div>page</div>' } })),
  })
  await router.push(path)
  await router.isReady()

  return mount(DefaultLayout, {
    // Nuxt auto-imports components from app/components; vitest does not, so the
    // REAL AppHubLink is registered here (never a stub — it is the thing under
    // test).
    global: { stubs, plugins: [router], components: { AppHubLink } },
    slots: { default: '<div>page</div>' },
  })
}

describe('hub exit — the way out of the simulator', () => {
  it('is a real anchor to the hub, not a router push', () => {
    const link = mountLink().get('[data-test="hub-link"]')

    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe(HUB_URL)
    // The stub marks anything that resolved to a router link.
    expect(link.attributes('data-router-link')).toBeUndefined()
  })

  it('leaves in the same tab — no target', () => {
    const link = mountLink().get('[data-test="hub-link"]')

    expect(link.attributes('target')).toBeUndefined()
  })

  it('accessible name contains the visible wordmark (WCAG 2.5.3)', () => {
    const link = mountLink().get('[data-test="hub-link"]')
    const visible = link.text().trim()
    const accessibleName = link.attributes('aria-label') ?? ''

    expect(visible).toBe(WORDMARK)
    // Label in Name: the accessible name must CONTAIN the visible label verbatim.
    expect(accessibleName).toContain(visible)
    expect(accessibleName).toBe('METAINCOGNITA — exit the simulator, back to all the games')
  })

  it('hides its icon from assistive tech, so the name is not doubled', () => {
    expect(mountLink().get('[aria-hidden="true"]').exists()).toBe(true)
  })
})

describe('hub exit — reachable from everywhere', () => {
  // The index is the trap: this app's own "Back"/"Setup" links are contextual,
  // and the sibling slots repo hides its "← Floor" link on the floor. The hub
  // exit must not copy that — it renders on the index too.
  it.each(ROUTES)('renders on %s', async (path) => {
    const link = (await mountLayoutAt(path)).get('[data-test="hub-link"]')

    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe(HUB_URL)
  })

  it('is mounted through NuxtLayout, so the layout reaches every route', () => {
    // Without <NuxtLayout> in app.vue, Nuxt never applies layouts/ at all and
    // the bar silently vanishes from the entire app while every test above
    // still passes.
    const app = mount(App, {
      global: {
        stubs: {
          UApp: { template: '<div><slot /></div>' },
          NuxtLayout: { template: '<div data-nuxt-layout><slot /></div>' },
          NuxtPage: { template: '<div data-nuxt-page />' },
        },
      },
    })

    expect(app.find('[data-nuxt-layout] [data-nuxt-page]').exists()).toBe(true)
  })

  it('has no page opting out of the layout', () => {
    // `definePageMeta({ layout: false })` on any page would drop the bar from
    // that route only — the exact "gated exit" this feature exists to prevent.
    const pagesDir = join(import.meta.dirname, '..', 'app', 'pages')

    for (const page of readdirSync(pagesDir).filter(f => f.endsWith('.vue'))) {
      const src = readFileSync(join(pagesDir, page), 'utf8')
      expect(src, `${page} must not override the default layout`)
        .not.toMatch(/definePageMeta\s*\(\s*\{[\s\S]*?layout/)
    }
  })
})
