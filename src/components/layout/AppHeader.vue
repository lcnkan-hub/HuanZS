<!--
  顶部搜索/添加栏积木
  Props: tabName(中文Tab名), modelValue(搜索词 v-model)
  Emits: add(点击添加按钮)
-->
<template>
  <div class="header">
    <div class="search-bar">
      <input
        type="text"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
        :placeholder="'搜索' + tabName + '...'"
      />
      <button class="add-btn" @click="$emit('add')">
        <AppIcon name="plus" :size="14" /> 添加
      </button>
    </div>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'

defineProps({
  tabName:    { type: String, default: '' },
  modelValue: { type: String, default: '' }
})
defineEmits(['update:modelValue', 'add'])
</script>

<style scoped>
.header {
  height: var(--header-height);
  background-color: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  display: flex; align-items: center; padding: 0 15px;
}
.search-bar { display: flex; width: 100%; gap: 10px; }
.search-bar input {
  flex: 1; border: none; background-color: var(--color-bg-input);
  border-radius: var(--radius-lg); padding: 8px 15px; font-size: 14px;
}
.add-btn {
  background-color: var(--color-accent); color: white; border: none;
  border-radius: var(--radius-lg); padding: 0 15px;
  font-weight: 500; font-size: 14px; cursor: pointer;
  display: flex; align-items: center; gap: 4px;
  white-space: nowrap;
}
</style>
