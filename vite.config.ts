/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone`: HTTPS on the LAN so phones get a secure context (WebGPU needs one).
const phone = process.env.PHONE === '1';

export default defineConfig({
  plugins: [preact(), ...(phone ? [basicSsl()] : [])],
  server: phone ? { host: true, port: 5443 } : undefined,
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
