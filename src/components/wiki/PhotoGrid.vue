<!--
  图片附件区积木（2026-11-22 图片附件化）

  职责：把一条记录的 `pics`（图片 id 数组）按**张数**排成一块图区。
  边界：只管显示和排列，不负责选图、删图、改记录。

  为什么单独成组件：
  1. 六套排布规则（1/2/3/4/5/≥6 张）是纯视觉逻辑，跟正文编辑没半点关系；
  2. 卡片（WikiCard）以后也要复用同一套缩略图规则 —— 塞进 ItemBodyEditor 里就得复制一遍。

  排布依据（用户 2026-11-22 指定，参考微信朋友圈那种「一大带多小」）：
    1 张 → 整宽 4:3
    2 张 → 左右各半
    3 张 → 左一大（跨 2×2）+ 右上下两小
    4 张 → 2 × 2
    5 张 → 左大竖条 + 右 2×2
    6~9 张 → 3 列方格；超过 9 张只在第 5 格角上标 +N
-->
<template>
  <div v-if="shown.length" ref="rootEl" class="photo-grid" :class="'n' + layoutCount">
    <div
      v-for="(p, i) in shown"
      :key="p.id"
      class="cell"
      :class="{ 'is-marked': marked === i }"
      @click="onCellClick(i)"
      @pointerdown="onDown($event, i)"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="onUp"
      @contextmenu.prevent
    >
      <img v-if="p.url" :src="p.url" alt="" draggable="false" />
      <!-- 还没解析出来时的占位：比空白好，至少说明「这里有一张图」 -->
      <div v-else class="cell-void"></div>
      <span v-if="moreCount && i === 4" class="cell-more">+{{ moreCount }}</span>
    </div>

    <!-- 删除按钮跟着被标记的那张图走（绝对定位在网格上，不参与布局） -->
    <button
      v-if="marked >= 0 && shown[marked]"
      class="del-btn"
      :class="{ 'is-confirm': confirming }"
      type="button"
      :style="delBtnStyle"
      @click.stop="onDeleteClick(marked)"
    >
      {{ confirming ? '确认删除' : '删除' }}
    </button>

    <!-- ⚠ 遮罩必须放在**最后**：它在网格里是 `.photo-grid` 的子元素，
         放前面会让第一个 `.cell` 变成 `nth-child(2)`，
         于是 `.n3 .cell:nth-child(1)`（左大跨两行）失配 —— 三张图当场塌成一排。
         绝对定位的元素不占格，但**仍然算一个子元素**。 -->
    <div v-if="marked >= 0" class="mark-mask" @click.stop="clearMark"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { getImageUrl } from '../../composables/useImageStore'

const props = defineProps({
  /** 图片 id 数组（记录上的 pics 字段） */
  pics: { type: Array, default: () => [] }
})
const emit = defineEmits(['preview', 'delete'])

/**
 * 长按删图（2026-11-23）
 *
 * 交互链：长按一张 → 那张盖「提醒色」（红描边 + 淡红罩）→ 图上浮出「删除」
 * → 点一次变「确认删除」（3 秒不复位就退回「删除」）→ 再点才真删。
 *
 * 为什么要两次：删图不可撤销（IndexedDB 里那份直接删），而长按本身已经是"重手势"，
 * 一次点击不该成为不可逆操作的最后一环。这里不弹模态确认 —— WebView 把原生 confirm
 * 拦掉过一次（表现成"点了没反应"），所以用按钮自己变成第二道确认。
 *
 * 判据与卡片长按同一套：400ms + 位移超过 10px 取消；长按或滑动都不触发预览。
 */
const LONG_PRESS_MS = 400
const MOVE_TOLERANCE = 10
const CONFIRM_RESET_MS = 3000

const marked = ref(-1)         // 被标记的图索引，-1 = 没有
const confirming = ref(false)  // 「删除」是否已经变成「确认删除」
const rootEl = ref(null)       // 网格根：算删除按钮位置要用它的坐标系

/**
 * 删除按钮落在被标记那张图的中央。
 * 按钮不做成 cell 的子元素 —— 那样会改变 `.photo-grid` 的子元素序号，
 * `.n3 .cell:nth-child(1)` 这类排布规则会当场失配（实测三张图塌成一排）。
 */
const delBtnStyle = computed(() => {
  const i = marked.value
  const root = rootEl.value
  if (i < 0 || !root) return {}
  const cell = root.querySelectorAll('.cell')[i]
  if (!cell) return {}
  const cr = root.getBoundingClientRect()
  const r = cell.getBoundingClientRect()
  return {
    left: r.left - cr.left + r.width / 2 + 'px',
    top: r.top - cr.top + r.height / 2 + 'px'
  }
})

let pressTimer = null
let confirmTimer = null
let startX = 0
let startY = 0
let fired = false
let moved = false

function clearPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
}

function onDown(e, i) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  startX = e.clientX
  startY = e.clientY
  fired = false
  moved = false
  clearPress()
  pressTimer = setTimeout(() => {
    pressTimer = null
    fired = true
    marked.value = i
    confirming.value = false
    if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null }
  }, LONG_PRESS_MS)
}

function onMove(e) {
  if (!pressTimer && moved) return
  if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
    clearPress()
    moved = true
  }
}

function onUp() {
  clearPress()
}

/** 点图：长按/滑动过就不放大；已经标记着就当作「取消」 */
function onCellClick(i) {
  if (fired || moved) { fired = false; moved = false; return }
  if (marked.value >= 0) { clearMark(); return }
  emit('preview', i)
}

function onDeleteClick(i) {
  if (!confirming.value) {
    confirming.value = true
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirming.value = false; confirmTimer = null }, CONFIRM_RESET_MS)
    return
  }
  clearMark()
  emit('delete', i)
}

function clearMark() {
  marked.value = -1
  confirming.value = false
  if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null }
}

onBeforeUnmount(() => {
  clearPress()
  if (confirmTimer) clearTimeout(confirmTimer)
})

const MAX_CELLS = 9

/** [{ id, url }]，url 为空表示这张图解析失败（库里没有 / 读不出来） */
const urls = ref([])

/**
 * 监听 pics 的**内容**而不是数组引用。
 * 原因：父级每次更新记录都会给一个新数组，引用比较会让 watch 每次都跑，
 * 而内容没变时重跑等于把已缓存的 blob URL 再查一遍 —— 白等。
 */
watch(
  () => (Array.isArray(props.pics) ? props.pics.join(',') : ''),
  async (joined) => {
    const ids = joined ? joined.split(',') : []
    if (ids.length === 0) { urls.value = []; return }
    const out = []
    for (const id of ids) {
      let url = null
      try { url = await getImageUrl(id) } catch { url = null }
      out.push({ id, url })
    }
    urls.value = out
  },
  { immediate: true }
)

const shown = computed(() => urls.value.slice(0, MAX_CELLS))
const moreCount = computed(() => Math.max(0, urls.value.length - MAX_CELLS))

/** 按张数选排布（CSS 类名 n1 ~ n9） */
const layoutCount = computed(() => {
  const n = Math.min(urls.value.length, MAX_CELLS)
  if (n <= 5) return Math.max(1, n)
  return 9
})
</script>

<style scoped>
.photo-grid {
  display: grid;
  gap: 3px;
  margin-bottom: 18px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--color-bg-subtle, #f8f9fa);
  position: relative;   /* 标记遮罩的定位基准 */
}

/* 标记状态下的透明遮罩：点它取消标记；层级低于被标记的 cell */
.mark-mask {
  position: absolute; inset: 0; z-index: 1;
}

.cell {
  position: relative;
  overflow: hidden;
  background: var(--color-border-light, #f2f2f7);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none; user-select: none;
}
.cell img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  -webkit-user-drag: none;
}
.cell:active img { opacity: 0.86; }
.cell-void { width: 100%; height: 100%; background: var(--color-border-light, #f2f2f7); }

/* 长按标记：淡红罩 + 红描边 —— 回答"我要删的是这一张"这个问题。
   不用缩放/抖动：那是"选中的图在动"，而这里要传达的是"这张被盯上了"。 */
.cell.is-marked { z-index: 2; }
.cell.is-marked::after {
  content: '';
  position: absolute; inset: 0;
  pointer-events: none;
  background: rgba(255, 59, 48, 0.18);
  box-shadow: inset 0 0 0 2px rgba(255, 59, 48, 0.92);
}

/* 删除按钮：浮在被标记那张图的中央（离手指最近，也不用去找）。
   第一次是「删除」，点完变「确认删除」并加深一档红；3 秒无操作退回「删除」。 */
.del-btn {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 3;
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 64px; height: 34px; padding: 0 14px;
  border: none; border-radius: 17px;
  background: rgba(255, 59, 48, 0.96);
  color: #fff;
  font-size: var(--text-13);
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
  -webkit-appearance: none; appearance: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  animation: delPop 0.18s cubic-bezier(0.34, 1.4, 0.64, 1) backwards;
}
.del-btn.is-confirm { background: #C4160B; }
.del-btn:active { transform: translate(-50%, -50%) scale(0.94); }
@keyframes delPop {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.86); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* 超过 9 张：第 5 格右下角标 +N */
.cell-more {
  position: absolute;
  right: 5px; bottom: 5px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.58);
  color: #fff;
  font-size: var(--text-11, 11px);
  font-weight: 600;
  line-height: 1.5;
}

/* 1 张：整宽 **16:9** —— 必须与列表卡片的封面同一比例、同一宽度（都是正文宽 346），
   点开时图片才能只做垂直平移、尺寸一点不变。用 4:3 会让展开瞬间图「长大」31%（2026-11-23 修的）。 */
.n1 { grid-template-columns: 1fr; }
.n1 .cell { aspect-ratio: 16 / 9; }

/* 2 张：左右各半，各自正方形 */
.n2 { grid-template-columns: 1fr 1fr; }
.n2 .cell { aspect-ratio: 1; }

/* 3 张：左一大（跨 2 列 2 行）+ 右上下两小 */
.n3 { grid-template-columns: repeat(3, 1fr); grid-template-rows: 1fr 1fr; aspect-ratio: 3 / 2; }
.n3 .cell:nth-child(1) { grid-column: 1 / span 2; grid-row: 1 / span 2; }

/* 4 张：2 × 2 */
.n4 { grid-template-columns: 1fr 1fr; }
.n4 .cell { aspect-ratio: 1; }

/* 5 张：左大竖条（2fr 宽、跨 2 行）+ 右 2×2 */
.n5 { grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 1fr 1fr; aspect-ratio: 2 / 1; }
.n5 .cell:nth-child(1) { grid-row: 1 / span 2; }

/* 6 张以上：一律 3 列方格。不足 9 张时末行会留空 —— 拉伸到满宽反而会让图变形 */
.n9 { grid-template-columns: repeat(3, 1fr); }
.n9 .cell { aspect-ratio: 1; }
</style>
