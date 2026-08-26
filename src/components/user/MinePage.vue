<!--
  个人中心页面 — 组装所有用户子组件
  职责：布局编排，数据计算和事件转发
-->
<template>
  <div class="page-content mine-page-container">
    <h2><AppIcon name="mine" :size="24" /> 我的中心</h2>

    <!-- 用户名片 -->
    <UserProfileCard
      :avatar="userProfile.avatar"
      :name="userProfile.name"
      :id="userProfile.id"
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

    <!-- 数据备份保险箱 -->
    <DataBackup
      :dbData="dbData"
      :validateImport="validateImportData"
      @import-success="(data) => $emit('import-db-success', data)"
    />

    <!-- 修改资料按钮 -->
    <div class="profile-action-wrapper">
      <button class="edit-data-trigger-btn" @click="showEditModal = true">
        <AppIcon name="settings" :size="14" /> 修改资料
      </button>
    </div>

    <!-- 修改资料弹窗 -->
    <EditProfileModal
      v-if="showEditModal"
      :name="userProfile.name"
      :avatar="userProfile.avatar"
      @close="showEditModal = false"
      @save="(data) => { $emit('save-profile', data); showEditModal = false }"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import UserProfileCard   from './UserProfileCard.vue'
import FootprintSummary  from './FootprintSummary.vue'
import CategoryGroup     from './CategoryGroup.vue'
import DataBackup        from './DataBackup.vue'
import EditProfileModal  from './EditProfileModal.vue'
import { ALL_CATEGORIES, TAB_ICONS, TAB_NAMES } from '../../constants/categories'

const props = defineProps({
  userProfile: { type: Object, required: true },
  dbData:      { type: Object, required: true }
})
const emit = defineEmits(['open-item', 'save-profile', 'import-db-success'])

const showEditModal = ref(false)

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

.profile-action-wrapper { margin-top: auto; padding: 25px 0 10px 0; display: flex; justify-content: center; }
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
