import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    // Each test file starts its own in-memory MongoDB; run files one after another so the
    // first-run binary download is not raced and logs stay readable.
    fileParallelism: false,
    testTimeout: 30_000,
    // The first run downloads a MongoDB binary, which can take a while.
    hookTimeout: 300_000,
  },
});
