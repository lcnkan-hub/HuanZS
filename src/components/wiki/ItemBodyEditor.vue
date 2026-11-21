<!--
  记录正文编辑积木（2026-11-21 单层重构新增）
  职责：一条记录自己的正文——阅读态渲染 Markdown（含 id:// 图片解析），点一下进编辑态。
  边界：只管正文，不改标题、不删记录（那些由 WikiDetail / App 接）。
  为什么单独成块：原来主记录的 wiki 字段在界面上没有任何入口（只有王冠代记与检索在用），
  「点添加就直接写」必须先把这块补上。
-->
<template>
  <div class="body-editor">
    <!-- 阅读态 -->
    <template v-if="!editing">
      <div
        v-if="!record.wiki"
        class="body-placeholder"
        @click="startEdit"
      >点这里写正文…</div>
      <div
        v-else
        ref="readRef"
        class="body-read"
        v-html="renderedHtml"
        @click="startEdit"
      ></div>
    </template>

    <!-- 编辑态 -->
    <template v-else>
      <textarea
        ref="textareaRef"
        v-model="draft"
        class="body-input"
        placeholder="写点什么…"
      ></textarea>
      <div class="body-actions">
        <button class="ghost-btn" type="button" @click="triggerImageInsert">
          <AppIcon name="plus" :size="14" /> 插入图片
        </button>
        <input ref="fileInputRef" type="file" accept="image/*" hidden @change="handleImageSelected" />
        <span class="spacer"></span>
        <button class="cancel-btn" type="button" @click="cancelEdit">取消</button>
        <button class="save-btn" type="button" @click="saveEdit">保存</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import {
  renderMarkdownToHtml,
  resolveImagesAsync
} from '../../utils/markdownParser'
import { saveImage, getImageUrl } from '../../composables/useImageStore'

const props = defineProps({
  record: { type: Object, required: true }
})
const emit = defineEmits(['save'])

const editing      = ref(false)
const draft        = ref('')
const readRef      = ref(null)
const textareaRef  = ref(null)
const fileInputRef = ref(null)

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

// 阅读区是 v-if 出来的：挂载那一刻 ref 可能还是 null，所以盯着 ref 本身（与 SubEntryEditor 同一个坑）
watch(readRef, (el) => { if (el) resolveReadImages() })
// 切到另一条记录时，正文换了，重解析图片
watch(() => props.record.id, () => {
  editing.value = false
  if (readRef.value) resolveReadImages()
})
onMounted(() => { if (readRef.value) resolveReadImages() })

function startEdit() {
  draft.value = props.record.wiki || ''
  editing.value = true
  nextTick(() => { if (textareaRef.value) textareaRef.value.focus() })
}

function cancelEdit() {
  editing.value = false
  nextTick(resolveReadImages)
}

function saveEdit() {
  emit('save', draft.value)
  editing.value = false
  nextTick(resolveReadImages)
}

// ========== 插图（与 SubEntryEditor 同一套：存进 IndexedDB，正文只留 id:// 引用） ==========

function triggerImageInsert() {
  fileInputRef.value?.click()
}

async function handleImageSelected(event) {
  const file = event.target.files?.[0]
  if (!file || !file.type.startsWith('image/')) { alert('请选择图片文件'); return }
  try {
    const imgId = await saveImage(file)
    await getImageUrl(imgId) // 预热一次，阅读态切换时更快
    const alt = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]()]/g, '')
    insertAtCursor('\n![' + alt + '](id://' + imgId + ')\n')
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
</script>

<style scoped>
.body-editor { margin-bottom: 20px; }

.body-placeholder {
  min-height: 88px; display: flex; align-items: center; justify-content: center;
  color: var(--color-text-muted); font-size: var(--text-14);
  background: var(--color-bg-subtle);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg); cursor: text;
}
.body-read {
  font-size: var(--text-15); line-height: 1.7; color: var(--color-text-primary);
  cursor: text; overflow-wrap: anywhere;
}
.body-read :deep(img) { max-width: 100%; border-radius: var(--radius-md); }

.body-input {
  width: 100%; min-height: 180px; box-sizing: border-box;
  padding: 12px 14px; font-size: var(--text-15); line-height: 1.7;
  color: var(--color-text-primary); background: var(--color-bg-modal);
  border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  font-family: inherit; resize: vertical;
}
.body-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.spacer { flex: 1; }
.ghost-btn {
  display: flex; align-items: center; gap: 4px;
  min-height: 44px; padding: 0 12px;
  background: var(--color-bg-subtle); color: var(--color-text-muted);
  border: 1px solid var(--color-border-input); border-radius: var(--radius-md);
  font-size: var(--text-13); font-weight: 500; cursor: pointer;
}
.ghost-btn:active { opacity: 0.7; }
.cancel-btn {
  background: var(--color-border-light); color: var(--color-text-neutral);
  border: none; padding: 9px 18px; min-height: 44px; border-radius: var(--radius-md);
  font-size: var(--text-14); font-weight: 500; cursor: pointer;
}
.save-btn {
  background: var(--color-accent); color: var(--color-text-on-accent);
  border: none; padding: 9px 18px; min-height: 44px; border-radius: var(--radius-md);
  font-size: var(--text-14); font-weight: 500; cursor: pointer;
}
</style>
