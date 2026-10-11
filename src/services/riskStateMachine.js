/**
 * 危机响应 · 风险状态机（Risk State Machine）【冻结物 · 改动须重跑测试矩阵】
 * 职责：维护跨轮次风险状态，防"单条消息看着不严重但连续几句在滑向危险"被逐句消解
 * 五态：SAFE → CONCERN → ELEVATED → CRITICAL → ACTIVE_INTERVENTION
 * 迁移原则：升级从严判定、降级谨慎；时间衰减有例外
 */
import { readJSON, writeJSON } from './storageAdapter'
import { STORAGE_KEYS } from '../constants/categories'

const STATE_KEY = STORAGE_KEYS.CRISIS_STATE

/** 状态枚举（顺序即等级，index 越大风险越高） */
export const RISK_STATES = ['SAFE', 'CONCERN', 'ELEVATED', 'CRITICAL', 'ACTIVE_INTERVENTION']

/** 时间衰减规则：>24h 回落一级，>72h 回 SAFE（毫秒） */
export const DECAY_STEP_MS = 24 * 60 * 60 * 1000
export const DECAY_RESET_MS = 72 * 60 * 60 * 1000

/** 读持久化原始值 */
function loadRaw() {
  return readJSON(STATE_KEY, { state: 'SAFE', last_signal_timestamp: null }) ||
    { state: 'SAFE', last_signal_timestamp: null }
}

/** 读当前状态（含惰性时间衰减计算） */
export function getState() {
  const raw = loadRaw()
  const cur = raw.state || 'SAFE'
  const ts = raw.last_signal_timestamp
  // ACTIVE_INTERVENTION 例外：不随时间自动衰减，仅用户明确正向信号才降级
  if (cur === 'ACTIVE_INTERVENTION' || !ts) return cur
  const elapsed = Date.now() - new Date(ts).getTime()
  if (elapsed >= DECAY_RESET_MS) return 'SAFE'
  if (elapsed >= DECAY_STEP_MS) {
    const steps = Math.floor(elapsed / DECAY_STEP_MS)
    const idx = RISK_STATES.indexOf(cur)
    return RISK_STATES[Math.max(0, idx - Math.min(steps, idx))]
  }
  return cur
}

/**
 * 正向信号判定（ACTIVE_INTERVENTION 唯一降级通道）
 * 仅当用户明确表达"已好转/已求助"才成立——转移话题、敷衍回复不算
 */
export function isRecoverySignal(text) {
  return /没事了|已经好多了|已经联系|打过电话|去医院了|有人在陪我|已经安全/i.test(String(text || ''))
}

/**
 * 由 risk_level 映射目标状态（none 不映射——降级只走衰减/正向信号）
 * 中风险分两档（A03）：首次落在 CONCERN（温和陪伴），已处 CONCERN 再来一次才升 ELEVATED。
 * 原先 medium 一步跳到 ELEVATED，CONCERN 于是成了没有任何路径能产出的死状态——
 * 它的陪伴模板与路由分支在生产里全部不可达，而"日常轻度表达"直接吃"我很担心你"。
 * @param {string} level detect() 的 risk_level
 * @param {number} prevIdx 当前状态的等级下标（RISK_STATES 内）
 */
function targetStateFromLevel(level, prevIdx) {
  switch (level) {
    case 'high': return 'CRITICAL'
    case 'medium':
      return prevIdx >= RISK_STATES.indexOf('CONCERN') ? 'ELEVATED' : 'CONCERN'
    default: return null
  }
}

/**
 * 更新状态机（每条用户消息检测后调用）
 * @param {Object} detection detect() 输出：{ risk_level, signals, ... }
 * @param {string} userText 当前用户消息原文（正向信号判定用）
 * @returns {{previous, current, changed, reason}}
 */
export function update(detection, userText = '') {
  const previous = getState()
  let current = previous
  let reason = 'no_change'

  const prevIdx = RISK_STATES.indexOf(previous)

  if (previous === 'ACTIVE_INTERVENTION') {
    // 最高级例外：只有明确正向信号才放行降级（一级）
    if (isRecoverySignal(userText)) {
      current = 'CRITICAL'
      reason = 'recovery_signal_confirmed'
    }
  } else {
    const target = targetStateFromLevel(detection?.risk_level, prevIdx)
    if (target) {
      let effective = target
      // 升级从严：high 且带方法引用/紧迫性 → 顶格 ACTIVE_INTERVENTION
      if (
        detection.risk_level === 'high' &&
        (detection.signals?.includes('method_reference') || detection.signals?.includes('immediacy'))
      ) {
        effective = 'ACTIVE_INTERVENTION'
      }
      const eIdx = RISK_STATES.indexOf(effective)
      if (eIdx > prevIdx) {
        current = effective
        reason = `escalated_by_${detection.risk_level}`
      } else if (eIdx === prevIdx) {
        reason = 'state_held'
      }
      // eIdx < prevIdx：单条低危消息不触发降级
    }
  }

  if (current !== previous || detection?.risk_level !== 'none') {
    writeJSON(STATE_KEY, { state: current, last_signal_timestamp: new Date().toISOString() })
  }

  return { previous, current, changed: current !== previous, reason }
}

/**
 * 甲案专用：CONCERN 首响判定
 * 进入 CONCERN 后的第一条消息给模板，此后停留期间放行正常聊天
 * 实现：进入 CONCERN 的那一刻写入 concern_acknowledged 标记；回落 SAFE 清除
 */
export function markConcernAcknowledged() {
  const raw = loadRaw()
  writeJSON(STATE_KEY, { ...raw, concern_acknowledged: true })
}

export function isConcernAcknowledged() {
  return !!loadRaw().concern_acknowledged
}

/** 测试辅助：直接注入状态与时间戳（仅供测试脚本使用） */
export function __setStateForTest(state, isoTimestamp = new Date().toISOString()) {
  writeJSON(STATE_KEY, { state, last_signal_timestamp: isoTimestamp })
}
