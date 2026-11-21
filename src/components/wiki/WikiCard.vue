<!--
  单条记录卡片积木（2026-11-21 单层重构）
  展示：名称 + 创建时间 + 创建者；支持删除。
  进场动画沿用原卡片（cardFadeIn + 由列表给 animationDelay 的错峰），一行未改。
-->
<template>
  <div class="data-card" @click="$emit('open')">
    <div class="card-main">
      <span class="item-name">{{ item.name || '未命名' }}</span>
      <span v-if="summary" class="item-summary">{{ summary }}</span>
      <span class="card-meta">
        <span v-if="item.time" class="meta-item">
          <AppIcon name="clock" :size="11" /> {{ item.time }}
        </span>
      </span>
    </div>
    <!-- 更多：删除收进来。
         原来每张卡右侧挂一个红垃圾桶：一屏六个红块把视线全牵走，而且点了会弹原生 confirm ——
         那东西在 WebView / 部分浏览器里直接被拦，用户看到的就是「点了没反应」。
         现在两步：点「⋯」→ 点「删除」，展开本身就是一次确认。 -->
    <div class="card-more">
      <button
        class="more-btn"
        type="button"
        aria-label="更多操作"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        @click.stop="menuOpen = !menuOpen"
      >
        <AppIcon name="more" :size="16" />
      </button>
      <button
        v-if="menuOpen"
        class="delete-btn"
        type="button"
        @click.stop="onDelete"
      >
        <AppIcon name="trash" :size="14" /> 删除
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  item: { type: Object, required: true }
})
const emit = defineEmits(['open', 'delete'])

/** 每张卡自己的菜单开关（卡片是循环渲染的，状态必须落在卡片内部） */
const menuOpen = ref(false)

/** 删除：不做二次确认弹窗 —— 展开菜单已经是第二下点击了 */
function onDelete() {
  menuOpen.value = false
  emit('delete', props.item.id)
}

/**
 * 正文摘一句放在标题下面：列表原来只有「名字 + 时间」两行，
 * 一屏扫过去每条的分量完全一样 —— 有正文却一个字不给，等于把最能区分内容的东西藏起来。
 * 只取前 80 字、单行截断：卡片是用来扫的，不是用来读的；剥掉 markdown 记号免得出现 ## 与 **。
 */
const summary = computed(() => {
  const text = String(props.item.wiki || '')
    .replace(/[#>*`~_[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 80)
})
</script>

<style scoped>
.data-card {
  position: relative;
  background: var(--color-bg-card); border-radius: var(--radius-2xl);
  padding: 14px 46px 14px 16px;  /* 右侧 46 = 给右上角「⋯」让位 */ display: flex; justify-content: space-between;
  align-items: center; gap: 8px; box-shadow: var(--shadow-card); cursor: pointer;
  animation: cardFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
@keyframes cardFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.card-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
/* 标题与 meta 拉开两档（16/600 对 11/muted）：层次靠对比，不靠字号堆叠 */
.item-name {
  font-size: var(--text-16); font-weight: 600; color: var(--color-text-primary);
  letter-spacing: -0.01em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 摘要行：比标题轻一档、比 meta 重一档 —— 三档字阶（16 标题 / 13 摘要 / 11 meta）撑起层次 */
.item-summary {
  font-size: var(--text-13); color: var(--color-text-secondary);
  line-height: 1.35;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.card-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.meta-item {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: var(--text-11); color: var(--color-text-muted);
}
/* 右上角「⋯」：34 视觉 + ::after 撑到 44 热区；不带底色，只有按下时给浅底 */
.card-more {
  position: absolute; top: 6px; right: 6px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
  z-index: 2;
}
.more-btn {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; border-radius: 50%;
  color: var(--color-text-muted); cursor: pointer; position: relative;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.16s ease;
}
.more-btn::after { content: ''; position: absolute; inset: -5px; }
.more-btn:active { background-color: var(--color-bg-input); }

/* 展开后的删除：浅红底 + 红字，从「⋯」下方弹出（位移 + 淡入，只动 transform/opacity） */
.delete-btn {
  display: flex; align-items: center; gap: 4px;
  height: 32px; padding: 0 10px;
  background-color: var(--color-danger-bg); color: var(--color-danger);
  border: none; border-radius: var(--radius-md);
  font-size: var(--text-12); font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  animation: actionPop 0.18s var(--ease-pop) backwards;
  -webkit-tap-highlight-color: transparent;
}
.delete-btn:active { transform: scale(0.96); }
@keyframes actionPop {
  from { opacity: 0; transform: translateY(-4px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
