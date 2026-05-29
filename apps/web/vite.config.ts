import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    env: {
      VITE_BFF_URL: 'http://localhost',
    },
  },
  // 모노레포 루트 .env 사용 (apps/web/.env 를 따로 두지 않음)
  envDir: '../..',
  server: {
    port: 5173,
    proxy: {
      // BFF — /api/* 는 BFF로 프록시, /api prefix 제거하고 전달
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
