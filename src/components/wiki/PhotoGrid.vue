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
  <div v-if="shown.length" ref="rootEl" class="photo-grid" :class="['n' + layoutCount, { 'is-marking': marked >= 0 }]">
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
      <button
        v-if="moreCount && i === 4"
        class="cell-more"
        type="button"
        :aria-label="`查看其余 ${moreCount} 张`"
        @pointerdown.stop
        @click.stop="emit('preview', MAX_CELLS)"
      >+{{ moreCount }}</button>
    </div>

    <!-- 删除按钮：落在**长按那一点**（夹在那张图范围内），样式与「我的」长按菜单里的删除一致 -->
    <button
      v-if="marked >= 0 && shown[marked]"
      class="del-btn"
      type="button"
      :style="delBtnStyle"
      @click.stop="onDeleteClick(marked)"
    >
      删除
    </button>

    <!-- 不再放"标记遮罩"：它只有图区那么大，点图区外面（正文、顶栏）就取消不了。
         现在改成在 document 捕获阶段监听 pointerdown —— 点哪儿都能取消。 -->
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { getImageUrl } from '../../composables/useImageStore'

const props = defineProps({
  /** 图片 id 数组（记录上的 pics 字段） */
  pics: { type: Array, default: () => [] }
})
const emit = defineEmits(['preview', 'delete'])

/**
 * 长按删图（2026-11-23，第二版：直接删 + 灰化浮起）
 *
 * 交互链：长按某张 → 那张变灰并浮起（阴影）→ 删除按钮落在**长按那一点**上
 * → 点一下直接删（用户 11-23 明确：不要二次确认，接受不可撤销）。
 *
 * 三件被否掉的设计，留在这里免得以后又被人加回来：
 *   · 红色标记（旧版）—— 红色在这套界面里是「危险」，而选中不是危险；改成去色 + 浮起。
 *   · 「确认删除」二次态 —— 用户要一键删。
 *   · 原生 confirm —— WebView 会拦掉（本项目踩过两次）。
 *
 * 判据与卡片长按同一套：400ms + 位移超过 10px 取消；长按/滑动都不触发预览。
 */
const LONG_PRESS_MS = 400
const MOVE_TOLERANCE = 10

const marked = ref(-1)                 // 被标记的图索引，-1 = 没有
const markPoint = ref({ x: 0, y: 0 })  // 长按落点（视口坐标）—— 删除按钮以它为锚
const rootEl = ref(null)

/**
 * 删除按钮：**以长按那一点为准**，再夹进那张图的范围内。
 * 左右各留 28（按钮半宽 28 + 8）、上下各留 25 —— 贴边长按时按钮会被推回图内，
 * 但永远不会跑到照片外面（用户 11-23 的原话：「不能超出照片本身范围」）。
 */
const delBtnStyle = computed(() => {
  const i = marked.value
  const root = rootEl.value
  if (i < 0 || !root) return {}
  const cell = root.querySelectorAll('.cell')[i]
  if (!cell) return {}
  const cr = cell.getBoundingClientRect()
  const gr = root.getBoundingClientRect()
  const HALF_W = 28, HALF_H = 17, PAD = 8
  const cx = Math.max(cr.left + HALF_W + PAD, Math.min(markPoint.value.x, cr.right - HALF_W - PAD))
  const cy = Math.max(cr.top + HALF_H + PAD, Math.min(markPoint.value.y, cr.bottom - HALF_H - PAD))
  return { left: cx - gr.left + 'px', top: cy - gr.top + 'px' }
})

let pressTimer = null
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
    markPoint.value = { x: startX, y: startY }
    marked.value = i
    // 标记一出现就上"全局取消"：点图片外面的任何地方（正文、顶栏、空白）都要能取消。
    // 只靠图区里的遮罩不行 —— 它只有图区那么大，用户点正文时什么都不会发生（实测报过）。
    document.addEventListener('pointerdown', onDocPointerDown, true)
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

/**
 * 全局兜底取消。捕获阶段触发，所以比被点的元素自己的 handler 更早。
 * 点删除按钮 → 不算（那要真删）；点被标记那张图 → 取消；点别处 → 取消。
 */
let swallowUntil = 0

function onDocPointerDown(e) {
  if (marked.value < 0) return
  const t = e.target
  if (t && t.closest && t.closest('.del-btn')) return
  const cells = rootEl.value && rootEl.value.querySelectorAll('.cell')
  const mk = cells && cells[marked.value]
  if (mk && mk.contains(t)) { clearMark(); return }   // 点自己那张 = 反悔
  clearMark()
  // 这一下不要顺带把点中的另一张放大（用户只是想取消标记）
  swallowUntil = performance.now() + 400
}

/** 点图：长按/滑动过就不放大；刚取消过标记也不放大；已经标记着就当作「取消」 */
function onCellClick(i) {
  if (fired || moved) { fired = false; moved = false; return }
  if (performance.now() < swallowUntil) return
  if (marked.value >= 0) { clearMark(); return }
  emit('preview', i)
}

/**
 * 点「删除」：先让那张自己缩走（160ms），再交给父级改数据。
 * 顺序反了就会「啪」少一张，没有"被拿走"的过程。
 */
function onDeleteClick(i) {
  const cell = rootEl.value && rootEl.value.querySelectorAll('.cell')[i]
  if (!cell) { clearMark(); emit('delete', i); return }
  // 只缩、不位移：位移会让它在消失前压到邻居身上
  cell.style.transition = 'opacity .16s ease, transform .16s ease'
  cell.style.transform = 'scale(0.86)'
  cell.style.opacity = '0'
  setTimeout(() => {
    clearMark()
    emit('delete', i)
  }, 160)
}

function clearMark() {
  marked.value = -1
  document.removeEventListener('pointerdown', onDocPointerDown, true)
}

onBeforeUnmount(() => {
  clearPress()
  document.removeEventListener('pointerdown', onDocPointerDown, true)
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

/**
 * 删掉一张之后的「落定」（用户要的呼吸感）。
 *
 * 不用 FLIP：4 张变 3 张时尺寸跨度太大（170→230、170→113），用 transform 模拟中间态
 * 会让几张图互相穿过（试过，截图里能直接看到重叠）。
 * 这里做的是两步：那张先自己缩走（见 onDeleteClick）→ 新排布就位后，
 * 剩下的图从 0.965 / 0.72 轻轻落到 1 / 1。全程不重叠，但看得出"发生过什么"。
 */
watch(() => urls.value.length, async (n, o) => {
  if (!o || n >= o) return          // 只有变少（删除）才播
  await nextTick()
  const root = rootEl.value
  if (!root) return
  root.querySelectorAll('.cell').forEach((c) => {
    c.style.transition = 'none'
    c.style.transform = 'scale(0.965)'
    c.style.opacity = '0.72'
    requestAnimationFrame(() => {
      c.style.transition = 'transform .22s cubic-bezier(0.2,0.8,0.2,1), opacity .22s ease-out'
      c.style.transform = ''
      c.style.opacity = ''
      setTimeout(() => { c.style.transition = '' }, 280)
    })
  })
})
</script>

<style scoped>
.photo-grid {
  display: grid;
  gap: 3px;
  margin-bottom: 18px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--color-bg-subtle);
  position: relative;   /* 标记遮罩的定位基准 */
}

/* 标记取消走 document 捕获监听（见 onDocPointerDown），不再需要图区遮罩 */

.cell {
  position: relative;
  overflow: hidden;
  background: var(--color-border-light);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none; user-select: none;
}
.cell img {
  width: 100%; height: 100%;
  object-fit: cover;
  object-position: center;   /* 原图比例和格子不一样时，以原图中心为准裁切（点开可在查看器看全图） */
  display: block;
  -webkit-user-drag: none;
}
.cell:active img { opacity: 0.86; }
.cell-void { width: 100%; height: 100%; background: var(--color-border-light); }

/* 标记态：**只放开裁切**（让阴影不被裁掉）+ 每张独立圆角。
   绝不能动 padding / margin / gap —— 那会改图区尺寸，文字跟着上移、n3 的跨格比例被挤乱
   （用户 11-23 报过：长按后文字上移、城堡图只剩一条、日期压在图上面）。 */
.photo-grid.is-marking { overflow: visible; }
.photo-grid.is-marking .cell { border-radius: 12px; }

/* 被选中：原图色彩不变，只**原地放大 3% + 阴影**表示"这张被捏起来了"。
   不放色彩滤镜：用户明确要"原图色彩就行，不用变灰色"。
   不上移：上移会盖住上面那张（用户之前否过一次）；居中放大的溢出四周均摊，看不出来。 */
.cell.is-marked {
  z-index: 3;
  border-radius: 12px;
  transform: scale(1.03);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.26), 0 3px 8px rgba(0, 0, 0, 0.14);
  transition: transform var(--pop-dur) var(--spring-pop), box-shadow 0.2s;
}
/* 只留一圈白色内高光（像卡片边缘被光扫到），不上色、不灰化 */
.cell.is-marked::after {
  content: '';
  position: absolute; inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(0, 0, 0, 0.04));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
}

/* 删除按钮：与「我的」长按菜单里那颗**完全同一套材质**
   （浅底 + 红字 + --radius-md 圆角 + 同一条投影）—— 同一个语义，在哪儿都长一样。
   位置由 JS 按"长按那一点"算，并夹在那张图范围内。 */
.del-btn {
  position: absolute;
  z-index: 4;
  transform: translate(-50%, -50%);
  display: inline-flex; align-items: center; justify-content: center;
  height: 34px; padding: 0 12px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--text-13);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  -webkit-appearance: none; appearance: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  /* 按下/松手两段弹簧（2026-11-24）：原来只有 :active 的缩放、没写 transition，
     等于瞬间跳变 —— 这一颗之前是"局部改了但没接进账本"的漏网。 */
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transition: transform var(--press-now-dur) var(--press-now-ease);
}
.del-btn:active {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: translate(-50%, -50%) scale(var(--press-scale-sm));
}

/* 超过 9 张：第 5 格右下角标 +N。
   2026-11-25 起它是个**按钮**：点它直接看第 10 张（第一张被藏起来的），
   而点第 5 格本身仍然从第 5 张开始滑 —— 两件事各归各的，别互相抢。
   视觉只有 24×18，热区用 ::after 外扩到约 40×40，不挡照片主体。 */
.cell-more {
  position: absolute;
  right: 5px; bottom: 5px;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 1px 6px;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.58);
  color: #fff;
  font-family: inherit;
  font-size: var(--text-11, 11px);
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  -webkit-appearance: none; appearance: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}
.cell-more::after { content: ''; position: absolute; inset: -10px; }
.cell-more:active { background: rgba(0, 0, 0, 0.72); }
.cell-more:focus-visible { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9); }

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
