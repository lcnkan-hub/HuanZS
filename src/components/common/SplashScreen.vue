<!--
  开屏动画组件
  首次访问显示 2 秒欢迎动画，同会话内不再重复
-->
<template>
  <div class="splash-screen">
    <div class="splash-content">
      <h1 class="splash-text">欢迎使用寰中枢</h1>
      <p class="splash-sub">属于你的多维核心枢纽</p>
      <div class="splash-loader"></div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'

const emit = defineEmits(['close'])

onMounted(() => {
  if (sessionStorage.getItem('hasSeenSplash')) {
    emit('close')
  } else {
    setTimeout(() => {
      sessionStorage.setItem('hasSeenSplash', 'true')
      emit('close')
    }, 2000)
  }
})
</script>

<style scoped>
.splash-screen {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background-color: #ffffff; display: flex; justify-content: center;
  align-items: center; z-index: 99999;
  animation: fadeOutScreen 0.4s cubic-bezier(0.25, 1, 0.5, 1) 1.6s forwards;
}
.splash-content { text-align: center; }
.splash-text {
  font-size: 32px; font-weight: 800; color: #1d1d1f; margin-bottom: 12px;
  letter-spacing: -0.5px;
  animation: splashPopIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.splash-sub {
  font-size: 15px; color: #8e8e93; margin-bottom: 30px; opacity: 0;
  animation: fadeInSub 0.6s ease-out 0.4s forwards;
}
.splash-loader {
  width: 140px; height: 3px; background: #f2f2f7; border-radius: 2px;
  margin: 0 auto; position: relative; overflow: hidden;
}
.splash-loader::after {
  content: ''; position: absolute; left: 0; top: 0; height: 100%;
  width: 40%; background: #007aff; border-radius: 2px;
  animation: loadingBar 1.6s ease-in-out infinite;
}
@keyframes splashPopIn {
  from { opacity: 0; transform: scale(0.92) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes fadeInSub {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 0.8; transform: translateY(0); }
}
@keyframes loadingBar {
  0%   { left: -40%; }
  50%  { width: 60%; }
  100% { left: 100%; }
}
@keyframes fadeOutScreen {
  to { opacity: 0; visibility: hidden; pointer-events: none; }
}
</style>
