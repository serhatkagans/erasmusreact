import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * React arayüzü `client/` altında yazılır, `dist/` klasörüne derlenir ve
 * aynı Node sunucusu (server.mjs) tarafından sunulur.
 *
 * `base: './'`: uygulama alt dizinde de çalışır (BASE_PATH, ör.
 * ornek.org/eyouthpreneur). Adresler göreli kalır, önek derlemeye gömülmez.
 *
 * Geliştirmede (`npm run dev`) Vite 5173'te açılır, API istekleri 3020'deki
 * sunucuya aktarılır. Sunucu yazma isteklerinde Origin başlığını denetler
 * (CSRF); aktarılan istekte başlık sunucunun kendi adresine çevrilir.
 */
const API = process.env.API_ADRESI || 'http://localhost:3020';
const aktar = {
  target: API,
  changeOrigin: true,
  configure: proxy => proxy.on('proxyReq', istek => {
    if (istek.getHeader('origin')) istek.setHeader('origin', API);
  }),
};

export default defineConfig({
  root: 'client',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, assetsDir: 'assets' },
  server: { port: 5173, proxy: { '/api': aktar, '/takvim.ics': aktar } },
});
