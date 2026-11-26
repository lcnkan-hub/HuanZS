<!--
  外观设置积木（2026-11-25 新增 · 2026-11-26 扩成两条轴）
  职责：给全站外观两个互不干扰的开关 ——「色彩」（选哪套色系）和「明暗」（白天 / 夜里）。
        它只改 useAppearance / useTimeMode 的值，自己不碰任何界面；记录页、详情页、
        「我的」、弹窗、登录页都吃同一份令牌，改一处全跟着走。

  为什么是两条轴而不是「几套主题各自昼夜固定」：
    色系 = 一套色值，昼夜 = 一个判据。两者正交之后，色系只需要写一份白天的值
    加一份夜里的值，用户也不用记"XX 主题的夜晚版本叫什么"。

  为什么默认是「跟随时间」：加这一档之前用户看到什么，之后还是什么（6:00 / 18:00）。
  「跟随系统」是另一条判据（操作系统的深浅色），所以单独一档、不和时间混。

  为什么放在「我的」里：它是整台设备的偏好，跟账号无关（storageScope 的 GLOBAL_KEYS）。
-->
<template>
  <div class="appearance-group">
    <h3 class="group-title">色彩</h3>
    <div class="appearance-card">
      <button
        v-for="p in PALETTES"
        :key="p.id"
        class="opt"
        type="button"
        :aria-pressed="palette === p.id ? 'true' : 'false'"
        @click="pickPalette(p.id)"
      >
        <span class="swatch" :style="swatchStyle(p.id)">
          <i class="dot solid" :style="{ background: dotColor(p.id, 'solid') }"></i>
          <i class="dot select" :style="{ background: dotColor(p.id, 'select') }"></i>
        </span>
        <span class="opt-txt">
          <span class="opt-label">{{ p.name }}</span>
          <span class="opt-sub">{{ p.note }}</span>
        </span>
        <span v-if="palette === p.id" class="opt-tick"><AppIcon name="check" :size="18" /></span>
      </button>
    </div>
  </div>

  <div class="appearance-group">
    <h3 class="group-title">明暗</h3>
    <div class="appearance-card">
      <button
        v-for="opt in MODE_OPTIONS"
        :key="opt.value"
        class="opt"
        type="button"
        :aria-pressed="themeMode === opt.value ? 'true' : 'false'"
        @click="pickMode(opt.value)"
      >
        <span class="opt-txt">
          <span class="opt-label">{{ opt.label }}</span>
          <span class="opt-sub">{{ opt.value === 'auto' ? autoSub : opt.value === 'system' ? systemSub : opt.sub }}</span>
        </span>
        <span v-if="themeMode === opt.value" class="opt-tick"><AppIcon name="check" :size="18" /></span>
      </button>
    </div>
  </div>

  <p class="appearance-note">
    夜里的深色版跟着每套色系走，不是统一一套黑。跟随时间按 6:00 / 18:00 切换；跟随系统读手机的深浅色。
  </p>
</template>

<script setup>
import { computed, onMounted, reactive } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { PALETTES } from '../../constants/palettes'
import { palette, setPalette } from '../../composables/useAppearance'
import { themeMode, setThemeMode, mode, getSystemMode } from '../../composables/useTimeMode'

const MODE_OPTIONS = [
  { value: 'auto',   label: '跟随时间', sub: '' },
  { value: 'system', label: '跟随系统', sub: '' },
  { value: 'day',    label: '白天',     sub: '一直用浅色' },
  { value: 'night',  label: '夜晚',     sub: '一直用深色' }
]

/** 「跟随时间」的副行要说出此刻到底算白天还是晚上 —— 不然这一档是抽象的 */
const autoSub = computed(() => (mode.value === 'day' ? '现在：白天' : '现在：夜晚'))
const systemSub = computed(() => (getSystemMode() === 'day' ? '现在：系统是浅色' : '现在：系统是深色'))

function pickMode(value) {
  setThemeMode(value)
}
function pickPalette(id) {
  setPalette(id)
}

/**
 * 色卡上的三颗圆点：纸 / 实心 / 选中态。
 * 值不在这里写死 —— 现场把该色系的类挂到一个脱离页面的探针上，读它算出来的令牌。
 * 这样"改一套色"只改 CSS，JS 里不会留下第二份 hex（那样迟早对不上）。
 * 探针挂在 body 上而不是组件里：组件在 .theme-deep 里，读到的会是夜里的值。
 */
const swatches = reactive({})

function readSwatches() {
  for (const p of PALETTES) {
    const probe = document.createElement('div')
    if (p.className) probe.className = p.className
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;'
    document.body.appendChild(probe)
    const cs = getComputedStyle(probe)
    swatches[p.id] = {
      paper: cs.getPropertyValue('--color-bg-primary').trim(),
      solid: cs.getPropertyValue('--color-accent-solid').trim(),
      select: cs.getPropertyValue('--color-accent-select').trim()
    }
    probe.remove()
  }
}

/** 读不到（老环境 / 令牌被改坏）时退回一个中性底，不让色卡变成透明 */
function swatchStyle(id) {
  const s = swatches[id] || {}
  return { backgroundColor: s.paper || 'var(--color-bg-input)' }
}

/** 两颗色点：实心色 / 选中态色；读不到就给当前文字色（至少看得见） */
function dotColor(id, key) {
  const s = swatches[id] || {}
  return s[key] || 'currentColor'
}

onMounted(readSwatches)
</script>

<style scoped>
.appearance-group + .appearance-group { margin-top: 18px; }

.group-title {
  margin: 0 4px 8px;
  font-size: var(--text-13);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
}

.appearance-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-3xl);
  box-shadow: var(--surface-card-rim), var(--surface-card-shadow);
  overflow: hidden;
}

.opt {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  width: 100%; min-height: 64px; padding: 11px 16px;
  background: none; border: 0; text-align: left;
  font-family: var(--font-system); color: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background-color 0.16s ease;
}
.opt:active { background: var(--color-bg-input); }
/* 同一张卡里的项之间才画线；第一项不画 */
.opt + .opt::before {
  content: '';
  position: absolute; left: 16px; right: 0; top: 0; height: 1px;
  background: var(--color-border-light);
}

/* 色卡：一块纸色圆角方块 + 两颗色点（实心 / 选中态） */
.swatch {
  flex: 0 0 auto;
  position: relative;
  width: 40px; height: 40px;
  border-radius: var(--radius-lg);
  display: block;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.dot {
  position: absolute;
  width: 9px; height: 9px;
  border-radius: 50%;
  display: block;
}
.dot.solid  { left: 8px;  bottom: 8px; }
.dot.select { right: 8px; bottom: 8px; opacity: 0.6; }

.opt-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.opt-label { font-size: var(--text-16); font-weight: 600; line-height: 1.35; color: var(--color-text-primary); }
.opt-sub { font-size: var(--text-12); line-height: 1.4; color: var(--color-text-muted); }
.opt-tick { flex: 0 0 auto; display: flex; color: var(--color-accent); }

.appearance-note {
  margin: 12px 4px 0;
  font-size: var(--text-12); line-height: 1.6;
  color: var(--color-text-muted);
}
</style>
