import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA — install on phone + offline shell (CLAUDE.md §3 "Тип: PWA"; Stage 11C).
    // Workbox precaches the built app shell; runtime caching keeps Supabase data
    // and images usable offline. The AI proxy (/api/chat) is NEVER cached — it's
    // a live, per-message, rate-limited server call (CLAUDE.md §6).
    VitePWA({
      registerType: 'autoUpdate',
      // Static assets to precache alongside the build output (these live in
      // public/). Only the small icons — the multi-MB hero/globe photos are
      // left to the runtime image cache so the offline shell stays light.
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png'],
      manifest: {
        name: 'CityMate',
        short_name: 'CityMate',
        description: 'Your local friend in a new city — places, services, documents and an AI helper.',
        lang: 'en',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        theme_color: '#007aff', // app accent blue (--color-accent)
        background_color: '#f2f3f7', // app background (--color-bg)
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell (hashed JS/CSS/HTML + small static assets).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Keep the heavy hero/globe photos OUT of precache — they're fetched on
        // demand and kept by the runtime image cache instead (StaleWhileRevalidate).
        globIgnores: [
          '**/alanya-hero.png',
          '**/welcome-globe.png',
          '**/welcome-sky.png',
        ],
        // SPA fallback so deep links work offline; never serve the shell for /api.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // NEVER cache the AI proxy — always hit the network (CLAUDE.md §6).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            // Supabase REST/Storage GETs (content data). Fresh-first so the app
            // shows current data online, but falls back to cache offline.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'supabase-data',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }, // 1 day
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Images (place photos, hero/globe art, remote thumbnails).
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts stylesheet + font files (CSS/woff2).
            urlPattern: ({ url }) =>
              url.hostname === 'fonts.googleapis.com' ||
              url.hostname === 'fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, // 1 year
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
