<!--
  记录正文编辑积木（2026-11-21 单层重构 · 2026-11-22 版式重做 · 2026-11-22 图片附件化）
  职责：一条记录自己的正文——上方是图片区（PhotoGrid），下面是文字；点文字进编辑态。
  边界：只管正文和图片的**显示**，不改标题、不删记录、不直接改 record.pics（那些由 WikiDetail / App 接）。

  2026-11-22 四处改动：
  1. **边打边存**：不再有「保存 / 取消」按钮。输入后 600ms 静默落库，
     离开页面时再补一次。用户要的是"改到哪存到哪"，不是"记得点保存"。
  2. **正文区不再挂按钮**：「插入图片」搬到 WikiDetail 的底部工具栏（那是全局动作，
     按拇指热区该落底部）；textarea 去掉边框和底色，跟阅读态长得一样 —— 编辑时
     文字不该突然被塞进一个框里。
  3. 字号 15 → 17、行高 1.75：正文基本字号。15px 是脚注档，一整屏读下来会累。
  4. **图片不再进正文**（图片附件化）：图存在 IndexedDB，记录上只留 `pics` 数组，
     正文永远是纯文字。所以编辑时看不到 `![alt](id://…)` 那种源码，图固定在正文上方。

  暴露给父级（底部工具栏要用）：startEdit / insertImage / flush / isEditing
-->
<template>
  <div class="body-editor">
    <!-- 图片区（2026-11-22 图片附件化）：不管阅读态还是编辑态，都固定挂在正文上方。
         图已不在正文里，所以编辑时看不到 `![](...)` 那种源码 —— 用户要的正是这一点。 -->
    <PhotoGrid
      v-if="record.pics && record.pics.length"
      :pics="record.pics"
      @preview="(i) => $emit('preview-pic', i)"
      @delete="(i) => $emit('delete-pic', i)"
    />

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
import PhotoGrid from './PhotoGrid.vue'

const props = defineProps({
  record: { type: Object, required: true },
  /** 空记录进来时直接进编辑态（光标已经在闪）—— 用户要的"直接写" */
  autoEdit: { type: Boolean, default: false },
  /** 落款文案（年月日 + 周几）。空串 = 不显示；只出现在阅读态末尾右下角 */
  metaText: { type: String, default: '' }
})
const emit = defineEmits(['save', 'add-pic', 'preview-pic', 'delete-pic', 'editing-change'])

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

/**
 * 进出编辑态要告诉父级（2026-11-23）：详情页的底部工具栏**只在编辑态出现**。
 *
 * ⚠ 必须 immediate：新建记录进来时 `editing` 的初值就是 true（autoEdit），
 *   没有"变化"可等 —— 不加 immediate 父级永远收不到第一次通知，
 *   结果就是「点记录进编辑态了，工具栏却不在」（2026-11-23 实测反馈）。
 */
watch(editing, (v) => emit('editing-change', v), { immediate: true })

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

/**
 * 结束编辑、回到阅读态（底部「完成」键）。
 * 先把没落库的草稿写下去再退 —— 不然 600ms 防抖还没到就退出，最后几个字会丢。
 */
function exitEdit() {
  if (!editing.value) return
  flush()
  editing.value = false
}

/**
 * 加粗（2026-11-23 取消标题系统后的「标题行」工具）。
 *
 * 正文是 textarea + markdown，所以加粗 = 插一对 `**…**`：
 *   · 有选中文字 → 前后各补一个 `**`，光标落在包裹文字之后；
 *   · 没选中 → 插 `****` 并把光标放进中间，接着打的字就是粗的（这就是用户要的
 *     「点一下就能输入跟正文一样大、但比较粗的字」）。
 *
 * 为什么不做所见即所得：那是换编辑器的活（contenteditable + 富文本模型），
 * 会连带动摇「正文只存纯文本」这个既有约定；先沿用全文一致的 markdown 口径。
 */
function insertBold() {
  const wrap = () => {
    const ta = textareaRef.value
    if (!ta) return
    const v = ta.value
    const start = ta.selectionStart ?? v.length
    const end = ta.selectionEnd ?? v.length
    const sel = v.slice(start, end)
    const marks = '**'
    draft.value = v.slice(0, start) + marks + sel + marks + v.slice(end)
    const caret = start + marks.length + sel.length + (sel ? marks.length : 0)
    nextTick(() => ta.setSelectionRange(caret, caret))
  }
  if (!editing.value) {
    startEdit()
    // startEdit 自己有一层 nextTick（聚焦 + 光标到末尾），排到它之后再动选区
    setTimeout(wrap, 0)
    return
  }
  wrap()
}

// ========== 插图（2026-11-22 图片附件化：图存 IndexedDB，id 交给父级写进 record.pics） ==========

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
    await getImageUrl(imgId) // 预热一次，图区立即能显示
    // 2026-11-22 起不再往正文里插 `![alt](id://xxx)`：
    // 图片改为附件（record.pics），正文只存文字。父级负责把它写进记录。
    emit('add-pic', imgId)
  } catch {
    alert('图片保存失败')
  }
  event.target.value = ''
}

defineExpose({ startEdit, exitEdit, insertImage, insertBold, flush, isEditing: editing })
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
