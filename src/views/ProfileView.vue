<script setup lang="ts">
import { ChevronRight, Settings, Sprout, Tags, Trophy, UserRound } from 'lucide-vue-next'
import { useAuthStore } from '../stores/authStore'

const auth = useAuthStore()
const links = [
  { to: '/account', title: '账号与云端', icon: UserRound },
  { to: '/habits', title: '习惯管理', icon: Sprout },
  { to: '/achievements', title: '成就', icon: Trophy },
  { to: '/categories', title: '分类管理', icon: Tags },
  { to: '/settings', title: '设置', icon: Settings },
]
</script>

<template>
  <div class="page profile-page">
    <header class="page-header"><h1>我的</h1></header>
    <section class="profile-summary" aria-label="当前账号">
      <div class="avatar">{{ auth.displayName.slice(0, 1) }}</div>
      <div><strong>{{ auth.displayName }}</strong><small>{{ auth.isAuthenticated ? '云端账户已连接' : '本地模式' }}</small></div>
    </section>
    <nav class="profile-menu" aria-label="个人空间">
      <RouterLink v-for="item in links" :key="item.to" :to="item.to">
        <span class="setting-icon"><component :is="item.icon" :size="18" /></span>
        <strong>{{ item.title }}</strong><ChevronRight :size="17" />
      </RouterLink>
    </nav>
  </div>
</template>
