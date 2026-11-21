<!--
  「我的」内容积木（2026-11-21 单层重构版）
  职责：布局编排，数据计算和事件转发。容器是 MineSheet（右侧滑入的卡片），本组件只管里面放什么。
  顺序：名片 → 本机锁 → 备份 → 王冠 → 修改资料。
  2026-11-21 单人化：「我创建的」整块撤掉 —— 只有一个用户时，它是一个会说谎的数字。
  足迹模块已按决策删除（只剩一个记录池，分类占比失去意义）。
-->
<template>
  <div class="page-content mine-page-container">
    <!-- 用户名片 -->
    <UserProfileCard
      :avatar="userProfile?.avatar"
      :name="userProfile?.name"
      :id="userProfile?.id"
    />

    <!-- 本机锁：只有一个人用，所以这里不是「账号管理」，只是「锁不锁」 -->
    <AccountSection />

    <!-- 备份中心：导出全量 / 导入 / 回退 -->
    <BackupCenter />

    <!-- 王冠：主动开口开关 + 模型密钥 -->
    <CrownSection @open-ai-settings="showAiSettings = true" />

    <!-- 底部操作：修改资料（AI 设置已并入上方王冠卡） -->
    <div class="profile-action-wrapper">
      <button class="edit-data-trigger-btn" @click="showEditModal = true">
        <AppIcon name="settings" :size="14" /> 修改资料
      </button>
    </div>

    <!-- 修改资料弹窗 -->
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
</template>

<script setup>
import { ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import UserProfileCard   from './UserProfileCard.vue'
import BackupCenter      from './BackupCenter.vue'
import AccountSection    from './AccountSection.vue'
import CrownSection      from './CrownSection.vue'
import EditProfileModal  from './EditProfileModal.vue'
import AiSettingsModal   from './AiSettingsModal.vue'

defineProps({
  userProfile: { type: Object, default: null },
  records:     { type: Array,  default: () => [] }
})
// 事件：save-profile
defineEmits(['save-profile'])

const showEditModal = ref(false)
const showAiSettings = ref(false)

</script>

<style scoped>
/* 2026-11-21：容器从右侧抽屉换成底部卡片后，顶部留白由卡片的横杠+标题接管，
   这里不再自留 20px，否则第一块名片会被顶下去一截（卡片高度只有 88%，首屏能放的东西少一件） */
.page-content { padding: 4px 20px 20px; animation: fadeInContent 0.3s ease-out; }
.mine-page-container { display: flex; flex-direction: column; }

.profile-action-wrapper {
  padding: 4px 0 10px 0;
  display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;
}
.edit-data-trigger-btn {
  background-color: var(--color-bg-card); color: var(--color-text-muted);
  border: 1px solid var(--color-border-input); border-radius: var(--radius-lg);
  padding: 8px 20px; min-height: 44px; font-size: var(--text-13); font-weight: 500; cursor: pointer;
  transition: all 0.2s; display: flex; align-items: center; gap: 4px;
}
.edit-data-trigger-btn:active { background-color: #f4f9ff; transform: scale(0.98); }
@keyframes fadeInContent {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
