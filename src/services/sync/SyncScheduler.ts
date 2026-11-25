import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client'
import { syncQueueService, type SyncQueueService } from './SyncQueueService'
import { syncService, type SyncService } from './SyncService'
import { syncStatusService, type SyncStatusService } from './SyncStatusService'

export class SyncScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private realtime: RealtimeChannel | null = null
  private unsubscribeQueue: (() => void) | null = null
  private authSubscription: { unsubscribe(): void } | null = null
  private started = false
  private generation = 0
  private automaticRun = false
  private rerun = false
  private online = () => {
    void this.subscribeRealtime().catch(() => undefined)
    this.schedule(0)
  }
  private offline = () => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    void this.unsubscribeRealtime().catch(() => undefined)
    this.status.setStatus('OFFLINE')
  }
  private visibility = () => { if (document.visibilityState === 'visible') this.schedule(250) }

  constructor(private readonly sync: SyncService = syncService, private readonly queue: SyncQueueService = syncQueueService,
    private readonly status: SyncStatusService = syncStatusService) {}

  async start(): Promise<void> {
    if (this.started || !isSupabaseConfigured) return
    this.started = true
    const generation = ++this.generation
    window.addEventListener('online', this.online)
    window.addEventListener('offline', this.offline)
    document.addEventListener('visibilitychange', this.visibility)
    this.unsubscribeQueue = this.queue.subscribe(() => this.schedule(500))
    this.interval = setInterval(() => this.schedule(0), 60_000)
    const client = await getSupabaseClient()
    if (generation !== this.generation) return
    this.authSubscription = client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') this.online()
      if (event === 'SIGNED_OUT') this.stop()
    }).data.subscription
    const { data } = await client.auth.getSession()
    if (generation !== this.generation) return
    if (!navigator.onLine) this.offline()
    else if (data.session) this.online()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.generation++
    this.rerun = false
    window.removeEventListener('online', this.online)
    window.removeEventListener('offline', this.offline)
    document.removeEventListener('visibilitychange', this.visibility)
    this.unsubscribeQueue?.(); this.unsubscribeQueue = null
    this.authSubscription?.unsubscribe(); this.authSubscription = null
    if (this.timer) clearTimeout(this.timer)
    if (this.interval) clearInterval(this.interval)
    this.timer = null
    this.interval = null
    void this.unsubscribeRealtime().catch(() => undefined)
  }

  schedule(delay = 0): void {
    if (!this.started || !navigator.onLine) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; void this.runAutomatically() }, delay)
  }

  syncNow(): Promise<void> { return this.sync.syncNow() }

  private async runAutomatically() {
    if (!this.started || !navigator.onLine) return
    if (this.automaticRun) { this.rerun = true; return }
    this.automaticRun = true
    try {
      // Wait out an interrupted/manual run before starting the reconnect pass.
      await this.sync.whenIdle()
      if (this.started && navigator.onLine) await this.sync.syncNow()
    } catch { /* SyncService maintains error status and queued writes. */ }
    finally {
      this.automaticRun = false
      if (this.rerun) {
        this.rerun = false
        this.schedule(0)
      }
    }
  }

  private async subscribeRealtime(): Promise<void> {
    if (this.realtime || !this.started || !navigator.onLine) return
    const generation = this.generation
    const client = await getSupabaseClient()
    if (this.realtime || generation !== this.generation || !navigator.onLine) return
    this.realtime = client.channel('focus-day-sync-notifications')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => this.schedule(250))
      .subscribe()
  }
  private async unsubscribeRealtime(): Promise<void> {
    const channel = this.realtime
    if (!channel) return
    this.realtime = null
    const client = await getSupabaseClient()
    await client.removeChannel(channel)
  }
}

export const syncScheduler = new SyncScheduler()
