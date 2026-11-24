<!--
  「我的」列表行积木（2026-11-23 重排时新增）
  职责：一行 = 图标 + 标题 +（可选）副行 +（可选）右侧值 +（可选）箭头

  为什么单独成积木：「我的」首页要放四种行（王冠 / 收藏 / 数据 / 锁定），
  拆出来以后行高、左缩进、分隔线、触控区只有一处定义，不会长出第二套行语言。
  （RULES 第 8 条：新功能加新积木，不往 MinePage 里堆样式。）

  行高用 min-height 而不是 height：系统字号放大时行要能长高，裁字是可见的坏。
  分隔线用 `+` 相邻选择器画在**上沿**，左缩进 46px（16 padding + 18 图标 + 12 间距），
  跟正文起点对齐 —— 缩进在这里是语义（同一张卡里的同级项），不是装饰。
-->
<template>
  <button class="mine-row" :class="{ quiet }" type="button" @click="$emit('click')">
    <span class="row-ico"><AppIcon :name="icon" :size="18" /></span>
    <span class="row-txt">
      <span class="row-label">{{ label }}</span>
      <span v-if="meta" class="row-meta">{{ meta }}</span>
    </span>
    <span v-if="hasValue" class="row-val">{{ value }}</span>
    <span v-if="chevron" class="row-chev"><AppIcon name="forward" :size="14" /></span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  icon:    { type: String, required: true },
  label:   { type: String, required: true },
  meta:    { type: String, default: '' },
  value:   { type: [String, Number], default: '' },
  chevron: { type: Boolean, default: true },
  // quiet：锁定这一类「次要 + 低频」的行，文字压一档，不跟主入口抢
  quiet:   { type: Boolean, default: false }
})
defineEmits(['click'])

const hasValue = computed(() => props.value !== '' && props.value !== null && props.value !== undefined)
</script>

<style scoped>
.mine-row {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  width: 100%; min-height: 56px; padding: 9px 16px;
  background: none; border: 0; text-align: left;
  font-family: var(--font-system);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background-color 0.16s ease;
}
.mine-row:active { background: var(--color-bg-input); }

/* 同一张卡里的行之间才画线；第一行不画 */
.mine-row + .mine-row::before {
  content: '';
  position: absolute; left: 46px; right: 0; top: 0; height: 1px;
  background: var(--color-border-light);
}

.row-ico { flex: 0 0 auto; display: flex; color: var(--color-text-secondary); }
.row-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.row-label {
  font-size: var(--text-15); font-weight: 600; line-height: 1.35;
  color: var(--color-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row-meta {
  margin-top: 2px; font-size: var(--text-12); line-height: 1.4;
  color: var(--color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row-val {
  flex: 0 0 auto; font-size: var(--text-12); color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.row-chev { flex: 0 0 auto; display: flex; color: var(--color-text-muted); opacity: 0.5; }

.mine-row.quiet .row-ico { color: var(--color-text-muted); }
.mine-row.quiet .row-label { color: var(--color-text-secondary); font-weight: 500; }
</style>
