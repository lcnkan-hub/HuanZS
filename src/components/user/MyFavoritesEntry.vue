<!--
  「我的收藏」积木（2026-11-22 新增；2026-11-23 改成「我的」的二级页）
  职责：列出被收藏的记录，点一条直接打开它。

  为什么独立成组件：RULES 第 8 条「新功能加新积木」，MinePage 只负责编排。
  数据来源：useFavorites 的 id 列表 + 父级传下来的 records（本组件不自己读记录库，
  免得出现两份快照）。
  记录被删了但收藏没清的情况在这里被 pruneFavorites 洗掉，不会留点不开的幽灵条目。

  2026-11-23：标题行撤掉 —— 二级页的标题在卡片外面（MineSheet 的头部），
  卡里再来一个 14/600 的「我的收藏」就是同一个标题说两遍。
-->
<template>
  <section class="fav-card">
    <ul v-if="list.length" class="fav-list">
      <li v-for="item in list" :key="item.id">
        <button class="fav-row" type="button" @click="$emit('open-item', item)">
          <AppIcon name="bookmark" :size="16" class="fav-ico" />
          <span class="fav-name">{{ item.name || '未命名' }}</span>
          <span v-if="item.time" class="fav-time">{{ shortTime(item.time) }}</span>
        </button>
      </li>
    </ul>
    <!-- 空态必须显示：整块消失的话，用户会以为"收藏这个功能没做" -->
    <p v-else class="fav-empty">在记录右上角「⋯」里点收藏，就会出现在这里</p>
  </section>
</template>

<script setup>
import { computed, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { useFavorites, pruneFavorites } from '../../composables/useFavorites'

const props = defineProps({
  records: { type: Array, default: () => [] }
})
defineEmits(['open-item'])

const { ids } = useFavorites()

/** 按收藏顺序取记录（收藏最新的排最前）；找不到的记录自动跳过 */
const list = computed(() => {
  const byId = new Map(props.records.map((r) => [r.id, r]))
  return ids.value.map((id) => byId.get(id)).filter(Boolean)
})

// 记录删掉后收藏要跟着清 —— 但**不加 immediate**：首次挂载那一刻 records 有可能还是空的，
// 一上来 prune 就会把刚收藏的 id 全洗掉（这是按代码路径推出来的风险，不是实测复现；
// 不管真凶是不是它，先把这个口子堵上 —— 代价只是记录被删时晚一帧清理）。
watch(() => props.records, (val) => {
  if (Array.isArray(val) && val.length) pruneFavorites(val)
})

/** 记录时间是 '2026/11/22 13:48' 这种串，列表里只留日期部分，省地方 */
function shortTime(text) {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(String(text || ''))
  return m ? `${m[2]}/${m[3]}` : ''
}
</script>

<style scoped>
.fav-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-3xl);
  box-shadow: var(--shadow-card);
  padding: 6px 16px;
}
.fav-list { list-style: none; margin: 0; padding: 0; }
/* 行间分隔线与 MineRow 同一套：浅色 1px，不从图标左边穿过去 */
.fav-list li + li { border-top: 1px solid var(--color-border-light); }

/* 空态：一句话说清怎么收藏。不画插图、不加按钮 —— 这里只是提醒，不是引导页 */
.fav-empty {
  margin: 0; padding: 14px 0;
  font-size: var(--text-12);
  line-height: 1.6;
  color: var(--color-text-muted);
}
.fav-row {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  min-height: 44px;              /* 触控下限 */
  padding: 8px 0;
  background: none; border: none;
  text-align: left; cursor: pointer;
  font-family: var(--font-system);
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.16s ease;
}
.fav-row:active { opacity: 0.5; }
.fav-ico { color: var(--color-accent); flex: 0 0 auto; }
.fav-name {
  flex: 1; min-width: 0;
  font-size: var(--text-15);
  color: var(--color-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fav-time {
  flex: 0 0 auto;
  font-size: var(--text-11);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
