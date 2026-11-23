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
   内容在顶端化开由 App.vue 的 .primary-sheet 蒙版负责，这里不画。 */
.header {
  height: var(--header-height);
  display: flex; align-items: center; gap: 6px; padding: 0 12px;
  /* 切页时由父级加 .is-offstage 让它淡出，不抽高度 —— 抽高度等于给 Layout 属性做动画 */
  transition: opacity 0.18s ease-out;
}

/* 两颗图标按钮：视觉 38、热区 44。展开时让位（宽 0 + 淡出 + 微缩）。 */
.hbtn {
  flex: 0 0 auto;
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  background-color: transparent;
  color: var(--color-text-secondary);
  border: none; border-radius: var(--radius-md);
  cursor: pointer; padding: 0;
  transition: background-color 0.16s ease, transform 0.16s ease,
              width 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity 0.18s ease-out;
  -webkit-tap-highlight-color: transparent;
}
.hbtn:active { background-color: var(--color-bg-input); transform: scale(0.96); }
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
  transition: max-width 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity 0.18s ease-out;
}
.header.is-searching .search-slot { max-width: 100%; opacity: 1; }

.search-box { position: relative; display: flex; align-items: center; }
.s-ic {
  position: absolute; left: 11px;
  color: var(--color-text-muted); pointer-events: none;
}
/* 框本体：玻璃胶囊，与底栏同一套令牌。圆角用半高 —— 一颗 38 高的输入框配导航那种胶囊才对；
   这里比浮岛薄一档（浮岛要"浮起来 10px+28px"，输入框用那个动像贴了张纸）。 */
.search-box input {
  width: 100%; height: 38px;
  border: none;
  background-color: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-highlight), var(--glass-edge), 0 4px 14px rgba(0, 0, 0, 0.05);
  border-radius: 19px;
  padding: 0 42px 0 34px;   /* 右 42 给 X 让位，左 34 给放大镜让位 */
  font-size: var(--text-15); color: var(--color-text-primary);
  -webkit-appearance: none; appearance: none;
  outline: none;
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
  transition: transform 0.16s ease;
  -webkit-tap-highlight-color: transparent;
}
.clear-btn:active { transform: scale(0.92); }
</style>
