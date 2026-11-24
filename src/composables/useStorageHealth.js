/**
 * 本机存储健康 · 响应式外壳（2026-11-24 从 utils/storageHealth.js 拆出）
 *
 * 为什么拆：utils 层不该 import vue。
 *   `storageHealth` 里混着两件事 —— ① 纯计算（按 UTF-16 量每个键占多少、键名人话化）
 *   ② 响应式账本（写失败记账、界面订阅）。① 是纯函数，② 才有 Vue。
 *   搅在一起的结果是 node 单跑体检要先把 vue 拉起来，而且 utils 目录的「无框架」约定被破坏。
 *
 * 现在：
 *   utils/storageHealth.js   → labelOfKey / measureUsage / formatMB（纯函数，可独立单测）
 *   composables/useStorageHealth.js → 本文件（ref 账本 + 对外出口）
 *
 * 新增「记账类」需求（比如以后统计写延迟、按账号分账）请加在这里，别往 utils 塞 ref。
 */
import { ref } from 'vue'
import { STORAGE_LIMIT_BYTES } from '../constants/categories'
import { measureUsage, labelOfKey } from '../utils/storageHealth'

/** 落盘失败的账：[{ key, label, reason, at }] */
const failures = ref([])
/** 容量体检结果（初值空，refreshUsage() 后填） */
const usage = ref({ totalBytes: 0, limitBytes: STORAGE_LIMIT_BYTES, byKey: [], at: null })

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

/** 仅供测试：清空状态（生产不调用） */
export function __resetStorageHealth() {
  failures.value = []
  usage.value = { totalBytes: 0, limitBytes: STORAGE_LIMIT_BYTES, byKey: [], at: null }
}
