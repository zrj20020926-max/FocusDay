<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { Play, Pause, Square, Maximize2, ChevronDown, Flame, Coffee, Volume2, MoreHorizontal, Minimize2 } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { useTaskStore } from '../stores/taskStore'
type Mode = 'pomodoro'|'stopwatch'|'countdown'
const store = useAppStore(); const taskStore = useTaskStore(); const mode = ref<Mode>('pomodoro'); const running = ref(false); const elapsed = ref(0); const remaining = ref(25*60); let timer:number|undefined
const selectedTaskId = ref('')
const focusableTasks = computed(() => taskStore.sortedTasks.filter(task => task.status !== 'COMPLETED'))
watch(focusableTasks, tasks => { if (!tasks.some(task => task.id === selectedTaskId.value)) selectedTaskId.value = tasks[0]?.id ?? '' }, { immediate: true })
const modeMap = { pomodoro:{label:'番茄钟',sub:'25 分钟专注 · 5 分钟休息'}, stopwatch:{label:'正计时',sub:'自由记录每一段专注'}, countdown:{label:'倒计时',sub:'设定一个明确的结束点'} }
const display = computed(() => { const s=mode.value==='stopwatch'?elapsed.value:remaining.value; return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` })
const progress = computed(() => mode.value==='stopwatch' ? Math.min(88,elapsed.value/36) : (1-remaining.value/(mode.value==='pomodoro'?1500:2700))*100)
function selectMode(m:Mode){ stop(); mode.value=m; elapsed.value=0; remaining.value=m==='countdown'?45*60:25*60 }
function toggle(){ running.value=!running.value; if(running.value) timer=window.setInterval(()=>{ if(mode.value==='stopwatch')elapsed.value++; else if(remaining.value>0)remaining.value-- },1000); else window.clearInterval(timer) }
function stop(){running.value=false;window.clearInterval(timer)}
onUnmounted(stop)
</script>

<template>
  <div class="page focus-page" :class="[`mode-${mode}`,{fullscreen:store.focusFullscreen}]">
    <button v-if="store.focusFullscreen" class="exit-fullscreen" @click="store.focusFullscreen=false"><Minimize2 :size="18"/>退出全屏</button>
    <header v-if="!store.focusFullscreen" class="page-header focus-header"><div><span class="eyebrow">FOCUS</span><h1>专注时刻</h1><p>一次只做一件事，让时间变得清晰。</p></div><div class="streak"><Flame :size="18" fill="currentColor"/><span>连续专注 <strong>6 天</strong></span></div></header>
    <div class="mode-switch"><button v-for="(item,key) in modeMap" :key="key" :class="{active:mode===key}" @click="selectMode(key as Mode)"><span>{{item.label}}</span><small>{{item.sub}}</small></button></div>
    <section class="focus-stage">
      <div class="focus-orbit" :class="{running}">
        <svg viewBox="0 0 340 340"><circle class="orbit-track" cx="170" cy="170" r="154"/><circle class="orbit-progress" cx="170" cy="170" r="154" :style="{'--progress': progress}"/><circle v-if="running" class="orbit-glow" cx="170" cy="16" r="5"/></svg>
        <div class="focus-time"><span>{{ modeMap[mode].label }}</span><strong>{{display}}</strong><small>{{ running ? '正在专注 · 保持呼吸' : mode==='stopwatch' ? '准备好就开始记录' : '准备好就开始吧' }}</small></div>
      </div>
      <div class="focus-task-picker"><i/><select v-model="selectedTaskId" aria-label="选择当前专注任务"><option v-if="!focusableTasks.length" value="">暂无待办任务</option><option v-for="task in focusableTasks" :key="task.id" :value="task.id">{{task.title}}</option></select><ChevronDown :size="18"/></div>
      <div class="focus-controls"><button class="control-secondary" title="结束" @click="stop"><Square :size="18" fill="currentColor"/></button><button class="focus-primary" @click="toggle"><component :is="running?Pause:Play" :size="23" fill="currentColor"/>{{running?'暂停一下':'开始专注'}}</button><button class="control-secondary" title="全屏专注" @click="store.focusFullscreen=true"><Maximize2 :size="19"/></button></div>
    </section>
    <section v-if="!store.focusFullscreen" class="focus-bottom">
      <div class="session-plan"><div class="section-heading"><h3>今日专注节奏</h3><span>3 / 5 轮</span></div><div class="rounds"><span class="done">✓</span><span class="done">✓</span><span class="done">✓</span><span class="active">4</span><span>5</span></div><p>完成下一轮后，建议休息 15 分钟。</p></div>
      <div class="ambient"><div><span class="sound-icon"><Coffee :size="18"/></span><span><strong>环境声音</strong><small>咖啡馆 · 轻柔</small></span></div><button><Volume2 :size="18"/><span class="sound-line"><i/></span></button></div>
      <button class="focus-more"><MoreHorizontal :size="20"/>专注设置</button>
    </section>
  </div>
</template>
