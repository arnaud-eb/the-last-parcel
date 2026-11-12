/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  resolve: {
    // Addons import bare 'three'; point it at the WebGPU build so three isn't bundled twice.
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
