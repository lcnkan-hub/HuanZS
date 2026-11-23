/**
 * 卡片文字的拆分积木（2026-11-23 取消标题系统）
 *
 * 职责：把一条记录拆成「加粗首行 + 正文预览」两段纯文本，只给列表卡片用。
 * 边界：不做渲染、不读存储。详情页走 markdown 渲染（utils/markdownParser），不经这里。
 *
 * 为什么需要它：
 *   标题字段（name）已经折进正文首行（`**标题**`），但**旧备份导入回来的记录**仍然
 *   只有 name、正文里没有那行加粗。所以「首行加粗」有两个来源，渲染层必须都认：
 *     1. `name` 非空（旧数据 / 旧备份 / 刚导入）→ 它自己就是首行；
 *     2. `name` 为空 → 看正文第一行是不是 `**…**`。
 *   两条都覆盖，用户在任何设备、任何版本的备份上都看到一样的一行粗字。
 */

/**
 * 去掉 markdown 记号，压成一行纯文本（给卡片预览用）。
 * 卡片是「扫一眼」的界面，不是阅读器：`##`、`**`、`-` 这些记号原样出现会读成乱码。
 */
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/[#>*`~_[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 拆出卡片的「加粗首行」和「正文预览」。
 * @param {{ name?: string, wiki?: string }} item 记录
 * @returns {{ lead: string, body: string }} lead 为空表示这条记录没有加粗首行
 */
export function splitCardText(item) {
  const name = String((item && item.name) || '').trim()
  const wiki = String((item && item.wiki) || '')

  if (name) return { lead: name, body: stripMarkdown(wiki) }

  // 正文首行就是 `**标题**`（迁移后的常态）。只认第一行、且只认成对 `**`，
  // 中间带 `*` 的行不算 —— 那多半是用户自己写的强调，不该被提成标题。
  const m = /^\s*\*\*([^*\n][^\n]*?)\*\*\s*(?:\n|$)/.exec(wiki)
  if (m) {
    return { lead: m[1].trim(), body: stripMarkdown(wiki.slice(m[0].length)) }
  }
  return { lead: '', body: stripMarkdown(wiki) }
}
