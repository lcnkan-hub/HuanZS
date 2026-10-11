/**
 * 本地持久化积木
 * 用法：const { data, error } = useLocalStorage('my_key', { default: [] })
 * 自动同步 localStorage，值变更即时写入，无需手动调用 setItem
 * 损坏处理（A09）：解析失败的原文另存副本、绝不被默认值静默顶掉；错误在本次会话内保持可见
 *
 * @param {string} key - localStorage 键名
 * @param {*} defaultValue - 默认值
 * @returns {{ data: Ref, error: Ref<string|null> }} 响应式数据 + 错误信息
 */
import { ref, watch } from 'vue'
import { scopeKey } from '../utils/storageScope'

/** 损坏原文救援副本的键后缀（A09） */
const CORRUPT_SUFFIX = '__corrupt'
/** 救援提示只弹一次，避免多个键同时损坏时连环弹窗 */
let corruptAlerted = false

/**
 * 把解析失败的原始串另存一份，保证后续写入不构成「永久覆盖」（A09）
 * 空间不足等原因存不下时静默放弃副本——但错误仍会如实报出，绝不假装没事
 * @param {string} key 已按账号加过后缀的真实键名
 * @param {string} raw 解析失败的原始串
 */
function rescueCorrupt(key, raw) {
  try {
    // 已有副本就不再覆盖：第一次损坏的那份原文更可能是有用的
    if (localStorage.getItem(key + CORRUPT_SUFFIX) === null) {
      localStorage.setItem(key + CORRUPT_SUFFIX, raw)
    }
  } catch { /* 存不下副本 → 放弃，下面的报错照旧 */ }
  if (!corruptAlerted) {
    corruptAlerted = true
    if (typeof alert !== 'undefined') {
      alert('⚠️ 本机有一项数据读不出来了。原始内容已保留、没有被覆盖——请先不要清理浏览器数据。')
    }
  }
}

export function useLocalStorage(key, defaultValue) {
  // 按当前登录账号重写下键名（未登录 / node 环境 = 原键名，行为与旧版完全一致）
  const realKey = scopeKey(key)
  let stored
  let initError = null

  try {
    stored = localStorage.getItem(realKey)
  } catch (e) {
    initError = e.message || 'localStorage 不可用'
    stored = null
  }

  let parsed
  let corrupt = false
  try {
    parsed = stored ? JSON.parse(stored) : defaultValue
  } catch {
    // ⚠️ A09：解析失败不能只是静默换成默认值——下一次任何变更都会把损坏原文永久顶掉，
    //    用户在正常操作过程中无声丢数据，且这一步不可逆。
    //    与备份层同一立场（useBackup.readJsonKey 解析失败即中止导出，不导缺件备份）：
    //    先留退路（原串另存副本），再把错误如实报出。
    corrupt = true
    parsed = defaultValue
    initError = '本地数据损坏：原始内容已保留副本，未被覆盖'
    rescueCorrupt(realKey, stored)
  }

  const data = ref(parsed)
  const error = ref(initError)
  // 损坏提示不随写入被清掉：那次写入正是「覆盖发生的那一刻」，清掉等于又静默了一次
  const stickyError = corrupt ? initError : null

  watch(
    data,
    (newVal) => {
      error.value = stickyError
      try {
        const json = JSON.stringify(newVal)
        localStorage.setItem(realKey, json)
      } catch (e) {
        // 存储失败时记录错误（如 localStorage 满 5MB 上限）
        error.value = '存储失败：' + (e.message || '空间不足或访问被拒');
        // 通知用户
        if (typeof alert !== 'undefined') alert('⚠️ 存储空间已满！请清理不用的条目或导出备份。')
      }
    },
    { deep: true }
  )

  return { data, error }
}
