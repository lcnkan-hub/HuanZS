/**
 * AI 分类器端口（2026-11-24）
 *
 * 为什么需要它：
 *   crisisDetection 的 L2 语义确认要发一次「结构化提问」，而那个实现住在
 *   composables/useChatAI（因为它要读 API 配置）。services 直接 import 它是错的 ——
 *   于是成了环：
 *       useChatAI → services/crisisResponse → services/crisisDetection → useChatAI
 *   ESM 能加载，但初始化顺序变成运气问题，改这条链上任何一环都要先背下整条链。
 *
 * 解法是**把方向正过来**：这里只存一个函数槽。
 *   · composables/useChatAI 在模块加载时把 askStructured 注册进来（composables → services）
 *   · services/crisisDetection 需要时取出来用（services → services）
 *   谁都不再反过来 import 上层。
 *
 * 降级语义：槽是空的（比如单测、或 useChatAI 还没加载）→ 调用方跳过 L2，
 *   只用 L1 本地粗筛，绝不抛错、不假装成功。
 */

let classifier = null

/**
 * 注册「结构化提问」实现
 * @param {(systemPrompt: string, userContent: string) => Promise<object|null>} fn
 */
export function registerAIClassifier(fn) {
  classifier = typeof fn === 'function' ? fn : null
}

/** 取当前实现；没注册返回 null（调用方据此跳过 L2） */
export function getAIClassifier() {
  return classifier
}
