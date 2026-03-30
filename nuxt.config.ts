import { resolve } from 'path'

export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },

  ssr: false,

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  alias: {
    '@config': resolve(__dirname, 'holdem.config.ts'),
  },

  app: {
    head: {
      title: 'Hold\'em Simulator',
      meta: [
        { name: 'description', content: 'Browser-based No-Limit Texas Hold\'em poker simulator with intelligent bot opponents, real-time hand analysis, and comprehensive stats. Learn poker strategy through practice.' },
        { property: 'og:title', content: 'Hold\'em Simulator' },
        { property: 'og:description', content: 'Learn poker strategy with intelligent bots, real-time equity, outs, pot odds, and hand ranges.' },
        { property: 'og:image', content: '/og-image.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Hold\'em Simulator' },
        { name: 'twitter:description', content: 'Learn poker strategy with intelligent bots, real-time equity, outs, pot odds, and hand ranges.' },
        { name: 'twitter:image', content: '/og-image.png' },
      ],
    },
  },

  compatibilityDate: '2025-03-29',
})
