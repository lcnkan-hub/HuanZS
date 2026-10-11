<!--
  百科列表页积木
  展示某分类下的所有条目，支持搜索过滤
  「只看我创建的」（2026-10-11）：从「我的」页那个数字入口跳过来时带上的状态。
  为什么是看得见、点得掉的一个 chip：数字说「我创建的 3 条」，点进来就该只看到那 3 条；
  但筛选静悄悄生效最招人烦（用户会以为条目丢了），所以状态必须显式、且一键可退。
-->
<template>
  <div class="page-content">
    <h2><AppIcon :name="icon" :size="24" /> {{ tabName }}百科</h2>

    <button
      v-if="mineOnly"
      class="filter-chip"
      type="button"
      @click="$emit('clear-mine-only')"
    >
      <i class="chip-dot" :class="'dot-' + icon"></i>
      只看我创建的
      <span class="chip-x">✕</span>
    </button>

    <div class="item-list">
      <!-- 空库开局（I04）：这条分类一条都没有时，不显示「暂无数据」，而是给三张能点的卡片。
           必须与「搜索没搜到」分开 —— 后者只是过滤结果为空，用户其实有一堆条目。 -->
      <StarterCards
        v-if="items.length === 0 && libraryEmpty"
        @ask="(tab) => $emit('ask-starter', tab)"
        @open-backup="$emit('open-backup')"
      />
      <div v-else-if="items.length === 0" class="empty-tip">
        {{ mineOnly ? '你在这个分类下还没有条目' : '没搜到相关条目，换个词试试' }}
      </div>
      <WikiCard
        v-for="(item, index) in items"
        :key="item.id"
        :item="item"
        :isOwner="currentUser === item.creator"
        :style="{ animationDelay: index * 70 + 'ms' }"
        @open="$emit('open-item', item)"
        @delete="(id) => $emit('delete-item', id)"
      />
    </div>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'
import WikiCard from './WikiCard.vue'
import StarterCards from './StarterCards.vue'

defineProps({
  icon:         { type: String,  default: '' },
  tabName:      { type: String,  default: '' },
  items:        { type: Array,   default: () => [] },
  currentUser:  { type: String,  default: '' },
  libraryEmpty: { type: Boolean, default: false }, // 该分类真的一条都没有（不是搜索过滤空）
  mineOnly:     { type: Boolean, default: false }  // 只看我创建的（由 App 的 mineOnly 状态传入）
})
defineEmits(['open-item', 'delete-item', 'ask-starter', 'open-backup', 'clear-mine-only'])
</script>

<style scoped>
.page-content { padding: 20px; animation: fadeInContent 0.3s ease-out; }
.page-content h2 {
  font-size: var(--text-22); font-weight: 600; margin-bottom: 15px;
  display: flex; align-items: center; gap: 6px;
}

/* 筛选 chip：与「我的」页入口同一套三色点，一眼看出筛的是哪个分类 */
.filter-chip {
  display: inline-flex; align-items: center; gap: 6px;
  /* 撑到 44 会把这颗小胶囊吹成一根横条，所以保持 24 的视觉、靠命中区外扩到 44。
     它整页只有一枚（v-if mineOnly），上方是标题留白、下方是 item-list 的 15px 间隔，
     外扩出来的面积不压任何别的东西，不会误触。 */
  position: relative;
  padding: 5px 12px; margin-bottom: 2px;
  background: rgba(0, 122, 255, 0.08); color: var(--color-accent);
  border: 1px solid rgba(0, 122, 255, 0.16); border-radius: 999px;
  font-size: var(--text-12); font-weight: 500; cursor: pointer;
  transition: background 0.2s;
}
.filter-chip:active { background: rgba(0, 122, 255, 0.16); }
.filter-chip::after { content: ''; position: absolute; inset: -10px -4px; }
.chip-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.dot-game { background: var(--color-progress-game); }
.dot-note { background: var(--color-progress-note); }
.dot-life { background: var(--color-progress-life); }
.chip-x { font-size: var(--text-10); opacity: 0.7; margin-left: 1px; }

.item-list { display: flex; flex-direction: column; gap: 12px; margin-top: 15px; }
.empty-tip { text-align: center; color: var(--color-text-muted); margin-top: 40px; font-size: var(--text-14); }
@keyframes fadeInContent {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
