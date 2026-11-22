<!--
  王冠 AI 伙伴聊天界面
  王冠是用户每天见到的人格化 AI 伙伴
  Apple 风格聊天气泡：用户右蓝 / AI 左灰
  支持键盘发送、自动滚动、清空对话
-->
<template>
  <div
    class="chat-container"
    :class="{ night: timeMode === 'night', 'kb-open': kbOpen }"
    :style="{ '--kb-inset': kbInset + 'px', '--kb-shift': kbShift + 'px' }"
  >
    <!-- 夜晚背景板（时间与入场动画「灯醒」同源；白天不显示） -->
    <CrownBackdrop :mode="timeMode" />

    <!-- 入场动画「灯醒」（冷启动第一次进王冠播一次） -->
    <CrownEntrance v-if="showEntrance" :quick="introQuick" :mode="introMode" @done="handleEntranceDone" />

    <!-- 2026-11-23：左上角「返回」已删。底栏在王冠页常驻之后，"记录"那颗就是回去的路，
         再放一个返回键等于两套返回语义并存 —— 用户会想"这两个不一样吗"。 -->

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
    <!-- 消息列表。@touchstart/@touchmove 是"滑动即收键盘"的入口（2026-11-23 用户要）：
         iOS 拖动列表系统会自动收键盘、Android 不会 —— 这里把 iOS 的手感补到 Android 上。 -->
    <div
      class="message-list"
      ref="listRef"
      @touchstart.passive="onListTouchStart"
      @touchmove.passive="onListTouchMove"
    >
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

    <!-- 错误提示（临时）：保持全宽横条 —— 它是"刚才那次请求失败了"，用浮件会削弱警示 -->
    <div v-if="error" class="error-hint">{{ error }}</div>

    <!-- 底部浮件组（2026-11-23）：未配置提示 + 输入栏放进同一个容器。
         "跟随键盘"靠**结构**而不是两份 transform —— 组的 margin/transform 只写一处，
         两个成员之间的间距由 gap 管；以后再加第三个底部浮件也自动跟随。 -->
    <div class="bottom-dock">
      <!-- 未配置密钥提示（BYOK）：王冠没有钥匙时的唯一入口。整颗可点 → 打开 AI 设置。
          比导航浮岛还窄（自适内容宽），刻意做得比输入栏"薄"一档材质：输入是主动作，它是次要。 -->
      <button
        v-if="!aiConfigured"
        class="setup-pill"
        type="button"
        aria-label="配置 AI 密钥"
        @click="showAiSettings = true"
      >
        <AppIcon name="key" :size="12" />
        <span>配置密钥</span>
      </button>

      <!-- 底部输入栏（玻璃浮岛） -->
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
    </div>
    <!-- 记忆面板（底部滑出） -->
    <MemorySheet :open="showMemory" :memories="memoryList" @close="showMemory = false" />

    <!-- AI 设置弹窗（与「我的」页是同一个组件；没钥匙时的配置入口） -->
    <AiSettingsModal v-if="showAiSettings" @close="showAiSettings = false" />
  </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted, computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import MemorySheet from './MemorySheet.vue'
import CrownEntrance from './CrownEntrance.vue'
import CrownBackdrop from './CrownBackdrop.vue'
import { useChat } from '../../composables/useChat'
import { useChatAI } from '../../composables/useChatAI'
import { useMemory } from '../../composables/useMemory'
import { useTimeMode } from '../../composables/useTimeMode'
import { useAIConfig } from '../../composables/useApiKey'
import { buildWikiContext } from '../../composables/useWikiContext'
import { writeWikiItems } from '../../composables/useWikiWriter'
import AiSettingsModal from '../user/AiSettingsModal.vue'
import { useKeyboard } from '../../composables/useKeyboard'

// 键盘几何：kbOpen（底栏下沉 / 让位收回）、kbInset（列表底部留白）、kbShift（输入栏上浮量）
const { kbInset, kbShift, kbOpen } = useKeyboard()

// 入场动画：内存态标志——冷启动后第一次进王冠播一次，热切换不播，杀 app 内存清空才重置
let entrancePlayed = false
const INTRO_KEY = 'crown_intro_seen'

const {
  messages, sendMessage, addReply, clearChat
} = useChat()

// AI 回话积木：isThinking 控制"正在输入"，error 显示友好错误
const { isThinking, error, ask, detectCrisis } = useChatAI()

// 记忆积木：白名单四类写入 + C档开口 + 上下文注入（prepareTurn 本轮注入，finishTurn 提取落库）
const memory = useMemory()

// 记忆面板：入口（克制：静态数字，不做计数动画——验收工具克制优先于好看）
const showMemory = ref(false)
// 时间模式：与入场动画共用同一判定（6:00–18:00 白天），背景板靠它保持时间同步
const timeMode = useTimeMode()
const memoryList = computed(() => memory.memories.value || [])
const count = computed(() => memoryList.value.length)

// 入场动画状态
const showEntrance = ref(false)
const introQuick = ref(false)
const introMode = ref('night')

const inputText = ref('')
const inputRef = ref(null)
const listRef = ref(null)

// AI 密钥状态（BYOK 单例，与「我的」页共享同一份）：没有钥匙就显示配置入口
const showAiSettings = ref(false)
const { config: aiConfig } = useAIConfig()
const aiConfigured = computed(() => !!(aiConfig.value?.apiKey || '').trim())

/** 自动滚动到底部 */
async function scrollToBottom() {
  await nextTick()
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight
  }
}

/* —— 滑动即收键盘（2026-11-23 用户拍板要） ——
   为什么要自己写：iOS/Safari 拖动消息列表时系统本来就会收键盘，Android WebView 不会，
   结果同一个动作在两种手机上手感不同。
   为什么用 touch 手势、不用 scroll 事件：发消息后我们自己会调 scrollToBottom()，
   那同样会触发 scroll —— 用 scroll 会在"刚发完一条消息"时把键盘收掉，恰是用户最不想它收的时刻。
   触摸手势天然只来自"人在滑"。直接调 blur：没焦点时是空操作，所以不用先判断键盘开没开。 */
const DISMISS_DY = 12      // 手指位移超过这么多像素才算"在滑"（点按时的抖动通常在 5px 内）
let touchStartY = 0

function onListTouchStart(e) {
  touchStartY = e.touches?.[0]?.clientY ?? 0
}

function onListTouchMove(e) {
  const y = e.touches?.[0]?.clientY ?? 0
  if (Math.abs(y - touchStartY) < DISMISS_DY) return
  touchStartY = y          // 一次手势只收一次：持续 move 不反复 blur
  inputRef.value?.blur()
}

// 新消息到达时自动滚动
watch(messages, scrollToBottom, { deep: true })
// 王冠开始/结束思考时也滚到底部，让输入提示可见
watch(isThinking, () => {
  if (isThinking.value) scrollToBottom()
})
// 键盘一升一降都会改变"可见的消息区有多高"，跟着滚一次底，
// 免得键盘顶上来以后最后一条消息刚好被输入栏/键盘盖住（2026-11-23）。
watch(kbInset, () => { scrollToBottom() })
// 刷新页面 / 切换回王冠 Tab 时，定位到最新对话（修复：刷新后停在顶部）
onMounted(() => {
  scrollToBottom()
  // 冷启动后第一次进王冠 → 播入场动画（内存态，热切换不播；杀 app 内存清空重置）
  if (!entrancePlayed) {
    entrancePlayed = true
    let seen = false
    try { seen = !!localStorage.getItem(INTRO_KEY) } catch {}
    introQuick.value = seen
    introMode.value = timeMode.value // 进入这一刻的时段定档（与背景板同源），播放中不再变
    showEntrance.value = true
  }
})

/** 发送消息：先存用户消息，再请王冠回话 */
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isThinking.value) return
  // 2026-11-21 单层重构：空库开局的「开局问句落库」链路已随三张开局卡一起删除。
  // 王冠替用户记东西仍然只走 useMemory 的回合提取（wiki 动作 → useWikiWriter）。
  if (!aiConfigured.value) {
    // ⚠️ A01：没配密钥也要接住危险表达。危机管线是纯本地的（不读密钥、自带系统兜底），
    //    而原来的闸门设在 ask() 之外，等于把整条安全兜底一起挡掉——
    //    「密钥没配 / 失效 / 换服务商的空档期」正是最没人接住的时刻。
    //    这里先跑一次管线：命中就照常接住（含落消息），未命中才引导去配密钥。
    let crisis = null
    try {
      crisis = await detectCrisis(text, messages.value)
    } catch { /* 管线故障不阻断下面的配置引导 */ }
    if (crisis) {
      sendMessage(text)
      inputText.value = ''
      inputRef.value?.focus()
      addReply(crisis)
      try { await memory.finishTurn(text, crisis) } catch { /* 记忆落库失败不打断接住 */ }
      return
    }
    showAiSettings.value = true
    return
  }
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
    // 百科上下文注入：命中提问就给他相关条目全文，没命中就给最近记的清单
    const note = [turn.note, buildWikiContext(text)].filter(Boolean).join('\n\n')
    const reply = await ask(messages.value, note)
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
  /* 2026-11-21：改成 fixed 覆盖整屏。
     为什么不能用 absolute：底栏的占位层还撑着 75px 高（浮岛移出屏幕了，但它的占位没走），
     ChatView 被压在 main-content 里，底部就会留一条白 —— 就是用户点名的那块空白。
     fixed 相对视口，不吃兄弟元素的高度；safe-top 得自己补，因为 app-container 的 padding 到不了 fixed 层。 */
  position: fixed;
  inset: 0;
  z-index: 2;
  padding-top: var(--safe-top);
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--crown-bg);
  /* 跨过 6:00 / 18:00 边界时柔和换底，不突切 */
  transition: background-color 0.8s ease;
}

/* ===== 夜晚板：只换语义变量的值，所有子元素自动跟随（不写第二套子元素规则） ===== */
.chat-container.night {
  --crown-bg: var(--crown-night-bg);
  --color-bg-card: var(--crown-night-surface);
  --color-bg-input: var(--crown-night-surface-input);
  --color-border-light: var(--crown-night-border);
  --color-text-primary: var(--crown-night-text);
  --color-text-secondary: var(--crown-night-text-secondary);
  --color-text-muted: var(--crown-night-text-muted);
  --color-accent: var(--crown-night-accent);
  --color-danger: #FF6961;
  --color-danger-bg: rgba(255, 69, 58, 0.14);
  --crown-glass-bg: var(--crown-night-glass);
}

/* ===== 返回按钮已删（2026-11-23）=====
   王冠页的底栏改成常驻后，"记录"那颗就是回去的路；这里再挂一个返回键
   等于两套返回语义并存。整块样式随之删除，别再把它加回来。 */

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
  background: var(--crown-glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: var(--color-text-secondary);
  font-size: var(--text-12);
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
  font-size: var(--text-13);
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}

/* ===== 消息列表（可滚动区域） ===== */
.message-list {
  flex: 1;
  position: relative; /* 夜板是定位元素，会画在非定位内容之上，这里必须压过它 */
  z-index: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  -webkit-overflow-scrolling: touch;
  /* 底部留白跟着键盘走（2026-11-23）：输入浮岛在键盘弹起时会整体上浮 kbInset，
     它盖住的那一段要在列表里补回来，否则最后一条消息会被压在输入栏下面。 */
  padding: 56px 12px calc(8px + var(--kb-inset, 0px));
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

/* ===== 时间戳 ===== */
.msg-time {
  font-size: var(--text-10);
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
  font-size: var(--text-17);
  font-weight: 600;
  color: var(--color-text-primary);
}
.empty-text {
  margin: 0;
  font-size: var(--text-14);
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
  color: var(--color-text-on-accent);
  font-size: var(--text-14);
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.15s ease-out, opacity 0.2s ease;
}
.empty-cta:active { transform: scale(0.96); }

/* ===== 底部浮件组（2026-11-23）=====
   成员：未配置密钥的小胶囊（可选）+ 输入浮岛。
   "跟随键盘"靠结构而不是两份 transform：
     · 让位（margin-bottom 的 80px）、键盘上浮（transform）、成员间距（gap）**只在这一层写一次**；
     · 成员自己不再写 margin/transform —— 否则两处碰巧凑对才对齐，谁改一处就错位。
   间隙 6px：两颗都是小件，"输入"和"提示"层级不同，8 会显散、6 才读作一组。 */
.bottom-dock {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 12px calc(var(--nav-zone) + 8px) 12px;
  /* 键盘开合时"让位/上浮"要有因果，不能瞬移；与导航浮岛下沉同一条曲线 */
  transition: margin-bottom 0.24s cubic-bezier(0.2, 0.8, 0.2, 1),
              transform    0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* ===== 输入栏：一颗玻璃浮岛（2026-11-23 改）
   以前是"输入胶囊 + 确认键 + 清空键"三个物件裸浮在聊天底色上、整体贴着屏幕底。
   现在底部多了一条常驻的导航浮岛，所以输入栏必须**自己成为一件浮件**：
   同一族材质（--crown-glass-bg + blur）、999 圆角、内高光 + 描边 + 投影，
   与浮岛共轴、隔 8px —— 底部于是只剩同族浮件（输入 = 主动作，导航 = 次要），
   而不是"一条全宽横条 + 一颗药丸"两种语言。
   位置/位移不在这里：交给外面的 .bottom-dock（见上）。 */
.input-bar {
  display: flex;
  position: relative;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 999px;
  background: var(--crown-glass-bg);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 0.5px rgba(255, 255, 255, 0.08),
    0 10px 28px rgba(0, 0, 0, 0.28);
}
/* 键盘弹起（2026-11-23 二次修正 · 同日改成写在浮件组上）：
   ① margin 收回到 8px —— 底部留给导航浮岛的那 80px 已经不需要了（浮岛此时已下沉）；
   ② transform 上浮 -kbInset —— **这是关键**：iOS/WKWebView 的布局视口不会因为键盘变小，
      只收 margin 的话浮件会停在"原来的屏幕底"，正好被键盘盖住，用户看不到自己打的字。
      按键盘盖住的高度整体上浮，才真的落在键盘上沿之上。
      Android（adjustResize）那边 kbInset 是 0、布局视口自己缩了，所以这一步什么都不做，也对。
   键盘收起（含系统自动收起）时 kbInset 归 0、kbOpen 转 false →
   margin 回到 calc(--nav-zone + 8px)、transform 回到 0，整组自动回到浮岛上方，不需要额外代码。
   ⚠ 规则写在 .bottom-dock 上（不是 .input-bar）：提示胶囊和输入栏要**一起走**，
     两处各写一份 transform 迟早错位。 */
.chat-container.kb-open .bottom-dock {
  margin-bottom: 8px;
  transform: translateY(var(--kb-shift, 0px));
}
.input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: transparent;      /* 浮岛已经是底了，里面不再叠一层浅块 */
  border-radius: 999px;
  padding: 2px 2px 2px 14px;
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
  font-size: var(--text-15);
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
  position: relative; /* ::after 命中区外扩的定位基准 */
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
/* 触控目标 44px：外框 32 是设计定稿（iMessage 同款比例），靠命中区补到 44。
   往左多出的 6px 会压到输入框右沿约 2px —— 可接受，比"发送键点不中"划算。 */
.send-btn::after {
  content: '';
  position: absolute;
  inset: -6px;
}
.send-btn.active {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  cursor: pointer;
}
.send-btn.active:active {
  transform: scale(0.9);
}
/* 输入栏自己成了玻璃浮岛之后，发送键原来那层 --color-bg-input（夜里是 .08 白）叠在
   .10 白的浮岛上几乎看不见 → 夜里单独提一档，让"可点的圆"读得出来。
   白天不用改：浮岛是 .85 白，原来的 #f0f0f2 仍能区分。 */
.chat-container.night .send-btn {
  background: rgba(255, 255, 255, 0.14);
}

.clear-btn {
  width: 36px; height: 36px;
  position: relative; /* ::after 命中区外扩的定位基准 */
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
/* 触控目标 44px：36 + 左右各 4 = 44 */
.clear-btn::after {
  content: '';
  position: absolute;
  inset: -4px;
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

/* ===== 未配置密钥提示（BYOK）· 小胶囊（2026-11-23 改）
   原来是"全宽横条 + 独立去配置按钮"，压在输入浮岛上方 —— 底部三层、两种材质，间距读起来不均。
   现在收成一颗自适内容宽的小胶囊，整颗可点：
     · 宽度由内容决定（key 图标 + 4 个字 + 内边距），比导航浮岛（112）还窄；
     · 材质比输入浮岛"薄"一档（--color-bg-input 的 alpha 更低 / 白天是浅灰块，无投影），
       这样一眼能读出"输入是主动作、它只是提示"；
     · 居中于浮件组（align-self: center），与输入浮岛、导航浮岛共一条中线。
   位置/位移不在这里 —— 交给 .bottom-dock，键盘弹起时它跟着整组一起上浮。 */
.setup-pill {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 13px;
  border: none;
  border-radius: 999px;
  background: var(--color-bg-input);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: var(--color-text-secondary);
  font-size: var(--text-12);
  font-weight: 500;
  font-family: var(--font-system);
  line-height: 1;
  cursor: pointer;
  position: relative;            /* ::after 命中区外扩的定位基准 */
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.15s ease-out;
}
.setup-pill:active { transform: scale(0.96); }
/* 触控目标 44px：视觉 32 高，上下各补 6 —— 与输入浮岛之间只有 6px gap，
   外扩会轻微压到浮岛边缘，但热区优先（人点的是胶囊中心，边缘误触概率极低） */
.setup-pill::after {
  content: '';
  position: absolute;
  inset: -6px;
}

/* ===== 错误提示 ===== */
.error-hint {
  position: relative;
  z-index: 1;
  padding: 6px 12px;
  font-size: var(--text-12);
  color: var(--color-danger);
  text-align: center;
  background: var(--color-danger-bg);
}
</style>
