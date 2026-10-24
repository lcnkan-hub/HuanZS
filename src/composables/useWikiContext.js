/**
 * 百科上下文积木（王冠读百科 · 第一/二步）
 * 职责：把用户记过的内容，整理成可注入王冠 system prompt 的文本
 *
 * 两条路（同一入口，自动选择）：
 *   A. 命中：本轮提问与某几条条目相关 → 注入这几条的**正文**（王冠能答细节）
 *   B. 回退：没命中 → 注入**最近记的条目清单**（王冠至少知道你手头有什么）
 *
 * 边界：只读不写；不改 dbData 的 { game, note, life } 结构（RULES 第 4 条）；零 API 调用。
 *
 * 关键实现决定：**每次调用直接读 localStorage，不用响应式 ref**。
 * useWikiData 在别处会创建自己的 ref 实例，两者不互相同步 ——
 * 用快照会导致「用户刚记完，王冠读不到」这种极难查的隐蔽 bug。
 */
import { STORAGE_KEYS, ALL_CATEGORIES, TAB_NAMES } from '../constants/categories'
import { scopeKey } from '../utils/storageScope'
import { buildQuery, scoreAgainst } from '../utils/textMatch'

const RECENT_DAYS = 7     // 回退路径：优先取最近 7 天记的（覆盖"我上周记的东西"这类问法）
const MAX_RECENT = 8      // 回退路径：注入条数上限
const MIN_RECENT = 3      // 回退路径：7 天内不足此数时放宽为「最近 N 条」，保证王冠手里总有货
const SNIPPET_LEN = 50    // 回退路径：每条摘要字符数
const MAX_MATCHED = 3     // 命中路径：最多注入几条全文（控 Token）
const BODY_LEN = 600      // 命中路径：每条正文截断字符数
const TITLE_HIT = 3       // 打分：标题命中一个 2-gram 记 3 分
const BODY_HIT = 1        // 打分：正文命中一个 2-gram 记 1 分
const MATCH_MIN = 3       // 命中门槛：至少一个标题命中（或三个正文命中）才算相关

/**
 * 中文匹配的取舍（本文件最容易出错的地方）：
 * 不引分词库 —— 中文没有空格，最省事又够用的办法是**双字组（2-gram）重叠度**，
 * 再把含常见虚字的 gram 丢掉（否则"的/了/什么"这种到处都是的音节会制造假命中）。
 * 门槛故意定高（MATCH_MIN = 3，等于要一个标题命中）：
 * **宁可回退到"最近清单"，也不要引入噪音命中** —— 假命中会让王冠一本正经地答错东西。
 * 代价：只出现在正文、标题里没有的说法（如"机关球怎么打"）匹配不到，
 * 但那种情况会走回退路径，王冠仍能从最近条目里认出来。
 */
// 2-gram 切分与虚字表已上收到 `src/utils/textMatch.js`（2026-10-24）：
// 记忆挑选与百科注入要用同一套判据，否则两处各调各的，改一处另一处不跟。
// 本文件只保留「相关性门槛」这类业务常量（TITLE_HIT / MATCH_MIN 等）。

/** 归一化：只保留三个分类键，非数组一律置空 */
const normalizeDb = db => Object.fromEntries(ALL_CATEGORIES.map(c => [c, Array.isArray(db[c]) ? db[c] : []]))

/** 读百科数据（实时读，避免拿到别处的旧快照） */
function readDb() {
  try {
    return normalizeDb(JSON.parse(localStorage.getItem(scopeKey(STORAGE_KEYS.DB)) || 'null') || {})
  } catch {
    return normalizeDb({}) // localStorage 不可用或数据损坏 → 当空库。绝不因读百科失败打断对话。
  }
}

/** "YYYY/MM/DD HH:mm" → 时间戳；解析不了返回 0（排序时自然沉底） */
function parseTime(str) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/.exec((str || '').trim())
  if (!m) return 0
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() || 0
}

/** Markdown 正文 → 一行纯文本摘要（去标记、压空白、截断） */
function toSnippet(wiki) {
  const plain = (wiki || '')
    .replace(/```[\s\S]*?```/g, ' ')          // 代码块
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // 链接保留文字
    .replace(/[#>*`_~\-]+/g, ' ')             // 标题/强调/列表符号
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > SNIPPET_LEN ? plain.slice(0, SNIPPET_LEN) + '…' : plain
}

/** 正文（保结构、去图片/链接语法、切掉超长尾巴） */
function clipBody(wiki) {
  const t = (wiki || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return t.length > BODY_LEN ? t.slice(0, BODY_LEN) + '…' : t
}

/** 主/子条目展平成一维（子条目带父名，便于王冠理解层级） */
function flatten(db) {
  return ALL_CATEGORIES.flatMap(category =>
    (db[category] || []).flatMap(item => {
      const parent = { category, name: item.name || '（未命名）', wiki: item.wiki, ts: parseTime(item.time), time: item.time }
      const children = (item.children || []).map(child => ({
        category,
        name: child.name || '（未命名）',
        wiki: child.wiki,
        ts: parseTime(child.time || item.time),
        time: child.time || item.time,
        parentName: item.name || ''
      }))
      return [parent, ...children]
    })
  )
}

const labelOf = item => TAB_NAMES[item.category] || item.category
const dateOf = item => (item.time || '').split(' ')[0] || '（无日期）'
const nameOf = item => (item.parentName ? `${item.parentName} › ${item.name}` : item.name)

/**
 * 打分：标题权重高、正文权重低（判据统一走 textMatch.scoreAgainst）
 * 两段式：先字面重叠；字面不足时才走近义归一。
 * 返回 raw（未折算分数）——门槛按 raw 判，排序按 score 判，
 * 否则近义命中被 ×0.8 折完之后永远过不了 MATCH_MIN。
 */
function scoreItem(item, query) {
  return scoreAgainst(
    query,
    { title: item.name, body: item.wiki },
    { titleHit: TITLE_HIT, bodyHit: BODY_HIT }
  )
}

/** 命中路径：挑最相关的几条（不足门槛的丢弃） */
function matchItems(items, userText) {
  const query = buildQuery(userText)
  if (query.exact.size === 0 && query.near.size === 0) return []
  return items
    .map(item => ({ item, ...scoreItem(item, query) }))
    .filter(x => x.raw >= MATCH_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHED)
    .map(x => x.item)
}

/** 命中路径的渲染：给正文 */
function renderMatched(items) {
  const blocks = items.map(i => {
    const body = clipBody(i.wiki)
    return `· [${labelOf(i)}] ${nameOf(i)}（${dateOf(i)}）\n${body ? '  ' + body : '  （这条没有正文）'}`
  })
  return [
    '【用户自己记下的内容 · 与本次提问相关的条目全文】',
    ...blocks,
    '',
    '用法说明：以上是从用户自己的记录里取出的相关条目，内容可直接使用。' +
      '回答时说清是根据他记的哪一条，不要说"我查一下"。' +
      '如果这些内容不足以回答，就直说记的内容里没有，**不要编**。'
  ].join('\n')
}

/** 回退路径的渲染：给最近条目清单（摘要） */
function renderRecent(items) {
  items.sort((a, b) => b.ts - a.ts)
  const cutoff = Date.now() - RECENT_DAYS * 86400000
  const recent = items.filter(i => i.ts >= cutoff)
  const picked = (recent.length >= MIN_RECENT ? recent : items).slice(0, MAX_RECENT)

  const lines = picked.map(i => {
    const snippet = toSnippet(i.wiki)
    return `· [${labelOf(i)}] ${nameOf(i)}${snippet ? ' —— ' + snippet : ''}（${dateOf(i)}）`
  })

  return [
    '【用户自己记下的内容（背景知识，供你理解上下文）】',
    ...lines,
    '',
    '用法说明：这些是用户亲手记录或让你记下的东西。用户问起相关话题时，直接拿这些内容回答，' +
      '不要说"我查一下"或"我没有这个信息"。用户问"我最近记了什么"时，照着上面的清单回答。' +
      '但不要主动复述这份清单，也不要每轮都提它——它只是背景。'
  ].join('\n')
}

/**
 * 组装注入文本（唯一入口）
 * @param {string} [userText] 本轮用户输入（用于判断该给哪几条的正文；空则走回退）
 * @returns {string} 可拼进 system prompt 的文本；空库返回 ''（不注入）
 */
export function buildWikiContext(userText = '') {
  const items = flatten(readDb())
  if (items.length === 0) return '' // 空库不注入 —— 王冠不该对着一片空白说"你记过什么"

  const matched = matchItems(items, userText)
  return matched.length > 0 ? renderMatched(matched) : renderRecent(items)
}
