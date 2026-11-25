<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from './stores/app'
import { useTaskStore } from './stores/taskStore'
import { subscribeToTimerCompletions, useTimerStore } from './stores/timerStore'
import { useFocusSessionStore } from './stores/focusSessionStore'
import { useAuthStore } from './stores/authStore'
import { useAmbientStore } from './stores/ambientStore'
import { useHabitStore } from './stores/habitStore'
import { useAchievementStore } from './stores/achievementStore'
import { useThemeStore } from './stores/themeStore'
import AppSidebar from './components/AppSidebar.vue'
import RightPanel from './components/RightPanel.vue'
import CommandPalette from './components/CommandPalette.vue'
import TaskDrawer from './components/TaskDrawer.vue'
import FocusCompletionDialog from './components/FocusCompletionDialog.vue'
import AchievementNotice from './components/achievement/AchievementNotice.vue'
import PwaUpdateNotice from './components/pwa/PwaUpdateNotice.vue'
import { PanelRightOpen } from 'lucide-vue-next'
import { syncScheduler } from './services/sync/SyncScheduler'
import { startNotifications } from './services/notification/notificationRuntime'
import { pwa, startPwa } from './services/pwa/PwaRuntime'
import { databaseService } from './services/database/DatabaseService'
import { AUTH_STORAGE_KEY } from './services/supabase/client'

const store = useAppStore()
const taskStore = useTaskStore()
const timerStore = useTimerStore()
const focusSessionStore = useFocusSessionStore()
const authStore = useAuthStore()
const ambientStore = useAmbientStore()
const habitStore = useHabitStore()
const achievementStore = useAchievementStore()
const themeStore = useThemeStore()
themeStore.start()
const route = useRoute()
void taskStore.initialize()
void authStore.initialize()
let habitDateInterval: ReturnType<typeof setInterval>
let timerInterval: number
let stopNotifications: (() => void) | undefined
let stopPwa: (() => void) | undefined
const stopSyncWatch = watch(() => authStore.isAuthenticated, authenticated => {
  if (authenticated) void syncScheduler.start().catch(() => undefined)
  else syncScheduler.stop()
})
function onAuthStorage(event: StorageEvent) {
  if (event.key === AUTH_STORAGE_KEY) void authStore.initialize(true)
}

function onKeydown(e: KeyboardEvent) {
  if (pwa.updating) { e.preventDefault(); return }
  if (e.repeat) return
  if (habitStore.drawerOpen || habitStore.formOpen) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); store.commandOpen = !store.commandOpen }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); store.commandOpen = true }
  if (e.key === 'Escape') {
    if (store.focusFullscreen) store.focusFullscreen = false
    else if (store.taskDrawerOpen) store.taskDrawerOpen = false
    else store.commandOpen = false
  }
}
const stopScrollWatch = watch(
  () => store.commandOpen || store.taskDrawerOpen || habitStore.drawerOpen || habitStore.formOpen || store.focusFullscreen || !!focusSessionStore.completionSessionId,
  locked => { document.body.style.overflow = locked ? 'hidden' : '' },
  { immediate: true }
)
async function onDataSynced() {
  await Promise.all([taskStore.refresh(), ambientStore.refreshFromPersistence(),
    habitStore.refresh().catch(() => store.notify('暂时无法刷新习惯')),
    focusSessionStore.refreshFromPersistence().then(() => timerStore.refreshFromPersistence())])
}
onMounted(() => {
  stopPwa = startPwa(async () => {
    await nextTick()
    await Promise.all([timerStore.flushForReload(), ambientStore.flushPending()])
    // IndexedDB queues earlier writes before this barrier, including sync queue entries.
    await databaseService.transaction(async () => undefined)
  })
  achievementStore.start()
  const refreshTimer = () => { if (!pwa.updating) void timerStore.tick() }
  stopNotifications = startNotifications(store.notify, refreshTimer, subscribeToTimerCompletions)
  void timerStore.initialize()
  timerInterval = window.setInterval(refreshTimer, 250)
  void habitStore.observeFocus().catch(() => store.notify('暂时无法读取本地习惯'))
  habitDateInterval = setInterval(() => habitStore.updateDate(), 30_000)
  window.addEventListener('focus', habitStore.updateDate)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('focus-day:data-synced', onDataSynced)
  window.addEventListener('storage', onAuthStorage)
})
onUnmounted(() => {
  stopPwa?.()
  achievementStore.stop()
  themeStore.stop()
  stopNotifications?.()
  window.clearInterval(timerInterval)
  clearInterval(habitDateInterval)
  habitStore.stopObserving()
  window.removeEventListener('focus', habitStore.updateDate)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('focus-day:data-synced', onDataSynced)
  window.removeEventListener('storage', onAuthStorage)
  stopSyncWatch(); syncScheduler.stop(); stopScrollWatch(); document.body.style.overflow = ''
})
</script>

<template>
  <div class="app-shell" :class="{ 'panel-collapsed': !store.rightPanelOpen }" :inert="pwa.updating">
    <AppSidebar />
    <main class="main-stage">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in"><component :is="Component" :key="route.path" /></transition>
      </router-view>
    </main>
    <RightPanel v-if="store.rightPanelOpen" />
    <button v-else class="panel-reopen icon-button" title="展开辅助栏" @click="store.rightPanelOpen = true"><PanelRightOpen :size="19" /></button>
    <CommandPalette />
    <TaskDrawer />
    <FocusCompletionDialog />
    <AchievementNotice />
    <PwaUpdateNotice />
    <transition name="toast"><div v-if="store.toast" class="toast"><span class="toast-dot">✓</span>{{ store.toast }}</div></transition>
  </div>
</template>
