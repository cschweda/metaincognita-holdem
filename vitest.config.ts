import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  // Compiles single-file components so component tests can import them. Only
  // touches .vue files, so the engine suites are unaffected.
  plugins: [vue()],

  resolve: {
    alias: {
      '~': resolve(__dirname, '.'),
      '@config': resolve(__dirname, 'holdem.config.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/vitest.setup.ts'],
    // The engine suites are pure math and run fastest with no DOM. Component
    // tests opt into one per-file with `@vitest-environment happy-dom`.
    environment: 'node',
  },
})
