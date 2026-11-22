<!--
  底部导航栏积木（2026-11-21 浮岛 + 纯图标 + 滑动指示器）
  通过 v-model 绑定当前激活 Tab；图标使用 AppIcon 组件渲染 SVG。

  · .bottom-nav  只做**占位**（撑出高度，内容区不被浮岛盖住），不画任何东西
  · .nav-dock    真正的浮岛，position: fixed，不吃布局

  两种离场，别混：
    sunk   —— 打开「我的」或**键盘弹起**时用。向下沉出屏幕：记录页仍留在原地，底栏横滑会露出空白边，
              下沉才是「托着卡片上来」的物理。节奏保持 0.36s 不变。
    （2026-11-23 删掉 pushed：王冠页的底栏改成**常驻**了 —— 切王冠时整屏都在动，
      按 HIG · Motion 该留一个不动的参照；而且常驻的底栏顺手把"回记录"的入口也给了，
      王冠页左上角那个返回键因此删掉。见 App.vue 的注释。）

  王冠图标就绪态：配好密钥后点亮成金色（--color-crown-lit），配之前跟另一个一样灰。
  层位：z-index 40 —— 高于王冠页（.chat-container 是 2），低于记忆抽屉（90/91）与入场动画（100）。
        必须给在这层包装元素上：它是 position: fixed、自成堆叠上下文，只给 .nav-dock 提 z-index
        是没用的（实测会被聊天页整片盖住）。
-->
<template>
  <div class="bottom-nav" :aria-hidden="sunk ? 'true' : 'false'">
    <nav class="nav-dock" :class="{ 'is-sunk': sunk }" role="tablist" aria-label="主导航">
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
  sunk:       { type: Boolean, default: false },  // 「我的」打开 / 键盘弹起：下沉出屏
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
/* 占位层：**不再撑高度**（2026-11-22 去掉白带）。
   以前它是 flex 里的一个 75px + 安全区高的空块，露出的就是 app-container 的浅底色 ——
   那条"导航栏后面的白带"就是它。现在改成贴着屏幕底的零高覆盖层：
   不吃布局（main-content 直接长到屏幕底，内容可以滚到浮岛底下），
   也不画东西（浮岛自己 fixed 在它里面）。
   留这个 div 是因为它身上挂着 aria-hidden 与 sunk 的语义，拆掉会把无障碍状态散到浮岛上。 */
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0;
  pointer-events: none;
  /* 层位：40 —— 高于王冠页（.chat-container 是 2），低于记忆抽屉（90/91）与入场动画（100）。
     必须写在这层包装上：它是 fixed、自成堆叠上下文，只给 .nav-dock 提 z-index 无效
     （2026-11-23 实测：浮岛会被聊天页整片盖住，elementFromPoint 命中的是 chat-container）。 */
  z-index: 40;
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
  background: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow:
    var(--glass-highlight),
    var(--glass-edge),
    0 10px 28px rgba(0, 0, 0, 0.12);
  /* 与 .page-stack 同一条曲线；opacity 更短，让它先退一步 ——
     两个同时走完，交叉期间会看见浮岛压在聊天界面上。 */
  transform: translate(calc(-50% + var(--dock-x)), var(--dock-y));
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity   0.18s ease-out;
  pointer-events: auto;
}
/* sunk（开「我的」/ 键盘弹起）：**下沉出屏**。记录页仍在原地，
   横滑会露出空白边，下沉才是"托着卡片上来"的物理；键盘场景则必须彻底让位，
   否则 fixed 的浮岛会跟着视口被顶到输入栏上面去。 */
.nav-dock.is-sunk   {
  --dock-y: calc(100% + 40px);
  /* 打开「我的」的节奏保持原样，别被上面的改动带快 */
  transition: transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity   0.18s ease-out;
}

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
  /* 组件局部变量的默认值：真值由模板 :style 内联覆盖（activeIndex）。
     在这里定义是为了让「有没有定义」可查 —— 只在 var() 里写 fallback，
     首次渲染前那一帧会算出一个没人声明的值。 */
  --pill-i: 0;
  transform: translateX(calc(var(--pill-i) * 54px));  /* 54 = 46 图标位 + 8 间距 */
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
