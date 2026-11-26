<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Bell, CalendarDays, Coffee, Monitor, Sprout, Volume2 } from 'lucide-vue-next'
import {
  browserNotifications, notificationService, reminderRepository,
} from '../../services/notification/notificationRuntime'
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '../../types/notification'
import { openExactAlarmSettings, readNativeNotificationPermissions, usesExactAlarmPermission, usesNativeNotifications } from '../../services/notification/nativeNotifications'

const preferences = ref({ ...DEFAULT_NOTIFICATION_PREFERENCES })
const permission = ref(notificationService.permission())
const exact = ref(false)
const ready = ref(false)
const busy = ref(false)
const message = ref('')
let mounted = false
let permissionStatus: PermissionStatus | undefined
let subscription: { unsubscribe(): void } | undefined
const rows = [
  { key: 'enabled', label: '启用通知', detail: '在应用内显示计时完成和已安排的提醒', icon: Bell },
  { key: 'sound', label: '播放提示音', detail: usesNativeNotifications ? '系统通知使用有声或静音渠道' : '与此页面交互后可播放提示音', icon: Volume2 },
  { key: 'tasks', label: '任务提醒', detail: '在任务详情里设置提醒时间', icon: CalendarDays },
  { key: 'habits', label: '习惯提醒', detail: '在习惯详情里设置每日提醒时间', icon: Sprout },
  { key: 'breaks', label: '休息结束提醒', detail: '短休息或长休息结束时提示', icon: Coffee },
] as const

async function refreshPermission() {
  if (!usesNativeNotifications) { permission.value = notificationService.permission(); return }
  const status = await readNativeNotificationPermissions()
  if (mounted) { permission.value = status.permission; exact.value = status.exact }
}

onMounted(() => {
  mounted = true
  subscription = reminderRepository.observePreferences().subscribe({
    next: () => {
      void notificationService.preferences().then(value => {
        if (!mounted) return
        preferences.value = value
        ready.value = true
      }).catch(() => { message.value = '无法读取通知设置。' })
    },
    error: () => { message.value = '无法读取通知设置。' },
  })
  window.addEventListener('focus', refreshPermission)
  window.addEventListener('focus-day:foreground', refreshPermission)
  document.addEventListener('visibilitychange', refreshPermission)
  void refreshPermission()
  if (!usesNativeNotifications) void navigator.permissions?.query({ name: 'notifications' }).then(status => {
    if (!mounted) return
    permissionStatus = status
    status.addEventListener('change', refreshPermission)
    refreshPermission()
  }).catch(() => undefined)
})

onUnmounted(() => {
  mounted = false
  subscription?.unsubscribe()
  permissionStatus?.removeEventListener('change', refreshPermission)
  window.removeEventListener('focus', refreshPermission)
  window.removeEventListener('focus-day:foreground', refreshPermission)
  document.removeEventListener('visibilitychange', refreshPermission)
})

async function toggle(key: Exclude<keyof NotificationPreferences, 'system'>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  const checked = !preferences.value[key]
  if (checked && (key === 'sound' || (key === 'enabled' && preferences.value.sound))) {
    void browserNotifications.unlockAudio().catch(() => undefined)
  }
  try { preferences.value = await notificationService.updatePreferences({ [key]: checked }) }
  catch { message.value = '保存失败，请重试。' }
  finally { busy.value = false }
}

async function toggleSystem() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    if (preferences.value.system && permission.value !== 'default') {
      preferences.value = await notificationService.updatePreferences({ system: false })
      return
    }
    permission.value = await notificationService.enableSystem()
    preferences.value = await notificationService.preferences()
    if (permission.value === 'default') message.value = '系统通知仍在等待授权。'
  } catch { message.value = '无法开启系统通知，请重试。' }
  finally { busy.value = false }
}

async function requestExactAlarm() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { exact.value = (await openExactAlarmSettings()).exact }
  catch { message.value = '无法打开精确提醒设置。系统仍可尽力投递提醒。' }
  finally { busy.value = false }
}
</script>

<template>
  <section id="notifications" class="setting-section">
    <div class="setting-heading">
      <h2>通知提醒</h2>
      <p v-if="usesNativeNotifications">开启系统通知后，系统会在后台安排提醒，送达时间可能受省电策略影响。</p>
      <p v-else>保持 Focus Day 页面打开即可接收提醒。后台可能延迟，关闭浏览器后普通页面无法发出提醒。</p>
    </div>
    <div v-for="row in rows" :key="row.key" class="setting-row">
      <span class="setting-icon"><component :is="row.icon" :size="18" /></span>
      <div><strong>{{ row.label }}</strong><small>{{ row.detail }}</small></div>
      <button class="switch" :class="{ on: preferences[row.key] }" role="switch" :aria-label="row.label"
        :aria-checked="preferences[row.key]" :disabled="!ready || busy" @click="toggle(row.key)"><span /></button>
    </div>
    <div class="setting-row notification-system-row">
      <span class="setting-icon"><Monitor :size="18" /></span>
      <div>
        <strong>{{ usesNativeNotifications ? '系统通知' : '浏览器系统通知' }}</strong>
        <small v-if="permission==='unsupported'">系统通知不可用，应用内提醒仍可使用。</small>
        <small v-else-if="permission==='denied'">{{ usesNativeNotifications ? '权限已拒绝，可在系统的应用通知设置中允许。' : '权限已拒绝，可在浏览器的站点设置中允许通知。' }}</small>
        <small v-else-if="permission==='granted' && preferences.system">已开启，可在系统通知中心查看。</small>
        <small v-else>需要在当前设备主动授权。</small>
      </div>
      <button class="secondary-button" :aria-label="usesNativeNotifications ? '切换系统通知' : '切换浏览器系统通知'"
        :disabled="!ready || busy || (!preferences.system && (permission==='denied' || permission==='unsupported'))" @click="toggleSystem">
        {{ preferences.system && permission !== 'default' ? '关闭' : '开启' }}
      </button>
    </div>
    <div v-if="usesExactAlarmPermission && preferences.system && permission==='granted'" class="setting-row notification-system-row">
      <span class="setting-icon"><CalendarDays :size="18" /></span>
      <div><strong>精确提醒</strong><small>{{ exact ? '已允许。锁屏和省电时仍可能延迟。' : '未允许。后台通知将由系统按可用时机送达。' }}</small></div>
      <button v-if="!exact" class="secondary-button" :disabled="busy" @click="requestExactAlarm">打开系统设置</button>
    </div>
    <p v-if="message" class="reminder-error" role="status">{{ message }}</p>
  </section>
</template>
