<script setup lang="ts">
import { ref } from 'vue'
import { Download, RefreshCw, WifiOff } from 'lucide-vue-next'
import { applyPwaUpdate, checkForPwaUpdate, promptPwaInstall, pwa } from '../../services/pwa/PwaRuntime'

const checked = ref(false)
async function check() { checked.value = await checkForPwaUpdate() }
</script>

<template>
  <section id="offline-app" class="setting-section">
    <div class="setting-heading">
      <h2>安装与离线</h2>
      <p>首次联网完成缓存后，即可离线使用任务、计时和统计。</p>
    </div>
    <div class="setting-row">
      <span class="setting-icon"><WifiOff :size="18" /></span>
      <div><strong>{{ pwa.offlineReady ? '离线应用已就绪' : '离线应用尚未就绪' }}</strong>
        <small>{{ !pwa.supported ? '需要支持 Service Worker 的浏览器，并通过 HTTPS 或 localhost 打开。' : (pwa.online ? '当前联网' : '当前离线，云端同步已暂停') }}</small>
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-icon"><Download :size="18" /></span>
      <div><strong>安装 Focus Day</strong><small>也可通过浏览器菜单安装。在 iOS Safari 中选择「分享 → 添加到主屏幕」。</small></div>
      <button v-if="pwa.installable" class="secondary-button" @click="promptPwaInstall">安装</button>
    </div>
    <div v-if="pwa.supported" class="setting-row">
      <span class="setting-icon"><RefreshCw :size="18" /></span>
      <div><strong>{{ pwa.updateReady ? '新版本可用' : '应用版本' }}</strong><small v-if="pwa.error || checked" role="status">{{ pwa.error || '已检查更新' }}</small></div>
      <button v-if="pwa.updateReady" class="secondary-button" :disabled="pwa.updating" @click="applyPwaUpdate">更新并刷新</button>
      <button v-else class="secondary-button" :disabled="!pwa.online || !pwa.offlineReady || pwa.checking" @click="check">
        {{ pwa.checking ? '检查中…' : '检查更新' }}
      </button>
    </div>
  </section>
</template>
