<!--
  王冠入场动画 · 双模式
  夜晚版「灯醒」：深夜书房，一盏灯慢慢醒来（暗室遮罩 + 暖金光晕 + 王冠显影，4.9s）
  白天版「光启」：清晨阳光照进房间，王冠被唤醒，短暂闪耀后融入光芒（晨光 + 显影 + 呼吸 + 融化，3s）
  模式：mode prop（'night' 默认 / 'day'）
  冷启动约束：内存态标志（见 ChatView）
-->
<template>
  <div class="crown-entrance" :class="{ quick, day: mode === 'day' }" aria-hidden="true">
    <!-- 夜晚版：暗室遮罩 + 暖金光晕 -->
    <div class="dark-room"></div>
    <div class="light-glow"></div>
    <!-- 白天版：晨光 -->
    <div class="day-light"></div>
    <!-- 王冠柔光 + 王冠（双模式共用同一个 SVG，不复制 DOM） -->
    <div class="crown-halo"></div>
    <div class="crown-reveal">
      <svg width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 20h20" />
        <path d="M4 20V8l5 4 3-6 3 6 5-4v12" />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'

const props = defineProps({
  quick: { type: Boolean, default: false },
  mode: { type: String, default: 'night' } // 'night' 夜晚版 | 'day' 白天版
})
const emit = defineEmits(['done'])

let timer = null

// 各模式总时长（ms）
const DURATION = {
  night: { full: 3000, quick: 800 },
  day: { full: 3000, quick: 1000 }
}

onMounted(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    emit('done')
    return
  }
  const m = props.mode === 'day' ? 'day' : 'night'
  const total = DURATION[m][props.quick ? 'quick' : 'full']
  timer = setTimeout(() => emit('done'), total)
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.crown-entrance {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  overflow: hidden;
}

/* ============================================================
   NIGHT MODE「灯醒」（保持完全不变）
   ============================================================ */

/* 暗书房遮罩（0.5s 起散开，与王冠显影同步，不抢戏） */
.dark-room {
  position: absolute;
  inset: 0;
  background: #18181f;
  animation: roomLight 2s ease-out 0.5s forwards;
}
@keyframes roomLight {
  from { opacity: 1; }
  to   { opacity: 0; }
}

/* 暖光晕（纯金色系，呼吸 → 扩散 → 淡出） */
.light-glow {
  position: absolute;
  top: 42%;
  left: 50%;
  width: 640px;
  height: 640px;
  margin: -320px 0 0 -320px;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(200, 170, 115, 0.28) 0%,
    rgba(190, 160, 108, 0.20) 20%,
    rgba(180, 152, 102, 0.13) 42%,
    rgba(172, 146, 96, 0.07) 62%,
    rgba(164, 140, 92, 0.03) 80%,
    transparent 92%
  );
  animation: glowLife 3s ease-out 0s forwards;
}
/* 光晕是王冠的环境反应（非独立光源）：0–0.4s 黑暗 → 1.2s 起缓慢回应 → 2.3s 最高 0.28 → 与王冠同步消退 → 极弱残光 */
@keyframes glowLife {
  0%   { transform: scale(0.5); opacity: 0; }
  13%  { transform: scale(0.6); opacity: 0.08; }
  40%  { transform: scale(0.7); opacity: 0.1; }
  77%  { transform: scale(1.8); opacity: 0.28; }
  90%  { transform: scale(2.0); opacity: 0.03; }
  100% { transform: scale(2.2); opacity: 0.01; }
}

/* 王冠柔光 halo（夜晚版无 halo，白天版才显示） */
.crown-halo {
  display: none;
  position: absolute;
  top: 42%;
  left: 50%;
  width: 170px;
  height: 170px;
  margin: -85px 0 0 -85px;
  background: radial-gradient(circle, rgba(201, 162, 75, 0.28), transparent 68%);
}

/* 中央王冠（夜晚版：单一连续时间轴，王冠 > 环境光，禁止多动画竞争） */
.crown-reveal {
  position: absolute;
  top: 42%;
  left: 50%;
  z-index: 3;
  transform: translate(-50%, -50%);
  color: #c9a24b;
  opacity: 0; /* 初始隐藏：防止闪现 */
  animation: crownFocus 3s ease-out 0s both;
}
/* 全生命周期一个时间轴（3s）：0.4s 黑暗 → 1s 王冠被发现 → 2s 呼吸共存 → 2.7s 与夜色共同消退 → 3s 余韵 */
@keyframes crownFocus {
  0%   { opacity: 0; filter: blur(18px) brightness(1); transform: translate(-50%, -50%) scale(0.94); }
  13%  { opacity: 0; filter: blur(18px) brightness(1); transform: translate(-50%, -50%) scale(0.94); }
  33%  { opacity: 0.85; filter: blur(0) brightness(1.03); transform: translate(-50%, -50%) scale(1); }
  50%  { opacity: 1; filter: blur(0) brightness(1.05); transform: translate(-50%, -50%) scale(1.02); }
  67%  { opacity: 0.98; filter: blur(0) brightness(1.03); transform: translate(-50%, -50%) scale(1); }
  73%  { opacity: 0.98; filter: blur(0) brightness(1.03); transform: translate(-50%, -50%) scale(1); }
  90%  { opacity: 0; filter: blur(15px) brightness(1.08); transform: translate(-50%, -50%) scale(1.04); }
  100% { opacity: 0; filter: blur(15px) brightness(1.08); transform: translate(-50%, -50%) scale(1.04); }
}
/* 夜晚版精简（~800ms） */
.crown-entrance.quick .dark-room {
  animation: roomLight 0.45s ease-out 0.15s forwards;
}
.crown-entrance.quick .light-glow {
  animation: glowLifeQuick 0.7s ease-out 0s forwards;
}
@keyframes glowLifeQuick {
  0%   { transform: scale(0.6); opacity: 0.7; }
  60%  { transform: scale(2.4); opacity: 0.9; }
  100% { transform: scale(2.6); opacity: 0; }
}
.crown-entrance.quick .crown-reveal {
  animation: crownFocusQuick 0.6s ease-out 0.15s both;
}
@keyframes crownFocusQuick {
  0%   { opacity: 0; filter: blur(12px); }
  50%  { opacity: 1; filter: blur(0); }
  75%  { opacity: 1; filter: blur(0); }
  100% { opacity: 0; filter: blur(0); }
}

/* ============================================================
   DAY MODE「光启」（清晨阳光，明亮 / 温暖 / 轻盈，3s）
   ============================================================ */

/* 白天版：隐藏夜晚版的暗室 + 暖金光晕 */
.crown-entrance.day .dark-room,
.crown-entrance.day .light-glow {
  display: none;
}

/* 晨光背景：全屏暖白 radial-gradient，中心亮、外围透明（像阳光扩散） */
.day-light {
  display: none;
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 42%,
    rgba(255, 248, 225, 0.9) 0%,
    rgba(255, 246, 220, 0.55) 30%,
    rgba(255, 240, 200, 0.25) 55%,
    rgba(255, 255, 255, 0) 75%
  );
  opacity: 0;
}
.crown-entrance.day .day-light {
  display: block;
  animation: dayLight 3s ease-out 0s both;
}
@keyframes dayLight {
  0%   { opacity: 0; transform: scale(0.8); }
  13%  { opacity: 1; transform: scale(1); }
  80%  { opacity: 1; transform: scale(1.3); }
  100% { opacity: 0; transform: scale(1.5); }
}

/* 白天版王冠柔光 halo（随王冠显影 → 保持 → 融化） */
.crown-entrance.day .crown-halo {
  display: block;
  animation: haloDay 3s ease-out 0s both;
}
@keyframes haloDay {
  0%   { opacity: 0; transform: scale(0.85); }
  30%  { opacity: 1; transform: scale(1); }
  80%  { opacity: 1; transform: scale(1.05); }
  100% { opacity: 0; transform: scale(1.12); }
}

/* 白天版王冠：0.4s 显影 → 0.9s 清晰 → 呼吸（微闪耀）→ 2.4s 融入晨光 */
.crown-entrance.day .crown-reveal {
  animation: crownFocusDay 3s ease-out 0s both;
}
@keyframes crownFocusDay {
  0%   { opacity: 0; filter: blur(8px) brightness(1); transform: translate(-50%, -50%) scale(0.96); }
  13%  { opacity: 0; filter: blur(8px) brightness(1); transform: translate(-50%, -50%) scale(0.96); }
  30%  { opacity: 1; filter: blur(0) brightness(1); transform: translate(-50%, -50%) scale(1); }
  45%  { opacity: 0.9; filter: blur(0) brightness(1.08); transform: translate(-50%, -50%) scale(1.035); }
  60%  { opacity: 1; filter: blur(0) brightness(1); transform: translate(-50%, -50%) scale(1); }
  75%  { opacity: 0.9; filter: blur(0) brightness(1.08); transform: translate(-50%, -50%) scale(1.035); }
  80%  { opacity: 1; filter: blur(0) brightness(1); transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; filter: blur(8px) brightness(1.15); transform: translate(-50%, -50%) scale(1.05); }
}

/* 白天版精简（~1s） */
.crown-entrance.day.quick .day-light {
  animation: dayLightQuick 1s ease-out 0s both;
}
@keyframes dayLightQuick {
  0%   { opacity: 0; transform: scale(0.85); }
  25%  { opacity: 1; transform: scale(1); }
  80%  { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0; transform: scale(1.3); }
}
.crown-entrance.day.quick .crown-halo {
  animation: haloDayQuick 1s ease-out 0s both;
}
@keyframes haloDayQuick {
  0%   { opacity: 0; transform: scale(0.9); }
  30%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.1); }
}
.crown-entrance.day.quick .crown-reveal {
  animation: crownFocusDayQuick 1s ease-out 0s both;
}
@keyframes crownFocusDayQuick {
  0%   { opacity: 0; filter: blur(8px); }
  30%  { opacity: 1; filter: blur(0); }
  80%  { opacity: 1; filter: blur(0); }
  100% { opacity: 0; filter: blur(6px) brightness(1.15); }
}
</style>
