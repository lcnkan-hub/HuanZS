<!--
  AI 设置弹窗积木（BYOK：用户自带密钥）
  职责：选择服务商 / 填入并保存自己的 API 密钥 / 测试连接 / 清除
  自包含：在「我的」页与王冠页两处复用挂载，不依赖父组件传参、不走跨页面事件
  安全边界：密钥只存本机 localStorage；界面只显示脱敏结果，不显示明文
-->
<template>
  <ModalBox title="AI 设置" @close="$emit('close')">
    <!-- 服务商选择 -->
    <label class="input-label">选择服务商</label>
    <div class="provider-list">
      <div
        v-for="id in PROVIDER_IDS"
        :key="id"
        class="provider-item"
        :class="{ selected: id === localProvider }"
        @click="switchProvider(id)"
      >
        <div class="provider-main">
          <span class="provider-name">{{ AI_PROVIDERS[id].label }}</span>
          <span class="provider-note">{{ AI_PROVIDERS[id].note }}</span>
        </div>
        <AppIcon v-if="id === localProvider" name="check" :size="16" />
      </div>
    </div>

    <!-- 密钥：已保存显示脱敏，修改时出现输入框 -->
    <label class="input-label">API 密钥</label>
    <div v-if="savedKey && !editing" class="key-saved">
      <span class="key-mask">{{ maskKey(savedKey) }}</span>
      <div class="key-actions">
        <button class="link-btn" @click="startEdit">修改</button>
        <button class="link-btn danger" @click="handleClear">清除</button>
      </div>
    </div>
    <template v-else>
      <div class="key-input-row">
        <input
          :type="showKey ? 'text' : 'password'"
          v-model="localKey"
          class="modal-input"
          :placeholder="currentProvider.keyHint"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="toggle-btn" type="button" @click="showKey = !showKey">
          {{ showKey ? '隐藏' : '显示' }}
        </button>
      </div>
      <p class="apply-hint">
        还没有密钥？去
        <a :href="currentProvider.applyUrl" target="_blank" rel="noopener">{{ currentProvider.label }}</a>
        申请后粘贴到这里。
      </p>
    </template>

    <!-- 测试结果 -->
    <p v-if="testMessage" class="test-result" :class="testOk ? 'ok' : 'bad'">{{ testMessage }}</p>

    <!-- 隐私说明 -->
    <p class="privacy-note">密钥只保存在你这台设备上，不会上传到任何服务器。</p>

    <template #actions>
      <button class="cancel-btn" @click="$emit('close')">关闭</button>
      <button class="test-btn" :disabled="testing || !localKey.trim()" @click="handleTest">
        {{ testing ? '测试中…' : '测试连接' }}
      </button>
      <button class="save-btn" :disabled="!localKey.trim()" @click="handleSave">保存</button>
    </template>
  </ModalBox>
</template>

<script setup>
import { ref, computed } from 'vue'
import ModalBox from '../common/ModalBox.vue'
import AppIcon from '../common/AppIcon.vue'
import { AI_PROVIDERS, PROVIDER_IDS, DEFAULT_PROVIDER } from '../../constants/aiProviders'
import { useAIConfig, saveAIConfig, clearAIConfig, maskKey } from '../../composables/useApiKey'
import { verifyAIConfig } from '../../composables/useChatAI'

defineEmits(['close'])

// 单例配置（与「我的」页、王冠页共享同一份状态）
const { config } = useAIConfig()

const savedKey = computed(() => (config.value?.apiKey || '').trim())
const localProvider = ref(config.value?.provider || DEFAULT_PROVIDER)
const localKey = ref('')
const showKey = ref(false)
const editing = ref(false)
const testing = ref(false)
const testMessage = ref('')
const testOk = ref(false)

const currentProvider = computed(() => AI_PROVIDERS[localProvider.value] || AI_PROVIDERS[DEFAULT_PROVIDER])

/** 切换服务商：换家就得换密钥，清掉上一条的测试结果 */
function switchProvider(id) {
  if (id === localProvider.value) return
  localProvider.value = id
  testMessage.value = ''
  // 服务商变了，已保存的密钥必然不适用 → 进入输入态
  editing.value = true
  localKey.value = ''
}

/** 点「修改」：预填本机已保存的密钥，方便切换服务商后重测 */
function startEdit() {
  localKey.value = savedKey.value
  editing.value = true
  testMessage.value = ''
}

/** 测试连接：用当前输入框里的值（可能是尚未保存的）试一次最小请求 */
async function handleTest() {
  testing.value = true
  testMessage.value = ''
  const res = await verifyAIConfig({ provider: localProvider.value, apiKey: localKey.value })
  testOk.value = res.ok
  testMessage.value = res.message
  testing.value = false
}

/** 保存：写入本机配置，回到脱敏显示 */
function handleSave() {
  saveAIConfig({ provider: localProvider.value, apiKey: localKey.value })
  localKey.value = ''
  showKey.value = false
  editing.value = false
  testMessage.value = ''
}

/** 清除：删掉本机密钥，回到未配置 */
function handleClear() {
  clearAIConfig()
  localKey.value = ''
  editing.value = false
  testMessage.value = ''
}
</script>

<style scoped>
.input-label {
  display: block; font-size: 13px; color: var(--color-text-muted);
  margin-bottom: 8px; font-weight: 500;
}
.provider-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.provider-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg); cursor: pointer; transition: all 0.15s;
  background: var(--color-bg-modal);
}
.provider-item.selected { border-color: var(--color-accent); background: var(--color-bg-card); }
.provider-main { display: flex; flex-direction: column; gap: 2px; }
.provider-name { font-size: 14px; font-weight: 500; }
.provider-note { font-size: 11px; color: var(--color-text-muted); }

.key-saved {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; background: var(--color-bg-modal);
  border-radius: var(--radius-md); margin-bottom: 4px;
}
.key-mask { font-size: 14px; font-family: ui-monospace, monospace; letter-spacing: 0.5px; }
.key-actions { display: flex; gap: 12px; }
.link-btn {
  border: none; background: none; padding: 0; font-size: 13px;
  color: var(--color-accent); cursor: pointer;
}
.link-btn.danger { color: var(--color-danger); }

.key-input-row { display: flex; gap: 8px; align-items: center; }
.key-input-row .modal-input { flex: 1; }
.toggle-btn {
  border: 1px solid var(--color-border-input, var(--color-border));
  background: var(--color-bg-card); border-radius: var(--radius-md); padding: 9px 10px;
  font-size: 12px; color: var(--color-text-muted); cursor: pointer; white-space: nowrap;
}
.apply-hint { font-size: 12px; color: var(--color-text-muted); margin: 8px 0 0 0; line-height: 1.6; }
.apply-hint a { color: var(--color-accent); text-decoration: none; }

.test-result { font-size: 12px; margin: 12px 0 0 0; }
.test-result.ok { color: var(--color-success); }
.test-result.bad { color: var(--color-danger); }

.privacy-note {
  font-size: 11px; color: var(--color-text-muted); margin: 12px 0 0 0;
  line-height: 1.6; padding-top: 10px; border-top: 1px solid var(--color-border-light);
}

.modal-input {
  width: 100%; border: 1px solid var(--color-border);
  background: var(--color-bg-modal); border-radius: var(--radius-md);
  padding: 10px 12px; box-sizing: border-box; font-size: 14px;
}
.modal-input:focus { outline: none; border-color: var(--color-accent); background: var(--color-bg-card); }

.cancel-btn { background: var(--color-border-light); color: var(--color-text-neutral); }
.test-btn { background: #eef3fb; color: var(--color-accent); }
.test-btn:disabled { opacity: 0.5; }
.save-btn { background: var(--color-accent); color: white; }
.save-btn:disabled { opacity: 0.5; }
</style>
