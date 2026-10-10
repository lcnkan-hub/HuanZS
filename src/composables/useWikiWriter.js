/**
 * 百科写入积木（王冠替用户记东西）
 * 职责：把「回合提取」阶段判出的百科动作，校验后落库；并向上游提供「已有哪些条目」的清单
 * 边界：不改 dbData 的三分类结构（仅新增 origin 字段）；不做 UI
 *
 * 三种写入动作：
 *   new    —— 新建主条目
 *   append —— 往**已有**条目（主条目或子条目）正文末尾追加，只加不改
 *   child  —— 往**已有**主条目下面挂子词条：主条目=主题，子词条=该主题下的具体条目
 *
 * 分层不硬套：判据写在提取提示里（多个并列主题才分层；一段连续说明塞正文就够）。
 * 这里只保证「分层这件事技术上做得到」，且找不到父时降级为新建、绝不丢内容。
 *
 * 保守底线不变：宁可漏记，也不让百科变垃圾桶。
 */
import { ALL_CATEGORIES, STORAGE_KEYS } from '../constants/categories'
import { scopeKey } from '../utils/storageScope'
import { getCurrentTimeString, generateUniqueId } from '../utils/uniqueId'
import { useWikiData } from './useWikiData'

const MAX_PER_ROUND = 5       // 单轮最多写几条：分层写入一轮要建父 + 挂几个子，上限比原来宽
const MIN_CONTENT_LEN = 8     // 正文至少这么长才算「知识」，挡掉"好的""嗯嗯"
const MAX_TITLE_LEN = 40
const MAX_CONTENT_LEN = 4000  // 新建条目正文上限
const MAX_APPEND_LEN = 2000   // 单次追加上限

/** 取当前用户名当 creator —— 这样王冠记的条目也会出现在用户自己的「我的」页里 */
function currentUserName() {
  try {
    return JSON.parse(localStorage.getItem(scopeKey(STORAGE_KEYS.USER)) || '{}').name || '我'
  } catch {
    return '我'
  }
}

/**
 * 列出现有百科条目（标题级，含子词条）
 * 供提取阶段喂给模型：它必须先知道库里有什么，才能判断「该新建 / 补进已有 / 挂到哪个主题下面」。
 * 只给分类/标题/日期/归属，不给正文 —— 控 Token。
 * @returns {Array<{ category, name, time, parent }>} parent 非空表示这是子词条
 */
export function listWikiTitles() {
  try {
    const { dbData } = useWikiData()
    const out = []
    for (const category of ALL_CATEGORIES) {
      for (const item of (dbData.value[category] || [])) {
        const parentName = (item.name || '').trim()
        out.push({ category, name: parentName, time: (item.time || '').split(' ')[0], parent: '' })
        for (const child of (item.children || [])) {
          out.push({
            category,
            name: (child.name || '').trim(),
            time: ((child.time || item.time) || '').split(' ')[0],
            parent: parentName
          })
        }
      }
    }
    return out
  } catch {
    return [] // 读不到就当没有：不影响提取，只是模型无从判断该追加还是新建
  }
}

/** 按名字在全部主条目 + 子词条里找（不依赖模型给的 category，避免它记错分类导致找不到） */
function findByName(db, name) {
  for (const category of ALL_CATEGORIES) {
    for (const item of (db[category] || [])) {
      if ((item.name || '').trim() === name) return { item, isChild: false }
      for (const child of (item.children || [])) {
        if ((child.name || '').trim() === name) return { item: child, isChild: true }
      }
    }
  }
  return null
}

/** 校验并归一化一条（不合格返回 null，一律丢弃、不猜不补） */
function normalize(raw, db) {
  if (!raw || typeof raw !== 'object') return null

  const title = String(raw.title || '').trim().slice(0, MAX_TITLE_LEN)
  const content = String(raw.content || '').trim()
  if (!title) return null

  const mode = raw.mode === 'append' || raw.mode === 'child' ? raw.mode : 'new'
  const body = content.slice(0, MAX_CONTENT_LEN)

  // —— 追加路径（名字逐字命中已有条目，主条目或子词条都认）——
  if (mode === 'append') {
    const hit = findByName(db, title)
    if (hit) {
      const add = content.slice(0, MAX_APPEND_LEN)
      if (add.length < MIN_CONTENT_LEN) return null
      return { mode: 'append', target: hit.item, content: add }
    }
    // 找不到 → 落到下面新建，保住内容，别让用户白说一句
  }

  // —— 挂子词条路径 ——
  if (mode === 'child') {
    const parentName = String(raw.parent || '').trim().slice(0, MAX_TITLE_LEN)
    const hit = parentName ? findByName(db, parentName) : null
    // 父必须是「已存在的主条目」：父本身是子词条 → 不支持三级，落到新建
    if (hit && !hit.isChild && body.length >= MIN_CONTENT_LEN) {
      const dup = (hit.item.children || []).some(c => (c.name || '').trim() === title)
      if (dup) return null // 同名子词条已存在 → 不重复挂
      return { mode: 'child', parent: hit.item, title, content: body }
    }
    // 找不到父 → 落到下面新建，保住内容
  }

  // —— 新建路径 ——
  const category = ALL_CATEGORIES.includes(raw.category) ? raw.category : null
  if (!category) return null // 类别不在白名单 → 丢弃（「第四个结局：不归类」）
  if (body.length < MIN_CONTENT_LEN) return null
  if (findByName(db, title)) return null // 同名已存在 → 不重复建（不覆盖用户手写内容）
  return { mode: 'new', category, title, content: body }
}

/**
 * 写入百科（供回合提取阶段调用）
 * 数组**按顺序执行** —— 模型可以先用 new 建主条目、再用 child 往它下面挂子词条。
 * @param {Array} rawItems 模型判出的动作 [{ mode, title, category, parent, content }]
 * @returns {number} 实际写入条数（0 表示全部被保守过滤掉，属正常）
 */
export function writeWikiItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return 0

  try {
    const { dbData } = useWikiData()
    const creator = currentUserName()
    let written = 0

    for (const raw of rawItems.slice(0, MAX_PER_ROUND)) {
      const item = normalize(raw, dbData.value) // 每轮实时读：上一轮刚建的父，这一轮要能挂上子
      if (!item) continue

      if (item.mode === 'append') {
        // 只加不改：保留原正文，追加内容另起一段
        const prev = (item.target.wiki || '').trimEnd()
        item.target.wiki = prev ? `${prev}\n\n${item.content}` : item.content
      } else if (item.mode === 'child') {
        if (!item.parent.children) item.parent.children = []
        item.parent.children.push({
          id: generateUniqueId(),
          name: item.title,
          wiki: item.content,
          creator,
          time: getCurrentTimeString(),
          origin: 'crown' // 王冠代记：界面可据此区分，不稀释用户手写的内容
        })
      } else {
        dbData.value[item.category].push({
          id: generateUniqueId(),
          name: item.title,
          wiki: item.content,
          creator,
          time: getCurrentTimeString(),
          origin: 'crown'
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
