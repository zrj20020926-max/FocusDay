<script setup lang="ts">
import { Download, RefreshCw } from 'lucide-vue-next'
import { applyPwaUpdate, dismissPwaUpdate, pwa } from '../../services/pwa/PwaRuntime'
</script>

<template>
  <Teleport to="body">
    <div v-if="pwa.updating" class="pwa-saving" role="status">
      <div><RefreshCw :size="18" />正在保存本地数据并更新…</div>
    </div>
    <aside v-else-if="pwa.updateReady && !pwa.updateDismissed" class="pwa-update" aria-label="应用更新">
      <div>
        <strong><Download :size="17" />新版本可用</strong>
        <p>{{ pwa.error || '刷新后会恢复当前计时，离线更改仍保存在此设备。' }}</p>
      </div>
      <div class="pwa-update-actions">
        <button class="secondary-button" @click="dismissPwaUpdate">稍后</button>
        <button class="primary-button" @click="applyPwaUpdate">更新并刷新</button>
      </div>
    </aside>
  </Teleport>
</template>
