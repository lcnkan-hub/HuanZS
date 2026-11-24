/**
 * 备份错误 → 人话（2026-11-24 从 useBackup.js 拆出）
 *
 * 产品界面上不该出现 `Failed to execute 'transaction' on 'IDBDatabase'...` 这种东西 ——
 * 用户看不懂，也不知道下一步该干什么。
 * 单独成文件的原因：导出侧和导入侧都要用，放在任何一侧都会让另一侧反向依赖。
 */

/**
 * @param {unknown} e 原始错误
 * @returns {string} 给用户看的一句话
 */
export function humanError(e) {
  const m = (e && e.message) || ''
  if (/object stores was not found|NotFoundError|DataError/i.test(m)) {
    return '本机图片库读不到。数据没动 —— 可以先试「只导文字数据」，或者完全关掉 App 重开再导'
  }
  if (/quota|QuotaExceeded/i.test(m)) return '本机存储空间不足'
  if (/被占用/.test(m)) return m
  return m || '未知错误'
}
