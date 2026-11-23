<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Tags, Plus, Pencil, Trash2, Save, X } from 'lucide-vue-next'
import { useTaskStore } from '../stores/taskStore'

const taskStore = useTaskStore()
const creating = ref(false)
const editingId = ref<string | null>(null)
const confirmingId = ref<string | null>(null)
const createDraft = reactive({ name: '', color: '#92aa8b', icon: 'Tag' })
const editDraft = reactive({ name: '', color: '#92aa8b', icon: 'Tag' })

async function createCategory() {
  const created = await taskStore.createCategory(createDraft)
  if (!created) return
  Object.assign(createDraft, { name: '', color: '#92aa8b', icon: 'Tag' })
  creating.value = false
}

function beginEdit(id: string) {
  const category = taskStore.getCategoryById(id)
  if (!category) return
  editingId.value = id
  confirmingId.value = null
  Object.assign(editDraft, { name: category.name, color: category.color, icon: category.icon })
}

async function saveEdit() {
  if (!editingId.value) return
  const saved = await taskStore.updateCategory(editingId.value, editDraft)
  if (saved) editingId.value = null
}

async function remove(id: string) {
  if (confirmingId.value !== id) { confirmingId.value = id; return }
  if (await taskStore.deleteCategory(id)) confirmingId.value = null
}
</script>

<template>
  <div class="page settings-page categories-page">
    <header class="page-header settings-header"><div><span class="eyebrow">CATEGORIES</span><h1>分类管理</h1><p>用清晰的分类组织任务，颜色和图标会同步显示在所有页面。</p></div><button class="primary-button" @click="creating=!creating"><Plus :size="18"/>新建分类</button></header>
    <section v-if="creating" class="category-editor create-editor">
      <span class="setting-icon"><Tags :size="18"/></span>
      <input v-model="createDraft.name" placeholder="分类名称" aria-label="分类名称" />
      <label class="color-input"><input v-model="createDraft.color" type="color" aria-label="分类颜色"/><span>{{createDraft.color}}</span></label>
      <input v-model="createDraft.icon" placeholder="图标名称" aria-label="分类图标" />
      <button class="primary-button" @click="createCategory"><Save :size="16"/>创建</button>
      <button class="icon-button" title="取消" @click="creating=false"><X :size="18"/></button>
    </section>
    <section class="category-list">
      <div class="setting-heading"><h2>全部分类</h2><p>删除分类后，原有任务会自动移动到“其他”，不会产生无效关联。</p></div>
      <div v-for="category in taskStore.categories" :key="category.id" class="category-row">
        <template v-if="editingId===category.id">
          <span class="category-swatch" :style="{background:editDraft.color}">{{editDraft.icon.slice(0,1)}}</span>
          <input v-model="editDraft.name" aria-label="分类名称" />
          <label class="color-input"><input v-model="editDraft.color" type="color" aria-label="分类颜色"/><span>{{editDraft.color}}</span></label>
          <input v-model="editDraft.icon" aria-label="分类图标" />
          <button class="category-action save" @click="saveEdit"><Save :size="16"/>保存</button>
          <button class="icon-button" title="取消编辑" @click="editingId=null"><X :size="18"/></button>
        </template>
        <template v-else>
          <span class="category-swatch" :style="{background:category.color}">{{category.icon.slice(0,1)}}</span>
          <span class="category-copy"><strong>{{category.name}}</strong><small>{{taskStore.tasks.filter(task=>task.categoryId===category.id).length}} 项任务 · {{category.isDefault?'默认分类':'自定义分类'}}</small></span>
          <code>{{category.color}}</code><span class="category-icon-name">{{category.icon}}</span>
          <button class="category-action" @click="beginEdit(category.id)"><Pencil :size="16"/>编辑</button>
          <button v-if="category.id!=='other'" class="category-action danger" :class="{confirming:confirmingId===category.id}" @click="remove(category.id)"><Trash2 :size="16"/>{{confirmingId===category.id?'确认删除':'删除'}}</button>
          <span v-else class="category-protected">兜底分类</span>
        </template>
      </div>
    </section>
  </div>
</template>
