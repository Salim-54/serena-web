import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Content-Security-Policy as a <meta> tag, built from VITE_API_URL so the
 * page may only talk to the API and Cloudinary (uploads + images). Limits
 * the damage of any injected script — the refresh token lives in storage.
 */
function csp(apiUrl: string): Plugin {
  const api = new URL(apiUrl).origin;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    `connect-src 'self' ${api} https://api.cloudinary.com`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ');
  return {
    name: 'csp-meta',
    // Production builds only — the dev server needs inline scripts (HMR).
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:3100/api/v1';
  return {
    plugins: [
      react(),
      csp(apiUrl),
      // Installable PWA. The service worker precaches the app shell; API
      // calls (another origin) are never cached, so data is always live.
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['logo.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'RM Utility Portal',
          short_name: 'RM Utility',
          description: 'Hotel maintenance requests and utilities console',
          theme_color: '#f58520',
          background_color: '#f6f6f4',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // Ticket photos: immutable Cloudinary URLs, safe to cache.
              urlPattern: ({ url }) => url.hostname === 'res.cloudinary.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'ticket-photos',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  };
});
