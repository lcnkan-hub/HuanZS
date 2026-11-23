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
.add-bar { padding: 6px 20px 0 20px; }
/* 2026-11-23 去掉白卡：用户看到列表顶上那块白，第一反应是"这里多了块东西"。
   白卡 + 阴影 + 蓝色圆点是三种强调叠一起，压过了下面真正的记录。
   现在只剩一行淡蓝的字和一个小加号 —— 入口在，但不抢戏。 */
.add-btn {
  width: 100%; min-height: 40px;
  display: flex; align-items: center; gap: 8px;
  padding: 0 4px;
  background-color: transparent;
  color: var(--color-accent);
  border: none; border-radius: var(--radius-md);
  font-size: var(--text-15); font-weight: 500;
  text-align: left; cursor: pointer;
  transition: opacity 0.16s ease;
}
.add-btn:active { opacity: 0.55; }
.add-plus {
  flex: 0 0 auto;
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background-color: var(--color-accent);
  color: var(--color-text-on-accent);
}
.add-label { line-height: 1; }
</style>
