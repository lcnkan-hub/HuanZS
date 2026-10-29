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
import { STORAGE_KEYS, TAB_NAMES } from '../constants/categories'
import { generateUniqueId } from '../utils/uniqueId'
import { askStructured } from './useChatAI'
import { writeWikiItems, listWikiTitles } from './useWikiWriter'
import { pickRelevant } from '../utils/retrievalSelect'

// —— 白名单常量 ——
export const MEMORY_TYPES = ['fact', 'goal', 'event', 'preference'] // v1 白名单四类
export const SOURCES = ['user_explicit', 'ai_inferred']             // 来源枚举（v1 不做置信度数值）
export const SENTIMENTS = ['negative', 'open', 'neutral']           // 情绪打标
export const STATUSES = ['active', 'archived']                      // 状态（v1 仅占位）

// —— C 档沉默阈值（MVP 定值，可调） ——
const EVENT_SILENT_DAYS = 5   // ③Event 类：沉默 3~7 天，MVP 先定 5 天
const GOAL_SILENT_DAYS = 12   // ②Goal 类：沉默 10~14 天，MVP 先定 12 天
const SILENT_DAYS = { event: EVENT_SILENT_DAYS, goal: GOAL_SILENT_DAYS } // ①④类不在此表 → 天然不进 C 档

// —— 注入配置 ——
// 改之前（方案 A）：按最近时间取前 15 条全量注入，不管这一轮在聊什么。
// 改之后（A06）：条数由**相关度**决定 —— 15 条都相关就给 15 条，一条都不相关只给 3 条兜底。
// 所以这个 15 是**硬顶**，不是「固定给 15 条」；兜底条数单独由 RECENT_FILL 控制。
const INJECT_LIMIT = 15     // 注入硬顶（无论相关多少都不超过）
const RECENT_FILL = 3       // 相关命中不足时的兜底条数（按最近优先补，别让王冠手里空着）
const MEMORY_MATCH_MIN = 2  // 记忆相关门槛：记忆只有一句骨架内容，2 个 gram 重合已算相关
const MAX_CONTENT_LEN = 120 // 骨架内容长度上限（写入/注入二次过滤共用）

// —— 提取提示里百科标题的预算（A06 的账就在这一行）——
// 原来 listWikiTitles() 全量拼进去，百科记到几百条以后每轮都多付一份全库清单的钱。
const MAX_WIKI_TITLES = 40  // 提示里最多列几条标题
const WIKI_FILL = 12        // 无相关时的兜底条数（最近 12 条，够模型判断"该追加还是新建"）

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

// 记忆库是模块级单例（与 useChat / useWikiData 同一个道理）：同一个键有两个活跃 ref 会各持快照 → 静默丢数据。
// 王冠主动开口要在 app 启动时读记忆（判断"有没有可想起的事"），那时王冠页可能还没挂载。
const { data: memories, error } = useLocalStorage(STORAGE_KEYS.MEMORY, [])

export function useMemory() {
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

  /**
   * 取注入用记忆：相关优先 + 少量兜底（A06）
   *
   * 改之前：按 last_mentioned_at 取最近 15 条全给 —— 不管用户这轮在聊什么。
   * 改之后：先挑与本轮输入相关的（门槛 2 个 gram 重合），不够就按"最近"补 3 条兜底。
   * 注意这不是"换一个更小的硬编码数字"：相关 15 条就给 15 条，一条都不相关只给 3 条。
   */
  function getInjectableMemories(userText = '') {
    const list = (memories.value || []).filter(m => !isRetired(m))
    list.sort((a, b) => toMs(b.last_mentioned_at) - toMs(a.last_mentioned_at))
    const { picked } = pickRelevant(list, userText, {
      limit: INJECT_LIMIT,
      fill: RECENT_FILL,
      minScore: MEMORY_MATCH_MIN,
      titleHit: 1,            // 记忆没有标题，只有一句骨架内容 → 只有正文通道
      bodyHit: 1,
      getTitle: () => '',
      getBody: m => m.content
    })
    return picked
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

    // 1. 记忆上下文块（A06：相关优先 + 少量兜底，不再是不管在聊什么都塞最近 15 条）
    const ctx = buildContextBlock(getInjectableMemories(userText))
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
  function buildExtractPrompt(userText = '') {
    const list = getInjectableMemories(userText)
    const memLines = list.map(m => `${m.id}：${m.content}`).join('\n') || '（暂无）'
    // 百科清单：只给「分类｜标题｜日期」，不给正文（控 Token）。
    // 没这份清单，模型无从判断该新建还是补进已有条目 —— 那是「只会新建」的根因。
    // 但清单**不能是全量**（A06）：百科记到几百条以后，每轮聊天都要多付一份全库的钱，用户完全无感。
    // 折中：按本轮输入挑相关 + 最近兜底，并在提示里如实说「清单不全」，防止模型因为没看见就乱挂。
    const titles = listWikiTitles()
      .slice()
      .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
    const { picked: wikiPicked, total: wikiTotal } = pickRelevant(titles, userText, {
      limit: MAX_WIKI_TITLES,
      fill: WIKI_FILL,
      minScore: 3,
      getTitle: w => (w.parent ? `${w.parent} ${w.name}` : w.name),
      getBody: () => ''
    })
    const wikiLines = wikiPicked
      .map(w => `${TAB_NAMES[w.category] || w.category}｜${w.parent ? `${w.parent} › ${w.name}` : w.name}｜${w.time}`)
      .join('\n') || '（暂无）'
    return `你是记忆提取器，根据本轮回合（用户消息 + 王冠回复）判断是否有值得写入长期记忆的信息。
只允许以下白名单四类，其余一律不提取：
- fact：用户明确陈述的稳定事实（职业、常驻城市、长期习惯、明确爱好），不带情绪评价。
- goal：用户自设、有进度感的进行中目标。不存动机细节、失败后的自我评价。
- event：未解决事件骨架（和谁、大致因为什么、当时情绪）。不存逐字细节、第三方具体行为、隐私细节。
- preference：关于王冠该怎么表现的交互设置（称呼方式、回复长度、语气风格、功能偏好）。
明确不存（一律不提取）：情感依赖/陪伴期待/主动关心要求（如"你以后多关心我""你要一直陪着我""不要忘记我"）、要求"记住"某段内容的请求、第三方具体行为描述、隐私细节、健康归因猜测、危机信号内容（自伤/伤人/告别等）。

同时判断一次「百科」（与记忆的区别：记忆是关于用户**本人**的，百科是关于**世界的知识**）：
- 类别只有三个：game（游戏相关：攻略/机制/地图）、note（知识/学习/读书/工作方法）、life（生活经验：居家/健康常识/办事流程）
- 判据：**可复用、以后可能想再查**的方法或事实。用户说"帮我记一下…"，或明确讲了某个做法/知识时，优先考虑
- 不写：关于用户本人的事（那属于记忆）、闲聊、情绪、一次性的临时信息、一句话就说完的小事
- 保守：**不确定就不写**。宁可漏记，也不能把百科变成垃圾桶（垃圾会毁掉以后检索的质量）
- title 用简短名词短语（≤20 字）；content 写清要点、可含步骤，不要写成对话口吻
- **三种动作**：
  · 全新内容 → mode: "new"，自拟 title 并给 category
  · 补充/续写已有条目（主条目或子词条都算）→ mode: "append"，title 只写**该条目名本身**（不要带 " › " 前缀），content 只写新增的部分（不要重复或重抄已有内容）。用户说"给 XX 那条补一句""XX 再记一点""接着记"这类，一律走 append
  · 内容由**多个并列小主题**组成、挂到某个主题条目下面更清楚 → mode: "child"，parent 填主条目名、title 填子条目名，category 可省略
- **分层判据（别硬套壳）**：
  · 多个并列小主题（"几条攻略""几个要点"这种）→ 先用 new 建一个主题主条目（如「塞尔达老玩家攻略」），再对每个主题 child 一个子词条
  · 一整段连续的说明 → 主条目正文就够，别拆
  · 单条小知识 → 直接 new 一个主条目，不要造父子
  · wiki 数组**按顺序执行**，所以「先 new 主条目、再 child 挂子词条」在同一个数组里就能完成

规则：
1. content 用骨架化一句话，不含逐字引用、不含隐私细节，不超过 120 字。
2. sentiment 仅 event/goal 有意义，取 negative/open/neutral；fact/preference 一律 neutral。
3. source：内容源自用户直接陈述 → user_explicit；仅当你从行为模式推断而非用户说出 → ai_inferred（v1 极少用）。
4. 判断标准：这条信息是否影响未来交流质量？不影响就不提取。宁可少记，不错误地记。

已有记忆（id：内容）：
${memLines}

已有百科条目（分类｜标题｜日期；库里共 ${wikiTotal} 条，这里按相关度只列了 ${wikiPicked.length} 条）：
${wikiLines}

清单不全时的判断规则：**上面没列出来，不代表库里没有**（只列了最相关的一小部分）。
- 只有清单里**明确列出**的条目，才允许用 append / child
- 你判断用户说的是清单里没有的主题 → 用 new 新建
- 宁可新建一条（用户之后能合并），也不要把内容硬挂到不相干的主题下面

请判断本轮回合用户是否提到了某条已有记忆（内容相近即可），把对应 id 放进 mentioned_ids。

只返回一个 JSON 对象，不要输出其他文字：
{ "writes": [{ "type": "...", "content": "...", "source": "...", "sentiment": "..." }], "mentioned_ids": ["..."], "wiki": [{ "mode": "new|append|child", "title": "...", "category": "game|note|life", "parent": "主条目名（仅 child 用）", "content": "..." }] }
append / child 时 category 可省略（都按名字在库里找）。
writes 与 wiki 都可以是空数组 —— 大多数轮次两个都应该是空的。`
  }

  /** 提取并写入（模型失败 → 静默跳过，不写入；字段缺失 → 丢弃该条，防止污染库） */
  async function extractAndWrite(userText, assistantReply) {
    if (!userText || !assistantReply) return
    if (round.blockUserMemory) return // "记住"私密请求本轮不写入任何记忆
    if (extracting) return // 连续快速发送时，跳过并发的提取
    extracting = true
    try {
      const result = await askStructured(
        buildExtractPrompt(userText),
        `【用户消息】\n${userText}\n\n【王冠回复】\n${assistantReply}`
      )
      if (!result) return

      // 一次调用两件事：writes = 记忆（关于用户本人），wiki = 百科（关于世界的知识）
      const memWrites = Array.isArray(result.writes) ? result.writes : []
      const wikiWrites = Array.isArray(result.wiki) ? result.wiki : []

      const list = [...(memories.value || [])]
      let changed = false

      // 白名单写入（逐条校验；情感依赖/"记住"内容即使被模型输出也在此兜底拦下）
      for (const raw of memWrites) {
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

      // 百科落库：类别白名单/标题/正文长度/同名去重 的校验在 useWikiWriter 里做；失败静默
      if (wikiWrites.length > 0) writeWikiItems(wikiWrites)
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
    isRetired,
    // 记忆措辞的唯一出口：主动开口（useProactive）也要用同一套语气，
    // 否则会出现"日常对话里是『你之前说过…』、主动开口里是另一种说法"的漂移
    buildContextBlock
  }
}
