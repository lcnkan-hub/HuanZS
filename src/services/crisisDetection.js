/**
 * 危机响应 · 检测层（Detection）
 * 职责：只观察不决定——输出 Risk Signal Object，路由决策交给 Router
 * 两级筛选控成本：
 *   L1 本地零成本：关键词粗筛 + 语境降权（同句出现降 confidence）
 *   L2 仅粗筛命中时：一次独立分类 API 调用做语义确认（复用 askStructured）
 * 铁律：Detection observes. Router decides.
 */
import { askStructured } from '../composables/useChatAI'
import {
  RISK_KEYWORDS,
  CONTEXT_DOWNGRADE_PATTERNS,
  CONFIDENCE_DOWNGRADE_FACTOR,
  CONFIDENCE_THRESHOLDS
} from '../constants/crisisContextPatterns'

/** L2 独立分类器的系统提示词：语义优先，不依赖字面匹配（补词库漏报） */
const CLASSIFIER_SYSTEM_PROMPT = `判断以下消息是否包含自伤/自杀相关的风险信号，包括但不限于：直接表达、委婉说法、比喻、反讽式的绝望表达、方言或网络黑话中的隐晦表达。不要求包含"死""跳"等具体词汇才判定为高风险——重点识别语义而非字面匹配。
只输出 JSON：{"risk_level":"high|medium|low|none","signals":["explicit_self_harm_intent"|"method_reference"|"immediacy"|"hopelessness"|"worthlessness"|"farewell"],"confidence":0到1的数字,"evidence":"你判断依据的关键短语"}`

/** 关键词 → 风险信号映射（L1 判定依据，进 signals 字段供误报分析；对归一化文本匹配） */
const KEYWORD_SIGNAL_MAP = [
  { pattern: /跳下去|跳楼|跳桥|割腕|安眠药|烧炭|上吊|遗书|我已经决定了|准备好了|最后一天|今晚就/i, signal: 'method_reference' },
  { pattern: /自杀|想死|去死|轻生|结束生命|结束一切|活不下去|不想活|xiusi|qingsheng|killmyself|enditall|suicide|wannadie|zsle|xiangsi|woxiangsi/i, signal: 'explicit_self_harm_intent' },
  { pattern: /没有意义|没意思|不想活|活不下去|解脱|长眠|告别这个世界|睡过去不再醒|变成星星|去很远的地方|消失|绝望|撑不住|撑不下去|废物|多余的|hopeless|worthless|meiyisi|shenmeyisi/i, signal: 'hopelessness' },
  { pattern: /再见吧|再见这个世界|别找我了|byeworld|不用再见到|见不到我/i, signal: 'farewell' }
]

/** 拼音/连写信号映射（归一化文本专用：中文正则盖不到的对抗面） */
const PINYIN_SIGNAL_MAP = [
  { keys: ['juedingle', 'xiusi', 'qingsheng', 'zsle', 'woxiangsi', 'xiangsi', 'buxianghuo', 'killmyself', 'enditall', 'suicide', 'wannadie'], signal: 'explicit_self_harm_intent' },
  { keys: ['mingtianjiu', 'jintianjiu', 'jintianjiuzou'], signal: 'immediacy' }
]

/** 归一化：小写 + 去空白 + 去中英文标点（拼音连写/谐音替换后的对抗面统一） */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？、：；“”‘’（）【】《》…·,.!?;:'"()\-_]/g, '')
}

/**
 * L1 本地粗筛（同步、零成本、可单测）
 * @param {string} text 用户消息
 * @returns {{hit: boolean, downgraded: boolean, signals: string[]}}
 */
export function screenLocal(text) {
  const raw = String(text || '')
  const norm = normalize(raw)
  // 命中判定：显式关键词表（对归一化文本）或 信号正则任一命中（宁可多筛不漏）
  const keywordHit = RISK_KEYWORDS.some(k => norm.includes(String(k).toLowerCase()))
  let signals = KEYWORD_SIGNAL_MAP.filter(m => m.pattern.test(norm)).map(m => m.signal)
  // 拼音/连写变体的信号归类（中文正则覆盖不到的对抗面）
  for (const group of PINYIN_SIGNAL_MAP) {
    if (!signals.includes(group.signal) && group.keys.some(k => norm.includes(k))) {
      signals.push(group.signal)
    }
  }
  const hit = keywordHit || signals.length > 0
  if (!hit) return { hit: false, downgraded: false, signals: [] }

  // 语境降权：高危词与降权模式同句共存 → 标记降权（系数在置信度计算时生效）
  const downgraded = CONTEXT_DOWNGRADE_PATTERNS.some(p => raw.includes(p))
  // 兜底信号：关键词表命中但正则没覆盖时，至少给一个未知类型信号
  if (signals.length === 0) signals = ['keyword_match_uncategorized']
  return { hit: true, downgraded, signals }
}

/**
 * 由信号集合推断基础风险等级（b/d 分级的语义层）：
 * 方法/紧迫 → high；明确意图 → high；仅绝望感 → medium
 */
function baseLevelFromSignals(signals) {
  if (signals.includes('method_reference') || signals.includes('immediacy')) return 'high'
  if (signals.includes('explicit_self_harm_intent') || signals.includes('farewell')) return 'high'
  if (signals.includes('hopelessness')) return 'medium'
  return 'medium'
}

/** 置信度分档 → Risk Signal Object 的 risk_level 归一化 */
function bandOf(confidence) {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high'
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW) return 'medium'
  return 'none'
}

/**
 * 完整检测管线（异步）
 * @param {string} message 当前用户消息
 * @param {Array<{role,content}>} [recentContext] 最近几轮上下文
 * @param {Object} [injection] 测试注入：{ classifier } 替代真实 API 调用
 * @returns {Promise<{risk_level, signals[], confidence, detector_source[], timestamp}>}
 */
export async function detect(message, recentContext = [], injection = null, opts = {}) {
  const started = Date.now()
  const local = screenLocal(message)

  /** 未命中初筛 → 放行（零额外成本）；forceClassify 时仍做语义复核（轻量确认窗口用） */
  if (!local.hit && !opts.forceClassify) {
    return {
      risk_level: 'none',
      signals: [],
      confidence: 0,
      detector_source: [],
      timestamp: new Date().toISOString()
    }
  }

  let signals = [...local.signals]
  let confidence
  let sources = local.hit ? ['rule_engine'] : []

  if (local.hit) {
    const cls = await classifyWithFallback(message, recentContext, injection)
    if (cls) {
      confidence = local.downgraded ? cls.confidence * CONFIDENCE_DOWNGRADE_FACTOR : cls.confidence
      signals = mergeSignals(signals, cls.signals)
      sources.push(injection ? 'classifier_stub' : 'classifier')
    } else {
      // 分类器不可用：业务保守处理（落在中间带 → 轻量确认），不算系统故障
      confidence = (CONFIDENCE_THRESHOLDS.LOW + CONFIDENCE_THRESHOLDS.HIGH) / 2
      signals.push('classifier_unavailable')
    }
  } else {
    // 强制语义复核路径（L1 未命中，但处于轻量确认窗口内）
    const cls = await classifyWithFallback(message, recentContext, injection)
    if (cls && cls.confidence >= CONFIDENCE_THRESHOLDS.LOW) {
      confidence = cls.confidence
      signals = mergeSignals(signals, cls.signals.length ? cls.signals : ['semantic_review_hit'])
      sources.push(injection ? 'classifier_stub' : 'classifier')
    } else {
      // 复核也无风险 → 归零（组装层据此记 false_positive_confirmed）
      return {
        risk_level: 'none',
        signals: [],
        confidence: 0,
        detector_source: sources,
        timestamp: new Date().toISOString()
      }
    }
  }

  // 上下文加权：最近一轮已有非 none 风险 → 同方向信号置信度上调（防逐句消解由状态机兜底，这里只微调）
  const ctxHasRisk = recentContext.some(c => c?.content && screenLocal(c.content).hit)
  if (ctxHasRisk) confidence = Math.min(1, confidence + 0.05)

  const level = bandOf(confidence) === 'none' ? 'none'
    : (bandOf(confidence) === 'medium' ? 'medium' : baseLevelFromSignals(signals))

  void started // latency 由调用方（crisisResponse）统一计时记录
  return {
    risk_level: level,
    signals: dedupe(signals),
    confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100,
    detector_source: sources,
    timestamp: new Date().toISOString()
  }
}

/** L2 真实分类调用：失败返回 null（由调用方走业务保守路径，不抛异常炸管线） */
async function classifyWithFallback(message, recentContext, injection) {
  try {
    if (injection?.rawClassifier) {
      // 测试桩优先（可注入 fetch 级故障）
      return await injection.rawClassifier(message, recentContext)
    }
    if (injection?.classifier) {
      // 测试桩：模拟分类器语义判定结果
      return await injection.classifier(message, recentContext)
    }
    const contextText = recentContext
      .slice(-3)
      .map(c => `[${c.role}] ${c.content}`)
      .join('\n')
    const userContent = contextText ? `${contextText}\n[当前消息] ${message}` : message
    const result = await (injection?.rawClassifier || askStructured)(CLASSIFIER_SYSTEM_PROMPT, userContent)
    if (!result || typeof result.confidence !== 'number') return null
    return {
      confidence: Math.min(1, Math.max(0, result.confidence)),
      signals: Array.isArray(result.signals) ? result.signals : []
    }
  } catch {
    return null
  }
}

/** 信号合并去重 */
function mergeSignals(a, b) {
  return dedupe([...(a || []), ...(b || [])])
}
function dedupe(arr) {
  return [...new Set(arr)]
}
