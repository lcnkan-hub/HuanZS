<!--
  通用弹窗积木
  用法：<ModalBox v-if="show" title="标题" @close="show = false">内容</ModalBox>
  支持默认插槽放入任意内容

  2026-11-23 适配「我的」卡片（三处约束，缺一就会被裁）：
    1. `.modal-overlay` 的定位从 `100vw/100vh` 改成 `top/left/width/height:100%`。
       弹窗挂在 `.mine-card` 里时，那张卡有 `transform`（入场动画），它就成了 fixed 的包含块 ——
       100vh 会按"视图高"算，直接顶出卡片被 overflow 裁掉。
    2. 高度上限由 JS 量出来写成 px，不用 CSS 百分比：
       卡片的 height 是 auto（跟着内容），百分比 max-height 在"祖先高度不确定"的链条里会被当成 none
       —— 实测写 `max-height:100%` / `calc(100%-24px)` 都毫无效果，箱子照样 447 压进 433 的可用区。
    3. 内容区（默认插槽）单独滚动，标题和动作键用 flex 钉住 ——
       长表单（AI 设置）在矮卡片里也能读完、也能点保存。
-->
<template>
  <div ref="rootEl" class="modal-overlay" @click.self="$emit('close')">
    <div
      ref="boxEl"
      class="modal-box"
      :style="maxHeight ? { maxHeight } : null"
      role="dialog"
      aria-modal="true"
      :aria-label="title || undefined"
    >
      <h3 v-if="title">{{ title }}</h3>
      <div class="modal-body"><slot></slot></div>
      <div v-if="$slots.actions" class="modal-actions">
        <slot name="actions"></slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps({
  title: { type: String, default: '' }
})
defineEmits(['close'])

const PAD = 20   // overlay 上下各 10，合计 20：箱子永远留出这一圈，不贴卡片边

const rootEl = ref(null)
const boxEl = ref(null)
const maxHeight = ref('')

/** 按"弹窗能用的那块地方"算高度上限；量不到就退回不限制（CSS 里还有 100% 兜底） */
function fitBox() {
  const h = rootEl.value ? rootEl.value.getBoundingClientRect().height : 0
  if (!h) { maxHeight.value = ''; return }
  const avail = Math.max(200, Math.round(h - PAD))
  maxHeight.value = `${avail}px`
}

onMounted(() => {
  fitBox()
  window.addEventListener('resize', fitBox)
})
onBeforeUnmount(() => window.removeEventListener('resize', fitBox))
</script>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  box-sizing: border-box; padding: 10px;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 999; backdrop-filter: blur(2px);
  overflow: hidden;
}
.modal-box {
  background: var(--color-bg-card); border-radius: var(--radius-3xl);
  /* border-box：JS 量的是 border-box 高度，max-height 也必须按 border-box 裁，
     否则 padding 40 会漏在限额外面（实测限额 437，箱子 440 还在） */
  box-sizing: border-box;
  width: 92%; max-width: 380px; max-height: 100%;
  /* min-height:0 是必须的：flex 子项的 auto 最小高度 = 内容高度，
     不写这一行，内容比容器高时 max-height 会被 min-height 顶回去 */
  min-height: 0;
  padding: 20px;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-modal);
  /* 出现：透明度先到位，形变走弹簧（3.8% 过冲就是那一下"弹出来"） */
  animation: modalFade 0.16s linear backwards,
             modalPop var(--pop-dur) var(--spring-pop) backwards;
}
.modal-box h3 {
  flex: 0 0 auto;
  margin: 0 0 14px;
  font-size: var(--text-18); text-align: center; font-weight: 600;
}
/* 默认插槽区：内容长了在这里滚，标题与动作键不跟着滚走 */
.modal-body {
  flex: 1 1 auto; min-height: 0;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.modal-actions {
  flex: 0 0 auto;
  display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;
}
/* 弹窗动作键是全 App 的收口：App / EditProfileModal / AiSettingsModal 三处的取消、保存
   都从这里拿到 44 高，各自不必再写一遍。 */
.modal-actions :deep(button) {
  border: none; padding: 9px 18px; border-radius: var(--radius-md);
  font-size: var(--text-14); font-weight: 500; cursor: pointer;
  min-height: 44px; display: inline-flex; align-items: center; justify-content: center;
  /* 弹窗动作键是全 App 共用的，按压手感从这里统一 */
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transition: transform var(--press-now-dur) var(--press-now-ease);
}
.modal-actions :deep(button:active) {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: scale(var(--press-scale));
}
/* 弹窗里的输入框同理：AiSettingsModal / EditProfileModal 两处曾各自手抄同一段 6 行，
   改一处必漏一处。形状放这里，各组件只留自己的差异（focus 高亮、margin）。
   focus 态故意不收 —— 两处的高亮观感不同，收进来是美化场的事，得有拍板再动。 */
.modal-box :deep(.modal-input) {
  width: 100%; border: 1px solid var(--color-border);
  background: var(--color-bg-modal); border-radius: var(--radius-md);
  padding: 10px 12px; box-sizing: border-box; font-size: var(--text-14);
}
@keyframes modalFade { from { opacity: 0 } }
@keyframes modalPop  { from { transform: scale(0.92) } }
</style>
