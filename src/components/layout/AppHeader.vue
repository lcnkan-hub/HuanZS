<!--
  顶部栏积木（2026-11-23 改：只剩两颗图标 + 搜索按需展开）
  左边是「我的」人像按钮（只剩图标，不再带"我的"两个字），右边是搜索按钮，中间空着。
  点搜索 → 「我的」向左让位（宽 0 + 淡出），搜索位从宽度 0 长到满行：
  放大镜在框内左端、X 独立圆钮在右端。点 X（空框）或点搜索框以外任何地方 → 收起并清空。

  为什么不再常驻搜索框（2026-11-23 用户要求）：
    常驻等于"这一页随时在等你搜"，把「读记录」这个主动作压成次要。
    按需展开是渐进披露（HIG · Layout 规则 4）：界面上一次只承诺一件事。

  为什么让位用「收宽度」而不是「往左移」：
    位移会在整行里晃，收宽度读起来是"被抽走"；而且位移那一帧图标会压到框上。

  Props: modelValue(搜索词 v-model)
  Emits: update:modelValue, mine(点「我的」)
-->
<template>
  <div class="header" :class="{ 'is-searching': open }">
    <!-- 顶部玻璃场（2026-11-24 · 与参考文件的 .ambient 同一份实现，样式在 variables.css）：
         三层不同半径的模糊叠在 56px 带子里，内容滚到顶时是被"化开"而不是被一条硬边切掉。
         z-index:-1：父级 .header 是 absolute + z-index:20，自成堆叠上下文，
         负层正好压在页面内容之上、两颗按钮之下。 -->
    <div class="ambient" aria-hidden="true">
      <i class="layer wide"></i>
      <i class="layer mid"></i>
      <i class="layer core"></i>
    </div>
    <button
      class="hbtn"
      type="button"
      aria-label="我的"
      :tabindex="open ? -1 : 0"
      @click="$emit('mine')"
    >
      <AppIcon name="mine" :size="20" />
    </button>

    <div class="search-slot">
      <div class="search-box">
        <AppIcon name="search" :size="16" class="s-ic" />
        <input
          ref="inputEl"
          type="text"
          :value="modelValue"
          placeholder="搜索记录…"
          aria-label="搜索记录"
          @input="$emit('update:modelValue', $event.target.value)"
        />
        <button class="clear-btn" type="button" aria-label="清除或收起" @click.stop="onClear">
          <AppIcon name="close" :size="14" />
        </button>
      </div>
    </div>

    <button
      class="hbtn"
      type="button"
      aria-label="搜索"
      :aria-expanded="open ? 'true' : 'false'"
      :tabindex="open ? -1 : 0"
      @click="openSearch"
    >
      <AppIcon name="search" :size="20" />
    </button>
  </div>
</template>

<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'mine'])

const open = ref(false)
const inputEl = ref(null)

async function openSearch() {
  open.value = true
  document.addEventListener('pointerdown', onDocPointerDown, true)
  await nextTick()
  inputEl.value && inputEl.value.focus()
}

/** 收起：框退回、文字一起清掉（用户 11-23 明确：点外部收起时字也清，不留空框） */
function closeSearch() {
  if (!open.value) return
  open.value = false
  emit('update:modelValue', '')
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  inputEl.value && inputEl.value.blur()
}

/**
 * X 有两个意思：有字就清字，没字就收起（同 iOS 相册 / 备忘录）。
 * 「清了还留着空框」在这里没有意义 —— 空框唯一的下一步就是关掉。
 */
function onClear() {
  if (props.modelValue) {
    emit('update:modelValue', '')
    inputEl.value && inputEl.value.focus()
    return
  }
  closeSearch()
}

/** 点搜索框以外任何地方 → 收起 + 清空。键盘不是 DOM，用户点页面即触发，与原生一致 */
function onDocPointerDown(e) {
  const t = e.target
  if (t && t.closest && t.closest('.search-slot')) return
  closeSearch()
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})
</script>

<style scoped>
/* 顶部栏：透明底、无线无块（2026-11-22 C2 的口径不变）。
   2026-11-23 起它是**浮层**（absolute），内容会从两颗键后面滚过去；
   顶部不再有任何渐变蒙版 —— .primary-sheet 那条 mask 已按用户要求删除。 */
.header {
  /* 2026-11-23：从「占位横带」改成浮层（用户要求：顶栏那 55px 像一块空盖板压在列表上）。
     不再占布局高度 —— 列表从屏幕顶开始滚，卡片会从两颗按钮**后面**穿过去。
     内容不被按钮压住，靠 App.vue 里 .sheet-body 的 padding-top 让位。
     pointer-events:none：空白区不吃点击也不挡滚动，只有两颗键自己是热区。 */
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 20;
  height: var(--header-height);
  display: flex; align-items: center; gap: 6px; padding: 0 12px;
  pointer-events: none;
  /* 切页时由父级加 .is-offstage 让它淡出，不抽高度 —— 抽高度等于给 Layout 属性做动画 */
  transition: opacity 0.18s ease-out;
}
.header .hbtn,
.header .search-slot { pointer-events: auto; }

/* 顶部玻璃场（2026-11-24 · 按 huanzhongshu_glass_homepage_full.html）
   实现是共享的（variables.css 的 .ambient / .layer），这里只负责把它按在顶栏这一层：
   独立一层、不画在按钮背景上 —— 渐变压在 44px 圆钮上会连玻璃一起染白，
   读起来是"按钮蒙了层雾"，而不是"内容从雾里穿过"。
   高度是 --fade-size（56），与列表顶部的 --sheet-top-gap 是配套的（见 variables.css）。 */
.header > .ambient {
  top: 0;
  z-index: -1;
}

/* 两颗图标按钮：圆形玻璃底（44×44，视觉即热区）。参考图二那种按键 ——
   有底、有厚度，不是裸图标；透明感来自 --glass-fill 的 .66 alpha + blur(28)。 */
.hbtn {
  flex: 0 0 auto;
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  background-color: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-highlight), var(--glass-edge), 0 2px 8px rgba(0, 0, 0, 0.06);
  color: var(--color-text-primary);
  border: none; border-radius: 50%;
  cursor: pointer; padding: 0;
  /* 按下/松手两段弹簧：时长与曲线在 :active 里换值，见 styles/motion.css */
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transition: transform var(--press-now-dur) var(--press-now-ease),
              background-color 0.16s ease,
              width 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity 0.18s ease-out;
  -webkit-tap-highlight-color: transparent;
}
/* 搜索键靠右：搜索位收起时宽 0 不占位，得靠这条把它顶到最右边 */
.hbtn:last-child { margin-left: auto; }
/* 按下：整体缩一点 + 高光消失、改成内阴影 —— 读起来是「被按进去了」，
   而不是「变小了」。只缩不变光是按钮，不是有厚度的键（2026-11-23）。 */
.hbtn:active {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: scale(var(--press-scale-sm));
  box-shadow:
    var(--glass-edge),
    inset 0 2px 7px rgba(0, 0, 0, 0.10),
    0 1px 3px rgba(0, 0, 0, 0.05);
}
.header.is-searching .hbtn {
  width: 0; opacity: 0; pointer-events: none; transform: scale(0.9);
}

/* 搜索位：收起时宽度 0（max-width 能过渡，flex-basis 到 auto 不能），展开长满整行 ——
   这就是"搜索按钮向左拉伸成一颗框"的那一段。 */
.search-slot {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-width var(--slide-dur) var(--spring-glide),
              opacity 0.18s ease-out;
}
.header.is-searching .search-slot { max-width: 100%; opacity: 1; }

.search-box { position: relative; display: flex; align-items: center; }
/* 放大镜：absolute 只给了 left，**没给 top** —— 在 flex 容器里 absolute 元素的
   纵向位置走 static position，会算到容器顶部，图标整个被 .search-slot 的 overflow:hidden 裁掉。
   这是它在深色底上"消失"的真正原因（不是颜色、也不是被 input 盖住）。 */
.s-ic {
  position: absolute; left: 11px; top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted); pointer-events: none;
  /* 必须抬一层：它在 DOM 里排在 <input> 前面，而 input 有背景色（+ 曾经还有 backdrop-filter 合成层），
     同级 absolute/static 按 DOM 顺序绘制 → 图标被输入框整个盖住。
     这才是「放大镜不显示」的真正原因，跟颜色无关。 */
  z-index: 1;
}
/* 框本体：**不再是玻璃**（2026-11-23 去掉了 backdrop-filter，原因见下）。
   现在是一个半透明胶囊 + 一条顶光 + 一道外投影，比浮岛薄一档 ——
   输入框是"纸"，浮岛是"玻璃"，两者不该同一种厚度。 */
.search-box input {
  width: 100%; height: 38px;
  border: none;
  background-color: var(--glass-fill);
  /* 2026-11-23：把 backdrop-filter 去掉了（用户报「两端有割裂」）。
     实测原因：模糊在胶囊两端圆角处会采样到背后的网格线，在那儿画出一道竖亮边。
     搜索框背后就是纯底色 + 网格，根本没有"要糊的内容" —— 去掉既没有损失，
     还省掉一整层合成开销（输入框是全宽元素，采样成本比两颗小钮高得多）。 */
  /* 阴影只有两条（2026-11-23）：原来堆的是浮岛那套四层 inset（顶光 + 底光 + 描边 + 内暗边），
     那套是给 58px 高的浮岛做的；38px 的胶囊上，顶光和底光会在两端圆角处交汇成一道竖亮线，
     左右看着像"接缝"。这里只留顶光 + 一道外投影。 */
  /* 描边而不是顶光（2026-11-24 用户报「搜索框周围还有残留」）：
     `inset 0 1px 0` 只盖顶部一条，这条 1px 走到 999px 胶囊的两端时，
     会沿圆角铺成一道加粗的竖向弧 —— 暗底上看着就像框外面还套了一层轮廓。
     改成整周均匀的 1px 描边，圆角处厚度恒定，那圈「残留」就没了。 */
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.50),
    0 2px 10px rgba(0, 0, 0, 0.05);
  /* 999px 而不是 19px：19 是"刚好半高"，两端圆角与直边的接点在像素网格上容易差半像素；
     999px 让浏览器按"胶囊"统一计算，接缝就没有了。 */
  border-radius: 999px;
  padding: 0 42px 0 34px;   /* 右 42 给 X 让位，左 34 给放大镜让位 */
  font-size: var(--text-15); color: var(--color-text-primary);
  -webkit-appearance: none; appearance: none;
  outline: none;
  /* 聚焦时要换阴影，没这条就会硬切一下 */
  transition: box-shadow 0.2s ease-out;
}
/* 深色底：顶光弱一档（白底上是"反光"，深底上是"发光"，同一个数值读起来不一样），
   外投影加重 —— 深色背景上不加重，框就浮不起来。 */
.header.theme-deep .search-box input {
  /* 夜里**不要描边**（2026-11-24 用户：「残留的是不是多余的层板，是就删」）。
     暗底上一圈白线不管多淡，都会把胶囊读成"两个套着的形状"；
     系统搜索栏本来也只有一层半透明填充，边界靠明度差和投影，不靠线。
     白天那条留着 —— 浅底上白线是它唯一的存在感，删了框就散。 */
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
}
/* 聚焦：外面多一圈很淡的酒红光 —— 唯一能说明「现在打字会进这里」的线索。
   跟着主题主色走（DSH 那套酒红丝绒），不另起一套蓝。 */
.search-box input:focus {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.50),
    0 0 0 3px rgba(126, 35, 64, 0.16),
    0 2px 10px rgba(0, 0, 0, 0.05);
}
.header.theme-deep .search-box input:focus {
  /* 聚焦时也只留那圈酒红光，不把描边加回来 */
  box-shadow:
    0 0 0 3px rgba(214, 96, 128, 0.38),
    0 4px 14px rgba(0, 0, 0, 0.28);
}
.search-box input::placeholder { color: var(--color-text-muted); }

/* X：框内右端的独立圆钮（用户 11-23：单独的 X 按钮） */
.clear-btn {
  position: absolute; right: 5px;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background-color: var(--color-bg-input);
  color: var(--color-text-secondary);
  cursor: pointer; padding: 0;
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transition: transform var(--press-now-dur) var(--press-now-ease);
  -webkit-tap-highlight-color: transparent;
}
.clear-btn:active {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: scale(var(--press-scale-sm));
}

/* 没有 backdrop-filter 的环境（老 WebView / 关掉硬件加速 / 部分桌面 Linux）：
   玻璃退化成半实底。宁可厚一点，也不能让图标浮在滚动的正文上读不清 ——
   HIG · Materials 要求材质缺位时保底可读，而不是留一层透明壳。 */
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .hbtn { background-color: rgba(255, 252, 252, 0.94); }
}
</style>
