<!--
  百科列表页积木
  展示某分类下的所有条目，支持搜索过滤
-->
<template>
  <div class="page-content">
    <h2><AppIcon :name="icon" :size="24" /> {{ tabName }}百科</h2>

    <div class="item-list">
      <!-- 空库开局（I04）：这条分类一条都没有时，不显示「暂无数据」，而是给三张能点的卡片。
           必须与「搜索没搜到」分开 —— 后者只是过滤结果为空，用户其实有一堆条目。 -->
      <StarterCards
        v-if="items.length === 0 && libraryEmpty"
        @ask="(tab) => $emit('ask-starter', tab)"
        @open-backup="$emit('open-backup')"
      />
      <div v-else-if="items.length === 0" class="empty-tip">
        没搜到相关条目，换个词试试
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
  libraryEmpty: { type: Boolean, default: false } // 该分类真的一条都没有（不是搜索过滤空）
})
defineEmits(['open-item', 'delete-item', 'ask-starter', 'open-backup'])
</script>

<style scoped>
.page-content { padding: 20px; animation: fadeInContent 0.3s ease-out; }
.page-content h2 {
  font-size: 22px; font-weight: 600; margin-bottom: 15px;
  display: flex; align-items: center; gap: 6px;
}
.item-list { display: flex; flex-direction: column; gap: 12px; margin-top: 15px; }
.empty-tip { text-align: center; color: var(--color-text-muted); margin-top: 40px; font-size: 14px; }
@keyframes fadeInContent {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
