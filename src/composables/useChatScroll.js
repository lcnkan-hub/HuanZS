/**
 * 聊天消息区的滚动与「滑动即收键盘」（2026-11-24 从 ChatView 抽出，逻辑未改）
 *
 * 为什么抽：这 40 行全是「什么时候该滚、什么时候不该动」的判断，和发送编排混在一个 setup 里。
 * 抽出来之后 ChatView 只剩「发一条消息」的主线。
 *
 * 三条滚动触发（每条后面都有理由，别简化成一条 watch）：
 *   · 新消息到达 → 滚到底（deep：消息对象里的字段也会变）
 *   · 王冠开始思考 → 滚到底（让"正在输入"可见）
 *   · 键盘升/降 → 滚到底（可见区高度变了，最后一条不能被输入栏盖住）
 *
 * ⚠️ 为什么用触摸手势而不是 scroll 事件收键盘：
 *   iOS/Safari 拖列表时系统会自己收键盘，Android WebView 不会，同一个动作手感不同。
 *   用 scroll 事件的话，我们自己的 scrollToBottom() 也会触发 —— 刚发完消息就把键盘收了，
 *   恰好是最不想它收的时刻。触摸手势天然只来自「人在滑」。
 */
import { nextTick, watch, onMounted } from 'vue'

/** 手指位移超过这么多像素才算「在滑」（点按抖动通常在 5px 内） */
const DISMISS_DY = 12

export function useChatScroll({ listRef, inputRef, messages, isThinking, kbInset }) {
  /** 自动滚动到底部 */
  async function scrollToBottom() {
    await nextTick()
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  }

  let touchStartY = 0

  function onListTouchStart(e) {
    touchStartY = e.touches?.[0]?.clientY ?? 0
  }

  function onListTouchMove(e) {
    const y = e.touches?.[0]?.clientY ?? 0
    if (Math.abs(y - touchStartY) < DISMISS_DY) return
    touchStartY = y          // 一次手势只收一次：持续 move 不反复 blur
    inputRef.value?.blur()   // 没焦点时是空操作，所以不用先判断键盘开没开
  }

  watch(messages, scrollToBottom, { deep: true })
  watch(isThinking, () => {
    if (isThinking.value) scrollToBottom()
  })
  watch(kbInset, () => { scrollToBottom() })
  // 刷新页面 / 切换回王冠 Tab 时定位到最新对话（修复：刷新后停在顶部）
  onMounted(() => { scrollToBottom() })

  return { scrollToBottom, onListTouchStart, onListTouchMove }
}
