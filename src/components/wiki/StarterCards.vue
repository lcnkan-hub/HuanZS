<!--
  空库开局卡片积木（I04）
  百科分类一条都没有时，替代「暂无数据」：把空列表变成一次对话的开头。
  只负责展示与抛事件，不碰存储、不切 Tab（那些由 App.vue 接）。
-->
<template>
  <div class="starter">
    <p class="starter-lead">这里还空着 —— 说一句，我就开始记了。</p>

    <button
      v-for="(card, i) in cards"
      :key="card.tab"
      type="button"
      class="starter-card"
      :style="{ animationDelay: i * 70 + 'ms' }"
      @click="$emit('ask', card.tab)"
    >
      <span class="starter-q">{{ card.question }}</span>
      <span class="starter-where">{{ card.where }}</span>
    </button>

    <button type="button" class="starter-import" @click="$emit('open-backup')">
      <AppIcon name="import" :size="15" />
      <span>{{ importLine }}</span>
    </button>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'
import { STARTER_CARDS, STARTER_IMPORT_LINE } from '../../constants/starter'

const cards = STARTER_CARDS
const importLine = STARTER_IMPORT_LINE

defineEmits(['ask', 'open-backup'])
</script>

<style scoped>
.starter { display: flex; flex-direction: column; gap: 10px; margin-top: 15px; }
.starter-lead {
  margin: 0 0 2px 0; font-size: 13px; line-height: 1.6;
  color: var(--color-text-muted);
}
.starter-card {
  display: flex; flex-direction: column; gap: 4px; align-items: flex-start;
  width: 100%; padding: 14px 16px; text-align: left;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  cursor: pointer; animation: starterIn 0.32s ease-out both;
  transition: transform 0.16s ease, border-color 0.16s ease;
}
.starter-card:active { transform: scale(0.985); }
/* 原写的是 var(--color-text) —— 全库没有这个令牌，也没写 fallback，
   于是整条 color 声明被丢弃、颜色一路继承到 <button> 的浏览器默认值。
   因为默认值和 --color-text-primary(#1d1d1f) 本来就几乎一样，视觉上看不出来，
   属于典型的「静默失败」：写错了但没人会知道。 */
.starter-q { font-size: 15px; font-weight: 500; color: var(--color-text-primary); }
.starter-where { font-size: 12px; color: var(--color-text-muted); }

.starter-import {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-top: 6px; padding: 10px; width: 100%;
  background: none; border: none; cursor: pointer;
  font-size: 13px; color: var(--color-text-muted);
}
.starter-import:active { opacity: 0.6; }

@keyframes starterIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
