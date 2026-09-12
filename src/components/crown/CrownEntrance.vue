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
    <!-- 噪点抖动层：打散 8bit 量化台阶形成的规律环（强度取实测拐点 opacity .05） -->
    <div class="glow-dither" aria-hidden="true"></div>
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
  /* 显式 320px：100% 恰好落在 div 边缘。
     默认 farthest-corner 的 100% 在 452.5px，于是水平/垂直方向到 div 边缘还剩 alpha 0.05
     被硬切 —— 渲染实测这一处是 ΔRGB=7~8 的突变，是"分层感"真正的主因（内部台阶只有 Δ1）。 */
  /* 色标按固定比例（≈0.83）递减而不是等差递减：人眼对亮度的感知近似对数，
     等比衰减在感知上才是均匀的；等差递减会在中段留下一条斜率突变的分界线。 */
  background: radial-gradient(
    circle 320px at 50% 50%,
    rgba(200, 170, 115, 0.280) 0%,
    rgba(196, 166, 112, 0.232) 8.3%,
    rgba(192, 162, 110, 0.193) 16.7%,
    rgba(188, 158, 108, 0.160) 25%,
    rgba(184, 155, 106, 0.133) 33.3%,
    rgba(180, 152, 102, 0.110) 41.7%,
    rgba(176, 149, 100, 0.092) 50%,
    rgba(172, 146,  96, 0.076) 58.3%,
    rgba(168, 143,  94, 0.063) 66.7%,
    rgba(165, 141,  93, 0.052) 75%,
    rgba(163, 139,  92, 0.030) 83.3%,
    rgba(162, 138,  91, 0.010) 91.7%,
    rgba(160, 136,  90, 0)     100%
  );
  /* blur 半径必须 ≥ 量化台阶宽度（实测 3~9px），把 1/255 的跳变摊成缓坡。
     取 10px 而不是刚够的 3~4px：低端机的 GPU 高斯是近似实现，有效半径可能打折，
     留 2 倍余量才能让"Mali / Adreno / PowerVR / Apple"几家都落在安全区。
     filter 先于 transform，所以动画中 scale 放大时模糊同步放大，全程有效。 */
  filter: blur(10px);
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

  /* 噪点抖动层（dither）：blur 把台阶抹缓之后，台阶间距反而变得规律
    （实测间距变异系数 CV 0.77→0.54），而人眼最容易把"等间距的规律环"读成圈。
    噪点就是把这份规律打散成读不出来的随机纹理。
    ——强度实测（同一条水平半径剖面）：
      0     → 最大跳变 Δ1 / CV 0.54（规律环）
      0.05  → 最大跳变 Δ2 / CV 0.80  ← 拐点：环被打散，跳变仍在不可见区
      0.09  → Δ3     0.15 → Δ4（跳变进入可见区，且 CV 不再上升）
    三个必须做对的实现细节（缺一个就制造出新缺陷）：
    ① feColorMatrix saturate 0：feTurbulence 默认吐彩色噪声，叠在暖金上会浮出彩色颗粒
    ② 同形径向蒙版：否则 640×640 的方形噪点会引入一圈新的方形边界
    ③ 独立层 + 独立时间轴：放进 .light-glow 会被它的 filter: blur 一起糊掉；
       跟 glowLife 走则会被那条时间轴的 scale 带着放大"呼吸" */

.glow-dither {
  position: absolute;
  top: 42%;
  left: 50%;
  width: 640px;
  height: 640px;
  margin: -320px 0 0 -320px;
  pointer-events: none;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
  -webkit-mask-image: radial-gradient(circle 320px at 50% 50%, #000 0%, rgba(0,0,0,0.6) 46%, transparent 80%);
  mask-image: radial-gradient(circle 320px at 50% 50%, #000 0%, rgba(0,0,0,0.6) 46%, transparent 80%);
  opacity: 0;
  animation: glowDither 3s ease-out 0s forwards; /* 与光晕同一套时序节点，不引入新节奏 */
}
@keyframes glowDither {
  0%, 13% { opacity: 0; }
  40%     { opacity: 0.020; }
  77%     { opacity: 0.050; }
  90%     { opacity: 0.020; }
  100%    { opacity: 0; }
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
  /* 原本只有 2 个色标（0.28 → 透明），插值全交给浏览器 —— 这里按 0.83 等比衰减补到 12 个，
     衰减范围与原设计一致（68% 处归零，光晕大小不变） */
  background: radial-gradient(
    circle,
    rgba(201, 162, 75, 0.280) 0%,
    rgba(197, 158, 76, 0.232) 7%,
    rgba(193, 155, 77, 0.193) 14%,
    rgba(189, 152, 79, 0.160) 21%,
    rgba(185, 150, 80, 0.133) 28%,
    rgba(181, 148, 81, 0.110) 35%,
    rgba(177, 146, 83, 0.092) 42%,
    rgba(173, 144, 84, 0.076) 49%,
    rgba(169, 142, 85, 0.063) 56%,
    rgba(166, 140, 86, 0.030) 62%,
    rgba(164, 139, 86, 0.010) 65%,
    rgba(162, 138, 87, 0)     68%
  );
  filter: blur(2px);
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

/* 精简版：噪点层跟上 0.7s 的节奏（沿用 3s 那条会在光晕消失后还在抖） */
.crown-entrance.quick .glow-dither {
  animation: glowDitherQuick 0.7s ease-out 0s forwards;
}
@keyframes glowDitherQuick {
  0%   { opacity: 0; }
  30%  { opacity: 0.05; }
  100% { opacity: 0; }
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
    rgba(255, 249, 228, 0.90) 0%,
    rgba(255, 248, 226, 0.704) 15%,
    rgba(255, 246, 220, 0.550) 30%,
    rgba(255, 244, 216, 0.371) 42.5%,
    rgba(255, 240, 200, 0.250) 55%,
    rgba(255, 242, 210, 0.160) 62%,
    rgba(255, 244, 214, 0.080) 69%,
    rgba(255, 246, 220, 0.020) 73%,
    rgba(255, 255, 255, 0) 75%
  );
  /* 白天版没有暗室那种强对比，banding 轻得多：加密色标 + 轻微羽化即可。
     它的 div 是 inset:0 全屏，边界就是屏幕边界，不存在夜晚版那种被硬切的问题。 */
  filter: blur(2px);
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
