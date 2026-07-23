import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.BACKEND_PORT || 4100;

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: 'dist',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${backendPort}`,
    },
  },
}));
