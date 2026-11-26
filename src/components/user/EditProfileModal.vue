<!--
  修改个人资料弹窗积木
-->
<template>
  <ModalBox title="修改个人数据" @close="$emit('close')">
    <label class="input-label">自选个性头像：</label>
    <div class="avatar-selector-grid">
      <div
        v-for="avatar in availableAvatars"
        :key="avatar"
        class="avatar-option"
        :class="{ selected: avatar === localAvatar }"
        @click="localAvatar = avatar"
      >
        {{ avatar }}
      </div>
    </div>

    <label class="input-label">自定义用户名：</label>
    <input
      type="text" v-model="localName" placeholder="请输入全新用户名"
      class="modal-input" maxlength="12"
    />

    <template #actions>
      <button class="cancel-btn" @click="$emit('close')">取消</button>
      <button class="save-btn" @click="handleSave">保存修改</button>
    </template>
  </ModalBox>
</template>

<script setup>
import { ref } from 'vue'
import ModalBox from '../common/ModalBox.vue'
import { AVAILABLE_AVATARS } from '../../constants/categories'

const props = defineProps({
  name:   { type: String, default: '' },
  avatar: { type: String, default: '🐱' }
})
const emit = defineEmits(['close', 'save'])

const availableAvatars = AVAILABLE_AVATARS
const localName   = ref(props.name)
const localAvatar = ref(props.avatar)

const handleSave = () => {
  const cleanName = localName.value.trim()
  if (!cleanName) return alert('用户名不能为空！')
  emit('save', { name: cleanName, avatar: localAvatar.value })
  emit('close')
}
</script>

<style scoped>
.input-label {
  display: block; font-size: var(--text-13); color: var(--color-text-muted);
  margin-bottom: 8px; font-weight: 500;
}
.avatar-selector-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
  /* gap 10→8、margin 18→10（2026-11-23）：弹窗被限制在「我的」卡内后，
     这两处省下的 10px 正好让它不必滚动就能看全 */
  margin-bottom: 10px; background: var(--color-border-light);
  padding: 10px; border-radius: var(--radius-xl);
}
/* 5 列网格，格子宽约 52；高度原本只有 emoji 行高 ≈ 37，补到 44 让每个头像是块方正的靶子 */
.avatar-option {
  font-size: var(--text-24); text-align: center; padding: 4px 0; min-height: 44px; cursor: pointer;
  border-radius: var(--radius-md); transition: all 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.avatar-option.selected {
  background: var(--color-bg-card); box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  transform: scale(1.1);
}
/* 形状走 common/ModalBox.vue 收口（2026-11-22 重放 PR#19 的收口意图），
   这里只留本组件的两处差异：margin-bottom: 0 与 focus 高亮 */
.modal-input {
  margin-bottom: 0;
}
.modal-input:focus { outline: none; border-color: var(--color-accent); background: var(--color-bg-card); }
.cancel-btn { background: var(--color-border-light); color: var(--color-text-neutral); }
.save-btn   { background: var(--color-accent-solid); color: var(--color-text-on-solid); }
</style>
