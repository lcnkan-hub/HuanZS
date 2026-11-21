<!--
  本机锁积木（2026-11-21 单人化改造，原名「账号信息」）
  职责：说明这台设备上只有一份数据，并提供一个「锁上」的出口。
  为什么不再叫「账号」：产品只服务一个人、不联网、不换账号 ——
  「换个账号」「N 个本机账号」这些语义在这里只会让人以为自己装了半个多用户系统。
  锁定后整页重载：存储键必须在 boot 时按登录态重新解析（见 utils/storageScope.js）
-->
<template>
  <div class="account-section">
    <h3><AppIcon name="key" :size="16" /> 本机锁</h3>

    <div class="account-card">
      <div class="account-row">
        <div class="account-avatar"><AppIcon name="mine" :size="18" /></div>
        <div class="account-info">
          <div class="account-name">{{ account ? account.username : '未登录' }}</div>
          <div class="account-meta">{{ metaLine }}</div>
        </div>
      </div>

      <p class="account-note">
        所有东西都只存在这台设备上，没有云端、也不会同步到别处。换手机数据不会跟着走 —— 要带走，用下面的备份中心导出，记录、王冠记忆、聊天记录和图片都在同一个文件里。
      </p>

      <div class="account-actions">
        <button class="acc-btn danger" type="button" @click="handleLock">锁定本机</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { currentAccount, logoutAccount, reloadApp } from '../../composables/useAccount'

const account = ref(null)

onMounted(() => {
  account.value = currentAccount()
})

const metaLine = computed(() => {
  if (!account.value) return '本机尚未解锁'
  const created = (account.value.createdAt || '').slice(0, 10)
  return created ? `本机 · 创建于 ${created}` : '本机'
})

/** 锁定：回到密码页。不是「退出登录」那种多人语义，数据一个字节都不动。
    也不弹原生 confirm —— 锁上不是破坏性操作，解锁只要输密码。 */
function handleLock() {
  logoutAccount()
  reloadApp()
}
</script>

<style scoped>
.account-section { margin-top: 22px; }
.account-section h3 {
  display: flex; align-items: center; gap: 7px;
  font-size: var(--text-13); font-weight: 600; color: var(--color-text-secondary);
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
  font-size: var(--text-15); font-weight: 600; color: var(--color-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.account-meta { font-size: var(--text-12); color: var(--color-text-muted); margin-top: 2px; }

.account-note {
  margin-top: 11px; font-size: var(--text-12); line-height: 1.65; color: var(--color-text-muted);
}

.account-actions { display: flex; gap: 9px; margin-top: 13px; }
.acc-btn {
  flex: 1; height: 44px;
  border-radius: var(--radius-lg); border: 1px solid var(--color-border);
  font-size: var(--text-14); font-family: var(--font-system); font-weight: 500;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1.0), opacity 0.2s, background 0.2s;
}
.acc-btn:active { transform: scale(0.98); }
.acc-btn.ghost  { background: var(--color-bg-card); color: var(--color-text-secondary); }
.acc-btn.danger { background: var(--color-danger-bg); color: var(--color-danger); border-color: transparent; }
</style>
