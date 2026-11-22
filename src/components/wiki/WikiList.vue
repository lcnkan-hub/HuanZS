<!--
  记录列表页积木（2026-11-21 单层重构）
  展示全部记录（时间倒序由数据顺序保证），支持搜索过滤与「只看我创建的」筛选。
  空列表：没有提示（上面就是占满一行的添加按钮）；
          但「搜不到」「只看我创建的」必须给一句话，否则用户会以为记录丢了。
-->
<template>
  <div class="page-content">
    <!-- 按日期分组：记录只有时间一个维度，就用时间给列表做出节奏。
         今天 / 昨天 / 更早 —— 不给标签就不加（没有内容的分组标题是噪音）。 -->
    <template v-if="items.length === 0">
      <div v-if="emptyHint" class="empty-tip">{{ emptyHint }}</div>
    </template>
    <template v-else>
      <div v-for="group in groups" :key="group.label" class="group">
        <div class="group-title">{{ group.label }}</div>
        <div class="item-list">
          <WikiCard
            v-for="(item, index) in group.items"
            :key="item.id"
            :item="item"
            :favorited="isFavorite(item.id)"
            :menu-open="openMenuId === item.id"
            :style="{ animationDelay: (group.offset + index) * 70 + 'ms' }"
            @open="$emit('open-item', item)"
            @delete="(id) => $emit('delete-item', id)"
            @toggle-menu="toggleMenu(item.id)"
            @toggle-favorite="(id) => toggleFavorite(id)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import WikiCard from './WikiCard.vue'
import { isFavorite, toggleFavorite } from '../../composables/useFavorites'

const props = defineProps({
  items:     { type: Array,  default: () => [] },
  emptyHint: { type: String, default: '' }     // 列表为空时给一句话；空串 = 什么都不显示
})
defineEmits(['open-item', 'delete-item'])

/**
 * 当前展开菜单的卡片 id —— **只允许一个**。
 * 2026-11-22 从「每张卡自己持 ref」上提到这里：那时候点开几张就几张同时展开，
 * 屏幕上一排删除按钮，而且点第二张时第一张不会收。单一状态源天然互斥。
 */
const openMenuId = ref(null)

/** 点「⋯」：同一张开着的就收起，换一张就换过去的（原来那张自动收） */
function toggleMenu(id) {
  openMenuId.value = openMenuId.value === id ? null : id
}

/** 两位补零 */
function pad(n) { return String(n).padStart(2, '0') }

/** 本地日期 → 'YYYY-MM-DD'（用本地时区，不用 toISOString：那是 UTC，晚上 8 点后会差一天） */
function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 记录时间串（2026/11/21 12:00 或 2026-11-21 19:52）→ 'YYYY-MM-DD'；认不出来返回空串 */
function dateKeyFromText(text) {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(String(text || ''))
  if (!m) return ''
  return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
}

/**
 * 分组：今天 / 昨天 / 更早。
 * offset 是这一组在整列里的起始序号，用来接着上组算错峰动画延迟 —— 不然后面每组都从 0 开始，动画会一起蹦。
 * 时间认不出来的记录一律归「更早」，不丢、不报错。
 */
const groups = computed(() => {
  const now = new Date()
  const todayKey = dateKey(now)
  const yesterdayKey = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const labels = ['今天', '昨天', '更早']
  const bucketOf = new Map(labels.map((label) => [label, []]))

  props.items.forEach((item) => {
    const key = dateKeyFromText(item.time)
    const label = key && key === todayKey ? '今天' : (key && key === yesterdayKey ? '昨天' : '更早')
    bucketOf.get(label).push(item)
  })

  const result = []
  let offset = 0
  labels.forEach((label) => {
    const list = bucketOf.get(label)
    if (list.length === 0) return
    result.push({ label, items: list, offset })
    offset += list.length
  })
  return result
})
</script>

<style scoped>
.page-content { padding: 0 20px 20px 20px; animation: fadeInContent 0.3s ease-out; }

/* 筛选 chip：与「我的」浮层里的入口同一套三色点 */
.filter-chip {
  display: inline-flex; align-items: center; gap: 6px;
  position: relative;
  padding: 5px 12px; margin: 12px 0 2px 0;
  background: rgba(0, 122, 255, 0.08); color: var(--color-accent);
  border: 1px solid rgba(0, 122, 255, 0.16); border-radius: 999px;
  font-size: var(--text-12); font-weight: 500; cursor: pointer;
  transition: background 0.2s;
}
.filter-chip:active { background: rgba(0, 122, 255, 0.16); }
.filter-chip::after { content: ''; position: absolute; inset: -10px -4px; }
.chip-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--color-accent); }
.chip-x { font-size: var(--text-10); opacity: 0.7; margin-left: 1px; }

/* 分组标题：一档小字 + 疏排，作用是「切开」而不是「强调」—— 所以比我 muted 更淡、不占卡片重量 */
.group-title {
  font-size: var(--text-12); font-weight: 600;
  color: var(--color-text-muted); letter-spacing: 0.02em;
  padding: 0 4px; margin: 14px 0 8px;
}
.group + .group .group-title { margin-top: 18px; }
.item-list { display: flex; flex-direction: column; gap: 10px; }
.empty-tip { text-align: center; color: var(--color-text-muted); margin-top: 40px; font-size: var(--text-14); }
@keyframes fadeInContent {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
