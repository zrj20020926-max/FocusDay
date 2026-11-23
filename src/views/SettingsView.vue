<script setup lang="ts">
import { ref } from 'vue'
import { Bell, Clock3, Palette, PanelRight, Volume2, Sun, ChevronRight, Check } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const notifications = ref(true)
const focusSound = ref(true)
const autoBreak = ref(false)

function toggle(model: 'notifications' | 'focusSound' | 'autoBreak') {
  if (model === 'notifications') notifications.value = !notifications.value
  if (model === 'focusSound') focusSound.value = !focusSound.value
  if (model === 'autoBreak') autoBreak.value = !autoBreak.value
  store.notify('设置已更新')
}
</script>

<template>
  <div class="page settings-page">
    <header class="page-header settings-header">
      <div><span class="eyebrow">PREFERENCES</span><h1>设置</h1><p>让 Focus Day 更贴近你的工作节奏。</p></div>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
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
          <button class="setting-row selectable"><span class="setting-icon"><Clock3 :size="18" /></span><div><strong>默认番茄时长</strong><small>专注 25 分钟，休息 5 分钟</small></div><span class="setting-value">25 分钟</span><ChevronRight :size="17" /></button>
          <div class="setting-row"><span class="setting-icon"><Volume2 :size="18" /></span><div><strong>专注环境声</strong><small>开始专注时播放轻柔的背景声音</small></div><button class="switch" :class="{ on: focusSound }" role="switch" :aria-checked="focusSound" @click="toggle('focusSound')"><span /></button></div>
          <div class="setting-row"><span class="setting-icon"><Sun :size="18" /></span><div><strong>自动开始休息</strong><small>每轮专注结束后自动进入休息</small></div><button class="switch" :class="{ on: autoBreak }" role="switch" :aria-checked="autoBreak" @click="toggle('autoBreak')"><span /></button></div>
        </section>

        <section id="notifications" class="setting-section">
          <div class="setting-heading"><h2>通知提醒</h2><p>仅在真正需要时打扰你。</p></div>
          <div class="setting-row"><span class="setting-icon"><Bell :size="18" /></span><div><strong>任务与计时提醒</strong><small>接收截止时间和专注结束通知</small></div><button class="switch" :class="{ on: notifications }" role="switch" :aria-checked="notifications" @click="toggle('notifications')"><span /></button></div>
        </section>
      </div>
    </div>
  </div>
</template>
