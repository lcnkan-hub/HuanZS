<!--
  用户名片积木
  展示头像、用户名、枢纽ID
-->
<template>
  <div class="user-profile-card">
    <div class="user-avatar-circle">{{ avatar }}</div>
    <div class="user-info-details">
      <div class="user-name-title">{{ name }}</div>
      <div class="user-id-sub">枢纽ID: {{ id }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  avatar: { type: String, default: '🐱' },
  name:   { type: String, default: '' },
  id:     { type: String, default: '' }
})
</script>

<style scoped>
.user-profile-card {
  background: linear-gradient(135deg, var(--color-bg-card) 0%, #f9f9fc 100%);
  border-radius: var(--radius-3xl); padding: 20px; display: flex;
  align-items: center; gap: 18px;
  box-shadow: var(--shadow-card-md); margin-bottom: 16px;
  border: 1px solid rgba(0,0,0,0.02);
}
.user-avatar-circle {
  width: 62px; height: 62px; background: var(--color-bg-card); border-radius: 50%;
  display: flex; justify-content: center; align-items: center;
  font-size: 32px; box-shadow: 0 3px 10px rgba(0,0,0,0.06);
}
.user-info-details { display: flex; flex-direction: column; gap: 4px; }
.user-name-title { font-size: 19px; font-weight: 700; color: var(--color-text-primary); }
.user-id-sub { font-size: 13px; color: var(--color-text-muted); font-family: monospace; }
</style>
