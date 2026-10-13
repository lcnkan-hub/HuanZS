/**
 * 本机存储健康真相源（2026-10-13 新增 · 对应问题清单 I15「容量硬限」）
 *
 * 口径先纠一处：`localStorage.setItem` 是**原子**的，写不下就整条不写，严格说不会"写半损"。
 * 真实的问题是**假成功** —— 值还在内存里、界面看着一切正常，刷新就没了，
 * 而且用户不知道从哪一刻开始丢的。所以这里修的不是 setItem，是**报账与可见性**：
 *   · 写失败 → 记账（哪个键、人话叫什么、什么原因、什么时候），同一键只留一条（不刷屏）
 *   · 写成功 → 把该键的旧账销掉（恢复了就说恢复）
 *   · 随时能体检：本机一共用了多少、谁最占地方
 *
 * 边界：**只观察、不拦截**。不做预防性体积拦截 —— 提前估算再拦会误伤正常保存，
 *       而 setItem 自己会失败；我们要做的只是别假装成功。
 *
 * 状态是模块级单例（与本项目其它 composable 同款），界面读它就能持续显示。
 */
import { ref } from 'vue'
import { STORAGE_LIMIT_BYTES, KEY_LABELS } from '../constants/categories'

/** 落盘失败的账：[{ key, label, reason, at }] */
const failures = ref([])
/** 容量体检结果（初值空，refreshUsage() 后填） */
const usage = ref({ totalBytes: 0, limitBytes: STORAGE_LIMIT_BYTES, byKey: [], at: null })

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

/** 重新体检一次（同步，纯读） */
export function refreshUsage() {
  usage.value = measureUsage()
  return usage.value
}

/** 记一笔「这个键没存上」（同一键只留一条，更新现场即可） */
export function reportWriteFailure(realKey, reason) {
  const entry = {
    key: realKey,
    label: labelOfKey(realKey),
    reason: String(reason || '空间不足或访问被拒'),
    at: new Date().toISOString()
  }
  const i = failures.value.findIndex(f => f.key === realKey)
  failures.value = i >= 0
    ? failures.value.map((f, idx) => (idx === i ? entry : f))
    : [...failures.value, entry]
  refreshUsage()
}

/** 这个键后来存进去了 → 销账 */
export function clearWriteFailure(realKey) {
  if (!failures.value.some(f => f.key === realKey)) return
  failures.value = failures.value.filter(f => f.key !== realKey)
}

/** 只读出口：界面用这个，别直接改内部 ref */
export function useStorageHealth() {
  return {
    failures,          // Ref<Array>
    usage,             // Ref<{totalBytes, limitBytes, byKey, at}>
    refreshUsage,
    labelOfKey
  }
}

/** 字节 → 「x.x MB」（界面一律写"约"，因为上限本身是估算模型的参数） */
export function formatMB(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

/** 仅供测试：清空状态（生产不调用） */
export function __resetStorageHealth() {
  failures.value = []
  usage.value = { totalBytes: 0, limitBytes: STORAGE_LIMIT_BYTES, byKey: [], at: null }
}
