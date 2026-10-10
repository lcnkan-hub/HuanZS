/**
 * 「开局问句」的待办状态（模块级单例，故意不做响应式）
 *
 * 场景：用户点百科空列表上的一张卡片（在列表页），王冠问一句，用户切到王冠页回答。
 * 这张卡片和王冠的输入框在**两个组件、两个 Tab** 上，靠 props 传不过去 —— 需要一个跨组件的短状态。
 *
 * 只记「这一轮在等哪个分类的回答」，不记别的：回答一进 handleSend 就被取走（take 语义），
 * 所以它不可能残留到下一轮去把无关的话记成词条。
 */
let pendingTab = null

/** 点卡片时调用：记下这一轮在等哪个分类的回答 */
export function setPendingStarter(tab) {
  pendingTab = tab || null
}

/** 取走待办（取完即清）—— 只有确认要落库的那一次调用它 */
export function takePendingStarter() {
  const t = pendingTab
  pendingTab = null
  return t
}

/** 只看不清（排查/测试用） */
export function peekPendingStarter() {
  return pendingTab
}
