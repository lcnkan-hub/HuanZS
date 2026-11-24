/**
 * 导航与分类配置（2026-11-24 收拾职责：存储键已迁到 ./storage.js，本文件不再混杂项）
 *
 * 2026-11-21 单层记录重构：原来的游戏 / 笔记 / 生活三分类全部下线，
 * 「记录」= 一条不分类的时间流水，王冠是第二个也是最后一个 Tab。
 * 图标字段为 SVG key（由 AppIcon 组件渲染），不使用 emoji。
 *
 * ⚠️ 新增 Tab / 导航项：改 NAV_ITEMS 一处即可（TAB_IDS 由它派生）；图标 key 要同步登记到
 *    constants/icons.js 的 ICON_MAP，否则 AppIcon 渲染成空。
 */

// Tab 图标映射（SVG key，对应 ICON_MAP）
export const TAB_ICONS = {
  record: 'note',
  crown: 'crown'
}

// Tab 中文名称映射
export const TAB_NAMES = {
  record: '记录',
  crown: '王冠'
}

// 底部导航项配置
export const NAV_ITEMS = [
  { id: 'record', icon: 'menu',  text: '记录' },
  { id: 'crown',  icon: 'crown', text: '王冠' }
]

// 可选头像列表（这个保留 emoji，因为是用户选择的个性头像，不是 UI 图标）
export const AVAILABLE_AVATARS = [
  '🐱', '🐶', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁',
  '🐸', '🐵', '🌶️', '🚀', '💎', '🎨', '🕹️'
]

/** 全部合法 Tab（校验持久化的 Tab 值用，从导航项派生，不另写一份） */
export const TAB_IDS = NAV_ITEMS.map(i => i.id)

/**
 * 兼容出口（2026-11-24）：存储键 / 容量上限 / 人话标签都搬到了 ./storage.js。
 * 这里再导出一次，是为了让 88 处既有 import 不用一次性全改；
 * **新代码请直接** `import { STORAGE_KEYS } from '../constants/storage'`，
 * 别继续从「分类」里拿存储键 —— 那正是这次要收拾的混淆。
 */
export { STORAGE_KEYS, STORAGE_LIMIT_BYTES, KEY_LABELS } from './storage'
