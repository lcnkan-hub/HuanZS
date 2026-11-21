<!--
  「我创建的」数字入口积木（2026-11-21 单层重构版）
  职责：「我的」浮层里唯一的下钻入口 —— 一行数字，点一下关掉浮层、回到记录页并只看我创建的。
  为什么只剩一个数字：分类已下线，记录只有一个池子。
  数值由 props 传入（MinePage 按当前账号算好），本组件不碰存储。
-->
<template>
  <div class="my-items-entry">
    <div class="entry-header">
      <span class="entry-title">我创建的</span>
      <span v-if="count > 0" class="entry-hint">点一下只看这些</span>
    </div>

    <p v-if="count === 0" class="entry-empty">
      还没有你写下的记录 —— 去王冠说一句，它会替你记下来。
    </p>

    <button
      v-else
      class="entry-chip"
      type="button"
      aria-label="只查看我创建的记录"
      @click="$emit('jump')"
    >
      <i class="chip-dot"></i>
      <span class="chip-label">记录</span>
      <span class="chip-num">{{ count }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  count: { type: Number, default: 0 }
})
defineEmits(['jump'])
</script>

<style scoped>
.my-items-entry {
  background: var(--color-bg-card); border-radius: var(--radius-3xl);
  padding: 16px 18px; box-shadow: var(--shadow-card);
  border: 1px solid var(--color-border-light); margin-bottom: 22px;
}

.entry-header {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 12px;
}
.entry-title { font-size: var(--text-15); font-weight: 600; color: var(--color-text-primary); }
.entry-hint { font-size: var(--text-11); color: var(--color-text-muted); }

.entry-empty { font-size: var(--text-12); color: var(--color-text-muted); line-height: 1.6; }

.entry-chip {
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 11px 8px; min-height: 44px; border-radius: var(--radius-lg);
  background: var(--color-bg-subtle); border: 1px solid var(--color-border-light);
  font-size: var(--text-13); color: var(--color-text-secondary); cursor: pointer;
  transition: transform 0.15s, background 0.2s;
}
.entry-chip:active { transform: scale(0.97); }
.chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-num {
  font-size: var(--text-14); font-weight: 700; color: var(--color-accent);
  font-family: var(--font-mono);
}
.chip-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--color-accent); }
</style>
