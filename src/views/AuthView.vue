<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Cloud, Eye, EyeOff, KeyRound, LogOut, Mail, ShieldCheck, Sparkles } from 'lucide-vue-next'
import { useAuthStore } from '../stores/authStore'

type Mode = 'login' | 'register' | 'reset' | 'update-password'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const mode = ref<Mode>(route.query.mode === 'update-password' ? 'update-password' : 'login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const showPassword = ref(false)
const notice = ref('')

const title = computed(() => mode.value === 'register' ? '创建你的云端空间' : mode.value === 'reset' ? '找回登录密码' : mode.value === 'update-password' ? '设置新密码' : '欢迎回到 Focus Day')
const subtitle = computed(() => mode.value === 'register' ? '同步能力从一个安全的账户开始。' : mode.value === 'reset' ? '我们会向你的邮箱发送安全重置链接。' : mode.value === 'update-password' ? '为账户设置一个新的安全密码。' : '登录后即可为后续多设备同步做好准备。')

watch(() => route.query.mode, value => {
  mode.value = value === 'update-password' ? value : 'login'
})

async function submit() {
  notice.value = ''
  if (mode.value === 'login') {
    if (await auth.signIn(email.value, password.value)) notice.value = '登录成功，云端账户已连接'
  } else if (mode.value === 'register') {
    const result = await auth.signUp(email.value, password.value, displayName.value)
    if (result) notice.value = result.session ? '账户创建成功' : '验证邮件已发送，请前往邮箱完成验证'
  } else if (mode.value === 'reset') {
    if (await auth.requestPasswordReset(email.value)) notice.value = '重置邮件已发送，请检查收件箱'
  } else if (await auth.updatePassword(password.value)) {
    notice.value = '密码已更新'
    mode.value = 'login'
  }
}

async function signOut() {
  if (await auth.signOut()) notice.value = '已安全退出，设备上的本地数据仍然保留'
}

function switchMode(next: Mode) {
  mode.value = next
  auth.error = ''
  notice.value = ''
}
</script>

<template>
  <div class="page auth-page">
    <header class="auth-header">
      <button class="auth-back" @click="router.push('/')">返回今日</button>
      <span class="auth-security"><ShieldCheck :size="16"/>由 Supabase Auth 安全保护</span>
    </header>

    <div class="auth-layout">
      <section class="auth-story">
        <span class="auth-story-mark"><Sparkles :size="23"/></span>
        <span class="eyebrow">FOCUS, EVERYWHERE</span>
        <h1>让每一个专注时刻，<br/>在你的设备间延续。</h1>
        <p>登录是可选的。即使不连接云端，Focus Day 的任务、计时与统计仍会完整保存在当前设备。</p>
        <div class="auth-promises">
          <span><Check :size="15"/>本地功能始终可用</span>
          <span><Check :size="15"/>账户数据受行级权限保护</span>
          <span><Check :size="15"/>不会在浏览器中保存服务端密钥</span>
        </div>
      </section>

      <section class="auth-card">
        <template v-if="auth.isAuthenticated && mode !== 'update-password'">
          <span class="auth-cloud connected"><Cloud :size="25"/></span>
          <span class="eyebrow">CONNECTED</span>
          <h2>云端账户已连接</h2>
          <p class="auth-card-copy">当前以 <strong>{{auth.user?.email}}</strong> 登录。本地修改会在联网时安全同步。</p>
          <div class="account-summary"><div class="avatar large">{{auth.displayName.slice(0,1)}}</div><span><strong>{{auth.displayName}}</strong><small>多设备同步已启用</small></span></div>
          <button class="auth-submit secondary" :disabled="auth.loading" @click="signOut"><LogOut :size="17"/>退出登录</button>
          <p v-if="notice" class="auth-message success">{{notice}}</p>
        </template>

        <template v-else>
          <span class="auth-cloud"><Cloud :size="25"/></span>
          <h2>{{title}}</h2>
          <p class="auth-card-copy">{{subtitle}}</p>

          <div v-if="!auth.configured" class="auth-config-note">云端服务尚未配置。填写环境变量后即可启用登录；本地模式不受影响。</div>
          <p v-else-if="mode !== 'update-password'" class="auth-card-copy">访客数据保留在此设备的本地模式。登录后将打开当前账号的数据空间。</p>

          <div v-if="mode==='login' || mode==='register'" class="auth-tabs">
            <button :class="{active:mode==='login'}" @click="switchMode('login')">登录</button>
            <button :class="{active:mode==='register'}" @click="switchMode('register')">注册</button>
          </div>

          <form class="auth-form" @submit.prevent="submit">
            <label v-if="mode==='register'"><span>昵称</span><div class="auth-input"><Sparkles :size="17"/><input v-model="displayName" autocomplete="name" placeholder="如何称呼你"/></div></label>
            <label v-if="mode!=='update-password'"><span>邮箱</span><div class="auth-input"><Mail :size="17"/><input v-model="email" type="email" autocomplete="email" required placeholder="you@example.com"/></div></label>
            <label v-if="mode!=='reset'"><span>{{mode==='update-password'?'新密码':'密码'}}</span><div class="auth-input"><KeyRound :size="17"/><input v-model="password" :type="showPassword?'text':'password'" :autocomplete="mode==='login'?'current-password':'new-password'" required minlength="8" placeholder="至少 8 个字符"/><button type="button" @click="showPassword=!showPassword"><component :is="showPassword?EyeOff:Eye" :size="17"/></button></div></label>
            <button class="auth-submit" :disabled="auth.loading || !auth.configured"><span v-if="auth.loading" class="auth-spinner"/><template v-else>{{mode==='login'?'登录':mode==='register'?'创建账户':mode==='reset'?'发送重置邮件':'更新密码'}}</template></button>
          </form>

          <button v-if="mode==='login'" class="auth-text-button" @click="switchMode('reset')">忘记密码？</button>
          <button v-if="mode==='reset' || mode==='update-password'" class="auth-text-button" @click="switchMode('login')">返回登录</button>
          <p v-if="auth.error" class="auth-message error">{{auth.error}}</p>
          <p v-if="notice" class="auth-message success">{{notice}}</p>
          <button class="auth-local" @click="router.push('/')">暂不登录，继续使用本地模式</button>
        </template>
      </section>
    </div>
  </div>
</template>
