import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Nome del prodotto: stessi valori di src/config/studio.ts (variabili VITE_PRODOTTO e VITE_PRODOTTO_BREVE). */
function identita(mode: string) {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return { prodotto: env.VITE_PRODOTTO || 'Prevenzioni Incendi STEMA', breve: env.VITE_PRODOTTO_BREVE || 'PI STEMA' };
}

export default defineConfig(({ mode }) => {
  const { prodotto, breve } = identita(mode);
  const titoloHtml: Plugin = {
    name: 'titolo-prodotto',
    transformIndexHtml: (html) => html.replace('%PRODOTTO%', prodotto).replace('%PRODOTTO_BREVE%', breve),
  };
  return {
  base: '/ROA/',
  plugins: [
    react(),
    titoloHtml,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: prodotto,
        short_name: breve,
        description: 'Prevenzione incendi: sopralluoghi, ROA, prove idranti, SCIA e rinnovi (D.P.R. 151/2011)',
        lang: 'it',
        start_url: '/ROA/',
        scope: '/ROA/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#b3261e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json,webmanifest,docx}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/ROA/index.html',
      },
    }),
  ],
  };
});
