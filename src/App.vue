<!--
  根组件 — 登录闸门 + 全局状态管理与页面调度
  未登录：只渲染 AuthView（本地账号注册/登录门）
  已登录：条件渲染 SplashScreen / 百科列表 / 详情面板 / 我的页面 / 添加弹窗
  支持主词条-子词条的二级嵌套结构
  通过 composables 集中处理用户档案和百科数据
-->
<template>
  <div class="app-container">
    <!-- 未登录：本地账号门（注册 / 登录） -->
    <AuthView v-if="!loggedIn" @authed="handleAuthed" />

    <!-- 已登录：原有界面整块包裹（未登录时不渲染任何业务页面） -->
    <template v-else>
      <!-- 开屏动画 -->
      <SplashScreen v-if="isSplashActive" @close="isSplashActive = false" />

      <!-- 常驻提示条（I15 存储没存上 / I14 该导备份了）：放在顶栏之上，
           王冠页与百科页都在它下面 —— 这两件事不该只在「我的」页才看得见 -->
      <NoticeBar v-if="notice" :notice="notice" @action="handleNoticeAction" />

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
        <ChatView v-if="currentTab === 'crown'" @back="handleCrownBack" />

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
                :currentUser="profileName"
                :libraryEmpty="categoryEmpty"
                :mineOnly="mineOnly"
                @open-item="(item) => openDetail(item)"
                @delete-item="(id) => handleDelete(id)"
                @ask-starter="handleStarterAsk"
                @open-backup="handleOpenBackup"
                @clear-mine-only="mineOnly = false"
              />
              <MinePage
                v-else-if="currentTab === 'mine'"
                key="mine"
                :userProfile="userProfile"
                :dbData="dbData"
                @jump-category="handleJumpCategory"
                @save-profile="handleProfileUpdate"
              />
            </div>
          </div>

          <!-- 详情面板（主词条详情页，独立 sheet 做滑入滑出） -->
          <div class="page-sheet detail-sheet" :class="pageClass('detail')">
            <WikiDetail
              v-if="openedItem"
              :key="'detail-' + openedItem.id"
              :openedItem="openedItem"
              :currentUser="profileName"
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
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

// 组件积木
import SplashScreen from './components/common/SplashScreen.vue'
import ModalBox     from './components/common/ModalBox.vue'
import NoticeBar    from './components/common/NoticeBar.vue'
import AppHeader    from './components/layout/AppHeader.vue'
import BottomNav    from './components/layout/BottomNav.vue'
import WikiList     from './components/wiki/WikiList.vue'
import WikiDetail   from './components/wiki/WikiDetail.vue'
import MinePage     from './components/user/MinePage.vue'
import ChatView     from './components/crown/ChatView.vue'
import AuthView     from './components/user/AuthView.vue'

// 逻辑积木
import { useUserProfile } from './composables/useUserProfile'
import { useWikiData }    from './composables/useWikiData'
import { usePageRouter }  from './composables/usePageRouter'
import { readLastTab, writeLastTab } from './composables/useLastTab'
import { startProactiveTrigger } from './composables/useProactiveTrigger'
import { useChat } from './composables/useChat'
import { setPendingStarter } from './composables/useStarter'
import { starterQuestion } from './utils/starterJudge'
import { isLoggedIn, reloadApp } from './composables/useAccount'
import { lastExportAt } from './composables/useBackup'
import { useStorageHealth, formatMB } from './utils/storageHealth'
import { shouldRemind, reminderText, snoozeUntilTomorrow } from './utils/backupReminder'
import { scopeKey } from './utils/storageScope'

// 配置常量
import { TAB_ICONS, TAB_NAMES, ALL_CATEGORIES, STORAGE_KEYS } from './constants/categories'

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
const wikiData = useWikiData()
const { dbData } = wikiData
const { syncCreatorName } = wikiData

// 首屏 Tab（I03）：首次进来 → 王冠；之后 → 你上次待的地方（见 composables/useLastTab.js）
const startTab       = readLastTab()
const currentTab     = ref(startTab)
// 王冠为全屏界面（隐藏底栏），进入前先记住来源 Tab，左上角返回按钮据此决定回哪
// 首屏就是王冠时这里是初值 'game'：从首屏点返回，落到百科（王冠页没有底栏，返回是唯一出口）
const lastNonCrownTab = ref('game')
// 「只看我创建的」（2026-10-11「我的」页 B 档）：只有从「我的」点分类数字跳过来才带上；
// 手动切 Tab 一律回到全量 —— 否则用户切走了还带着筛选，会莫名其妙少东西。
const mineOnly = ref(false)
let jumpMineOnly = false
watch(currentTab, (val, oldVal) => {
  if (val === 'crown' && oldVal && oldVal !== 'crown') lastNonCrownTab.value = oldVal
  writeLastTab(val)
  if (val !== oldVal) {
    mineOnly.value = jumpMineOnly
    jumpMineOnly = false
  }
})
const searchQueries  = ref({ game: '', note: '', life: '' })
// 开屏只在「首屏不是王冠」时播（I03 决定 b）：首屏是王冠时，开场交给「灯醒」入场动画。
// 两个都是开场动画，叠着播的结果是开屏 2000ms 把灯醒的前 2 秒全盖住 —— 灯醒 quick 档才 800ms，等于白播。
// 用 startTab 而不是 currentTab 判断：进过王冠再切走，不该把开屏又放出来。
const isSplashActive = ref(startTab !== 'crown')
const showAddModal   = ref(false)
const newItemName    = ref('')

// 页面路由（详情打开/关闭 + 动画状态机）
const { openedItem, primaryKey, pageClass, openDetail, closeDetail } = usePageRouter(currentTab)

// ========== 计算属性 ==========
// 昵称统一走这里取值：档案还没建好时给空串，避免模板里直接 .name 崩掉
// （2026-10-10 真浏览器验收抓到过一次 Cannot read properties of null (reading 'name')）
const profileName = computed(() => (userProfile.value && userProfile.value.name) || '')

const isContentTab   = computed(() => ALL_CATEGORIES.includes(currentTab.value))
const currentTabName = computed(() => TAB_NAMES[currentTab.value] || '')
const currentTabIcon = computed(() => TAB_ICONS[currentTab.value] || '')

const filteredItems = computed(() => {
  const list = wikiData.searchItems(currentTab.value, searchQueries.value[currentTab.value])
  // 只看我创建的：搜索之后再过一道，与「我的」页那个数字入口保持一致（数字是几条，点进去就该看到几条）
  if (!mineOnly.value) return list
  return list.filter(item => item.creator === profileName.value)
})

// 空库开局（I04）：这个分类一条都没有。必须与「搜索过滤后为空」分开 ——
// 后者用户明明有一堆条目，弹开局卡片是错的（见 wiki/WikiList.vue 的 v-else-if）
const categoryEmpty = computed(() => (dbData.value[currentTab.value] || []).length === 0)

// ========== 常驻提示条（I15 存储写失败 / I14 该导备份了）==========
// 两件事共用一个条：谁更急谁上（存储写失败 > 导出提醒）—— 三个条叠在顶端会互相打架
const { failures: storageFailures, usage: storageUsage, refreshUsage } = useStorageHealth()
const { messages: chatMessages } = useChat()
const noticeCollapsed = ref(false)   // 只能暂时收起（本次会话）；永久消失的提醒等于没有
const reminderOn     = ref(false)
const reminderDismissed = ref(false)
const reminderInfo   = ref(null)

/** 本机「有东西可丢」吗：百科有任意条目，或真的聊过天（只有欢迎语不算） */
const hasAnyData = computed(() => {
  const d = dbData.value || {}
  const wikiCount = ALL_CATEGORIES.reduce((n, c) => n + ((d[c] || []).length), 0)
  return wikiCount > 0 || (chatMessages.value || []).length > 1
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
// 王冠主动开口的触发点（I02）：挂在 app 上而不是王冠页上 —— 首屏可能是用户上次停留的 Tab，
// 那时王冠页没挂载，"打开 app 那一刻王冠已经先开过口"就不成立。
// 未登录不启动：登录成功后是整页重载，那时会以已登录的身份重新走到这里。
onMounted(() => {
  if (loggedIn.value) startProactiveTrigger()
  // 图片回收的兜底一次（A02 残留②）：导入不触发回收，「正文里删掉一张图」也要等到某个删除动作才顺带扫。
  // 放启动时是**唯一没有草稿态**的时刻 —— 编辑器里刚插进去、还没保存的图，
  // 若挂在「随便哪次保存之后」扫一遍就会被当孤儿删掉（这也是它没挂在保存路径上的原因）。
  // 闸门（当前/其它账号数据读得出来）在 purgeUnusedImages 内部，读不全就不清。
  if (loggedIn.value) wikiData.purgeUnusedImages()

  // 备份提醒（I14）：只在「打开 app 那一刻」判一次。
  // 纯前端没有后台，做不到到点自己冒出来（I05 已认下的天花板）—— 与王冠主动开口同款时机。
  // 判据在 utils/backupReminder.js（纯函数，可单测）：空库不催、刚导过不催、点了"今天先不"只压到次日 0 点。
  if (loggedIn.value) {
    const r = shouldRemind({
      lastExportAt: lastExportAt(),
      snoozedUntil: readSnooze(),
      hasData: hasAnyData.value
    })
    reminderOn.value = r.remind
    reminderInfo.value = r
    refreshUsage() // 顺带体检一次：提示条一出现就要能报出"用了几 MB"
  }
})

// ========== 操作函数 ==========

/**
 * 空库开局（I04）：点卡片 = 让王冠先问一句，并记下「这一轮在等哪个分类的回答」。
 * 回答在王冠页的输入框里打出来，那句话由 ChatView 顺手落成该分类的第一条词条（见 composables/useStarter.js）。
 * 为什么不就地开个表单：这个产品的差别化就是「它替我记得」，不是「我自己填表」——
 * 空列表应该是一次对话的开头，而不是一个空表单。
 */
function handleStarterAsk(tab) {
  const q = starterQuestion(tab)
  if (!q) return
  setPendingStarter(tab)
  const { addReply } = useChat()
  addReply(q)                 // 王冠先开口：用户看到的是「它在问我」
  currentTab.value = 'crown'  // 切到王冠（切 Tab 会写 LAST_TAB，沿用 I03 的记忆口径）
}

/** 开局那行「换手机了？从旧手机带进来」→ 去「我的」（备份中心在那儿） */
function handleOpenBackup() {
  currentTab.value = 'mine'
}

/**
 * 提示条上的动作（I15 / I14）。
 * 「导出备份」「今天先不」都跳「我的」页：备份中心就在那儿，体积闸门和结果提示都在那边，
 * 不在这里再抄一份导出逻辑（抄一份 = 两处口径，早晚走偏）。
 */
function handleNoticeAction(value) {
  if (value === 'collapse') { noticeCollapsed.value = true; return }
  if (value === 'export') { handleOpenBackup(); return }
  if (value === 'snooze') {
    writeSnooze(snoozeUntilTomorrow())
    reminderDismissed.value = true
    return
  }
  if (value === 'purge') {
    // 清掉没人引用的图片（A02 的积木，自带"读不全就不清"的双闸门），清完立刻重新体检
    Promise.resolve(wikiData.purgeUnusedImages()).then(() => refreshUsage())
  }
}

/**
 * 「我的」页点分类数字 → 跳到该分类，并只看我创建的（2026-10-11「我的」页 B 档）
 * 跳过去先清掉那个 Tab 里残留的搜索词：不清的话可能落进「没搜到」的空列表，
 * 用户会以为自己那些条目丢了。
 */
function handleJumpCategory(cat) {
  if (!ALL_CATEGORIES.includes(cat)) return
  searchQueries.value[cat] = ''
  jumpMineOnly = true
  currentTab.value = cat
}

/** 王冠返回：回到进入王冠之前所在的 Tab（底栏在王冠页隐藏，这是唯一出口） */
const handleCrownBack = () => {
  currentTab.value = lastNonCrownTab.value
}

const openAddModal = () => {
  newItemName.value = ''
  showAddModal.value = true
}

const handleAddItem = () => {
  if (!newItemName.value.trim()) return alert('名称不能为空')
  wikiData.addItem(currentTab.value, newItemName.value, profileName.value)
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
  const child = wikiData.addChildItem(currentTab.value, openedItem.value.id, name, profileName.value)
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
  /* 刘海/挖孔机：整块内容从状态栏下沿起算（A10）。
     加在容器上而不是各页顶部栏上 —— 顶部栏散在 AppHeader / 详情页 / 子词条编辑器 /
     王冠聊天好几处，逐处加必漏一处；这里一处全盖住。
     box-sizing 必须有：不改的话 100dvh 是内容高度，再叠 padding-top 会整体溢出，
     把底部导航挤出屏幕。非刘海机 --safe-top 为 0px，视觉零变化。 */
  box-sizing: border-box;
  padding-top: var(--safe-top);
}
.main-content { flex: 1; position: relative; overflow: hidden; }
/* 弹窗里的输入框形状与动作键 44 高由 common/ModalBox.vue 收口（2026-10-29 统一样式层），
   这里只留颜色。App 曾把形状手抄一遍，与 ModalBox 存在两份真相、改动必漏一处。 */
.cancel-btn { background: var(--color-border-light); color: var(--color-text-neutral); }
.save-btn   { background: var(--color-accent); color: var(--color-text-on-accent); }

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
