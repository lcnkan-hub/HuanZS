/**
 * 损坏留证（救援区 · A09 延伸）（2026-11-24 从 useBackup.js 拆出）
 *
 * 为什么留证要跟着备份走：留证是「原文还在、只是读不出来」的最后一手。
 * 它只在本机就等于没有 —— 用户清一次浏览器数据，那份现场就永久消失。
 *
 * 两条口径：
 *   · 留证也是数据，**不能跨账号带**（只取当前账号命名空间里的）
 *   · 写回时本机已有同键留证**一律不覆盖**（第一次损坏的现场更可能有用）
 */
import { CORRUPT_SUFFIX } from '../useLocalStorage'
import { currentScope, GLOBAL_KEYS } from '../../utils/storageScope'
import { readRaw, resolveKey, tryWriteRaw, listKeys } from '../../services/storageAdapter'

/** 真实键 → { base, uid }；uid=null 表示没有账号后缀（设备级键 / 未登录时写的） */
export function splitScoped(rawKey) {
  const i = rawKey.indexOf('@u')
  return i >= 0 ? { base: rawKey.slice(0, i), uid: rawKey.slice(i + 2) } : { base: rawKey, uid: null }
}

/** 这个留证键属不属于「当前账号」——留证也是数据，不能跨账号带 */
export function isCurrentAccountKey(rawKey) {
  const { base, uid } = splitScoped(rawKey)
  if (uid === null) return currentScope() === null || GLOBAL_KEYS.has(base)
  return String(currentScope()) === uid
}

/**
 * 收集本机当前账号的损坏留证：{ 基础键名: 原始串 }
 * 读不到就当没有 —— 宁可少带，不许让整个导出因此失败。
 */
export function readRescueCopies() {
  const out = {}
  try {
    for (const k of listKeys()) {
      if (!k || !String(k).endsWith(CORRUPT_SUFFIX)) continue
      // ⚠️ 顺序有讲究：**先剥掉 __corrupt 后缀，再判账号归属**。
      //    反过来的话 `…@uCUR123__corrupt` 会被当成"账号 id = CUR123__corrupt"，
      //    和当前账号永远对不上 → 全部留证被判成"别人的"、一个都带不走（断言抓到的第一个 bug）。
      const scoped = String(k).slice(0, -CORRUPT_SUFFIX.length)
      if (!isCurrentAccountKey(scoped)) continue
      const raw = readRaw(k) // k 已含前缀，用不加工的 raw 读
      if (typeof raw !== 'string' || !raw) continue
      out[splitScoped(scoped).base] = raw
    }
  } catch { /* 枚举失败 → 空手 */ }
  return out
}

/**
 * 写回损坏留证（救援区的反向操作）。
 * 本机已有同键留证**不覆盖** —— 与 useLocalStorage.rescueCorrupt 同一条口径：
 * 第一次损坏的那份原文更可能是有用的。
 */
export function restoreRescueCopies(rescue) {
  const out = { restored: 0, skipped: 0, failed: 0 }
  if (!rescue || typeof rescue !== 'object' || Array.isArray(rescue)) return out
  Object.keys(rescue).forEach(base => {
    const raw = rescue[base]
    if (typeof raw !== 'string' || !raw) { out.failed++; return }
    try {
      const target = resolveKey(base) + CORRUPT_SUFFIX
      if (readRaw(target) !== null) { out.skipped++; return }
      // tryWriteRaw：写不进要计入 failed，不能吞
      if (!tryWriteRaw(target, raw)) { out.failed++; return }
      out.restored++
    } catch { out.failed++ }
  })
  return out
}
