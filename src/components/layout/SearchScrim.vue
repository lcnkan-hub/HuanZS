<!--
  搜索遮罩（2026-11-25）

  职责：搜索框展开时把下面的内容压暗一档，让「现在在搜」这件事成立。
  此前 is-searching 只做了两件事 —— 两颗圆钮缩宽淡出、搜索位长满 —— 内容区一点不变，
  读起来像「顶上多了一条框」，而不是「进入了搜索态」。

  ⚠ 为什么不给内容降透明度：
    卡片那层的 opacity 已经被两条动画同时占着 —— 逐卡淡出（useCardFade 的内联 style）
    和入场动画（.is-entering + cardFadeIn）。再抢一次就是整块重播/闪烁，
    这是 AGENTS.md 记录列表第 3 条禁令。所以变暗必须是**独立的一层**，压在内容之上。

  层级：z-index 15 —— 高于内容（.page-stack 是 1），低于顶栏（.header 是 20）。
    于是搜索框本身保持清晰，只有它下面的东西被压暗。
  pointer-events: none —— 这一层不吃点击。「点空白收起搜索」由 AppHeader 的
    document pointerdown 监听负责，多一层拦截会让那次点击失效。

  常驻不销毁（v-if 会打断淡出），靠 opacity + visibility 收尾：
    恢复时立刻切 visibility，避免透明层继续参与合成。
-->
<template>
  <div
    class="search-scrim"
    :class="{ 'is-on': active, 'is-night': night }"
    aria-hidden="true"
  ></div>
</template>

<script setup>
defineProps({
  /** 搜索框是否展开 —— 由 AppHeader 的 search-state 事件推上来 */
  active: { type: Boolean, default: false },
  /** 夜间：黑遮罩要重得多，同一个 alpha 在暗底上等于没压 */
  night:  { type: Boolean, default: false }
})
</script>

<style scoped>
.search-scrim {
  position: fixed;
  inset: 0;
  z-index: 15;
  background: rgba(0, 0, 0, 0.16);
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  /* 用 --pop-dur 的节奏（320ms）跟搜索框展开同步；曲线取 --ease-out ——
     遮罩是"压暗"，不是"跳"，走弹簧会让人以为它在动 */
  transition: opacity 0.22s var(--ease-out),
              visibility 0s linear 0.22s;
  will-change: opacity;
}

/* 夜里那块底本来就是 #17100F，白天那点 alpha 压上去看不出来 */
.search-scrim.is-night { background: rgba(0, 0, 0, 0.42); }

.search-scrim.is-on {
  opacity: 1;
  visibility: visible;
  /* 出现要立刻可见：把 visibility 的延迟收掉 */
  transition: opacity 0.22s var(--ease-out),
              visibility 0s linear 0s;
}

@media (prefers-reduced-motion: reduce) {
  .search-scrim { transition-duration: 1ms; }
}
</style>
