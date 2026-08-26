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
export const STORAGE_KEYS = {
  USER: 'huan_zhong_shu_user',
  DB: 'huan_zhong_shu_db',
  CHAT: 'huan_zhong_shu_chat',
  MEMORY: 'huan_zhong_shu_memory_v1' // 王冠记忆库（v1；升级时改 _v2）
}
