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
    <!-- 顶部：返回（左）+ 分享 + 更多（右）。
         分享和更多都是 34 视觉 / 44 热区；更多点开是竖排菜单（往左下弹，右边缘对齐） -->
    <div class="detail-header">
      <button class="back-link-btn" @click="handleClose">
        <AppIcon name="back" :size="17" /> 返回
      </button>
      <div class="top-actions">
        <button class="icon-btn" type="button" aria-label="分享" @click="onShare">
          <AppIcon name="share" :size="19" />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="更多操作"
          :aria-expanded="menuOpen ? 'true' : 'false'"
          @click="menuOpen = !menuOpen"
        >
          <AppIcon name="more" :size="19" />
        </button>
      </div>

      <!-- 竖排菜单：收藏 / 删除。跟列表卡片的菜单同一套规格，只是方向竖着 -->
      <div v-if="menuOpen" class="top-menu">
        <button class="menu-item fav" type="button" @click="onToggleFav">
          <AppIcon name="bookmark" :size="14" /> {{ favorited ? '取消收藏' : '收藏' }}
        </button>
        <button class="menu-item del" type="button" @click="onDelete">
          <AppIcon name="trash" :size="14" /> 删除
        </button>
      </div>
    </div>

    <!-- 点空白关菜单：透明遮罩，盖住内容但不挡住菜单自己 -->
    <div v-if="menuOpen" class="menu-mask" @click="menuOpen = false"></div>

    <div class="detail-body" :class="{ 'has-hint': voiceHint }">
      <!-- 标题：26px，点一下就地改。**空标题就真空着**（不显示"未命名"），
           只保留一块高度供点击 —— 用户要的是"什么都没写就什么都不显示" -->
      <input
        v-if="titleEditing"
        ref="titleInputRef"
        v-model="draftName"
        class="detail-title-input"
        placeholder=""
        @keyup.enter="commitTitle"
        @blur="commitTitle"
      />
      <h1 v-else class="detail-title" @click="startTitleEdit">{{ openedItem.name }}</h1>

      <!-- 一道杠：原来日期行站的位置，现在只用来分开标题和正文。
           日期搬到正文末尾右下角（阅读态才显示） -->
      <div class="title-rule"></div>

      <!-- 正文：点一下进编辑，边打边存；空记录进来直接就是编辑态（光标在闪）
           图片附件化后，图由 ItemBodyEditor 里的 PhotoGrid 渲染在正文上方 -->
      <ItemBodyEditor
        ref="bodyRef"
        :record="openedItem"
        :auto-edit="autoEdit"
        :meta-text="signText"
        @save="(text) => $emit('save-body', text)"
        @add-pic="(id) => $emit('add-pic', id)"
        @preview-pic="openPhoto"
      />

      <!-- 语音/分享的一行小提示（2.6 秒自己消失） -->
      <p v-if="voiceHint" class="voice-hint">语音输入还没做，先用键盘吧</p>
      <p v-if="shareHint" class="voice-hint">{{ shareHint }}</p>
    </div>

    <!-- 底部工具栏：功能层，浮在内容之上（Materials 规则 1） -->
    <div class="detail-toolbar">
      <button class="tool" type="button" aria-label="插入图片" @click="onImage">
        <AppIcon name="image" :size="20" />
      </button>
      <button class="tool" type="button" aria-label="语音输入" @click="onVoice">
        <AppIcon name="mic" :size="20" />
      </button>
      <span class="tool-spacer"></span>
      <button class="done-btn" type="button" aria-label="完成" @click="handleClose">
        <AppIcon name="check" :size="20" />
      </button>
    </div>

    <!-- 看图浮层：点图区里任意一张放大，点任意处关掉。
         黑底铺满 + contain —— 看图时最忌讳把边上裁掉，所以不用 cover。 -->
    <div v-if="viewer.open" class="photo-viewer" @click="viewer.open = false">
      <img :src="viewer.url" alt="" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import ItemBodyEditor from './ItemBodyEditor.vue'
import { isFavorite, toggleFavorite } from '../../composables/useFavorites'
import { getImageUrl } from '../../composables/useImageStore'

const props = defineProps({
  openedItem: { type: Object, required: true },
})
const emit = defineEmits(['close', 'rename', 'save-body', 'delete', 'add-pic'])

/**
 * 看图浮层。PhotoGrid 只回传序号（blob URL 是它内部解析的），这里按序号回头取 id 再解析一次
 * —— getImageUrl 带缓存，第二次调用几乎是零成本。
 */
const viewer = ref({ open: false, url: '' })
async function openPhoto(index) {
  const id = (props.openedItem.pics || [])[index]
  if (!id) return
  try {
    const url = await getImageUrl(id)
    if (url) viewer.value = { open: true, url }
  } catch {
    // 图读不出来就什么都不做：看图失败不该弹个错打断阅读
  }
}

const bodyRef      = ref(null)
const titleEditing = ref(false)
const draftName    = ref('')
const titleInputRef = ref(null)
const voiceHint    = ref(false)
const menuOpen     = ref(false)
const shareHint    = ref('')

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

function startTitleEdit() {
  draftName.value = props.openedItem.name || ''
  titleEditing.value = true
  nextTick(() => titleInputRef.value && titleInputRef.value.focus())
}

function commitTitle() {
  if (!titleEditing.value) return
  titleEditing.value = false
  const name = (draftName.value || '').trim()
  const prev = (props.openedItem.name || '').trim()
  /**
   * 允许提交空串：把标题删干净就该真的删掉。
   * 2026-11-22 修的 bug —— 原来这里是 `if (name && name !== prev)`，
   * 空值被这一条挡掉不提交，于是退出编辑态时 h1 又把**数据里的旧标题**渲染回来，
   * 用户看到的就是"按删除键把标题删没了，一松手它又出现"。
   */
  if (name !== prev) emit('rename', name)
}

/** 插入图片：交给正文编辑器（它会先切进编辑态再弹选图） */
function onImage() {
  bodyRef.value?.insertImage()
}

/** 语音：还没有这个能力，给一句真话，不做个点了没反应的按钮 */
function onVoice() {
  voiceHint.value = true
  setTimeout(() => { voiceHint.value = false }, 2600)
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

/** 完成 / 返回：先把正文里没落库的草稿写下去，再退出 */
function handleClose() {
  bodyRef.value?.flush()
  emit('close')
}
</script>

<style scoped>
.detail-page-wrapper {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background-color: var(--color-bg-card); z-index: 100;
  display: flex; flex-direction: column;
  animation: slideInPage 0.28s var(--ease-slide);
}

/* 顶栏：无分割线、无底条 —— 靠留白跟内容分开（Materials：不给控件垫纯色） */
.detail-header {
  flex: 0 0 auto;
  height: var(--header-height);
  display: flex; align-items: center;
  padding: 0 12px;
  position: relative;          /* 菜单要相对顶栏定位 */
  -webkit-user-select: none; user-select: none;
}
.back-link-btn {
  background: none; border: none; color: var(--color-accent);
  font-size: var(--text-15); font-weight: 500; cursor: pointer;
  min-height: 44px; padding: 0 4px;
  display: flex; align-items: center; gap: 2px;
}

/* 右上两枚图标：34 视觉宽度、44 高度撑足热区 */
.top-actions { margin-left: auto; display: flex; align-items: center; gap: 2px; }
.icon-btn {
  width: 34px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.icon-btn:active { opacity: 0.55; }

/* 竖排菜单：右边缘对齐顶栏，向下弹（往上会顶出屏幕） */
.top-menu {
  position: absolute; top: 46px; right: 8px; z-index: 20;
  display: flex; flex-direction: column; gap: 4px;
  animation: menuPop 0.16s var(--ease-pop) backwards;
}
.menu-item {
  display: flex; align-items: center; gap: 5px;
  height: 36px; padding: 0 12px;
  border: none; border-radius: var(--radius-md);
  font-size: var(--text-13); font-weight: 500;
  cursor: pointer; white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.10);
  -webkit-tap-highlight-color: transparent;
}
.menu-item:active { transform: scale(0.96); }
.menu-item.fav { background: var(--color-accent-light); color: var(--color-accent); }
.menu-item.del { background: var(--color-danger-bg); color: var(--color-danger); }
@keyframes menuPop {
  from { opacity: 0; transform: translateY(-4px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* 点任何地方关菜单。放在菜单之下（z-index 10 < 20） */
.menu-mask { position: fixed; inset: 0; z-index: 10; }

.detail-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 22px 0;
  display: flex; flex-direction: column;
  /* 底部给浮起的工具栏留出位置，最后一行不被它压住 */
  padding-bottom: calc(96px + var(--safe-bottom));
}

/* 标题：整页唯一的大字。26px / 1.24 / -0.022em —— 字越大字距要越紧，否则看着松。
   空标题时高度仍在（1.24em），这样那块空白还能点进去改名。 */
.detail-title {
  margin: 0;
  min-height: 1.24em;
  font-size: var(--text-26);
  line-height: 1.24;
  font-weight: 650;
  letter-spacing: -0.022em;
  color: var(--color-text-primary);
  cursor: text;
  word-break: break-word;
}
.detail-title-input {
  width: 100%;
  margin: 0;
  padding: 0;
  min-height: 1.24em;
  background: none;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: var(--text-26);
  line-height: 1.24;
  font-weight: 650;
  letter-spacing: -0.022em;
  color: var(--color-text-primary);
}

/* 一道杠：原来日期行站的位置，现在只分隔标题与正文。
   比 1px 实线稍短一点（右边留 8px 不出头），看起来是"划了一道"，不是表格边框。 */
.title-rule {
  height: 1px;
  margin: 14px 8px 14px 0;
  background: var(--color-border-input);
}

/* 看图：黑底铺满 + contain。z-index 高于详情页本身（100），低于看图时的系统手势层 */
.photo-viewer {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0, 0, 0, 0.94);
  display: flex; align-items: center; justify-content: center;
  animation: viewerIn 0.16s ease;
}
.photo-viewer img {
  max-width: 100%; max-height: 100%;
  object-fit: contain;
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
  left: 12px; right: 12px;
  bottom: calc(12px + var(--safe-bottom));
  height: 56px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 0 0 0.5px rgba(0, 0, 0, 0.05),
    0 8px 24px rgba(0, 0, 0, 0.10);
  display: flex; align-items: center; gap: 2px;
  padding: 0 6px;
}
.tool {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tool:active { opacity: 0.55; }
.tool-spacer { flex: 1; }

/* 完成：整页唯一的实心色块 —— 高频动作里最该被一下点到的那个 */
.done-btn {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 122, 255, 0.34);
  -webkit-tap-highlight-color: transparent;
}
.done-btn:active { transform: scale(0.94); }

@keyframes slideInPage { from { transform: translateX(100%); } to { transform: translateX(0); } }
</style>
