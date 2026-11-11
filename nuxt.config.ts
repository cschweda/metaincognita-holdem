import { resolve } from 'path'

export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },

  ssr: false,

  modules: ['@nuxt/ui', '@pinia/nuxt'],

  css: ['~/assets/css/main.css'],

  // Embed used icons into the client JS so the static build renders them
  // fully offline — no runtime fetch from api.iconify.design.
  // Required because this is an ssr:false static SPA with no server icon route.
  icon: {
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
    },
  },

  alias: {
    '@config': resolve(__dirname, 'holdem.config.ts'),
  },

  app: {
    head: {
      title: 'No Limit Hold\'em Simulator',
      meta: [
        { name: 'description', content: 'Browser-based No-Limit Texas Hold\'em poker simulator with intelligent bot opponents, real-time hand analysis, and comprehensive stats. Learn poker strategy through practice.' },
        { property: 'og:title', content: 'No Limit Hold\'em Simulator' },
        { property: 'og:description', content: 'Learn poker strategy with intelligent bots, real-time equity, outs, pot odds, and hand ranges.' },
        { property: 'og:image', content: 'https://holdem.metaincognita.com/og-image.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'No Limit Hold\'em Simulator — a poker table with the board and hole cards dealt' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'No Limit Hold\'em Simulator' },
        { name: 'twitter:description', content: 'Learn poker strategy with intelligent bots, real-time equity, outs, pot odds, and hand ranges.' },
        { name: 'twitter:image', content: 'https://holdem.metaincognita.com/og-image.png' },
        { name: 'twitter:image:alt', content: 'No Limit Hold\'em Simulator — a poker table with the board and hole cards dealt' },
      ],
      // Privacy-friendly analytics by Plausible (cookieless page-view counts,
      // no game data). The CSP in netlify.toml allowlists plausible.io for
      // script-src and connect-src — keep the two in step.
      script: [
        { src: 'https://plausible.io/js/pa-fGRv9XF6Jq0o-iG7cryzh.js', async: true },
        { innerHTML: 'window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()' },
      ],
    },
  },

  vite: {
    optimizeDeps: {
      include: ['@vue/devtools-core', '@vue/devtools-kit'],
    },
  },

  compatibilityDate: '2025-03-29',
})
