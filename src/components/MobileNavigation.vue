<script setup lang="ts">
import { CalendarDays, ChartNoAxesCombined, CheckSquare2, Timer, UserRound } from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const route = useRoute()
const items = [
  { to: '/', name: 'today', label: '今日', icon: CalendarDays },
  { to: '/tasks', name: 'tasks', label: '任务', icon: CheckSquare2 },
  { to: '/focus', name: 'focus', label: '专注', icon: Timer },
  { to: '/stats', name: 'stats', label: '统计', icon: ChartNoAxesCombined },
  { to: '/me', name: 'me', label: '我的', icon: UserRound },
]
const profileRoutes = ['me', 'settings', 'account', 'achievements', 'categories']
function active(name: string) { return name === 'me' ? profileRoutes.includes(String(route.name)) : route.name === name }
</script>

<template>
  <nav class="mobile-navigation" aria-label="移动端主导航">
    <RouterLink v-for="item in items" :key="item.name" :to="item.to"
      :class="{ current: active(item.name) }" :aria-current="active(item.name) ? 'page' : undefined">
      <span><component :is="item.icon" :size="21" /></span>{{ item.label }}
    </RouterLink>
  </nav>
</template>
