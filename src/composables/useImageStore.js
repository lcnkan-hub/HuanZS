/**
 * 图片存储积木 — IndexedDB 图片仓库
 *
 * 解决的问题：
 * - 图片不转 Base64（避免 localStorage 爆炸）
 * - 图片存 IndexedDB，生成持久化 blob URL
 * - 刷新页面后图片依然可访问
 * - 支持增删查，统一用 id://img-xxx 引用
 *
 * 用法：
 *   const { saveImage, getImageUrl, deleteImage, dropUnused } = useImageStore()
 *   const id = await saveImage(file)           // 返回 'img-1700000000123'
 *   const url = await getImageUrl('img-xxx')   // 返回 blob:http://...
 *   <img :src="url" />
 */
const DB_NAME   = 'huan_zhong_shu_images'
const DB_VERSION = 1
const STORE_NAME = 'images'

// 导出库名与 store 名：备份积木要直接操作同一个库，别在别处硬编码（防漂移）
export const IMAGE_DB_NAME = DB_NAME
export const IMAGE_STORE_NAME = STORE_NAME

/**
 * 图片 id 的合法形态 —— **全项目唯一出处**。
 *
 * ⚠️ saveImage 生成的是 `img-<base36 时间戳>_<序号>`，**含字母**，所以绝不能写成 `img-\d+`。
 * 2026-10-10 查清：因为「id 形态」被三处各写各的、且三处都错写成 `img-\d+`，
 * 图片在**编辑器预览**（extractImageIds）、**正文渲染**（sanitizeUrl 放行）、
 * **URL 替换**（resolveImagesAsync）三条路上全部静默失效 —— 一张图都显示不出来。
 * 以后新增任何用到图片 id 的地方，一律 import 这里，别再手写正则。
 * 同时兼容更早数据里的纯数字 id。
 */
export const IMAGE_ID_SOURCE = 'img-[0-9a-z_]+'

/** 判断一个字符串是不是合法图片 id */
export function isImageId(value) {
  return new RegExp('^' + IMAGE_ID_SOURCE + '$').test(String(value || ''))
}

let _imgCounter = 0
let dbPromise = null

/**
 * 打开图片库 —— 全项目唯一入口（备份积木也走这里，别在别处再写一个 open）。
 *
 * 自愈：DB 存在但缺少 images store（半创建 / 异常残留）时会**关掉重建**。
 * 不修的话事务会直接抛 `One of the specified object stores was not found`，
 * 把「导出备份」整条打死在原始英文报错上（2026-10-10 真浏览器实测踩到）。
 * 重建不丢数据 —— 缺 store 本身就说明里面没有图片。
 */
export function getImageDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = (e) => {
      const db = e.target.result
      if (db.objectStoreNames.contains(STORE_NAME)) { resolve(db); return }
      db.close()
      const del = indexedDB.deleteDatabase(DB_NAME)
      const retry = () => { dbPromise = null; getImageDB().then(resolve, reject) }
      del.onsuccess = retry
      del.onerror = retry
      del.onblocked = () => { dbPromise = null; reject(new Error('图片库被占用，关掉其它页面再试')) }
    }
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function openDB() {
  return getImageDB()
}

/**
 * 保存图片到 IndexedDB
 * @param {File|Blob} file 图片文件
 * @returns {Promise<string>} 图片 ID，如 'img-1700000000123'
 */
export async function saveImage(file) {
  const db  = await openDB()
  const id  = 'img-' + Date.now().toString(36) + '_' + (_imgCounter++)
  return new Promise((resolve, reject) => {
    const tx     = db.transaction(STORE_NAME, 'readwrite')
    const store  = tx.objectStore(STORE_NAME)
    const record = { id, blob: file, mime: file.type, name: file.name, time: Date.now() }
    store.add(record)
    tx.oncomplete = () => resolve(id)
    tx.onerror    = () => reject(tx.error)
  })
}

/**
 * 获取图片的 blob URL
 * @param {string} id 图片 ID
 * @returns {Promise<string|null>} blob URL 或 null
 */
const _urlCache = new Map()
export async function getImageUrl(id) {
  // 复用缓存的 blob URL，避免泄漏
  if (_urlCache.has(id)) return _urlCache.get(id)
  try {
    const db  = await openDB()
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req   = store.get(id)
      req.onsuccess = () => {
        const record = req.result
        if (record && record.blob) {
          const blobUrl = URL.createObjectURL(record.blob); _urlCache.set(id, blobUrl); resolve(blobUrl)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

/** 释放某张图缓存的 blob URL（不释放会一直占内存，blob 也不会被回收） */
export function releaseImageUrl(id) {
  const url = _urlCache.get(id)
  if (!url) return
  try { URL.revokeObjectURL(url) } catch { /* 忽略 */ }
  _urlCache.delete(id)
}

/** 清空全部缓存 URL。导入 / 整库替换之后必须调用 —— 那批 blob 已经换了，旧 URL 指向已删数据 */
export function releaseAllImageUrls() {
  _urlCache.forEach(url => { try { URL.revokeObjectURL(url) } catch { /* 忽略 */ } })
  _urlCache.clear()
}

/**
 * 删除单张图片（同时释放它的 blob URL）
 * @param {string} id 图片 ID
 * @returns {Promise<boolean>}
 *
 * 2026-10-10 修：旧实现在 Promise 里只挂 tx1.oncomplete 去开 tx2，**从头到尾没调过 resolve()**
 * —— 谁 await 它谁永久挂死；且 tx2 的错误无人接、blob URL 也没释放。改成单事务 + 明确 resolve。
 */
export async function deleteImage(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => { releaseImageUrl(id); resolve(true) }
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('删除事务被中止'))
  })
}

/**
 * 该不该拒绝这次清理（**纯函数**，单独可测）。
 * 「引用集合是空的、但库里还有图」这个组合几乎一定是调用方漏算了引用 —— 照常执行就是清空图片库。
 */
export function shouldRefuseDrop(usedCount, storeCount, allowEmptyRefs = false) {
  if (allowEmptyRefs) return false
  if (!Number.isFinite(usedCount) || !Number.isFinite(storeCount)) return true
  return usedCount === 0 && storeCount > 0
}

/**
 * 清理未被任何文档引用的图片。
 * @param {Set<string>} usedIds 当前文档中引用的所有图片 ID
 * @param {{allowEmptyRefs?: boolean}} options 真要把库清空时才传 allowEmptyRefs
 * @returns {Promise<{refused:boolean, reason?:string, deleted?:number, storeCount?:number}>}
 *
 * ⚠️ 本文件最危险的函数：调用方把「引用集合」算错就会把用户所有图片清掉。
 * 所以加硬闸门（类型必须对 + 空引用且库非空直接拒绝），并**返回结果而不是静默 void**。
 */
export async function dropUnused(usedIds, options = {}) {
  if (!(usedIds instanceof Set)) {
    return { refused: true, reason: 'usedIds 必须是 Set（拿到别的东西说明调用方算引用集合的方式错了）' }
  }
  const db = await openDB()
  const allIds = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAllKeys()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })

  if (shouldRefuseDrop(usedIds.size, allIds.length, !!options.allowEmptyRefs)) {
    return {
      refused: true,
      storeCount: allIds.length,
      reason: '引用集合是空的，但库里还有 ' + allIds.length + ' 张图 —— 拒绝执行（这几乎一定是调用方漏算了引用）'
    }
  }

  const doomed = allIds.filter(id => !usedIds.has(id))
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    doomed.forEach(id => store.delete(id))
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  doomed.forEach(releaseImageUrl)
  return { refused: false, deleted: doomed.length, storeCount: allIds.length }
}

/**
 * 从 Markdown 文本中提取所有引用的图片 ID
 * 匹配 ![任意文字](id://img-xxx) 格式
 *
 * id 形态用 IMAGE_ID_SOURCE（唯一出处）—— 这里曾经手写 `img-\d+`，
 * 而真实 id 含字母，于是一个都匹配不到、编辑器图片预览永远是空的（2026-10-10）。
 */
export function extractImageIds(markdown) {
  const ids   = new Set()
  const regex = new RegExp('!\\[.*?\\]\\(id://(' + IMAGE_ID_SOURCE + ')\\)', 'g')
  let match
  while ((match = regex.exec(markdown)) !== null) {
    ids.add(match[1])
  }
  return ids
}

export function useImageStore() {
  return { saveImage, getImageUrl, deleteImage, dropUnused, extractImageIds, releaseImageUrl, releaseAllImageUrls, shouldRefuseDrop }
}
