/**
 * 百科分类配置中心
 * 所有分类相关的硬编码统一管理，修改一处全局生效
 * 图标字段现为 SVG key（由 AppIcon 组件渲染），不再使用 emoji
 */

// Tab 图标映射（SVG key，对应 ICON_MAP）
export const TAB_ICONS = {
  game: 'game',
  note: 'note',
  life: 'life',
  crown: 'crown',
  mine: 'mine'
}

// Tab 中文名称映射
export const TAB_NAMES = {
  game: '游戏',
  note: '笔记',
  life: '生活',
  crown: '王冠',
  mine: '我的'
}

// 百科内容分类（不含"我的"和"王冠"Tab）
export const ALL_CATEGORIES = ['game', 'note', 'life']

// 底部导航项配置（icon 改为 SVG key）
export const NAV_ITEMS = [
  { id: 'game',  icon: 'game',  text: '游戏' },
  { id: 'note',  icon: 'note',  text: '笔记' },
  { id: 'life',  icon: 'life',  text: '生活' },
  { id: 'crown', icon: 'crown', text: '王冠' },
  { id: 'mine',  icon: 'mine',  text: '我的' }
]

// 可选头像列表（这个保留 emoji，因为是用户选择的个性头像，不是 UI 图标）
export const AVAILABLE_AVATARS = [
  '🐱', '🐶', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁',
  '🐸', '🐵', '🌶️', '🚀', '💎', '🎨', '🕹️'
]

// 本地存储键名
// ⚠️ 两类键：设备级（多账号不隔离）/ 业务数据（按账号隔离，见 utils/storageScope.js）
export const STORAGE_KEYS = {
  USER: 'huan_zhong_shu_user',
  DB: 'huan_zhong_shu_db',
  CHAT: 'huan_zhong_shu_chat',
  MEMORY: 'huan_zhong_shu_memory_v1', // 王冠记忆库（v1；升级时改 _v2）
  AI_CONFIG: 'huan_zhong_shu_ai_config', // AI 密钥配置（BYOK，只存本机）

  // —— 设备级：跟「这台设备」有关，跟「哪个账号」无关 ——
  ACCOUNTS: 'huan_zhong_shu_accounts', // 账号表（用户名 + 盐 + 哈希，不存明文密码）
  SESSION: 'huan_zhong_shu_session',   // 登录态（当前账号 id）

  // —— 业务数据：按账号隔离（utils/storageScope.js 的 scopeKey 会加 @u<账号id> 后缀）——
  CRISIS_AUDIT: 'crown_crisis_audit_log', // 危机响应留痕（原写在 services/crisisResponse.js）
  CRISIS_PENDING: 'crown_crisis_pending', // 危机待确认标记
  CRISIS_STATE: 'crown_crisis_state',      // 风险状态机（原写在 services/riskStateMachine.js）
  LAST_EXPORT: 'huan_zhong_shu_last_export_at', // 上次导出备份的时间戳（按账号隔离，走 scopeKey）

  // —— 王冠主动开口（I02 · 产品宪法 R1）——
  PROACTIVE_LOG: 'crown_proactive_log',    // 主动开口账本：每次真说出口记一条 { ts, excerpt }，月配额从记录现算
  PROACTIVE_ENABLED: 'crown_proactive_enabled', // 用户开关（键不存在 = 开；宪法没规定开关，是本产品补的）

  // —— 首屏定位（I03）——
  LAST_TAB: 'huan_zhong_shu_last_tab', // 上次停留的 Tab（键不存在 = 首次进来 → 王冠）

  // —— 备份提醒（I14）——
  BACKUP_SNOOZE: 'huan_zhong_shu_backup_snooze' // 「今天先不提醒」的到期时刻（只压一天，不永久消失）
}

/**
 * 本机存储容量上限（byte，UTF-16 口径）。
 * 浏览器普遍按「每个源约 5MB」算配额，且是按 UTF-16 字符计 —— 所以体检里
 * 一个字符算 2 字节。这个数字是**估算模型的参数**，不是测量值：界面文案一律写"约"。
 */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024

/**
 * 存储键 → 人话标签（I15）。
 * 为什么需要：存储写失败时不能给用户念 `huan_zhong_shu_memory_v1@u3f2a` ——
 * 他要知道的是"王冠的记忆没存上"。键名在此统一翻译，全项目一处维护。
 */
export const KEY_LABELS = {
  [STORAGE_KEYS.USER]: '个人资料',
  [STORAGE_KEYS.DB]: '百科条目',
  [STORAGE_KEYS.CHAT]: '和王冠的聊天记录',
  [STORAGE_KEYS.MEMORY]: '王冠的记忆',
  [STORAGE_KEYS.AI_CONFIG]: 'AI 设置（密钥只在本机）',
  [STORAGE_KEYS.ACCOUNTS]: '本机账号表',
  [STORAGE_KEYS.SESSION]: '登录状态',
  [STORAGE_KEYS.CRISIS_AUDIT]: '危机响应留痕',
  [STORAGE_KEYS.CRISIS_PENDING]: '危机待确认标记',
  [STORAGE_KEYS.CRISIS_STATE]: '风险状态',
  [STORAGE_KEYS.LAST_EXPORT]: '上次导出时间',
  [STORAGE_KEYS.PROACTIVE_LOG]: '王冠主动开口账本',
  [STORAGE_KEYS.PROACTIVE_ENABLED]: '主动开口开关',
  [STORAGE_KEYS.LAST_TAB]: '上次停留的页面',
  [STORAGE_KEYS.BACKUP_SNOOZE]: '备份提醒暂缓'
}

/** 全部合法 Tab（校验持久化的 Tab 值用，从导航项派生，不另写一份） */
export const TAB_IDS = NAV_ITEMS.map(i => i.id)
