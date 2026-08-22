import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup-env.ts'],
    // testes compartilham um único Postgres embutido
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
})
