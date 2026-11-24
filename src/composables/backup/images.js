/**
 * 备份的「图片」层（2026-11-24 从 useBackup.js 拆出）
 *
 * 职责：把 IndexedDB 里的图片读成 base64（导出）、把备份里的 base64 整批写回（导入）。
 *
 * ⚠️ 顺序是这里唯一重要的事（A04）：
 *    旧实现是 `store.clear()` 之后逐条写、坏项直接 return —— 备份被截断或 base64 损坏时，
 *    图片库已经清空、文本已换代，界面却仍然报「导入完成」。用户以为全恢复了，
 *    其实图全没了，而且不可逆。
 *    现在的做法：**先整批验完、备好，再在一次事务里 clear + 全写**，要么整批成、要么整批不成。
 *
 * 报出的每个数字都必须是**真的**：written = 真写进库的，dropped = 因为坏而没进的。
 * 调用方拿它们如实报账，不许拿备份自己声称的条数充数。
 */
import { IMAGE_STORE_NAME, getImageDB, releaseAllImageUrls } from '../useImageStore'

/**
 * 打开图片库。
 * - node 环境没有 indexedDB → null（等于没有图片，正常降级）
 * - 浏览器里打不开 → **让错误往上抛**。宁可不导出，也不导一份「看起来成功、其实没图片」的备份。
 *   图片库半创建（有库没 store）的情况由 useImageStore.getImageDB 自愈。
 */
export async function openImageDb() {
  if (typeof indexedDB === 'undefined') return null
  return getImageDB()
}

export async function readAllImages() {
  const db = await openImageDb()
  if (!db) return [] // node / 无 IndexedDB → 无图片，不抛错
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readonly')
    const req = tx.objectStore(IMAGE_STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export function blobToBase64(blob) {
  if (typeof btoa === 'undefined') return ''
  return blob.arrayBuffer().then(buf => {
    const bytes = new Uint8Array(buf)
    const CHUNK = 0x8000
    let binary = ''
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
    }
    return btoa(binary)
  })
}

export function base64ToBlob(b64, mime) {
  if (typeof atob === 'undefined') return null
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

/** base64 的**形状**判据：不真的解码，所以有无 atob 的环境都算得出 */
export function isBase64Shape(s) {
  return typeof s === 'string' && s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s)
}

/**
 * 一条图片记录能不能安全落库（**A04 的核心判据，唯一出处**）。
 *
 * 为什么必须有这个函数：修之前，「导入前的校验」和「导入时的写入」是两套东西 ——
 * 校验只数条数，写入侧遇到坏项直接 `return` 跳过且不计数，于是坏数据导进来
 * 界面报的是「导入完成」。判据只写一次，两边都用它，这种分叉就不会再出现。
 *
 * @param {*} img 备份里的一条图片记录
 * @param {Set<string>} seenIds 已经见过的 id（用于抓重复）
 */
export function checkImageRecord(img, seenIds = new Set()) {
  if (!img || typeof img !== 'object' || Array.isArray(img)) {
    return { ok: false, reason: '这条记录不是一张图' }
  }
  if (typeof img.id !== 'string' || !img.id) {
    return { ok: false, reason: '缺图片 id（正文引用它靠的就是这个 id）' }
  }
  if (seenIds.has(img.id)) {
    return { ok: false, id: img.id, reason: '图片 id 重复（同一张图出现两次，只有一条能留下）' }
  }
  seenIds.add(img.id)
  if (typeof img.dataBase64 !== 'string' || !img.dataBase64) {
    return { ok: false, id: img.id, reason: '缺图片数据（正文里引用了它，导进来会是坏图）' }
  }
  if (!isBase64Shape(img.dataBase64)) {
    return { ok: false, id: img.id, reason: '图片数据不完整（不是合法 base64，多半是文件在传输里被截断）' }
  }
  return { ok: true, id: img.id }
}

/** 导入前的图片预检：只**数**、不碰任何存储 */
export function inspectImages(images) {
  const list = Array.isArray(images) ? images : []
  const seen = new Set()
  const issues = []
  list.forEach((img, index) => {
    const r = checkImageRecord(img, seen)
    if (!r.ok) issues.push({ index, id: r.id || (img && img.id) || '', reason: r.reason })
  })
  return { expected: list.length, damaged: issues.length, usable: list.length - issues.length, issues }
}

/**
 * 把备份里的图片写回库：先整批验完、备好，再动旧库（A04）。
 * @returns {Promise<{written:number, dropped:number, droppedDetail:Array, expected:number, unavailable?:boolean}>}
 */
export async function replaceAllImages(images) {
  const list = Array.isArray(images) ? images : []
  const seen = new Set()
  const records = []
  const droppedDetail = []

  // ① 先在内存里过一遍，决定「要写哪些、丢哪些」——这一步不碰存储
  list.forEach((img, index) => {
    const check = checkImageRecord(img, seen)
    if (!check.ok) {
      droppedDetail.push({ index, id: check.id || '', reason: check.reason })
      return
    }
    let blob = null
    try { blob = base64ToBlob(img.dataBase64, img.mime) } catch { blob = null }
    if (!blob) {
      // 环境解不开（node 没有 atob/Buffer）不算「数据坏」，但也不能假装写成功了
      droppedDetail.push({ index, id: img.id, reason: '当前环境解不开图片数据' })
      return
    }
    records.push({ id: img.id, blob, mime: img.mime || '', name: img.name || '', time: img.time || Date.now() })
  })

  const db = await openImageDb()
  // node / 无 IndexedDB：**什么都不动**（旧实现在这里返回 0，却已经把「文本已换代」报成成功）
  if (!db) {
    return { written: 0, dropped: droppedDetail.length, droppedDetail, expected: list.length, unavailable: true }
  }

  // 旧 blob URL 必须清掉：这批图已经整批换过，旧 URL 指向的数据已经没了
  //（不清的话，页面上正在显示的图会变成坏图 / 读到已删数据）
  try { releaseAllImageUrls() } catch { /* 忽略 */ }

  // ② 再动库：一次事务里 clear + 全部写入，要么整批成，要么整批不成
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IMAGE_STORE_NAME)
    store.clear()
    records.forEach(r => store.put(r))
    tx.oncomplete = () => resolve({
      written: records.length,
      dropped: droppedDetail.length,
      droppedDetail,
      expected: list.length
    })
    tx.onerror = () => reject(tx.error || new Error('图片写入事务失败'))
    tx.onabort = () => reject(tx.error || new Error('图片写入事务被中止'))
  })
}

export async function countImages() {
  const db = await openImageDb()
  if (!db) return 0
  return new Promise(resolve => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readonly')
    const req = tx.objectStore(IMAGE_STORE_NAME).count()
    req.onsuccess = () => resolve(req.result || 0)
    req.onerror = () => resolve(0)
  })
}
