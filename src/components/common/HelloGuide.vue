<!--
  欢迎引导页积木
  首次进入"首页"时的欢迎卡片和使用指南
-->
<template>
  <div class="hello-container">
    <div class="welcome-card">
      <h2>欢迎使用寰中枢百科系统</h2>
      <p>这是一个为您和您的朋友打造的专属、轻量化个人知识库。可以在此随意记录和编辑词条。</p>
    </div>

    <div class="guide-card">
      <h3>使用指南</h3>
      <div class="guide-item">
        <span class="icon"><AppIcon name="search" :size="20" /></span>
        <div class="text">
          <h4>浏览和查阅词条</h4>
          <p>切换至底部"游戏"、"笔记"或"生活"页面，查看和检索对应分类下已经保存的所有百科词条内容。</p>
        </div>
      </div>
      <div class="guide-item">
        <span class="icon"><AppIcon name="edit" :size="20" /></span>
        <div class="text">
          <h4>实时编辑和上色</h4>
          <p>点击任意词条详情的"编辑"，可使用上方工具栏快速加粗或为特定段落添加颜色标记。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'
</script>

<style scoped>
.hello-container {
  padding: 15px; display: flex; flex-direction: column; gap: 15px;
  background-color: var(--color-bg-subtle);
  min-height: calc(100vh - 50px); box-sizing: border-box;
}
.welcome-card {
  background: var(--color-bg-card); border-radius: var(--radius-md);
  padding: 20px; border: 1px solid #eee;
}
.welcome-card h2 { font-size: 18px; color: #333; margin: 0 0 10px 0; }
.welcome-card p  { font-size: 14px; color: #666; line-height: 1.5; margin: 0; }

.guide-card {
  background: var(--color-bg-card); border-radius: var(--radius-md);
  padding: 20px; border: 1px solid #eee;
}
.guide-card h3 { font-size: 15px; color: #333; margin: 0 0 15px 0; }
.guide-item { display: flex; gap: 15px; align-items: flex-start; margin-bottom: 15px; }
.guide-item:last-child { margin-bottom: 0; }
.icon {
  display: flex; align-items: center; justify-content: center;
  background: #f0f0f0; padding: 8px; border-radius: 6px;
  min-width: 36px; min-height: 36px;
}
.text h4 { font-size: 14px; color: #333; margin: 0 0 4px 0; }
.text p  { font-size: 12px; color: #666; margin: 0; line-height: 1.4; }
</style>
