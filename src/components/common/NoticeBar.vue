<!--
  常驻提示条（2026-10-13 新增 · I15 存储写失败 / I14 导出提醒 共用）
  职责：把「本机存储出事了」和「该导一份备份了」这两件事，稳定地摆在用户眼前。
  边界：
    · 纯展示件 —— 说什么由调用方（App.vue）决定，这里只负责显示与派发动作
    · 不做「永久关闭」：只能当天/本次收起。能被一次忽略就永远消失的提醒等于没有（这正是 I14 的根）
    · 不用 overflow:hidden —— 触控命中区靠 ::after 外扩，被裁掉就等于没外扩（browser 探针会抓到）
  样式规矩：字号只走 --text-N 刻度、颜色只用令牌、动画只碰 transform/opacity
-->
<template>
  <div v-if="notice" class="notice-bar" :class="'kind-' + (notice.kind || 'info')" role="status" aria-live="polite">
    <div class="notice-main">
      <AppIcon :name="notice.icon || 'clock'" :size="14" class="notice-icon" />
      <div class="notice-text">
        <p class="notice-title">{{ notice.title }}</p>
        <p v-if="notice.detail" class="notice-detail">{{ notice.detail }}</p>
      </div>
      <button class="notice-x" type="button" aria-label="收起" @click="$emit('action', 'collapse')">
        <AppIcon name="close" :size="12" />
      </button>
    </div>
    <div v-if="notice.actions && notice.actions.length" class="notice-actions">
      <button
        v-for="a in notice.actions"
        :key="a.value"
        class="notice-btn"
        :class="{ primary: a.primary }"
        type="button"
        @click="$emit('action', a.value)"
      >{{ a.label }}</button>
    </div>
  </div>
</template>

<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  /** { kind:'error'|'info', icon, title, detail, actions:[{label,value,primary}] } | null */
  notice: { type: Object, default: null }
})
defineEmits(['action'])
</script>

<style scoped>
.notice-bar {
  flex: none;
  margin: 6px 12px 0;
  padding: 9px 12px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-card);
  /* 入场只用 transform/opacity（项目动画规矩） */
  animation: notice-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes notice-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.kind-error {
  background: var(--color-danger-bg);
  border-color: var(--color-danger-bg);
}
.kind-info {
  background: var(--color-accent-light);
  border-color: var(--color-accent-light);
}

.notice-main { display: flex; align-items: flex-start; gap: 8px; }
.notice-icon { flex: none; margin-top: 1px; color: var(--color-text-secondary); }
.kind-error .notice-icon { color: var(--color-danger); }
.kind-info  .notice-icon { color: var(--color-accent); }

.notice-text { flex: 1; min-width: 0; }
.notice-title {
  margin: 0;
  font-size: var(--text-13);
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.35;
}
.notice-detail {
  margin: 3px 0 0;
  font-size: var(--text-12);
  /* 次要文字用 secondary 而不是 muted：muted 在浅色底上只是刚过线（I09 的口径） */
  color: var(--color-text-secondary);
  line-height: 1.45;
}

/* 收起：本体 24px，靠 ::after 外扩到 ≥44px 命中区（探针从中心上下探点，认外扩出来的面积） */
.notice-x {
  position: relative;
  flex: none;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
}
.notice-x::after { content: ''; position: absolute; inset: -11px -8px; }

.notice-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 6px;
}
/* 本体约 32px 高 + 上下各 6px 外扩 = 44px 命中区（差一点都不算过，见 browser 探针） */
.notice-btn {
  position: relative;
  border: none;
  padding: 7px 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  font-size: var(--text-13);
  font-weight: 500;
  cursor: pointer;
}
.notice-btn::after { content: ''; position: absolute; inset: -6px -2px; }
.notice-btn.primary {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
}
.kind-error .notice-btn { background: var(--color-bg-card); }
.kind-error .notice-btn.primary {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
}
</style>
