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
  /* 顶部栏左右内边距：详情页是 0 16px，这里原本 0 15px，差 1px 肉眼看不出来但两条栏并排切换时会轻微跳。
     统一到 16px，和 .detail-header / .sub-editor-header 一致。 */
  display: flex; align-items: center; padding: 0 16px;
}
/* 顶栏高 55、内容原本只有 33 —— 白白空掉 22px，输入框和「添加」却都够不着。
   给这条 44：子项默认 stretch，输入框和按钮一起长到 44，不必各写一遍。 */
.search-bar { display: flex; width: 100%; height: 44px; gap: 10px; }
.search-bar input {
  flex: 1; border: none; background-color: var(--color-bg-input);
  border-radius: var(--radius-lg); padding: 8px 15px; font-size: var(--text-14);
}
.add-btn {
  background-color: var(--color-accent); color: var(--color-text-on-accent); border: none;
  border-radius: var(--radius-lg); padding: 0 15px;
  font-weight: 500; font-size: var(--text-14); cursor: pointer;
  display: flex; align-items: center; gap: 4px;
  white-space: nowrap;
}
</style>
