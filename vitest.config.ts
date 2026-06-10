import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname, '.'),
      '@config': resolve(__dirname, 'holdem.config.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
