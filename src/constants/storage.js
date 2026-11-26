/**
 * 存储键与容量口径（2026-11-24 从 constants/categories.js 迁出）
 *
 * 为什么单独一个文件：这个文件原名叫「分类」，里面却装着存储键、容量上限、人话标签 ——
 * 分类在 2026-11-21 单层重构后其实只剩导航配置了。名字和内容对不上，新功能就不知道该往哪加。
 * 现在职责一句话说得清：**这台设备上存了哪些键、每个键占多少、键名怎么讲人话**。
 *
 * ⚠️ 新增一个存储键时，必须同时做三件事，否则会留下「查不到人话 / 认领不到旧数据 / 导出丢件」的坑：
 *   1. 在这里登记 STORAGE_KEYS.XXX
 *   2. 在 KEY_LABELS 里写人话标签（I15：写失败提示条要靠它说"你记的东西没存上"）
 *   3. 若属于账号业务数据 → 加进 utils/storageScope.js 的 SCOPED_BASE_KEYS
 *      （首个账号认领本机旧数据时按这张表走）；若是设备级 → 加进 GLOBAL_KEYS
 *   另外：需要随备份带走的数据，还要在 composables/useBackup.js 的 TEXT_SOURCES 里登记一行。
 */

// 本地存储键名
// ⚠️ 两类键：设备级（多账号不隔离）/ 业务数据（按账号隔离，见 utils/storageScope.js）
export const STORAGE_KEYS = {
  USER: 'huan_zhong_shu_user',
  RECORDS: 'huan_zhong_shu_records', // 记录：单层数组（2026-11-21 取代 huan_zhong_shu_db 的三分类对象）
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

  // —— 收藏（2026-11-22）——
  // 只存记录的 id 列表，**不往记录上加字段**：RULES 第 4 条锁死了记录结构
  // （2026-11-22 起为 {id,name,wiki,creator,time,origin}），第 9 条要求旧数据不受影响。
  // 独立键天然两头满足：旧记录一个字节没动，删掉收藏键就等于没收藏过。
  FAVORITES: 'huan_zhong_shu_favorites',

  // —— 首屏定位（I03）——
  LAST_TAB: 'huan_zhong_shu_last_tab', // 上次停留的 Tab（键不存在 = 首次进来 → 王冠）

  // —— 备份提醒（I14）——
  BACKUP_SNOOZE: 'huan_zhong_shu_backup_snooze', // 「今天先不提醒」的到期时刻（只压一天，不永久消失）

  // —— 外观（2026-11-25 · 2026-11-26 拆成两条轴）——
  // 'auto' | 'system' | 'day' | 'night'；设备级：外观是"这台设备"的偏好，跟哪个账号无关
  THEME_MODE: 'huan_zhong_shu_theme_mode',
  // 色系 id（constants/palettes.js 的注册表）；设备级、不进备份 —— 换手机重选一次即可
  PALETTE: 'huan_zhong_shu_palette'
}

/**
 * 本机存储容量上限（byte，UTF-16 口径）。
 * 浏览器普遍按「每个源约 5MB」算配额，且是按 UTF-16 字符计 —— 所以体检里
 * 一个字符算 2 字节。这个数字是**估算模型的参数**，不是测量值：界面文案一律写"约"。
 */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024

/**
 * 存储键 → 人话标签（I15）。
 * 为什么需要：存储写失败时不能给用户念 `huan_zhong_shu_records@u3f2a` ——
 * 他要知道的是"你记的东西没存上"。键名在此统一翻译，全项目一处维护。
 */
export const KEY_LABELS = {
  [STORAGE_KEYS.USER]: '个人资料',
  [STORAGE_KEYS.RECORDS]: '记录',
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
  [STORAGE_KEYS.BACKUP_SNOOZE]: '备份提醒暂缓',
  [STORAGE_KEYS.THEME_MODE]: '外观（白天 / 夜晚）',
  [STORAGE_KEYS.PALETTE]: '外观（色系）',
  [STORAGE_KEYS.FAVORITES]: '收藏'   // 2026-11-24 补登记：这个键一直有，标签一直缺
}
