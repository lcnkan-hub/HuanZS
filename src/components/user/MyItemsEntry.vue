<!--
  「我创建的」数字入口积木（2026-10-11 ·「我的」页 B 档重排）
  职责：「我的」页里「我的东西」的唯一出口 —— 一行数字，点一下跳到对应百科 Tab（并只看我创建的）
  为什么不是折叠列表：同一页里「创造力足迹」已经在数这些条目了，再列一份是第二份拷贝；
  看条目该去的地方是底栏那三个 Tab，这里只留「有多少、点进去看」。
  空态不给空表格：一条都没有时只留一句引导（与 I04 空库开局同一条理念）。
  数值由 props 传入（MinePage 按当前账号过滤后给），本组件不碰存储。
-->
<template>
  <div class="my-items-entry">
    <div class="entry-header">
      <span class="entry-title">我创建的</span>
      <span v-if="totalCount > 0" class="entry-hint">点分类去看</span>
    </div>

    <p v-if="totalCount === 0" class="entry-empty">
      还没有属于你的条目 —— 去王冠说一句，它会替你记下来。
    </p>

    <div v-else class="entry-chips">
      <button
        v-for="cat in cats"
        :key="cat.key"
        class="entry-chip"
        type="button"
        :aria-label="'去看我创建的' + cat.label"
        @click="$emit('jump', cat.key)"
      >
        <i class="chip-dot" :class="'dot-' + cat.key"></i>
        <span class="chip-label">{{ cat.label }}</span>
        <span class="chip-num">{{ cat.count }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ALL_CATEGORIES, TAB_NAMES } from '../../constants/categories'

const props = defineProps({
  // 按分类分好的「我创建的」条目，形如 { game: [...], note: [...], life: [...] }
  myData: { type: Object, required: true }
})

defineEmits(['jump'])

// 分类顺序固定走 constants 的 ALL_CATEGORIES（与底栏、足迹进度条同一份顺序）
const cats = computed(() =>
  ALL_CATEGORIES.map(key => ({
    key,
    label: TAB_NAMES[key] || key,
    count: (props.myData[key] || []).length
  }))
)

const totalCount = computed(() => cats.value.reduce((n, c) => n + c.count, 0))
</script>

<style scoped>
.my-items-entry {
  background: var(--color-bg-card); border-radius: var(--radius-3xl);
  padding: 16px 18px; box-shadow: var(--shadow-card);
  border: 1px solid var(--color-border-light); margin-bottom: 22px;
}

.entry-header {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 12px;
}
.entry-title { font-size: var(--text-15); font-weight: 600; color: var(--color-text-primary); }
.entry-hint { font-size: var(--text-11); color: var(--color-text-muted); }

.entry-empty { font-size: var(--text-12); color: var(--color-text-muted); line-height: 1.6; }

.entry-chips { display: flex; gap: 8px; }
.entry-chip {
  flex: 1; min-width: 0;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 11px 8px; min-height: 44px; border-radius: var(--radius-lg);
  background: #f8f9fc; border: 1px solid var(--color-border-light);
  font-size: var(--text-13); color: var(--color-text-secondary); cursor: pointer;
  transition: transform 0.15s, background 0.2s;
}
.entry-chip:active { transform: scale(0.97); background: #f1f3f8; }
.chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-num {
  font-size: var(--text-14); font-weight: 700; color: var(--color-accent);
  font-family: var(--font-mono);
}

/* 色点与足迹进度条的三色一一对应，读到同一套颜色 */
.chip-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.dot-game { background: var(--color-progress-game); }
.dot-note { background: var(--color-progress-note); }
.dot-life { background: var(--color-progress-life); }
</style>
