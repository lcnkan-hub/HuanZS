/**
 * 本地持久化积木
 * 用法：const { data, error } = useLocalStorage('my_key', { default: [] })
 * 自动同步 localStorage，值变更即时写入，无需手动调用 setItem
 * 损坏处理（A09）：解析失败的原文另存副本、绝不被默认值静默顶掉；错误在本次会话内保持可见
 * 写失败处理（I15）：不再"弹一句 alert 然后当作没发生"——记账给 useStorageHealth，
 *   由常驻提示条说清是**哪一份数据**没存上；写成功会把这笔账销掉
 * 跨标签页（A07）：订阅 storage 事件，另一个标签页改了同一个键 → 把值同步进来，
 *   同步时用闸门挡住回写（否则两个标签页会乒乓互写）
 *
 * @param {string} key - localStorage 键名
 * @param {*} defaultValue - 默认值
 * @returns {{ data: Ref, error: Ref<string|null> }} 响应式数据 + 错误信息
 */
import { ref, watch } from 'vue'
import { scopeKey } from '../utils/storageScope'
import { onExternalChange } from '../utils/storageSync'
import { reportWriteFailure, clearWriteFailure } from '../utils/storageHealth'

/**
 * 损坏原文救援副本的键后缀（A09）。
 * 导出成常量：备份层要按它找留证、也要按它写回去（useBackup.readRescueCopies），
 * 两处各写一遍字符串，早晚会只剩一处对。
 */
export const CORRUPT_SUFFIX = '__corrupt'
/** 救援提示只弹一次，避免多个键同时损坏时连环弹窗 */
let corruptAlerted = false
/** 写失败提示也只弹一次：常驻提示条负责持续告知，弹窗只负责把人叫醒（I15） */
let writeAlerted = false

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
  // 闸门：正在把**别的标签页**写过来的值落到内存 —— 这一次不许再写回去（A07）
  let applyingExternal = false

  watch(
    data,
    (newVal) => {
      error.value = stickyError
      if (applyingExternal) {
        // 这一步是「接受远端值」，不是「本页产生了新值」 —— 回写会造成两边乒乓互写
        applyingExternal = false
        return
      }
      try {
        const json = JSON.stringify(newVal)
        localStorage.setItem(realKey, json)
        // 这次真存进去了：把之前那笔「没存上」的账销掉（空间腾出来之后就恢复正常）
        clearWriteFailure(realKey)
      } catch (e) {
        // ⚠️ I15：原来这里只弹一句 alert 就继续跑 —— 界面看着一切正常，其实这条改动没落盘，
        //    刷新就没了，用户还不知道是从哪一刻开始丢的。现在：① 如实记账（人话标签给界面用）
        //    ② 弹窗只一次 ③ 常驻提示条持续显示，直到真的写成功为止。
        const reason = (e && e.message) ? e.message : '空间不足或访问被拒'
        const human = /quota|exceed|full/i.test(reason) ? '本机存储空间满了' : reason
        error.value = '存储失败：' + human
        reportWriteFailure(realKey, human)
        if (typeof alert !== 'undefined' && !writeAlerted) {
          writeAlerted = true
          alert('⚠️ 本机存储空间满了，这次的改动没能保存。\n\n先导出备份，再清理不用的条目。')
        }
      }
    },
    { deep: true }
  )

  // ── A07：另一个标签页改了同一个键 → 同步进来（原先这里什么都没有，后写的静默覆盖先写的）──
  // 键名用的是 realKey（含 @u<账号id> 后缀）：别的账号的键即使 base 同名也不会派发过来。
  onExternalChange(realKey, (e) => {
    if (e.newValue === null || e.newValue === undefined) {
      // 另一页把键删了 → 回落默认值（也走闸门，避免回写把对方删掉的值又写回来）
      applyingExternal = true
      data.value = defaultValue
      return
    }
    let next
    try {
      next = JSON.parse(e.newValue)
    } catch {
      // 远端写进来的不是合法 JSON：不拿它覆盖本页内存，保留现场，如实喊一声
      console.warn('[存储同步] 另一个标签页写进来的内容读不出来，本页未采用：' + realKey)
      return
    }
    applyingExternal = true
    data.value = next
  })

  return { data, error }
}
