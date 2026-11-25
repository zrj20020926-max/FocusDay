<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Bell, Clock3, Palette, PanelRight, Volume2, Sun, Cloud, RefreshCw, WifiOff, AlertCircle, Download, Upload, Trash2, LogOut, UserRound, Database, Trophy } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { useTimerStore } from '../stores/timerStore'
import { useAuthStore } from '../stores/authStore'
import { useSyncStatus } from '../composables/useSyncStatus'
import { dataManagementService } from '../services/data/DataManagementService'
import { DataManagementError } from '../types/dataManagement'
import { toUserMessage } from '../services/errors/userMessage'
import NotificationSettings from '../components/notification/NotificationSettings.vue'
import ThemePicker from '../components/ThemePicker.vue'
import PwaSettings from '../components/pwa/PwaSettings.vue'
import { Capacitor } from '@capacitor/core'

const store = useAppStore()
const timerStore = useTimerStore()
const authStore = useAuthStore()
const showWebInstall = import.meta.env.MODE !== 'android' && !Capacitor.isNativePlatform()
const { snapshot: syncSnapshot, syncNow } = useSyncStatus()
const syncing = computed(() => syncSnapshot.value.status === 'SYNCING')
const syncLabel = computed(() => ({ SYNCED: '已同步', SYNCING: '同步中', PENDING: '等待同步', OFFLINE: '离线', ERROR: '同步异常', CONFLICT: '存在冲突' }[syncSnapshot.value.status]))
const lastSyncLabel = computed(() => syncSnapshot.value.lastSyncedAt
  ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(syncSnapshot.value.lastSyncedAt))
  : '尚未同步')
const online = ref(typeof navigator === 'undefined' || navigator.onLine)
const dataBusy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const deleteConfirmOpen = ref(false)
const deleteConfirmation = ref('')
const focusSound = ref(true)
const focusMinutes = ref(timerStore.config.pomodoro.focusDuration / 60000)
const shortBreakMinutes = ref(timerStore.config.pomodoro.shortBreakDuration / 60000)
const longBreakMinutes = ref(timerStore.config.pomodoro.longBreakDuration / 60000)
const longBreakEvery = ref(timerStore.config.pomodoro.longBreakEvery)

watch(() => timerStore.initialized, initialized => {
  if (!initialized) return
  focusMinutes.value = timerStore.config.pomodoro.focusDuration / 60000
  shortBreakMinutes.value = timerStore.config.pomodoro.shortBreakDuration / 60000
  longBreakMinutes.value = timerStore.config.pomodoro.longBreakDuration / 60000
  longBreakEvery.value = timerStore.config.pomodoro.longBreakEvery
}, { immediate: true })

function toggleFocusSound() {
  focusSound.value = !focusSound.value
  store.notify('设置已更新')
}
function saveTimerConfig() {
  timerStore.updateConfig({ pomodoro: {
    focusDuration: Math.max(1, Math.round(focusMinutes.value || 1)) * 60000,
    shortBreakDuration: Math.max(1, Math.round(shortBreakMinutes.value || 1)) * 60000,
    longBreakDuration: Math.max(1, Math.round(longBreakMinutes.value || 1)) * 60000,
    longBreakEvery: Math.max(1, Math.round(longBreakEvery.value || 1)),
  } })
}

const updateNetwork = () => { online.value = navigator.onLine }
onMounted(() => { window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork) })
onUnmounted(() => { window.removeEventListener('online', updateNetwork); window.removeEventListener('offline', updateNetwork) })

async function manualSync() {
  try { await syncNow(); store.notify('数据已同步') }
  catch (error) { store.notify(toUserMessage(error, '同步失败，本地数据已安全保留')) }
}
async function exportData() {
  dataBusy.value = true
  try { dataManagementService.download(await dataManagementService.createBackup(authStore.user?.id ?? null)); store.notify('数据备份已导出') }
  catch (error) { store.notify(toUserMessage(error, '数据导出失败，请稍后重试')) }
  finally { dataBusy.value = false }
}
async function importData(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 10 * 1024 * 1024) { store.notify('备份文件不能超过 10 MB'); return }
  dataBusy.value = true
  try {
    const backup = dataManagementService.parse(await file.text())
    const counts = backup.data
    const habits = backup.schemaVersion >= 2 ? `、${counts.habits.length} 个习惯和 ${counts.habitRecords.length} 条打卡记录` : ''
    const confirmed = window.confirm(`将使用此备份恢复 ${counts.tasks.length} 个任务、${counts.focusSessions.length} 条专注记录${habits}。备份包含的数据类型会替换当前数据，是否继续？`)
    if (!confirmed) return
    await dataManagementService.restore(backup, authStore.user?.id ?? null)
    store.notify('数据恢复完成，待同步到其他设备')
  } catch (error) {
    store.notify(error instanceof DataManagementError ? error.message : toUserMessage(error, '数据恢复失败，原有数据已保留'))
  } finally { dataBusy.value = false }
}
async function logout(clearLocal: boolean) {
  if (clearLocal && !window.confirm('退出登录并清理此设备上的所有 Focus Day 数据？此操作无法撤销。')) return
  if (!await authStore.signOut()) { store.notify(authStore.error || '退出登录失败'); return }
  if (clearLocal) { await dataManagementService.clearLocalData(); window.location.reload(); return }
  store.notify('已退出登录，本地数据仍保留在此设备')
}
async function clearLocalData() {
  if (!window.confirm('确定清理此设备上的任务、专注记录、设置和同步队列？云端数据不会被删除。')) return
  try { await dataManagementService.clearLocalData(); window.location.reload() }
  catch (error) { store.notify(toUserMessage(error, '本地数据清理失败')) }
}
async function deleteAccount() {
  if (deleteConfirmation.value !== 'DELETE') return
  dataBusy.value = true
  try {
    if (!await authStore.deleteAccount()) { store.notify(authStore.error || '账号删除失败'); return }
    await dataManagementService.clearLocalData()
    window.location.reload()
  } catch (error) { store.notify(toUserMessage(error, '账号删除失败，请稍后重试')) }
  finally { dataBusy.value = false }
}
</script>

<template>
  <div class="page settings-page">
    <header class="page-header settings-header">
      <div><span class="eyebrow">PREFERENCES</span><h1>设置</h1><p>让 Focus Day 更贴近你的工作节奏。</p></div>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
        <router-link to="/account"><Cloud :size="18" />账号与云端</router-link>
        <a href="#cloud-sync"><RefreshCw :size="18" />同步状态</a>
        <a href="#data-management"><Database :size="18" />数据管理</a>
        <a class="active" href="#appearance"><Palette :size="18" />外观与布局</a>
        <a href="#focus-preferences"><Clock3 :size="18" />专注偏好</a>
        <a href="#notifications"><Bell :size="18" />通知提醒</a>
        <a v-if="showWebInstall" href="#offline-app"><Download :size="18" />安装与离线</a>
      </nav>

      <div class="settings-content">
        <section id="cloud-sync" class="setting-section sync-section">
          <div class="setting-heading"><h2>云端同步</h2><p>本地数据优先保存，联网并登录后会自动与其他设备同步。</p></div>
          <div class="setting-row sync-status-row">
            <span class="setting-icon"><WifiOff v-if="syncSnapshot.status === 'OFFLINE'" :size="18" /><AlertCircle v-else-if="['ERROR', 'CONFLICT'].includes(syncSnapshot.status)" :size="18" /><Cloud v-else :size="18" /></span>
            <div><strong>{{ syncLabel }}</strong><small>最近同步：{{ lastSyncLabel }} · 待同步 {{ syncSnapshot.pendingCount }} 项</small><small v-if="syncSnapshot.lastError" class="sync-error">{{ syncSnapshot.lastError }}</small></div>
            <button class="sync-button" :disabled="syncing || !authStore.isAuthenticated || !online" @click="manualSync"><RefreshCw :size="16" :class="{ spinning: syncing }" />手动同步</button>
          </div>
          <div class="sync-context">
            <span><UserRound :size="15"/><i>当前账号</i><strong>{{ authStore.user?.email || '本地模式' }}</strong></span>
            <span><component :is="online ? Cloud : WifiOff" :size="15"/><i>网络状态</i><strong>{{ online ? '在线' : '离线' }}</strong></span>
          </div>
        </section>

        <section id="data-management" class="setting-section">
          <div class="setting-heading"><h2>数据管理</h2><p>导出可携带的 JSON 备份，或从同一账号的备份中恢复。</p></div>
          <div class="data-action-grid">
            <button :disabled="dataBusy" @click="exportData"><span class="setting-icon"><Download :size="18"/></span><span><strong>导出数据</strong><small>任务、分类、专注记录与设置</small></span></button>
            <button :disabled="dataBusy" @click="fileInput?.click()"><span class="setting-icon"><Upload :size="18"/></span><span><strong>恢复数据</strong><small>导入前会检查版本和账号归属</small></span></button>
            <input ref="fileInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importData"/>
          </div>
          <div class="setting-row"><span class="setting-icon"><Trash2 :size="18"/></span><div><strong>清理本地数据</strong><small>仅清理当前设备，不删除云端账号与云端数据</small></div><button class="text-danger-button" :disabled="dataBusy" @click="clearLocalData">清理此设备</button></div>
        </section>

        <section id="account-actions" class="setting-section account-actions-section">
          <div class="setting-heading"><h2>账号操作</h2><p>退出时可以明确选择保留或清理当前设备的数据。</p></div>
          <template v-if="authStore.isAuthenticated">
            <div class="account-action-buttons"><button @click="logout(false)"><LogOut :size="16"/>退出并保留本地数据</button><button class="danger" @click="logout(true)"><Trash2 :size="16"/>退出并清理本地数据</button></div>
            <div class="danger-zone">
              <div><strong>删除云端账号</strong><small>将永久删除账号以及关联的云端任务、专注记录和设置。</small></div>
              <button class="text-danger-button" @click="deleteConfirmOpen = true">删除账号</button>
            </div>
            <div v-if="deleteConfirmOpen" class="account-delete-confirm">
              <p>这是不可撤销的操作。请输入 <strong>DELETE</strong> 确认删除当前账号和云端数据。</p>
              <input v-model="deleteConfirmation" autocomplete="off" placeholder="输入 DELETE"/>
              <div><button @click="deleteConfirmOpen = false; deleteConfirmation = ''">取消</button><button class="danger" :disabled="deleteConfirmation !== 'DELETE' || dataBusy" @click="deleteAccount">永久删除</button></div>
            </div>
          </template>
          <div v-else class="setting-row"><span class="setting-icon"><UserRound :size="18"/></span><div><strong>当前使用本地模式</strong><small>登录后可启用多设备同步和云端账号管理</small></div><router-link class="sync-button" to="/account">前往登录</router-link></div>
        </section>
        <section id="appearance" class="setting-section">
          <div class="setting-heading"><h2>外观与布局</h2><p>选择你喜欢的界面呈现方式。</p></div>
          <ThemePicker />
          <router-link to="/achievements" class="setting-row selectable"><span class="setting-icon"><Trophy :size="18" /></span><div><strong>成就</strong><small>查看解锁记录与里程碑进度</small></div></router-link>
          <div class="setting-row">
            <span class="setting-icon"><PanelRight :size="18" /></span>
            <div><strong>默认显示辅助栏</strong><small>启动时展示计时器与今日概览</small></div>
            <button class="switch" :class="{ on: store.rightPanelOpen }" role="switch" :aria-checked="store.rightPanelOpen" @click="store.rightPanelOpen = !store.rightPanelOpen"><span /></button>
          </div>
        </section>

        <section id="focus-preferences" class="setting-section">
          <div class="setting-heading"><h2>专注偏好</h2><p>设置计时过程中的默认体验。</p></div>
          <div class="setting-row timer-config-row"><span class="setting-icon"><Clock3 :size="18" /></span><div><strong>番茄钟节奏</strong><small>修改会应用到下一次计时，进行中的会话不会被打断</small><div class="timer-config-inputs"><label>专注<input v-model.number="focusMinutes" type="number" min="1" @change="saveTimerConfig"/>分</label><label>短休息<input v-model.number="shortBreakMinutes" type="number" min="1" @change="saveTimerConfig"/>分</label><label>长休息<input v-model.number="longBreakMinutes" type="number" min="1" @change="saveTimerConfig"/>分</label><label>每<input v-model.number="longBreakEvery" type="number" min="1" @change="saveTimerConfig"/>轮长休</label></div></div></div>
          <div class="setting-row"><span class="setting-icon"><Volume2 :size="18" /></span><div><strong>专注环境声</strong><small>开始专注时播放轻柔的背景声音</small></div><button class="switch" :class="{ on: focusSound }" role="switch" :aria-checked="focusSound" @click="toggleFocusSound"><span /></button></div>
          <div class="setting-row"><span class="setting-icon"><Sun :size="18" /></span><div><strong>自动衔接阶段</strong><small>每轮专注结束后自动休息，休息结束进入下一轮</small></div><button class="switch on" role="switch" aria-checked="true" disabled><span /></button></div>
        </section>

        <NotificationSettings />
        <PwaSettings v-if="showWebInstall" />
      </div>
    </div>
  </div>
</template>
