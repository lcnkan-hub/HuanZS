<!--
  通用图标组件
  用法：<AppIcon name="game" :size="20" />
  Props: name(图标名称，对应 ICON_MAP 的 key), size(尺寸，默认 20)

  规范：
  - Flexbox 容器居中对齐，防止布局偏移
  - CSS transition 实现点击缩放/变色交互反馈
  - aria-hidden="true"（装饰性图标，按钮本身有文本标签）
-->
<template>
  <span
    class="app-icon"
    :class="sizeClass"
    aria-hidden="true"
    v-html="svgString"
  ></span>
</template>

<script setup>
import { computed } from 'vue'
import { ICON_MAP } from '../../constants/icons'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 20 }
})

const svgString = computed(() => {
  const fn = ICON_MAP[props.name]
  return fn ? fn(props.size) : ''
})

const sizeClass = computed(() => {
  if (props.size <= 14) return 'icon-sm'
  if (props.size >= 28) return 'icon-xl'
  if (props.size >= 24) return 'icon-lg'
  return 'icon-md'
})
</script>

<style scoped>
/* 容器 — Flexbox 居中，防止不同图标留白不一致导致的视觉偏移 */
.app-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  vertical-align: middle;
  line-height: 1;

  /* iOS 原生交互反馈：变色 + 缩放过渡 */
  transition: transform 0.15s ease-out, color 0.2s ease;
  will-change: transform;
}

/* SVG 继承容器颜色 */
.app-icon :deep(svg) {
  display: block;
  color: inherit;
}

/* 尺寸变体 */
.icon-sm :deep(svg) { width: 14px; height: 14px; }
.icon-md :deep(svg) { width: 20px; height: 20px; }
.icon-lg :deep(svg) { width: 24px; height: 24px; }
.icon-xl :deep(svg) { width: 28px; height: 28px; }
</style>
