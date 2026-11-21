<!--
  底部导航栏积木（2026-11-21 浮岛 + 纯图标 + 滑动指示器）
  通过 v-model 绑定当前激活 Tab；图标使用 AppIcon 组件渲染 SVG。

  · .bottom-nav  只做**占位**（撑出高度，内容区不被浮岛盖住），不画任何东西
  · .nav-dock    真正的浮岛，position: fixed，不吃布局

  两种离场，别混：
    pushed —— 切王冠时用。跟记录页**一同向左滑出**，曲线与时长照抄 page-sheet（0.36s /
              cubic-bezier(0.2,0.8,0.2,1)），两边节奏一致才叫「一同」，各走各的就会分家。
    sunk   —— 打开「我的」时用。向下沉出屏幕：记录页仍留在原地，底栏横滑会露出空白边，
              下沉才是「托着卡片上来」的物理。

  王冠图标就绪态：配好密钥后点亮成金色（--color-crown-lit），配之前跟另一个一样灰。
-->
<template>
  <div class="bottom-nav" :aria-hidden="pushed || sunk ? 'true' : 'false'">
    <nav class="nav-dock" :class="{ 'is-pushed': pushed, 'is-sunk': sunk }" role="tablist" aria-label="主导航">
      <span class="nav-pill" :style="{ '--pill-i': activeIndex }" aria-hidden="true"></span>
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="nav-item"
        :class="{ active: modelValue === item.id }"
        role="tab"
        :aria-selected="modelValue === item.id ? 'true' : 'false'"
        @click="$emit('update:modelValue', item.id)"
      >
        <AppIcon
          :name="item.icon"
          :size="20"
          class="nav-icon"
          :class="{ 'is-crown': item.id === 'crown', 'is-ready': item.id === 'crown' && crownReady }"
        />
        <!-- 文字只留给屏读器与测试：视觉上是纯图标圆 -->
        <span class="nav-text">{{ item.text }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NAV_ITEMS } from '../../constants/categories'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  modelValue: { type: String, default: 'record' },
  pushed:     { type: Boolean, default: false },  // 切王冠：与记录页一同左滑出
  sunk:       { type: Boolean, default: false },  // 「我的」打开：下沉出屏
  crownReady: { type: Boolean, default: false }   // 已配密钥 → 王冠图标点亮
})
defineEmits(['update:modelValue'])

const navItems = NAV_ITEMS

/** 滑动指示器要去的格位（0 起）。找不到就回 0，不至于把药丸甩出胶囊外 */
const activeIndex = computed(() => {
  const i = navItems.findIndex((item) => item.id === props.modelValue)
  return i < 0 ? 0 : i
})
</script>

<style scoped>
/* 占位层：高度等于「浮岛 + 它离屏幕底边的距离」，保证列表最后一条能滚到浮岛上方。
   这里一旦画了东西，浮岛就又变回一条贴底横栏。 */
.bottom-nav {
  flex: 0 0 auto;
  height: calc(var(--nav-height) + var(--safe-bottom));
  pointer-events: none;
}

/* 浮岛。两个位移量走 CSS 变量叠加，因为 transform 里已经有一个 translateX(-50%) 居中，
   直接再写一个 translateX 会互相覆盖。 */
.nav-dock {
  --dock-x: 0px;
  --dock-y: 0px;
  position: fixed;
  left: 50%;
  bottom: calc(14px + var(--safe-bottom));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.65),
    0 0 0 0.5px rgba(0, 0, 0, 0.06),
    0 10px 28px rgba(0, 0, 0, 0.12);
  transform: translate(calc(-50% + var(--dock-x)), var(--dock-y));
  transition: transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: auto;
}
/* 与 .page-stack 的推屏同一曲线、同一时长（改一处必须改另一处，否则两边会分家） */
.nav-dock.is-pushed { --dock-x: -140vw; }
.nav-dock.is-sunk   { --dock-y: calc(100% + 40px); }

/* 滑动指示器：一块实心圆，靠 translateX 在格位间移动，比「每项自己变底色」多一次位移信息 ——
   用户能看见"我选了另一个"，而不只是"这个亮了那个灭了"。 */
.nav-pill {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background-color: var(--color-text-primary);
  transform: translateX(calc(var(--pill-i, 0) * 54px));  /* 54 = 46 图标位 + 8 间距 */
  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}

.nav-item {
  position: relative;
  z-index: 1;
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  border-radius: 50%;
  color: var(--color-text-muted);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color 0.22s var(--ease-out), transform 0.16s var(--ease-out);
}
.nav-item:active { transform: scale(0.94); }
.nav-item.active { color: var(--color-text-on-accent); }

/* 王冠就绪：配好密钥后点亮。未激活时金、激活时白（激活块是深色，金色压不住）。 */
.nav-item .nav-icon.is-crown.is-ready { color: var(--color-crown-lit); }
.nav-item.active .nav-icon { color: var(--color-text-on-accent); }

/* 视觉上是纯图标，文字仍留在可访问性树里（屏读器要读得出这是「记录 / 王冠」） */
.nav-text {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
