<!--
  用户名片积木（2026-11-23 重排）
  展示：头像 + 名字 + 一行副信息（本机 / 创建于）；整张卡就是「修改资料」的入口。

  三个刻意的改动（都有代价在前，不是审美）：
  1. 名字从 20/700 降到 17/600 —— 原来卡里的名字比页标题「我的」还大，
     层级是倒的（HIG · Typography：用字号 + 字重 + 颜色表达层级）。
  2. 头像 62 → 48，去掉白色圆底 + 内阴影：近白卡上再放一个带阴影的白圆，
     等于在一层容器里再叠一层（HIG · Materials：内容层不叠材质）。
  3. 枢纽 ID 不再显示：不联网、不换账号时它没有使用场景，
     留给用户看的只有「这是本机 + 哪天建的」。
     将来要复制也走「修改资料」弹窗，不占名片第二行。
-->
<template>
  <button class="user-profile-card" type="button" aria-label="修改资料" @click="$emit('edit')">
    <span class="avatar">{{ avatar }}</span>
    <span class="who">
      <span class="name">{{ name }}</span>
      <span v-if="meta" class="meta">{{ meta }}</span>
    </span>
    <span class="edit">编辑</span>
  </button>
</template>

<script setup>
defineProps({
  avatar: { type: String, default: '🐱' },
  name:   { type: String, default: '' },
  // 副信息由 MinePage 拼好传进来（本机 · 创建于 2026/11/23）
  meta:   { type: String, default: '' }
})
defineEmits(['edit'])
</script>

<style scoped>
.user-profile-card {
  display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 14px 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-3xl);
  box-shadow: var(--shadow-card);
  font-family: var(--font-system); text-align: left;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background-color 0.16s ease;
}
.user-profile-card:active { background: var(--color-bg-input); }

.avatar {
  width: 48px; height: 48px; flex: 0 0 48px;
  border-radius: 50%; background: var(--color-bg-input);
  display: flex; align-items: center; justify-content: center;
  font-size: var(--text-26); line-height: 1;
}
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.name {
  font-size: var(--text-17); font-weight: 600; line-height: 1.3;
  color: var(--color-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.meta {
  margin-top: 2px; font-size: var(--text-12); line-height: 1.4;
  color: var(--color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.edit {
  flex: 0 0 auto; display: flex; align-items: center;
  min-height: 44px; padding-left: 10px;
  font-size: var(--text-13); font-weight: 500; color: var(--color-accent);
}
</style>
