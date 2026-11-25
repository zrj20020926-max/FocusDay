import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const publicEnv = loadEnv(mode, '.', 'VITE_')
  const key = publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  const jwtPayload = key.split('.')[1]
  let role: unknown
  if (jwtPayload) {
    try { role = JSON.parse(atob(jwtPayload.replace(/-/g, '+').replace(/_/g, '/'))).role } catch { /* A publishable key is not a JWT. */ }
  }
  if (key.startsWith('sb_secret_') || role === 'service_role'
    || Object.keys(publicEnv).some(name => /^VITE_SUPABASE_.*(?:SECRET|SERVICE_ROLE)/i.test(name) && publicEnv[name])) {
    throw new Error('客户端构建只允许使用 Supabase Publishable Key 或旧版 anon key。')
  }
  if (mode === 'android' && publicEnv.VITE_SUPABASE_URL && !publicEnv.VITE_SUPABASE_URL.trim().startsWith('https://')) {
    throw new Error('Android 的 Supabase URL 必须使用 HTTPS。')
  }
  return {
    plugins: [
      vue(),
      VitePWA({
        disable: mode === 'android',
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
          navigateFallbackAllowlist: [/^\/(?:tasks|focus|habits|stats|achievements|categories|settings|account|me)?\/?(?:\?.*)?$/],
          cleanupOutdatedCaches: true,
          importScripts: ['sw-notification.js'],
          clientsClaim: true,
          skipWaiting: false,
        },
      }),
    ],
    test: { css: { include: [/themes\.css/] } },
  }
})
