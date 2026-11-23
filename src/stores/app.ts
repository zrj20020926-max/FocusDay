import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    commandOpen: false,
    taskDrawerOpen: false,
    selectedTaskId: null as string | null,
    rightPanelOpen: true,
    focusFullscreen: false,
    toast: ''
  }),
  actions: {
    openTask(id: string) { this.selectedTaskId = id; this.taskDrawerOpen = true },
    closeTask() { this.taskDrawerOpen = false; this.selectedTaskId = null },
    notify(message: string) {
      this.toast = message
      window.setTimeout(() => { if (this.toast === message) this.toast = '' }, 2600)
    }
  }
})
