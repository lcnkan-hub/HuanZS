/**
 * 王冠「主动开口」配置中心
 * 职责：宪法 R1 的代码层落地 —— 每月主动消息 ≤3 条，仅限 6:00–21:30
 *
 * 真相源：RULES.md 产品宪法 R1（人读版在 Obsidian 03.知识库/产品/产品宪法（硬规则）.md）
 * 判据：utils/proactiveJudge.js（纯函数）；账本与生成：composables/useProactive.js
 *
 * 数值只在这里改一处，判据和测试都从这里取 —— 避免"宪法写 3 条、代码写 5 条"
 */

/** 每月最多主动开口几次（宪法 R1 原文：≤3 条） */
export const PROACTIVE_QUOTA_PER_MONTH = 3

/** 允许开口的时间窗，用"当天第几分钟"表示，含两端（宪法 R1 原文：仅限 6:00–21:30） */
export const PROACTIVE_WINDOW_START_MIN = 6 * 60       // 06:00
export const PROACTIVE_WINDOW_END_MIN = 21 * 60 + 30   // 21:30

/**
 * 距上次互动至少多久才开口。
 * 取 20 小时而不是 24：窗口 21:30 就关，若按整 24 小时算，
 * 「昨晚 21:00 聊过」的人今天最早 21:00 才够格，只剩 30 分钟窗口 —— 几乎永远轮不到。
 */
export const PROACTIVE_MIN_GAP_MS = 20 * 60 * 60 * 1000

/** 记忆库里至少要有这么多条，才允许开口（没有可"想起"的东西，开口只会退化成寒暄） */
export const PROACTIVE_MIN_MEMORIES = 1

/**
 * 账本最多留多少条。
 * 只为防账本无限增长（60 条 ≈ 满配额说 20 个月），不影响配额计算 ——
 * 配额只看"本月的记录"，裁剪保留的是最近 60 条，跨月计数不会因此漏算。
 */
export const PROACTIVE_LOG_MAX = 60
