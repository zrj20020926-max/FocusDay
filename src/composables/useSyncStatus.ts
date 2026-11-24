import { onUnmounted, ref } from 'vue'
import { syncScheduler } from '../services/sync/SyncScheduler'
import { syncStatusService } from '../services/sync/SyncStatusService'

export function useSyncStatus() {
  const snapshot = ref(syncStatusService.getSnapshot())
  const unsubscribe = syncStatusService.subscribe(value => { snapshot.value = value })
  onUnmounted(unsubscribe)
  return { snapshot, syncNow: () => syncScheduler.syncNow() }
}
