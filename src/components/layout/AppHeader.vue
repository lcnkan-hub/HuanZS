<!--
  顶部栏积木（2026-11-21 单层重构 · 2026-11-21 视觉分层）
  左边「我的」（呼出浮层），右边搜索框。原来的「添加」下放成列表上方一行卡片式入口。
  分层口径：搜索是这页的主角，给足宽度与留白；「我的」是低频入口，退成幽灵按钮。
  原来两个 44px 实心块并排填满 55px 的栏，上下各只剩 5.5px —— 看谁都像主按钮、谁都不让位。
  Props: modelValue(搜索词 v-model)
  Emits: update:modelValue, mine(点「我的」)
-->
<template>
  <div class="header">
    <button class="mine-btn" type="button" aria-label="我的" @click="$emit('mine')">
      <AppIcon name="mine" :size="17" />
      <span class="mine-label">我的</span>
    </button>
    <div class="search-bar">
      <AppIcon name="search" :size="14" class="search-icon" />
      <input
        type="text"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
        placeholder="搜索记录…"
        aria-label="搜索记录"
      />
    </div>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'

defineProps({
  modelValue: { type: String, default: '' }
})
defineEmits(['update:modelValue', 'mine'])
</script>

<style scoped>
.header {
  height: var(--header-height);
  background-color: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
  display: flex; align-items: center; gap: 6px; padding: 0 16px;
}
/* 「我的」：幽灵按钮 —— 不带底色、字号退一档，只在按下时给浅底反馈。
   盒子高度给足 44（触控铁律，且 check 脚本只认真实 rect，不认 ::after 伪元素）；
   没有底色和边框，所以 44 高不会显得笨重 —— 视觉上只有图标和 13px 的文字。 */
.mine-btn {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 4px;
  height: 44px; padding: 0 8px;
  background-color: transparent; color: var(--color-text-secondary);
  border: none; border-radius: var(--radius-md);
  font-size: var(--text-13); font-weight: 500; white-space: nowrap;
  cursor: pointer; position: relative;
  transition: background-color 0.16s ease, transform 0.16s ease;
}
.mine-btn:active { background-color: var(--color-bg-input); transform: scale(0.97); }

/* 搜索框：34px 高（55 的栏里上下各留 10.5px），放大镜做内嵌提示，不再是空白灰块 */
.search-bar {
  position: relative; flex: 1;
  display: flex; align-items: center; min-width: 0;
}
.search-icon {
  position: absolute; left: 10px;
  color: var(--color-text-muted); pointer-events: none;
}
.search-bar input {
  width: 100%; height: 34px;
  border: none; background-color: var(--color-bg-input);
  border-radius: var(--radius-lg); padding: 0 12px 0 30px;
  font-size: var(--text-14); color: var(--color-text-primary);
  -webkit-appearance: none; appearance: none;
}
.search-bar input::placeholder { color: var(--color-text-muted); }
</style>
