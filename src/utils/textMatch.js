/**
 * 中文近似检索积木（2026-10-24 新增 · 第二批 A06/I06 的共同底座）
 * 职责：给「百科注入」（useWikiContext）与「记忆挑选」（useMemory）提供同一套匹配判据
 * 边界：纯函数、零依赖、零 API 调用、不读存储
 *
 * 为什么需要它：
 *   原来的 useWikiContext 只做字面 2-gram 重叠 —— 用户换个说法就检索不到
 *   （"包裹" vs "快递"、"烧菜" vs "做饭"），记忆与百科的价值闭环打折。
 *   真语义要调 embedding API：要花钱，还要把用户正文发出去 —— 与「数据本地优先」
 *   的形态相冲（见排期文件 2026-10-13 拍板记录第 1 条）。所以这里做**近似**：
 *   字面重叠优先，字面不足时再走一层「近义归一」。
 *
 * 两条铁律：
 *   1. **先字面、后同义**：字面命中的分数必须高于同义命中。否则在「字面已经够用」
 *      的场景上反而引入噪音，把原本能用的检索改坏 —— 改坏比不改更糟。
 *   2. **宁可回退，不要假命中**：近义表只收语义真正等价的词，不做联想扩展
 *      （"机关" 不等于 "谜题"）。假命中会让王冠一本正经地答错东西，
 *      而回退路径（最近清单）至少不会答错。
 */

// —— 中文匹配的基本盘 ——
// 中文没有空格，最省事又够用的切法是「双字组（2-gram）重叠度」，
// 再把含常见虚字的 gram 丢掉（否则"的/了/什么"这种到处都是的音节会制造假命中）。
export const STOP_CHARS = new Set(
  '的了是在有和就都要我你他她它们这那什么怎样吗呢吧啊不没很也还一个上下里来去说想能会可以把被给对从到与及而但又或如让做些之其则同样'
)

/**
 * 近义组：组内第一个词是「规范词」，其余是等价变体。
 *
 * 收词标准（很窄，故意窄）：**换掉它，句子意思不变。**
 * 收进来的是「同一件事的两种日常说法」，不是「相关的事」。
 * 反例（明确不收）：装备/武器/道具、地图/地形、神庙/迷宫 —— 它们相关但不等价，
 * 收了就会在用户问武器时把道具条目也捞上来。
 */
const SYNONYM_GROUPS = [
  // —— 生活 / 办事 ——
  ['快递', '包裹', '邮包'],
  ['丢了', '不见', '没了', '丢失', '弄丢', '找不着'],
  ['做饭', '烧菜', '下厨', '做菜'],
  ['看病', '就诊', '去医院', '求医'],
  ['费用', '价格', '价钱', '收费', '多少钱'],
  // 注：故意不收「花多少」—— 它是「花多少钱」的截断形，短变体会先于长变体命中，
  // 把长变体拆碎（"一个月花"＋"钱"），反而降低召回。变体只收完整的说法。
  ['租房', '租房子', '合租'],
  ['水电', '水电费', '水费电费'],
  ['押金', '保证金'],
  ['维修', '修理', '修一下'],
  ['坏了', '故障', '出问题', '不工作了'],

  // —— 学习 / 工作 ——
  ['笔记', '记笔记', '记录下来'],
  ['复习', '温习', '过一遍'],
  ['记忆', '记住', '不忘', '记得', '想起来'],
  ['考试', '测验', '测试'],
  ['专注', '专心', '集中注意力'],
  ['高效', '效率高', '事半功倍'],
  ['计划', '规划', '安排'],
  ['方法', '办法', '做法', '法子', '怎么搞', '怎么弄', '怎么做'],

  // —— 游戏 ——
  ['攻略', '打法', '怎么打', '怎么过', '过关', '通法'],
  ['打不过', '过不去', '卡关', '卡住', '打不赢', '过不去'],
  ['首领', 'boss', '头目', '老大'],
  ['存档', '存盘', '保存进度'],
  ['副本', '关卡'],
  ['属性', '数值', '面板'],

  // —— 产品 / AI ——
  ['主动', '自动', '自己想起来'],
  ['提示词', '指令', 'prompt']
]

/** 变体 → 规范词（同组内除首个之外的全部） */
const CANONICAL_OF = new Map()
for (const group of SYNONYM_GROUPS) {
  const canonical = group[0]
  for (const variant of group.slice(1)) CANONICAL_OF.set(variant, canonical)
}

/** 长词优先，避免"打不过"被"不过"这类短词先截断 */
const CANONICAL_KEYS = [...CANONICAL_OF.keys()].sort((a, b) => b.length - a.length)

/** 不过滤的粗切（只用于构造白名单，不做虚字判断） */
function rawBigrams(text) {
  const s = (text || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  const out = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

/**
 * 近义表里出现过的词，其 gram 一律保留。
 *
 * 为什么需要：虚字表是按**单字**判断的，'做' 在表里（"让做些之其"），
 * 于是 "做饭" 这个实词 gram 被一起杀掉 —— 用户问"做饭要注意什么"，
 * 标题就叫「做饭的基本顺序」，却一个 gram 都对不上（2026-10-24 测试当场抓到）。
 * 停用表挡的是噪音，不该顺手挡掉我们明确声明为"有意义"的词。
 *
 * 但白名单本身也会带进噪音（同日第二个 bug）：近义组里有"怎么做/怎么打"这类变体，
 * 它们的 gram 是"怎么"——把疑问词放行之后，「今天天气怎么样」就去命中了
 * 「快递丢了怎么处理」。所以白名单再过一道 SOFT_STOP：
 * **只放行实词性的 gram，疑问/否定/转折的仍然挡着。**
 */
const SOFT_STOP = new Set('怎么什么不过吗呢吧没')
const KEEP_GRAMS = new Set()
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    for (const g of rawBigrams(word)) {
      if (SOFT_STOP.has(g[0]) || SOFT_STOP.has(g[1])) continue
      KEEP_GRAMS.add(g)
    }
  }
}

/** 文本 → 双字组集合（只留中文/字母/数字，丢弃含虚字的 gram；近义表里的词除外） */
export function bigrams(text) {
  const s = (text || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  const out = new Set()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    if (KEEP_GRAMS.has(g) || (!STOP_CHARS.has(g[0]) && !STOP_CHARS.has(g[1]))) out.add(g)
  }
  return out
}

/**
 * 查询里出现了哪些近义变体 → 对应的规范词（用于**扩展**召回，不是替换）
 *
 * 为什么是扩展而不是替换（2026-10-24 改过一版）：替换会破坏原句的 gram。
 * 例："一个月花多少钱" 把"多少钱"换成"费用"，剩下"一个月花"+"钱"，
 * 反而跟标题「租房要问清的费用」一个 gram 都对不上。
 * 扩展只往查询里**加**规范词的 gram，原句不动 —— 召回变好，字面判断不变。
 */
export function canonicalWordsOf(text) {
  const s = String(text || '')
  const words = new Set()
  if (!s) return words
  for (const variant of CANONICAL_KEYS) {
    if (s.includes(variant)) words.add(CANONICAL_OF.get(variant))
  }
  return words
}

/**
 * 把一次查询拆成两套 gram：
 *   exact —— 原话的 gram（字面命中用，判据不退化）
 *   near  —— 由近义扩展补进来的 gram（同义不同词用；与 exact 去重，避免重复计分）
 */
export function buildQuery(text) {
  const exact = bigrams(text)
  const near = new Set()
  for (const word of canonicalWordsOf(text)) {
    for (const g of bigrams(word)) {
      if (!exact.has(g)) near.add(g)
    }
  }
  return { exact, near }
}

/**
 * 打分（单一真相）：标题命中权重高于正文命中。
 * 返回 { score, via } —— via 记录这次命中走的是哪条路，便于测试与排查。
 *   score = exactScore + nearScore * NEAR_FACTOR
 * 为什么近义要打八折：它是"推定相关"，字面是"确定相关"。
 * 两段都命中时按字面结果报 via='exact'（更可信）。
 */
export const NEAR_FACTOR = 0.8
/** 字面分低于这个值时才允许近义补（3 = 一个标题命中，与相关性门槛同源） */
export const NEAR_MIN = 3

export function scoreAgainst(query, { title = '', body = '' }, { titleHit = 3, bodyHit = 1, nearMin = NEAR_MIN } = {}) {
  const titleGrams = bigrams(title)
  const bodyGrams = bigrams(body)

  const scoreWith = grams => {
    let s = 0
    for (const g of grams) {
      if (titleGrams.has(g)) s += titleHit
      else if (bodyGrams.has(g)) s += bodyHit
    }
    return s
  }

  const exactScore = scoreWith(query.exact)
  const nearScore = query.near.size ? scoreWith(query.near) : 0

  // ① 字面已经够强 → 直接用它，绝不让近义插队（这条保证"改前能命中的，改后仍然命中且排前面"）
  if (exactScore >= nearMin) return { score: exactScore, raw: exactScore, via: 'exact' }
  // ② 字面弱、近义更强 → 用近义补，分数打折（排序时排在字面命中之后）
  if (nearScore > exactScore) return { score: nearScore * NEAR_FACTOR, raw: nearScore, via: 'near' }
  // ③ 都不够 → 如实报弱命中（由调用方门槛决定丢不丢）
  return { score: exactScore, raw: exactScore, via: exactScore > 0 ? 'exact' : null }
}

/** 粗略字符数（验收用：同一场景下比较"塞进提示的东西变少没"） */
export function estimateChars(text) {
  return String(text || '').length
}
