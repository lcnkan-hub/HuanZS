/**
 * 检索挑选积木（2026-10-24 新增 · 第二批 A06）
 * 职责：在「相关优先」的前提下挑出**有限条**给提示词用，并把上限账记清楚
 * 边界：纯函数 —— 不读存储、不碰响应式、不调 API
 *
 * 它要解决的那笔账（A06）：
 *   每轮对话结束都要调一次提取 API，而提示里塞着「全部记忆正文 + 全部百科标题」。
 *   百科记到几百条以后，每一轮聊天都静默多付一份「全库清单」的钱，用户完全无感。
 *   这里把「塞什么」从「全部」改成「相关的 + 少量兜底」，并把条数/字符数交回给调用方记账。
 *
 * 为什么兜底不能省：
 *   只给「相关」的话，用户聊一件新事（库里一条都对不上）时，王冠手里会**空无一物**，
 *   于是每次都当新话题 —— 那比多付点 token 更糟。所以兜底是产品需要，不是妥协。
 */

import { buildQuery, scoreAgainst } from './textMatch'

/**
 * 相关优先挑选
 *
 * @param {Array} items 候选（调用方**先按"最近优先"排好**，兜底就取这个顺序）
 * @param {string} query 本轮用户输入
 * @param {object} opts
 *   limit     硬顶（无论相关多少，都不超过它）
 *   fill      兜底目标总数 —— 相关命中不足这个数时，按 incoming 顺序补（不是补 fill 条）
 *   minScore  相关门槛（按未折算的 raw 判）
 *   titleHit / bodyHit 打分权重
 *   getTitle / getBody 从 item 取字段（默认 title / body）
 * @returns {{ picked: Array, relevantCount: number, total: number }}
 */
export function pickRelevant(items, query, {
  limit = 15,
  fill = 3,
  minScore = 3,
  titleHit = 3,
  bodyHit = 1,
  getTitle = it => it.title || '',
  getBody = it => it.body || ''
} = {}) {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0) return { picked: [], relevantCount: 0, total: 0 }

  const q = buildQuery(query || '')
  const scored = list.map((item, index) => {
    const res = scoreAgainst(q, { title: getTitle(item), body: getBody(item) }, { titleHit, bodyHit })
    return { item, index, ...res }
  })

  const relevant = scored.filter(x => x.raw >= minScore).sort((a, b) => b.score - a.score)
  const picked = relevant.slice(0, limit).map(x => x.item)

  // 相关已经占满上限 → 兜底没位置，直接返回
  if (picked.length >= limit) return { picked, relevantCount: relevant.length, total: list.length }

  const target = Math.min(limit, Math.max(picked.length, fill))
  const room = target - picked.length
  const others = scored.filter(x => x.raw < minScore).sort((a, b) => a.index - b.index)

  return {
    picked: picked.concat(others.slice(0, room).map(x => x.item)),
    relevantCount: relevant.length,
    total: list.length
  }
}

/** 一行的粗略字符量（中文按 1 字 ≈ 1 token 量级估；验收只比"变少没"，不追精确） */
export function lineChars(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((n, l) => n + String(l || '').length + 1, 0)
}
