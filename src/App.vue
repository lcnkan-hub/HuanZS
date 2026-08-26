<!--
  根组件 — 全局状态管理与页面调度
  条件渲染 SplashScreen / 百科列表 / 详情面板 / 我的页面 / 添加弹窗
  支持主词条-子词条的二级嵌套结构
  通过 composables 集中处理用户档案和百科数据
-->
<template>
  <div class="app-container">
    <!-- 开屏动画 -->
    <SplashScreen v-if="isSplashActive" @close="isSplashActive = false" />

    <!-- 顶部搜索栏（内容页且未打开详情时显示，不包含王冠） -->
    <AppHeader
      v-if="isContentTab && !openedItem"
      :tabName="currentTabName"
      :modelValue="searchQueries[currentTab]"
      @update:modelValue="(v) => searchQueries[currentTab] = v"
      @add="openAddModal"
    />

    <!-- 主内容区（页面叠层，动画只操作 transform + opacity） -->
    <div class="main-content">
      <!-- 王冠 AI 伙伴（全屏聊天界面） -->
      <ChatView v-if="currentTab === 'crown'" />

      <!-- 百科叠层（非王冠 Tab 时显示） -->
      <div v-if="currentTab !== 'crown'" class="page-stack">

        <!-- 主面板：百科列表 + 个人中心（同层切换，:key 触发内容动画） -->
        <div class="page-sheet primary-sheet" :class="pageClass('primary')">
          <div :key="primaryKey" class="sheet-body">
            <WikiList
              v-if="isContentTab && !openedItem"
              :key="'list-' + currentTab"
              :icon="currentTabIcon"
              :tabName="currentTabName"
              :items="filteredItems"
              :currentUser="userProfile.name"
              @open-item="(item) => openDetail(item)"
              @delete-item="(id) => handleDelete(id)"
            />
            <MinePage
              v-else-if="currentTab === 'mine'"
              key="mine"
              :userProfile="userProfile"
              :dbData="dbData"
              @open-item="(item, type) => { openDetail(item); currentTab = type }"
              @save-profile="handleProfileUpdate"
              @import-db-success="(data) => wikiData.importData(data)"
            />
          </div>
        </div>

        <!-- 详情面板（主词条详情页，独立 sheet 做滑入滑出） -->
        <div class="page-sheet detail-sheet" :class="pageClass('detail')">
          <WikiDetail
            v-if="openedItem"
            :key="'detail-' + openedItem.id"
            :openedItem="openedItem"
            :currentUser="userProfile.name"
            @close="closeDetail"
            @add-child="handleAddChild"
            @save-child="handleSaveChildWiki"
            @delete-child="handleDeleteChild"
          />
        </div>

      </div>
    </div>

    <!-- 添加条目弹窗 -->
    <ModalBox
      v-if="showAddModal"
      :title="'添加' + currentTabName"
      @close="showAddModal = false"
    >
      <input
        type="text" v-model="newItemName"
        :placeholder="'请输入' + currentTabName + '名称'"
        class="modal-input"
      />
      <template #actions>
        <button class="cancel-btn" @click="showAddModal = false">取消</button>
        <button class="save-btn" @click="handleAddItem">保存</button>
      </template>
    </ModalBox>

    <!-- 底部导航栏（王冠 Tab 隐藏，聊天有独立输入栏） -->
    <BottomNav v-if="!openedItem && currentTab !== 'crown'" v-model="currentTab" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// 组件积木
import SplashScreen from './components/common/SplashScreen.vue'
import ModalBox     from './components/common/ModalBox.vue'
import AppHeader    from './components/layout/AppHeader.vue'
import BottomNav    from './components/layout/BottomNav.vue'
import WikiList     from './components/wiki/WikiList.vue'
import WikiDetail   from './components/wiki/WikiDetail.vue'
import MinePage     from './components/user/MinePage.vue'
import ChatView     from './components/crown/ChatView.vue'

// 逻辑积木
import { useUserProfile } from './composables/useUserProfile'
import { useWikiData }    from './composables/useWikiData'
import { usePageRouter }  from './composables/usePageRouter'

// 配置常量
import { TAB_ICONS, TAB_NAMES, ALL_CATEGORIES } from './constants/categories'

// ========== 状态 ==========
const { userProfile, updateProfile } = useUserProfile()
const wikiData = useWikiData()
const { dbData } = wikiData
const { syncCreatorName } = wikiData

const currentTab     = ref('game')
const searchQueries  = ref({ game: '', note: '', life: '' })
const isSplashActive = ref(true)
const showAddModal   = ref(false)
const newItemName    = ref('')

// 页面路由（详情打开/关闭 + 动画状态机）
const { openedItem, primaryKey, pageClass, openDetail, closeDetail } = usePageRouter(currentTab)

// ========== 计算属性 ==========
const isContentTab   = computed(() => ALL_CATEGORIES.includes(currentTab.value))
const currentTabName = computed(() => TAB_NAMES[currentTab.value] || '')
const currentTabIcon = computed(() => TAB_ICONS[currentTab.value] || '')

const filteredItems = computed(() =>
  wikiData.searchItems(currentTab.value, searchQueries.value[currentTab.value])
)

// ========== 操作函数 ==========
const openAddModal = () => {
  newItemName.value = ''
  showAddModal.value = true
}

const handleAddItem = () => {
  if (!newItemName.value.trim()) return alert('名称不能为空')
  wikiData.addItem(currentTab.value, newItemName.value, userProfile.value.name)
  showAddModal.value = false
}

const handleDelete = (id) => {
  if (confirm('确定要删除这个条目吗？')) {
    wikiData.deleteItem(currentTab.value, id)
  }
}

// ========== 子词条操作 ==========

/** 在主词条下添加子词条 */
const handleAddChild = (name) => {
  const child = wikiData.addChildItem(currentTab.value, openedItem.value.id, name, userProfile.value.name)
  if (child) {
    // 同步更新 openedItem 以便 WikiDetail 即时渲染新子词条
    const parent = dbData.value[currentTab.value].find(i => i.id === openedItem.value.id)
    if (parent) {
      openedItem.value = JSON.parse(JSON.stringify(parent))
    }
  }
}

/** 保存子词条正文 */
const handleSaveChildWiki = (childId, wiki) => {
  const updated = wikiData.updateChildWiki(currentTab.value, openedItem.value.id, childId, wiki)
  if (updated) {
    // 同步更新 openedItem
    const parent = dbData.value[currentTab.value].find(i => i.id === openedItem.value.id)
    if (parent) {
      openedItem.value = JSON.parse(JSON.stringify(parent))
    }
    alert('子词条内容已保存')
  }
}

/** 删除子词条 */
const handleDeleteChild = (childId) => {
  wikiData.deleteChildItem(currentTab.value, openedItem.value.id, childId)
  // 同步更新 openedItem
  const parent = dbData.value[currentTab.value].find(i => i.id === openedItem.value.id)
  if (parent) {
    openedItem.value = JSON.parse(JSON.stringify(parent))
  }
}

// ========== 用户操作 ==========

const handleProfileUpdate = (updatedData) => {
  const oldName = userProfile.value.name
  updateProfile(updatedData)
  syncCreatorName(oldName, updatedData.name)
}
</script>

<style scoped>
.app-container {
  display: flex; flex-direction: column; height: 100vh; height: 100dvh; width: 100vw;
  background-color: var(--color-bg-primary); color: var(--color-text-primary);
  font-family: var(--font-system); overflow: hidden; user-select: none;
}
.main-content { flex: 1; position: relative; overflow: hidden; }
.modal-input {
  width: 100%; border: 1px solid var(--color-border);
  background: var(--color-bg-modal); border-radius: var(--radius-md);
  padding: 10px 12px; box-sizing: border-box; font-size: 14px;
}
.cancel-btn { background: var(--color-border-light); color: #515154; border: none; padding: 9px 18px; border-radius: var(--radius-md); font-size: 14px; font-weight: 500; cursor: pointer; }
.save-btn   { background: var(--color-accent); color: white; border: none; padding: 9px 18px; border-radius: var(--radius-md); font-size: 14px; font-weight: 500; cursor: pointer; }

/* ===== 页面叠层容器 ===== */
.page-stack {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* ===== 面板卡片（叠层切换，禁止 Layout 属性动画） ===== */
.page-sheet {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;

  /* GPU 合成层 — 动画不触发 Layout/Paint */
  will-change: transform, opacity;
  backface-visibility: hidden;
  perspective: 1000px;

  /* 接近 iOS 惯性的非线性曲线，持续 360ms */
  transition: transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1.0),
              opacity   0.36s cubic-bezier(0.2, 0.8, 0.2, 1.0);
}

/* ---- 主面板（列表 / 我的）：默认和离开态一致，避免归位闪烁 ---- */
.primary-sheet {
  transform: translateY(-18px);
  opacity: 0;
}
.primary-sheet.sheet-active {
  transform: translateY(0);
  opacity: 1;
}
.primary-sheet.sheet-leave {
  transform: translateY(-18px);
  opacity: 0;
}

/* ---- 详情面板：默认右移隐藏，进入时左滑入，离开时右滑出 ---- */
.detail-sheet {
  transform: translateX(100%);
  opacity: 1;
  z-index: 1;
}
.detail-sheet.sheet-active {
  transform: translateX(0);
}
.detail-sheet.sheet-leave {
  transform: translateX(30px);
  opacity: 0;
}

/* ===== 主面板内容切换动画（tab 切换时重建，触发 enter 动画） ===== */
.sheet-body {
  min-height: 100%;
  animation: bodyEnter 0.36s cubic-bezier(0.2, 0.8, 0.2, 1.0);
}

@keyframes bodyEnter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
