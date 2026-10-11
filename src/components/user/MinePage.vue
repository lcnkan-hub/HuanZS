<!--
  个人中心页面 — 组装所有用户子组件
  职责：布局编排，数据计算和事件转发
-->
<template>
  <div class="page-content mine-page-container">
    <h2><AppIcon name="mine" :size="24" /> 我的中心</h2>

    <!-- 用户名片 -->
    <UserProfileCard
      :avatar="userProfile?.avatar"
      :name="userProfile?.name"
      :id="userProfile?.id"
    />

    <!-- 创造力足迹 -->
    <FootprintSummary :myFilteredData="myFilteredData" />

    <!-- 我创建的：一行数字入口，替代原来的三块折叠面板（2026-10-11「我的」页 B 档重排） -->
    <MyItemsEntry
      :myData="myFilteredData"
      @jump="(cat) => $emit('jump-category', cat)"
    />

    <!-- 账号（本地账号系统：当前账号 + 退出 / 换账号） -->
    <AccountSection />

    <!-- 备份中心：导出全量 / 导入 / 回退（2026-10-10 替换只导百科的旧备份盒） -->
    <BackupCenter />

    <!-- 王冠：主动开口开关 + 模型密钥（一张卡说完「能不能开口、拿什么开口」） -->
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
import { computed, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import UserProfileCard   from './UserProfileCard.vue'
import FootprintSummary  from './FootprintSummary.vue'
import MyItemsEntry      from './MyItemsEntry.vue'
import BackupCenter      from './BackupCenter.vue'
import AccountSection    from './AccountSection.vue'
import CrownSection      from './CrownSection.vue'
import EditProfileModal  from './EditProfileModal.vue'
import AiSettingsModal   from './AiSettingsModal.vue'
import { ALL_CATEGORIES } from '../../constants/categories'

const props = defineProps({
  userProfile: { type: Object, default: null },
  dbData:      { type: Object, required: true }
})
// 事件：jump-category（点「我创建的」数字跳分类，由 App 接手「切 Tab + 只看我创建的」）、save-profile
defineEmits(['jump-category', 'save-profile'])

const showEditModal = ref(false)
const showAiSettings = ref(false)

// 当前用户的条目（按分类过滤）—— 足迹数字与「我创建的」入口共用同一份，避免各算各的
const myFilteredData = computed(() => {
  const name = props.userProfile?.name || ''
  const result = {}
  ALL_CATEGORIES.forEach(cat => {
    result[cat] = (props.dbData[cat] || []).filter(item => item.creator === name)
  })
  return result
})
</script>

<style scoped>
.page-content { padding: 20px; animation: fadeInContent 0.3s ease-out; }
.page-content h2 {
  font-size: var(--text-22); font-weight: 600; margin-bottom: 15px;
  display: flex; align-items: center; gap: 6px;
}
.mine-page-container { display: flex; flex-direction: column; min-height: calc(100vh - 120px); }

.profile-action-wrapper {
  margin-top: auto; padding: 25px 0 10px 0;
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
