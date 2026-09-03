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
        { property: 'og:image', content: '/og-image.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'No Limit Hold\'em Simulator' },
        { name: 'twitter:description', content: 'Learn poker strategy with intelligent bots, real-time equity, outs, pot odds, and hand ranges.' },
        { name: 'twitter:image', content: '/og-image.png' },
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
