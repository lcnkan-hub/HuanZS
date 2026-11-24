/**
 * 记录形状的纯函数（2026-11-24 从 useRecords.js 拆出）
 *
 * 共同点：**不碰存储、不碰响应式、不改入参** —— 给一个新数组就返回一个新数组。
 * 正因为纯，导出/导入/迁移三条路都能复用同一份判据，形状才不会各走各的。
 * （这是 2026-11-22 那几次「盘上、文件里、导回来三处形状不一致」的教训）
 */
import { extractImageIds } from '../useImageStore'

/**
 * 剥掉记录上的 `children` 字段（纯函数，不改入参）。
 * 2026-11-22 子词条功能下线：只留 { id, name, wiki, creator, time, origin }。
 * 导出/导入两处也复用它，保证「盘上、文件里、导回来」三处形状一致。
 */
export function stripChildren(list) {
  if (!Array.isArray(list)) return list
  return list.map(item => {
    if (!item || typeof item !== 'object') return item
    const rest = { ...item }
    delete rest.children
    return rest
  })
}

/**
 * 从正文里剥掉图片引用，返回干净的纯文字（纯函数）。
 * 2026-11-22 图片改为附件存储（`pics` 字段）后，正文里不该再有 `![alt](id://xxx)`。
 * 同时收掉删行留下的一串空行 —— 否则正文会出现大段空白。
 */
export function stripPicsFromWiki(wiki) {
  if (!wiki) return ''
  return String(wiki)
    .replace(/!\[[^\]]*\]\(id:\/\/[^)]+\)/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 把记录数组规整成「图片附件化」形状（纯函数，不改入参）。
 *
 * 用在哪：备份的**导入 / 恢复**路径。老备份文件里图片还写在正文里（`![alt](id://xxx)`），
 * 直接写回去就绕过了启动时的迁移，等于让「图在正文里」这个旧形态从备份里复活。
 * 新备份已经带 pics，这里只做形状校验。
 *
 * 与 migratePicsOutOfWiki 的区别：那个改 records.value 并落盘，这个只返回新数组。
 */
export function normalizePics(list) {
  if (!Array.isArray(list)) return list
  return list.map(item => {
    if (!item || typeof item !== 'object') return item
    const wiki = item.wiki || ''
    const explicit = Array.isArray(item.pics)
      ? item.pics.filter(pid => typeof pid === 'string' && pid)
      : []
    const fromBody = [...extractImageIds(wiki)]
    const merged = explicit.slice()
    fromBody.forEach(id => { if (!merged.includes(id)) merged.push(id) })
    // 只有真从正文里抽到东西才改正文 —— 否则会把新格式的正文平白 trim 一遍
    return { ...item, wiki: fromBody.length ? stripPicsFromWiki(wiki) : wiki, pics: merged }
  })
}

/**
 * 把「标题」并进正文首行并加粗（2026-11-23 取消标题系统，纯函数）。
 *
 * 为什么不是直接渲染 name：改完之后标题要**可编辑**，而编辑态的载体是正文 textarea。
 * 只有把标题写进 wiki，用户才能改它；留在 name 字段里就永远改不了了。
 *
 * 幂等：正文已经以 `**标题**` 开头时原样返回，重复调用不会叠出两个标题。
 */
export function foldTitleIntoBody(wiki, name) {
  const title = String(name || '').trim()
  if (!title) return String(wiki || '')
  const body = String(wiki || '')
  const head = `**${title}**`
  if (body.startsWith(head)) return body
  return body ? `${head}\n\n${body}` : head
}
