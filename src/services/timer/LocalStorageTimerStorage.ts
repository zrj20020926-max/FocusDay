import { TimerDomainError, type TimerSnapshot, type TimerStorage } from '../../types/timer'

export const TIMER_STORAGE_KEY = 'focus-day.timer.v1'

export class LocalStorageTimerStorage implements TimerStorage {
  load(): TimerSnapshot | null {
    try {
      const raw = localStorage.getItem(TIMER_STORAGE_KEY)
      if (!raw) return null
      const snapshot = JSON.parse(raw) as TimerSnapshot
      if (snapshot?.state?.version !== 1 || !Array.isArray(snapshot.records) || !snapshot.config) {
        throw new Error('Unsupported timer snapshot')
      }
      return structuredClone(snapshot)
    } catch (error) {
      if (error instanceof TimerDomainError) throw error
      throw new TimerDomainError('无法读取本地计时状态', 'PERSISTENCE_ERROR')
    }
  }

  save(snapshot: TimerSnapshot): void {
    try {
      localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      throw new TimerDomainError('无法保存本地计时状态', 'PERSISTENCE_ERROR')
    }
  }
}
