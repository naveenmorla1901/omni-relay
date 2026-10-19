import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Avoid Vite's tsconfck resolver, which cannot resolve Expo's `expo/tsconfig.base`.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        jsx: 'react-jsx',
        target: 'es2022',
        useDefineForClassFields: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
