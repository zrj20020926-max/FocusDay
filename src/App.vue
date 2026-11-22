<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from './stores/app'
import AppSidebar from './components/AppSidebar.vue'
import RightPanel from './components/RightPanel.vue'
import CommandPalette from './components/CommandPalette.vue'
import TaskDrawer from './components/TaskDrawer.vue'
import { PanelRightOpen } from 'lucide-vue-next'

const store = useAppStore()
const route = useRoute()

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); store.commandOpen = !store.commandOpen }
  if (e.key === 'Escape') {
    if (store.focusFullscreen) store.focusFullscreen = false
    else if (store.taskDrawerOpen) store.taskDrawerOpen = false
    else store.commandOpen = false
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
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
