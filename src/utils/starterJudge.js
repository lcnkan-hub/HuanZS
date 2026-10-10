/**
 * 空库开局判据（纯函数，无副作用、不碰存储 —— 能脱离界面单测）
 *
 * 两件事：
 *   ① 这个分类是不是「真的一条都没有」—— 必须和「搜索没搜到」分开：
 *      搜不到只是过滤结果为空，这时候弹开局卡片是错的（用户明明有一堆条目）
 *   ② 用户的回答怎么变成一条能落库的词条
 *
 * 配置：constants/starter.js（问句/文案的唯一出口）
 */
import { STARTER_CARDS, STARTER_TITLE_MAX, STARTER_MIN_ANSWER_LEN } from '../constants/starter'
import { MIN_CONTENT_LEN } from '../composables/useWikiWriter'

/** 该 tab 是不是合法分类（卡片只对三个内容分类有效） */
export function isStarterTab(tab) {
  return STARTER_CARDS.some(c => c.tab === tab)
}

/** 某个分类是不是真的一条都没有（不是「过滤后为空」） */
export function isCategoryEmpty(db, tab) {
  if (!db || !isStarterTab(tab)) return false
  const list = db[tab]
  return Array.isArray(list) && list.length === 0
}

/** 三个内容分类是不是都空（「整库空」——比单分类空更值得引导） */
export function isLibraryEmpty(db) {
  if (!db) return false
  return STARTER_CARDS.every(c => isCategoryEmpty(db, c.tab))
}

/** 取某分类的开局问句；非法 tab 返回空串 */
export function starterQuestion(tab) {
  const hit = STARTER_CARDS.find(c => c.tab === tab)
  return hit ? hit.question : ''
}

/**
 * 标题 = 原话第一句（换行 / 句末标点处断），超长截断。不调模型 —— 第一天就要密钥才用得了，等于没用。
 *
 * ⚠️ **不在逗号处断**：标题还兼着 useWikiWriter 的「同名去重」职责，
 *   若在逗号处断，「在学 vue」和「在学 vue，还学了 node」会撞成同名 → 后一句被静默丢弃。
 *   断得少一点，少丢一点内容。
 */
export function entryTitle(content) {
  const text = String(content || '').trim()
  if (!text) return ''
  const first = (text.split(/[\n\r。！？!?；;]/)[0] || '').trim() || text
  return first.length > STARTER_TITLE_MAX ? first.slice(0, STARTER_TITLE_MAX) : first
}

/**
 * 把用户对开局问句的回答变成一条能落库的动作；造不出来返回 null（不硬凑）。
 *
 * ⚠️ 为什么短回答要带上问句：useWikiWriter 有 MIN_CONTENT_LEN 下限（挡「好的」「嗯嗯」用的），
 * 而开局这一条偏偏最可能很短（「原神」两个字）。被那道关挡掉的话，用户答完会发现什么都没发生 ——
 * 开局第一条失败，是这个功能最不能出的错。所以：够长的保持原样干净，太短的就补成问答形态。
 */
export function buildStarterEntry(text, tab) {
  const answer = String(text || '').trim()
  const question = starterQuestion(tab)
  if (!answer || !question) return null

  // 一个字不成话（「嗯」「好」）→ 不落库。补上问句虽然能过长度关，但那是塞垃圾（见 STARTER_MIN_ANSWER_LEN）
  if (answer.length < STARTER_MIN_ANSWER_LEN) return null

  const title = entryTitle(answer)
  if (!title) return null

  const qa = `问：${question}\n答：${answer}`
  const content = answer.length >= MIN_CONTENT_LEN ? answer : qa

  return { mode: 'new', title, category: tab, content }
}
