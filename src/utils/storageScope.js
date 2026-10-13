/**
 * 存储作用域积木（2026-10-10 新增）
 * 职责：把「业务数据键」按当前登录账号重写成命名空间键 → 多账号数据隔离
 *
 * 规则：
 *   - 未登录、或环境没有 localStorage（node 测试）→ 原样返回 base key（与旧版行为完全一致）
 *   - 已登录 → `base@u<账号id>`，例：huan_zhong_shu_db@u1a2b3c4d
 *   - 设备级键（账号表 / 登录态 / AI 密钥）永不重写，见 GLOBAL_KEYS
 *
 * 为什么用「整页重载」而不是运行中切换账号：
 *   业务 composable 是模块级单例（useWikiData / useApiKey 的存储键在 import 时就绑定了），
 *   运行中换账号会留下绑在旧键上的 ref，两边各持一份快照 → 静默丢数据。
 *   所以 login / logout 之后一律 location.reload，让键名在 boot 时重新解析。见 useAccount.js。
 */
import { STORAGE_KEYS } from '../constants/categories'

export const SCOPE_SEP = '@u'

/** 设备级键：跟「这台设备」有关，跟「哪个账号」无关 —— 永不重写 */
export const GLOBAL_KEYS = new Set([
  STORAGE_KEYS.ACCOUNTS,
  STORAGE_KEYS.SESSION,
  STORAGE_KEYS.AI_CONFIG
])

/** 需要按账号隔离的业务数据键（首个账号「认领本机旧数据」时按这张表走） */
export const SCOPED_BASE_KEYS = [
  STORAGE_KEYS.USER,
  STORAGE_KEYS.DB,
  STORAGE_KEYS.CHAT,
  STORAGE_KEYS.MEMORY,
  STORAGE_KEYS.CRISIS_AUDIT,
  STORAGE_KEYS.CRISIS_PENDING,
  STORAGE_KEYS.CRISIS_STATE,
  STORAGE_KEYS.LAST_EXPORT,      // 补漏：本就按账号隔离（scopeKey），但漏在本表 → 首账号认领时丢
  STORAGE_KEYS.PROACTIVE_LOG,     // 主动开口账本
  STORAGE_KEYS.PROACTIVE_ENABLED, // 主动开口开关
  STORAGE_KEYS.LAST_TAB,         // 首屏落地页（谁的习惯归谁，换个账号不该继承）
  STORAGE_KEYS.BACKUP_SNOOZE     // 备份提醒暂缓（谁压的归谁）
]

let _uid = null

/** 从 localStorage 的登录态里读当前账号 id（读不到 → null，等价于未登录） */
function readSessionUserId() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s && s.userId ? String(s.userId) : null
  } catch {
    return null
  }
}

/**
 * 模块加载即解析登录态。
 * 必须放顶层：业务键在 import 时就会绑定，等 main.js 里再调就晚了。
 */
_uid = readSessionUserId()

/** 当前作用域（账号 id 或 null） */
export function currentScope() { return _uid }

/** 手动设置作用域（主要给测试用；正常流程走整页重载） */
export function setScope(uid) { _uid = uid ? String(uid) : null; return _uid }

/** 重新从存储解析一次（不重载页面时用） */
export function refreshScope() { _uid = readSessionUserId(); return _uid }

/** base key → 当前作用域下的真实键 */
export function scopeKey(key) {
  if (!key || GLOBAL_KEYS.has(key) || !_uid) return key
  return key + SCOPE_SEP + _uid
}

/** 某账号的数据键后缀（备份 / 清理时枚举用） */
export function scopeSuffix(uid) { return SCOPE_SEP + String(uid) }
