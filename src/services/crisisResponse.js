/**
 * 危机响应 · 组装层
 * 职责：把 检测→状态机→路由→执行→兜底→审计 串成一条管线，对 useChatAI 暴露唯一入口 handleMessage()
 * 返回约定：拦截（危机/陪伴/确认/兜底）→ { reply, route, ... }；放行普通聊天 → null
 *
 * 置信度分档（与 crisisContextPatterns.CONFIDENCE_THRESHOLDS 联动）：
 *   >= HIGH          正常干预路由
 *   LOW ~ HIGH       轻量确认分支（业务保守，非兜底）——状态暂缓升级，
 *                    并挂 pending 标记：下一条消息强制语义复核；
 *                    复核无风险 → 记 false_positive_confirmed；有风险 → 正常升级
 *   < LOW            视为 SAFE 放行
 */
import {
  INTERVENTION_TEMPLATES,
  LIGHT_CONFIRM_TEMPLATE,
  SYSTEM_FALLBACK_TEMPLATE
} from '../constants/crisis'
import { CONFIDENCE_THRESHOLDS } from '../constants/crisisContextPatterns'
import { STORAGE_KEYS } from '../constants/categories'
import { detect } from './crisisDetection'
import {
  getState,
  update as smUpdate,
  markConcernAcknowledged,
  isConcernAcknowledged,
  RISK_STATES
} from './riskStateMachine'
import { readJSON, writeJSON, removeKey } from './storageAdapter'

const AUDIT_KEY = STORAGE_KEYS.CRISIS_AUDIT
const PENDING_KEY = STORAGE_KEYS.CRISIS_PENDING
const MAX_AUDIT = 200
const PENDING_TTL_MS = 30 * 60 * 1000 // 轻量确认后的复核窗口：30 分钟
const RESPONSE_VERSION = 'v1'

/** 审计日志追加（隐私最小化：只存信号摘要与决策字段，绝不存用户原话全文） */
export function appendAudit(entry) {
  const log = readJSON(AUDIT_KEY, [])
  log.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    risk_level: entry.risk_level ?? null,
    trigger: entry.trigger ?? [],
    route: entry.route ?? 'normal',
    response_version: RESPONSE_VERSION,
    fallback: !!entry.fallback,
    decision_type: entry.decision_type ?? 'normal',
    latency: entry.latency ?? 0
  })
  while (log.length > MAX_AUDIT) log.shift()
  writeJSON(AUDIT_KEY, log)
}

/** 该路由已触发次数（变体取模轮换依据：同一用户不会连续收到相同文案） */
function usedCount(routeKey) {
  return readJSON(AUDIT_KEY, []).filter(e => e.route === routeKey).length
}

function pickTemplate(pool, routeKey) {
  return pool[usedCount(routeKey) % pool.length]
}

/** 置信度分档：high / mid / low */
function bandOf(conf) {
  if (conf >= CONFIDENCE_THRESHOLDS.HIGH) return 'high'
  if (conf >= CONFIDENCE_THRESHOLDS.LOW) return 'mid'
  return 'low'
}

/**
 * 路由决策（查表实现，幂等）
 * @param {Object} d 检测结果
 * @param {string} stateBefore 本条消息处理前的状态机状态
 * @returns {{route, reply, decision_type}}
 */
function routeAndRespond(d, message, stateBefore) {
  const band = bandOf(d?.confidence ?? 0)

  // ── 有风险信号 ──
  if (d && d.risk_level !== 'none') {
    // 中间置信度带 + 用户尚在中低危状态 → 轻量确认（状态升级暂缓，等复核）
    if (band === 'mid' &&
        RISK_STATES.indexOf(stateBefore) < RISK_STATES.indexOf('ELEVATED')) {
      return {
        route: 'light_confirm',
        reply: LIGHT_CONFIRM_TEMPLATE,
        decision_type: 'low_confidence_conservative_route'
      }
    }
    // 温和档（CONCERN）：中风险的第一响——给一次陪伴，不转介、不抬级（A03）
    // 这一格原先缺失：进了 CONCERN 又有风险信号时，路由会直接展到末尾的 null 放行，
    // 等于把手上最轻的那批风险表达静默漏给普通聊天。
    if (stateBefore === 'CONCERN') {
      markConcernAcknowledged()
      return {
        route: 'concern',
        reply: pickTemplate(INTERVENTION_TEMPLATES.concern, 'concern'),
        decision_type: 'mild_concern_first_response'
      }
    }
    // 高置信度或已处中高危：按当前状态查固定模板
    if (
      stateBefore === 'ACTIVE_INTERVENTION' ||
      stateBefore === 'CRITICAL' ||
      stateBefore === 'ELEVATED'
    ) {
      const key = stateBefore === 'ACTIVE_INTERVENTION' ? 'intervention' : stateBefore.toLowerCase()
      const pool = INTERVENTION_TEMPLATES[key]
      if (pool) {
        return { route: key, reply: pickTemplate(pool, key), decision_type: 'emergency_intervention' }
      }
    }
    // 高置信度但状态还低（如首条即 high 但信号不含方法引用 → 状态机已升 CRITICAL，不会到这）
    return { route: 'normal', reply: null, decision_type: 'normal' }
  }

  // ── 无新风险信号：按滞留状态决定 ──
  if (stateBefore === 'CONCERN') {
    // 甲案口径：进入 CONCERN 的第一响应给陪伴模板，此后停留期间放行正常聊天（防复读机）
    // 首响通常已由"那条中风险消息本身"给出（见上面的 mild_concern_first_response）；
    // 这里兜的是状态还在 CONCERN、但首响尚未落下的情况（如跨会话恢复）
    if (!isConcernAcknowledged()) {
      markConcernAcknowledged()
      return { route: 'concern', reply: pickTemplate(INTERVENTION_TEMPLATES.concern, 'concern'), decision_type: 'first_response' }
    }
    return { route: 'normal', reply: null, decision_type: 'normal' }
  }
  if (
    stateBefore === 'ELEVATED' ||
    stateBefore === 'CRITICAL' ||
    stateBefore === 'ACTIVE_INTERVENTION'
  ) {
    const key = stateBefore === 'ACTIVE_INTERVENTION' ? 'intervention' : stateBefore.toLowerCase()
    const pool = INTERVENTION_TEMPLATES[key]
    if (pool) {
      return { route: key, reply: pickTemplate(pool, key), decision_type: 'state_intervention' }
    }
  }
  return { route: 'normal', reply: null, decision_type: 'normal' }
}

/**
 * 唯一入口：发消息前调用。命中危机路径返回固定文案（调用方直接采用、不发 LLM 请求）；否则返回 null 放行。
 * @param {string} message 用户消息原文
 * @param {Array<{role,content}>} [recentContext] 最近几轮上下文
 * @param {Object} [injection] 测试注入桩（classifier/rawClassifier/forceError），生产环境不传
 */
export async function handleMessage(message, recentContext = [], injection = null) {
  const started = Date.now()
  try {
    if (injection?.forceError) throw new Error('injected_pipeline_failure')

    // 轻量确认的复核窗口：上一条刚问过"是玩笑还是真的"→ 本条强制语义复核（哪怕 L1 未命中）
    const pending = readJSON(PENDING_KEY, null)
    const inConfirmWindow = !!(
      pending && Date.now() - new Date(pending.ts).getTime() < PENDING_TTL_MS
    )
    removeKey(PENDING_KEY) // 先消费，避免残留

    const d = await detect(
      message,
      recentContext,
      injection,
      inConfirmWindow ? { forceClassify: true } : {}
    )

    // 复核结论：窗口内且判定无风险 → 记录误报确认（细则一闭环）
    if (inConfirmWindow && (!d || d.risk_level === 'none')) {
      appendAudit({
        risk_level: 'none',
        trigger: ['confirm_window_resolved'],
        route: 'normal',
        decision_type: 'false_positive_confirmed',
        latency: Date.now() - started
      })
      return null
    }

    const stateBefore = getState()

    // 中间置信度的首次轻量确认：状态升级暂缓（等用户回应再定），其余情况正常推进状态机
    const holdEscalation =
      bandOf(d?.confidence ?? 0) === 'mid' &&
      RISK_STATES.indexOf(stateBefore) < RISK_STATES.indexOf('ELEVATED') &&
      !inConfirmWindow // 复核窗口内的"真的"消息必须正常升级，不得再次暂缓
    const sm = holdEscalation ? null : smUpdate(d, message)

    // 路由依据：升级后的状态（首条 high 消息当轮就要命中干预路径，不能用升级前状态查表）
    const stateAfter = holdEscalation ? stateBefore : getState()
    const decision = routeAndRespond(d, message, stateAfter)

    // 轻量确认发出后挂 pending 标记，等下一条消息复核
    if (decision.route === 'light_confirm') {
      writeJSON(PENDING_KEY, { active: true, ts: new Date().toISOString() })
    }

    appendAudit({
      risk_level: d?.risk_level ?? 'none',
      trigger: d?.signals ?? [],
      route: decision.route,
      decision_type: decision.decision_type,
      fallback: false,
      latency: Date.now() - started
    })
    void sm // 状态迁移已在状态机内持久化；留扩展点
    if (decision.reply) {
      return { reply: decision.reply, route: decision.route, decision_type: decision.decision_type }
    }
    return null
  } catch {
    // 系统级兜底：检测管线崩溃/注入故障 → 固定安全文案，绝不裸奔回普通对话
    appendAudit({
      risk_level: 'unknown',
      trigger: ['pipeline_exception'],
      route: 'system_fallback',
      decision_type: 'system_failure_fallback',
      fallback: true,
      latency: Date.now() - started
    })
    return { reply: SYSTEM_FALLBACK_TEMPLATE, route: 'system_fallback', decision_type: 'system_failure_fallback' }
  }
}

/** 测试辅助：清空审计日志与待确认标记（仅供测试脚本） */
export function __clearStateForTest() {
  writeJSON(AUDIT_KEY, [])
  removeKey(PENDING_KEY)
}
