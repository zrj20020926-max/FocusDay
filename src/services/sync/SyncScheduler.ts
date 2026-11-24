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
  private started = false
  private online = () => this.schedule(0)
  private offline = () => this.status.setStatus('OFFLINE')
  private visibility = () => { if (document.visibilityState === 'visible') this.schedule(250) }

  constructor(private readonly sync: SyncService = syncService, private readonly queue: SyncQueueService = syncQueueService,
    private readonly status: SyncStatusService = syncStatusService) {}

  async start(): Promise<void> {
    if (this.started || !isSupabaseConfigured) return
    this.started = true
    window.addEventListener('online', this.online)
    window.addEventListener('offline', this.offline)
    document.addEventListener('visibilitychange', this.visibility)
    this.unsubscribeQueue = this.queue.subscribe(() => this.schedule(500))
    this.interval = setInterval(() => this.schedule(0), 60_000)
    const client = await getSupabaseClient()
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') { void this.subscribeRealtime(); this.schedule(0) }
      if (event === 'SIGNED_OUT') void this.unsubscribeRealtime()
    })
    const { data } = await client.auth.getSession()
    if (data.session) { await this.subscribeRealtime(); this.schedule(0) }
  }

  stop(): void {
    this.started = false
    window.removeEventListener('online', this.online)
    window.removeEventListener('offline', this.offline)
    document.removeEventListener('visibilitychange', this.visibility)
    this.unsubscribeQueue?.(); this.unsubscribeQueue = null
    if (this.timer) clearTimeout(this.timer)
    if (this.interval) clearInterval(this.interval)
    void this.unsubscribeRealtime()
  }

  schedule(delay = 0): void {
    if (!this.started) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; void this.sync.syncNow().catch(() => undefined) }, delay)
  }

  syncNow(): Promise<void> { return this.sync.syncNow() }

  private async subscribeRealtime(): Promise<void> {
    if (this.realtime) return
    const client = await getSupabaseClient()
    this.realtime = client.channel('focus-day-sync-notifications')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => this.schedule(250))
      .subscribe()
  }
  private async unsubscribeRealtime(): Promise<void> {
    if (!this.realtime) return
    const client = await getSupabaseClient()
    await client.removeChannel(this.realtime)
    this.realtime = null
  }
}

export const syncScheduler = new SyncScheduler()
