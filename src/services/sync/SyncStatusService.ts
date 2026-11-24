import type { SyncStatusSnapshot, SyncUiStatus } from '../../types/sync'

type Listener = (snapshot: SyncStatusSnapshot) => void

export class SyncStatusService {
  private snapshot: SyncStatusSnapshot = { status: typeof navigator === 'undefined' || navigator.onLine ? 'SYNCED' : 'OFFLINE', pendingCount: 0, lastSyncedAt: null, lastError: null, conflicts: 0 }
  private listeners = new Set<Listener>()

  getSnapshot(): SyncStatusSnapshot { return structuredClone(this.snapshot) }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener) }
  update(update: Partial<SyncStatusSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update }
    for (const listener of this.listeners) listener(this.getSnapshot())
  }
  setStatus(status: SyncUiStatus, error: string | null = null): void { this.update({ status, lastError: error }) }
}

export const syncStatusService = new SyncStatusService()
