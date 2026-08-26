/**
 * 图标常量 — 纯 SVG 图标库
 * 所有图标以函数形式导出，返回完整 SVG 字符串（含 <title> 无障碍标签）
 * 参数：size（默认 20），通过模板字符串嵌入 width/height
 *
 * 设计规范：
 * - viewBox: 0 0 24 24（统一画布）
 * - stroke-width: 2（统一描边）
 * - stroke-linecap: round, stroke-linejoin: round
 * - fill: none / currentColor（动态颜色响应）
 * - 每个 SVG 嵌入 <title> 保障无障碍
 *
 * 用法：
 *   import { iconBack } from '@/constants/icons'
 *   <span v-html="iconBack(20)"></span>
 *   或通过 AppIcon 组件：
 *   <AppIcon name="back" :size="20" />
 */

const svg = (size, title, inner) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>${title}</title>${inner}</svg>`

const svgFilled = (size, title, fillColor, inner) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><title>${title}</title>${inner.replace(/fill="currentColor"/g, `fill="${fillColor}"`)}</svg>`

// ========== 导航方向 ==========

export const iconBack = (size = 20) =>
  svg(size, '返回', '<polyline points="15,18 9,12 15,6"/>')

export const iconForward = (size = 20) =>
  svg(size, '前进', '<polyline points="9,18 15,12 9,6"/>')

export const iconDown = (size = 20) =>
  svg(size, '下拉', '<polyline points="6,9 12,15 18,9"/>')

export const iconUp = (size = 20) =>
  svg(size, '收起', '<polyline points="18,15 12,9 6,15"/>')

// ========== 操作 ==========

export const iconClose = (size = 20) =>
  svg(size, '关闭', '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')

export const iconCheck = (size = 20) =>
  svg(size, '确认', '<polyline points="4,12 9,17 20,6"/>')

export const iconPlus = (size = 20) =>
  svg(size, '添加', '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>')

export const iconTrash = (size = 20) =>
  svg(size, '删除', '<polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>')

export const iconEdit = (size = 20) =>
  svg(size, '编辑', '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>')

export const iconSearch = (size = 20) =>
  svg(size, '搜索', '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>')

// ========== 分类 / 导航 Tab ==========

export const iconGame = (size = 20) =>
  svg(size, '游戏', '<path d="M6 11h4V8l-2-2H6l-2 2v3zm12 0h-4V8l2-2h2l2 2v3z"/><circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="13" x2="15" y2="13"/><path d="M7 13a5 5 0 0 0 10 0"/>')

export const iconNote = (size = 20) =>
  svg(size, '笔记', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/>')

export const iconLife = (size = 20) =>
  svg(size, '生活', '<path d="M17 8c0 6-5 11-5 11S7 14 7 8a5 5 0 0 1 10 0z"/><line x1="12" y1="3" x2="12" y2="8"/>')

export const iconMine = (size = 20) =>
  svg(size, '我的', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')

// ========== 内容 ==========

export const iconDoc = (size = 20) =>
  svg(size, '文档', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>')

export const iconBookOpen = (size = 20) =>
  svg(size, '详情', '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>')

export const iconBook = (size = 20) =>
  svg(size, '百科', '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>')

// ========== 状态/元信息 ==========

export const iconClock = (size = 20) =>
  svg(size, '时间', '<circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>')

export const iconAuthor = (size = 20) =>
  svg(size, '作者', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')

export const iconTag = (size = 20) =>
  svg(size, '标签', '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>')

export const iconList = (size = 20) =>
  svg(size, '列表', '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>')

export const iconHasContent = (size = 20) =>
  svg(size, '有内容', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>')

// ========== 功能 ==========

export const iconSettings = (size = 20) =>
  svg(size, '设置', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')

export const iconExport = (size = 20) =>
  svg(size, '导出', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/>')

export const iconImport = (size = 20) =>
  svg(size, '导入', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>')

export const iconShield = (size = 20) =>
  svg(size, '备份', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>')

export const iconStats = (size = 20) =>
  svg(size, '统计', '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>')

/** 思维导图（节点连线图） */
export const iconMindmap = (size = 20) =>
  svg(size, '思维导图', '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="13" r="2.5"/><circle cx="19" cy="13" r="2.5"/><circle cx="8" cy="21" r="2.5"/><circle cx="16" cy="21" r="2.5"/><line x1="12" y1="7.5" x2="6.5" y2="11"/><line x1="12" y1="7.5" x2="17.5" y2="11"/><line x1="6.5" y1="15" x2="8" y2="18.5"/><line x1="17.5" y1="15" x2="16" y2="18.5"/>')

export const iconPuzzle = (size = 20) =>
  svg(size, '积木', '<path d="M19.439 12.94a2.5 2.5 0 0 0 1.56-2.44 2.5 2.5 0 0 0-2.5-2.5h-.5v-.5a2.5 2.5 0 0 0-5 0V8h-2V7.5a2.5 2.5 0 0 0-5 0V8h-.5a2.5 2.5 0 0 0 0 5H6v2h-.5a2.5 2.5 0 0 0 0 5H6v.5a2.5 2.5 0 0 0 5 0V20h2v.5a2.5 2.5 0 0 0 5 0V20h.5a2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-1.56-2.44"/>')

/** 王冠 — 代表 王冠 AI 伙伴 */
export const iconCrown = (size = 20) =>
  svg(size, '王冠', '<path d="M2 20h20"/><path d="M4 20V8l5 4 3-6 3 6 5-4v12"/>')

/** 记忆 — 王冠记住的事（Lucide brain 风格） */
export const iconMemory = (size = 20) =>
  svg(size, '记忆', '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 5 17.5v-2.5a2.5 2.5 0 0 1 5-2.5"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 19 17.5v-2.5a2.5 2.5 0 0 0-5-2.5"/>')

// ========== 颜色标签（实心圆点，使用单独 fill 颜色） ==========

export const iconColorBlue = (size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><title>深海蓝</title><circle cx="12" cy="12" r="6" fill="var(--color-markdown-blue)"/></svg>`

export const iconColorBrown = (size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><title>暖木棕</title><circle cx="12" cy="12" r="6" fill="var(--color-markdown-brown)"/></svg>`

export const iconColorGreen = (size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><title>苔藓绿</title><circle cx="12" cy="12" r="6" fill="var(--color-markdown-green)"/></svg>`

// ========== 图标映射表（字符串 key → 函数引用） ==========

export const ICON_MAP = {
  back: iconBack,
  forward: iconForward,
  down: iconDown,
  up: iconUp,
  close: iconClose,
  check: iconCheck,
  plus: iconPlus,
  trash: iconTrash,
  edit: iconEdit,
  search: iconSearch,
  game: iconGame,
  note: iconNote,
  life: iconLife,
  mine: iconMine,
  doc: iconDoc,
  book: iconBook,
  'book-open': iconBookOpen,
  clock: iconClock,
  author: iconAuthor,
  tag: iconTag,
  list: iconList,
  'has-content': iconHasContent,
  settings: iconSettings,
  export: iconExport,
  import: iconImport,
  shield: iconShield,
  stats: iconStats,
  crown: iconCrown,
  memory: iconMemory,
  puzzle: iconPuzzle,
  'color-blue': iconColorBlue,
  'color-brown': iconColorBrown,
  'color-green': iconColorGreen
}
