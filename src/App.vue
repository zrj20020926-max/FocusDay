<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from './stores/app'
import { useTaskStore } from './stores/taskStore'
import { useTimerStore } from './stores/timerStore'
import AppSidebar from './components/AppSidebar.vue'
import RightPanel from './components/RightPanel.vue'
import CommandPalette from './components/CommandPalette.vue'
import TaskDrawer from './components/TaskDrawer.vue'
import { PanelRightOpen } from 'lucide-vue-next'

const store = useAppStore()
const taskStore = useTaskStore()
const timerStore = useTimerStore()
const route = useRoute()
void taskStore.initialize()
timerStore.initialize()

function onKeydown(e: KeyboardEvent) {
  if (e.repeat) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); store.commandOpen = !store.commandOpen }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); store.commandOpen = true }
  if (e.key === 'Escape') {
    if (store.focusFullscreen) store.focusFullscreen = false
    else if (store.taskDrawerOpen) store.taskDrawerOpen = false
    else store.commandOpen = false
  }
}
const stopScrollWatch = watch(
  () => store.commandOpen || store.taskDrawerOpen || store.focusFullscreen,
  locked => { document.body.style.overflow = locked ? 'hidden' : '' },
  { immediate: true }
)
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); stopScrollWatch(); document.body.style.overflow = '' })
</script>

<template>
  <div class="app-shell" :class="{ 'panel-collapsed': !store.rightPanelOpen }">
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
    <transition name="toast"><div v-if="store.toast" class="toast"><span class="toast-dot">✓</span>{{ store.toast }}</div></transition>
  </div>
</template>
