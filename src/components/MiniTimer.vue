<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Play, Pause, RotateCcw } from 'lucide-vue-next'
const running = ref(false)
const seconds = ref(25 * 60)
let timer: number | undefined
const time = computed(() => `${String(Math.floor(seconds.value / 60)).padStart(2, '0')}:${String(seconds.value % 60).padStart(2, '0')}`)
function toggle() {
  running.value = !running.value
  if (running.value) timer = window.setInterval(() => { if (seconds.value > 0) seconds.value-- }, 1000)
  else window.clearInterval(timer)
}
function reset() { window.clearInterval(timer); running.value = false; seconds.value = 25 * 60 }
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <section class="mini-timer card">
    <div class="section-heading"><div><span class="eyebrow">FOCUS NOW</span><h3>专注计时</h3></div><span class="live-pill"><i />番茄钟</span></div>
    <div class="mini-clock"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="53"/><circle class="progress" cx="60" cy="60" r="53"/></svg><div><strong>{{ time }}</strong><span>保持专注</span></div></div>
    <div class="current-task"><span>正在进行</span><strong>完成 Focus Day 首页视觉稿</strong></div>
    <div class="timer-actions"><button class="timer-reset" @click="reset"><RotateCcw :size="17" /></button><button class="timer-play" @click="toggle"><component :is="running ? Pause : Play" :size="20" fill="currentColor" />{{ running ? '暂停' : '开始专注' }}</button></div>
  </section>
</template>
