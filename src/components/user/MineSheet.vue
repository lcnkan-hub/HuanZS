<!--
  「我的」浮层积木（2026-11-21 底部卡片改版；2026-11-23 高度跟内容走 + 二级页）
  位置：全屏遮罩 + 底部升起的卡片（不是右侧抽屉）。
  高度：auto + max-height 88%。原来写死 88% 时，内容只有约 466px 的卡片会被拉到 692px，
        中间空出四百多像素 —— 看着像没加载出来。
  出场：从底边 translateY(100%) 升到 0，0.46s；曲线带一点点过冲（约 4px），是"落定"不是弹簧。
  离场：向下滑出，0.28s 由慢到快。
  出口（没有底部返回键，两条）：
    1. 按住顶部横杠下拉 —— 跟手移动，松手超过阈值（120px 与卡片 1/3 取小）就关，否则弹回；
    2. 点卡片外的遮罩。

  二级页（2026-11-23）：标题和返回箭头都在这里，因为卡片只有这一处"头部"。
  返回只回上一级（不动卡片），下拉/点遮罩才是关整张卡 —— 两条语义分工清楚，不会互相猜。

  2026-11-23 二次修正（用户反馈两条）：
    1. 二级页和首页**一样大**：打开时量一次首页的自然高度，之后所有页面都用这个高度。
       否则切一次页面卡片就换一次大小（449 → 342 → 285），像三张不同的卡在跳。
       内容多的页（收藏 30 条）在这个高度里滚动，卡片本身不长高。
    2. 二级页**淡入**：`<transition mode="out-in">` + 0.18s 透明度。
       高度已经固定，所以过渡期间不会有任何位移，只有内容在换。
    3. 弹窗挪到卡片里、但在滚动区**外面**（原来是 MinePage 里，落在 .mine-card-body 的滚动容器内）：
       位置由 .mine-card（有 transform，是 fixed 的包含块）界定 —— 弹窗永远不超出这张卡，
       内容长了在弹窗内部滚动（见 common/ModalBox.vue）。
-->
<template>
  <div class="mine-mask" :class="{ 'is-open': open }" :style="maskStyle" @click.self="requestClose">
    <div
      class="mine-card"
      :class="{ 'is-open': open }"
      :style="dragStyle"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
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

      <div class="mine-card-head">
        <button v-if="page" class="head-back" type="button" aria-label="返回" @click="goBack">
          <AppIcon name="back" :size="20" />
        </button>
        <h2 class="mine-card-title">{{ title }}</h2>
      </div>

      <div ref="bodyEl" class="mine-card-body" :style="bodyStyle">
        <transition name="mine-page" mode="out-in">
          <div class="mine-page-slot" :key="page || 'home'">
            <MinePage
              :userProfile="userProfile"
              :records="records"
              :page="page"
              @navigate="(p) => (page = p)"
              @edit-profile="showEditModal = true"
              @open-ai-settings="showAiSettings = true"
              @open-item="(item) => $emit('open-item', item)"
            />
          </div>
        </transition>
      </div>

      <!-- 弹窗挂在这层（卡片内、滚动区外）：位置被卡片界定，永远不超出「我的」这张卡 -->
      <EditProfileModal
        v-if="showEditModal"
        :name="userProfile?.name"
        :avatar="userProfile?.avatar"
        @close="showEditModal = false"
        @save="(data) => { $emit('save-profile', data); showEditModal = false }"
      />

      <!-- AI 设置弹窗（用户自带密钥，只存本机） -->
      <AiSettingsModal v-if="showAiSettings" @close="showAiSettings = false" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import MinePage from './MinePage.vue'
import EditProfileModal from './EditProfileModal.vue'
import AiSettingsModal from './AiSettingsModal.vue'
import { useSheetDrag } from '../../composables/useSheetDrag'

defineProps({
  userProfile: { type: Object, default: null },
  records:     { type: Array,  default: () => [] }
})
const emit = defineEmits(['close', 'save-profile', 'open-item'])

// 首帧先渲染成"收在屏幕下沿"的状态，下一帧再打开，transition 才会真正播放
const open = ref(false)

/* ---------- 二级页 ---------- */
const page = ref('')   // '' | 'crown' | 'favorites' | 'backup'
const PAGE_TITLES = { crown: '王冠', favorites: '我的收藏', backup: '数据与备份', appearance: '外观' }
const title = computed(() => PAGE_TITLES[page.value] || '我的')
function goBack() { page.value = '' }

/* ---------- 固定高度：所有页面和首页一样大 ---------- */
const bodyEl = ref(null)
const bodyHeight = ref(0)   // 0 = 还没量到，先按内容自适应
const bodyStyle = computed(() => (bodyHeight.value ? { height: `${bodyHeight.value}px` } : null))

/** 量首页的自然高度（先把高度放开，等一帧让布局回到内容高度再量） */
let measureRaf = 0
function measureHome() {
  if (!bodyEl.value || page.value) return
  bodyHeight.value = 0
  cancelAnimationFrame(measureRaf)
  measureRaf = requestAnimationFrame(() => {
    if (!bodyEl.value || page.value) return
    bodyHeight.value = Math.round(bodyEl.value.getBoundingClientRect().height)
  })
}

/* ---------- 弹窗 ---------- */
const showEditModal = ref(false)
const showAiSettings = ref(false)

onMounted(() => {
  // 双 rAF：确保浏览器先完成一次布局，否则 transition 会被合并掉（升起变成闪现）
  requestAnimationFrame(() => requestAnimationFrame(() => { open.value = true }))
  // 首帧量一次高度（此时卡片还在屏幕外，但布局已算好；transform 不影响尺寸）
  nextTick(measureHome)
  window.addEventListener('resize', measureHome)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measureHome)
  cancelAnimationFrame(measureRaf)
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
  transition: background-color var(--slide-dur) var(--spring-glide);
}
.mine-mask.is-open { background: rgba(0, 0, 0, 0.4); }

.mine-card {
  position: absolute; left: 0; right: 0; bottom: 0;
  /* 高度跟内容走：内容短就短，最长不超过 88%（留出 12% 记录页当参照） */
  max-height: 88%;
  display: flex; flex-direction: column;
  background: var(--color-bg-primary);
  border-radius: var(--radius-4xl) var(--radius-4xl) 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.14);
  transform: translateY(100%);
  /* 上滑带 3.8% 过冲：冲过落点再回来，是"托着卡片上来"的物理感。
     大件不用更大的过冲 —— 半屏高度上 10% 就是 40px 的抖。 */
  transition: transform var(--slide-dur) var(--spring-pop);
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

/* 头部：标题 17 → 20（原来卡里的名字比页标题还大，层级是倒的）。
   高度钉死 44：返回键本身 44，若让行高随内容走，进二级页时头部会从 36 长到 52，
   整张卡跟着长高 16px —— 那就又回到"切页换大小"了。 */
.mine-card-head {
  flex: 0 0 auto;
  height: 44px;
  display: flex; align-items: center; gap: 2px;
  padding: 0 20px;
}
.mine-card-title {
  margin: 0;
  font-size: var(--text-20); font-weight: 600;
  color: var(--color-text-primary);
}
/* 返回：44×44 的命中区，负 margin 让图标仍然落在 20px 那条视觉线上 */
.head-back {
  flex: 0 0 auto;
  width: 44px; height: 44px; margin-left: -12px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 0; padding: 0;
  color: var(--color-accent); cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.head-back:active { opacity: 0.5; }

.mine-card-body {
  /* 0 1 auto：有固定高度时按高度走（flex-basis 不能是 0，否则 height 被无视 —— 实测切页后卡片缩回内容高）；
     卡片被 max-height 夹住时也允许收缩，收缩后内部滚动 */
  flex: 0 1 auto;
  min-height: 0;            /* 必须：否则 max-height 一卡住，内部滚动不生效 */
  /* border-box：量到的是 border-box 高度（含 padding），写回的也必须是 border-box，
     否则每量一次就长 8px（padding-bottom），改窗口大小时会一路涨上去 */
  box-sizing: border-box;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: calc(8px + var(--safe-bottom));
}

/* 二级页淡入：高度已固定，所以这里只动透明度，不产生任何位移 */
.mine-page-enter-active { transition: opacity 0.18s ease; }
.mine-page-leave-active { transition: opacity 0.1s ease; }
.mine-page-enter-from,
.mine-page-leave-to { opacity: 0; }
</style>
