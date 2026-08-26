<!--
  数据备份保险箱积木
  支持一键导出 JSON 备份 + 沙箱校验导入恢复
-->
<template>
  <div class="safety-tools-section">
    <h3><AppIcon name="shield" :size="16" /> 存储与备份保险箱</h3>
    <div class="tools-btn-grid">
      <button class="tool-btn backup" @click="handleExport">
        <AppIcon name="import" :size="13" /> 导出全量数据备份
      </button>
      <button class="tool-btn restore" @click="triggerImport">
        <AppIcon name="export" :size="13" /> 导入备份恢复数据
      </button>
    </div>
    <input
      type="file" ref="fileInputEl" accept=".json"
      style="display: none" @change="handleImport"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'

const props = defineProps({
  dbData:         { type: Object, required: true },
  validateImport: { type: Function, required: true }
})
const emit = defineEmits(['import-success'])

const fileInputEl = ref(null)

const handleExport = () => {
  try {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(props.dbData, null, 2))
    const anchor = document.createElement('a')
    anchor.setAttribute('href', dataStr)
    anchor.setAttribute('download', 'huan_zhong_shu_backup_' + new Date().toISOString().slice(0, 10) + '.json')
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } catch {
    alert('导出失败，请重试')
  }
}

const triggerImport = () => {
  fileInputEl.value.click()
}

const handleImport = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (props.validateImport(data)) {
        if (confirm('导入备份将完全覆盖当前本地存储的所有词条，确定导入吗？')) {
          emit('import-success', data)
          alert('全量备份数据已成功安全恢复！')
        }
      } else {
        alert('解析失败：文件格式不符合本应用百科数据库标准。')
      }
    } catch (parseErr) {
      alert('无法读取该文件：' + (parseErr.message || '格式错误') + '。请确保是有效的备份 .json 文件。')
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}
</script>

<style scoped>
.safety-tools-section {
  background: var(--color-bg-card); border-radius: var(--radius-3xl);
  padding: 16px; border: 1px solid var(--color-border-light);
  margin-top: 22px; box-shadow: 0 4px 12px rgba(0,0,0,0.01);
}
.safety-tools-section h3 {
  margin-top: 0; margin-bottom: 12px; font-size: 14px;
  color: var(--color-text-secondary); font-weight: 600;
  display: flex; align-items: center; gap: 4px;
}
.tools-btn-grid { display: flex; gap: 10px; }
.tool-btn {
  flex: 1; border: none; padding: 11px 8px; border-radius: var(--radius-lg);
  font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s;
  text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;
}
.tool-btn.backup  { background-color: var(--color-border-light); color: var(--color-text-primary); }
.tool-btn.backup:active  { background-color: var(--color-border-input); }
.tool-btn.restore { background-color: var(--color-border-light); color: var(--color-accent); }
.tool-btn.restore:active { background-color: #e4f0ff; }
</style>
