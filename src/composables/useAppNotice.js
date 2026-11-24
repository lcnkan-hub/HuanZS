/**
 * 常驻提示条的内容与动作（2026-11-24 从 App.vue 抽出，逻辑未改）
 *
 * 现在只有一种提示：**存储写失败**（I15）。2026-11-22 用户要求把「你还没导出过备份」
 * 那条撤掉，之后会在别处重做 —— utils/backupReminder.js 与它的测试原样留着，别删。
 *
 * 为什么抽：这段包含「什么情况下说什么话」的完整判断，和 Root 的装配混在一起时，
 * 想改文案得先翻过登录门和转场代码；抽出来之后 Root 只传两个动作进来。
 *
 * @param {object} deps
 * @param {() => void} deps.onExport        点「导出备份」：一般是打开「我的」（备份中心在那儿）
 * @param {() => Promise<any>|any} deps.purgeImages  点「清一清图片」：回收没有被引用的图
 */
import { ref, computed } from 'vue'
import { useStorageHealth } from './useStorageHealth'
import { formatMB } from '../utils/storageHealth'

export function useAppNotice({ onExport, purgeImages } = {}) {
  const { failures, usage, refreshUsage } = useStorageHealth()
  /** 只能暂时收起（本次会话）：下一次写失败还要再提醒 */
  const noticeCollapsed = ref(false)

  const notice = computed(() => {
    if (noticeCollapsed.value) return null

    // 有数据没存上（I15）
    const fail = (failures.value || [])[0]
    if (fail) {
      const u = usage.value || {}
      return {
        kind: 'error',
        icon: 'close',
        title: `「${fail.label}」这次的改动没保存下来`,
        detail: `本机存储满了（已用约 ${formatMB(u.totalBytes)}，上限约 ${formatMB(u.limitBytes)}）。` +
          `先导一份备份把东西带走，再清理不用的内容。`,
        actions: [
          { label: '导出备份', value: 'export', primary: true },
          { label: '清一清图片', value: 'purge' }
        ]
      }
    }
    return null
  })

  /** 提示条上的动作：收起 / 去导出 / 清图片 */
  function handleNoticeAction(value) {
    if (value === 'collapse') { noticeCollapsed.value = true; return }
    if (value === 'export') { if (onExport) onExport(); return }
    if (value === 'purge') {
      Promise.resolve(purgeImages && purgeImages()).then(() => refreshUsage())
    }
  }

  return { notice, noticeCollapsed, handleNoticeAction }
}
