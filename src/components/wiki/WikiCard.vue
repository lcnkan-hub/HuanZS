<!--
  单条记录卡片积木（2026-11-21 单层重构 · 2026-11-22 菜单改版）
  展示：名称 + 摘要 + 创建时间；右上角「⋯」展开 收藏 / 删除。
  进场动画沿用原卡片（cardFadeIn + 由列表给 animationDelay 的错峰），一行未改。

  2026-11-22 两处改动：
  1. 「⋯」按下**不再给灰底**（.more-btn:active 的 background 去掉了）—— 按住那一瞬的灰块
     会把三点本身糊掉；展开菜单本身就是反馈，不需要再叠一层按下态。
  2. 菜单开合状态**上提到列表**（menuOpen 从父级传入，不再各卡自己持 ref）：
     原来每张卡一个状态，点开五张就五张全开着、屏上一排删除按钮；
     现在父级只记一个 openMenuId，点第二张时第一张自动收。
-->
<template>
  <div class="data-card" :class="{ 'has-cover': hasPics }" @click="$emit('open')">
    <!-- 封面（2026-11-22 布局甲）：只在有图时出现，铺满卡片上半部 -->
    <div v-if="hasPics" class="card-cover">
      <img v-if="coverUrl" :src="coverUrl" alt="" draggable="false" />
      <div v-else class="cover-void"></div>
      <span v-if="extraCount > 0" class="cover-more">+{{ extraCount }}</span>
    </div>

    <div class="card-main">
      <!-- 标题为空就什么都不显示：不写「未命名」，也不占位（用户 2026-11-22 要求） -->
      <span v-if="(item.name || '').trim()" class="item-name">
        <AppIcon v-if="favorited" name="bookmark" :size="12" class="fav-mark" />
        {{ item.name }}
      </span>
      <span v-if="summary" class="item-summary">{{ summary }}</span>
      <span class="card-meta">
        <span v-if="item.time" class="meta-item">
          <AppIcon name="clock" :size="11" /> {{ item.time }}
        </span>
        <span v-if="extraCount > 0" class="meta-item">{{ picCount }} 张图</span>
      </span>
    </div>

    <!-- 更多：收藏 / 删除。两步确认，展开本身就是第二下 -->
    <div class="card-more">
      <button
        class="more-btn"
        :class="{ 'is-open': menuOpen }"
        type="button"
        aria-label="更多操作"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        @click.stop="$emit('toggle-menu')"
      >
        <AppIcon name="more" :size="16" />
      </button>
      <div v-if="menuOpen" class="menu-pop">
        <button class="menu-item fav-btn" type="button" @click.stop="onToggleFavorite">
          <AppIcon name="bookmark" :size="14" /> {{ favorited ? '取消收藏' : '收藏' }}
        </button>
        <button class="menu-item delete-btn" type="button" @click.stop="onDelete">
          <AppIcon name="trash" :size="14" /> 删除
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { getImageUrl } from '../../composables/useImageStore'

const props = defineProps({
  item:      { type: Object,  required: true },
  favorited: { type: Boolean, default: false },
  /** 菜单是否展开 —— 由列表统一持有，保证同时只有一张开着 */
  menuOpen:  { type: Boolean, default: false }
})
const emit = defineEmits(['open', 'delete', 'toggle-menu', 'toggle-favorite'])

/** 收藏 / 取消收藏：点完自动收起菜单（不然菜单会替用户挡着卡片） */
function onToggleFavorite() {
  emit('toggle-favorite', props.item.id)
  emit('toggle-menu')
}

/** 删除：不做二次确认弹窗 —— 展开菜单已经是第二下点击 */
function onDelete() {
  emit('toggle-menu')
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

// ========== 封面图（布局甲） ==========

const picCount   = computed(() => (Array.isArray(props.item.pics) ? props.item.pics.length : 0))
const hasPics    = computed(() => picCount.value > 0)
const extraCount = computed(() => Math.max(0, picCount.value - 1))

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
.data-card {
  position: relative;
  background: var(--color-bg-card); border-radius: var(--radius-2xl);
  padding: 14px 46px 14px 16px;  /* 右侧 46 = 给右上角「⋯」让位 */ display: flex; justify-content: space-between;
  align-items: center; gap: 8px; box-shadow: var(--shadow-card); cursor: pointer;
  animation: cardFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  overflow: hidden;
}
@keyframes cardFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 有封面：卡片改成上下结构，图铺满上半部。左右留白交给 .card-main，
   卡片本体不再给内边距 —— 否则图会缩进去一圈。 */
.data-card.has-cover {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 0;
  padding: 0 0 13px;
}

/* 封面：16:9。object-fit: cover —— 列表里图是"引子"，宁可裁一点也要版式齐 */
.card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--color-border-light, #eeeef2);
}
.card-cover img {
  width: 100%; height: 100%;
  object-fit: cover; display: block;
  -webkit-user-drag: none;
}
.cover-void { width: 100%; height: 100%; background: var(--color-border-light, #eeeef2); }

/* 多图角标：压在封面右下。压暗底才能在任意照片上都读得出来 */
.cover-more {
  position: absolute;
  right: 8px; bottom: 8px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: var(--text-11);
  font-weight: 600;
  line-height: 1.5;
}
.card-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
/* 有封面时文字自己让出「⋯」的位置（卡片本体已经不给了） */
.has-cover .card-main { padding: 11px 46px 0 16px; }
/* 标题与 meta 拉开两档（16/600 对 11/muted）：层次靠对比，不靠字号堆叠 */
.item-name {
  font-size: var(--text-16); font-weight: 600; color: var(--color-text-primary);
  letter-spacing: -0.01em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center; gap: 4px;
}
/* 已收藏：标题前一枚小书签。不加底色、不加边框 —— 卡片上不该多一块色，一个符号就够认 */
.fav-mark { color: var(--color-accent); flex: 0 0 auto; }
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
/* 右上角「⋯」：34 视觉 + ::after 撑到 44 热区。按下**不给底色**，见文件头说明 */
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
  /* 2026-11-22：手机上点一下会闪一圈灰 —— 那是浏览器/WebView 给按钮的默认焦点与高亮。
     这里四道闸全关掉：appearance 去掉系统控件外观、tap-highlight 去安卓高亮、
     outline 去焦点框、:hover 也给一次空值兜住桌面端。 */
  -webkit-appearance: none; appearance: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  touch-action: manipulation;
}
.more-btn::after { content: ''; position: absolute; inset: -5px; }
/* 压在封面图上的三点：照片底色不可控，白色 + 一层投影才读得出来 */
.has-cover .more-btn {
  color: rgba(255, 255, 255, 0.95);
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
}
.more-btn:hover, .more-btn:focus, .more-btn:active { outline: none; background: none; }
/* 键盘导航的焦点改画在圆内部（inset），不向外描一圈 —— 外圈在手机上就是用户说的那个圈 */
.more-btn:focus-visible { box-shadow: inset 0 0 0 2px var(--color-accent); }

/* 点开时三个点自己跳一下：按下给反馈，但不用系统那圈灰 */
.more-btn.is-open { animation: moreBounce 0.32s var(--ease-pop); }
@keyframes moreBounce {
  0%   { transform: scale(1); }
  35%  { transform: scale(0.82); }
  70%  { transform: scale(1.1); }
  100% { transform: scale(1); }
}

/* 弹出菜单：横向排在「⋯」下方向左展开（右边缘对齐三点），收藏在前、删除在后 */
.menu-pop { display: flex; flex-direction: row; gap: 6px; align-items: center; }
.menu-item {
  display: flex; align-items: center; gap: 4px;
  height: 32px; padding: 0 10px;
  border: none; border-radius: var(--radius-md);
  font-size: var(--text-12); font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  -webkit-tap-highlight-color: transparent;
  animation: actionPop 0.18s var(--ease-pop) backwards;
}
.menu-item:active { transform: scale(0.96); }
/* 第二项晚 40ms 出来：两个同时蹦像弹窗，错开才像"跳出来" */
.menu-item:nth-child(2) { animation-delay: 40ms; }

/* 两个菜单项同一套规格（高度/圆角/内边距/阴影一致），只有色相按语义分：
   收藏是中性动作 → 浅蓝；删除是破坏性动作 → 浅红。 */
.fav-btn { background-color: var(--color-accent-light); color: var(--color-accent); }
.delete-btn { background-color: var(--color-danger-bg); color: var(--color-danger); }

@keyframes actionPop {
  from { opacity: 0; transform: translateY(-4px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
