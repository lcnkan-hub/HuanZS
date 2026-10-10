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
import { getImageUrl } from '../composables/useImageStore'

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
 * 异步渲染（带 IndexedDB 图片解析）
 * 调用方需要用 v-html 渲染后，再调用此方法替换 id:// 图片
 *
 * @param {string} html 已渲染的 HTML 字符串
 * @returns {Promise<string>} 替换了 id:// 的 HTML
 */
export async function resolveImagesAsync(html) {
  const regex = /data-img-src="id:\/\/(img-[0-9a-z_]+)"/g
  const promises = []
  const replacements = []

  let match
  while ((match = regex.exec(html)) !== null) {
    const id = match[1]
    const fullMatch = match[0]
    promises.push(
      getImageUrl(id).then(blobUrl => {
        if (blobUrl) {
          replacements.push({ from: fullMatch, to: `src="${blobUrl}" data-img-src="id://${id}"` })
        }
      })
    )
  }

  await Promise.all(promises)

  let result = html
  replacements.forEach(r => {
    result = result.replace(r.from, r.to)
  })
  return result
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
  // IndexedDB 图片引用
  if (/^id:\/\/img-\d+$/.test(trimmed)) return trimmed
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
