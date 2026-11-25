<script setup lang="ts">
import { computed } from 'vue'
import { Check, LockKeyhole, Trophy } from 'lucide-vue-next'
import { useAchievementStore } from '../stores/achievementStore'
import AchievementBadge from '../components/achievement/AchievementBadge.vue'

const store = useAchievementStore()
const earned = computed(() => store.progress.filter(item => item.unlock).length)
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' })
const displayProgress = (value: number) => Number.isInteger(value) ? value : Math.floor(value * 10) / 10
</script>

<template>
  <div class="page achievements-page">
    <header class="page-header">
      <div><h1>成就</h1><p>回顾专注与行动积累的里程碑。</p></div>
      <span v-if="store.ready" class="achievement-total"><Trophy :size="17" />已解锁 {{ earned }} / {{ store.progress.length }}</span>
    </header>
    <p v-if="store.error" class="achievement-loading" role="status">
      {{ store.error }} <button class="secondary-button" @click="store.retry()">重试</button>
    </p>
    <p v-else-if="!store.ready" class="achievement-loading" role="status">正在读取成就…</p>
    <ul v-else class="achievement-list">
      <li v-for="(item, index) in store.progress" :key="item.definition.id" class="achievement-card" :style="{ '--badge-delay': index * 32 + 'ms' }">
        <div class="achievement-card-top">
          <AchievementBadge :definition="item.definition" :unlocked="!!item.unlock" />
          <span v-if="item.unlock" class="achievement-status earned"><Check :size="13" />已解锁</span>
          <span v-else class="achievement-status"><LockKeyhole :size="13" />未解锁</span>
        </div>
        <h2>{{ item.definition.title }}</h2>
        <p>{{ item.definition.description }}</p>
        <time v-if="item.unlock" :datetime="item.unlock.unlockedAt">解锁于 {{ dateFormat.format(new Date(item.unlock.unlockedAt)) }}</time>
        <div v-else class="achievement-progress">
          <progress :value="item.progress" :max="item.definition.target" :aria-label="item.definition.title + '解锁进度'" />
          <span>{{ displayProgress(item.progress) }} / {{ item.definition.target }} {{ item.definition.unit }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
