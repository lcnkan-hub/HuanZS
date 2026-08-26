/**
 * 唯一 ID 生成工具
 * 使用 crypto.randomUUID() 生成密码学安全的唯一标识
 */

/** 生成唯一 ID */
export function generateUniqueId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 12)
  }
  // fallback：时间戳 + 随机数
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

/** 生成默认用户名（4位字母数字组合） */
export function generateDefaultUsername() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let name = ''
  for (let i = 0; i < 4; i++) {
    name += chars[Math.floor(Math.random() * chars.length)]
  }
  return name
}

/** 获取当前时间字符串（YYYY/MM/DD HH:mm 格式） */
export function getCurrentTimeString() {
  const now = new Date()
  return now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
}
