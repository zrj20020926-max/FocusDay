import { defineStore } from 'pinia'
import { AchievementRepository } from '../services/database/repositories/AchievementRepository'
import { AchievementService, type AchievementProgress } from '../services/achievement/AchievementService'
import { resolvedTimeZone } from '../services/statistics/StatisticsCalculator'

const repository = new AchievementRepository()
const service = new AchievementService(repository)
let stop: (() => void) | undefined

export const useAchievementStore = defineStore('achievements', {
  state: () => ({
    progress: [] as AchievementProgress[],
    unlockedNotice: [] as AchievementProgress[],
    ready: false,
    error: '',
  }),
  actions: {
    start() {
      if (stop) return
      let active = true
      let processing = false
      let pending: Awaited<ReturnType<typeof repository.snapshot>> | undefined
      let timeZone = resolvedTimeZone()
      const consume = async () => {
        if (processing) return
        processing = true
        try {
          while (active && pending) {
            const snapshot = pending
            pending = undefined
            const result = await service.reconcile(snapshot.activity, snapshot.records, Date.now(), timeZone)
            if (!active) return
            this.progress = result.progress
            this.ready = true
            this.error = ''
            if (result.newlyUnlocked.length) this.unlockedNotice.push(...result.newlyUnlocked)
          }
        } catch {
          if (active) this.error = '暂时无法读取成就，请重试。'
        } finally { processing = false }
      }
      const subscription = repository.observe().subscribe({
        next: snapshot => { pending = snapshot; void consume() },
        error: () => { this.error = '暂时无法读取成就，请重试。' },
      })
      const refresh = () => {
        void repository.snapshot().then(snapshot => {
          if (!active) return
          pending = snapshot
          void consume()
        }).catch(() => { if (active) this.error = '暂时无法读取成就，请重试。' })
      }
      const onFocus = () => {
        const next = resolvedTimeZone()
        if (next === timeZone) return
        timeZone = next
        refresh()
      }
      window.addEventListener('focus', onFocus)
      window.addEventListener('focus-day:data-synced', refresh)
      stop = () => {
        active = false
        subscription.unsubscribe()
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('focus-day:data-synced', refresh)
      }
    },
    stop() { stop?.(); stop = undefined },
    retry() { this.stop(); this.start() },
    dismiss() { this.unlockedNotice = [] },
  },
})
