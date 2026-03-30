export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },

  ssr: false,

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Hold\'em Simulator',
    },
  },

  compatibilityDate: '2025-03-29',
})
