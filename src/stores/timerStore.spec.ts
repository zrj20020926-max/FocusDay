import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { useTimerStore } from './timerStore'
import { useFocusSessionStore } from './focusSessionStore'
import { databaseService } from '../services/database/DatabaseService'

it('reconciles overlapping ticks, resume and persisted reload into one valid focus session', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const start = new Date('2026-11-26T09:00:00Z')
  vi.setSystemTime(start)
  setActivePinia(createPinia())
  const store = useTimerStore()
  try {
    await store.updateConfig({ countdownDuration: 60_000 })
    await store.selectMode('COUNTDOWN')
    await store.start()
    vi.setSystemTime(+start + 20_000)
    await store.pause()
    vi.setSystemTime(+start + 150_000)
    await store.refreshFromPersistence()
    expect(store.timerState.status).toBe('PAUSED')
    await store.resume()
    vi.setSystemTime(+start + 195_000)
    await Promise.all([store.tick(), store.refreshFromPersistence(), store.tick()])
    expect(store.timerState.status).toBe('COMPLETED')
    expect(useFocusSessionStore().validSessions).toMatchObject([{ duration: 60_000, completedNaturally: true }])
    expect(await databaseService.db.focusSessions.count()).toBe(1)
  } finally {
    await databaseService.delete()
    vi.useRealTimers()
  }
})
