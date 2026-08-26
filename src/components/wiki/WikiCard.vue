<!--
  单个百科卡片积木
  展示条目名称 + 贡献者，支持删除
-->
<template>
  <div class="data-card" @click="$emit('open')">
    <div class="card-main">
      <span class="item-name">{{ item.name }}</span>
      <span class="creator-tag">贡献者: {{ item.creator }}</span>
    </div>
    <button
      v-if="isOwner"
      class="delete-btn"
      @click.stop="$emit('delete', item.id)"
    >
      <AppIcon name="trash" :size="13" /> 删除
    </button>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'

defineProps({
  item:    { type: Object, required: true },
  isOwner: { type: Boolean, default: false }
})
defineEmits(['open', 'delete'])
</script>

<style scoped>
.data-card {
  background: var(--color-bg-card); border-radius: var(--radius-xl);
  padding: 15px; display: flex; justify-content: space-between;
  align-items: center; box-shadow: var(--shadow-card); cursor: pointer;
  animation: cardFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
@keyframes cardFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.card-main { display: flex; flex-direction: column; gap: 4px; }
.item-name   { font-size: 16px; font-weight: 600; color: var(--color-text-primary); }
.creator-tag { font-size: 12px; color: var(--color-text-muted); }
.delete-btn {
  background-color: var(--color-danger-bg); color: var(--color-danger);
  border: none; border-radius: var(--radius-sm); padding: 6px 10px;
  font-size: 12px; cursor: pointer;
  display: flex; align-items: center; gap: 3px;
}
</style>
