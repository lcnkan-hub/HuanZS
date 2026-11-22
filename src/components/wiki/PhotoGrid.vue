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
  <div v-if="shown.length" class="photo-grid" :class="'n' + layoutCount">
    <div
      v-for="(p, i) in shown"
      :key="p.id"
      class="cell"
      @click="$emit('preview', i)"
    >
      <img v-if="p.url" :src="p.url" alt="" draggable="false" />
      <!-- 还没解析出来时的占位：比空白好，至少说明「这里有一张图」 -->
      <div v-else class="cell-void"></div>
      <span v-if="moreCount && i === 4" class="cell-more">+{{ moreCount }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getImageUrl } from '../../composables/useImageStore'

const props = defineProps({
  /** 图片 id 数组（记录上的 pics 字段） */
  pics: { type: Array, default: () => [] }
})
defineEmits(['preview'])

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
}

.cell {
  position: relative;
  overflow: hidden;
  background: var(--color-border-light, #f2f2f7);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.cell img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  -webkit-user-drag: none;
}
.cell:active img { opacity: 0.86; }
.cell-void { width: 100%; height: 100%; background: var(--color-border-light, #f2f2f7); }

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

/* 1 张：整宽 4:3 —— 单张图值得大一点，这是整条记录唯一的视觉锚点 */
.n1 { grid-template-columns: 1fr; }
.n1 .cell { aspect-ratio: 4 / 3; }

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
