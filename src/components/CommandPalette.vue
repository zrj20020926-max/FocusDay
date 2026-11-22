<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search, Plus, Timer, CheckSquare2, BarChart3, CornerDownLeft } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
const store = useAppStore(); const router = useRouter(); const query = ref('')
watch(() => store.commandOpen, open => { if (!open) query.value = '' })
function go(path: string) { router.push(path); store.commandOpen = false }
function submit() { if (query.value.trim()) { store.addTask(query.value); store.commandOpen = false } }
</script>

<template>
  <Teleport to="body"><transition name="modal">
    <div v-if="store.commandOpen" class="modal-backdrop" @mousedown.self="store.commandOpen = false">
      <div class="command-modal">
        <div class="command-search"><Search :size="20" /><input v-model="query" autofocus placeholder="搜索，或输入任务名称快速创建…" @keyup.enter="submit"/><kbd>ESC</kbd></div>
        <div v-if="query" class="command-group"><span class="command-label">快速创建</span><button @click="submit"><span class="command-icon accent"><Plus :size="17" /></span><div><strong>创建“{{ query }}”</strong><small>添加到今天 · 收集箱</small></div><CornerDownLeft :size="16" /></button></div>
        <div class="command-group"><span class="command-label">快速前往</span>
          <button @click="go('/tasks')"><span class="command-icon"><CheckSquare2 :size="17" /></span><div><strong>所有任务</strong><small>查看与整理你的任务</small></div><span class="shortcut">G T</span></button>
          <button @click="go('/focus')"><span class="command-icon"><Timer :size="17" /></span><div><strong>开始专注</strong><small>开启一段沉浸时间</small></div><span class="shortcut">G F</span></button>
          <button @click="go('/stats')"><span class="command-icon"><BarChart3 :size="17" /></span><div><strong>数据回顾</strong><small>看看时间都去了哪里</small></div><span class="shortcut">G S</span></button>
        </div>
        <footer><span>↑↓ 选择</span><span>↵ 确认</span><span>ESC 关闭</span></footer>
      </div>
    </div>
  </transition></Teleport>
</template>
