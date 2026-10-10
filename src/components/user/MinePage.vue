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

    <!-- 分类条目折叠面板 — 复用3次 -->
    <div class="my-data-list">
      <CategoryGroup
        v-for="cat in categories"
        :key="cat.key"
        :category="cat.key"
        :icon="cat.icon"
        :label="cat.label"
        :items="myFilteredData[cat.key]"
        @open-item="(item, category) => $emit('open-item', item, category)"
      />
    </div>

    <!-- 备份中心：导出全量 / 导入 / 回退（2026-10-10 替换只导百科的旧备份盒） -->
    <BackupCenter />

    <!-- 账号（本地账号系统：当前账号 + 退出 / 换账号） -->
    <AccountSection />

    <!-- 王冠（主动开口开关 + 本月已开口次数，2026-10-10 I02） -->
    <CrownSection />

    <!-- 底部操作：AI 设置（BYOK 密钥）+ 修改资料 -->
    <div class="profile-action-wrapper">
      <button class="edit-data-trigger-btn" @click="showAiSettings = true">
        <AppIcon name="key" :size="14" /> AI 设置
        <span class="ai-state" :class="{ configured: aiConfigured }">{{ aiConfigured ? '已配置' : '未配置' }}</span>
      </button>
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
import CategoryGroup     from './CategoryGroup.vue'
import DataBackup        from './DataBackup.vue'
import BackupCenter      from './BackupCenter.vue'
import AccountSection    from './AccountSection.vue'
import CrownSection      from './CrownSection.vue'
import EditProfileModal  from './EditProfileModal.vue'
import AiSettingsModal   from './AiSettingsModal.vue'
import { ALL_CATEGORIES, TAB_ICONS, TAB_NAMES } from '../../constants/categories'
import { useAIConfig } from '../../composables/useApiKey'

const props = defineProps({
  userProfile: { type: Object, default: null },
  dbData:      { type: Object, required: true }
})
const emit = defineEmits(['open-item', 'save-profile'])

const showEditModal = ref(false)
const showAiSettings = ref(false)

// AI 密钥状态（BYOK 单例，与王冠页共享同一份）：入口上显示「已配置 / 未配置」
const { config: aiConfig } = useAIConfig()
const aiConfigured = computed(() => !!(aiConfig.value?.apiKey || '').trim())

// 分类配置（驱动 CategoryGroup 复用的数据源）
const categories = ALL_CATEGORIES.map(key => ({
  key,
  icon: TAB_ICONS[key],
  label: TAB_NAMES[key] === '游戏' ? '我创建的游戏条目'
       : TAB_NAMES[key] === '笔记' ? '我撰写的笔记条目'
       : '我记录的生活条目'
}))

// 当前用户的条目（按分类过滤）
const myFilteredData = computed(() => {
  const name = props.userProfile?.name || ''
  const result = {}
  ALL_CATEGORIES.forEach(cat => {
    result[cat] = (props.dbData[cat] || []).filter(item => item.creator === name)
  })
  return result
})

// 导入数据格式校验（转发给 DataBackup）
const validateImportData = (data) => {
  return data && Array.isArray(data.game) && Array.isArray(data.note) && Array.isArray(data.life)
}
</script>

<style scoped>
.page-content { padding: 20px; animation: fadeInContent 0.3s ease-out; }
.page-content h2 {
  font-size: 22px; font-weight: 600; margin-bottom: 15px;
  display: flex; align-items: center; gap: 6px;
}
.mine-page-container { display: flex; flex-direction: column; min-height: calc(100vh - 120px); }

.my-data-list {
  background: white; border-radius: var(--radius-2xl); overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03); border: 1px solid var(--color-border-light);
}

.profile-action-wrapper {
  margin-top: auto; padding: 25px 0 10px 0;
  display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;
}
/* 密钥状态徽标（已配置 / 未配置） */
.ai-state {
  font-size: 11px; padding: 1px 6px; border-radius: 999px;
  background: var(--color-border-light); color: var(--color-text-muted);
}
.ai-state.configured { background: rgba(46, 158, 91, 0.12); color: #2e9e5b; }
.edit-data-trigger-btn {
  background-color: #ffffff; color: var(--color-text-muted);
  border: 1px solid var(--color-border-input); border-radius: var(--radius-lg);
  padding: 8px 20px; font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.2s; display: flex; align-items: center; gap: 4px;
}
.edit-data-trigger-btn:active { background-color: #f4f9ff; transform: scale(0.98); }
@keyframes fadeInContent {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
