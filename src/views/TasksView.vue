<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, List, Columns3, Search, SlidersHorizontal, MoreHorizontal, CalendarDays, GripVertical } from 'lucide-vue-next'
import TaskItem from '../components/TaskItem.vue'
import { useAppStore, type TaskStatus } from '../stores/app'
const store = useAppStore(); const view = ref<'list'|'board'>('list'); const search = ref(''); const dragging = ref<number|null>(null)
const filtered = computed(() => store.tasks.filter(t => t.title.toLowerCase().includes(search.value.toLowerCase())))
const columns: { key: TaskStatus; label: string; color: string }[] = [{key:'todo',label:'待办',color:'#c2a473'},{key:'doing',label:'进行中',color:'#92aa8b'},{key:'done',label:'已完成',color:'#9ba4b3'}]
function drop(status: TaskStatus) { if (dragging.value) store.moveTask(dragging.value, status); dragging.value = null }
</script>

<template>
  <div class="page tasks-page">
    <header class="page-header tasks-header"><div><span class="eyebrow">TASKS</span><h1>所有任务</h1><p>在这里安放每一件想完成的事。</p></div><button class="primary-button" @click="store.commandOpen=true"><Plus :size="18"/>新建任务</button></header>
    <div class="task-toolbar"><div class="search-box"><Search :size="17"/><input v-model="search" placeholder="搜索任务"/></div><button class="filter-button"><SlidersHorizontal :size="16"/>筛选</button><div class="view-toggle"><button :class="{active:view==='list'}" @click="view='list'"><List :size="17"/>列表</button><button :class="{active:view==='board'}" @click="view='board'"><Columns3 :size="17"/>看板</button></div></div>
    <transition name="view" mode="out-in">
      <section v-if="view==='list'" key="list" class="all-task-list">
        <div class="list-labels"><span>任务</span><span>优先级</span><span>分类</span><span>截止日期</span><span /></div>
        <div v-for="task in filtered" :key="task.id" class="data-task" @click="store.openTask(task.id)">
          <div class="data-title"><button class="task-check" @click.stop="store.toggleTask(task.id)"><span/></button><strong :class="{done:task.completed}">{{task.title}}</strong></div>
          <span class="priority-badge" :class="task.priority">{{task.priority==='high'?'高':task.priority==='medium'?'中':'低'}}</span>
          <span class="category-pill"><i :style="{background:task.color}"/>{{task.category}}</span><span class="due-date"><CalendarDays :size="14"/>{{task.due}}</span><button class="more"><MoreHorizontal :size="18"/></button>
        </div>
      </section>
      <section v-else key="board" class="kanban">
        <div v-for="column in columns" :key="column.key" class="kanban-column" @dragover.prevent @drop="drop(column.key)">
          <header><div><i :style="{background:column.color}"/><strong>{{column.label}}</strong><span>{{filtered.filter(t=>t.status===column.key).length}}</span></div><button><Plus :size="16"/></button></header>
          <div v-for="task in filtered.filter(t=>t.status===column.key)" :key="task.id" class="kanban-card" draggable="true" @dragstart="dragging=task.id" @click="store.openTask(task.id)">
            <GripVertical :size="15" class="kanban-grip"/><span class="category-pill"><i :style="{background:task.color}"/>{{task.category}}</span><strong>{{task.title}}</strong><div><span><CalendarDays :size="14"/>{{task.due}}</span><span>{{task.estimate}} 分钟</span></div>
          </div><button class="add-card"><Plus :size="15"/>添加任务</button>
        </div>
      </section>
    </transition>
  </div>
</template>
