<!--
  记忆查看面板 — 王冠记住的事（只读）
  底部滑出 sheet，展示白名单四类记忆骨架
  数据源：useMemory().memories（只读展示；删除/编辑后置迭代）
  规范：CSS Variables / 动画仅 transform+opacity / 触控 ≥44px / prefers-reduced-motion 降级
-->
<template>
  <Teleport to="body">
    <!-- 遮罩 -->
    <transition name="mask-fade">
      <div v-if="open" class="sheet-mask" :style="maskStyle" @click="requestClose"></div>
    </transition>
    <!-- 面板（支持下滑关闭，模块2 手势规范） -->
    <transition name="sheet-rise">
      <div v-if="open" class="memory-sheet" :style="dragStyle" role="dialog" aria-modal="true" aria-label="王冠记住的事">
        <!-- 横杠：整条 32px 高都能按住拖（视觉上只有 5px），尺寸与「我的」卡片一致；
             不再留 X —— 出口只有下拉和点遮罩两条 -->
        <div
          class="grabber-zone"
          aria-label="下拉关闭"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        >
          <span class="sheet-handle" aria-hidden="true"></span>
        </div>
        <div class="sheet-header">
          <span class="sheet-title">王冠记住的事</span>
        </div>
        <div class="sheet-body">
          <div v-if="!sorted.length" class="sheet-empty">
            <div class="sheet-empty-ico" aria-hidden="true"><AppIcon name="crown" :size="36" /></div>
            <p class="sheet-empty-title">王冠还没记住什么</p>
            <p class="sheet-empty-body">跟它聊聊你的生活，它会开始记得你</p>
            <button class="sheet-empty-cta" @click="emit('close')">去和王冠聊聊</button>
          </div>
          <ul v-else class="memory-list">
            <li v-for="m in sorted" :key="m.id" class="memory-item">
              <span class="type-tag" :class="`type-${m.type}`">{{ typeLabel[m.type] || m.type }}</span>
              <div class="memory-main">
                <p class="memory-content">{{ m.content }}</p>
                <span class="memory-time">{{ relativeTime(m.last_mentioned_at) }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { computed, watch } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { useSheetDrag } from '../../composables/useSheetDrag'

const props = defineProps({
  open: { type: Boolean, default: false },
  memories: { type: Array, default: () => [] }
})
const emit = defineEmits(['close'])

const typeLabel = { fact: '事实', goal: '目标', event: '事件', preference: '偏好' }

// 按最近提及倒序
const sorted = computed(() =>
  [...props.memories].sort((a, b) => new Date(b.last_mentioned_at) - new Date(a.last_mentioned_at))
)

function relativeTime(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days < 1) return '最近提到'
  if (days === 1) return '昨天提过'
  return `${days}天前提过`
}

// 下滑关闭手势：与「我的」卡片共用同一个积木（pointer 事件，鼠标也能拉；
// 之前在 touch 事件上写，电脑上按住横杠纹丝不动）
const {
  dragging, closing, progress,
  style: dragStyle,
  onDown, onMove, onUp,
  close: requestClose,
  reset: resetDrag
} = useSheetDrag({ onClose: () => emit('close') })

// 这个组件是**常驻**的（父级用 :open 控制，不用 v-if），所以手势状态会跨开关存活。
// 每次重新打开必须先复位：否则上一次关闭留下的 closing=true 会让卡片一开始就停在
// translateY(100%)（屏幕外），而遮罩照常出现 —— 用户看到的就是「屏幕变灰、卡片不出来」。
watch(() => props.open, (v) => { if (v) resetDrag() })

/** 遮罩随下拉变淡（与「我的」卡片一致）：卡片滑走了底下还压着一层黑，层级就乱了 */
const maskStyle = computed(() => {
  if (dragging.value) return { backgroundColor: `rgba(0, 0, 0, ${0.35 * (1 - progress.value)})` }
  if (closing.value) return { backgroundColor: 'rgba(0, 0, 0, 0)' }
  return {}
})
</script>

<style scoped>
/* 局部 pastel token：四类记忆的柔和区分色（calm pastels，非高饱和） */
.memory-sheet {
  --tag-fact-bg: #e3f2fd;
  --tag-fact-text: #2f6497;
  --tag-goal-bg: #e6f4ea;
  --tag-goal-text: #3b7a57;
  --tag-event-bg: #fdf1e3;
  --tag-event-text: #9c6843;
  --tag-pref-bg: #f1ecf9;
  --tag-pref-text: #6d4a9e;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.35);
  /* 下拉时遮罩跟着变淡需要过渡（拖拽中 dragging 态会让它每帧改色） */
  transition: background-color 0.2s ease;
}

.memory-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 91;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-card);
  border-radius: var(--radius-4xl) var(--radius-4xl) 0 0;
  box-shadow: var(--shadow-modal);
  /* 统一走 --safe-bottom 令牌：底栏是 calc(18px + var(--safe-bottom))、聊天输入栏是 calc(8px + ...)，
     只有这里直接写 env()。值等价（令牌本身就是 env(...,0px)），但三处写法归一后才好一起改。 */
  padding-bottom: var(--safe-bottom);
  /* 常态 transition：下滑手势回弹用（入场由 enter-active 覆盖） */
  transition: transform var(--pop-dur) var(--spring-pop);
}

/* 与「我的」卡片一字不差：40×5、两端半圆、同一灰度。
   touch-action: none 是必须的 —— 否则浏览器把竖直拖动当滚动接管，手势收不到。 */
.grabber-zone {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  height: 32px;
  cursor: grab;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.grabber-zone:active { cursor: grabbing; }
.sheet-handle {
  width: 40px; height: 5px;
  border-radius: 999px;
  background: rgba(60, 60, 67, 0.28);
  flex-shrink: 0;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
  flex-shrink: 0;
}

.sheet-title {
  font-size: var(--text-17);
  font-weight: 600;
  color: var(--color-text-primary);
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 16px;
  -webkit-overflow-scrolling: touch;
}

.sheet-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 16px 32px;
  text-align: center;
}
.sheet-empty-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px; height: 72px;
  border-radius: 50%;
  background: var(--color-bg-input);
  color: var(--color-text-muted);
  margin-bottom: 10px;
}
.sheet-empty-title {
  margin: 0;
  font-size: var(--text-16);
  font-weight: 600;
  color: var(--color-text-primary);
}
.sheet-empty-body {
  margin: 0;
  font-size: var(--text-13);
  line-height: 1.6;
  color: var(--color-text-muted);
}
.sheet-empty-cta {
  margin-top: 12px;
  min-height: 44px;
  padding: 0 22px;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  font-size: var(--text-13);
  font-weight: 500;
  cursor: pointer;
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transition: transform var(--press-now-dur) var(--press-now-ease),
              opacity 0.2s ease;
}
.sheet-empty-cta:active {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: scale(var(--press-scale));
}

.memory-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--color-bg-primary);
  border-radius: var(--radius-3xl);
  min-height: 44px;
}

.type-tag {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: var(--text-12);
  font-weight: 500;
  margin-top: 1px;
}
.type-fact   { background: var(--tag-fact-bg);   color: var(--tag-fact-text); }
.type-goal   { background: var(--tag-goal-bg);   color: var(--tag-goal-text); }
.type-event  { background: var(--tag-event-bg);  color: var(--tag-event-text); }
.type-preference { background: var(--tag-pref-bg); color: var(--tag-pref-text); }

.memory-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.memory-content {
  margin: 0;
  font-size: var(--text-14);
  line-height: 1.5;
  color: var(--color-text-primary);
  word-break: break-word;
}

.memory-time {
  font-size: var(--text-12);
  color: var(--color-text-muted);
}

/* 动画：只操作 transform + opacity */
.mask-fade-enter-active,
.mask-fade-leave-active { transition: opacity 0.2s ease; }
.mask-fade-enter-from,
.mask-fade-leave-to { opacity: 0; }

.sheet-rise-enter-active,
.sheet-rise-leave-active { transition: transform var(--slide-dur) var(--spring-pop), opacity 0.25s ease; }
.sheet-rise-enter-from,
.sheet-rise-leave-to { transform: translateY(100%); opacity: 0.5; }
/* 模块3：离场动画必须比入场快（150~200ms），不占用户操作时间 */
.sheet-rise-leave-active { transition: transform 0.2s ease-in, opacity 0.15s ease; }

/* 无障碍：用户偏好减少动效时关闭动画 */
@media (prefers-reduced-motion: reduce) {
  .mask-fade-enter-active,
  .mask-fade-leave-active,
  .sheet-rise-enter-active,
  .sheet-rise-leave-active { transition: none; }
  .sheet-rise-enter-from,
  .sheet-rise-leave-to { transform: none; opacity: 1; }
}
</style>
