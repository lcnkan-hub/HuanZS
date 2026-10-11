<!--
  子词条编辑器积木
  独立编辑页 — 支持阅读和编辑两种模式：
  - 阅读模式：Markdown 渲染（含图片）
  - 编辑模式：工具栏 + textarea + 图片插入 + 缩略图预览
  

  Props: childItem(子词条对象), parentName(主词条名称)
  Emits: back, save(wiki文本), delete
-->
<template>
  <div class="sub-editor-wrapper">
    <!-- 顶部栏 -->
    <div class="sub-editor-header">
      <button class="back-link-btn" @click="$emit('back')">
        <AppIcon name="back" :size="16" /> 返回
      </button>
      <span class="sub-editor-title">
        <AppIcon name="doc" :size="16" /> {{ childItem.name }}
      </span>
      <button
        v-if="currentView === 'read'"
        class="state-toggle-btn"
        @click="switchView('edit')"
      >
        <AppIcon name="edit" :size="14" /> 编辑
      </button>
      <button
        v-else
        class="state-toggle-btn isEditing"
        @click="handlePublish"
      >
        <AppIcon name="check" :size="14" /> 发布
      </button>
    </div>

    <!-- 主体 -->
    <div class="sub-editor-body">
      <!-- 元信息条 -->
      <div class="meta-info-strip">
        <span class="meta-badge"><AppIcon name="tag" :size="11" /> {{ childItem.name }}</span>
        <span class="meta-parent"><AppIcon name="book-open" :size="11" /> {{ parentName }}</span>
        <span class="meta-author"><AppIcon name="author" :size="11" /> {{ childItem.creator }}</span>
        <span class="meta-time" v-if="childItem.time"><AppIcon name="clock" :size="11" /> {{ childItem.time }}</span>
        <button class="delete-child-btn" @click="$emit('delete')"><AppIcon name="trash" :size="12" /> 删除</button>
      </div>

      <!-- ===== 阅读模式 ===== -->
      <div v-if="currentView === 'read'" class="markdown-render-view" ref="readViewRef" v-html="renderedHtml"></div>

      <!-- ===== 编辑模式 ===== -->
      <div v-else-if="currentView === 'edit'" class="markdown-edit-view">
        <div class="mobile-keyboard-toolbar">
          <span class="toolbar-hint">快速插入：</span>
          <button class="tool-tag-btn" @click="insertSyntax('# ')"># 大标题</button>
          <button class="tool-tag-btn" @click="insertSyntax('## ')">## 中标题</button>
          <button class="tool-tag-btn" @click="insertSyntax('**', '**')">**加粗**</button>
          <button class="tool-tag-btn" @click="insertSyntax('`', '`')">`按键`</button>
          <button class="tool-tag-btn color-blue-tag" @click="insertSyntax('<blue>', '</blue>')">
            <AppIcon name="color-blue" :size="12" /> 深海蓝
          </button>
          <button class="tool-tag-btn color-brown-tag" @click="insertSyntax('<brown>', '</brown>')">
            <AppIcon name="color-brown" :size="12" /> 暖木棕
          </button>
          <button class="tool-tag-btn color-green-tag" @click="insertSyntax('<green>', '</green>')">
            <AppIcon name="color-green" :size="12" /> 苔藓绿
          </button>
          <button class="tool-tag-btn img-insert-btn" @click="triggerImageInsert">
            <AppIcon name="plus" :size="12" /> 插入图片
          </button>
        </div>

        <textarea
          v-model="editingText"
          placeholder="在此撰写百科内容。支持 Markdown 语法、颜色标签和图片插入。"
          class="markdown-textarea"
          ref="textareaRef"
        ></textarea>

        <!-- 图片预览栏 -->
        <div v-if="imagePreviews.length > 0" class="image-preview-bar">
          <div v-for="img in imagePreviews" :key="img.id" class="preview-thumb" :class="{ loading: img.loading }">
            <img v-if="img.url && !img.loading" :src="img.url" :alt="img.name" />
            <span v-else class="thumb-placeholder">🖼️</span>
            <button class="thumb-remove" @click="removeImage(img.id)">✕</button>
          </div>
        </div>
        <input type="file" ref="fileInputRef" accept="image/*" style="display: none" @change="handleImageSelected" />
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { renderMarkdownToHtml, resolveImagesAsync } from '../../utils/markdownParser'
import { saveImage, getImageUrl, extractImageIds } from '../../composables/useImageStore'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  childItem:  { type: Object, required: true },
  parentName: { type: String, default: '' }
})
const emit = defineEmits(['back', 'save', 'delete'])

const currentView  = ref('read')           // 'read' | 'edit'
const editingText  = ref(props.childItem.wiki || '')
const textareaRef  = ref(null)
const fileInputRef = ref(null)
const readViewRef  = ref(null)
const imagePreviews = ref([])

watch(() => props.childItem?.id, () => {
  currentView.value = 'read'
  editingText.value = props.childItem.wiki || ''
  refreshImagePreviews()
})

// ========== 视图切换 ==========

const switchView = (view) => {
  currentView.value = view
  if (view === 'edit') {
    refreshImagePreviews()
    nextTick(() => { if (textareaRef.value) textareaRef.value.focus() })
  } else {
    nextTick(() => resolveReadViewImages())
  }
}

// ========== 发布 ==========

const handlePublish = () => {
  emit('save', editingText.value)
  currentView.value = 'read'
  nextTick(() => resolveReadViewImages())
}

// ========== 光标插入语法 ==========

const insertSyntax = (before, after = '') => {
  if (currentView.value !== 'edit') { switchView('edit'); nextTick(() => insertSyntax(before, after)); return }
  const textarea = textareaRef.value
  if (!textarea) return
  const startPos = textarea.selectionStart, endPos = textarea.selectionEnd
  const currentVal = editingText.value, selectedText = currentVal.substring(startPos, endPos)
  editingText.value = currentVal.substring(0, startPos) + before + selectedText + after + currentVal.substring(endPos)
  nextTick(() => {
    textarea.focus()
    const newPos = selectedText.length > 0 ? startPos + before.length + selectedText.length + after.length : startPos + before.length
    textarea.setSelectionRange(newPos, newPos)
  })
}

// ========== 图片 ==========

const triggerImageInsert = () => { fileInputRef.value?.click() }

const handleImageSelected = async (event) => {
  const file = event.target.files?.[0]
  if (!file || !file.type.startsWith('image/')) { alert('请选择图片文件'); return }
  const previewId = 'preview-' + Date.now()
  imagePreviews.value.push({ id: previewId, url: null, name: file.name, loading: true })
  try {
    const imgId = await saveImage(file)
    const blobUrl = await getImageUrl(imgId)
    const preview = imagePreviews.value.find(p => p.id === previewId)
    if (preview) { preview.id = imgId; preview.url = blobUrl; preview.loading = false }
    const alt = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]()]/g, '')
    insertSyntax('![' + alt + '](id://' + imgId + ')\n')
  } catch {
    imagePreviews.value = imagePreviews.value.filter(p => p.id !== previewId)
    alert('图片保存失败')
  }
  event.target.value = ''
}

const removeImage = (imgId) => {
  imagePreviews.value = imagePreviews.value.filter(p => p.id !== imgId)
  editingText.value = editingText.value.replace(new RegExp('!\\[[^\\]]*\\]\\(id://' + imgId + '\\)\\n?', 'g'), '')
}

const refreshImagePreviews = () => {
  const text = currentView.value === 'edit' ? editingText.value : (props.childItem.wiki || '')
  const ids = extractImageIds(text)
  imagePreviews.value = []
  ids.forEach(async (id) => {
    const url = await getImageUrl(id)
    if (url) imagePreviews.value.push({ id, url, name: '', loading: false })
  })
}

// ========== 渲染 ==========

const renderedHtml = computed(() => renderMarkdownToHtml(
  currentView.value === 'edit' ? editingText.value : (props.childItem.wiki || '')
))

const resolveReadViewImages = async () => {
  if (!readViewRef.value) return
  await nextTick()
  try {
    const html = await resolveImagesAsync(readViewRef.value.innerHTML)
    readViewRef.value.innerHTML = html
  } catch {
    // 图片解析失败不阻塞页面
  }
}

// ⚠️ 首次挂载必须自己把这两件事做掉（2026-10-10 真浏览器查实）：
//   以前只有「切换子词条」(watch childItem.id) 和「编辑完切回阅读」(switchView/handlePublish) 才触发，
//   于是冷开编辑器时 —— 阅读态图片永远停在 src="id://..."（坏图）、编辑态图片预览栏永远是空的。
//   表现就是"有时候能看到图、有时候看不到"，很难复现。
onMounted(() => {
  refreshImagePreviews()   // 它只读 props，不依赖 DOM，可以放心在挂载时调
})

// 阅读区那层是 v-if 出来的：编辑器挂载完的那一刻 readViewRef 可能**还是 null**，
// 于是 resolveReadViewImages 一进门就 return 了（2026-10-10 实测就是这么静默失败的）。
// 所以不能赌时机，改成盯着 ref 本身 —— 元素真出现（含切换视图重建）时才解析。
watch(readViewRef, (el) => { if (el) resolveReadViewImages() })

</script>

<style scoped>
.sub-editor-wrapper {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background-color: var(--color-bg-card); z-index: 110; display: flex; flex-direction: column;
  animation: slideInSub 0.28s var(--ease-slide);
}
.sub-editor-header {
  height: var(--header-height); border-bottom: 1px solid var(--color-border-light);
  display: flex; justify-content: space-between; align-items: center;
  /* 原本是 0 12px 0 16px（左右不等），和详情页的 0 16px 对不齐；统一 16px */
  padding: 0 16px; background: var(--color-bg-card); -webkit-user-select: none; user-select: none; gap: 8px;
}
.back-link-btn { background: none; border: none; color: var(--color-accent); font-size: var(--text-15); font-weight: 500; cursor: pointer; padding: 0; min-height: 44px; display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.sub-editor-title { font-size: var(--text-14); font-weight: 600; color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.state-toggle-btn { background-color: var(--color-border-light); color: var(--color-accent); border: none; border-radius: var(--radius-md); padding: 6px 12px; min-height: 44px; font-size: var(--text-12); font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.state-toggle-btn.isEditing { background-color: var(--color-accent); color: var(--color-text-on-accent); }

.sub-editor-body { flex: 1; overflow-y: auto; padding: 16px 20px 40px 20px; display: flex; flex-direction: column; -webkit-overflow-scrolling: touch; }
.meta-info-strip { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: var(--text-11); color: var(--color-text-muted); margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px dashed var(--color-border-input); }
.meta-badge { background-color: var(--color-bg-input); color: var(--color-text-secondary); font-weight: 600; padding: 3px 8px; border-radius: var(--radius-sm); font-size: var(--text-11); display: flex; align-items: center; gap: 3px; }
.meta-parent { background-color: var(--color-toolbar-blue-bg); color: var(--color-markdown-blue); font-weight: 500; padding: 3px 8px; border-radius: var(--radius-sm); font-size: var(--text-11); display: flex; align-items: center; gap: 3px; }
.meta-author, .meta-time { display: flex; align-items: center; gap: 3px; }
/* 元信息条里的删除键：条本身只有 20 出头，撑到 44 会把整条拱高 23px，
   改用外扩命中区 —— 右侧是 flex 尾部、下方 12px 全是留白，多出来的面积不压任何别的东西。
   就算真点错也不会误删：WikiDetail 那边的 handleChildDelete 还压着一道 confirm。 */
.delete-child-btn { background-color: var(--color-danger-bg); color: var(--color-danger); border: none; border-radius: var(--radius-sm); padding: 4px 8px; font-size: var(--text-11); cursor: pointer; margin-left: auto; display: flex; align-items: center; gap: 3px; position: relative; }
.delete-child-btn::after { content: ''; position: absolute; inset: -11px -8px; }

.markdown-render-view { font-size: var(--text-15); line-height: 1.75; color: var(--color-text-secondary); font-family: var(--font-system); word-break: break-all; }
:deep(.markdown-render-view h1) { font-size: var(--text-20); font-weight: 700; color: var(--color-text-primary); margin: 14px 0 10px 0; padding-bottom: 4px; border-bottom: 1px solid var(--color-border-light); }
:deep(.markdown-render-view h2) { font-size: var(--text-17); font-weight: 600; color: var(--color-text-primary); margin: 16px 0 8px 0; }
:deep(.markdown-render-view h3) { font-size: var(--text-15); font-weight: 600; color: var(--color-text-secondary); margin: 12px 0 6px 0; }
:deep(.markdown-render-view strong) { color: var(--color-text-primary); font-weight: 700; background: linear-gradient(to top, rgba(255,204,0,0.15) 30%, transparent 30%); padding: 0 2px; }
:deep(.md-inline-code) { font-family: monospace; background-color: var(--color-border-light); color: #d73a49; padding: 2px 5px; border-radius: 4px; font-size: var(--text-13); border: 1px solid var(--color-border-input); margin: 0 2px; }
:deep(.md-image) { max-width: 100%; height: auto; border-radius: var(--radius-md); margin: 8px 0; display: block; }
:deep(.empty-render-placeholder) { text-align: center; color: var(--color-text-muted); font-size: var(--text-13); line-height: 1.8; margin-top: 60px; }
:deep(.m-color-blue)  { color: var(--color-markdown-blue);  font-weight: 600; }
:deep(.m-color-brown) { color: var(--color-markdown-brown); font-weight: 600; }
:deep(.m-color-green) { color: var(--color-markdown-green); font-weight: 600; }

.markdown-edit-view { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.mobile-keyboard-toolbar { display: flex; align-items: center; gap: 6px; overflow-x: auto; white-space: nowrap; padding: 4px 2px 8px 2px; border-bottom: 1px solid var(--color-border-light); }
.mobile-keyboard-toolbar::-webkit-scrollbar { display: none; }
.toolbar-hint { font-size: var(--text-10); color: var(--color-text-muted); flex-shrink: 0; }
/* 工具条按钮撑到 44：这条是写作时点得最密的八个键，22 高在真机上是"看得见点不着"。
   横向滚动容器会把纵向的外扩命中区裁掉，所以只能老老实实靠 min-height 撑。 */
.tool-tag-btn { background: var(--color-border-light); border: none; color: var(--color-text-secondary); border-radius: var(--radius-sm); padding: 5px 8px; min-height: 44px; font-size: var(--text-11); font-weight: 500; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; gap: 3px; -webkit-appearance: none; appearance: none; }
.tool-tag-btn:active { background: var(--color-border-input); }
.img-insert-btn { background: var(--color-success-bg); color: var(--color-success-deep); }
.color-blue-tag  { background: var(--color-toolbar-blue-bg);  color: var(--color-markdown-blue); }
.color-brown-tag { background: var(--color-toolbar-brown-bg); color: var(--color-markdown-brown); }
.color-green-tag { background: var(--color-toolbar-green-bg); color: var(--color-markdown-green); }
.markdown-textarea { flex: 1; min-height: 200px; width: 100%; border: 1px solid var(--color-border-input); background: var(--color-bg-modal); border-radius: var(--radius-xl); padding: 12px; box-sizing: border-box; font-size: var(--text-15); font-family: var(--font-mono); line-height: 1.6; color: var(--color-text-primary); resize: none; -webkit-appearance: none; appearance: none; }
.markdown-textarea:focus { outline: none; border-color: var(--color-accent); background: var(--color-bg-card); }

/* 上下留 10 而不是 8：下面 ✕ 的命中区要往上张 10px，容器裁切边得让它张得开 */
.image-preview-bar { display: flex; gap: 8px; overflow-x: auto; padding: 10px 0; border-top: 1px solid var(--color-border-light); }
.image-preview-bar::-webkit-scrollbar { display: none; }
/* 圆角从这一层下放到图片本身：原来靠 overflow:hidden 裁角，那也把 ✕ 的外扩命中区一起裁了
   （量出来只剩约 36）。裁角交给各自的 border-radius 之后，这一层就不必再裁东西。 */
.preview-thumb { position: relative; width: 60px; height: 60px; flex-shrink: 0; border-radius: var(--radius-sm); border: 1px solid var(--color-border-input); background: var(--color-bg-input); }
.preview-thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm); }
.thumb-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: var(--text-24); border-radius: var(--radius-sm); }
/* 缩略图上的 ✕：18px 连点中都要看运气。视觉放到 24，命中区外扩到 44×44。
   再大就会把 60px 的图整个盖住，点图本身也变成删除，所以到这个尺寸为止。 */
.thumb-remove { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: var(--color-text-on-dark); border: none; border-radius: 50%; width: 24px; height: 24px; font-size: var(--text-12); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.thumb-remove::after { content: ''; position: absolute; inset: -10px; }

.empty-tip { text-align: center; color: var(--color-text-muted); font-size: var(--text-13); line-height: 1.8; padding: 40px 20px; }
.empty-tip code { background: var(--color-bg-input); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); font-size: var(--text-12); }

@keyframes slideInSub { from { transform: translateX(100%); } to { transform: translateX(0); } }
</style>
