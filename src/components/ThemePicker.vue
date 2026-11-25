<script setup lang="ts">
import { Check, Monitor } from 'lucide-vue-next'
import { useThemeStore } from '../stores/themeStore'
import { THEMES } from '../services/theme/ThemeService'

const theme = useThemeStore()
</script>

<template>
  <div class="theme-picker" role="group" aria-label="选择主题">
    <button v-for="option in THEMES" :key="option.id" type="button" :aria-pressed="theme.preference===option.id"
      class="theme-choice" :disabled="!theme.ready || theme.saving" @click="theme.choose(option.id)">
      <span class="theme-sample" :data-theme="option.id" aria-hidden="true"><i /><i /><i /></span>
      <strong>{{ option.name }}</strong>
      <Check v-if="theme.preference===option.id" :size="16" aria-hidden="true" />
    </button>
    <button type="button" class="theme-choice theme-system" :aria-pressed="theme.preference==='system'"
      :disabled="!theme.ready || theme.saving" @click="theme.choose('system')">
      <span class="theme-system-icon"><Monitor :size="18" /></span>
      <span><strong>跟随系统</strong><small>浅色使用暖纸白，深色使用深夜模式</small></span>
      <Check v-if="theme.preference==='system'" :size="16" aria-hidden="true" />
    </button>
    <p v-if="theme.error" class="theme-error" role="status">{{ theme.error }}</p>
  </div>
</template>
