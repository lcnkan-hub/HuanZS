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
  display: block; font-size: 13px; color: var(--color-text-muted);
  margin-bottom: 8px; font-weight: 500;
}
.avatar-selector-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;
  margin-bottom: 18px; background: var(--color-border-light);
  padding: 10px; border-radius: var(--radius-xl);
}
.avatar-option {
  font-size: 24px; text-align: center; padding: 4px 0; cursor: pointer;
  border-radius: var(--radius-md); transition: all 0.15s;
}
.avatar-option.selected {
  background: white; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  transform: scale(1.1);
}
.modal-input {
  width: 100%; border: 1px solid var(--color-border);
  background: var(--color-bg-modal); border-radius: var(--radius-md);
  padding: 10px 12px; box-sizing: border-box; font-size: 14px;
  margin-bottom: 0;
}
.modal-input:focus { outline: none; border-color: var(--color-accent); background: white; }
.cancel-btn { background: var(--color-border-light); color: var(--color-text-neutral); }
.save-btn   { background: var(--color-accent); color: white; }
</style>
