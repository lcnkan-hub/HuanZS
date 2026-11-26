<!--
  根组件 — 登录闸门 + 全局状态管理与页面调度
  未登录：只渲染 AuthView（本地账号注册/登录门）
  已登录：条件渲染 SplashScreen / 记录列表 / 详情面板 / 我的浮层
  2026-11-21 单层记录重构：底栏只剩「记录 / 王冠」，「我的」改为右上角按钮呼出的浮层
-->
<template>
  <div class="app-container" :class="appearanceClass">
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
        @search-state="(v) => searchOpen = v"
      />

      <!-- 搜索遮罩：内容是压下面那层，不是自己变淡（理由见组件注释） -->
      <SearchScrim v-if="!openedItem" :active="searchOpen" :night="isNight" />

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
          :class="appearanceClass"
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
        :class="appearanceClass"
        :sunk="mineOpen || (kbOpen && currentTab === 'crown')"
        :crownReady="crownReady"
      />

      <!-- 新建记录：右下角那颗实心圆钮（2026-11-25 从列表顶部搬下来）。
           三种离开见组件注释；**详情页打开时不拆 DOM**，只压成透明 ——
           返回时壳要从这颗钮的位置收回来，拆了就没有落点。
           王冠页滑走、开「我的」跟浮岛一起下沉。 -->
      <RecordFab
        :sunk="mineOpen || (kbOpen && currentTab === 'crown')"
        :off="currentTab !== 'record'"
        :covered="!!openedItem"
        @add="handleCreateRecord"
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
import SearchScrim  from './components/layout/SearchScrim.vue'
import BottomNav    from './components/layout/BottomNav.vue'
import RecordFab    from './components/wiki/RecordFab.vue'
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
// 昼夜判定：记录页/详情页与王冠共用同一个来源（useTimeMode，默认 6:00–18:00 = 昼）
import { useTimeMode } from './composables/useTimeMode'
// 外观（2026-11-26）：色系 × 明暗 合成一个类名，根容器与「我的」/ 底栏共用同一份
import { useAppearance } from './composables/useAppearance'
import { useCardZoom } from './composables/useCardZoom'
// 2026-11-24 抽出去的两块（原来都堆在本文件里，共约 240 行）：
// 转场机械 → composables/useDetailTransition.js；通知条 → composables/useAppNotice.js
import { useDetailTransition } from './composables/useDetailTransition'
import { useAppNotice } from './composables/useAppNotice'

// ========== 登录闸门 ==========
// 未登录 → 只渲染 AuthView；登录/注册成功后整页重载，
// 让所有业务 composable 的存储键在 boot 时按新账号重新解析（见 utils/storageScope.js）
const loggedIn = ref(isLoggedIn())
const timeMode = useTimeMode()   // 返回的就是一个 Ref<'day'|'night'>
const isNight = computed(() => timeMode.value === 'night')
// 外观类名（'palette-xxx' + 'theme-deep'）：只有这一处拼，三个挂载点共用
const { appearanceClass } = useAppearance()

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
/** 搜索态（由 AppHeader 外推，2026-11-25）：只决定内容区要不要压暗 */
const searchOpen = ref(false)
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

// ========== 计算属性 ==========
// 昵称统一走这里取值：档案还没建好时给空串，避免模板里直接 .name 崩掉
const profileName = computed(() => (userProfile.value && userProfile.value.name) || '')

/**
 * 卡片 ↔ 详情 的转场机械（2026-11-24 从本文件抽出，逻辑未改）。
 * 依赖都是本组件持有的对象，通过参数传进去 —— 不在这里新建第二个 usePageRouter/useCardZoom，
 * 否则两处状态会各持一份。
 */
const { handleOpenItem, handleCreateRecord, closeDetailAndCleanup } = useDetailTransition({
  openedItem,
  pendingNewId,
  recordsApi,
  zoom,
  openDetail,
  closeDetail,
  profileName
})

/**
 * 常驻提示条（只剩 I15 存储写失败）。
 * 两个动作由本组件提供：「导出备份」= 打开「我的」（备份中心在那儿）；「清一清图片」= 回收孤儿图。
 */
const { notice, handleNoticeAction } = useAppNotice({
  onExport: () => openMine(),
  purgeImages: () => recordsApi.purgeUnusedImages()
})

const filteredItems = computed(() => {
  return recordsApi.searchRecords(searchQuery.value)
})

// 空列表提示：空库要给引导（整片白比空列表更让人不知道下一步），
// 「搜不到」必须说清是筛出来的空，否则用户会以为数据丢了。
const emptyHint = computed(() => {
  if (searchQuery.value.trim()) return '没搜到相关记录，换个词试试'
  return '还没有记录。随手记一条，王冠也会替你记。'
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

/** 「我的」里点了一条收藏的记录：先关浮层再打开详情。
 * 顺序不能反 —— 详情是记录页的叠层，浮层还开着会压在它上面。
 */
function handleOpenFromFavorites(item) {
  if (!item) return
  closeMine()
  openDetail(item)
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
  --surface-card:           rgba(255, 254, 254, 0.74);
  --surface-card-rim:       inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 0 0 0.5px rgba(20, 19, 25, 0.045);
  --surface-card-shadow:    0 2px 12px rgba(20, 19, 25, 0.045), 0 1px 2px rgba(20, 19, 25, 0.025);
  --surface-card-shadow-up: 0 10px 26px rgba(20, 19, 25, 0.08), 0 2px 5px rgba(20, 19, 25, 0.04);

  /* 2026-11-23：顶部那 14px 的渐变蒙版删掉了（用户要求：主页不要渐变）。
     2026-11-24 渐变以另一种形式回来了 —— 不再是削在列表上的 mask，
     而是 AppHeader 里一层独立的玻璃场（variables.css 的 .ambient，三层模糊 + 遮罩）：
     内容整块穿过去被化开，不是"上半实、下半透"地被切。这一层自己仍然不挂任何 mask。 */
}
/* 夜间纸面：卡片换成"比纸亮一点点"的半透明白，白天的白卡在这里必须让位。
   选择器比 .primary-sheet 多一级，才压得住它自己声明的四条 —— 不靠书写顺序赌。 */
.app-container.theme-deep .primary-sheet {
  --surface-card:           rgba(255, 255, 255, 0.07);
  --surface-card-rim:       inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 0 0 0.5px rgba(255, 255, 255, 0.09);
  --surface-card-shadow:    0 6px 18px rgba(0, 0, 0, 0.30), 0 1px 2px rgba(0, 0, 0, 0.20);
  --surface-card-shadow-up: 0 12px 30px rgba(0, 0, 0, 0.42), 0 2px 6px rgba(0, 0, 0, 0.28);
}

.primary-sheet.sheet-active {
  transform: translateY(0);
  opacity: 1;
}.primary-sheet.sheet-leave {
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
