<script setup lang="ts">
import { CalendarDays, CheckSquare2, Timer, ChartNoAxesCombined, Tags, Settings, Plus, Search, Sparkles } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { useTaskStore } from '../stores/taskStore'
const store = useAppStore()
const taskStore = useTaskStore()
const nav = [
  { to: '/', label: '今日', icon: CalendarDays },
  { to: '/tasks', label: '任务', icon: CheckSquare2 },
  { to: '/focus', label: '专注', icon: Timer },
  { to: '/stats', label: '统计', icon: ChartNoAxesCombined },
  { to: '/settings', label: '设置', icon: Settings }
]
</script>

<template>
  <aside class="sidebar">
    <div class="brand"><span class="brand-mark"><Sparkles :size="19" /></span><span>Focus Day</span></div>
    <button class="quick-add" @click="store.commandOpen = true"><Plus :size="18" />新建任务<span>⌘ N</span></button>
    <nav class="nav-section">
      <router-link v-for="item in nav" :key="item.to" :to="item.to" class="nav-item">
        <component :is="item.icon" :size="18" /><span>{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="nav-label">空间</div>
    <nav class="nav-section secondary-nav">
      <router-link to="/categories" class="nav-item"><Tags :size="18" /><span>分类管理</span><span class="nav-count">{{taskStore.categories.length}}</span></router-link>
    </nav>
    <div class="sidebar-spacer" />
    <button class="search-hint" @click="store.commandOpen = true"><Search :size="16" /><span>快速搜索</span><kbd>⌘ K</kbd></button>
    <div class="profile"><div class="avatar">予</div><div><strong>林予安</strong><small>自在专注，慢慢生长</small></div><span class="online" /></div>
  </aside>
</template>
