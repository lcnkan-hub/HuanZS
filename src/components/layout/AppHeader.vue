<!--
  顶部栏积木（2026-11-21 单层重构 · 2026-11-21 视觉分层）
  左边「我的」（呼出浮层），右边搜索框。原来的「添加」下放成列表上方一行卡片式入口。
  分层口径：搜索是这页的主角，给足宽度与留白；「我的」是低频入口，退成幽灵按钮。
  原来两个 44px 实心块并排填满 55px 的栏，上下各只剩 5.5px —— 看谁都像主按钮、谁都不让位。
  Props: modelValue(搜索词 v-model)
  Emits: update:modelValue, mine(点「我的」)
-->
<template>
  <div class="header">
    <button class="mine-btn" type="button" aria-label="我的" @click="$emit('mine')">
      <AppIcon name="mine" :size="17" />
      <span class="mine-label">我的</span>
    </button>
    <div class="search-bar">
      <AppIcon name="search" :size="14" class="search-icon" />
      <input
        type="text"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
        placeholder="搜索记录…"
        aria-label="搜索记录"
      />
    </div>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'

defineProps({
  modelValue: { type: String, default: '' }
})
defineEmits(['update:modelValue', 'mine'])
</script>

<style scoped>
/* 顶部栏：**不垫底、不画线**（2026-11-22 C2 去块化）。
   以前这里是 `background-color: var(--color-bg-card)` + `1px` 分割线 —— 实心底 + 细线，
   正是 HIG 点名的两种"隔"：Layout 规则 5 要求「不要在控件下垫一块实心或半透明纯色背景，
   改用 scroll edge effect 把控件从内容里抬起来」；Materials 的原话是「分割线是切断，材质是透过」。
   现在整条栏透明：屏幕顶端只剩一颗浮着的玻璃搜索框，"栏"这个块不存在了，
   于是它跟底部的玻璃浮岛是同一套语言（浮件 + 无线无块），中间留给内容。
   内容在顶端那 14px 的化开由 App.vue 的 .primary-sheet 蒙版负责，不在这里画。 */
.header {
  height: var(--header-height);
  display: flex; align-items: center; gap: 6px; padding: 0 16px;
  /* 切页时由父级加 .is-offstage 让它淡出，**不抽高度** ——
     抽高度等于给 Layout 属性做动画，内容会跟着抖；
     而且它一消失，下面整块内容就上跳，那一下比过渡本身更生硬。 */
  transition: opacity 0.18s ease-out;
}
/* 「我的」：幽灵按钮 —— 不带底色、字号退一档，只在按下时给浅底反馈。
   盒子高度给足 44（触控铁律，且 check 脚本只认真实 rect，不认 ::after 伪元素）；
   没有底色和边框，所以 44 高不会显得笨重 —— 视觉上只有图标和 13px 的文字。 */
.mine-btn {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 4px;
  height: 44px; padding: 0 8px;
  background-color: transparent; color: var(--color-text-secondary);
  border: none; border-radius: var(--radius-md);
  font-size: var(--text-13); font-weight: 500; white-space: nowrap;
  cursor: pointer; position: relative;
  transition: background-color 0.16s ease, transform 0.16s ease;
}
.mine-btn:active { background-color: var(--color-bg-input); transform: scale(0.97); }

/* 搜索框：34px 高（55 的栏里上下各留 10.5px），放大镜做内嵌提示，不再是空白灰块 */
.search-bar {
  position: relative; flex: 1;
  display: flex; align-items: center; min-width: 0;
}
.search-icon {
  position: absolute; left: 10px;
  color: var(--color-text-muted); pointer-events: none;
}
/* 搜索框：一颗浮在页面上的玻璃胶囊（2026-11-22 C2）。
   以前是垫在实心白栏里的一块浅灰输入块 —— 栏没了，它就得不靠"栏"独立站住：
   所以换成与底部浮岛同一套材质令牌（--glass-fill / --glass-blur / --glass-highlight / --glass-edge）。
   阴影比浮岛短得多：浮岛是"浮起 10px+28px"，一颗 34px 高的输入框用那个动量会像贴了张纸。
   圆角保持 --radius-lg：输入框是"可输入的字段"，不是导航那样的胶囊，两件事别混。 */
.search-bar input {
  width: 100%; height: 34px;
  border: none;
  background-color: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-highlight), var(--glass-edge), 0 4px 14px rgba(0, 0, 0, 0.05);
  border-radius: var(--radius-lg); padding: 0 12px 0 30px;
  font-size: var(--text-14); color: var(--color-text-primary);
  -webkit-appearance: none; appearance: none;
}
.search-bar input::placeholder { color: var(--color-text-muted); }
</style>
