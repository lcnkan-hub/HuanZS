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
                 （按 (序号 × 70ms) 排队，记录越多越夸张）。
                 当年重播还有个更糟的症状：CSS 动画优先级高过内联 `opacity`，
                 会把"已经淡到透明的卡"重新点亮一次（那套逐卡淡出已于 2026-11-24 删除，
                 但规矩不变：重建就是重播）。
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
              @remove-pic="handleRemovePic"
            />
          </div>

        </div>

        <!-- 「我的」浮层：放在主内容区内，天然不盖顶栏与底栏，左侧露出记录页一小条 -->
        <MineSheet
          v-if="mineOpen"
          :class="{ 'theme-deep': isNight }"
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
        :class="{ 'theme-deep': isNight && currentTab === 'crown' }"
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
import { deleteImage }    from './composables/useImageStore'
import { usePageRouter }  from './composables/usePageRouter'
import { readLastTab, writeLastTab } from './composables/useLastTab'
import { startProactiveTrigger } from './composables/useProactiveTrigger'
import { useAIConfig } from './composables/useApiKey'
import { isLoggedIn, reloadApp } from './composables/useAccount'
import { useKeyboard } from './composables/useKeyboard'
// 昼夜判定：记录页/详情页与王冠共用同一个来源（useTimeMode，6:00–18:00 = 昼）
import { useTimeMode } from './composables/useTimeMode'
import { useCardZoom } from './composables/useCardZoom'
import { readCardRects, readDetailRects, cardTextHtml } from './utils/cardZoomRects'
import { useStorageHealth, formatMB } from './utils/storageHealth'

// ========== 登录闸门 ==========
// 未登录 → 只渲染 AuthView；登录/注册成功后整页重载，
// 让所有业务 composable 的存储键在 boot 时按新账号重新解析（见 utils/storageScope.js）
const loggedIn = ref(isLoggedIn())
const timeMode = useTimeMode()   // 返回的就是一个 Ref<'day'|'night'>
const isNight = computed(() => timeMode.value === 'night')

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
  // 空记录的删除放进 closeWithZoom、在跑动画之前执行 —— 见那里的说明：
  // 先收再删会让别的卡在动画结束后整体上移一截，看起来像「卡片跳动」。
  await closeWithZoom(returnToBar, id)
  closeDetail()
  // 内联的 transform/opacity 必须等 closeDetail 之后再摘：
  // 摘早了 primary 会先掉回 sheet-leave（opacity 0）闪一下，才被 sheet-active 接住。
  const primary = document.querySelector('.primary-sheet')
  if (primary) {
    primary.style.removeProperty('transition')
    primary.style.removeProperty('opacity')
    primary.style.removeProperty('transform')
  }
}

/**
 * 收起动画（2026-11-23）。
 *
 * 两个细节：
 * 1. **卡片和详情都要重新量**：列表可能滚过、详情可能滚过，用打开时的旧矩形会缩到错的落点。
 * 2. **列表要先显形**：详情打开期间列表是 `sheet-leave`（opacity 0），不先恢复的话，
 *    东西会「飞回一片空白」。这里临时压掉它的 transition 直接显形，收完再交还给它自己。
 */
async function closeWithZoom(returnToBar = false, dropId = null) {
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
  if (!src || !dst) {
    // 没有落点就跑不了动画，但空记录仍然必须删掉（否则会留一张空卡）
    if (dropId) recordsApi.dropIfEmpty(dropId)
    return false
  }

  // 落点和副本素材都先取下来：下面可能把这条记录删掉，删了 DOM 就没了
  const photoUrl = cardEl?.querySelector('.card-cover img')?.src || ''
  const textHtml = cardTextHtml(cardEl)

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

  /**
   * **空记录先删、再收**（2026-11-23 第二次修「已经记录的卡片跳动」）。
   *
   * 留着它先收再删的话：列表在收起动画一开始就已经显形了，而那张空卡要等动画
   * 结束才消失 —— 它一消失，下面每一张卡都要上移一整张卡的高度，用户看到的是
   * 「别的卡跳了一下」。
   *
   * 而且它本来就没在列表里"出现过"：新建是从横条长出来的，收回也是回横条。
   * 提前删掉等于这一趟没发生过 —— 不 await 是因为数组改动本身是同步的
   * （await 的只是后面的图片回收，那是后台事）。
   */
  if (dropId) recordsApi.dropIfEmpty(dropId)

  await zoom.close({
    src,
    dst,
    photoUrl,
    textHtml,
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

/**
 * 删掉一张图（2026-11-23）。
 *
 * 顺序是有讲究的：**先从 pics 里摘掉、落库，再删 IndexedDB 里那份**。
 * 反过来的话，图已经被删了但记录还指着它 —— 列表封面会先变成一块灰，
 * 要等下一次任何更新才会补回来。
 *
 * `updateRecordPics` 返回更新后的记录，直接拿它换掉 openedItem：
 * 详情页渲染的是**打开时那个快照**，不换，图上就还是"删不掉"。
 */
async function handleRemovePic(index) {
  const item = openedItem.value
  if (!item) return
  const pics = Array.isArray(item.pics) ? [...item.pics] : []
  const imgId = pics[index]
  if (!imgId) return

  pics.splice(index, 1)
  const updated = recordsApi.updateRecordPics(item.id, pics)
  if (updated) openedItem.value = JSON.parse(JSON.stringify(updated))

  try {
    await deleteImage(imgId)
  } catch {
    // 库里那份可能已经不在了 —— 记录侧的引用已经摘掉，这里失败不算错误
  }
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
  background-color: var(--color-bg-primary);
  /* 纸面 + 两团极淡色斑（2026-11-24 轻盈通透方向）。
     不再用 background-attachment: fixed —— 这一层是 100dvh、本身不滚，
     列表在自己的容器里滚，底色天然不动；fixed 在 iOS 上只会白烧一层合成。 */
  background-image: var(--page-canvas-image);
  color: var(--color-text-primary);
  font-family: var(--font-system); overflow: hidden; user-select: none;
  position: relative;
  /* 刘海/挖孔机：整块内容从状态栏下沿起算（A10） */
  box-sizing: border-box;
  padding-top: var(--safe-top);
}
.main-content { flex: 1; position: relative; overflow: hidden; }

/* === 夜间画布（2026-11-24 删除）===
   这里原来在 .is-night 下把 --deep-canvas-* 换成酒红黑 + 玫瑰网格，只服务详情页。
   2026-11-24 详情页也换成纸面之后，这套令牌全库零引用，令牌本身已在 variables.css 删除，
   这里的覆盖也跟着删 —— 留一段指向不存在令牌的 CSS，比没有更糟。
   （要回退深色画布：换纸前那个提交里的 variables.css + 本文件 .is-night 两段一起取回。） */


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
  transition: transform var(--slide-dur) var(--spring-glide),
              opacity   var(--slide-dur) var(--spring-glide);
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
  transition: transform var(--slide-dur) var(--spring-glide),
              opacity   var(--slide-dur) var(--spring-glide);
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
  transition: transform var(--slide-dur) var(--spring-glide),
              opacity   var(--slide-dur) var(--spring-glide);
}

/* ---- 主面板（记录列表）：默认和离开态一致，避免归位闪烁 ---- */
.primary-sheet {
  transform: translateY(-18px);
  opacity: 0;

  /* === 纸面上的卡片（2026-11-24 轻盈通透方向）===
     作用域放在这一层而不是改 :root 的令牌：卡片材质只有记录页要换，
     详情页 / 我的 / 王冠还在旧语言里，改全局会一起变。
     换的是「重量」，不是「有没有」：卡还在、还分得清是一张一条，
     但边从 1px 亮线降到半像素、影子从 8/24 降到 2/12 —— 内容才是主角。 */
  --surface-card:           rgba(255, 254, 254, 0.78);
  --surface-card-rim:       inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 0 0 0.5px rgba(90, 35, 55, 0.045);
  --surface-card-shadow:    0 2px 12px rgba(90, 35, 55, 0.045), 0 1px 2px rgba(90, 35, 55, 0.025);
  --surface-card-shadow-up: 0 10px 26px rgba(90, 35, 55, 0.08), 0 2px 5px rgba(90, 35, 55, 0.04);

  /* 2026-11-23：顶部那 14px 的渐变蒙版删掉了（用户要求：主页不要渐变）。
     2026-11-24 渐变以另一种形式回来了 —— 不再是削在列表上的 mask，
     而是 AppHeader 里一层独立的玻璃场（variables.css 的 .ambient，三层模糊 + 遮罩）：
     内容整块穿过去被化开，不是"上半实、下半透"地被切。这一层自己仍然不挂任何 mask。 */
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
  /* 2026-11-23：顶栏改成浮层后，这里补回让位高度 —— 但这次让的是「按钮本身」，
     不是一条横带：滚动时内容会从两颗按钮后面穿过（上面 55px 不再被挖掉）。
     用 var(--header-height) 而不是写死 55，免得两处对不上。

     2026-11-24：再加一段 --sheet-top-gap。顶栏现在带着 148px 的纸色雾幕，
     内容若仍从 55px 起，第一行正好长在雾最浓的位置（读起来像被水洗过）。
     多让 44px，静止时第一条内容就站在雾已经淡开的地方；滚动时该穿过的照样穿过。 */
  padding-top: calc(var(--header-height) + var(--sheet-top-gap));
  min-height: calc(100% - var(--header-height) - var(--sheet-top-gap));
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
