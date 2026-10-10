/**
 * 本地持久化积木
 * 用法：const { data, error } = useLocalStorage('my_key', { default: [] })
 * 自动同步 localStorage，值变更即时写入，无需手动调用 setItem
 * 
 * @param {string} key - localStorage 键名
 * @param {*} defaultValue - 默认值
 * @returns {{ data: Ref, error: Ref<string|null> }} 响应式数据 + 错误信息
 */
import { ref, watch } from 'vue'
import { scopeKey } from '../utils/storageScope'

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
  try {
    parsed = stored ? JSON.parse(stored) : defaultValue
  } catch {
    parsed = defaultValue
  }

  const data = ref(parsed)
  const error = ref(initError)

  watch(
    data,
    (newVal) => {
      error.value = null
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
