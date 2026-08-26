<!--
  通用弹窗积木
  用法：<ModalBox v-if="show" title="标题" @close="show = false">内容</ModalBox>
  支持默认插槽放入任意内容
-->
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-box">
      <h3 v-if="title">{{ title }}</h3>
      <slot></slot>
      <div v-if="$slots.actions" class="modal-actions">
        <slot name="actions"></slot>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' }
})
defineEmits(['close'])
</script>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,0.4); display: flex; justify-content: center;
  align-items: center; z-index: 999; backdrop-filter: blur(2px);
}
.modal-box {
  background: white; border-radius: var(--radius-3xl, 16px);
  width: 85%; max-width: 340px; padding: 22px;
  box-shadow: var(--shadow-modal);
  animation: popModal 0.25s var(--ease-pop);
}
.modal-box h3 {
  margin-top: 0; margin-bottom: 18px; font-size: 18px;
  text-align: center; font-weight: 600;
}
.modal-actions {
  display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;
}
.modal-actions :deep(button) {
  border: none; padding: 9px 18px; border-radius: var(--radius-md, 8px);
  font-size: 14px; font-weight: 500; cursor: pointer;
}
@keyframes popModal {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
