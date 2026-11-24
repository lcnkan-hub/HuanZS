/**
 * 本机存储健康 · 纯计算部分（2026-10-13 新增 · 对应问题清单 I15「容量硬限」）
 *
 * 口径先纠一处：`localStorage.setItem` 是**原子**的，写不下就整条不写，严格说不会"写半损"。
 * 真实的问题是**假成功** —— 值还在内存里、界面看着一切正常，刷新就没了，
 * 而且用户不知道从哪一刻开始丢的。所以这里修的不是 setItem，是**报账与可见性**。
 *
 * ⚠️ 本文件只放**纯函数**（2026-11-24 拆分）：不 import vue、不持状态，
 *    这样 node 里能直接单测体检口径，也守住 utils 目录「不依赖框架」的约定。
 *    需要响应式账本（写失败记账、界面订阅）请用 composables/useStorageHealth.js。
 */
import { STORAGE_LIMIT_BYTES, KEY_LABELS } from '../constants/categories'

/**
 * 真实键 → 人话标签。
 * 真实键可能带 @u<账号id> 后缀，先剥后缀再查表；查不到就**原样返回键名**（绝不编一个好听的名字）。
 */
export function labelOfKey(realKey) {
  const base = String(realKey || '').split('@u')[0]
  return KEY_LABELS[base] || base || '（未知数据）'
}

/**
 * 逐键体检：每一项按 UTF-16 口径算字节（字符数 × 2）—— 浏览器配额也是这个口径。
 * 读不到的键、没有 length/key 的存储替身（老测试桩）→ 一律跳过，绝不抛错。
 */
export function measureUsage(store) {
  const ls = store || (typeof localStorage !== 'undefined' ? localStorage : null)
  const rows = []
  let total = 0
  const canEnumerate = ls && typeof ls.length === 'number' && typeof ls.key === 'function'
  if (canEnumerate) {
    try {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i)
        if (k === null || k === undefined) continue
        const v = ls.getItem(k)
        const bytes = (String(k).length + String(v === null ? '' : v).length) * 2
        total += bytes
        rows.push({ key: String(k), label: labelOfKey(k), bytes, rescue: String(k).endsWith('__corrupt') })
      }
    } catch {
      /* 枚举失败 = 体检不到，报 0，不抛 */
    }
  }
  rows.sort((a, b) => b.bytes - a.bytes)
  return { totalBytes: total, limitBytes: STORAGE_LIMIT_BYTES, byKey: rows, at: new Date().toISOString() }
}

/** 字节 → 「x.x MB」（界面一律写"约"，因为上限本身是估算模型的参数） */
export function formatMB(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
