<!--
  分类条目折叠面板积木 — 核心复用组件
  原代码中 game/note/life 三个分类的 HTML 完全重复(3×18行)
  现在只需一个组件复用了三次，传不同 props 即可
  icon prop 现为 SVG key 字符串（由 AppIcon 渲染）
-->
<template>
  <div class="category-group">
    <div class="list-item-trigger" @click="isExpanded = !isExpanded">
      <span><AppIcon :name="icon" :size="16" /> {{ label }} ({{ items.length }})</span>
      <AppIcon name="down" :size="12" class="arrow-icon" :class="{ expanded: isExpanded }" />
    </div>

    <div v-if="isExpanded" class="expanded-entries-wrapper">
      <div v-if="items.length === 0" class="sub-empty-tip">
        暂无{{ label }}条目
      </div>
      <div
        v-for="item in items"
        :key="item.id"
        class="my-entry-single-box"
        @click="$emit('open-item', item, category)"
      >
        <div class="entry-box-header">
          <span class="entry-box-title">{{ item.name }}</span>
          <span class="entry-box-time">
            <AppIcon name="clock" :size="11" /> {{ item.time || '刚刚' }}
          </span>
        </div>
        <div class="entry-box-body">
          {{ item.wiki || '暂无内容描述，点击前往完善...' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'

defineProps({
  category: { type: String, required: true },
  icon:     { type: String, default: '' },
  label:    { type: String, default: '' },
  items:    { type: Array,  default: () => [] }
})
defineEmits(['open-item'])

const isExpanded = ref(false)
</script>

<style scoped>
.category-group { border-bottom: 1px solid var(--color-border-light); }
.category-group:last-child { border-bottom: none; }
.list-item-trigger {
  padding: 16px 20px; font-size: 14px; color: var(--color-text-secondary);
  font-weight: 500; display: flex; justify-content: space-between;
  align-items: center; cursor: pointer; transition: background 0.2s;
}
.list-item-trigger:active { background-color: #f9f9f9; }
.list-item-trigger span {
  display: flex; align-items: center; gap: 4px;
}
.arrow-icon {
  color: #c7c7cc; transition: transform 0.2s ease;
}
.arrow-icon.expanded { transform: rotate(180deg); color: var(--color-accent); }
.expanded-entries-wrapper {
  background-color: #f8f9fc; padding: 12px 16px;
  display: flex; flex-direction: column; gap: 10px;
  border-top: 1px solid var(--color-border-light);
}
.sub-empty-tip { text-align: center; color: var(--color-text-light); font-size: 12px; padding: 10px 0; }
.my-entry-single-box {
  background: #ffffff; border: 1px solid var(--color-border-input);
  border-radius: var(--radius-lg); padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.01); cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.my-entry-single-box:active { transform: scale(0.99); box-shadow: none; background-color: #fafafa; }
.entry-box-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.entry-box-title { font-size: 14px; font-weight: 600; color: var(--color-text-primary); }
.entry-box-time {
  font-size: 11px; color: var(--color-text-muted); font-weight: 400;
  display: flex; align-items: center; gap: 2px; flex-shrink: 0;
}
.entry-box-body {
  font-size: 12px; color: #636366; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;
  white-space: pre-wrap;
}
</style>
