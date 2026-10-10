<!--
  账号信息积木（2026-10-10 新增）
  职责：「我的」页里的账号卡片 —— 显示当前登录账号 + 退出登录 / 换个账号
  边界：不做改密码、不做删号（MVP 先不做，等有后端再说）
  退出后整页重载：存储键必须在 boot 时按新登录态重新解析（见 utils/storageScope.js）
-->
<template>
  <div class="account-section">
    <h3><AppIcon name="key" :size="16" /> 账号</h3>

    <div class="account-card">
      <div class="account-row">
        <div class="account-avatar"><AppIcon name="mine" :size="18" /></div>
        <div class="account-info">
          <div class="account-name">{{ account ? account.username : '未登录' }}</div>
          <div class="account-meta">{{ metaLine }}</div>
        </div>
        <span class="account-badge">{{ accountCount }} 个本机账号</span>
      </div>

      <p class="account-note">
        账号和百科数据都只存在这台设备上，各账号互相看不到对方的数据。换手机数据不会跟着走 —— 要带走，用上面的备份中心导出，百科、王冠记忆、聊天记录和图片都在同一个文件里。
      </p>

      <div class="account-actions">
        <button class="acc-btn ghost" type="button" @click="handleSwitch">换个账号</button>
        <button class="acc-btn danger" type="button" @click="handleLogout">退出登录</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import {
  currentAccount, listAccounts, logoutAccount, reloadApp
} from '../../composables/useAccount'

const account = ref(null)
const accountCount = ref(0)

onMounted(() => {
  account.value = currentAccount()
  accountCount.value = listAccounts().length
})

const metaLine = computed(() => {
  if (!account.value) return '本机尚未登录'
  const created = (account.value.createdAt || '').slice(0, 10)
  return created ? `本机账号 · 创建于 ${created}` : '本机账号'
})

/** 换个账号 = 退出后回到登录页（数据各自留着，不会丢） */
const handleSwitch = () => {
  if (!confirm('退出后回到登录页，你的数据不会丢（下次登录还在）。继续？')) return
  logoutAccount()
  reloadApp()
}

const handleLogout = () => {
  if (!confirm('确定退出登录吗？数据保留在本机，下次登录还在。')) return
  logoutAccount()
  reloadApp()
}
</script>

<style scoped>
.account-section { margin-top: 22px; }
.account-section h3 {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 600; color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.account-card {
  background: var(--color-bg-card);
  border-radius: var(--radius-3xl);
  box-shadow: var(--shadow-card);
  padding: 14px 15px;
  border: 1px solid var(--color-border-light);
}

.account-row { display: flex; align-items: center; gap: 11px; }
.account-avatar {
  width: 36px; height: 36px; flex: 0 0 36px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 11px; background: var(--color-bg-input); color: var(--color-text-secondary);
}
.account-info { flex: 1; min-width: 0; }
.account-name {
  font-size: 15px; font-weight: 600; color: var(--color-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.account-meta { font-size: 11.5px; color: var(--color-text-muted); margin-top: 2px; }
.account-badge {
  flex: 0 0 auto; font-size: 11px; padding: 3px 9px; border-radius: 999px;
  background: var(--color-bg-input); color: var(--color-text-muted);
}

.account-note {
  margin-top: 11px; font-size: 11.5px; line-height: 1.65; color: var(--color-text-muted);
}

.account-actions { display: flex; gap: 9px; margin-top: 13px; }
.acc-btn {
  flex: 1; height: 38px;
  border-radius: var(--radius-lg); border: 1px solid var(--color-border);
  font-size: 13.5px; font-family: var(--font-system); font-weight: 500;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1.0), opacity 0.2s, background 0.2s;
}
.acc-btn:active { transform: scale(0.98); }
.acc-btn.ghost  { background: var(--color-bg-card); color: var(--color-text-secondary); }
.acc-btn.danger { background: var(--color-danger-bg); color: var(--color-danger); border-color: transparent; }
</style>
