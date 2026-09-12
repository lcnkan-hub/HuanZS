<!--
  王冠界面背景板 · 只做夜色（白天保持原有米白底，不新增层）
  为什么需要：入场动画「灯醒」是深夜书房（暗室 #18181f → 暖金光晕 → 王冠显影），
              但动画散开后聊天界面是一片米白 —— 动画与落地页不在同一个空间。
  本组件让夜晚的界面接着入场动画往下走：同一个空间、同一盏灯，只是暗下来了。
  时间同步：mode 由 useTimeMode 提供，与入场动画共用同一判定（6:00–18:00 = 白天）。
  层位：绝对定位铺满、pointer-events: none、z-index 0 —— 永远在内容层之下。
-->
<template>
  <div class="crown-backdrop" :class="{ 'is-on': mode === 'night' }" aria-hidden="true">
    <!-- 空间基底：中心略亮、四周渐沉，让夜色有纵深而不是一块死平的黑。
         手机尺寸实测：整层亮度差只有 4 个色阶 → 最宽同色段 ≥20px 仅 3 处、跳变 Δ1，
         是"大片淡带"不是"环"，且绝大部分被光晕覆盖。改它等于改夜色亮度本身，故保持原状。 -->
    <div class="night-base"></div>
    <!-- 暖金残光：位置/尺寸/配方与入场动画同一颗灯（top 42% / 640px），极缓呼吸 -->
    <div class="night-glow"></div>
  </div>
</template>

<script setup>
defineProps({
  // 'day' | 'night'，由 useTimeMode 统一判定（与入场动画同源）
  mode: { type: String, default: 'night' }
})
</script>

<style scoped>
/* 容器：白天完全透明（露出原有米白底），夜晚淡入 —— 跨时段柔和过渡而非突切 */
.crown-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  opacity: 0;
  transition: opacity 1.2s ease;
}
.crown-backdrop.is-on {
  opacity: 1;
}

/* 夜色基底：与入场暗室同色（--crown-night-bg），动画散开时看不出"换场" */
.night-base {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 42%,
    #1c1c26 0%,
    var(--crown-night-bg) 46%,
    #131319 100%
  );
}

/* 暖金残光：与「灯醒」的光晕同心同位（top 42%），配方同源、只留低亮度余温 */
.night-glow {
  position: absolute;
  top: 42%;
  left: 50%;
  width: 640px;
  height: 640px;
  margin: -320px 0 0 -320px;
  /* 显式 320px：让渐变的 100% 恰好落在 div 边缘。
     默认 farthest-corner 的 100% 在 452.5px，夜板光晕到 div 边缘还剩 alpha 0.02 被硬切
     —— 手机尺寸实测这一处是 ΔRGB=2 的残留边。 */
  /* 色标按等比（≈0.86）递减，与入场光晕同一套光学配方；夜板亮度只有入场约 37%，
     色阶更少、台阶更宽（约 18px），所以 blur 半径取得比入场更大。 */
  background: radial-gradient(
    circle 320px at 50% 50%,
    rgba(200, 170, 115, 0.105) 0%,
    rgba(197, 167, 113, 0.090) 8.3%,
    rgba(194, 164, 111, 0.076) 16.7%,
    rgba(191, 162, 109, 0.063) 25%,
    rgba(188, 159, 107, 0.052) 33.3%,
    rgba(184, 157, 105, 0.041) 41.7%,
    rgba(181, 154, 103, 0.032) 50%,
    rgba(178, 152, 101, 0.024) 58.3%,
    rgba(174, 149,  99, 0.017) 66.7%,
    rgba(171, 147,  97, 0.011) 75%,
    rgba(168, 144,  95, 0.006) 83.3%,
    rgba(165, 141,  93, 0.002) 91.7%,
    rgba(164, 140,  92, 0)     100%
  );
  /* 夜板不加噪点层：噪点靠 overlay 生效，而夜色整体太暗（rgb(28,28,38)），
     overlay 在暗区的混合权重极低，噪点掀不动底色，只在光晕最亮的中心局部扰动 ——
     手机尺寸实测：段数 96→140、最大跳变 Δ2→Δ3（进入可见区）、间距 CV 1.06→0.98（反而更规律）。
     入场光晕亮（峰值 0.28）噪点有效，夜板（0.105）无效，是两个场景的结论，不是同一件事。 */
  filter: blur(18px);
  /* 极缓呼吸：只做 opacity + transform，看不出"在动"，只留"灯还亮着"的生命感 */
  animation: nightGlowBreath 16s ease-in-out infinite;
}
@keyframes nightGlowBreath {
  0%, 100% { opacity: 0.86; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.03); }
}

/* 无障碍：减少动效偏好时，残光保持常亮不呼吸 */
@media (prefers-reduced-motion: reduce) {
  .night-glow { animation: none; }
}
</style>
