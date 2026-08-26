<!--
  王冠 AI 伙伴聊天界面
  王冠是用户每天见到的人格化 AI 伙伴
  Apple 风格聊天气泡：用户右蓝 / AI 左灰
  支持键盘发送、自动滚动、清空对话
-->
<template>
  <div class="chat-container">
    <!-- 入场动画「灯醒」（冷启动第一次进王冠播一次） -->
    <CrownEntrance v-if="showEntrance" :quick="introQuick" :mode="introMode" @done="handleEntranceDone" />

    <!-- 记忆入口胶囊（顶部悬浮，克制：静态数字） -->
    <button
      class="memory-entry"
      :aria-label="`查看王冠记住的事（${count}条）`"
      @click="showMemory = true"
    >
      <AppIcon name="memory" :size="14" />
      <span class="memory-entry-text">记住了 <b class="memory-count">{{ count }}</b> 件事</span>
    </button>

    <!-- 消息列表 -->
    <div class="message-list" ref="listRef">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-row"
        :class="msg.role"
      >
        <!-- AI 头像（SVG 王冠，替代 emoji） -->
        <div v-if="msg.role === 'assistant'" class="avatar" aria-hidden="true"><AppIcon name="crown" :size="18" /></div>
        <div v-else class="avatar-spacer"></div>

        <div class="bubble-wrapper">
          <div class="bubble" :class="msg.role">
            <div class="bubble-content">{{ msg.content }}</div>
          </div>
          <div class="msg-time">{{ formatTime(msg.time) }}</div>
        </div>
      </div>

      <!-- 王冠正在输入… -->
      <div v-if="isThinking" class="message-row assistant">
        <div class="avatar avatar-thinking" aria-hidden="true"><AppIcon name="crown" :size="18" /></div>
        <div class="bubble-wrapper">
          <div class="bubble assistant typing-bubble">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
      </div>

      <!-- 空状态提示（模块6三要素：视觉意象+阐述+CTA） -->
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-icon" aria-hidden="true"><AppIcon name="crown" :size="46" /></div>
        <p class="empty-title">和你的 AI 伙伴聊聊天</p>
        <p class="empty-text">说说今天发生的事，王冠会认真听，也会记得</p>
        <button class="empty-cta" @click="focusInput">说点什么</button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-hint">{{ error }}</div>

    <!-- 底部输入栏 -->
    <div class="input-bar">
      <div class="input-wrapper">
        <input
          ref="inputRef"
          type="text"
          v-model="inputText"
          placeholder="和 王冠 说点什么..."
          class="chat-input"
          @keydown.enter.prevent="handleSend"
        />
        <button
          class="send-btn"
          :class="{ active: inputText.trim() && !isThinking }"
          :disabled="!inputText.trim() || isThinking"
          @click="handleSend"
        >
          <AppIcon name="forward" :size="18" />
        </button>
      </div>
      <button
        class="clear-btn"
        title="清空对话"
        @click="handleClear"
      >
        <AppIcon name="trash" :size="16" />
      </button>
    </div>
    <!-- 记忆面板（底部滑出） -->
    <MemorySheet :open="showMemory" :memories="memoryList" @close="showMemory = false" />
  </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted, computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import MemorySheet from './MemorySheet.vue'
import CrownEntrance from './CrownEntrance.vue'
import { useChat } from '../../composables/useChat'
import { useChatAI } from '../../composables/useChatAI'
import { useMemory } from '../../composables/useMemory'

// 入场动画：内存态标志——冷启动后第一次进王冠播一次，热切换不播，杀 app 内存清空才重置
let entrancePlayed = false
const INTRO_KEY = 'crown_intro_seen'

const {
  messages, sendMessage, addReply, clearChat
} = useChat()

// AI 回话积木：isThinking 控制"正在输入"，error 显示友好错误
const { isThinking, error, ask } = useChatAI()

// 记忆积木：白名单四类写入 + C档开口 + 上下文注入（prepareTurn 本轮注入，finishTurn 提取落库）
const memory = useMemory()

// 记忆面板：入口（克制：静态数字，不做计数动画——验收工具克制优先于好看）
const showMemory = ref(false)
const memoryList = computed(() => memory.memories.value || [])
const count = computed(() => memoryList.value.length)

// 入场动画状态
const showEntrance = ref(false)
const introQuick = ref(false)
const introMode = ref('night')

const inputText = ref('')
const inputRef = ref(null)
const listRef = ref(null)

/** 自动滚动到底部 */
async function scrollToBottom() {
  await nextTick()
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight
  }
}

// 新消息到达时自动滚动
watch(messages, scrollToBottom, { deep: true })
// 王冠开始/结束思考时也滚到底部，让输入提示可见
watch(isThinking, () => {
  if (isThinking.value) scrollToBottom()
})
// 刷新页面 / 切换回王冠 Tab 时，定位到最新对话（修复：刷新后停在顶部）
onMounted(() => {
  scrollToBottom()
  // 冷启动后第一次进王冠 → 播入场动画（内存态，热切换不播；杀 app 内存清空重置）
  if (!entrancePlayed) {
    entrancePlayed = true
    let seen = false
    try { seen = !!localStorage.getItem(INTRO_KEY) } catch {}
    introQuick.value = seen
    introMode.value = getIntroMode() // 按系统时间决定白天/夜晚版
    showEntrance.value = true
  }
})

/** 按系统时间决定入场动画模式：6:00–18:00 白天版「光启」，其余夜晚版「灯醒」 */
function getIntroMode() {
  const h = new Date().getHours()
  return (h >= 6 && h < 18) ? 'day' : 'night'
}

/** 发送消息：先存用户消息，再请王冠回话 */
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isThinking.value) return
  sendMessage(text)
  inputText.value = ''
  // 聚焦输入框
  inputRef.value?.focus()
  try {
    // 记忆积木：本轮注入（记忆上下文/C档开口/情感依赖方向），"记住私密"直接固定话术回复
    const turn = memory.prepareTurn(text)
    if (turn.fixedReply) {
      addReply(turn.fixedReply)
      await memory.finishTurn(text, turn.fixedReply)
      return
    }
    const reply = await ask(messages.value, turn.note)
    addReply(reply)
    await memory.finishTurn(text, reply)
  } catch (e) {
    // 错误已通过 error 内联提示显示，这里不再打扰
  }
}

/** 清空对话 */
function handleClear() {
  if (confirm('确定要清空所有对话记录吗？')) {
    clearChat()
  }
}

/** 空状态 CTA：聚焦输入框，开始聊天 */
function focusInput() {
  inputRef.value?.focus()
}

/** 入场动画结束：卸载 overlay + 记录已看过（下次冷启动播精简版） */
function handleEntranceDone() {
  showEntrance.value = false
  try { localStorage.setItem(INTRO_KEY, '1') } catch {}
}

/** 格式化时间：只显示 HH:mm */
function formatTime(timeStr) {
  if (!timeStr) return ''
  const parts = timeStr.split(' ')
  return parts[1] || timeStr.slice(-5)
}
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--crown-bg);
}

/* ===== 记忆入口胶囊（顶部悬浮，iOS 风格） ===== */
.memory-entry {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--color-border-light);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: transform 0.15s ease-out, opacity 0.2s ease;
}
.memory-entry:active {
  transform: translateX(-50%) scale(0.95);
}
/* 触控目标扩展 ≥44px */
.memory-entry::after {
  content: '';
  position: absolute;
  inset: -6px;
}
.memory-entry-text {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
}
.memory-count {
  font-size: 13px;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}

/* ===== 消息列表（可滚动区域） ===== */
.message-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  -webkit-overflow-scrolling: touch;
  padding: 56px 12px 8px;
}

/* ===== 消息行 ===== */
.message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  animation: msgEnter 0.24s var(--ease-out);
}
.message-row.user {
  flex-direction: row-reverse;
}

/* 消息入场：fade + 8px 微上浮 240ms ease-out（克制，无过冲） */
@keyframes msgEnter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ===== 头像（SVG 王冠，金色渐变圆底） ===== */
.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--crown-avatar-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--crown-avatar-icon);
  flex-shrink: 0;
  box-shadow: var(--crown-avatar-shadow);
}
.avatar-spacer {
  width: 32px;
  flex-shrink: 0;
}
/* 王冠思考时头像呼吸（收缩式 0.98↔1.0，几乎不可察觉，只留生命感） */
.avatar-thinking {
  animation: crownBreath 2.4s ease-in-out infinite;
}
@keyframes crownBreath {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(0.98); }
}
/* 无障碍：减少动效偏好时关闭入场/呼吸/打字动画（模块5） */
@media (prefers-reduced-motion: reduce) {
  .message-row,
  .message-row.assistant,
  .avatar-thinking,
  .typing-bubble .dot { animation: none; }
}

/* ===== 气泡容器 ===== */
.bubble-wrapper {
  max-width: 78%;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.message-row.user .bubble-wrapper {
  align-items: flex-end;
}

/* ===== 聊天气泡 ===== */
.bubble {
  padding: 10px 14px;
  border-radius: 18px;
  line-height: 1.5;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
.bubble.assistant {
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  border-bottom-left-radius: 6px;
  box-shadow: var(--shadow-card);
}
.bubble.user {
  background: var(--color-accent);
  color: white;
  border-bottom-right-radius: 6px;
  text-align: left;
}

/* ===== 时间戳 ===== */
.msg-time {
  font-size: 10px;
  color: var(--color-text-muted);
  padding: 0 4px;
}
.message-row.user .msg-time {
  text-align: right;
}

/* ===== 空状态（模块6三要素：视觉意象+阐述+CTA） ===== */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
}
.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px; height: 84px;
  border-radius: 50%;
  background: var(--color-bg-input);
  color: var(--color-text-muted);
  margin-bottom: 10px;
}
.empty-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.empty-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-muted);
}
.empty-cta {
  margin-top: 14px;
  min-height: 44px;
  padding: 0 24px;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.15s ease-out, opacity 0.2s ease;
}
.empty-cta:active { transform: scale(0.96); }

/* ===== 输入栏 ===== */
.input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  padding-bottom: calc(8px + var(--safe-bottom));
  border-top: 1px solid var(--color-border-light);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
.input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--color-bg-input);
  border-radius: 20px;
  padding: 4px 4px 4px 16px;
  transition: box-shadow 0.2s;
}
.input-wrapper:focus-within {
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
}

.chat-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--color-text-primary);
  font-family: var(--font-system);
  line-height: 1.4;
  min-height: 22px;
}
.chat-input::placeholder {
  color: var(--color-text-muted);
}

.send-btn {
  width: 32px; height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-input);
  color: var(--color-text-muted);
  cursor: not-allowed;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease-out, color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
  flex-shrink: 0;
}
/* 模块3 六状态：禁用态透明度标准 */
.send-btn:disabled {
  opacity: 0.5;
}
.send-btn.active {
  background: var(--color-accent);
  color: white;
  cursor: pointer;
}
.send-btn.active:active {
  transform: scale(0.9);
}

.clear-btn {
  width: 36px; height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.2s ease, color 0.2s ease;
}
.clear-btn:active {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

/* ===== 王冠正在输入…（三个跳动圆点） ===== */
.typing-bubble {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 14px;
}
.dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  animation: dotPulse 1.2s infinite ease-in-out;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}

/* ===== 错误提示 ===== */
.error-hint {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--color-danger);
  text-align: center;
  background: var(--color-danger-bg);
}
</style>
