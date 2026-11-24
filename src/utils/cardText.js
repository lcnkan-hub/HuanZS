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
 * 去掉 markdown 记号，**保留换行**（给卡片预览用）。
 *
 * 2026-11-23 修：原来把 `\s+` 全压成空格，用户分了行的正文在卡片上变成一长条 ——
 * 详情里三行、卡片里一行，看着像"内容被吞了"。现在只压空格与多余空行，
 * 单换行留着，由卡片的 `white-space: pre-line` 还原成真实的行。
 */
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/[#>*`~_[\]()!-]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * 取正文的**第一段**（给卡片用）。
 *
 * 2026-11-23 修：原来把整段压成一行（`\s+ → ' '`），用户分了段的正文在卡片上变成一长条 ——
 * 「我想起来了 / 想起来什么了 / nonono~」三行被拍成一行。卡片应该只取第一段：
 * 到第一个空行为止，太长再截断。
 */
export function firstParagraph(wiki) {
  const text = String(wiki || '')
  const firstBlock = text.split(/\n\s*\n/)[0] || ''
  return stripMarkdown(firstBlock)
}

/**
 * 拆出卡片的「加粗首行」和「正文预览」。
 * @param {{ name?: string, wiki?: string }} item 记录
 * @returns {{ lead: string, body: string }} lead 为空表示这条记录没有加粗首行
 */
export function splitCardText(item) {
  const name = String((item && item.name) || '').trim()
  const wiki = String((item && item.wiki) || '')

  if (name) return { lead: name, body: firstParagraph(wiki) }

  // 正文首行就是 `**标题**`（迁移后的常态）。只认第一行、且只认成对 `**`，
  // 中间带 `*` 的行不算 —— 那多半是用户自己写的强调，不该被提成标题。
  const m = /^\s*\*\*([^*\n][^\n]*?)\*\*\s*(?:\n|$)/.exec(wiki)
  if (m) {
    return { lead: m[1].trim(), body: firstParagraph(wiki.slice(m[0].length)) }
  }
  return { lead: '', body: firstParagraph(wiki) }
}
