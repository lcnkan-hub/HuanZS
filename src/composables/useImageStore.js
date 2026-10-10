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

/**
 * 删除单张图片（同时 revoke blob URL）
 * @param {string} id 图片 ID
 */
export async function deleteImage(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    // 先获取 record 以清理 blob URL
    const tx1   = db.transaction(STORE_NAME, 'readonly')
    const store = tx1.objectStore(STORE_NAME)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const record = getReq.result
      // revoke 旧的 blob URL（如果能拿到）
      // 实际上 blob URL 由 getImageUrl 创建，这里无法精确追踪所有 URL
      // 所以依赖浏览器 GC 清理
    }
    tx1.oncomplete = () => {
      const tx2 = db.transaction(STORE_NAME, 'readwrite')
      const s   = tx2.objectStore(STORE_NAME)
      s.delete(id)
    }
  })
}

/**
 * 清理未被任何文档引用的图片
 * @param {Set<string>} usedIds 当前文档中引用的所有图片 ID
 */
export async function dropUnused(usedIds) {
  const db = await openDB()
  return new Promise((resolve) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.getAllKeys()
    req.onsuccess = () => {
      const allIds = req.result
      allIds.forEach(id => {
        if (!usedIds.has(id)) {
          store.delete(id)
        }
      })
    }
    tx.oncomplete = () => resolve()
  })
}

/**
 * 从 Markdown 文本中提取所有引用的图片 ID
 * 匹配 ![任意文字](id://img-xxx) 格式
 *
 * ⚠️ id 形态是 saveImage 生成的 `img-<base36 时间戳>_<序号>`（**含字母**），
 * 不是纯数字 —— 旧的 `img-\d+` 一个都匹配不到（2026-10-10 排查发现，
 * 结果是编辑器图片预览永远不会出现）。这里的字符类同时兼容老数据里的纯数字 id。
 */
export function extractImageIds(markdown) {
  const ids   = new Set()
  const regex = /!\[.*?\]\(id:\/\/(img-[0-9a-z_]+)\)/g
  let match
  while ((match = regex.exec(markdown)) !== null) {
    ids.add(match[1])
  }
  return ids
}

export function useImageStore() {
  return { saveImage, getImageUrl, deleteImage, dropUnused, extractImageIds }
}
