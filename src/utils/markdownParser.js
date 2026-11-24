/**
 * 轻量级纯前端 Markdown 编译器
 * 支持：标题(#)、加粗(**)、行内代码(`)、自定义颜色标签、图片(![alt](url))
 * 含 XSS 防御注入
 *
 * 图片语法：
 *   标准格式：![描述](id://img-xxx)  — 从 IndexedDB 加载
 *   标准格式：![](https://...)       — 外部链接（仅渲染，不过滤）
 *   编辑态插入时自动生成 id:// 引用
 */
import { IMAGE_ID_SOURCE, isImageId } from './imageId'

/**
 * 异步渲染 Markdown → HTML（支持图片异步加载）
 * 用于阅读模式等需要完整渲染的场景
 */
export function renderMarkdownToHtml(text) {
  if (!text || !text.trim()) {
    return `<p class="empty-render-placeholder">💡 此条目尚无百科正文描述。<br/>如果是你创建的，可点击右上角<b>"编辑"</b>，利用手机快捷工具栏为它增色吧！</p>`
  }

  // 1. 防御注入：优先全量转义
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 2. 局部安全还原自定义颜色标签和图片标签
  html = html.replace(/&lt;blue&gt;(.*?)&lt;\/blue&gt;/gim, '<span class="m-color-blue">$1</span>')
  html = html.replace(/&lt;brown&gt;(.*?)&lt;\/brown&gt;/gim, '<span class="m-color-brown">$1</span>')
  html = html.replace(/&lt;green&gt;(.*?)&lt;\/green&gt;/gim, '<span class="m-color-green">$1</span>')

  // 3. 图片语法 — 先转为占位符，避免后续语法转译破坏 URL
  // 匹配 ![alt](url) — URL 可能包含 :// 等特殊字符
  const imgPlaceholders = []
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, (match, alt, url) => {
    // 防御：仅允许 safe URL 通过
    const safeUrl = sanitizeUrl(url)
    if (safeUrl) {
      const idx = imgPlaceholders.length
      imgPlaceholders.push({ alt, url: safeUrl })
      return `__IMG_PLACEHOLDER_${idx}__`
    }
    return match // 不合法的 URL 保持原样
  })

  // 4. 基础语法转译
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')
  html = html.replace(/`(.*?)`/gim, '<code class="md-inline-code">$1</code>')
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
  html = html.replace(/\n/gim, '<br />')

  // 5. 还原图片占位符
  imgPlaceholders.forEach((img, idx) => {
    const escapedAlt = escapeAttr(img.alt || '图片')
    html = html.replace(
      `__IMG_PLACEHOLDER_${idx}__`,
      `<img src="${escapeAttr(img.url)}" alt="${escapedAlt}" class="md-image" loading="lazy" data-img-src="${img.url}" />`
    )
  })

  return html
}

/**
 * 异步渲染（把 id:// 引用换成真实 blob URL）
 *
 * 2026-11-24 改为**注入式**：不再 import 图片库，由调用方把「id → url」的取法传进来。
 * 为什么：utils 层混进 composables/useImageStore 之后，这个纯解析模块在 node 里
 * 没法单独跑（要先备 IndexedDB 替身），也没法换一种图片来源（比如以后走云端 CDN）。
 * 不传 resolveImage 就直接返回原 HTML —— 宁可图不显示，也不假装成功。
 *
 * @param {string} html 已渲染的 HTML 字符串
 * @param {(id: string) => Promise<string|null>|string|null} resolveImage 取图片 URL 的函数
 * @returns {Promise<string>} 替换了 id:// 的 HTML
 */
export async function resolveImagesAsync(html, resolveImage) {
  if (typeof resolveImage !== 'function') return html
  const refs = findImageRefsInHtml(html)
  const done = new Map()

  await Promise.all(refs.map(ref => Promise.resolve(resolveImage(ref.id)).then(blobUrl => {
    if (blobUrl) done.set(ref.full, withBlobSrc(ref.full, blobUrl))
  }).catch(() => { /* 单张图取不到不影响其余 */ })))

  let result = html
  done.forEach((to, from) => {
    result = result.replace(from, to)
  })

  return result
}

/**
 * 从 HTML 里找出所有 id:// 图片引用
 * @param {string} html 已渲染的 HTML
 * @returns {{full: string, id: string}[]} 整个 <img> 标签 + 图片 id
 */
export function findImageRefsInHtml(html) {
  // RegExp 构造函数里斜杠**不需要转义** —— 一律不写 \/ ，免得被二次转义成 \\/ 之后
  // 整个正则去匹配"反斜杠+斜杠"、永远匹配不到（2026-10-10 就在这一行死过一轮）。
  // 匹配整个 <img> 标签（不是只匹配属性）：替换时要连 src 一起换掉，见 withBlobSrc。
  const regex = new RegExp('<img[^>]*data-img-src="id://(' + IMAGE_ID_SOURCE + ')"[^>]*>', 'gi')
  const out = []
  let m
  while ((m = regex.exec(html)) !== null) out.push({ full: m[0], id: m[1] })
  return out
}

/**
 * 把 <img> 标签里的 src 换成 blob URL（**纯函数**，单独可测）。
 *
 * ⚠️ 这里曾经是「在 data-img-src 前面插一段 src=…」，结果标签里出现**两个 src**，
 *    浏览器只认第一个（还是 id:// 那个）→ 图片依然是坏的，而且不报任何错。
 *    2026-10-10 在真浏览器里查实（当时 img 上确实同时挂着两个 src）。
 *    所以必须**换掉**原来的 src，而不是再加一个。
 */
export function withBlobSrc(tag, blobUrl) {
  if (/\ssrc="[^"]*"/.test(tag)) return tag.replace(/\ssrc="[^"]*"/, ' src="' + blobUrl + '"')
  return tag.replace('<img', '<img src="' + blobUrl + '"')
}

/**
 * URL 安全过滤
 * 仅允许：id:// 协议（IndexedDB 图片）、https://、http://、相对路径
 */
function sanitizeUrl(url) {
  if (!url) return null
  const trimmed = url.trim()
  // 拒绝包含 HTML 特殊字符的 URL，防属性注入
  if (/["'<>]/.test(trimmed)) return null
  // IndexedDB 图片引用 —— id 形态统一走 IMAGE_ID_SOURCE（唯一出处）。
  // ⚠️ 这里曾经写死 `^id:\/\/img-\d+$`，而真实 id 含字母 → 一律被判"不合法 URL"，
  //    正文里的图片被当成普通文字原样输出，**连 <img> 都生成不出来**（2026-10-10 真浏览器查实）。
  if (/^id:\/\//.test(trimmed) && isImageId(trimmed.slice('id://'.length))) return trimmed
  // HTTPS / HTTP
  if (/^https?:\/\/.+/.test(trimmed)) return trimmed
  // 相对路径
  if (/^\.\.?\/.+/.test(trimmed)) return trimmed
  return null
}

/** 转义 HTML 属性值 */
function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
