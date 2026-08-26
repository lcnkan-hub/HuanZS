/**
 * 王冠记忆积木
 * 白名单四类记忆的结构化写入 + 状态机流转 + 对话上下文注入
 *
 * 记忆条目 Schema：{ id, type, content, source, sentiment, created_at, last_mentioned_at, care_shown, status }
 *   - type     ：fact | goal | event | preference（v1 白名单四类；⑤行为模式推迟 v2/v3）
 *   - source   ：user_explicit | ai_inferred（v1 正常写入基本都落在 user_explicit）
 *   - sentiment：negative | open | neutral（①④类恒为 neutral，天然不进入 C 档）
 *   - status   ：active | archived（v1 仅占位，默认 active，不做自动归档）
 *
 * 状态机：sentiment 打标（写入时）→ 沉默判断（注入时）→ C档候选（注入时）
 *       → 代码触发留门式开口（对话开始注入指令）→ care_shown 置真（对话结束提取阶段）
 * 所有状态更新都挂载在"每轮对话结束后的提取阶段"这一个时间点，不新增后台任务/定时器。
 *
 * 存储键：localStorage['huan_zhong_shu_memory_v1']（升级时改 _v2）
 * 时间格式：ISO 8601 字符串；验收构造数据时用 new Date(Date.now()-X*86400000).toISOString() 生成"X天前"
 */
import { useLocalStorage } from './useLocalStorage'
import { STORAGE_KEYS } from '../constants/categories'
import { generateUniqueId } from '../utils/uniqueId'
import { askStructured } from './useChatAI'

// —— 白名单常量 ——
export const MEMORY_TYPES = ['fact', 'goal', 'event', 'preference'] // v1 白名单四类
export const SOURCES = ['user_explicit', 'ai_inferred']             // 来源枚举（v1 不做置信度数值）
export const SENTIMENTS = ['negative', 'open', 'neutral']           // 情绪打标
export const STATUSES = ['active', 'archived']                      // 状态（v1 仅占位）

// —— C 档沉默阈值（MVP 定值，可调） ——
const EVENT_SILENT_DAYS = 5   // ③Event 类：沉默 3~7 天，MVP 先定 5 天
const GOAL_SILENT_DAYS = 12   // ②Goal 类：沉默 10~14 天，MVP 先定 12 天
const SILENT_DAYS = { event: EVENT_SILENT_DAYS, goal: GOAL_SILENT_DAYS } // ①④类不在此表 → 天然不进 C 档

// —— 注入配置（方案 A：全量注入，非检索） ——
const INJECT_LIMIT = 15     // 每次注入最近 N 条（可配置项）
const MAX_CONTENT_LEN = 120 // 骨架内容长度上限（写入/注入二次过滤共用）

const DAY_MS = 86400000

// —— 情感依赖类请求关键词（④类"不存"反例，代码层触发"回应但不落库"，v1 启发式） ——
const EMOTIONAL_DEP_PATTERNS = [
  /以后.{0,6}(每天|经常|多|主动).{0,6}(关心|陪|联系|问我|找我)/, // 你以后每天主动问我状态 / 以后多关心我
  /(一直|永远|每天).{0,4}(陪着?|陪伴|陪陪我|陪我到)/,             // 你要一直陪着我
  /不要忘记我|别忘了.{0,3}我|要一直记住我|永远记住我/,            // 不要忘记我
  /(像|当成?)(真正|真的)?的?朋友一样.{0,4}(关心|陪|对待)/,        // 你应该像真正朋友一样关心我
  /(多|好好|更加).{0,2}关心我/,                                   // 你以后多关心我
  /(一直|永远)陪(着|到|在)?我/                                    // 你要一直陪着我
]

// —— "记住"私密事件关键词（命中 → 固定话术回应，不写入长期记忆） ——
const REMEMBER_PATTERNS = [
  /(记住|记下来|帮我记着?|要记住|记住了|记在心?里)/ // 用户提出"记住"动作
]
const PRIVATE_MARKERS = [
  /(我和|我跟你|咱俩|我们俩|和.{0,6}(室友|朋友|家人|同事|恋人|对象|父母|兄弟|姐妹)).{0,12}(的事|经历|矛盾|吵架|关系|秘密|隐私|家事|争执|闹翻|不开心|难过)/,
  /(私密|悄悄话|隐私|心里话|伤心事|私事)/
]

/** "记住"私密事件的固定话术（代码层生成，不依赖模型当场判断；温暖、不承诺、不落库） */
const REMEMBER_FIXED_REPLY = '你说的话我听到了，这段我先放在这轮对话里，不会写进长期记忆。如果有特别重要的事需要我一直记得，你可以具体告诉我是什么事，我会按规则判断能不能记。'

/** 情感依赖类请求的本轮回应方向（三要素，措辞由模型发挥，不写死句式） */
const EMOTIONAL_DIRECTION_NOTE = `【本轮特别要求】用户刚才表达了对陪伴、关心或"别忘记我"的期待。回应时同时避开两个极端：
1. 不生硬拒绝：不要说"我不能记住这个""这个我做不到"这类让用户感觉被冷处理的话；
2. 不虚假承诺：不要答应"我会一直陪着你""我会记住并经常关心你"这类会落空的承诺。
正确方向（三个要素，用你自己的话自然表达，不要照抄模板）：真诚接住这句话背后的感受 + 明确这句话不会变成一条自动规则 + 不对做不到的事撒谎。例如可以说："我听到了，这句话我记在这轮对话里"。`

export function useMemory() {
  const { data: memories, error } = useLocalStorage(STORAGE_KEYS.MEMORY, [])

  // 本轮对话状态（prepareTurn 记录，finishTurn 消费）
  let round = { injectedCIds: [], blockUserMemory: false }
  let extracting = false // 防并发提取：连续快速发送时跳过后一轮提取

  /** 是否已退休：status 非 active，或 ③Event 且已开口过（care_shown=true 视为退休） */
  function isRetired(m) {
    return m?.status !== 'active' || (m?.type === 'event' && m?.care_shown === true)
  }

  /** 时间解析：ISO 或 "YYYY/MM/DD HH:mm" 均可，失败返回 0 */
  function toMs(iso) {
    if (!iso) return 0
    const t = new Date(iso).getTime()
    return Number.isNaN(t) ? 0 : t
  }

  /** 当前时间 ISO 字符串 */
  function nowIso() {
    return new Date().toISOString()
  }

  /** 距今多少天（不足 1 天返回 0，解析失败返回 null） */
  function daysAgo(iso) {
    const t = toMs(iso)
    if (!t) return null
    return Math.floor((Date.now() - t) / DAY_MS)
  }

  /** 内容清洗（写入/注入二次过滤共用）：去首尾空格、压长、去外层引号，只留骨架句 */
  function sanitizeContent(content) {
    if (typeof content !== 'string') return ''
    let s = content.trim()
    if (s.length > MAX_CONTENT_LEN) s = s.slice(0, MAX_CONTENT_LEN - 1) + '…'
    return s.replace(/^["“「『']+|["”」』"]+$/g, '')
  }

  /** 校验并规范化一条记忆；缺关键字段返回 null = 不写入，防止污染库 */
  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null
    const type = raw.type
    const content = sanitizeContent(raw.content)
    if (!MEMORY_TYPES.includes(type) || !content) return null

    const source = SOURCES.includes(raw.source) ? raw.source : 'user_explicit'
    // sentiment：①④类强制 neutral；②③类缺失时保守默认 neutral（不触发 C 档）
    let sentiment = raw.sentiment
    if (!SENTIMENTS.includes(sentiment)) sentiment = 'neutral'
    if (type === 'fact' || type === 'preference') sentiment = 'neutral'

    const created = toMs(raw.created_at) ? raw.created_at : nowIso()
    const lastMentioned = toMs(raw.last_mentioned_at) ? raw.last_mentioned_at : created
    // id：提取写入时由代码生成；seed/验收构造时保留调用方给的 id，保证按 id 提及可匹配
    const id = typeof raw.id === 'string' && raw.id ? raw.id : generateUniqueId()

    return {
      id,
      type,
      content,
      source,
      sentiment,
      created_at: created,
      last_mentioned_at: lastMentioned,
      care_shown: raw.care_shown === true,
      status: STATUSES.includes(raw.status) ? raw.status : 'active'
    }
  }

  /** 直接写入一条记忆（校验通过才落库；供 seed/验收构造数据用） */
  function addMemory(raw) {
    const entry = normalizeEntry(raw)
    if (!entry) return false
    memories.value = [...(memories.value || []), entry]
    return true
  }

  /** 取注入用记忆：未退休，按 last_mentioned_at 倒序，前 N 条 */
  function getInjectableMemories() {
    const list = (memories.value || []).filter(m => !isRetired(m))
    list.sort((a, b) => toMs(b.last_mentioned_at) - toMs(a.last_mentioned_at))
    return list.slice(0, INJECT_LIMIT)
  }

  /** C 档候选：三条准入同时满足（sentiment 非 neutral + 沉默超阈值 + care_shown 为 false） */
  function getCTierCandidates() {
    const now = Date.now()
    return (memories.value || []).filter(m => {
      if (m.status !== 'active') return false
      const threshold = SILENT_DAYS[m.type]
      if (!threshold) return false // ①④类不在阈值表 → 天然不进入 C 档
      if (m.sentiment !== 'negative' && m.sentiment !== 'open') return false
      if (m.care_shown === true) return false
      return now - toMs(m.last_mentioned_at) >= threshold * DAY_MS
    })
  }

  /** 记忆上下文块：只含骨架字段 + 按来源定语气（user_explicit 肯定 / ai_inferred 试探） */
  function buildContextBlock(list) {
    if (!list.length) return ''
    const typeLabel = { fact: '事实', goal: '目标', event: '事件', preference: '偏好' }
    const lines = list.map(m => {
      const prefix = m.source === 'ai_inferred'
        ? '我感觉你似乎'
        : '你之前' + (m.type === 'event' ? '提过' : '说过')
      const ago = daysAgo(m.last_mentioned_at)
      const when = ago === null ? '' : ago <= 0 ? '（最近提到）' : `（${ago}天前提过）`
      return `- 【${typeLabel[m.type] || m.type}】${prefix}${m.content}${when}`
    })
    return '【你的已知信息（来自记忆，供自然融入；不要逐条复述，不要显得背诵）】\n' + lines.join('\n')
  }

  /** 留门式开口指令（由代码决定"这轮该不该提示"，措辞与时机由模型发挥） */
  function buildCTierInstruction(candidates) {
    return candidates.map(c =>
      `本轮回复中，可以在自然的节点带一句："上次说的『${c.content}』，后来还顺利吗？"——语气留门，不追问细节，不要求必须出现，若对话节奏不合适可以不带。`
    ).join('\n')
  }

  /** 情感依赖类请求检测（命中 → 注入三要素方向，本轮不落库） */
  function matchEmotional(text) {
    return EMOTIONAL_DEP_PATTERNS.some(p => p.test(text))
  }

  /** "记住"私密事件检测（命中 → 固定话术直接回复，不落库） */
  function matchRememberPrivate(text) {
    return REMEMBER_PATTERNS.some(p => p.test(text)) && PRIVATE_MARKERS.some(p => p.test(text))
  }

  /** 对话开始前：组装本轮注入内容，返回 { note, fixedReply } */
  function prepareTurn(userText) {
    round = { injectedCIds: [], blockUserMemory: false }
    const parts = []

    // 1. 记忆上下文块（方案 A：未退休最近 N 条全量注入，不做语义检索）
    const ctx = buildContextBlock(getInjectableMemories())
    if (ctx) parts.push(ctx)

    // 2. C 档候选 → 本轮留门式开口指令
    const candidates = getCTierCandidates()
    if (candidates.length) {
      parts.push(buildCTierInstruction(candidates))
      round.injectedCIds = candidates.map(c => c.id)
    }

    // 3. 情感依赖类请求 → 注入三要素方向（回应但不落库）
    if (matchEmotional(userText)) {
      parts.push(EMOTIONAL_DIRECTION_NOTE)
    }

    // 4. "记住"私密事件 → 固定话术直接回复，跳过模型；本轮不写入任何记忆
    const fixedReply = matchRememberPrivate(userText) ? REMEMBER_FIXED_REPLY : null
    if (fixedReply) round.blockUserMemory = true

    return { note: parts.join('\n\n'), fixedReply }
  }

  /** 提取阶段专用系统提示（交给提取模型，期望返回 JSON） */
  function buildExtractPrompt() {
    const list = getInjectableMemories()
    const memLines = list.map(m => `${m.id}：${m.content}`).join('\n') || '（暂无）'
    return `你是记忆提取器，根据本轮回合（用户消息 + 王冠回复）判断是否有值得写入长期记忆的信息。
只允许以下白名单四类，其余一律不提取：
- fact：用户明确陈述的稳定事实（职业、常驻城市、长期习惯、明确爱好），不带情绪评价。
- goal：用户自设、有进度感的进行中目标。不存动机细节、失败后的自我评价。
- event：未解决事件骨架（和谁、大致因为什么、当时情绪）。不存逐字细节、第三方具体行为、隐私细节。
- preference：关于王冠该怎么表现的交互设置（称呼方式、回复长度、语气风格、功能偏好）。
明确不存（一律不提取）：情感依赖/陪伴期待/主动关心要求（如"你以后多关心我""你要一直陪着我""不要忘记我"）、要求"记住"某段内容的请求、第三方具体行为描述、隐私细节、健康归因猜测、危机信号内容（自伤/伤人/告别等）。

规则：
1. content 用骨架化一句话，不含逐字引用、不含隐私细节，不超过 120 字。
2. sentiment 仅 event/goal 有意义，取 negative/open/neutral；fact/preference 一律 neutral。
3. source：内容源自用户直接陈述 → user_explicit；仅当你从行为模式推断而非用户说出 → ai_inferred（v1 极少用）。
4. 判断标准：这条信息是否影响未来交流质量？不影响就不提取。宁可少记，不错误地记。

已有记忆（id：内容）：
${memLines}

请判断本轮回合用户是否提到了某条已有记忆（内容相近即可），把对应 id 放进 mentioned_ids。

只返回一个 JSON 对象，不要输出其他文字：
{ "writes": [{ "type": "...", "content": "...", "source": "...", "sentiment": "..." }], "mentioned_ids": ["..."] }
writes 可为空数组。`
  }

  /** 提取并写入（模型失败 → 静默跳过，不写入；字段缺失 → 丢弃该条，防止污染库） */
  async function extractAndWrite(userText, assistantReply) {
    if (!userText || !assistantReply) return
    if (round.blockUserMemory) return // "记住"私密请求本轮不写入任何记忆
    if (extracting) return // 连续快速发送时，跳过并发的提取
    extracting = true
    try {
      const result = await askStructured(
        buildExtractPrompt(),
        `【用户消息】\n${userText}\n\n【王冠回复】\n${assistantReply}`
      )
      if (!result || !Array.isArray(result.writes)) return

      const list = [...(memories.value || [])]
      let changed = false

      // 白名单写入（逐条校验；情感依赖/"记住"内容即使被模型输出也在此兜底拦下）
      for (const raw of result.writes) {
        const entry = normalizeEntry(raw)
        if (!entry) continue
        if (matchEmotional(entry.content) || matchRememberPrivate(entry.content)) continue
        // 轻量去重：同类型内容一致则不重复写，改为刷新提及时间
        const dup = list.find(m => m.type === entry.type && m.content === entry.content)
        if (dup) { dup.last_mentioned_at = nowIso(); changed = true; continue }
        list.push(entry)
        changed = true
      }

      // 刷新被提及记忆的 last_mentioned_at
      if (Array.isArray(result.mentioned_ids)) {
        for (const id of result.mentioned_ids) {
          const m = list.find(x => x.id === id)
          if (m) { m.last_mentioned_at = nowIso(); changed = true }
        }
      }

      if (changed) memories.value = list
    } catch (e) {
      // 提取失败 = 本轮不写入，不污染库，不影响对话
    } finally {
      extracting = false
    }
  }

  /** 每轮对话结束后的提取阶段：标记已开口 + 提取新记忆 + 刷新提及时间 */
  async function finishTurn(userText, assistantReply) {
    // 先标记本轮注入过开口指令的 C 档条目（确定性操作，不依赖提取模型）
    if (round.injectedCIds.length) {
      const ids = round.injectedCIds
      memories.value = (memories.value || []).map(m =>
        ids.includes(m.id) ? { ...m, care_shown: true } : m
      )
      round.injectedCIds = []
    }
    // 再走提取（新记忆写入 + last_mentioned_at 刷新），失败静默
    await extractAndWrite(userText, assistantReply)
  }

  return {
    memories,
    error,
    addMemory,
    prepareTurn,
    finishTurn,
    getInjectableMemories,
    getCTierCandidates,
    isRetired
  }
}
