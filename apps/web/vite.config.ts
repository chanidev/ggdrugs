import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { seedDesignPlugin } from '@seed-design/vite-plugin';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tailwindcss(), seedDesignPlugin(), tsconfigPaths()],
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
  build: {
    chunkSizeWarningLimit: 1000,
    // Windows Node.js 24 + rollup 번들링 크래시 완화: esbuild minifier + 청크 분할
    // NOTE: outDir에 한글 경로 포함 시 @rollup/wasm-node가 SIGKILL(0xC0000005)로 크래시.
    //       pnpm build-win 스크립트로 C:\temp\web-build-tmp 에 빌드 후 dist로 복사.
    minify: 'esbuild',
    cssMinify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      treeshake: false,
      maxParallelFileOps: 1,
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor';
          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) return 'router-vendor';
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n-vendor';
          if (id.includes('node_modules/@seed-design') || id.includes('node_modules/@radix-ui')) return 'ui-vendor';
          if (id.includes('node_modules/')) return 'vendor';
        },
      },
    },
  },
});
