/**
 * 备份的「键与路径」层（2026-11-24 从 useBackup.js 拆出）
 *
 * 职责：哪些键要进备份（清单）、按键读写的统一口径、payload 里的嵌套路径读写。
 * 这一层不碰图片、不碰文件落地、不碰导入流程 —— 那些在 images.js / saveFile.js / import.js。
 *
 * ⚠️ 两条口径（改之前先读）：
 *   1. 读失败与数据损坏**必须分开报**：readJsonKey 遇到解析失败就抛，
 *      宁可中止导出，也不导一份缺件的备份。
 *   2. 写入失败**必须抛**：导入时静默吞掉写入错误，用户会以为恢复成功，其实是半份数据。
 */
import { STORAGE_KEYS } from '../../constants/storage'
import {
  readRawScoped, removeKey, tryWriteJSON
} from '../../services/storageAdapter'

// —— 文本真相源清单（进备份的）——
// path 是「相对于 payload.data」的路径，别写成 ['data','user']（会多出一层，导入时一条都写不进去）
export const TEXT_SOURCES = [
  { path: ['user'],   key: () => STORAGE_KEYS.USER,   empty: null },
  { path: ['records'], key: () => STORAGE_KEYS.RECORDS, empty: [] },
  { path: ['chat'],   key: () => STORAGE_KEYS.CHAT,   empty: [] },
  { path: ['memory'], key: () => STORAGE_KEYS.MEMORY, empty: [] },
  // 主动开口：账本要带走（否则换设备后月配额归零、可能一个月说 6 次），开关也要带走（用户的选择不能被恢复弄丢）
  { path: ['proactive', 'log'],     key: () => STORAGE_KEYS.PROACTIVE_LOG,     empty: [] },
  { path: ['proactive', 'enabled'], key: () => STORAGE_KEYS.PROACTIVE_ENABLED, empty: null },
  // 首屏落地页：换设备后还是落在你习惯的地方；坏值由 useLastTab 读的时候回落，这里不用校验
  { path: ['last_tab'],             key: () => STORAGE_KEYS.LAST_TAB,          empty: null }
]

export const CRISIS_SOURCES = [
  { path: ['crisis', 'audit_log'], key: () => STORAGE_KEYS.CRISIS_AUDIT,   empty: [] },
  { path: ['crisis', 'pending'],   key: () => STORAGE_KEYS.CRISIS_PENDING, empty: null },
  { path: ['crisis', 'state'],     key: () => STORAGE_KEYS.CRISIS_STATE,   empty: null }
]

/** 默认值是共享引用，返回副本，避免下游改到默认值本身 */
export function cloneEmpty(empty) {
  if (empty === null || typeof empty !== 'object') return empty
  return JSON.parse(JSON.stringify(empty))
}

/** 读一个 JSON 键。不存在 → empty；存在但解析不了 → 抛错（宁可中止导出，也不导一份缺件的备份） */
export function readJsonKey(baseKey, empty) {
  let raw = null
  try {
    // readRawScoped：按账号前缀读、且不吞异常 —— 「读不到」和「坏了」必须分开报
    raw = readRawScoped(baseKey)
  } catch {
    throw new Error('本机存储读不到：' + baseKey)
  }
  if (raw === null) return cloneEmpty(empty)
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('本机数据有损坏，先别导出（' + baseKey + ' 解析失败）')
  }
}

/** 写一个键。null / undefined = 清键。写不进就抛（导入不许假成功） */
export function writeJsonKey(baseKey, value) {
  if (value === null || value === undefined) {
    removeKey(baseKey) // removeKey 内部按账号前缀删
    return
  }
  // tryWriteJSON：写不进 localStorage 就返回 false —— 这里必须**抛**。
  // 导入过程中静默吞掉写入失败，用户会以为恢复成功，其实是半份数据。
  if (!tryWriteJSON(baseKey, value)) {
    throw new Error('本机存储写不进去（可能空间已满或处于隐私模式）')
  }
}

/**
 * 写一个键，并把「真写进去了的键」记进 written。
 * null / undefined 走 writeJsonKey 的清键分支 —— 那种情况存储里现在没有值，不算写过。
 * （之前不管三七二十一都 push，导致 key 被清掉时也会报成"写过"，测试拿它断言账号隔离时会假失败）
 */
export function writeTracked(baseKey, value, written) {
  writeJsonKey(baseKey, value)
  if (value !== null && value !== undefined) written.push(baseKey)
}

export function setByPath(obj, path, value) {
  let cur = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (!cur[path[i]]) cur[path[i]] = {}
    cur = cur[path[i]]
  }
  cur[path[path.length - 1]] = value
}

export function getByPath(obj, path) {
  let cur = obj
  for (const p of path) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[p]
  }
  return cur
}
