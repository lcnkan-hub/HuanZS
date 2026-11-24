<!--
  记录详情页积木（2026-11-22 版式重做 · 迭代 1）
  职责：一条记录 = 一个大标题 + 一行元信息 + 一段正文。改名、写正文、返回。
  Props: openedItem(记录对象)
  Emits: close, rename, save-body

  版式来源：参考图的骨架 + Apple HIG 的四条落地
    · Layout 视觉层级第 1 条「按重要性排序」→ 标题独占一行、26px，是整页唯一的大字
      （原来是 16px，跟卡片标题一样大，进详情页看不出"这是主体"）
    · Layout 第 2 条「对齐即关系」→ 标题 / 元信息 / 正文共用同一条左基线（22px 内边距）
    · Layout 第 5 条 + Materials 规则 1「控件与内容分开」→ 顶部没有分割线、没有实心底条，
      底部工具栏是**半透明 + 模糊的浮层**，内容从它底下滚过去；不垫一块纯色
    · Motion「高频交互别让人多花时间注意动画」→ 进出这一页不加任何装饰动效

  交互（2026-11-22 用户定的三条）：
    1. 底部只有三个动作：图片 / 语音 / 完成
    2. 不显示"已保存"——改到哪存到哪（正文由 ItemBodyEditor 防抖自动落库）
    3. 标题 26px
-->
<template>
  <div class="detail-page-wrapper">
    <!-- 玻璃场（2026-11-24 · 与参考文件的 .ambient 同一份实现，样式在 variables.css）
         顶部：正文滚上去时被"化开"，随滚动显形（停在顶上时隐去，第一行才清晰）。
         底部：常驻 —— 阅读态和编辑态都留这一层，最后一行滚到底时化进屏幕边缘。
         层级由下面的 .detail-page-wrapper > .ambient 管：压在正文之上、按钮/工具栏之下。 -->
    <div class="ambient top" :class="{ 'is-on': topMist }" aria-hidden="true">
      <i class="layer wide"></i>
      <i class="layer mid"></i>
      <i class="layer core"></i>
    </div>
    <div class="ambient is-up bottom" aria-hidden="true">
      <i class="layer wide"></i>
      <i class="layer mid"></i>
      <i class="layer core"></i>
    </div>

    <!-- 顶部：左边一颗玻璃圆钮（只有箭头，不带文字）+ 右边一颗「⋯」圆钮。
         分享从顶栏独立图标收进了菜单里（用户 11-23：顶栏只留两个键） -->
    <div class="detail-header">
      <button class="round-btn" type="button" aria-label="返回" @click="handleClose">
        <AppIcon name="back" :size="20" />
      </button>
      <div class="top-actions">
        <button
          class="round-btn"
          type="button"
          aria-label="更多操作"
          :aria-expanded="menuOpen ? 'true' : 'false'"
          @click="menuOpen = !menuOpen"
        >
          <AppIcon name="more" :size="20" />
        </button>

        <!-- 向下展开的玻璃菜单：收藏 / 分享 / 删除，整颗同一套材质（用户 11-23） -->
        <div v-if="menuOpen" class="top-menu">
          <button class="menu-item fav" type="button" @click="onToggleFav">
            <AppIcon name="bookmark" :size="15" /><span>{{ favorited ? '取消收藏' : '收藏' }}</span>
          </button>
          <button class="menu-item share" type="button" @click="onShare">
            <AppIcon name="share" :size="15" /><span>分享</span>
          </button>
          <button class="menu-item del" type="button" @click="onDelete">
            <AppIcon name="trash" :size="15" /><span>删除</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 点空白关菜单：透明遮罩，盖住内容但不挡住菜单自己 -->
    <div v-if="menuOpen" class="menu-mask" @click="menuOpen = false"></div>

    <div
      ref="scrollEl"
      class="detail-body"
      :class="{ 'is-editing': isEditing, 'is-plain-edit': plainEditing }"
      :style="{ '--kb-pad': kbPad }"
      @scroll.capture.passive="syncScrollState"
    >
      <!-- 正文：点一下进编辑，边打边存；空记录进来直接就是编辑态（光标在闪）。
           2026-11-23 起**没有独立标题**了 ——「标题」就是正文首行的加粗字（`**…**`），
           由 markdownParser 渲染成 <strong>，位置在图片下方（图由 PhotoGrid 渲染在正文上方）。
           这样卡片上的那一行粗字和这里的粗字是同一段文字，展开时只平移不重排。 -->
      <ItemBodyEditor
        ref="bodyRef"
        :record="openedItem"
        :auto-edit="autoEdit"
        :meta-text="signText"
        @save="(text) => $emit('save-body', text)"
        @add-pic="(id) => $emit('add-pic', id)"
        @delete-pic="(i) => $emit('remove-pic', i)"
        @preview-pic="openPhoto"
        @editing-change="isEditing = $event"
      />

      <!-- 分享的一行小提示（2.6 秒自己消失） -->
      <p v-if="shareHint" class="voice-hint">{{ shareHint }}</p>
    </div>

    <!-- 底部工具栏：**只在编辑态出现**（2026-11-23 用户要求）。
         阅读的时候这条是空的 —— 看东西不需要「完成」和「加粗」，它只会挡内容。
         键盘弹起时整条上浮（仿王冠页输入栏：iOS 布局视口不变，只收让位会被键盘盖住）。 -->
    <div
      v-if="isEditing"
      class="detail-toolbar"
      :style="{ transform: kbShift ? 'translateY(' + kbShift + 'px)' : '' }"
    >
      <button class="tool-circle" type="button" aria-label="插入图片" @click="onImage">
        <AppIcon name="image" :size="19" />
      </button>
      <button class="tool-circle" type="button" aria-label="加粗" @click="onBold">
        <span class="bold-glyph" aria-hidden="true">B</span>
      </button>
      <span class="tool-spacer"></span>
      <button class="done-btn" type="button" aria-label="完成" @click="handleDone">
        <AppIcon name="check" :size="19" />
      </button>
    </div>

    <!-- 看图浮层：点图区里任意一张放大。
         黑底铺满 + contain —— 看图时最忌讳把边上裁掉，所以不用 cover。 -->
    <!-- 看图：横向一屏一张，左右滑切图；点图片外的黑边返回（用户 11-23 指定）。
         用原生 scroll-snap 而不是自己算手势：惯性、边界回弹、无障碍滚动全是浏览器给的。 -->
    <div
      v-if="viewer.open"
      ref="viewerEl"
      class="photo-viewer"
      @click="onViewerClick"
      @scroll.passive="onViewerScroll"
    >
      <div v-for="(u, i) in viewer.urls" :key="i" class="viewer-slide">
        <img :src="u" alt="" draggable="false" />
      </div>
      <span v-if="viewer.urls.length > 1" class="viewer-page">{{ viewer.index + 1 }} / {{ viewer.urls.length }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import ItemBodyEditor from './ItemBodyEditor.vue'
import { isFavorite, toggleFavorite } from '../../composables/useFavorites'
import { getImageUrl } from '../../composables/useImageStore'
import { useKeyboard } from '../../composables/useKeyboard'

const props = defineProps({
  openedItem: { type: Object, required: true },
})
const emit = defineEmits(['close', 'rename', 'save-body', 'delete', 'add-pic', 'remove-pic'])

/**
 * 看图浮层。PhotoGrid 只回传序号（blob URL 是它内部解析的），这里按序号回头取 id 再解析一次
 * —— getImageUrl 带缓存，第二次调用几乎是零成本。
 */
const viewer = ref({ open: false, urls: [], index: 0 })
const viewerEl = ref(null)

/** 点开某张：把**这一组**图都取出来（滑动切图要用），并直接定位到点的那张 */
async function openPhoto(index) {
  const ids = props.openedItem.pics || []
  if (!ids.length) return
  try {
    const urls = await Promise.all(ids.map((id) => getImageUrl(id).catch(() => '')))
    const list = urls.filter(Boolean)
    if (!list.length) return
    viewer.value = { open: true, urls: list, index: Math.min(index, list.length - 1) }
    await nextTick()
    const el = viewerEl.value
    if (el) el.scrollLeft = viewer.value.index * el.clientWidth
  } catch {
    // 图读不出来就什么都不做：看图失败不该弹个错打断阅读
  }
}

/** 滑动停下时更新页码（原生惯性结束后才有意义） */
function onViewerScroll() {
  const el = viewerEl.value
  if (!el) return
  const i = Math.max(0, Math.min(Math.round(el.scrollLeft / el.clientWidth), viewer.value.urls.length - 1))
  if (i !== viewer.value.index) viewer.value.index = i
}

/** 点在图片本体上 → 不关（图片区留给滑动）；点上下黑边 → 返回 */
function onViewerClick(e) {
  if (e.target && e.target.tagName === 'IMG') return
  viewer.value.open = false
}

const bodyRef   = ref(null)
const menuOpen  = ref(false)
const shareHint = ref('')

/* ===== 顶部雾幕的开关（2026-11-24）=====
   顶雾只在「上面还有内容没滚过去」时显形：停在顶部 → 隐去，第一行不被纸色洗白。
   底雾不做这个判断（它常驻，见样式里的说明）。
   判据用 scrollTop，不用 IntersectionObserver —— 这层是同一个容器，
   多挂一个观察器只为算一个数不划算。 */
const scrollEl   = ref(null)
const atTop      = ref(true)
const topMist    = computed(() => !atTop.value)

/** 阈值 6px：手指轻抖不算滚过，雾不会一闪一闪。
 *  编辑态的滚动**不在** .detail-body 上 —— textarea 是固定高度、自己在内部滚，
 *  所以这里要问「当前真正在滚的是谁」：编辑态取 textarea，阅读态就是容器本身。 */
function activeScroller() {
  const el = scrollEl.value
  if (!el) return null
  return el.querySelector('.body-input') || el
}

function syncScrollState() {
  const el = scrollEl.value
  if (!el) return
  const inner = activeScroller()
  const outerAtTop = el.scrollTop <= 6
  // textarea 与容器是同一个元素时别判两遍
  const innerAtTop = !inner || inner === el || inner.scrollTop <= 6
  atTop.value = outerAtTop && innerAtTop
}

/** 编辑态且没有图片：正文的滚动容器换成 textarea，雾的判据要跟着换人，重算一次 */

/* 内容长度会变（打字、插图、键盘让位）——变长变短都该重算「下面还有没有内容」，
   否则写完一大段不滚一下，底部那层雾就不出现 */
let ro = null
onMounted(() => {
  syncScrollState()
  const el = scrollEl.value
  if (!el || typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver(() => syncScrollState())
  ro.observe(el)
  if (el.firstElementChild) ro.observe(el.firstElementChild)
})
onBeforeUnmount(() => { if (ro) { ro.disconnect(); ro = null } })

/** 是否在编辑正文 —— 底部工具栏的显隐完全跟着它走（阅读态整条不渲染） */
const isEditing = ref(false)

/**
 * 「纯文字编辑」：编辑态 + 这条记录没有图。
 *
 * 为什么单独分出来：编辑态的文字在 textarea 里滚，而 textarea 从容器内边距之下起 ——
 * 它的上边缘就是一条硬裁切边，内容根本到不了顶栏后面，雾也就无从化开。
 * 无图时把容器的上内边距交给 textarea 自己（见样式），文字就能像阅读态一样穿过屏幕顶；
 * 有图时图压在正文上方（PhotoGrid 在流内），挪内边距会把图顶到按钮底下，所以那种情况保持原样。
 */
const plainEditing = computed(() => isEditing.value && !(props.openedItem.pics || []).length)

/** 进出编辑态：滚动容器在容器 ↔ textarea 之间换人，雾的判据要立刻重算一次 */
watch([isEditing, plainEditing], () => nextTick(syncScrollState))

// 键盘：编辑时整条工具栏跟着上浮，判据与「王冠」页输入栏同一套（useKeyboard 是模块级单例）
const { kbOpen, kbShift } = useKeyboard()

/** 正文底部留白：键盘弹起时补上键盘高度，最后一行不会藏在工具栏/键盘下面 */
const kbPad = computed(() => (kbOpen.value ? Math.abs(kbShift.value) + 'px' : '0px'))

/** 收藏状态：useFavorites 是模块级单例，详情页点完，返回列表卡片立刻跟着变 */
const favorited = computed(() => isFavorite(props.openedItem.id))

/** 空记录（标题正文都空）进来就直接可写 —— 用户要的"直接写，光标已经在闪" */
const autoEdit = computed(() =>
  !(props.openedItem.name || '').trim() && !(props.openedItem.wiki || '').trim()
)

/**
 * 落款：「2026/11/22 10:00」→「2026年11月22日 星期六」。
 * 只到日，不带时间 —— 用户要的是"什么时候写的这一条"，不是精确到分钟的时刻。
 * 认不出来返回空串（就不显示落款），老数据的 time 可能为空或别的形状。
 */
const signText = computed(() => {
  const raw = String(props.openedItem.time || '').trim()
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(raw)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()]
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日 ${week}`
})

/** 加粗：交给正文编辑器（它插一对 `**…**`，光标落在中间） */
function onBold() {
  bodyRef.value?.insertBold()
}

/** 插入图片：交给正文编辑器（它会先切进编辑态再弹选图） */
function onImage() {
  bodyRef.value?.insertImage()
}

/** 收藏 / 取消收藏：点完收菜单 */
function onToggleFav() {
  toggleFavorite(props.openedItem.id)
  menuOpen.value = false
}

/** 删除：交给父级（它会删完再关掉这一页）。不做二次确认 —— 展开菜单已经是第二下 */
function onDelete() {
  menuOpen.value = false
  emit('delete', props.openedItem.id)
}

/**
 * 分享：三级降级。
 *   1. navigator.share —— 系统分享面板（Android Chrome / 有 Capacitor Share 插件时）
 *   2. navigator.clipboard —— 复制成纯文本
 *   3. 都不行 —— 如实说一句，让用户长按正文自己复制
 * 内容按用户定的：整条记录（标题 + 正文）。
 */
async function onShare() {
  menuOpen.value = false
  const title = (props.openedItem.name || '').trim() || '未命名'
  const body = props.openedItem.wiki || ''
  const text = body ? `${title}\n\n${body}` : title

  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return
    } catch (e) {
      // 用户**主动取消**（AbortError）→ 静默收场，不该再弹一句"不支持分享"
      // 其它错误（没有用户手势、权限被拒、WebView 里是个空壳）→ 继续往下走，试剪贴板
      if (e && e.name === 'AbortError') return
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      hint('已复制到剪贴板')
      return
    } catch { /* 落到最后一条 */ }
  }
  hint('这台设备还不支持分享，长按正文可以选中复制')
}

/** 一行小提示，2.6 秒后自己消失（分享和语音共用一处显示） */
function hint(msg) {
  shareHint.value = msg
  setTimeout(() => { shareHint.value = '' }, 2600)
}

/**
 * 「完成」：结束编辑、回阅读态（工具栏随之收起），**不离开详情页**。
 *
 * 编辑态下有两个出口，各管一件事：底部「完成」= 我写完了，看；顶栏返回 = 我走了。
 * 两个都关页面的话，用户没有"写完但还想再看一眼"的路（2026-11-23 定的分工）。
 * 两个入口都会先 flush 一次，防抖没到的那几个字不会丢。
 */
function handleDone() {
  bodyRef.value?.exitEdit()
}

function handleClose() {
  bodyRef.value?.flush()
  emit('close')
}
</script>

<style scoped>
.detail-page-wrapper {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  /* 背景：和记录页同一块纸（2026-11-24）。
     ⚠ 这里**不能用 backdrop-filter 去模糊背后的列表**：那会给这一层开一个新的
     Backdrop Root，里面两颗圆钮的玻璃就再也采不到东西，整块材质失效。
     所以自己铺一份纸底 + 色斑 —— 详情页必须不透明（要盖住下面那张列表）。
     2026-11-24 起它跟 .app-container 用**同一组令牌**：卡片展开时从纸面长成纸面，
     中途没有底色跳变。也不再写 background-attachment: fixed —— 这一层是 inset:0 的
     固定容器，本身不滚（滚的是里面的 .detail-body），fixed 只会让 iOS 多烧一层合成。 */
  background-color: var(--color-bg-primary);
  background-image: var(--page-canvas-image);
  color: var(--color-text-primary);
  z-index: 100;
  display: flex; flex-direction: column;
  /* 2026-11-23：不再自带滑入动画 —— 进场由 useCardZoom 负责（卡片长成整屏）。
     这里再补一层 translateX(100%) 会变成「白块在飞 + 页面在滑」两个动作叠一起。 */
}

/* 玻璃场（2026-11-24 · 按 huanzhongshu_glass_homepage_full.html）
   和主页顶/底是同一份实现（variables.css 的 .ambient / .layer），这里只管位置与层位：
     · z-index: 1 —— 压在正文之上、顶栏圆钮（2）与编辑工具栏（2）之下。
       写高了会把按钮一起染白，写低了等于没盖（正文根本不会被雾化）。
     · .top 随滚动显形（.is-on），停在顶上时隐去 —— 第一行不该被糊；
     · .bottom 常驻，阅读态与编辑态都在：最后一行滚到底时化进屏幕边缘，而不是被切一刀。
   高度 = --fade-size（56）。上一版是 148px 的纸色渐变，靠"盖"；这一版靠"糊"。 */
.detail-page-wrapper > .ambient {
  z-index: 1;
}
.detail-page-wrapper > .ambient.top {
  top: 0;
  opacity: 0;
  transition: opacity 0.22s ease-out;
}
.detail-page-wrapper > .ambient.top.is-on { opacity: 1; }
.detail-page-wrapper > .ambient.bottom {
  bottom: 0;
}

/* 顶栏：**浮层**（2026-11-24，与记录页同一结构）。
   以前它是 flex 里的一个 55px 占位条，正文在它下面被裁成一条硬边 —— 内容永远到不了雾里。
   改成 absolute 之后正文从它**后面**滚过去，才谈得上「从纸里化开」。
   占位改由 .detail-body 的 padding-top 补（见下），静止时首行位置一点没动。 */
.detail-header {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 2;                  /* 高于雾幕：按钮不能被纸色染白 */
  height: var(--header-height);
  display: flex; align-items: center;
  padding: 0 12px;
  pointer-events: none;        /* 空白区不吃点击，只有两颗钮是热区 */
  -webkit-user-select: none; user-select: none;
}
/* pointer-events 是继承属性 —— 只给 .detail-header 写 none 会连按钮一起变死区 */
.detail-header .round-btn,
.detail-header .top-actions { pointer-events: auto; }
/* 顶栏两颗圆钮（2026-11-23）：玻璃底、44×44 热区（视觉即 44 —— check 脚本只认真实 rect，
   伪元素扩热区不算数）。玻璃而不是无底：它常浮在封面照片上，无底会跟图糊在一起。 */
.round-btn {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background-color: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-highlight), var(--glass-edge), 0 2px 10px rgba(0, 0, 0, 0.08);
  color: var(--color-text-primary);
  cursor: pointer; padding: 0;
  --press-now-dur: var(--release-dur);
  --press-now-ease: var(--spring-pop);
  transition: transform var(--press-now-dur) var(--press-now-ease);
  -webkit-tap-highlight-color: transparent;
}
.round-btn:active {
  --press-now-dur: var(--press-dur);
  --press-now-ease: var(--spring-press);
  transform: scale(var(--press-scale-sm));
  /* 按下：顶光消失、换成内阴影 —— 被按进去的读感，和顶栏两颗键同一套（2026-11-23） */
  box-shadow:
    var(--glass-edge),
    inset 0 2px 7px rgba(0, 0, 0, 0.10),
    0 1px 3px rgba(0, 0, 0, 0.05);
}

.top-actions {
  margin-left: auto; display: flex; align-items: center; gap: 8px;
  position: relative;   /* 菜单相对它定位，右边缘跟「⋯」对齐 */
}

/* 向下展开的玻璃菜单：一颗容器装三行，材质统一（用户 11-23）。
   以前是三个各自带底色的小胶囊（浅蓝/浅红/浅蓝）—— 三块颜色并排像三个系统通知，
   而且跟"玻璃"的语义冲突：玻璃是透过，色块是隔断。
   2026-11-24 换纸底后把填充从 --glass-fill(.66) 提到 .86：
   这一块里是三行**要读的字**，而它正好压在正文上。.66 时背后的正文会透成一层灰影子
   （实测暗字透出来约 1.4:1，读不动又甩不掉）；模糊在不支持 backdrop-filter 的环境下
   更是完全不生效。图标类浮件（圆钮、工具栏）保持 .66 —— 它们上面没有正文要读。 */
.top-menu {
  position: absolute; top: 50px; right: 0; z-index: 20;
  width: 136px; padding: 5px;
  display: flex; flex-direction: column; gap: 2px;
  border-radius: var(--radius-lg);
  background-color: rgba(255, 252, 253, 0.86);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow:
    var(--glass-highlight),
    var(--glass-edge),
    0 12px 32px rgba(90, 35, 55, 0.14),
    0 2px 6px rgba(90, 35, 55, 0.06);
  transform-origin: top right;
  animation: menuFade 0.14s linear both,
             menuIn var(--pop-dur) var(--spring-pop) both;
}
/* 拆两条：透明度不能被弹簧带着过冲（会 >1 再回落，看着像闪），只让形变弹 */
@keyframes menuFade { from { opacity: 0 } }
@keyframes menuIn   { from { transform: translateY(-6px) scale(0.94) } }

.menu-item {
  display: flex; align-items: center; gap: 8px;
  height: 36px; padding: 0 10px;
  border: none; border-radius: var(--radius-md);
  background-color: transparent;
  color: var(--color-text-primary);
  font-size: var(--text-14); font-weight: 500;
  cursor: pointer; white-space: nowrap; text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.16s ease;
}
.menu-item:active { background-color: rgba(0, 0, 0, 0.06); }
.menu-item.del { color: var(--color-danger); }

/* 点任何地方关菜单。放在菜单之下（z-index 10 < 20） */
.menu-mask { position: fixed; inset: 0; z-index: 10; }

.detail-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  /* 只由 JS 写在行内（键盘高度）。必须先在这里给默认值 —— 没键盘时它就是 0，
     不给默认值体检会判「引用了未定义的令牌」，而且默认值本身就是正确语义。 */
  --kb-pad: 0px;
  /* 左右 22 = 列表的 12 + 卡片内的 10 —— 卡片文字和这里正文同一条左基线。
     这个相等是「展开时文字不重排」的唯一依据（见 WikiCard 文件头第 3 条）。 */
  padding: 10px 22px 0;
  /* 顶栏改成浮层后，这里补回它的占位：55 + 10 = 原来 header 占位 + 自身 10px 内边距。
     两数相加后静止时首行位置**一点没动**（卡片长成整屏的转场落点才不会偏）。 */
  --detail-top-pad: calc(var(--header-height) + 10px);
  /* 编辑态 textarea 自己的顶部留白。默认 0（有图时由外面的内边距负责），
     纯文字编辑时由 .is-plain-edit 换成上面那个值 —— 见那条规则的说明。 */
  --edit-top-pad: 0px;
  padding-top: var(--detail-top-pad);
  display: flex; flex-direction: column;
  /* 底部留白 = 0（2026-11-24 用户要求：滚动框要一直到屏幕最底）。
     原来这里是 96（给编辑态工具栏让位 + 呼吸），实测下来那块留白在纸面上就是"一截空白"，
     正文看着像被截在中间。现在留 0：滚动框直接顶到屏幕下沿，
     编辑态的工具栏改成**浮在正文之上**（玻璃本身允许内容从底下穿过）。
     只保留 --kb-pad（键盘高度）—— 那是让光标不被键盘盖住，不是视觉留白。 */
  padding-bottom: var(--kb-pad, 0px);
}

/* 纯文字编辑态：把顶部留白**交给 textarea**（2026-11-24）。
   不改这一条的话，编辑时文字在 textarea 内部滚，而 textarea 从 65px 起 ——
   它的上边缘是一条硬裁切边，正文永远到不了顶栏后面，雾幕只能盖住一段空气。
   改完之后 textarea 自己顶到屏幕最上沿、用 padding-top 让出首行位置，
   滚动时文字就跟阅读态一样从纸里化开、也从雾里消失。
   有图时不这么做：PhotoGrid 在流内，图会跟着被顶到按钮底下。 */
.detail-body.is-plain-edit {
  padding-top: 0;
  --edit-top-pad: var(--detail-top-pad);
}

/* 看图：黑底铺满 + contain。z-index 高于详情页本身（100），低于看图时的系统手势层
   横向一屏一张（scroll-snap），滑动切换；黑边也能滑，所以两个方向都交给原生滚动 */
.photo-viewer {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0, 0, 0, 0.94);
  display: flex;
  overflow-x: auto; overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior: contain;      /* 滑到头不把整页带着回弹 */
  -webkit-overflow-scrolling: touch;
  animation: viewerIn 0.16s ease;
}
.viewer-slide {
  flex: 0 0 100%;
  height: 100%;
  scroll-snap-align: center;
  display: flex; align-items: center; justify-content: center;
}
.viewer-slide img {
  max-width: 100%; max-height: 100%;
  object-fit: contain;
  -webkit-user-drag: none;
  user-select: none;
}
/* 页码：图多于一张才出现，压在底部安全区之上，不挡手势 */
.viewer-page {
  position: fixed;
  left: 50%; transform: translateX(-50%);
  bottom: calc(var(--safe-bottom) + 24px);
  color: rgba(255, 255, 255, 0.72);
  font-size: var(--text-13);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  pointer-events: none;
}
@keyframes viewerIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}


.voice-hint {
  margin: 12px 0 0;
  font-size: var(--text-12);
  color: var(--color-text-muted);
}

/* 底部工具栏：半透明 + 模糊，浮在内容之上；内容从它底下滚过去。
   不写实心背景色 —— 那是"给控件垫一块"，HIG 明确不这么做。 */
.detail-toolbar {
  position: absolute;
  /* 高于雾幕（1）：工具栏压在底雾上，雾只能盖正文，不能把按钮洗白 —— 与顶栏同一套层位 */
  z-index: 2;
  /* 2026-11-23：更窄（12 → 20）、矮一点（56 → 52）、圆角跟着收 —— 原来那条压在详情页上偏重 */
  left: 20px; right: 20px;
  bottom: calc(14px + var(--safe-bottom));
  height: 52px;
  border-radius: 26px;
  /* 2026-11-23：改用统一玻璃令牌（原来的 0.78 + blur(24) 是手写值，
     和顶栏/浮岛两套参数并存 —— 同一种材质在同一个应用里出现两种厚度，
     摸起来就是"这不是同一块玻璃"）。 */
  background: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow:
    var(--glass-highlight),
    var(--glass-edge),
    0 8px 24px rgba(0, 0, 0, 0.10);
  display: flex; align-items: center; gap: 8px;
  padding: 0 6px;
  /* 键盘弹起时整条上浮。没这条就只收让位，iOS 上会被键盘整块盖住（王冠页踩过） */
  transition: transform var(--slide-dur) var(--spring-glide);
}

/* 圆圈按钮（用户要「带圆圈的质感按钮，点一下会跳」）
   浅底 + 顶部内高光 + 极轻投影 —— 与王冠页 .send-btn 同一族材质。
   视觉 40、热区 44（::after 外扩）——HIG 要的是热区 ≥44，不是看着像 44。 */
.tool-circle {
  width: 40px; height: 40px;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: var(--color-bg-input);
  color: var(--color-text-muted);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75), 0 1px 2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  -webkit-appearance: none; appearance: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}
.tool-circle::after { content: ''; position: absolute; inset: -2px; }
.tool-circle:active { animation: toolPop var(--pop-dur) ease-out; }
.tool-circle:focus { outline: none; }
.tool-circle:focus-visible { box-shadow: inset 0 0 0 2px var(--color-accent); }

/* 跳动：压扁 → 弹过一点 → 落回。0.3s 打完才像「按钮的回应」，
   再慢就变成「动画在演」（HIG：反馈动画要简短精确）。 */
@keyframes toolPop {
  0%   { transform: scale(1); }
  30%  { transform: scale(0.88); }
  65%  { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.bold-glyph { font-size: var(--text-17); font-weight: 800; line-height: 1; }

.tool-spacer { flex: 1; }

/* 完成：整页唯一的实心色块 —— 高频动作里最该被一下点到的那个。
   尺寸跟圆圈按钮同一档（42），跳动也用同一条 keyframes，三种按钮一套手感。 */
.done-btn {
  width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(126, 35, 64, 0.34);
  -webkit-tap-highlight-color: transparent;
  outline: none;
}
.done-btn:active { animation: toolPop var(--pop-dur) ease-out; }
.done-btn:focus-visible { box-shadow: inset 0 0 0 2px #fff, 0 4px 14px rgba(126, 35, 64, 0.34); }

/* 详情页底色：已并入上面的 .detail-page-wrapper（2026-11-24 与记录页统一成纸面）。
   原来这里是「自己再铺一份网格 + 色斑」的第二条同名规则（走 --deep-canvas-*），
   现在两者同一组令牌，重复那条删掉 —— 同一个东西写两遍，改一处就会漏一处。 */
</style>
