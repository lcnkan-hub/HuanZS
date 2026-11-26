<!--
  顶部栏积木（2026-11-26 按 search_refined.html 重做搜索交互）
  左边是「我的」人像按钮（只剩图标），右边是搜索按钮，中间空着。
  点搜索 → 搜索位从**右侧锚点向左长**（右端钉死在 12px），两颗键淡出 + 微移；
  放大镜在框内左端、X 独立圆钮在右端。点 X（空框）或点搜索框以外任何地方 → 收起并清空。

  为什么不再常驻搜索框（2026-11-23 用户要求）：
    常驻等于"这一页随时在等你搜"，把「读记录」这个主动作压成次要。
    按需展开是渐进披露（HIG · Layout 规则 4）：界面上一次只承诺一件事。

  为什么从「收按钮宽度」改成「右锚点 + 按钮淡出」（2026-11-26）：
    旧版把两颗键的 width 收到 0 —— 这一行每帧都在重排，搜索键的位置跟着跳，
    整行看起来都在动。现在按钮保留占位只淡出，搜索位绝对定位压在上面，
    展开时只有左边缘在走，是"一颗胶囊长出来"，不是"一行被挤开"。
    玻璃也从 <input> 挪到了 .search-slot：框先有形，框里的字晚 120ms 才到，
    否则展开那 390ms 里文字会跟着左边缘一路往左滑。

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
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'mine', 'search-state'])

const open = ref(false)
const inputEl = ref(null)

/** 搜索态外推（2026-11-25）：App.vue 要据此压暗内容区。状态只有一个来源，仍在这 */
watch(open, (v) => emit('search-state', v))

/**
 * 展开 + **立刻聚焦**（2026-11-26 用户定的，别改成"等动画结束再聚焦"）：
 *   手机上键盘和展开动画得同时走 —— 延迟到 390ms 之后才弹键盘，
 *   用户会觉得"点了没反应"；参考稿的 340ms 是桌面 demo，没有软键盘这条时间线。
 */
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
/* 只有两颗键自己是热区；搜索位自己管自己的 pointer-events（收起时是「透明的门」） */
.header .hbtn { pointer-events: auto; }

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
              opacity 0.18s ease-out;
  -webkit-tap-highlight-color: transparent;
}
/* 搜索键靠右：顶栏是 flex，左边「我的」+ 右边搜索键，中间空着 —— 靠这条把搜索键顶到最右 */
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
/* 【退出】两颗键只淡出 + 微移，**不收宽度**（收宽度 = 整行重排，搜索键位置会跳）：
   「我的」往左让 7px，让出正在长出来的框的起势；搜索键原地缩到 .94 —— 它马上被框盖住，
   缩放只是那一瞬间的"退后"提示。两颗键的占位一直在，所以收/展两态里没有任何布局位移。 */
.header.is-searching .hbtn {
  opacity: 0; pointer-events: none; transform: scale(0.94);
}
.header.is-searching .hbtn:not(:last-child) {
  transform: translateX(-7px) scale(0.98);
}

/* 搜索位（2026-11-26）：绝对定位、右端钉死 —— 展开时只有左边缘在走，右端一动不动。
   收起时宽 44（正好一颗圆钮）、opacity 0：整颗藏在搜索键下面，所以看不见也点不到。
   z-index 3：长出来时压在两颗键之上。玻璃在这一层（不在 input），框才是一个整体在长。
   圆角必须是 999：裁剪形状跟胶囊一致，聚焦光环才不会从四个直角缺口漏出来。 */
.search-slot {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 3;
  width: 44px;
  height: 38px;
  opacity: 0;
  pointer-events: none;     /* 收起时是透明的门：点击要落到下面那颗搜索键上 */
  overflow: hidden;
  border-radius: 999px;
  /* 材质（2026-11-26）：**跟两颗圆钮同一套令牌**，不各写一份 ——
     底色 / 模糊 / 上下两道内光 / 发丝描边 + 内暗角 / 投影，全部共用。
     以前这里是"半透明白板"（无模糊 + 1px 白线 + 一道淡投影），跟磨砂玻璃的圆钮并排放着
     像两种材料。夜间也不用单独覆盖：--glass-* 在 .theme-deep 里换一套，这里自动跟着换。
     ⚠ 模糊曾经因为"两端圆角处一道竖亮边"被摘掉（2026-11-23，那时记录页是深色网格底，
       高频直线被糊到圆角边界上）；现在底是纸面 + 两团色斑 + 半透明卡，没有直线可糊。
       真出现竖边，正确解法是把模糊挪到内层矩形、外层胶囊只做裁剪 —— 别再单独摘框的模糊。 */
  background-color: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  /* 用 --glass-vignette 而不是 --glass-edge（2026-11-26 第二轮）：
     夜里 --glass-edge 的 "0 0 0 1px 玫瑰白" 压在 44px 圆钮上只是边缘，
     铺到 366px 宽的搜索框上就变成一整圈"画上去的框" —— 用户指的就是这一圈。
     拆出 --glass-vignette 之后，厚度（内暗角）还在、外框没了；昼/夜走同一条令牌。 */
  box-shadow: var(--glass-highlight), var(--glass-vignette), 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: width var(--search-dur) var(--ease-search),
              opacity 160ms ease-out;
}
.header.is-searching .search-slot {
  width: calc(100% - 24px);
  opacity: 1;
  pointer-events: auto;
}
/* 没有单独的聚焦光环（2026-11-26 删掉）：
   那圈是 3px 外扩的酒红，以前挂在 input 上被槽裁掉、看不见；玻璃挪到槽上之后它整圈露了出来，
   跟圆钮并排就是"框外面套了一层色"。现在框的材质跟圆钮完全一致，聚焦状态由光标说明 ——
   再给框加一圈外发光，材质就又不一样了。要恢复，得用 inset（画在胶囊内侧），不能外扩。 */

/* 框内内容（放大镜 / 输入框 / X）：整组**晚 120ms 才淡入**。
   展开那 390ms 里框一直在变宽，内容若从头就在，文字会跟着左边缘一路往左滑；
   先让胶囊长出来、字后到，读起来才是"框展开了"，不是"字被推着走"。
   延迟写在 .is-searching 这条上：只有开的时候延迟，收起时立刻消失
   （transition 取的是「变化后」那一条的 transition，所以这里这样写正好反过来——
   加类时用带延迟的这条，撤类时用下面不带延迟的基础条）。 */
.search-box {
  position: relative;
  display: flex; align-items: center;
  height: 100%;
  opacity: 0;
  transition: opacity 160ms ease-out;
}
.header.is-searching .search-box {
  opacity: 1;
  transition: opacity 160ms ease-out 120ms;
}
/* 放大镜：absolute 只给了 left，**没给 top** —— 在 flex 容器里 absolute 元素的
   纵向位置走 static position，会算到容器顶部，图标整个被 .search-slot 的 overflow:hidden 裁掉。
   这是它在深色底上"消失"的真正原因（不是颜色、也不是被 input 盖住）。 */
.s-ic {
  position: absolute; left: 11px; top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted); pointer-events: none;
  /* 排在 <input> 前面，同级按 DOM 顺序绘制 —— 不抬一层就会被输入框的绘制盖住
     （2026-11-26 起输入框是透明的，这条只剩保险作用，别删） */
  z-index: 1;
}
/* 输入框本体（2026-11-26）：**透明** —— 玻璃、描边、投影都已挪到 .search-slot。
   这样宽度一变，长出来的是"整颗胶囊"，而不是"一个透明容器里有个框在拉长"。 */
.search-box input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%; height: 100%;
  border: none;
  background: transparent;
  border-radius: 999px;   /* 999 而不是半高：两端圆角交给浏览器按胶囊统一算，接缝差半像素的问题就不存在 */
  padding: 0 42px 0 34px;   /* 右 42 给 X 让位，左 34 给放大镜让位 */
  font-size: var(--text-15); color: var(--color-text-primary);
  -webkit-appearance: none; appearance: none;
  outline: none;
}
/* 夜间（2026-11-26）：不需要单独覆盖了。
   材质已经全部走 --glass-*，而 .theme-deep 里那组令牌本来就有夜间值 ——
   框和圆钮一起换，天然一致。原来那两条 .header.theme-deep 一直没命中（顶栏从没挂过这个类），
   "夜里搜索框带白描边"的毛病也随这次换材质一并消失。 */
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
  .hbtn { background-color: rgba(255, 255, 255, 0.94); }
}
</style>
