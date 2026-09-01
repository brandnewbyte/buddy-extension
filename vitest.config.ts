import { defineConfig } from 'vitest/config'

// Standalone config on purpose: vite.config.ts loads the CRX extension
// plugin, which has no business running during unit tests.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
})
