import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules/**', 'archive/**', 'tests/fuzzy-matching-*.test.js'],
  },
});
