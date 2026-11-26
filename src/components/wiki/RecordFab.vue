<!--
  新建记录入口（2026-11-25：从列表顶部那条整行入口搬到这里）

  为什么搬：
    · 列表顶部那条 390×46 的整行入口，占着首屏最贵的一格，读起来却像"这里多了一条东西"；
    · 它是**新建**这个主动作，按拇指热区本来就该落在右下角；
    · 搬走之后列表直接从第一张卡开始，顶部那 46px 回到内容手里。

  形状与材质（用户定）：
    · 44×44 圆钮，跟顶栏「我的」同尺寸；图标仍是那个加号，文字只留屏给读器（aria-label）；
    · 材质**沿用原来那颗**：实心主色 + 反白加号 + 一档投影（与详情页「完成」同一族），
      不是玻璃 —— 底部只有这一个"主动作"，它该是整屏唯一一块实心色。
    · 位置：右 16，底边 = 浮岛离底 14 + 安全区 + 7（58 的浮岛带子里坐一颗 44 的钮，
      上下各让 7，圆心才和浮岛圆心同一条线）。

  三种离开（用户定）：
    covered —— 详情页打开。**不拆 DOM**、只压成透明：返回时要从这颗钮的位置收回来，
               拆了就没有落点了（原来那条横条在列表里常驻，正是为了这个）。
    sunk    —— 打开「我的」/ 键盘弹起，跟浮岛一起沉下去。
    off     —— 王冠页：往下滑出屏幕。那一页底部是输入栏，这里没有"新建记录"的位置。
-->
<template>
  <button
    type="button"
    class="record-fab"
    :class="{ 'is-sunk': sunk, 'is-off': off, 'is-covered': covered }"
    aria-label="记录"
    @click="$emit('add')"
  >
    <AppIcon name="plus" :size="20" />
  </button>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'

defineProps({
  sunk:    { type: Boolean, default: false },  // 「我的」打开 / 键盘弹起：跟浮岛一起下沉
  off:     { type: Boolean, default: false },  // 王冠页：滑出屏幕
  covered: { type: Boolean, default: false }   // 详情页打开：留在原地但透明（当返回落点）
})
defineEmits(['add'])
</script>

<style scoped>
.record-fab {
  position: fixed;
  right: 16px;
  /* 44 的钮 + 58 的浮岛带：上下各 7，圆心对齐 */
  bottom: calc(14px + var(--safe-bottom) + 7px);
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background-color: var(--color-accent-solid);
  color: var(--color-text-on-solid);
  /* 与详情页「完成」同一档：实心主按钮的投影 + 一道顶光 */
  box-shadow:
    var(--shadow-solid-accent),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  cursor: pointer;
  /* 与底栏同一层：它是"底部功能层"的第三件（.bottom-nav 是 40） */
  z-index: 40;
  -webkit-tap-highlight-color: transparent;
  --fab-y: 0px;
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transform: translateY(var(--fab-y));
  transition: transform var(--slide-dur) var(--spring-glide),
              opacity 0.18s ease-out;
}

/* 按下：跟顶栏圆钮同一套两段弹簧（缩 + 高光收成内阴影） */
.record-fab:active {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: translateY(var(--fab-y)) scale(var(--press-scale-sm));
  box-shadow: var(--shadow-solid-accent-sm);
}

/* 跟浮岛一起下沉 / 切王冠时滑走：都走 --fab-y，位移量一致 */
.record-fab.is-sunk,
.record-fab.is-off {
  --fab-y: calc(100% + 40px);
  pointer-events: none;
}
.record-fab.is-off { opacity: 0; }

/* 详情页打开：留在原地当"返回落点"，但看不见、点不到。
   ⚠️ 这里**不能带 opacity 过渡**：壳的第一帧正好盖在这颗钮上，而钮在 z 40（比壳高一层）——
   淡出的那 180ms 里，白加号会浮在已经长大的酒红面上（实测抓到过）。
   瞬间变透明就是无痕的：壳和它是同一个位置、同一个颜色。摘掉这个类时仍走上面的 0.18s 淡入。 */
.record-fab.is-covered {
  opacity: 0;
  pointer-events: none;
  transition: transform var(--slide-dur) var(--spring-glide);
}

/* 减少动态：位移令牌已被 motion.css 压到 1ms，这里只需要保证不会"停半路" */
@media (prefers-reduced-motion: reduce) {
  .record-fab { transition-duration: 1ms; }
}
</style>
