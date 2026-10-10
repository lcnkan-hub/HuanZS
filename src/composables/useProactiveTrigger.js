/**
 * 王冠主动开口的触发点（2026-10-10 · I02）
 *
 * 职责：决定「什么时候去问一句该不该开口」——app 启动时一次，每次切回前台再一次。
 * 判据、生成、记账都不在这里（见 utils/proactiveJudge 与 composables/useProactive）。
 *
 * 为什么挂在 app 生命周期上，而不是王冠页挂载时：
 *   首屏是用户上次停留的 Tab（I03 方案 B）。如果上次停在笔记，冷启动根本不会挂载王冠页，
 *   而 R1 要求的是「打开 app 的那一刻，王冠已经先开过口」。触发点必须与视图无关。
 *   能这么写的前提是 useChat / useMemory 已是模块级单例——不然从别处写聊天记录会被覆盖。
 *
 * 不做的判断：不去看「用户是不是正在等回复」。等回复 = 用户刚说过话，
 * 判据的 20 小时间隔已经把它拦掉了（请求 30 秒超时，不可能挂 20 小时）。
 * 万一真撞上（启动那一刻用户立刻发消息），useProactive 里的 chat-moved 会把那句话作废且不记账。
 */
import { maybeSpeakProactive } from './useProactive'
import { useChat } from './useChat'
import { useMemory } from './useMemory'
import { getAIConfig } from './useApiKey'

let started = false
let busy = false

/** 判一次、该说就说。副作用只有两个：往聊天记录里加一条、往账本里记一条 */
async function check() {
  if (busy) return
  // 没配密钥：连回复都发不出，谈不上主动开口（避免每次启动都白跑一遍判据后的生成）
  if (!getAIConfig().apiKey) return
  busy = true
  try {
    const { messages, addReply } = useChat()
    const memory = useMemory()
    // 记忆用「未退休全量」那一档（与日常注入同源）；没有可"想起"的东西时判据自然否掉
    const injectable = memory.getInjectableMemories()
    const { spoken, line } = await maybeSpeakProactive({
      messages: messages.value,
      memoryCount: injectable.length,
      memoryBlock: memory.buildContextBlock(injectable)
    })
    if (spoken && line) addReply(line)
  } catch {
    // 主动开口失败一律静默：用户没问任何事，不该看到一条红字
  } finally {
    busy = false
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') check()
}

/**
 * 启动触发（在已登录之后调用一次）。重复调用无副作用。
 * @returns {() => void} 停止监听（正常流程不需要，app 根组件不卸载）
 */
export function startProactiveTrigger() {
  if (started) return () => {}
  started = true
  check() // app 启动：这是「打开 app 王冠已经先开过口」的那一次
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    started = false
  }
}
