/**
 * 王冠「该不该主动开口」判据
 * 职责：纯函数、无副作用、不碰存储 —— 判据错了王冠就会变粘人、或者半夜发消息，必须能脱离界面单测
 *
 * 配置：constants/proactive.js（配额/窗口/间隔的唯一出口）
 * 调用方：composables/useProactive.js（把存储里的账本读出来喂进来）
 *
 * 产品宪法 R1：每月主动消息 ≤3 条，仅限 6:00–21:30
 */
import {
  PROACTIVE_QUOTA_PER_MONTH,
  PROACTIVE_WINDOW_START_MIN,
  PROACTIVE_WINDOW_END_MIN,
  PROACTIVE_MIN_GAP_MS,
  PROACTIVE_MIN_MEMORIES
} from '../constants/proactive'

/** 统一把时间戳（毫秒数 / ISO 字符串 / Date）转成毫秒；拿不到返回 null */
function toMs(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime()
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * 当前是否落在允许开口的时间窗内（本地时间，含 06:00 与 21:30 两端）
 * 05:59 不说 / 06:00 说 / 21:30 说 / 21:31 不说
 */
export function inProactiveWindow(now) {
  const t = toMs(now)
  if (t === null) return false
  const d = new Date(t)
  const minutes = d.getHours() * 60 + d.getMinutes()
  return minutes >= PROACTIVE_WINDOW_START_MIN && minutes <= PROACTIVE_WINDOW_END_MIN
}

/**
 * 账本里「本月」已经开口几次。
 * 按月配额从记录现算，不做独立计数器 —— 计数器最容易"忘了重置"，
 * 记录本身是真相（每次开口写一条 { ts, ... }），跨月自动归零。
 * 坏记录（缺 ts / ts 无法解析）直接不计入，不抛错。
 */
export function countProactiveInMonth(log, now) {
  const t = toMs(now)
  if (t === null || !Array.isArray(log)) return 0
  const d = new Date(t)
  const y = d.getFullYear()
  const m = d.getMonth()
  let n = 0
  for (const rec of log) {
    const rt = toMs(rec && rec.ts)
    if (rt === null) continue
    const rd = new Date(rt)
    if (rd.getFullYear() === y && rd.getMonth() === m) n++
  }
  return n
}

/**
 * 距上次互动够不够久。
 * 两个都要够久：距上次「用户消息」，以及距上次「主动开口」。
 * 只看前者的话，王冠上午主动说了一句、用户没回，晚上打开就又够格了 —— 一天烧掉两条配额。
 */
function gapCheck(t, lastUserAt, lastProactiveAt) {
  const u = toMs(lastUserAt)
  if (u === null) return { ok: false, reason: 'no-user-history' } // 从没聊过 → 无从"想起"
  if (t - u < PROACTIVE_MIN_GAP_MS) return { ok: false, reason: 'too-soon' }
  const p = toMs(lastProactiveAt)
  if (p !== null && t - p < PROACTIVE_MIN_GAP_MS) return { ok: false, reason: 'too-soon' }
  return { ok: true, reason: '' }
}

/**
 * 从聊天记录里取「用户最后一次开口」的时间。
 * 从后往前找最后一条 role === 'user'（王冠自己的回复不算），取它的 time。
 * 注意：time 是 uniqueId.getCurrentTimeString() 的 'YYYY/MM/DD HH:mm' 字符串，交给 toMs 解析。
 * @param {Array} messages 聊天记录 [{ id, role, content, time }]
 * @returns {string|null} 时间字符串 / null（从没聊过）
 */
export function lastUserTime(messages) {
  const list = Array.isArray(messages) ? messages : []
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]
    if (m && m.role === 'user' && m.time) return m.time
  }
  return null
}

/**
 * 从账本里取「上次真开口」的时间（ts 的最大值）。
 * 用最大值而不是最后一条：账本理论上按时间追加，但备份恢复/手工改过之后不能假定有序。
 * @param {Array} log 账本 [{ ts, excerpt }]
 * @returns {number|null} 毫秒时间戳 / null（没开口过）
 */
export function lastProactiveTs(log) {
  if (!Array.isArray(log)) return null
  let max = null
  for (const rec of log) {
    const t = toMs(rec && rec.ts)
    if (t !== null && (max === null || t > max)) max = t
  }
  return max
}

/**
 * 主判据：返回 { speak: boolean, reason: string }
 * reason 只给测试和排查用，界面不展示。取值：
 *   ok / disabled / risk-state / no-memory / bad-clock / outside-window /
 *   quota-used / no-user-history / too-soon
 *
 * @param {number|string|Date} now            判定时刻（一般传 Date.now()）
 * @param {number|string|Date} lastUserAt     用户最后一次说话的时间（chatMessages 里最后一条 user）
 * @param {number|string|Date} lastProactiveAt 上次主动开口的时间（账本里最后一条，没开口过为 null）
 * @param {number} monthCount                 本月已开口次数（用 countProactiveInMonth 算，不在此函数内读存储）
 * @param {boolean} enabled                   用户开关（默认开）
 * @param {number} memoryCount                记忆库条数（为空不开口）
 * @param {string} riskState                  风险状态机当前状态，非 SAFE 一律不开口
 */
export function shouldCrownSpeak({
  now,
  lastUserAt = null,
  lastProactiveAt = null,
  monthCount = 0,
  enabled = true,
  memoryCount = 0,
  riskState = 'SAFE'
} = {}) {
  if (!enabled) return { speak: false, reason: 'disabled' }
  // 风险状态不为 SAFE：开口交给危机管线，日常寒暄让位
  // （用户正处在状态机里时冒出一句闲聊，比不说更糟）
  if (riskState && riskState !== 'SAFE') return { speak: false, reason: 'risk-state' }
  if (memoryCount < PROACTIVE_MIN_MEMORIES) return { speak: false, reason: 'no-memory' }

  const t = toMs(now)
  if (t === null) return { speak: false, reason: 'bad-clock' }
  if (!inProactiveWindow(t)) return { speak: false, reason: 'outside-window' }
  if (monthCount >= PROACTIVE_QUOTA_PER_MONTH) return { speak: false, reason: 'quota-used' }

  const g = gapCheck(t, lastUserAt, lastProactiveAt)
  if (!g.ok) return { speak: false, reason: g.reason }

  return { speak: true, reason: 'ok' }
}
