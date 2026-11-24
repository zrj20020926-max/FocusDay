<script setup lang="ts">
import { ref, watch } from 'vue'
import { Bell, Clock3, Palette, PanelRight, Volume2, Sun, ChevronRight, Check, Cloud } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { useTimerStore } from '../stores/timerStore'

const store = useAppStore()
const timerStore = useTimerStore()
const notifications = ref(true)
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

function toggle(model: 'notifications' | 'focusSound') {
  if (model === 'notifications') notifications.value = !notifications.value
  if (model === 'focusSound') focusSound.value = !focusSound.value
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
</script>

<template>
  <div class="page settings-page">
    <header class="page-header settings-header">
      <div><span class="eyebrow">PREFERENCES</span><h1>设置</h1><p>让 Focus Day 更贴近你的工作节奏。</p></div>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
        <router-link to="/account"><Cloud :size="18" />账号与云端</router-link>
        <a class="active" href="#appearance"><Palette :size="18" />外观与布局</a>
        <a href="#focus-preferences"><Clock3 :size="18" />专注偏好</a>
        <a href="#notifications"><Bell :size="18" />通知提醒</a>
      </nav>

      <div class="settings-content">
        <section id="appearance" class="setting-section">
          <div class="setting-heading"><h2>外观与布局</h2><p>选择你喜欢的界面呈现方式。</p></div>
          <div class="theme-options">
            <button class="theme-option selected"><span class="theme-preview warm"><i /><i /><i /></span><span><strong>暖白</strong><small>当前主题</small></span><Check :size="17" /></button>
            <button class="theme-option"><span class="theme-preview light"><i /><i /><i /></span><span><strong>明亮</strong><small>更高对比度</small></span></button>
          </div>
          <div class="setting-row">
            <span class="setting-icon"><PanelRight :size="18" /></span>
            <div><strong>默认显示辅助栏</strong><small>启动时展示计时器与今日概览</small></div>
            <button class="switch" :class="{ on: store.rightPanelOpen }" role="switch" :aria-checked="store.rightPanelOpen" @click="store.rightPanelOpen = !store.rightPanelOpen"><span /></button>
          </div>
        </section>

        <section id="focus-preferences" class="setting-section">
          <div class="setting-heading"><h2>专注偏好</h2><p>设置计时过程中的默认体验。</p></div>
          <div class="setting-row timer-config-row"><span class="setting-icon"><Clock3 :size="18" /></span><div><strong>番茄钟节奏</strong><small>修改会应用到下一次计时，进行中的会话不会被打断</small><div class="timer-config-inputs"><label>专注<input v-model.number="focusMinutes" type="number" min="1" @change="saveTimerConfig"/>分</label><label>短休息<input v-model.number="shortBreakMinutes" type="number" min="1" @change="saveTimerConfig"/>分</label><label>长休息<input v-model.number="longBreakMinutes" type="number" min="1" @change="saveTimerConfig"/>分</label><label>每<input v-model.number="longBreakEvery" type="number" min="1" @change="saveTimerConfig"/>轮长休</label></div></div></div>
          <div class="setting-row"><span class="setting-icon"><Volume2 :size="18" /></span><div><strong>专注环境声</strong><small>开始专注时播放轻柔的背景声音</small></div><button class="switch" :class="{ on: focusSound }" role="switch" :aria-checked="focusSound" @click="toggle('focusSound')"><span /></button></div>
          <div class="setting-row"><span class="setting-icon"><Sun :size="18" /></span><div><strong>自动衔接阶段</strong><small>每轮专注结束后自动休息，休息结束进入下一轮</small></div><button class="switch on" role="switch" aria-checked="true" disabled><span /></button></div>
        </section>

        <section id="notifications" class="setting-section">
          <div class="setting-heading"><h2>通知提醒</h2><p>仅在真正需要时打扰你。</p></div>
          <div class="setting-row"><span class="setting-icon"><Bell :size="18" /></span><div><strong>任务与计时提醒</strong><small>接收截止时间和专注结束通知</small></div><button class="switch" :class="{ on: notifications }" role="switch" :aria-checked="notifications" @click="toggle('notifications')"><span /></button></div>
        </section>
      </div>
    </div>
  </div>
</template>
