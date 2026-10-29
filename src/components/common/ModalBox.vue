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
  background: var(--color-bg-card); border-radius: var(--radius-3xl);
  width: 85%; max-width: 340px; padding: 22px;
  box-shadow: var(--shadow-modal);
  animation: popModal 0.25s var(--ease-pop);
}
.modal-box h3 {
  margin-top: 0; margin-bottom: 18px; font-size: var(--text-18);
  text-align: center; font-weight: 600;
}
.modal-actions {
  display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;
}
/* 弹窗动作键是全 App 的收口：App / EditProfileModal / AiSettingsModal 三处的取消、保存
   都从这里拿到 44 高，各自不必再写一遍。 */
.modal-actions :deep(button) {
  border: none; padding: 9px 18px; border-radius: var(--radius-md);
  font-size: var(--text-14); font-weight: 500; cursor: pointer;
  min-height: 44px; display: inline-flex; align-items: center; justify-content: center;
}
/* 弹窗里的输入框同理：App / WikiDetail / AiSettingsModal / EditProfileModal 四处
   曾各自手抄同一段 6 行，改一处必漏三处。形状放这里，各组件只留自己的差异。
   focus 态故意不收 —— 现在只有两处有高亮，收进来会给另两处凭空加上观感，
   那属于美化场的事，得有拍板再动。 */
.modal-box :deep(.modal-input) {
  width: 100%; border: 1px solid var(--color-border);
  background: var(--color-bg-modal); border-radius: var(--radius-md);
  padding: 10px 12px; box-sizing: border-box; font-size: var(--text-14);
}
@keyframes popModal {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
