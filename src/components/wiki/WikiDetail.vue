<!--
  主词条详情页积木
  展示主词条的子词条列表，支持添加/删除子词条，点击子词条进入编辑器
  Props: openedItem(主词条对象), currentUser(当前用户名)
  Emits: close, add-child(name), save-child(childId, wiki), delete-child(childId)
-->
<template>
  <div class="detail-page-wrapper">
    <!-- 子词条编辑器叠加层 -->
    <SubEntryEditor
      v-if="editingChild"
      :childItem="editingChild"
      :parentName="openedItem.name"
      @back="editingChildId = null"
      @save="(wiki) => handleChildSave(wiki)"
      @delete="handleChildDelete"
    />

    <!-- 主词条列表视图 -->
    <template v-else>
      <!-- 顶部栏 -->
      <div class="detail-header">
        <button class="back-link-btn" @click="$emit('close')">
          <AppIcon name="back" :size="16" /> 返回
        </button>
        <span class="detail-page-title">
          <AppIcon name="book-open" :size="18" /> {{ openedItem.name }}
        </span>
        <button class="add-child-btn" @click="showAddChildModal = true">
          <AppIcon name="plus" :size="14" /> 添加子词条
        </button>
      </div>

      <!-- 主体 -->
      <div class="detail-body">
        <!-- 元信息条 -->
        <div class="meta-info-strip">
          <span class="meta-badge">
            <AppIcon name="tag" :size="12" /> 主词条
          </span>
          <span class="meta-author">
            <AppIcon name="author" :size="12" /> {{ openedItem.creator }}
          </span>
          <span class="meta-time" v-if="openedItem.time">
            <AppIcon name="clock" :size="12" /> {{ openedItem.time }}
          </span>
          <span class="meta-count">
            <AppIcon name="list" :size="12" /> {{ children.length }} 个子词条
          </span>
        </div>

        <!-- 子词条列表 -->
        <div class="child-list">
          <div v-if="children.length === 0" class="empty-tip">
            暂无子词条，点击右上角「添加子词条」创建第一个吧！
          </div>
          <div
            v-for="(child, index) in children"
            :key="child.id"
            class="child-card"
            :style="{ animationDelay: index * 60 + 'ms' }"
            @click="editingChildId = child.id"
          >
            <div class="child-card-left">
              <span class="child-name">
                <AppIcon name="doc" :size="15" /> {{ child.name }}
              </span>
              <span class="child-meta">
                <span v-if="child.creator">
                  <AppIcon name="author" :size="11" /> {{ child.creator }}
                </span>
                <span v-if="child.time">
                  <AppIcon name="clock" :size="11" /> {{ child.time }}
                </span>
                <span v-if="child.wiki" class="child-has-content">
                  <AppIcon name="has-content" :size="10" /> 有内容
                </span>
              </span>
            </div>
            <AppIcon name="forward" :size="18" class="child-arrow" />
          </div>
        </div>
      </div>
    </template>

    <!-- 添加子词条弹窗 -->
    <div v-if="showAddChildModal" class="modal-overlay" @click.self="showAddChildModal = false">
      <div class="modal-box">
        <h3>添加子词条</h3>
        <input
          type="text"
          v-model="newChildName"
          placeholder="请输入子词条名称"
          class="modal-input"
          @keyup.enter="handleAddChild"
        />
        <div class="modal-actions">
          <button class="cancel-btn" @click="showAddChildModal = false">取消</button>
          <button class="save-btn" @click="handleAddChild">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import SubEntryEditor from './SubEntryEditor.vue'

const props = defineProps({
  openedItem:  { type: Object, required: true },
  currentUser: { type: String, required: true }
})
const emit = defineEmits(['close', 'add-child', 'save-child', 'delete-child'])

// 正在编辑的子词条：只存 id，对象由 openedItem 现算，不存引用（A08）
// 存引用的问题：App 每次保存都用深拷贝整体替换 openedItem（见 handleSaveChildWiki），
// 存下来的那个对象当场作废；发布时父级又把 editingChild 置空，编辑器 v-if 立刻卸载 ——
// 用户被弹回列表，而编辑器内部刚切到的阅读态连同图片解析全成了白做。
// 改成现算之后「发布完留在阅读态看结果」才成立：openedItem 一换，这里自动跟到新对象。
const editingChildId    = ref(null)
const showAddChildModal = ref(false)
const newChildName      = ref('')

// 计算子词条列表
const children = computed(() => props.openedItem.children || [])

// 正在编辑的子词条（见 editingChildId 处的说明）：id 落空说明它已被删除或数据被替换
const editingChild = computed(() =>
  editingChildId.value
    ? children.value.find(c => c.id === editingChildId.value) || null
    : null
)

// 添加子词条
const handleAddChild = () => {
  if (!newChildName.value.trim()) return alert('名称不能为空')
  emit('add-child', newChildName.value.trim())
  newChildName.value = ''
  showAddChildModal.value = false
}

// 保存子词条内容
// 发布后**不能**把 editingChildId 置空（A08）：置空会让 v-if 立刻卸载编辑器，
// 用户被弹回子词条列表，而编辑器内部刚切到阅读态、刚解析完图片 —— 全白做。
// 留在编辑器里看发布结果才是「发布」该有的样子；要离开列表有「返回」按钮。
const handleChildSave = (wiki) => {
  if (editingChild.value) emit('save-child', editingChild.value.id, wiki)
}

// 删除子词条
const handleChildDelete = () => {
  if (editingChild.value && confirm('确定要删除这个子词条吗？')) {
    emit('delete-child', editingChild.value.id)
    editingChildId.value = null
  }
}
</script>

<style scoped>
.detail-page-wrapper {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background-color: var(--color-bg-card); z-index: 100; display: flex; flex-direction: column;
  animation: slideInPage 0.28s var(--ease-slide);
}
.detail-header {
  height: var(--header-height); border-bottom: 1px solid var(--color-border-light);
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 16px; background: var(--color-bg-card);
  -webkit-user-select: none; user-select: none;
}
/* 顶部栏里的三个可点件统一撑到 44 高：栏本身 55，够放，不必靠外扩命中区 */
.back-link-btn {
  background: none; border: none; color: var(--color-accent);
  font-size: var(--text-15); font-weight: 500; cursor: pointer; padding: 0;
  min-height: 44px;
  display: flex; align-items: center; gap: 4px;
}
.detail-page-title {
  font-size: var(--text-16); font-weight: 600; color: var(--color-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 38%;
  display: flex; align-items: center; gap: 4px;
}
.add-child-btn {
  background-color: var(--color-accent); color: var(--color-text-on-accent);
  border: none; border-radius: var(--radius-md); padding: 6px 14px; min-height: 44px;
  font-size: var(--text-13); font-weight: 600; cursor: pointer; transition: all 0.2s;
  white-space: nowrap; display: flex; align-items: center; gap: 4px;
}
.add-child-btn:active { opacity: 0.8; }

.detail-body {
  flex: 1; overflow-y: auto; padding: 16px 20px 40px 20px;
  display: flex; flex-direction: column; -webkit-overflow-scrolling: touch;
}
.meta-info-strip {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  font-size: var(--text-11); color: var(--color-text-muted); margin-bottom: 20px;
  padding-bottom: 12px; border-bottom: 1px dashed var(--color-border-input);
}
.meta-badge {
  background-color: var(--color-bg-input); color: var(--color-text-secondary);
  font-weight: 600; padding: 3px 8px; border-radius: var(--radius-sm); font-size: var(--text-11);
  display: flex; align-items: center; gap: 3px;
}
.meta-count {
  background-color: var(--color-toolbar-blue-bg); color: var(--color-markdown-blue);
  font-weight: 500; padding: 3px 8px; border-radius: var(--radius-sm); font-size: var(--text-11);
  margin-left: auto; display: flex; align-items: center; gap: 3px;
}
.meta-author, .meta-time {
  display: flex; align-items: center; gap: 3px;
}

/* 子词条列表 */
.child-list {
  display: flex; flex-direction: column; gap: 10px;
}
.empty-tip {
  text-align: center; color: var(--color-text-muted);
  margin-top: 40px; font-size: var(--text-14); line-height: 1.6;
}
.child-card {
  background: var(--color-bg-primary); border-radius: var(--radius-lg);
  padding: 14px 16px; display: flex; justify-content: space-between;
  align-items: center; cursor: pointer;
  box-shadow: var(--shadow-card);
  animation: cardFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  transition: transform 0.15s, box-shadow 0.15s;
}
.child-card:active { transform: scale(0.98); box-shadow: none; }
.child-card-left { display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
.child-name {
  font-size: var(--text-15); font-weight: 600; color: var(--color-text-primary);
  display: flex; align-items: center; gap: 4px;
}
.child-meta {
  display: flex; gap: 10px; font-size: var(--text-11); color: var(--color-text-muted);
  align-items: center; flex-wrap: wrap;
}
.child-meta span {
  display: flex; align-items: center; gap: 2px;
}
.child-has-content {
  background-color: var(--color-success-bg); color: var(--color-success-deep);
  padding: 1px 6px; border-radius: 4px; font-size: var(--text-10); font-weight: 500;
  display: flex; align-items: center; gap: 2px;
}
.child-arrow { color: #c7c7cc; flex-shrink: 0; }

/* 弹窗 */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,0.4); display: flex; justify-content: center;
  align-items: center; z-index: 999; backdrop-filter: blur(2px);
}
.modal-box {
  background: var(--color-bg-card); border-radius: var(--radius-3xl);
  width: 85%; max-width: 340px; padding: 22px;
  box-shadow: var(--shadow-modal);
  animation: popModal 0.25s var(--ease-pop);
}
.modal-box h3 {
  margin-top: 0; margin-bottom: 18px; font-size: var(--text-18);
  text-align: center; font-weight: 600;
}
.modal-input {
  width: 100%; border: 1px solid var(--color-border);
  background: var(--color-bg-modal); border-radius: var(--radius-md);
  padding: 10px 12px; box-sizing: border-box; font-size: var(--text-14);
}
.modal-actions {
  display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;
}
/* 弹窗动作键：9px 上下内边距 + 14px 字 ≈ 35 高，撑到 44 才够指腹 */
.cancel-btn { background: var(--color-border-light); color: var(--color-text-neutral); border: none; padding: 9px 18px; border-radius: var(--radius-md); font-size: var(--text-14); font-weight: 500; cursor: pointer; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
.save-btn   { background: var(--color-accent); color: var(--color-text-on-accent); border: none; padding: 9px 18px; border-radius: var(--radius-md); font-size: var(--text-14); font-weight: 500; cursor: pointer; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }

@keyframes slideInPage { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes cardFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes popModal {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
