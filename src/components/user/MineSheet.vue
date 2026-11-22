<!--
  「我的」浮层积木（2026-11-21 底部卡片改版）
  位置：全屏遮罩 + 底部升起的卡片（不是右侧抽屉了）。
        卡片不占满屏：高度 88%，上面留出记录页让用户知道"这只是盖了一层，不是换页"。
  出场：从底边 translateY(100%) 升到 0，0.46s；曲线带一点点过冲（约 4px），是"落定"不是弹簧。
  离场：向下滑出，0.28s 由慢到快。
  出口（取消了返回键，两条）：
    1. 按住顶部横杠下拉 —— 跟手移动，松手超过阈值（120px 与卡片 1/3 取小）就关，否则弹回；
    2. 点卡片外的遮罩。
-->
<template>
  <div class="mine-mask" :class="{ 'is-open': open }" :style="maskStyle" @click.self="requestClose">
    <div
      class="mine-card"
      :class="{ 'is-open': open }"
      :style="dragStyle"
      role="dialog"
      aria-modal="true"
      aria-label="我的"
    >
      <!-- 只在这条区域绑定手势：卡片正文要能正常滚动，不能整张卡都能拖 -->
      <div
        class="grabber-zone"
        role="button"
        aria-label="下拉关闭"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <span class="grabber"></span>
      </div>
      <h2 class="mine-card-title">我的</h2>
      <div class="mine-card-body">
        <MinePage
          :userProfile="userProfile"
          :records="records"
          @save-profile="(data) => $emit('save-profile', data)"
          @open-item="(item) => $emit('open-item', item)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import MinePage from './MinePage.vue'
import { useSheetDrag } from '../../composables/useSheetDrag'

const props = defineProps({
  userProfile: { type: Object, default: null },
  records:     { type: Array,  default: () => [] }
})
const emit = defineEmits(['close', 'save-profile', 'open-item'])

// 首帧先渲染成"收在屏幕下沿"的状态，下一帧再打开，transition 才会真正播放
const open = ref(false)
onMounted(() => {
  // 双 rAF：确保浏览器先完成一次布局，否则 transition 会被合并掉（升起变成闪现）
  requestAnimationFrame(() => requestAnimationFrame(() => { open.value = true }))
})

// 手势与「王冠记住的事」共用同一个积木，两张卡的手感必须一致
const {
  dragging, closing, progress,
  style: dragStyle,
  onDown, onMove, onUp,
  close: requestClose
} = useSheetDrag({ onClose: () => emit('close') })

/** 遮罩随下拉变淡；关闭时一起归零，别让卡片都滑走了底下还压着一层黑 */
const maskStyle = computed(() => {
  if (dragging.value) return { backgroundColor: `rgba(0, 0, 0, ${0.4 * (1 - progress.value)})` }
  if (closing.value) return { backgroundColor: 'rgba(0, 0, 0, 0)' }
  return {}
})
</script>

<style scoped>
/* 遮罩盖住整屏（含顶栏与底栏）：底栏此时已下沉，遮罩若只盖主内容区，边缘会露出半截浮岛 */
.mine-mask {
  position: fixed; inset: 0; z-index: 20;
  background: rgba(0, 0, 0, 0);
  transition: background-color 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.mine-mask.is-open { background: rgba(0, 0, 0, 0.4); }

.mine-card {
  position: absolute; left: 0; right: 0; bottom: 0;
  height: 88%;
  display: flex; flex-direction: column;
  background: var(--color-bg-primary);
  border-radius: var(--radius-4xl) var(--radius-4xl) 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.14);
  transform: translateY(100%);
  /* 0.46s + 轻微过冲（峰值约 1.005 → 88% 高度上约 4px）：要的是"落定"，不是弹簧 */
  transition: transform 0.46s cubic-bezier(0.19, 1.02, 0.32, 1);
  will-change: transform;
  overflow: hidden;
}
.mine-card.is-open { transform: translateY(0); }

/* 横杠区域：32px 高的整条都能按住（视觉上只有 5px 的杠），
   touch-action: none 是必须的 —— 否则浏览器会把竖直拖动当成滚动接管，手势收不到 */
.grabber-zone {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  height: 32px;
  cursor: grab;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.grabber-zone:active { cursor: grabbing; }
.grabber {
  width: 40px; height: 5px;
  border-radius: 999px;
  background: rgba(60, 60, 67, 0.28);
}

.mine-card-title {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 20px 8px;
  font-size: var(--text-17); font-weight: 600;
  color: var(--color-text-primary);
}

.mine-card-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: calc(8px + var(--safe-bottom));
}
</style>
