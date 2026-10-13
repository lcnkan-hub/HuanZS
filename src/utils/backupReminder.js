/**
 * 备份提醒判据（2026-10-13 新增 · 对应问题清单 I14「导出提醒」）
 *
 * 为什么单独立一个纯函数：这条的判断全是"什么时候该说话、什么时候该闭嘴"，
 * 和界面无关，但错一次就是天天弹骚扰 —— 与 utils/proactiveJudge.js 同一套写法，
 * 判据脱离界面可单测，界面只负责显示。
 *
 * 规则（每条都有理由，改之前先读）：
 *  · 本机没数据（空库）→ 不提醒。刚装好就被催备份很烦，而且没什么可丢的
 *  · 点过「今天先不提醒」→ 到**次日 0 点**之前不提醒。只压一天、不永久消失 ——
 *    能被一次忽略就永远消失的提醒，等于没有提醒（这正是 I14 的根）
 *  · 从没导出过但有数据 → **提醒**。这是最该催的一种：用了很久、一次没备份、
 *    本机是唯一副本。空库那条已经把"刚装好"挡掉了，所以这里不用再客气
 *  · 距上次导出 ≥ REMIND_AFTER_DAYS 天 → 提醒
 *  · 时间戳坏掉（解析不出）→ 不提醒（判不出来就别吓人）
 *
 * 天花板（I05 已认下）：纯前端没有后台，提醒只在**打开 app 那一刻**判一次。
 */
export const REMIND_AFTER_DAYS = 14
export const DAY_MS = 24 * 60 * 60 * 1000

/** 距某个时间戳过了几天（向下取整）；解析不出来返回 null */
export function daysSince(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (!t || Number.isNaN(t)) return null
  return Math.floor((now - t) / DAY_MS)
}

/** 「今天先不提醒」的到期时刻 = 次日 0 点 */
export function snoozeUntilTomorrow(now = Date.now()) {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.toISOString()
}

/**
 * 该不该提醒
 * @param {{lastExportAt?: string|null, now?: number, snoozedUntil?: string|null, hasData?: boolean}} ctx
 * @returns {{remind: boolean, reason: string, days?: number}}
 */
export function shouldRemind({ lastExportAt = null, now = Date.now(), snoozedUntil = null, hasData = false } = {}) {
  if (!hasData) return { remind: false, reason: 'empty' }

  if (snoozedUntil) {
    const s = Date.parse(snoozedUntil)
    if (!Number.isNaN(s) && now < s) return { remind: false, reason: 'snoozed' }
  }

  if (!lastExportAt) return { remind: true, reason: 'never_exported' }

  const days = daysSince(lastExportAt, now)
  if (days === null) return { remind: false, reason: 'bad_timestamp' }
  if (days >= REMIND_AFTER_DAYS) return { remind: true, reason: 'overdue', days }
  return { remind: false, reason: 'fresh', days }
}

/**
 * 提醒文案（与判据同处，避免两边各写一份说法）
 * @returns {{title: string, detail: string}}
 */
export function reminderText(result) {
  if (result && result.reason === 'never_exported') {
    return {
      title: '你还没导出过一次备份',
      // 文案长度是算过的：375px 窄屏下 --text-12 一行约 30 字，
      // 超过就会折出「……一分钟的 / 事。」这种孤字行（第一版就折了）
      detail: '本机是唯一的一份，先导一份放着。'
    }
  }
  const days = (result && result.days) || REMIND_AFTER_DAYS
  return {
    title: `上次导出是 ${days} 天前了`,
    detail: '本机是唯一的一份 —— 导一份放着。'
  }
}
