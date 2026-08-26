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
      <div v-if="open" class="sheet-mask" @click="emit('close')"></div>
    </transition>
    <!-- 面板（支持下滑关闭，模块2 手势规范） -->
    <transition name="sheet-rise">
      <div v-if="open" ref="sheetRef" class="memory-sheet" role="dialog" aria-modal="true" aria-label="王冠记住的事">
        <div
          class="sheet-handle"
          aria-hidden="true"
          @touchstart="onGrabStart"
          @touchmove="onGrabMove"
          @touchend="onGrabEnd"
        ></div>
        <div
          class="sheet-header"
          @touchstart="onGrabStart"
          @touchmove="onGrabMove"
          @touchend="onGrabEnd"
        >
          <span class="sheet-title">王冠记住的事</span>
          <button class="sheet-close" aria-label="关闭" @click="emit('close')">
            <AppIcon name="close" :size="20" />
          </button>
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
import { computed, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'

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

// 下滑关闭手势（模块2：抽屉必须支持下滑关闭，不能只靠 X）
const sheetRef = ref(null)
let grabStartY = 0
let grabDy = 0
let grabbing = false

function onGrabStart(e) {
  if (e.touches?.length === 1) {
    grabStartY = e.touches[0].clientY
    grabDy = 0
    grabbing = true
  }
}
function onGrabMove(e) {
  if (!grabbing) return
  const dy = e.touches[0].clientY - grabStartY
  if (dy > 0) {
    grabDy = dy
    if (sheetRef.value) {
      sheetRef.value.style.transform = `translateY(${Math.min(dy, 200)}px)`
    }
  }
}
function onGrabEnd() {
  if (!grabbing) return
  grabbing = false
  if (sheetRef.value) sheetRef.value.style.transform = ''
  if (grabDy > 72) {
    emit('close')
  }
  grabDy = 0
}
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
  border-radius: 20px 20px 0 0;
  box-shadow: var(--shadow-modal);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  /* 常态 transition：下滑手势回弹用（入场由 enter-active 覆盖） */
  transition: transform 0.25s ease-out;
}

.sheet-handle {
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-text-muted);
  opacity: 0.3;
  margin: 8px auto 0;
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
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.sheet-close {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--color-bg-input);
  color: var(--color-text-secondary);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s ease-out, opacity 0.2s ease;
}
.sheet-close:active { transform: scale(0.92); }

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
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.sheet-empty-body {
  margin: 0;
  font-size: 13px;
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
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.15s ease-out, opacity 0.2s ease;
}
.sheet-empty-cta:active { transform: scale(0.96); }

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
  border-radius: 16px;
  min-height: 44px;
}

.type-tag {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
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
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-primary);
  word-break: break-word;
}

.memory-time {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* 动画：只操作 transform + opacity */
.mask-fade-enter-active,
.mask-fade-leave-active { transition: opacity 0.2s ease; }
.mask-fade-enter-from,
.mask-fade-leave-to { opacity: 0; }

.sheet-rise-enter-active,
.sheet-rise-leave-active { transition: transform 0.3s ease-out, opacity 0.25s ease; }
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
