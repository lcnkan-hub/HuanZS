/**
 * 王冠「主动开口」积木（I02 · 产品宪法 R1 的代码层落地）
 * 职责：取当下快照 → 喂判据（utils/proactiveJudge）→ 生成那句话 → 只有真说出口才记账
 *
 * 三条设计边界（改动前先读）：
 *  1. **不自己去读聊天/记忆**：useChat / useMemory 都是工厂，再调一次会拿到绑同一个 localStorage
 *     键的第二个 ref，两边各持快照 → 静默丢数据。所以本积木只收「调用方当下的快照」当入参，
 *     也不替调用方改聊天记录（它只返回那句话，写入由 ChatView 用自己那份 useChat 完成）。
 *  2. **生成失败、或模型回「跳过」→ 静默放弃，且不记账**。没开口就不该占配额；
 *     更不能把一句模板兜底塞进聊天 —— 那等于把 R1 的护城河填了。
 *  3. **判据一行都不在本文件里**：全走 utils/proactiveJudge 的纯函数。
 *     本文件只做三件事：取数据、调 API、记账。
 *
 * 为什么 ask() 要传 skipCrisis：见 composables/useChatAI.js 里那段注释（主动开口没有新用户消息，
 * 会让危机管线拿旧消息重跑一遍 → 复读）。
 */
import { STORAGE_KEYS } from '../constants/categories'
import { PROACTIVE_LOG_MAX } from '../constants/proactive'
import { readJSON, writeJSON } from '../services/storageAdapter'
import { getState as getRiskState } from '../services/riskStateMachine'
import {
  shouldCrownSpeak,
  countProactiveInMonth,
  lastUserTime,
  lastProactiveTs
} from '../utils/proactiveJudge'
import { useChatAI } from './useChatAI'

/** 模型明确表示「此刻没什么可说」时的哨兵；命中即放弃（不记账） */
const SKIP_SENTINEL = '跳过'

/** 账本里留的内容摘要长度（只用于排查"当时说了什么"；正文本身在聊天记录里） */
const EXCERPT_MAX = 40

/** 生成中锁：挂载与 visibilitychange 可能几乎同时触发，防止切来切去重复开口 */
let inFlight = false

/**
 * ask 只取一次。
 * 关键：这里调 useChatAI() 拿到的是**另一个实例**，它的 error / isThinking 与界面上那份互相隔离 ——
 * 所以主动开口失败不会在聊天里弹红字（用户什么都没问，不该看到报错），也不会亮"正在输入"。
 * 主动开口是一句"那边发来的话"，不是你在等的一个响应。
 */
let _ask = null
function getAsk() {
  if (!_ask) _ask = useChatAI().ask
  return _ask
}

// ─────────────────────────── 账本与开关（读写存储） ───────────────────────────

/** 读账本（结构不对一律当空账本，不抛错） */
export function readProactiveLog() {
  const log = readJSON(STORAGE_KEYS.PROACTIVE_LOG, [])
  return Array.isArray(log) ? log : []
}

/**
 * 主动开口开关。
 * 键不存在 = 开（宪法没规定开关，是本产品补的；默认必须是开，否则 I02 等于没做）。
 * 只有用户显式关过（存了 false）才返回 false。
 */
export function isProactiveEnabled() {
  const v = readJSON(STORAGE_KEYS.PROACTIVE_ENABLED, null)
  if (v === null || v === undefined) return true
  return v !== false
}

/** 设开关（存布尔） */
export function setProactiveEnabled(on) {
  writeJSON(STORAGE_KEYS.PROACTIVE_ENABLED, !!on)
}

/** 本月已开口几次（界面可显示「本月主动 X/3」；从记录现算，见 proactiveJudge） */
export function proactiveMonthCount(now = Date.now()) {
  return countProactiveInMonth(readProactiveLog(), now)
}

/**
 * 记一条账。裁剪只保留最近 PROACTIVE_LOG_MAX 条 —— 配额只看"本月"，
 * 保留 60 条远够跨月计数，且账本不会无限长。
 */
function appendLog(line, now) {
  const log = readProactiveLog()
  // ts 一律存毫秒数：账本是数据，不混 Date 对象（JSON 往返后它变成字符串，读的时候更绕）
  const t = new Date(now).getTime()
  log.push({ ts: Number.isFinite(t) ? t : Date.now(), excerpt: String(line).slice(0, EXCERPT_MAX) })
  writeJSON(STORAGE_KEYS.PROACTIVE_LOG, log.slice(-PROACTIVE_LOG_MAX))
}

/**
 * 当前风险状态；读失败一律当作「非 SAFE」（fail-closed）。
 * 拿不准的时候宁可不开口 —— 用户正在状态机里时冒出一句闲聊，比不说更糟。
 */
function readRiskState() {
  try {
    return getRiskState() || 'UNKNOWN'
  } catch {
    return 'UNKNOWN'
  }
}

// ─────────────────────────── 生成那句话 ───────────────────────────

/** 当前时段的口语说法（只用于让那句开场白贴合时间，不参与判据） */
function periodLabel(now) {
  const h = new Date(now).getHours()
  if (h < 9) return '早上'
  if (h < 11) return '上午'
  if (h < 13) return '中午'
  if (h < 17) return '下午'
  if (h < 19) return '傍晚'
  return '晚上'
}

/** 距用户上次开口多久的人话说法（判据已保证 ≥20 小时，不会出现"刚刚"这种别扭说法） */
function gapLabel(hours) {
  if (hours < 48) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

/**
 * 本轮的系统注记：拼在 SYSTEM_PROMPT 之后，与记忆积木注入同一通道。
 * 「本轮是你主动开口」这句必须和 skipCrisis 一起走 —— 分开写迟早会漂移。
 * 注记里不提风险处理：危机规则的优先级不由这里改写，本轮的危机管线由 skipCrisis 跳过的原因只是"没有新信号"。
 */
function buildNote({ hours, memoryBlock, now }) {
  return `【本轮是你主动开口】
用户已经有 ${gapLabel(hours)} 没开口了，现在是${periodLabel(now)}。这一轮没有人向你提问，由你先说第一句。

要求：
- 像朋友隔了几天再见那样自然。可以顺着你记得的事起个话头，但不要变成汇报、不要把记得的东西一条条摆出来
- 不要用"你好""在吗""最近怎么样"这类空问候开场
- 一句话，不超过 40 字，不要表情符号
- 如果你觉得此刻确实没有合适的话可说，就只回复两个字：${SKIP_SENTINEL}
${memoryBlock ? '\n' + memoryBlock : ''}`
}

/** 模型是不是在说「跳过」（含"跳过。"这类带标点的写法）；只在回复很短时才认，避免误伤正文里的这两个字 */
function isSkipReply(reply) {
  const t = String(reply || '').trim().replace(/[。.!！?？\s]/g, '')
  return t.length <= 4 && t.includes(SKIP_SENTINEL)
}

// ─────────────────────────── 主入口 ───────────────────────────

/**
 * 试着让王冠主动开口。
 * 该不该说由判据定；说不说得出由模型定；说出口了才记账。
 *
 * @param {Object}   param0
 * @param {Array}    param0.messages    当前聊天记录快照 [{ id, role, content, time }]
 * @param {number}   param0.memoryCount 记忆库条数（判据用：没有可"想起"的东西就不开口）
 * @param {string}   param0.memoryBlock 已拼好的记忆上下文块（由调用方用自己那份 useMemory 拼，缺省为空）
 * @param {number}   [param0.now]       判定时刻（测试可注入；缺省 Date.now()）
 * @returns {Promise<{ spoken: boolean, reason: string, line: string|null }>}
 *          line 非空时，调用方负责把它作为王冠的一条消息写进聊天记录
 */
export async function maybeSpeakProactive({
  messages,
  memoryCount = 0,
  memoryBlock = '',
  now = Date.now()
} = {}) {
  if (inFlight) return { spoken: false, reason: 'in-flight', line: null }
  inFlight = true
  try {
    // history 是调用方那份响应式数组本身（不是拷贝），所以它的 length 随时是当下真实值
    const history = Array.isArray(messages) ? messages : []
    const before = history.length

    const log = readProactiveLog()
    const lastUserAt = lastUserTime(history)
    const lastProactiveAt = lastProactiveTs(log)
    const monthCount = countProactiveInMonth(log, now)

    const verdict = shouldCrownSpeak({
      now,
      lastUserAt,
      lastProactiveAt,
      monthCount,
      enabled: isProactiveEnabled(),
      memoryCount,
      riskState: readRiskState()
    })
    if (!verdict.speak) return { spoken: false, reason: verdict.reason, line: null }

    // 距上次用户开口的小时数（判据已保证 lastUserAt 可解析且够久；只用于让开场白贴合时间，不参与判据）
    const uMs = new Date(lastUserAt).getTime()
    const hours = Number.isFinite(uMs)
      ? Math.max(0, Math.round((new Date(now).getTime() - uMs) / 3600000))
      : 24

    // 本轮不给王冠"要回应的用户消息"：补一条指令性的末轮，
    // 它不写进聊天记录，只用于给模型一个"该你说了"的位置。
    const trigger = {
      id: 'proactive-trigger',
      role: 'user',
      content: `（本轮由你主动开口，请说第一句；没有合适的话就回复：${SKIP_SENTINEL}）`,
      time: new Date(now).toISOString()
    }

    let reply = ''
    try {
      reply = await getAsk()(
        [...history, trigger],
        buildNote({ hours, memoryBlock, now }),
        { skipCrisis: true }
      )
    } catch {
      // 断网/超时/没配密钥 → 静默放弃（不记账）。ask() 内部已经把错误写进它自己那份 error ref，
      // 那份 ref 不属于界面上那个 useChatAI 实例，所以不会弹红字。
      return { spoken: false, reason: 'generate-failed', line: null }
    }

    // 生成要几秒。这几秒里用户自己先开口了（或清了记录）→ 这句话作废且不记账：
    // 现在再插一句，就不是"主动开口"了，是打断别人说话。
    // 判据只在开口前判一次，拦不住这种竞态，所以这里再拦一次。
    if (history.length !== before) return { spoken: false, reason: 'chat-moved', line: null }

    const line = String(reply || '').trim()
    if (!line || isSkipReply(line)) return { spoken: false, reason: 'skip', line: null }

    appendLog(line, now)
    return { spoken: true, reason: 'ok', line }
  } finally {
    inFlight = false
  }
}
