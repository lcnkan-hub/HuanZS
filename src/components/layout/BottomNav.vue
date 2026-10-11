<!--
  底部导航栏积木
  通过 v-model 绑定当前激活 Tab
  图标使用 AppIcon 组件渲染 SVG
-->
<template>
  <div class="bottom-nav">
    <div
      v-for="item in navItems"
      :key="item.id"
      class="nav-item"
      :class="{ active: modelValue === item.id }"
      @click="$emit('update:modelValue', item.id)"
    >
      <AppIcon :name="item.icon" :size="24" />
      <span class="nav-text">{{ item.text }}</span>
    </div>
  </div>
</template>

<script setup>
import { NAV_ITEMS } from '../../constants/categories'
import AppIcon from '../common/AppIcon.vue'

defineProps({
  modelValue: { type: String, default: 'game' }
})
defineEmits(['update:modelValue'])

const navItems = NAV_ITEMS
</script>

<style scoped>
.bottom-nav {
  height: var(--nav-height); display: flex;
  border-top: 1px solid var(--color-border-light);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding-bottom: calc(18px + var(--safe-bottom));
}
.nav-item {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 3px;
  cursor: pointer; color: var(--color-text-muted); transition: color 0.2s;
  -webkit-tap-highlight-color: transparent;
  min-height: 44px;
}
.nav-item.active { color: var(--color-accent); }
.nav-text { font-size: 10px; font-weight: 500; }
</style>
