/**
 * 百科写入积木（王冠替用户记东西 · 第三步「说得进去」）
 * 职责：把「回合提取」阶段判出的百科条目，校验后落库
 * 边界：只做校验 + 写入；不改 dbData 的三分类结构（仅新增 origin 字段）；不做 UI
 *
 * 核心设计：**保守优先**。
 * 宁可漏记，也不能让百科变垃圾桶 —— 垃圾桶会直接毁掉王冠的检索质量
 * （读的时候满屏噪音），反而把前两步做的闭环一起毁掉。
 * 所以门槛故意设高：类别必须在白名单、标题不能空、正文不能太短、同名不重复写。
 */
import { ALL_CATEGORIES, STORAGE_KEYS } from '../constants/categories'
import { getCurrentTimeString, generateUniqueId } from '../utils/uniqueId'
import { useWikiData } from './useWikiData'

const MAX_PER_ROUND = 2       // 单轮最多写几条（防模型一次倒一堆）
const MIN_CONTENT_LEN = 8     // 正文至少这么长才算「知识」，挡掉"好的""嗯嗯"
const MAX_TITLE_LEN = 40
const MAX_CONTENT_LEN = 4000

/** 取当前用户名当 creator —— 这样王冠记的条目也会出现在用户自己的「我的」页里 */
function currentUserName() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}').name || '我'
  } catch {
    return '我'
  }
}

/** 校验单条：不合格返回 null（一律丢弃，不猜、不补） */
function normalize(raw, db) {
  if (!raw || typeof raw !== 'object') return null

  const category = ALL_CATEGORIES.includes(raw.category) ? raw.category : null
  if (!category) return null // 类别不在白名单 → 丢弃（对应「第四个结局：不归类」）

  const title = String(raw.title || '').trim().slice(0, MAX_TITLE_LEN)
  const content = String(raw.content || '').trim().slice(0, MAX_CONTENT_LEN)
  if (!title) return null
  if (content.length < MIN_CONTENT_LEN) return null

  // 同名去重：v1 不合并、不覆盖 —— 绝不碰用户可能手写过的同名词条
  const exists = (db[category] || []).some(i => (i.name || '').trim() === title)
  if (exists) return null

  return { category, title, content }
}

/**
 * 写入百科（供回合提取阶段调用）
 * @param {Array} rawItems 模型判出的百科条目 [{ title, category, content }]
 * @returns {number} 实际写入条数（0 表示全部被保守过滤掉，属正常）
 */
export function writeWikiItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return 0

  try {
    const { dbData } = useWikiData()
    const creator = currentUserName()
    let written = 0

    for (const raw of rawItems.slice(0, MAX_PER_ROUND)) {
      const item = normalize(raw, dbData.value)
      if (!item) continue
      dbData.value[item.category].push({
        id: generateUniqueId(),
        name: item.title,
        wiki: item.content,
        creator,
        time: getCurrentTimeString(),
        origin: 'crown' // 王冠代记：界面可据此区分，不稀释用户手写的内容
      })
      written++
    }
    return written
  } catch {
    // 写入失败绝不影响对话主流程
    return 0
  }
}
