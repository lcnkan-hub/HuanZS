/**
 * 记录写入积木（王冠替用户记东西）
 * 职责：把「回合提取」阶段判出的动作，校验后落库；并向上游提供「已记了哪些」的清单
 * 边界：不改记录的单层数组结构（仅新增 origin 字段）；不做 UI
 *
 * 两种写入动作（2026-11-22 子词条功能下线后）：
 *   new    —— 新建一条记录
 *   append —— 往**已有**记录正文末尾追加，只加不改
 *
 * 2026-11-22：原来的第三种动作 child（往主记录下面挂子记录）已删除。
 * 子词条功能整体下线，王冠现在只能「读记录、新建记录、改记录正文」。
 * 连带清掉的地方（不清就会出现幽灵写入：王冠往用户看不见的子词条里追加内容）：
 *   - listWikiTitles 不再列子记录（否则模型会尝试 append 到子记录）
 *   - findByName 不再在 children 里找（否则 append 命中子记录）
 *   - normalize 不再产出 mode:'child'
 *
 * 保守底线不变：宁可漏记，也不让记录变垃圾桶。
 */
import { STORAGE_KEYS } from '../constants/categories'
import { readJSON } from '../services/storageAdapter'
import { getCurrentTimeString, generateUniqueId } from '../utils/uniqueId'
import { useRecords } from './useRecords'

const MAX_PER_ROUND = 5       // 单轮最多写几条：分层写入一轮要建父 + 挂几个子，上限比原来宽
export const MIN_CONTENT_LEN = 8 // 正文至少这么长才算「内容」，挡掉"好的""嗯嗯"
const MAX_TITLE_LEN = 40
const MAX_CONTENT_LEN = 4000  // 新建记录正文上限
const MAX_APPEND_LEN = 2000   // 单次追加上限

/** 取当前用户名当 creator —— 这样王冠记的内容也会出现在用户自己的「我创建的」里 */
function currentUserName() {
  // 走适配器（2026-11-24）：账号前缀与解析兜底都在 readJSON 里
  const profile = readJSON(STORAGE_KEYS.USER, {})
  return (profile && profile.name) || '我'
}

/**
 * 列出现有记录（标题级）
 * 供提取阶段喂给模型：它必须先知道库里有什么，才能判断「该新建 / 补进已有」。
 * 只给标题/日期/归属，不给正文 —— 控 Token。
 * 2026-11-22：不再列子记录（子词条下线）。返回结构里的 parent 字段保留但恒为空串，
 * 免得上游读取方（提取提示拼装）因为字段消失而崩。
 * @returns {Array<{ name, time, parent }>}
 */
export function listWikiTitles() {
  try {
    const { records } = useRecords()
    const out = []
    for (const item of (records.value || [])) {
      out.push({ name: (item.name || '').trim(), time: (item.time || '').split(' ')[0], parent: '' })
    }
    return out
  } catch {
    return [] // 读不到就当没有：不影响提取，只是模型无从判断该追加还是新建
  }
}

/** 按名字在主记录里找（2026-11-22：不再下钻 children） */
function findByName(list, name) {
  for (const item of (list || [])) {
    if ((item.name || '').trim() === name) return { item, isChild: false }
  }
  return null
}

/** 校验并归一化一条（不合格返回 null，一律丢弃、不猜不补） */
function normalize(raw, list) {
  if (!raw || typeof raw !== 'object') return null

  const title = String(raw.title || '').trim().slice(0, MAX_TITLE_LEN)
  const content = String(raw.content || '').trim()
  if (!title) return null

  const mode = raw.mode === 'append' ? 'append' : 'new'
  const body = content.slice(0, MAX_CONTENT_LEN)

  // —— 追加路径（名字逐字命中已有记录）——
  // 2026-11-22：模型若还按旧提示词返回 mode:'child'，这里会被归一成 'new'，
  // 内容保住、不再产生子词条（宁可多建一条，也不丢用户那句话）。
  if (mode === 'append') {
    const hit = findByName(list, title)
    if (hit) {
      const add = content.slice(0, MAX_APPEND_LEN)
      if (add.length < MIN_CONTENT_LEN) return null
      return { mode: 'append', target: hit.item, content: add }
    }
    // 找不到 → 落到下面新建，保住内容，别让用户白说一句
  }

  // —— 新建路径 ——
  if (body.length < MIN_CONTENT_LEN) return null
  if (findByName(list, title)) return null // 同名已存在 → 不重复建（不覆盖用户手写内容）
  return { mode: 'new', title, content: body }
}

/**
 * 写入记录（供回合提取阶段调用）
 * 数组**按顺序执行**：模型可以连续给多条 new，一次聊完一起落库。
 * @param {Array} rawItems 模型判出的动作 [{ mode, title, content }]（旧格式里的 category / parent 会被忽略）
 * @returns {number} 实际写入条数（0 表示全部被保守过滤掉，属正常）
 */
export function writeWikiItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return 0

  try {
    const { records } = useRecords()
    const creator = currentUserName()
    let written = 0

    for (const raw of rawItems.slice(0, MAX_PER_ROUND)) {
      const item = normalize(raw, records.value) // 每轮实时读：上一轮刚建的，这一轮要能命中
      if (!item) continue

      if (item.mode === 'append') {
        // 只加不改：保留原正文，追加内容另起一段
        const prev = (item.target.wiki || '').trimEnd()
        item.target.wiki = prev ? `${prev}\n\n${item.content}` : item.content
      } else {
        // 新建：**不再带 children 字段**（2026-11-22 子词条下线）；pics 给空数组保证形状统一
        records.value.push({
          id: generateUniqueId(),
          name: item.title,
          wiki: item.content,
          // 王冠只写文字、不能加图（2026-11-22 用户明确要求），
          // 但字段要补齐 —— 少了 pics 会让图片回收和卡片渲染都多判一次 undefined
          pics: [],
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
