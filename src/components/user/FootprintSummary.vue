<!--
  创造力足迹积木
  展示累计创建条目数、总字数、分类占比进度条
  分类明细（各分类几条）不在这里重复：紧邻的 MyItemsEntry（「我创建的」）用同一套三色给出了数字，
  这里只负责「总量与占比」这一件事（2026-10-11「我的」页重排）
-->
<template>
  <div class="footprint-summary-card">
    <div class="summary-header">
      <span class="summary-title">
        <AppIcon name="stats" :size="16" /> 创造力足迹
      </span>
      <span class="summary-philosophy">不留恋在线时长，只珍藏每份灵感</span>
    </div>

    <div class="metrics-grid">
      <div class="metric-box">
        <span class="metric-num">{{ totalCount }}</span>
        <span class="metric-label">累计创建条目</span>
      </div>
      <div class="metric-box">
        <span class="metric-num">{{ totalWords }}</span>
        <span class="metric-label">编写百科总字数</span>
      </div>
    </div>

    <div v-if="totalCount > 0" class="progress-bar-container">
      <div class="progress-segment game" :style="{ width: getPercentage('game') }" title="游戏"></div>
      <div class="progress-segment note" :style="{ width: getPercentage('note') }" title="笔记"></div>
      <div class="progress-segment life" :style="{ width: getPercentage('life') }" title="生活"></div>
    </div>
    <!-- 分类明细（游戏/笔记/生活 各几条）不在这里重复写一遍 ——
         紧邻的「我创建的」入口已经用同一套三色点把数字给了出去（2026-10-11「我的」页重排） -->
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  myFilteredData: { type: Object, required: true }
})

const totalCount = computed(() =>
  props.myFilteredData.game.length + props.myFilteredData.note.length + props.myFilteredData.life.length
)

const totalWords = computed(() => {
  let words = 0
  ;['game', 'note', 'life'].forEach(type => {
    props.myFilteredData[type].forEach(item => {
      words += (item.wiki || '').length
    })
  })
  return words
})

const getPercentage = (type) => {
  if (totalCount.value === 0) return '0%'
  const count = props.myFilteredData[type]?.length || 0
  return Math.round((count / totalCount.value) * 100) + '%'
}
</script>

<style scoped>
.footprint-summary-card {
  background: var(--color-bg-card); border-radius: var(--radius-3xl);
  padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.02);
  border: 1px solid var(--color-border-light); margin-bottom: 22px;
}
.summary-header { display: flex; flex-direction: column; gap: 2px; margin-bottom: 14px; }
.summary-title {
  font-size: 15px; font-weight: 600; color: var(--color-text-primary);
  display: flex; align-items: center; gap: 4px;
}
.summary-philosophy { font-size: 11px; color: var(--color-text-light); }
.metrics-grid { display: flex; gap: 15px; margin-bottom: 14px; }
.metric-box {
  flex: 1; background: #f8f9fc; padding: 12px; border-radius: var(--radius-lg);
  display: flex; flex-direction: column; gap: 2px;
}
.metric-num {
  font-size: 20px; font-weight: 700; color: var(--color-accent);
  font-family: var(--font-mono);
}
.metric-label { font-size: 11px; color: var(--color-text-muted); }
.progress-bar-container {
  height: 8px; border-radius: 4px; overflow: hidden; display: flex;
  background: var(--color-border-input);
}
.progress-segment { height: 100%; transition: width 0.3s ease; }
.progress-segment.game { background-color: var(--color-progress-game); }
.progress-segment.note { background-color: var(--color-progress-note); }
.progress-segment.life { background-color: var(--color-progress-life); }
</style>
