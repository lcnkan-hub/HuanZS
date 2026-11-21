/**
 * 记录写入积木（王冠替用户记东西）
 * 职责：把「回合提取」阶段判出的动作，校验后落库；并向上游提供「已记了哪些」的清单
 * 边界：不改记录的单层数组结构（仅新增 origin 字段）；不做 UI
 *
 * 三种写入动作（2026-11-21 单层重构后不再判断分类）：
 *   new    —— 新建一条记录
 *   append —— 往**已有**记录（主记录或子记录）正文末尾追加，只加不改
 *   child  —— 往**已有**主记录下面挂子记录：主记录=主题，子记录=该主题下的具体条目
 *
 * 分层不硬套：判据写在提取提示里（多个并列主题才分层；一段连续说明塞正文就够）。
 * 这里只保证「分层这件事技术上做得到」，且找不到父时降级为新建、绝不丢内容。
 *
 * 保守底线不变：宁可漏记，也不让记录变垃圾桶。
 */
import { STORAGE_KEYS } from '../constants/categories'
import { scopeKey } from '../utils/storageScope'
import { getCurrentTimeString, generateUniqueId } from '../utils/uniqueId'
import { useRecords } from './useRecords'

const MAX_PER_ROUND = 5       // 单轮最多写几条：分层写入一轮要建父 + 挂几个子，上限比原来宽
export const MIN_CONTENT_LEN = 8 // 正文至少这么长才算「内容」，挡掉"好的""嗯嗯"
const MAX_TITLE_LEN = 40
const MAX_CONTENT_LEN = 4000  // 新建记录正文上限
const MAX_APPEND_LEN = 2000   // 单次追加上限

/** 取当前用户名当 creator —— 这样王冠记的内容也会出现在用户自己的「我创建的」里 */
function currentUserName() {
  try {
    return JSON.parse(localStorage.getItem(scopeKey(STORAGE_KEYS.USER)) || '{}').name || '我'
  } catch {
    return '我'
  }
}

/**
 * 列出现有记录（标题级，含子记录）
 * 供提取阶段喂给模型：它必须先知道库里有什么，才能判断「该新建 / 补进已有 / 挂到哪个主题下面」。
 * 只给标题/日期/归属，不给正文 —— 控 Token。
 * @returns {Array<{ name, time, parent }>} parent 非空表示这是子记录
 */
export function listWikiTitles() {
  try {
    const { records } = useRecords()
    const out = []
    for (const item of (records.value || [])) {
      const parentName = (item.name || '').trim()
      out.push({ name: parentName, time: (item.time || '').split(' ')[0], parent: '' })
      for (const child of (item.children || [])) {
        out.push({
          name: (child.name || '').trim(),
          time: ((child.time || item.time) || '').split(' ')[0],
          parent: parentName
        })
      }
    }
    return out
  } catch {
    return [] // 读不到就当没有：不影响提取，只是模型无从判断该追加还是新建
  }
}

/** 按名字在主记录 + 子记录里找 */
function findByName(list, name) {
  for (const item of (list || [])) {
    if ((item.name || '').trim() === name) return { item, isChild: false }
    for (const child of (item.children || [])) {
      if ((child.name || '').trim() === name) return { item: child, isChild: true }
    }
  }
  return null
}

/** 校验并归一化一条（不合格返回 null，一律丢弃、不猜不补） */
function normalize(raw, list) {
  if (!raw || typeof raw !== 'object') return null

  const title = String(raw.title || '').trim().slice(0, MAX_TITLE_LEN)
  const content = String(raw.content || '').trim()
  if (!title) return null

  const mode = raw.mode === 'append' || raw.mode === 'child' ? raw.mode : 'new'
  const body = content.slice(0, MAX_CONTENT_LEN)

  // —— 追加路径（名字逐字命中已有条目，主记录或子记录都认）——
  if (mode === 'append') {
    const hit = findByName(list, title)
    if (hit) {
      const add = content.slice(0, MAX_APPEND_LEN)
      if (add.length < MIN_CONTENT_LEN) return null
      return { mode: 'append', target: hit.item, content: add }
    }
    // 找不到 → 落到下面新建，保住内容，别让用户白说一句
  }

  // —— 挂子记录路径 ——
  if (mode === 'child') {
    const parentName = String(raw.parent || '').trim().slice(0, MAX_TITLE_LEN)
    const hit = parentName ? findByName(list, parentName) : null
    // 父必须是「已存在的主记录」：父本身是子记录 → 不支持三级，落到新建
    if (hit && !hit.isChild && body.length >= MIN_CONTENT_LEN) {
      const dup = (hit.item.children || []).some(c => (c.name || '').trim() === title)
      if (dup) return null // 同名子记录已存在 → 不重复挂
      return { mode: 'child', parent: hit.item, title, content: body }
    }
    // 找不到父 → 落到下面新建，保住内容
  }

  // —— 新建路径 ——
  if (body.length < MIN_CONTENT_LEN) return null
  if (findByName(list, title)) return null // 同名已存在 → 不重复建（不覆盖用户手写内容）
  return { mode: 'new', title, content: body }
}

/**
 * 写入记录（供回合提取阶段调用）
 * 数组**按顺序执行** —— 模型可以先用 new 建主记录、再用 child 往它下面挂子记录。
 * @param {Array} rawItems 模型判出的动作 [{ mode, title, parent, content }]（旧格式里的 category 会被忽略）
 * @returns {number} 实际写入条数（0 表示全部被保守过滤掉，属正常）
 */
export function writeWikiItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return 0

  try {
    const { records } = useRecords()
    const creator = currentUserName()
    let written = 0

    for (const raw of rawItems.slice(0, MAX_PER_ROUND)) {
      const item = normalize(raw, records.value) // 每轮实时读：上一轮刚建的父，这一轮要能挂上子
      if (!item) continue

      if (item.mode === 'append') {
        // 只加不改：保留原正文，追加内容另起一段
        const prev = (item.target.wiki || '').trimEnd()
        item.target.wiki = prev ? `${prev}\n\n${item.content}` : item.content
      } else if (item.mode === 'child') {
        if (!Array.isArray(item.parent.children)) item.parent.children = []
        item.parent.children.push({
          id: generateUniqueId(),
          name: item.title,
          wiki: item.content,
          creator,
          time: getCurrentTimeString(),
          origin: 'crown'
        })
      } else {
        records.value.push({
          id: generateUniqueId(),
          name: item.title,
          wiki: item.content,
          creator,
          time: getCurrentTimeString(),
          origin: 'crown',
          children: []
        })
      }
      written++
    }
    return written
  } catch {
    // 写入失败绝不影响对话主流程
    return 0
  }
}
