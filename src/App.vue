<!--
  根组件 — 登录闸门 + 全局状态管理与页面调度
  未登录：只渲染 AuthView（本地账号注册/登录门）
  已登录：条件渲染 SplashScreen / 记录列表 / 详情面板 / 我的浮层
  2026-11-21 单层记录重构：底栏只剩「记录 / 王冠」，「我的」改为右上角按钮呼出的浮层
-->
<template>
  <div class="app-container" :data-remind="reminderOn">
    <!-- 未登录：本地账号门（注册 / 登录） -->
    <AuthView v-if="!loggedIn" @authed="handleAuthed" />

    <!-- 已登录：原有界面整块包裹（未登录时不渲染任何业务页面） -->
    <template v-else>
      <!-- 开屏动画 -->
      <SplashScreen v-if="isSplashActive" @close="isSplashActive = false" />

      <!-- 常驻提示条（I15 存储没存上 / I14 该导备份了） -->
      <NoticeBar v-if="notice" :notice="notice" @action="handleNoticeAction" />

      <!-- 顶部栏：左「我的」+ 搜索框（只在记录页、且没打开详情时显示） -->
      <AppHeader
        v-if="currentTab === 'record' && !openedItem"
        :modelValue="searchQuery"
        @update:modelValue="(v) => searchQuery = v"
        @mine="openMine"
      />

      <!-- 主内容区（页面叠层，动画只操作 transform + opacity） -->
      <div class="main-content">
        <!-- 王冠 AI 伙伴（全屏聊天界面）：从右侧推入；记录页与底栏同时左移让位 -->
        <Transition name="crown-pane">
          <ChatView v-if="currentTab === 'crown'" @back="handleCrownBack" />
        </Transition>

        <!-- 记录叠层：**常驻**。切王冠时靠位移离场，不能 v-if 卸载 —— 卸载了就播不了离场动画 -->
        <div class="page-stack" :class="{ 'is-pushed': currentTab === 'crown' }">

          <!-- 主面板：记录列表 -->
          <div class="page-sheet primary-sheet" :class="pageClass('primary')">
            <div :key="primaryKey" class="sheet-body">
              <template v-if="!openedItem">
                <!-- 添加：搜索框下占满一行 -->
                <AddRecordBar @add="handleCreateRecord" />

                <WikiList
                  :items="filteredItems"
                  :emptyHint="emptyHint"
                  @open-item="(item) => openDetail(item)"
                  @delete-item="(id) => handleDelete(id)"
                />
              </template>
            </div>
          </div>

          <!-- 详情面板（记录详情，独立 sheet 做滑入滑出） -->
          <div class="page-sheet detail-sheet" :class="pageClass('detail')">
            <WikiDetail
              v-if="openedItem"
              :key="'detail-' + openedItem.id"
              :openedItem="openedItem"
              @close="closeDetailAndCleanup"
              @rename="handleRename"
              @save-body="handleSaveBody"
              @add-child="handleAddChild"
              @save-child="handleSaveChildWiki"
              @delete-child="handleDeleteChild"
            />
          </div>

        </div>

        <!-- 「我的」浮层：放在主内容区内，天然不盖顶栏与底栏，左侧露出记录页一小条 -->
        <MineSheet
          v-if="mineOpen"
          :userProfile="userProfile"
          :records="records"
          @close="closeMine"
          @save-profile="handleProfileUpdate"
        />
      </div>

      <!-- 底部导航栏：常驻。切王冠随记录页一同左滑出、开「我的」时下沉；
           只有进详情页才真正卸载（详情页是叠层，底栏本来就该被盖住） -->
      <BottomNav
        v-if="!openedItem"
        v-model="currentTab"
        :pushed="currentTab === 'crown'"
        :sunk="mineOpen"
        :crownReady="crownReady"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

// 组件积木
import SplashScreen from './components/common/SplashScreen.vue'
import NoticeBar    from './components/common/NoticeBar.vue'
import AppHeader    from './components/layout/AppHeader.vue'
import BottomNav    from './components/layout/BottomNav.vue'
import AddRecordBar from './components/wiki/AddRecordBar.vue'
import WikiList     from './components/wiki/WikiList.vue'
import WikiDetail   from './components/wiki/WikiDetail.vue'
import MineSheet    from './components/user/MineSheet.vue'
import ChatView     from './components/crown/ChatView.vue'
import AuthView     from './components/user/AuthView.vue'

// 逻辑积木
import { useUserProfile } from './composables/useUserProfile'
import { useRecords }     from './composables/useRecords'
import { usePageRouter }  from './composables/usePageRouter'
import { readLastTab, writeLastTab } from './composables/useLastTab'
import { startProactiveTrigger } from './composables/useProactiveTrigger'
import { useChat } from './composables/useChat'
import { useAIConfig } from './composables/useApiKey'
import { isLoggedIn, reloadApp } from './composables/useAccount'
import { lastExportAt } from './composables/useBackup'
import { useStorageHealth, formatMB } from './utils/storageHealth'
import { shouldRemind, reminderText, snoozeUntilTomorrow } from './utils/backupReminder'
import { scopeKey } from './utils/storageScope'

// 配置常量
import { TAB_NAMES, STORAGE_KEYS } from './constants/categories'

// ========== 登录闸门 ==========
// 未登录 → 只渲染 AuthView；登录/注册成功后整页重载，
// 让所有业务 composable 的存储键在 boot 时按新账号重新解析（见 utils/storageScope.js）
const loggedIn = ref(isLoggedIn())

const handleAuthed = () => {
  loggedIn.value = true
  reloadApp() // 重载失败（如测试环境）时前面那行保证界面能进
}

// ========== 状态 ==========
const { userProfile, updateProfile } = useUserProfile()
const recordsApi = useRecords()
const { records } = recordsApi
const { syncCreatorName } = recordsApi

// 首屏 Tab（I03）：首次进来 → 王冠；之后 → 你上次待的地方
const startTab       = readLastTab()
const currentTab     = ref(startTab)
// 王冠为全屏界面（隐藏底栏），进入前先记住来源 Tab，左上角返回按钮据此决定回哪
const lastNonCrownTab = ref('record')
watch(currentTab, (val, oldVal) => {
  if (val === 'crown' && oldVal && oldVal !== 'crown') lastNonCrownTab.value = oldVal
  writeLastTab(val)
  mineOpen.value = false // 切 Tab 时收起「我的」，避免它盖在另一个页面上
})
// 搜索词（单层记录后只有一个搜索框）
const searchQuery = ref('')
// 「我的」浮层
const mineOpen = ref(false)

// 王冠图标「就绪」状态：配过可用密钥 → 底栏那颗王冠点亮成金。
// 只读不写，写密钥的地方在 AI 设置里；这里跟着 storage 的 ref 走。
const { config: aiConfig } = useAIConfig()
const crownReady = computed(() => !!aiConfig.value?.apiKey)
// 开屏只在「首屏不是王冠」时播（I03 决定 b）
const isSplashActive = ref(startTab !== 'crown')
// 刚由「添加」创建、还没写任何内容的记录 id：返回时若仍为空就自动清掉
const pendingNewId = ref(null)

// 页面路由（详情打开/关闭 + 动画状态机）
const { openedItem, primaryKey, pageClass, openDetail, closeDetail } = usePageRouter(currentTab)

// ========== 计算属性 ==========
// 昵称统一走这里取值：档案还没建好时给空串，避免模板里直接 .name 崩掉
const profileName = computed(() => (userProfile.value && userProfile.value.name) || '')

const filteredItems = computed(() => {
  return recordsApi.searchRecords(searchQuery.value)
})

// 空列表提示：空库要给引导（整片白比空列表更让人不知道下一步），
// 「搜不到」必须说清是筛出来的空，否则用户会以为数据丢了。
const emptyHint = computed(() => {
  if (searchQuery.value.trim()) return '没搜到相关记录，换个词试试'
  return '还没有记录。随手记一条，王冠也会替你记。'
})

// ========== 常驻提示条（I15 存储写失败 / I14 该导备份了）==========
const { failures: storageFailures, usage: storageUsage, refreshUsage } = useStorageHealth()
const { messages: chatMessages } = useChat()
const noticeCollapsed = ref(false)   // 只能暂时收起（本次会话）；永久消失的提醒等于没有
const reminderOn     = ref(false)
const reminderDismissed = ref(false)
const reminderInfo   = ref(null)

/** 本机「有东西可丢」吗：有记录，或真的聊过天（只有欢迎语不算） */
const hasAnyData = computed(() => {
  return (records.value || []).length > 0 || (chatMessages.value || []).length > 1
})

/** 「今天先不提醒」的到期时刻（按账号隔离，走 scopeKey） */
function readSnooze() {
  try {
    return JSON.parse(localStorage.getItem(scopeKey(STORAGE_KEYS.BACKUP_SNOOZE)) || 'null')
  } catch {
    return null
  }
}
function writeSnooze(iso) {
  try {
    localStorage.setItem(scopeKey(STORAGE_KEYS.BACKUP_SNOOZE), JSON.stringify(iso))
  } catch { /* 存不下就算了：最多明天再提醒一次，不许因为存不进这一条而崩掉界面 */ }
}

const notice = computed(() => {
  if (noticeCollapsed.value) return null

  // ① 先报急的：有数据没存上（I15）
  const fail = (storageFailures.value || [])[0]
  if (fail) {
    const u = storageUsage.value || {}
    return {
      kind: 'error',
      icon: 'close',
      title: `「${fail.label}」这次的改动没保存下来`,
      detail: `本机存储满了（已用约 ${formatMB(u.totalBytes)}，上限约 ${formatMB(u.limitBytes)}）。` +
        `先导一份备份把东西带走，再清理不用的内容。`,
      actions: [
        { label: '导出备份', value: 'export', primary: true },
        { label: '清一清图片', value: 'purge' }
      ]
    }
  }

  // ② 再报该做的事：备份提醒（I14）
  if (reminderOn.value && !reminderDismissed.value) {
    const t = reminderText(reminderInfo.value)
    return {
      kind: 'info',
      icon: 'clock',
      title: t.title,
      detail: t.detail,
      actions: [
        { label: '去导出', value: 'export', primary: true },
        { label: '今天先不', value: 'snooze' }
      ]
    }
  }
  return null
})

// ========== 生命周期 ==========
onMounted(() => {
  if (loggedIn.value) startProactiveTrigger()
  // 图片回收的兜底一次（A02 残留②）
  if (loggedIn.value) recordsApi.purgeUnusedImages()
})

// 备份提醒（I14）：判「有没有东西可丢」那一次。
// 为什么不在 onMounted 里判：那一刻可能还没登录（本机账号门挡在前面），也可能库里还空着
// —— 两种情况都会把提醒永久判成 false，之后用户记了一堆东西也不会再提醒。
// 改成盯着 hasAnyData：一旦出现可丢的数据就判一次，判过就不再重复。
const reminderJudged = ref(false)
watch([hasAnyData, loggedIn], ([has, logged]) => {
  if (!has || !logged || reminderJudged.value) return
  reminderJudged.value = true
  const r = shouldRemind({
    lastExportAt: lastExportAt(),
    snoozedUntil: readSnooze(),
    hasData: has
  })
  reminderOn.value = r.remind
  reminderInfo.value = r
  refreshUsage()
}, { immediate: true })

// ========== 操作函数 ==========

/** 「我的」浮层开 / 关 */
function openMine() {
  mineOpen.value = true
}
function closeMine() {
  mineOpen.value = false
}

/** 提示条上的动作（I15 / I14）→ 都去「我的」浮层，备份中心在那儿 */
function handleNoticeAction(value) {
  if (value === 'collapse') { noticeCollapsed.value = true; return }
  if (value === 'export') { openMine(); return }
  if (value === 'snooze') {
    writeSnooze(snoozeUntilTomorrow())
    reminderDismissed.value = true
    return
  }
  if (value === 'purge') {
    Promise.resolve(recordsApi.purgeUnusedImages()).then(() => refreshUsage())
  }
}


/**
 * 点「添加」：立刻建一条空记录并进详情页写标题与正文。
 * 为什么先落库：详情页的所有读写都依赖 openedItem.id 真实存在（子记录、正文保存都是按 id 定位）；
 * 造一个"假条目"要把每个调用点都判空，改动面反而大。
 * 收尾：返回时若标题正文都空，dropIfEmpty 会把它删掉（见 closeDetailAndCleanup）。
 */
function handleCreateRecord() {
  const item = recordsApi.addRecord('', profileName.value)
  pendingNewId.value = item.id
  openDetail(item)
}

/** 返回列表：若是刚建的空记录，先清掉再关面板 */
async function closeDetailAndCleanup() {
  const id = pendingNewId.value
  closeDetail()
  if (id) {
    pendingNewId.value = null
    await recordsApi.dropIfEmpty(id)
  }
}

/** 详情页改名 */
function handleRename(name) {
  const updated = recordsApi.updateRecordName(openedItem.value.id, name)
  if (updated) openedItem.value = JSON.parse(JSON.stringify(updated))
  pendingNewId.value = null // 已经写过标题，不再算"待清理的空记录"
}

/** 详情页保存正文 */
function handleSaveBody(wiki) {
  const updated = recordsApi.updateRecordBody(openedItem.value.id, wiki)
  if (updated) openedItem.value = JSON.parse(JSON.stringify(updated))
  pendingNewId.value = null
}

/** 王冠返回：回到进入王冠之前所在的 Tab（底栏在王冠页隐藏，这是唯一出口） */
const handleCrownBack = () => {
  currentTab.value = lastNonCrownTab.value
}

const handleDelete = (id) => {
  // 2026-11-21：去掉原生 confirm —— 它在 WebView（Capacitor）和部分浏览器里会被直接拦掉，
  // 用户点删除毫无反应。确认动作改成「⋯ → 删除」两步点击，已经够防误触了。
  if (id) recordsApi.deleteRecord(id)
}

// ========== 子记录操作 ==========

/** 在主记录下添加子记录 */
const handleAddChild = (name) => {
  const child = recordsApi.addChild(openedItem.value.id, name, profileName.value)
  if (child) {
    const parent = (records.value || []).find(i => i.id === openedItem.value.id)
    if (parent) openedItem.value = JSON.parse(JSON.stringify(parent))
  }
}

/** 保存子记录正文 */
const handleSaveChildWiki = (childId, wiki) => {
  const updated = recordsApi.updateChildWiki(openedItem.value.id, childId, wiki)
  if (updated) {
    const parent = (records.value || []).find(i => i.id === openedItem.value.id)
    if (parent) openedItem.value = JSON.parse(JSON.stringify(parent))
    alert('子记录内容已保存')
  }
}

/** 删除子记录 */
const handleDeleteChild = (childId) => {
  recordsApi.deleteChild(openedItem.value.id, childId)
  const parent = (records.value || []).find(i => i.id === openedItem.value.id)
  if (parent) openedItem.value = JSON.parse(JSON.stringify(parent))
}

// ========== 用户操作 ==========

const handleProfileUpdate = (updatedData) => {
  if (!userProfile.value) return
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
  position: relative;
  /* 刘海/挖孔机：整块内容从状态栏下沿起算（A10） */
  box-sizing: border-box;
  padding-top: var(--safe-top);
}
.main-content { flex: 1; position: relative; overflow: hidden; }

/* ===== 页面叠层容器 ===== */
.page-stack {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 切王冠时整块左移离场。曲线与时长**必须**和 BottomNav 的 .nav-dock、ChatView 的入场一致
     （0.36s / cubic-bezier(0.2,0.8,0.2,1)），三处任何一处不同，看起来就不是「一同滑出」。 */
  transition: transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity   0.36s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.page-stack.is-pushed {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}

/* ===== 王冠页：从右侧推入 / 向右退出（回程与去程同一路径 = 原路返回） ===== */
.crown-pane-enter-from,
.crown-pane-leave-to { transform: translateX(100%); }
.crown-pane-enter-active,
.crown-pane-leave-active {
  transition: transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1);
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

/* ---- 主面板（记录列表）：默认和离开态一致，避免归位闪烁 ---- */
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
