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
    <!-- 底部玻璃场（2026-11-24 · 与参考文件的 .ambient 同一份实现，样式在 variables.css）
         和顶栏那一条是同一种材质，整体 .is-up 翻过来 —— 渐隐方向对调，遮罩一个数都不用改。
         王冠页不显示（那一页有自己的输入浮岛与夜板），靠 is-hidden 淡出而不是 v-if 拆掉，
         免得切页那一刻"啪"地消失。 -->
    <div
      class="ambient is-up"
      :class="{ 'is-hidden': modelValue === 'crown', 'is-sunk': sunk }"
      aria-hidden="true"
    >
      <i class="layer wide"></i>
      <i class="layer mid"></i>
      <i class="layer core"></i>
    </div>
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

/* 底部的「化开」只由这一层的玻璃场负责（.ambient.is-up，实现见 variables.css）。历史：
   2026-11-23 删过一整条渐变带（读起来是"一条横带"）；2026-11-24 换成三层模糊；
   同一天还把 useCardFade（按卡写内联 opacity 的淡出）整组删掉 ——
   底部不再有"卡片自己变淡"这套并行机制，也不会再有 16px 的错位死区。 */

/* 底部玻璃场（2026-11-24 · 按 huanzhongshu_glass_homepage_full.html）
   实现是共享的（variables.css 的 .ambient / .layer），这里只管位置与层位：
     · absolute + bottom:0 —— 父级 .bottom-nav 是 fixed、height:0 的壳，
       所以场从**屏幕底**往上长，连手势条那块安全区一起盖住。
     · .is-up —— 整条翻过来，遮罩方向对着内容（顶部那种是"越靠上越糊"）。
     · z-index:-1 —— 父级已有 z-index:40 自成上下文，负层正好压在内容之上、浮岛之下。
   两种隐去：切王冠（is-hidden）/ 浮岛下沉（is-sunk = 开「我的」或键盘弹起）。
   浮岛走了场还留着，屏幕上就是一条没有主人的横带。 */
.bottom-nav > .ambient {
  bottom: 0;
  z-index: -1;
  transition: opacity 0.18s ease-out;
}
.bottom-nav > .ambient.is-hidden,
.bottom-nav > .ambient.is-sunk { opacity: 0; }

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
  transition: transform var(--slide-dur) var(--spring-glide),
              opacity   0.18s ease-out;
  pointer-events: auto;
}
/* sunk（开「我的」/ 键盘弹起）：**下沉出屏**。记录页仍在原地，
   横滑会露出空白边，下沉才是"托着卡片上来"的物理；键盘场景则必须彻底让位，
   否则 fixed 的浮岛会跟着视口被顶到输入栏上面去。 */
.nav-dock.is-sunk   {
  --dock-y: calc(100% + 40px);
  /* 打开「我的」的节奏保持原样，别被上面的改动带快 */
  transition: transform var(--slide-dur) var(--spring-glide),
              opacity   0.18s ease-out;
}

/* 滑动指示器：一块实心圆，靠 translateX 在格位间移动，比「每项自己变底色」多一次位移信息 ——
   用户能看见"我选了另一个"，而不只是"这个亮了那个灭了"。
   2026-11-23 两处升级：
     ① 曲线换成 --ease-pop（带回弹）。直线插值的药丸只是"移动"，过冲一点才像有质量的液体。
        时长 0.38 是配合回弹的：太快看不出过冲，太慢会拖住下一次点击。
     ② 深色块也补一道顶光（inset 0 1px 0 白 .18）。纯色圆是"贴纸"，
        有顶光才和外面的玻璃浮岛是同一套材质语言。 */
.nav-pill {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background-color: var(--color-text-primary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
  /* 组件局部变量的默认值：真值由模板 :style 内联覆盖（activeIndex）。
     在这里定义是为了让「有没有定义」可查 —— 只在 var() 里写 fallback，
     首次渲染前那一帧会算出一个没人声明的值。 */
  --pill-i: 0;
  transform: translateX(calc(var(--pill-i) * 54px));  /* 54 = 46 图标位 + 8 间距 */
  transition: transform var(--pop-dur) var(--spring-pop);
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
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transition: color 0.22s var(--ease-out),
              transform var(--press-now-dur) var(--press-now-ease);
}
.nav-item:active {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: scale(var(--press-scale));
}
.nav-item.active { color: var(--color-text-on-accent); }

/* 王冠就绪：配好密钥后点亮。未激活时金、激活时白（激活块是深色，金色压不住）。 */
.nav-item .nav-icon.is-crown.is-ready { color: var(--color-crown-lit); }
.nav-item.active .nav-icon { color: var(--color-text-on-accent); }

/* 深色作用域下的反色药丸（2026-11-23）：
   theme-deep 把 --color-text-primary 翻成了白色，药丸底跟着变白，
   而图标吃的是 --color-text-on-accent（也是白）→ 白底白字，图标直接隐形。
   这里把这一对换过来：白药丸 + 深色图标。写死颜色而不新增令牌，
   是因为它只服务于这一个反色场景，多一个令牌没人看也不会有人维护。 */
.bottom-nav.theme-deep .nav-pill { background-color: #F2E7E8; }
.bottom-nav.theme-deep .nav-item.active { color: #17100F; }
/* 图标是单独设色的（.nav-item.active .nav-icon 写的是 on-accent 白），
   所以光改父级 color 不够 —— 这条必须再点一次 .nav-icon。 */
.bottom-nav.theme-deep .nav-item.active .nav-icon { color: #17100F; }

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

/* 没有 backdrop-filter 的环境：浮岛退化成半实底。
   玻璃的前提是"背后的内容被糊掉"；糊不掉时半透明等于让卡片从图标缝里透出来，
   比一块实的更难读。HIG · Materials 的降级口径是可读优先，不是保通透。 */
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nav-dock { background: rgba(255, 252, 252, 0.94); }
}
</style>
