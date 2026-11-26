import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { primeTheme } from './stores/themeStore'
import { Capacitor } from '@capacitor/core'
import { databaseService } from './services/database/DatabaseService'
import { readStoredNativeSession, readStoredWebSession } from './services/supabase/NativeAuthStorage'
import { useAuthStore } from './stores/authStore'
import './styles.css'
import './parts.css'
import './extras.css'
import './responsive.css'
import './polish.css'
import './detail-polish.css'
import './auth.css'
import './statistics.css'
import './focus-immersive.css'
import './habits.css'
import './notifications.css'
import './achievements.css'
import './themes.css'
import './pwa.css'
import './mobile.css'

async function start() {
  const pinia = createPinia()
  const native = Capacitor.isNativePlatform()
  const session = native ? await readStoredNativeSession() : readStoredWebSession()
  databaseService.selectOwner(session?.user.id ?? null)
  primeTheme()
  if (native) await databaseService.initialize()
  useAuthStore(pinia).applySession(session)
  createApp(App).use(pinia).use(router).mount('#app')
}

void start().catch(() => {
  const app = document.querySelector('#app')
  if (!app) return
  const message = document.createElement('p')
  message.setAttribute('role', 'alert')
  message.textContent = '无法打开本地数据空间。已有数据已保留，请重试。'
  const retry = document.createElement('button')
  retry.className = 'primary-button'
  retry.textContent = '重试'
  retry.onclick = () => window.location.reload()
  const page = document.createElement('main')
  page.className = 'page'
  page.append(message, retry)
  app.replaceChildren(page)
})
