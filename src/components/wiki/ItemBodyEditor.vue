<!--
  记录正文编辑积木（2026-11-21 单层重构 · 2026-11-22 版式重做）
  职责：一条记录自己的正文——阅读态渲染 Markdown（含 id:// 图片解析），点一下进编辑态。
  边界：只管正文，不改标题、不删记录（那些由 WikiDetail / App 接）。

  2026-11-22 三处改动（对齐笔记类 App 的写法）：
  1. **边打边存**：不再有「保存 / 取消」按钮。输入后 600ms 静默落库，
     离开页面时再补一次。用户要的是"改到哪存到哪"，不是"记得点保存"。
  2. **正文区不再挂按钮**：「插入图片」搬到 WikiDetail 的底部工具栏（那是全局动作，
     按拇指热区该落底部）；textarea 去掉边框和底色，跟阅读态长得一样 —— 编辑时
     文字不该突然被塞进一个框里。
  3. 字号 15 → 17、行高 1.75：正文基本字号。15px 是脚注档，一整屏读下来会累。

  暴露给父级（底部工具栏要用）：startEdit / insertImage / flush / isEditing
-->
<template>
  <div class="body-editor">
    <!-- 阅读态 -->
    <template v-if="!editing">
      <!-- 正文为空时不显示任何占位文字：用户要的是"什么都没写就什么都不显示" -->
      <div v-if="!record.wiki" class="body-placeholder" @click="startEdit"></div>
      <div v-else ref="readRef" class="body-read" v-html="renderedHtml" @click="startEdit"></div>
      <!-- 落款：只在阅读态出现在正文末尾右下角（年月日 + 周几，不含时间） -->
      <div v-if="metaText" class="body-sign">{{ metaText }}</div>
    </template>

    <!-- 编辑态：无边框、无底色，跟阅读态同一套排版，只是多一个光标。
         没有 placeholder —— 空的时候只剩一根闪的光标，那就是"可以写"的唯一提示。 -->
    <template v-else>
      <textarea
        ref="textareaRef"
        v-model="draft"
        class="body-input"
        placeholder=""
      ></textarea>
      <input ref="fileInputRef" type="file" accept="image/*" hidden @change="handleImageSelected" />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  renderMarkdownToHtml,
  resolveImagesAsync
} from '../../utils/markdownParser'
import { saveImage, getImageUrl } from '../../composables/useImageStore'

const props = defineProps({
  record: { type: Object, required: true },
  /** 空记录进来时直接进编辑态（光标已经在闪）—— 用户要的"直接写" */
  autoEdit: { type: Boolean, default: false },
  /** 落款文案（年月日 + 周几）。空串 = 不显示；只出现在阅读态末尾右下角 */
  metaText: { type: String, default: '' }
})
const emit = defineEmits(['save'])

const editing      = ref(!!props.autoEdit)
const draft        = ref(props.autoEdit ? (props.record.wiki || '') : '')
const readRef      = ref(null)
const textareaRef  = ref(null)
const fileInputRef = ref(null)

/** 自动保存的防抖计时器：停手 600ms 再落库，边打边存但不每敲一个字就写一次盘 */
let saveTimer = null
const SAVE_DELAY = 600

const renderedHtml = computed(() => renderMarkdownToHtml(props.record.wiki || ''))

/** 阅读态的图片是 id:// 引用，必须异步换成 blob URL 才能显示 */
async function resolveReadImages() {
  if (!readRef.value) return
  await nextTick()
  try {
    readRef.value.innerHTML = await resolveImagesAsync(readRef.value.innerHTML)
  } catch {
    // 图片解析失败不阻塞阅读（正文其余部分照常可看）
  }
}

// 阅读区是 v-if 出来的：挂载那一刻 ref 可能还是 null，所以盯着 ref 本身（这个坑踩过）
watch(readRef, (el) => { if (el) resolveReadImages() })
// 切到另一条记录时，正文换了，重解析图片
watch(() => props.record.id, () => {
  flush()
  editing.value = false
  if (readRef.value) resolveReadImages()
})
onMounted(() => {
  if (readRef.value) resolveReadImages()
  // 空记录进来：初始就是编辑态（上面 editing 直接初始化成 true），这里只补一次聚焦
  if (props.autoEdit) {
    nextTick(() => {
      const ta = textareaRef.value
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    })
  }
})
onBeforeUnmount(() => flush())

function startEdit() {
  if (editing.value) return
  draft.value = props.record.wiki || ''
  editing.value = true
  nextTick(() => {
    const ta = textareaRef.value
    if (!ta) return
    ta.focus()
    // 光标落到末尾：点进来通常是想接着写
    ta.setSelectionRange(ta.value.length, ta.value.length)
  })
}

/** 输入时起一个 600ms 的定时器；停了就存 */
watch(draft, (v) => {
  if (!editing.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = null; emit('save', v) }, SAVE_DELAY)
})

/** 立刻把还没落库的草稿写下去（离开页面 / 卸载 / 插图后） */
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (editing.value && draft.value !== (props.record.wiki || '')) emit('save', draft.value)
}

// ========== 插图（这套做法：存进 IndexedDB，正文只留 id:// 引用） ==========

/** 由底部工具栏调用：不在编辑态就先切进去再选图 */
function insertImage() {
  if (!editing.value) startEdit()
  nextTick(() => fileInputRef.value?.click())
}

async function handleImageSelected(event) {
  const file = event.target.files?.[0]
  if (!file || !file.type.startsWith('image/')) { alert('请选择图片文件'); return }
  try {
    const imgId = await saveImage(file)
    await getImageUrl(imgId) // 预热一次，阅读态切换时更快
    const alt = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]()]/g, '')
    insertAtCursor('\n![' + alt + '](id://' + imgId + ')\n')
    // 插图算一次修改，别等 600ms —— 用户选完图就期待它已经在正文里了
    flush()
  } catch {
    alert('图片保存失败')
  }
  event.target.value = ''
}

function insertAtCursor(text) {
  const ta = textareaRef.value
  if (!ta) { draft.value += text; return }
  const start = ta.selectionStart
  const end = ta.selectionEnd
  draft.value = draft.value.slice(0, start) + text + draft.value.slice(end)
  nextTick(() => {
    ta.focus()
    const pos = start + text.length
    ta.setSelectionRange(pos, pos)
  })
}

defineExpose({ startEdit, insertImage, flush, isEditing: editing })
</script>

<style scoped>
.body-editor { flex: 1; display: flex; flex-direction: column; }

/* 占位：空正文时什么都不显示 —— 只留一块可点区域，点一下就能写 */
.body-placeholder {
  min-height: 120px;
  padding: 2px 0;
  cursor: text;
}

/* 正文：17px / 1.75。跟编辑态同一套字号行高，切换时不跳字 */
.body-read {
  font-size: var(--text-17); line-height: 1.75; color: var(--color-text-primary);
  cursor: text; overflow-wrap: anywhere;
}
.body-read :deep(p) { margin: 0 0 16px; }
.body-read :deep(p:last-child) { margin-bottom: 0; }
.body-read :deep(img) { max-width: 100%; border-radius: var(--radius-2xl); margin: 4px 0 16px; }

/* 落款：正文之后、右对齐。12px 灰，比正文轻两档 —— 它是"看完才知道"的信息，
   不该在写的时候抢注意力（所以只在阅读态出现）。 */
.body-sign {
  margin-top: 28px;
  text-align: right;
  font-size: var(--text-12);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

/* 编辑态：无边框、无底色、无圆角 —— 视觉上跟阅读态是同一个东西，只是能改 */
.body-input {
  flex: 1;
  width: 100%;
  min-height: 320px;
  box-sizing: border-box;
  padding: 0;
  background: none;
  border: none;
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: var(--text-17);
  line-height: 1.75;
  color: var(--color-text-primary);
}
</style>
