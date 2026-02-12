import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    testTimeout: 20_000,
    // database tests share one MySQL; run files one after another
    fileParallelism: false,
  },
});
