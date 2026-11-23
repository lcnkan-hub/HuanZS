<!--
  根组件 — 登录闸门 + 全局状态管理与页面调度
  未登录：只渲染 AuthView（本地账号注册/登录门）
  已登录：条件渲染 SplashScreen / 记录列表 / 详情面板 / 我的浮层
  2026-11-21 单层记录重构：底栏只剩「记录 / 王冠」，「我的」改为右上角按钮呼出的浮层
-->
<template>
  <div class="app-container">
    <!-- 未登录：本地账号门（注册 / 登录） -->
    <AuthView v-if="!loggedIn" @authed="handleAuthed" />

    <!-- 已登录：原有界面整块包裹（未登录时不渲染任何业务页面） -->
    <template v-else>
      <!-- 开屏动画 -->
      <SplashScreen v-if="isSplashActive" @close="isSplashActive = false" />

      <!-- 常驻提示条（只剩 I15：存储没存上） -->
      <NoticeBar v-if="notice" :notice="notice" @action="handleNoticeAction" />

      <!-- 顶部栏：左「我的」+ 搜索框。
           切王冠时**常驻不卸载**，只淡出 —— 以前用 v-if 硬切，切页瞬间它从布局里消失，
           主内容区立刻多出 var(--header-height) 的高度，内容整体上跳一下：那一下比任何
           过渡动画都生硬。保留占位 + 不可点，布局就稳了（王冠 fixed 全屏会盖住它）。
           但**详情页要真删**：详情页是叠层全屏，透明占位会在顶部留 56px 空白（已实测踩到）。 -->
      <AppHeader
        v-if="!openedItem"
        :class="{ 'is-offstage': currentTab !== 'record' }"
        :modelValue="searchQuery"
        @update:modelValue="(v) => searchQuery = v"
        @mine="openMine"
      />

      <!-- 主内容区（页面叠层，动画只操作 transform + opacity） -->
      <div class="main-content">
        <!-- 王冠 AI 伙伴（全屏聊天界面）：从右侧推入；记录页与底栏同时左移让位 -->
        <Transition name="crown-pane">
          <ChatView v-if="currentTab === 'crown'" />
        </Transition>

        <!-- 记录叠层：**常驻**。切王冠时靠位移离场，不能 v-if 卸载 —— 卸载了就播不了离场动画 -->
        <div class="page-stack" :class="{ 'is-pushed': currentTab === 'crown' }">

          <!-- 主面板：记录列表 -->
          <div class="page-sheet primary-sheet" :class="pageClass('primary')">
            <!-- ⚠ 这里**不许加 `:key`、也不许加 `v-if`**（2026-11-23 拆掉 key 后立的规矩）：
                 两者都会让整块列表重建 —— 卡片重新挂载、入场动画集体重播
                 （按 (序号 × 70ms) 排队，记录越多越夸张），而重播期间 CSS 动画的优先级
                 高过逐卡淡出写的内联 opacity，于是"已经淡到透明的卡会先亮一次再淡回去"。
                 历史上这个坑踩了两次：详情页的 v-if 一次、切王冠时的 :key 一次
                 （后者原本是给"4 个平级内容 Tab 切页重播"用的，现在底栏只剩记录/王冠，
                 王冠还是全屏叠层页、记录页根本没换内容，那套 key 早就是误伤）。
                 要藏就藏动画，别拆 DOM。 -->
            <div class="sheet-body">
              <!-- 添加：搜索框下占满一行 -->
              <AddRecordBar @add="handleCreateRecord" />

              <WikiList
                :items="filteredItems"
                :emptyHint="emptyHint"
                @open-item="handleOpenItem"
                @delete-item="(id) => handleDelete(id)"
              />
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
              @delete="handleDeleteFromDetail"
              @add-pic="handleAddPic"
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
          @open-item="handleOpenFromFavorites"
        />
      </div>

      <!-- 底部导航栏：**常驻**（2026-11-23 起王冠页也不退场）。
           切王冠时整屏只有内容在动，浮岛原地待着 —— 按 HIG · Motion「视觉运动要被限制在
           一个不动的区域里，整个画面都在动会让人不适」，它是这一屏唯一的不动参照；
           而且常驻之后"记录"那颗就是回记录页的路，王冠页左上角那个返回键因此删掉。
           两种离场只剩一种：开「我的」/ 键盘弹起时下沉（sunk）。
           只有进详情页才真正卸载（详情页是叠层，底栏本来就该被盖住） -->
      <BottomNav
        v-if="!openedItem"
        v-model="currentTab"
        :sunk="mineOpen || (kbOpen && currentTab === 'crown')"
        :crownReady="crownReady"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'

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
import { useAIConfig } from './composables/useApiKey'
import { isLoggedIn, reloadApp } from './composables/useAccount'
import { useKeyboard } from './composables/useKeyboard'
import { useCardZoom } from './composables/useCardZoom'
import { readCardRects, readDetailRects, cardTextHtml } from './utils/cardZoomRects'
import { useStorageHealth, formatMB } from './utils/storageHealth'

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
watch(currentTab, (val) => {
  writeLastTab(val)
  mineOpen.value = false // 切 Tab 时收起「我的」，避免它盖在另一个页面上
})
// 键盘开合（软键盘弹起时，王冠页的导航浮岛要下沉让位给输入栏）
const { kbOpen } = useKeyboard()
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
const { openedItem, pageClass, openDetail, closeDetail } = usePageRouter(currentTab)

// 卡片 → 详情 的共享元素转场（2026-11-23）
const zoom = useCardZoom()

/**
 * 点卡片打开详情。
 *
 * 顺序不能反：**先记下卡片的矩形**（打开后列表会淡出、布局也会变），再 openDetail，
 * 等两帧让详情挂载、让 header 卸载带来的高度变化稳定下来，最后才量目标矩形。
 * 拿早了的矩形会让白块飞到半路「二次长大」（实测踩过：early 量到 y=316 的目标）。
 */
async function handleOpenItem(item, cardEl) {
  const src = readCardRects(cardEl)
  const textHtml = cardTextHtml(cardEl)
  const photoUrl = cardEl?.querySelector('.card-cover img')?.src || ''

  openDetail(item)
  await nextTick()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  const dst = readDetailRects(document.querySelector('.detail-sheet'))
  // 量不到（卡片没图 / 目标还没渲染完）→ 不做动画，详情页自己在那儿，不跳也不丢内容
  if (!src || !dst) return

  await zoom.open({
    src,
    dst,
    photoUrl,
    textHtml,
    textTo: dst.textTo,
    inner: dst.inner,
    header: dst.header,
    bar: dst.bar
  })
}

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

// ========== 常驻提示条（只剩 I15 存储写失败）==========
// 2026-11-22 用户要求去掉导出提醒（「你还没导出过备份」），他之后会在别处重做 ——
// 这次只从界面撤掉，utils/backupReminder.js 与它的测试原样留着，别处还要用。
const { failures: storageFailures, usage: storageUsage, refreshUsage } = useStorageHealth()
const noticeCollapsed = ref(false)   // 只能暂时收起（本次会话）

const notice = computed(() => {
  if (noticeCollapsed.value) return null

  // 有数据没存上（I15）
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
  return null
})

// ========== 生命周期 ==========
onMounted(() => {
  if (loggedIn.value) startProactiveTrigger()
  // 图片回收的兜底一次（A02 残留②）
  if (loggedIn.value) recordsApi.purgeUnusedImages()
})

// ========== 操作函数 ==========

/** 「我的」浮层开 / 关 */
function openMine() {
  mineOpen.value = true
}
function closeMine() {
  mineOpen.value = false
}

/**
 * 「我的」里点了一条收藏的记录：先关浮层再打开详情。
 * 顺序不能反 —— 详情是记录页的叠层，浮层还开着会压在它上面。
 */
function handleOpenFromFavorites(item) {
  if (!item) return
  closeMine()
  openDetail(item)
}

/** 提示条上的动作（I15）→ 去「我的」浮层，备份中心在那儿 */
function handleNoticeAction(value) {
  if (value === 'collapse') { noticeCollapsed.value = true; return }
  if (value === 'export') { openMine(); return }
  if (value === 'purge') {
    Promise.resolve(recordsApi.purgeUnusedImages()).then(() => refreshUsage())
  }
}


/**
 * 点「记录」新建：**从那条横条本身长出来**，返回时也收回横条（2026-11-23）。
 *
 * 两件事要一起说清：
 * 1. **为什么先落库**：详情页的所有读写都依赖 openedItem.id 真实存在（正文保存、图片都是按 id 定位）；
 *    造一个"假条目"要把每个调用点都判空，改动面反而大。返回时若标题正文图片全空，
 *    dropIfEmpty 会把它删掉（见 closeDetailAndCleanup）。
 * 2. **为什么起点是横条**：新建的记录没有「用户点的那张卡」——列表里刚插进去的那张还是空的，
 *    而且返回时马上会被回收。用横条当起点，进出才对称：从哪儿发起，就回哪儿去。
 */
async function handleCreateRecord() {
  const barEl = document.querySelector('.add-bar')
  const src = readCardRects(barEl)

  const item = recordsApi.addRecord('', profileName.value)
  pendingNewId.value = item.id
  openDetail(item)

  await nextTick()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const dst = readDetailRects(document.querySelector('.detail-sheet'))
  if (!src || !dst) return        // 量不到就让它直接出现，不硬跑一个没起点的动画

  await zoom.open({
    src,
    dst,
    photoUrl: '',
    textHtml: '',
    inner: dst.inner,
    header: dst.header,
    bar: dst.bar
  })
}

/** 返回列表：先把详情缩回那张卡，再关；空记录在关完之后回收 */
async function closeDetailAndCleanup() {
  // 2026-11-22 用户明确要求「任何记录，只要标题正文都空了，返回就删」——
  // 原来只清 pendingNewId（刚点「记录」新建的那条），老记录被清空后会留一张「未命名」空卡。
  // dropIfEmpty 现在把 pics 也算内容：只有图没有字的记录不算空，不会被误删。
  const openedId = openedItem.value && openedItem.value.id
  // 刚点「记录」建的那条：它是从横条长出来的，收也要收回横条（那张卡马上会被删掉）
  const returnToBar = !!pendingNewId.value && pendingNewId.value === openedId
  const id = openedId || pendingNewId.value
  pendingNewId.value = null
  await closeWithZoom(returnToBar)
  closeDetail()
  // 内联的 transform/opacity 必须等 closeDetail 之后再摘：
  // 摘早了 primary 会先掉回 sheet-leave（opacity 0）闪一下，才被 sheet-active 接住。
  const primary = document.querySelector('.primary-sheet')
  if (primary) {
    primary.style.removeProperty('transition')
    primary.style.removeProperty('opacity')
    primary.style.removeProperty('transform')
  }
  if (id) await recordsApi.dropIfEmpty(id)
}

/**
 * 收起动画（2026-11-23）。
 *
 * 两个细节：
 * 1. **卡片和详情都要重新量**：列表可能滚过、详情可能滚过，用打开时的旧矩形会缩到错的落点。
 * 2. **列表要先显形**：详情打开期间列表是 `sheet-leave`（opacity 0），不先恢复的话，
 *    东西会「飞回一片空白」。这里临时压掉它的 transition 直接显形，收完再交还给它自己。
 */
async function closeWithZoom(returnToBar = false) {
  const sheetEl = document.querySelector('.detail-sheet')
  const id = openedItem.value && openedItem.value.id
  if (!sheetEl || !id) return false

  /**
   * 先让列表显形 + 归位，再量落点。
   * 详情打开期间列表是 `sheet-leave`（opacity 0 + translateY(-18px)），
   * 照那个状态量出来的位置比真实落点高 18px —— 收完它才归位，壳就缩歪了。
   */
  const primary = document.querySelector('.primary-sheet')
  if (primary) {
    primary.style.transition = 'none'
    primary.style.opacity = '1'
    primary.style.transform = 'none'
  }
  await new Promise((r) => requestAnimationFrame(r))

  const cardEl = [...document.querySelectorAll('.data-card')].find((el) => el.dataset.id === id)
  /**
   * 落点：新建的空记录收回「记录」横条，老记录收回它自己的卡。
   * 收回那张空卡的话，卡缩到一半就被 dropIfEmpty 删掉 —— 用户看到的是
   * 「东西缩进一个随即消失的位置」，像是没落点（2026-11-23 反馈）。
   */
  const originEl = returnToBar ? document.querySelector('.add-bar') : cardEl
  const src = readCardRects(originEl)
  const dst = readDetailRects(sheetEl)
  if (!src || !dst) return false     // 卡片已滚出视口 / 已删除 → 没有落点，直接关

  /**
   * 顶栏补偿：详情打开时顶栏被卸载、主内容区占满整屏；收完之后顶栏挂回来、
   * 整个主内容下移 `--header-height`。落点不补这 55px，壳会缩到屏幕上方
   * （实测：横条真实 top=69，量到 -4，差的 73 = 退后的 18 + 顶栏的 55）。
   * 底栏是 fixed 浮岛、不占流，不用补。
   */
  const chromeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0
  for (const key of ['sheet', 'photo', 'text']) {
    if (src[key]) src[key].t += chromeTop
  }

  await zoom.close({
    src,
    dst,
    photoUrl: cardEl?.querySelector('.card-cover img')?.src || '',
    textHtml: cardTextHtml(cardEl),
    textTo: dst.textTo,
    inner: dst.inner,
    header: dst.header,
    bar: dst.bar
  })
  return true
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

/**
 * 详情页加了一张图（图片附件化）：追加到 pics 末尾。
 * 图本身已经在 IndexedDB（ItemBodyEditor 存好才 emit），这里只负责把 id 记到记录上。
 */
function handleAddPic(imgId) {
  if (!imgId) return
  const item = openedItem.value
  if (!item) return
  const next = [...(Array.isArray(item.pics) ? item.pics : []), imgId]
  const updated = recordsApi.updateRecordPics(item.id, next)
  if (updated) openedItem.value = JSON.parse(JSON.stringify(updated))
  pendingNewId.value = null // 有内容了，不再算"待清理的空记录"
}

const handleDelete = (id) => {
  // 2026-11-21：去掉原生 confirm —— 它在 WebView（Capacitor）和部分浏览器里会被直接拦掉，
  // 用户点删除毫无反应。确认动作改成「⋯ → 删除」两步点击，已经够防误触了。
  if (id) recordsApi.deleteRecord(id)
}

/**
 * 详情页里的「删除」（2026-11-22 新增链路）。
 * 跟列表卡片的删除是同一个动作，区别是删完必须把详情页关掉 ——
 * 否则用户会停在一个已经不存在的数据上，往它里面打字会写进虚空。
 */
const handleDeleteFromDetail = (id) => {
  if (!id) return
  handleDelete(id)
  closeDetail()
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
  /* 切王冠 = 记录页「退后一层」，不是「整块离场」。
     依据 Apple HIG · Motion：主页↔王冠是**最高频**的切换，原文要求
     「一般避免给高频 UI 交互加动效」「别让人每次交互都多花时间注意动画」；
     又据 HIG · Materials 的功能层/内容层分层 —— 所以位移量从整整一屏（-100%）
     缩到 10px，改用极小的后退（scale 0.99）表达"它在后面一层"。
     2026-11-22 从 0.36s/100% 改成 0.24s/10px，起因是用户反馈"过渡太生硬"。 */
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity   0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: center center;
}
.page-stack.is-pushed {
  transform: translateX(-10px) scale(0.99);
  opacity: 0;
  pointer-events: none;
}

/* ===== 王冠页：短距推入 + 淡入（不再整屏对穿） =====
   12px 只作为"从右边来"的方向提示，不做位移叙事。 */
.crown-pane-enter-from,
.crown-pane-leave-to {
  transform: translateX(12px);
  opacity: 0;
}
.crown-pane-enter-active,
.crown-pane-leave-active {
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity   0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* 顶部栏退场：只淡不抽高度（抽高度就是 Layout 动画，会抖） */
.is-offstage { opacity: 0; pointer-events: none; }

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

  /* 顶部边缘淡出（--head-fade，14px）：
     顶栏改成"不垫底、不画线"的浮件之后，列表的裁切边裸露在页面底色上了
     （以前被白色栏底盖住，看不见）。这一小段渐变让内容在顶栏下沿化开。
     它必须小：顶栏还在文档流里、内容不从它底下过，给太大就会把第一张卡的首行也吃掉。

     底部**没有蒙版**（2026-11-22 二次修正，用户原话："不应该添加淡出的蒙版，
     看起来是整个底部在淡出而不是卡片淡出"）。原因是手段不合：
     mask 给**整片区域**削一层透明度，一张卡会被切成上半截实、下半截透明；
     而且浮岛玻璃底下也被削空，材质没有内容可透（透色才是材质，削空就只是色板）。
     底部改成**逐卡淡出**：每张卡自己带透明度，滚到浮岛那一段整张变淡，
     屏幕上不存在"一条带"，淡化的主体是卡片本身。见 composables/useCardFade.js。 */
  -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, #000 var(--head-fade));
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, #000 var(--head-fade));
}
.primary-sheet.sheet-active {
  transform: translateY(0);
  opacity: 1;
}
.primary-sheet.sheet-leave {
  transform: translateY(-18px);
  opacity: 0;
}

/* ---- 详情面板：**不再自己滑入**（2026-11-23）
   进场动效交给 useCardZoom（卡片自己长成整屏），这里只负责「在不在」。
   留着 translateX 会跟转场打架：两段位移叠起来像从右上角斜着飞进来。
   量不到矩形时（卡片已滚出视口 / 目标还没渲染）退化成直接出现 —— 没有动画，但不跳。 */
.detail-sheet {
  transform: none;
  opacity: 1;
  z-index: 1;
  /* ⚠ 关键：它不再靠 translateX 藏在屏幕外，而是**一直铺在列表上方**。
     没有这个 pointer-events:none，没打开详情时它会吃掉列表的所有点击
     （实测：elementFromPoint 命中的是 detail-sheet，卡片点不动、长按也弹不出来）。
     打开时由 sheet-active 交还点击。 */
  pointer-events: none;
}
.detail-sheet.sheet-active { pointer-events: auto; }

/* ===== 主面板内容切换动画（tab 切换时重建，触发 enter 动画） ===== */
.sheet-body {
  /* 顶上让出 --head-fade：蒙版的前 14px 是"内容离开屏幕时化开"的过渡带，
     静止时第一块内容（「记录一条」）必须落在它下面，否则它自己的顶边会被抹淡
     —— 那是排版错误不是效果。滚动时内容照样穿过这条带，这正是要的。
     min-height 用 calc(100% - 留白)：本项目没开全局 border-box，
     不扣回来的话短列表会凭空多出 14px 可滚动高度。 */
  padding-top: var(--head-fade);
  min-height: calc(100% - var(--head-fade));
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
