<!--
  单条记录卡片积木（2026-11-23 取消标题系统 · 长按菜单）
  展示：封面（16:9，与正文同宽）+ 加粗首行 + 正文预览（2 行）+ 时间。

  2026-11-23 四处改动（用户定）：
  1. **没有标题字段了**。首行加粗来自 name（旧数据 / 旧备份）或正文第一行的 `**…**`（迁移后），
     见 utils/cardText。字号统一 17px、颜色统一主文字色 —— 卡片上看到的就是正文本身，
     不再有「标题 16 / 摘要 13 / 灰字」三档。
  2. **右上角「⋯」删掉**，改成长按卡片（400ms）在**长按点**弹出收藏 / 删除（菜单由列表渲染）。
     按住后手指位移超过 10px 立即取消 —— 列表要能滑动，滑动时绝不能弹菜单。
     长按触发后那一次 click 会被吞掉，否则菜单和详情页会同时打开。
  3. **封面改成 16:9 且与正文同宽**（卡片左右内边距 10 + 列表左右 12 = 22，与详情正文同一左基线）：
     点开详情时图片尺寸完全不变、只做垂直平移。以前卡片 16:9 / 详情 4:3，展开时图会「长大」。
  4. **张数角标在图片右下角**，显示总张数（不是卡片右下角，也不是「+N」增量）。

  ⚠️ 入场动画的规矩没变：`.is-entering` 只由列表按 id 给一次，播完即摘；
     这里只认前缀（scoped 样式会给 @keyframes 改名），且不写任何常驻 animation。
-->
<template>
  <div
    ref="rootEl"
    :data-id="item.id"
    class="data-card"
    :class="{ 'has-cover': hasPics, 'is-entering': entering, 'is-pressing': pressing }"
    role="button"
    @click="onClick"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerUp"
    @contextmenu.prevent
    @animationend="onAnimationEnd"
  >
    <!-- 封面：16:9，宽度随卡片内边距 → 与正文同宽 -->
    <div v-if="hasPics" class="card-cover">
      <img v-if="coverUrl" :src="coverUrl" alt="" draggable="false" />
      <div v-else class="cover-void"></div>
      <span v-if="picCount > 1" class="cover-count">{{ picCount }} 张</span>
    </div>

    <div class="card-main">
      <!-- 首行加粗：空就没有这一行（不占位、不写「未命名」）。
           已收藏的标记缩小到 12px 挂在首行前面，不再占一张卡的一整行。 -->
      <strong v-if="lead" class="card-lead">
        <AppIcon v-if="favorited" name="bookmark" :size="12" class="fav-mark" />
        <span class="lead-text">{{ lead }}</span>
      </strong>
      <span v-if="body" class="card-body">{{ body }}</span>
      <span class="card-meta">
        <span v-if="item.time" class="meta-item">
          <AppIcon name="clock" :size="11" /> {{ item.time }}
        </span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { getImageUrl } from '../../composables/useImageStore'
import { splitCardText } from '../../utils/cardText'

const props = defineProps({
  item:      { type: Object,  required: true },
  favorited: { type: Boolean, default: false },
  /** 本次是否要播入场动画 —— 由列表按 id 判定「第一次出现」才给，播完即收回 */
  entering:  { type: Boolean, default: false }
})

const emit = defineEmits(['open', 'entered', 'long-press'])

/** 长按判据：按住 400ms 且手指没走开 10px 以上 */
const LONG_PRESS_MS   = 400
const MOVE_TOLERANCE  = 10

const pressing = ref(false)      // 长按已触发（卡片压低一点，表示「被按住了」）
const rootEl = ref(null)         // 转场要量这张卡的矩形，所以得拿到根元素
let pressTimer = null
let startX = 0
let startY = 0
let fired = false                // 本次手势是否已经变成「长按」
let moved = false                // 本次手势是否滑动过（滚动/拖 —— 松手不该打开详情）

function clearTimer() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
}

function onPointerDown(e) {
  // 只认主键 / 触摸；鼠标右键与中键交给浏览器
  if (e.pointerType === 'mouse' && e.button !== 0) return
  startX = e.clientX
  startY = e.clientY
  fired = false
  moved = false
  clearTimer()
  pressTimer = setTimeout(() => {
    pressTimer = null
    fired = true
    pressing.value = true
    emit('long-press', { id: props.item.id, x: startX, y: startY })
  }, LONG_PRESS_MS)
}

/**
 * 手指一动就撤销。
 * 判据必须是**人产生的信号**（pointer 位移），不能挂在 scroll 上 ——
 * 列表自己也会滚（新建记录后自动滚到底之类），那会把菜单误弹在别处。
 */
function onPointerMove(e) {
  if (!pressTimer && moved) return
  if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
    clearTimer()
    // 滑动过就记一笔：手指是在滚列表，不是在点这张卡 —— 松手那一下不能打开详情
    moved = true
  }
}

function onPointerUp() {
  clearTimer()
  pressing.value = false
}

function onClick() {
  // 长按弹过菜单、或这一下本来就是滑动 → 都不该打开详情
  if (fired || moved) { fired = false; moved = false; return }
  // 把根元素一起交出去：父级要用它的矩形做展开动画的起点
  emit('open', rootEl.value)
}

onBeforeUnmount(clearTimer)

/**
 * 入场动画播完 → 通知列表把 `.is-entering` 摘掉。
 * ⚠ 只能按前缀认，不能写全等：Vue 的 scoped 样式会给 @keyframes **改名**
 *   （实测 `cardFadeIn-373722f9`），写 `=== 'cardFadeIn'` 会让这里永远不触发，
 *   结果 `.is-entering` 一直挂在卡上，透明度就被那条 animation 永久接管。
 * 也只认「动画在卡片自己身上」（target === currentTarget），卡内其它元素的动画不算。
 */
function onAnimationEnd(e) {
  if (e.target !== e.currentTarget) return
  if (!String(e.animationName || '').startsWith('cardFadeIn')) return
  emit('entered', props.item.id)
}

// ========== 文字：加粗首行 + 正文预览 ==========
const text = computed(() => splitCardText(props.item))
const lead = computed(() => text.value.lead)
const body = computed(() => text.value.body)

// ========== 封面图 ==========
const picCount = computed(() => (Array.isArray(props.item.pics) ? props.item.pics.length : 0))
const hasPics  = computed(() => picCount.value > 0)

/** 第一张图的 blob URL。空串 = 还没读到 / 读不出来（此时显示占位色块，卡片高度不跳） */
const coverUrl = ref('')

/**
 * 按 pics 的**内容**监听而不是数组引用：父级每次更新记录都给新数组，
 * 引用比较会让每张卡每次都重查一遍 IndexedDB。
 */
watch(
  () => (Array.isArray(props.item.pics) ? props.item.pics.join(',') : ''),
  async (joined) => {
    const first = joined ? joined.split(',')[0] : ''
    if (!first) { coverUrl.value = ''; return }
    try {
      coverUrl.value = (await getImageUrl(first)) || ''
    } catch {
      coverUrl.value = '' // 图读不出来就留占位色，不弹错打断列表
    }
  },
  { immediate: true }
)
</script>

<style scoped>
/* 卡片：左右内边距 10 + 列表左右 12 = 距屏幕 22 —— 与详情正文的 22 完全对齐。
   这不是审美数字：两边对齐，展开时文字宽度不变 → 一个字都不会重排。
   反面教材见文件头第 3 条：宽度差 58px 时，展开过程整段文字会重新折行。 */
.data-card {
  position: relative;
  /* 内容层用「亚克力」不是玻璃：一点点透 + 顶边内高光 + 半像素描边 + 双层柔投影。
     不挂 backdrop-filter —— 白底上采样纯色等于白烧一层合成，列表几十张必掉帧。 */
  background: var(--surface-card);
  border-radius: var(--radius-2xl);
  padding: 14px 10px;
  display: flex; flex-direction: column;
  box-shadow: var(--surface-card-rim), var(--surface-card-shadow);
  cursor: pointer;
  overflow: hidden;
  /* 长按不该弹系统菜单、也不该选中文字 */
  -webkit-touch-callout: none;
  -webkit-user-select: none; user-select: none;
  transition: transform 0.16s ease-out, box-shadow 0.22s ease-out;
}
/* 桌面端悬停：抬 1px、影子散开 —— 「这张可以点开」的预演。
   移动端没有 hover，用下面的按压态代替。 */
@media (hover: hover) {
  .data-card:hover {
    transform: translateY(-1px);
    box-shadow: var(--surface-card-rim), var(--surface-card-shadow-up);
  }
}
/* 长按触发后卡片自己压低一点：告诉用户「这一张被按住了」，菜单属于它。
   写在 hover 之后，两者同时命中时以按压为准。 */
.data-card.is-pressing {
  transform: scale(0.985);
  box-shadow: var(--surface-card-rim), var(--surface-card-shadow-up);
}

/* 入场动画：只在这张卡第一次出现时由父级的 .is-entering 打开一次，播完即被摘掉 */
.data-card.is-entering {
  animation: cardFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
@keyframes cardFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 有封面：卡片本体不再加上内边距（图贴卡片上沿），文字自己让出 11px */
.data-card.has-cover { padding-top: 0; }
.has-cover .card-main { padding-top: 11px; }

/* 封面：16:9、圆角 14、与正文同宽。
   圆角单独给（不靠卡片裁切），因为详情页图区也是 14 圆角 —— 展开时两个角对得上。 */
.card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-top: 10px;
  border-radius: var(--radius-2xl);
  overflow: hidden;
  background: var(--color-border-light);
  flex: 0 0 auto;
}
.card-cover img {
  width: 100%; height: 100%;
  object-fit: cover; display: block;
  -webkit-user-drag: none;
}
.cover-void { width: 100%; height: 100%; background: var(--color-border-light); }

/* 张数：**图片区**右下角。压暗底才能在任意照片上都读得出来 */
.cover-count {
  position: absolute;
  right: 8px; bottom: 8px;
  padding: 1px 7px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: var(--text-11);
  font-weight: 600;
  line-height: 1.5;
}

/* 文字区：首行加粗 + 正文两行。没有第三档灰字（时间仍是 muted 的元信息） */
.card-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.card-lead {
  display: flex; align-items: center; gap: 4px;
  font-size: var(--text-17);
  font-weight: 650;
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
  min-width: 0;
}
.lead-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 已收藏：首行前一枚小书签。不加底色、不加边框 —— 卡片上不该多一块色 */
.fav-mark { color: var(--color-accent); flex: 0 0 auto; }
.card-body {
  font-size: var(--text-17);
  line-height: 1.55;
  color: var(--color-text-primary);
  /* 保留正文里的换行：详情三行、卡片也只有一行的话，看着像内容被吞了（2026-11-23 反馈） */
  white-space: pre-line;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.meta-item {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: var(--text-11); color: var(--color-text-muted);
}
</style>
