import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      injectRegister: null,
      registerType: 'prompt',
      manifest: {
        id: '/',
        name: 'Focus Day',
        short_name: 'Focus Day',
        description: '管理任务、专注计时与习惯的个人效率工具，支持离线使用。',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4f1e9',
        theme_color: '#f4f1e9',
        icons: [
          { src: 'icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only Vite build output and bundled icons. No runtime HTTP caching.
        globPatterns: ['index.html', 'assets/**/*.{js,css,woff,woff2}', 'icons/*.{png,svg}'],
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/(?:tasks|focus|habits|stats|achievements|categories|settings|account)?\/?(?:\?.*)?$/],
        cleanupOutdatedCaches: true,
        importScripts: ['sw-notification.js'],
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  test: { css: { include: [/themes\.css/] } },
})
