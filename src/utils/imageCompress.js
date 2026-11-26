/**
 * 图片压缩积木（2026-11-25 · 多图添加配套）
 *
 * 职责：图片进库**之前**，把手机照片压到「全屏看仍清楚、长期存不心疼」的尺寸。
 * 边界：不碰图库、不碰记录、不碰旧图 —— 旧图永远不经过这里（RULES 第 9 条）。
 *
 * 为什么只有 JPEG/HEIC 会被压：
 *   · PNG 可能带透明、WebP/GIF 可能是动图 —— 转成 JPEG 会把透明压成白底、把动画压没，
 *     这类文件原样入库比"省一点空间"重要；
 *   · 手机相册里的照片绝大多数是 JPEG / HEIC，恰好是体积最大的那批。
 *
 * 阈值（用户 2026-11-25 定的规则）：
 *   · 长边 2048px：390pt 宽 @3x ≈ 1170px，2048 足够全屏与分享；
 *   · JPEG q=0.82：肉眼几乎无损，一张手机照片约 300–800KB；
 *   · 原图 ≤1.5MB 且长边 ≤2048 时**不重压**，避免二次损失。
 *
 * 失败兜底：解码失败（异常 HEIC / 损坏文件）或编码失败，一律返回**原图** ——
 * 压不了可以慢，但不能因为压不了就丢图。
 */

export const IMAGE_MAX_EDGE = 2048
export const IMAGE_QUALITY = 0.82
export const IMAGE_SKIP_BYTES = 1.5 * 1024 * 1024

/** 只有这几种类型参与压缩（JPEG 系） */
const COMPRESSIBLE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/heic',
  'image/heif'
])

/** 文件扩展名兜底：某些 Android 相机/文件选择器不给 MIME */
const COMPRESSIBLE_EXT = /\.(jpe?g|heic|heif)$/i
/** 判断「这是不是一张图」用的扩展名（含不压缩的格式） */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i

/**
 * 这个文件是不是图片（type 优先，空 type 时看扩展名）。
 * 用途：多选时把用户误选进来的非图片文件挡掉，而不是让 saveImage 存一个坏 blob。
 */
export function isImageFile(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  return IMAGE_EXT.test(String(file.name || ''))
}

/**
 * 这个文件是否属于「可以转 JPEG」的类型。
 * ⚠️ 返回 true 只代表"值得尝试"，不代表解码一定成功 —— 失败由 prepareImage 兜回原图。
 */
export function isCompressibleFile(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (type) {
    if (COMPRESSIBLE_TYPES.has(type)) return true
    if (type.startsWith('image/')) return false
  }
  return COMPRESSIBLE_EXT.test(String(file.name || ''))
}

/**
 * 等比缩到长边不超过 maxEdge（**纯函数**，可脱离浏览器单测）。
 * 小图不放大；宽高非法时原样返回，交给调用方决定"保留原图"。
 * @returns {{width:number, height:number, scale:number}}
 */
export function targetSize(width, height, maxEdge = IMAGE_MAX_EDGE) {
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (!w || !h || !maxEdge) return { width: w, height: h, scale: 1 }
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale
  }
}

/**
 * 需不需要压（**纯函数**）。判据有两条，满足一条就压：
 *   1. 长边超过 maxEdge（尺寸问题）；
 *   2. 文件超过 skipBytes（体积问题）。
 * 类型不是 JPEG 系、或宽高读不出来（解码失败）→ 不压，保留原图。
 */
export function shouldCompress(file, width, height, options = {}) {
  if (!isCompressibleFile(file)) return false
  if (!width || !height) return false
  const maxEdge = Number(options.maxEdge) || IMAGE_MAX_EDGE
  const skipBytes = Number.isFinite(options.skipBytes) ? options.skipBytes : IMAGE_SKIP_BYTES
  const { scale } = targetSize(width, height, maxEdge)
  const overEdge = scale < 1
  const overBytes = (Number(file.size) || 0) > skipBytes
  return overEdge || overBytes
}

/** 压缩后的文件名：统一 .jpg（原扩展名不保留，避免"名字是 HEIC、内容是 JPEG"） */
export function compressedName(name) {
  const raw = String(name || '').trim()
  const base = raw.replace(/\.[^./\\]+$/, '') || 'image'
  return base + '.jpg'
}

/**
 * 解码：优先 createImageBitmap（带 EXIF 方向），失败再退回 <img>。
 * 返回的 close 必须被调用 —— ImageBitmap 不 close 会一直占着解码后的像素内存。
 */
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: 'from-image' 让手机竖拍的照片按 EXIF 转正，不然会被压成横的
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => { try { bitmap.close() } catch { /* 已关闭 */ } }
      }
    } catch { /* 换成 <img> 再试一次 */ }
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('当前环境不能解码图片')
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('图片解码失败'))
      img.src = url
    })
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    if (!width || !height) throw new Error('图片尺寸读不出来')
    return {
      source: img,
      width,
      height,
      close: () => { try { URL.revokeObjectURL(url) } catch { /* 已释放 */ } }
    }
  } catch (e) {
    try { URL.revokeObjectURL(url) } catch { /* 已释放 */ }
    throw e
  }
}

/** 把 source 画进一块指定尺寸的画布，并编码成 JPEG */
async function encodeOnCanvas(canvas, source, width, height, quality) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画布不可用')

  // JPEG 没有透明通道：先铺白，避免带 alpha 的 HEIC 被压成黑底
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)

  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('压缩失败'))),
      'image/jpeg',
      quality
    )
  })
}

/** 编码成 JPEG：优先 OffscreenCanvas（不占 DOM），失败再退回 <canvas> */
async function encodeJpeg(source, width, height, quality) {
  if (typeof OffscreenCanvas === 'function') {
    try {
      const off = new OffscreenCanvas(width, height)
      const blob = await encodeOnCanvas(off, source, width, height, quality)
      // 有的实现会忽略 type 返回 PNG；那种结果不能当 JPEG 存（名字是 .jpg、内容不是）
      if (blob && blob.size && /^image\/jpe?g$/i.test(blob.type)) return blob
    } catch { /* 某些 WebView 的 OffscreenCanvas 是半成品，走下面的 DOM canvas */ }
  }

  if (typeof document === 'undefined') throw new Error('当前环境不能压缩图片')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const blob = await encodeOnCanvas(canvas, source, width, height, quality)
  if (!blob || !blob.size || !/^image\/jpe?g$/i.test(blob.type)) throw new Error('编码结果不是 JPEG')
  return blob
}

/** 把编码结果包成 File（saveImage 会读 name；File 不可用时退化成带 name 的 Blob） */
function toOutputFile(blob, name) {
  const outName = compressedName(name)
  if (typeof File === 'function') {
    try {
      return new File([blob], outName, { type: 'image/jpeg', lastModified: Date.now() })
    } catch { /* 某些 WebView 的 File 构造受限 */ }
  }
  try { blob.name = outName } catch { /* Blob 不可扩展就保持无名 */ }
  return blob
}

/**
 * 压一张图（浏览器 API）。
 * 不满足压缩条件、或压完反而更大 → 原样返回（文件字节一个没动）。
 *
 * @returns {Promise<{blob: Blob|File, width:number, height:number, compressed:boolean,
 *                    originalBytes?:number, bytes?:number}>}
 */
export async function compressImage(file, options = {}) {
  if (!file) throw new Error('没有文件')
  const maxEdge = Number(options.maxEdge) || IMAGE_MAX_EDGE
  const quality = Number(options.quality) || IMAGE_QUALITY
  const decoded = await decodeImage(file)

  try {
    const { width, height } = decoded
    if (!shouldCompress(file, width, height, { maxEdge, skipBytes: options.skipBytes })) {
      return { blob: file, width, height, compressed: false }
    }

    const target = targetSize(width, height, maxEdge)
    const jpeg = await encodeJpeg(decoded.source, target.width, target.height, quality)
    if (!jpeg || !jpeg.size) throw new Error('压缩结果为空')
    // 极少数图（原图已经高度压缩）重编码后反而更大：留原图，别让"压缩"变成增容
    if (file.size && jpeg.size >= file.size * 0.98) {
      return { blob: file, width, height, compressed: false }
    }

    return {
      blob: toOutputFile(jpeg, file.name),
      width: target.width,
      height: target.height,
      compressed: true,
      originalBytes: file.size,
      bytes: jpeg.size
    }
  } finally {
    decoded.close()
  }
}

/**
 * 加图前统一走这里：能压就压，压不了就原图。
 * **绝不抛错**给调用方 —— 单张失败不能打断整批添加。
 */
export async function prepareImage(file, options = {}) {
  if (!isImageFile(file)) return file
  if (!isCompressibleFile(file)) return file
  if (!file.size) return file
  try {
    const result = await compressImage(file, options)
    return result.blob
  } catch {
    return file
  }
}
