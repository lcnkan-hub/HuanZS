<!--
  账号入口积木（2026-10-10 新增）
  职责：未登录时的全屏门 —— 注册 / 登录本机账号
  边界：不做找回密码、不做云端同步（没有后端）；密码只在本机做加盐哈希
  交互：成功后 emit('authed')，由父组件整页重载 —— 存储键必须在 boot 时重新解析
-->
<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <!-- 品牌 -->
      <div class="auth-brand">
        <div class="brand-icon"><AppIcon name="crown" :size="26" /></div>
        <h1 class="brand-name">寰中枢</h1>
        <p class="brand-sub">{{ isRegisterMode ? '建一个属于你的账号' : '回到你自己的中枢' }}</p>
      </div>

      <!-- 已有账号快捷填入（登录时） -->
      <div v-if="!isRegisterMode && accounts.length" class="auth-chips">
        <button
          v-for="a in accounts" :key="a.id" type="button"
          class="chip" :class="{ 'chip-on': form.username === a.username }"
          @click="pickAccount(a.username)"
        >
          <AppIcon name="mine" :size="12" /><span>{{ a.username }}</span>
        </button>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <label class="auth-field">
          <span class="field-label">用户名</span>
          <input
            v-model="form.username" type="text" class="field-input"
            placeholder="2~20 个字符" autocomplete="username"
            autocapitalize="off" autocorrect="off" spellcheck="false" :disabled="busy"
          />
        </label>

        <label class="auth-field">
          <span class="field-label">密码</span>
          <input
            v-model="form.password" type="password" class="field-input"
            placeholder="至少 6 位" :autocomplete="isRegisterMode ? 'new-password' : 'current-password'"
            :disabled="busy"
          />
        </label>

        <label v-if="isRegisterMode" class="auth-field">
          <span class="field-label">再输一遍密码</span>
          <input
            v-model="form.confirm" type="password" class="field-input"
            placeholder="确认密码" autocomplete="new-password" :disabled="busy"
          />
        </label>

        <p v-if="errorMsg" class="auth-error"><AppIcon name="close" :size="13" />{{ errorMsg }}</p>
        <p v-if="okMsg" class="auth-ok"><AppIcon name="check" :size="13" />{{ okMsg }}</p>

        <button type="submit" class="auth-submit" :disabled="busy">
          {{ busy ? '处理中…' : (isRegisterMode ? '注册并进入' : '登录') }}
        </button>
      </form>

      <!-- 登录 / 注册切换 -->
      <div class="auth-switch">
        <span>{{ isRegisterMode ? '已经有账号了？' : '还没有账号？' }}</span>
        <button type="button" class="link-btn" :disabled="busy" @click="toggleMode">
          {{ isRegisterMode ? '去登录' : '注册一个' }}
        </button>
      </div>

      <p class="auth-note">
        <AppIcon name="shield" :size="13" />
        <span>账号和数据都只存在这台设备上，不会上传。密码只存加密后的结果，不存明文 —— 但这是「本机锁」，防别人随手打开，不防拿到设备的人。</span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import {
  registerAccount, loginAccount, listAccounts, hasAnyAccount
} from '../../composables/useAccount'

const emit = defineEmits(['authed'])

const accounts = ref([])
const busy = ref(false)
const errorMsg = ref('')
const okMsg = ref('')

// 本机一个账号都没有 → 默认落在注册（避免新用户一进来就撞「没有这个用户名」）
const mode = ref(hasAnyAccount() ? 'login' : 'register')
const isRegisterMode = computed(() => mode.value === 'register')

const form = reactive({ username: '', password: '', confirm: '' })

onMounted(() => {
  accounts.value = listAccounts()
})

const toggleMode = () => {
  mode.value = isRegisterMode.value ? 'login' : 'register'
  errorMsg.value = ''
  okMsg.value = ''
  form.password = ''
  form.confirm = ''
}

const pickAccount = (name) => {
  form.username = name
  errorMsg.value = ''
}

const submit = async () => {
  if (busy.value) return
  busy.value = true
  errorMsg.value = ''
  okMsg.value = ''

  try {
    const res = isRegisterMode.value
      ? await registerAccount(form.username, form.password, form.confirm)
      : await loginAccount(form.username, form.password)

    if (!res.ok) {
      errorMsg.value = res.error
      busy.value = false
      return
    }

    if (isRegisterMode.value && res.claimedCount > 0) {
      okMsg.value = `已把本机原有的 ${res.claimedCount} 份数据归到这个账号名下`
      await sleep(650)
    }
    emit('authed', res.account)
  } catch (e) {
    errorMsg.value = '出错了：' + (e && e.message ? e.message : '未知错误')
    busy.value = false
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
</script>

<style scoped>
.auth-wrap {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  padding: 24px 18px;
  background: var(--color-bg-primary);
  overflow-y: auto;
  animation: authIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.0);
}
@keyframes authIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

.auth-card {
  width: 100%; max-width: 360px;
  background: var(--color-bg-card);
  border-radius: var(--radius-3xl);
  box-shadow: var(--shadow-card-md);
  padding: 26px 22px 20px;
}

/* ---- 品牌 ---- */
.auth-brand { text-align: center; margin-bottom: 20px; }
.brand-icon {
  width: 56px; height: 56px; margin: 0 auto 10px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #1d1d1f, #3a3a3c);
  color: #fff;
}
.brand-name { font-size: 21px; font-weight: 600; color: var(--color-text-primary); letter-spacing: 0.02em; }
.brand-sub  { font-size: 13px; color: var(--color-text-muted); margin-top: 4px; }

/* ---- 已有账号 chips ---- */
.auth-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 11px; font-size: 12.5px;
  border: 1px solid var(--color-border); border-radius: 999px;
  background: var(--color-bg-subtle); color: var(--color-text-secondary);
  cursor: pointer; font-family: var(--font-system);
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1.0), opacity 0.2s, border-color 0.2s;
}
.chip-on { border-color: var(--color-accent); color: var(--color-accent); background: var(--color-accent-light); }
.chip:active { transform: scale(0.96); }

/* ---- 表单 ---- */
.auth-form { display: flex; flex-direction: column; gap: 13px; }
.auth-field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12.5px; font-weight: 500; color: var(--color-text-secondary); }
.field-input {
  height: 42px; padding: 0 13px;
  border: 1px solid var(--color-border-input); border-radius: var(--radius-lg);
  background: var(--color-bg-input); color: var(--color-text-primary);
  font-size: 15px; font-family: var(--font-system);
  transition: border-color 0.2s, background 0.2s;
  -webkit-appearance: none; appearance: none;
}
.field-input:focus { outline: none; border-color: var(--color-accent); background: var(--color-bg-card); }
.field-input:disabled { opacity: 0.6; }

.auth-error, .auth-ok {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12.5px; line-height: 1.5;
}
.auth-error { color: var(--color-danger); }
.auth-ok    { color: #34a853; }

.auth-submit {
  height: 44px; margin-top: 3px;
  border: none; border-radius: var(--radius-lg);
  background: var(--color-accent); color: #fff;
  font-size: 15px; font-weight: 500; font-family: var(--font-system);
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1.0), opacity 0.2s;
}
.auth-submit:active { transform: scale(0.985); }
.auth-submit:disabled { opacity: 0.55; }

/* ---- 切换 ---- */
.auth-switch {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-top: 16px; font-size: 13px; color: var(--color-text-muted);
}
.link-btn {
  border: none; background: none; padding: 0;
  color: var(--color-accent); font-size: 13px; font-family: var(--font-system);
  cursor: pointer;
}
.link-btn:disabled { opacity: 0.5; }

/* ---- 诚实说明 ---- */
.auth-note {
  display: flex; align-items: flex-start; gap: 7px;
  margin-top: 18px; padding-top: 14px;
  border-top: 1px solid var(--color-border-light);
  font-size: 11.5px; line-height: 1.65; color: var(--color-text-muted);
}
</style>
