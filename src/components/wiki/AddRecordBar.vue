<!--
  整行「添加记录」按钮积木（2026-11-21 单层重构）
  位置：搜索框下面，占满一行。点它直接进空白详情页（标题与正文都在详情页里写）。
  只负责抛事件，不碰存储、不切页面（那些由 App.vue 接）。
-->
<template>
  <div class="add-bar">
    <button type="button" class="add-btn" @click="$emit('add')">
      <span class="add-plus"><AppIcon name="plus" :size="14" /></span>
      <span class="add-label">记录</span>
    </button>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'

defineEmits(['add'])
</script>

<style scoped>
.add-bar { padding: 14px 20px 0 20px; }
/* 从「通栏实心蓝块」改成「列表的第一行」：白卡 + 蓝色圆点加号 + 蓝字。
   原来它和搜索框两块等高蓝色矩形叠在首屏顶部，跟内容抢焦点，整页只有一种音量。
   现在蓝色收成一个 26px 的圆点，视觉重心交给下面真实的内容。 */
.add-btn {
  width: 100%; min-height: 48px;
  display: flex; align-items: center; gap: 10px;
  padding: 0 14px;
  background-color: var(--color-bg-card);
  color: var(--color-accent);
  border: none; border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  font-size: var(--text-15); font-weight: 500;
  text-align: left; cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.add-btn:active { transform: scale(0.985); box-shadow: var(--shadow-card-md); }
.add-plus {
  flex: 0 0 auto;
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background-color: var(--color-accent);
  color: var(--color-text-on-accent);
}
.add-label { line-height: 1; }
</style>
