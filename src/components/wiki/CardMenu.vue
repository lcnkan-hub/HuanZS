<!--
  卡片长按菜单（2026-11-23 取消右上角「⋯」之后的唯一列表入口）
  职责：在**长按发生的位置**弹出「收藏 / 删除」，点空白处收起。

  为什么用 Teleport 到 body：
    PC/WebView 里 `position: fixed` 遇到祖级的 transform / will-change 会降级成 absolute
    （`.page-sheet` 正好有 `will-change: transform`），菜单就会跟着列表一起滚、还会被
    `.page-sheet` 的 overflow 裁掉。挂到 body 上，这两个问题都不存在。

  定位：以长按点为锚，**先放手指上方**（46px，避开手指本身的遮挡）；
    上方放不下就翻到下方；左右按视口夹住，靠近右边缘时向左翻。
-->
<template>
  <Teleport to="body">
    <!-- 遮罩：吞掉这一次点击，顺便关菜单。点在菜单自己身上不会走到这里（@click.self） -->
    <div class="card-menu-mask" @click.self="$emit('close')"></div>

    <div class="card-menu" :style="posStyle" role="menu">
      <button class="cm-item fav" type="button" role="menuitem" @click="onFav">
        <AppIcon name="bookmark" :size="14" /> {{ favorited ? '取消收藏' : '收藏' }}
      </button>
      <button class="cm-item del" type="button" role="menuitem" @click="onDelete">
        <AppIcon name="trash" :size="14" /> 删除
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  /** 长按点（视口坐标） */
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  favorited: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'toggle-favorite', 'delete'])

/** 菜单实测尺寸（两个 chip + 间距）；估算偏大一点，宁可离边远些 */
const MENU_W = 168
const MENU_H = 38
const EDGE   = 12      // 距屏幕边缘的呼吸位
const ABOVE  = 46      // 先放在手指上方这么高

const posStyle = computed(() => {
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 390
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 844

  // 横向：以长按点为中心，夹在视口里
  let left = props.x - MENU_W / 2
  left = Math.max(EDGE, Math.min(left, vw - MENU_W - EDGE))

  // 纵向：先试手指上方；顶不下就翻到下方；下方也放不下就贴着底边
  let top = props.y - MENU_H - ABOVE + MENU_H   // = y - ABOVE
  if (top < EDGE + 8) top = Math.min(props.y + 18, vh - MENU_H - EDGE)

  return { left: left + 'px', top: top + 'px', width: MENU_W + 'px' }
})

function onFav() {
  emit('toggle-favorite')
  emit('close')
}
function onDelete() {
  emit('delete')
  emit('close')
}
</script>

<style scoped>
/* 遮罩全透明：它的作用是「接住下一次点击」，不是压暗。
   压暗会在列表上盖一层灰，读起来像弹窗；长按菜单是就地操作，不该改变整屏亮度。 */
.card-menu-mask {
  position: fixed; inset: 0; z-index: 190;
  background: transparent;
}

.card-menu {
  position: fixed; z-index: 200;
  display: flex; gap: 6px; align-items: center;
  height: 38px;
  padding: 0;
  /* 弹出：从 0.94 起、18ms 内到位。够快才不像弹窗 */
  /* 拆成两条动画：透明度快（.14s，别让人等）、形变走弹簧。
     一条 keyframes 只能用一条曲线，而"淡入干脆 + 弹出带一下过冲"才是出现的手感。 */
  animation: cardMenuFade 0.14s linear backwards,
             cardMenuPop var(--pop-dur) var(--spring-pop) backwards;
}
@keyframes cardMenuFade { from { opacity: 0 } }
@keyframes cardMenuPop {
  from { transform: scale(0.90) translateY(3px); }
}

.cm-item {
  display: flex; align-items: center; gap: 4px;
  height: 34px; padding: 0 12px;
  border: none; border-radius: var(--radius-md);
  font-size: var(--text-13); font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  -webkit-appearance: none; appearance: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transition: transform var(--press-now-dur) var(--press-now-ease);
}
.cm-item:active {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: scale(var(--press-scale-sm));
}
.cm-item.fav { background: var(--color-accent-light); color: var(--color-accent); }
.cm-item.del { background: var(--color-danger-bg); color: var(--color-danger); }
</style>
