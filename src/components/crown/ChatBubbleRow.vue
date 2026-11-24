<!--
  一条聊天消息（2026-11-24 从 ChatView 抽出）
  职责：一条消息长什么样 —— 头像 + 气泡 + 时间；`msg.thinking` 为 true 时渲染「正在输入」三个点。
  纯展示，不碰状态、不发请求。

  为什么把"正在输入"也收进来：它本来就是一条 assistant 消息（同样头像、同样气泡底、
  同样左对齐）。留在父组件单写一份，那套 .message-row / .avatar / .bubble 样式就得在父组件
  再留一遍 —— 两份必然漂移。现在这里是唯一出处。

  颜色全部走语义变量，所以 `.chat-container.night` 里那套覆盖会自动生效（CSS 变量继承）。
-->
<template>
  <div class="message-row" :class="msg.role">
    <!-- AI 头像（SVG 王冠，替代 emoji）；思考时头像呼吸 -->
    <div
      v-if="msg.role === 'assistant'"
      class="avatar"
      :class="{ 'avatar-thinking': msg.thinking }"
      aria-hidden="true"
    >
      <AppIcon name="crown" :size="18" />
    </div>
    <div v-else class="avatar-spacer"></div>

    <div class="bubble-wrapper">
      <div class="bubble" :class="[msg.role, { 'typing-bubble': msg.thinking }]">
        <template v-if="msg.thinking">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </template>
        <div v-else class="bubble-content">{{ msg.content }}</div>
      </div>
      <div v-if="!msg.thinking" class="msg-time">{{ formatTime(msg.time) }}</div>
    </div>
  </div>
</template>

<script setup>
import AppIcon from '../common/AppIcon.vue'

defineProps({
  msg: { type: Object, required: true }
})

/** 格式化时间：只显示 HH:mm */
function formatTime(timeStr) {
  if (!timeStr) return ''
  const parts = timeStr.split(' ')
  return parts[1] || timeStr.slice(-5)
}
</script>

<style scoped>
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
  font-size: var(--text-14);
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
  color: var(--color-text-on-accent);
  border-bottom-right-radius: 6px;
  text-align: left;
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

/* ===== 时间戳 ===== */
.msg-time {
  font-size: var(--text-10);
  color: var(--color-text-muted);
  padding: 0 4px;
}
.message-row.user .msg-time {
  text-align: right;
}

/* 无障碍：减少动效偏好时关掉入场 / 呼吸 / 打字动画 */
@media (prefers-reduced-motion: reduce) {
  .message-row,
  .avatar-thinking,
  .typing-bubble .dot { animation: none; }
}
</style>
