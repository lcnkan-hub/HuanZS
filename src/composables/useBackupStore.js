/**
 * 备份快照积木（2026-10-10 新增）
 * 职责：只负责「导入前自动快照」的存取 —— 导入前存一份当前数据，导错了好退回去。
 *
 * 为什么放 IndexedDB 不放 localStorage：localStorage 只有 5MB，一份含图片的备份就能撑爆它。
 * 为什么单独一个库：不跟图片库（huan_zhong_shu_images）混，避免清空图片时误伤快照。
 *
 * 只保留最近 1 份（id 固定 pre_import）—— 快照本身也要占空间，不做无限堆积。
 * 环境降级：node 测试没有 indexedDB → 自动落内存 Map（与 services/storageAdapter.js 同一套思路）。
 *
 * 注意：本文件**不许** import useBackup.js —— 回退的写入逻辑放在 useBackup.js 里，
 * 保持单向依赖（useBackup → useBackupStore），否则两个模块互相 import 会很难查。
 */
const REAL_DB_NAME = 'huan_zhong_shu_backups'
const DB_VERSION = 1
const STORE = 'snapshots'
const SNAPSHOT_ID = 'pre_import'

const memFallback = new Map() // node / 无 IndexedDB 时的兜底

function hasIdb() {
  return typeof indexedDB !== 'undefined'
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REAL_DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

/** 存一份快照（覆盖上一份）。payload 结构与备份文件一致 */
export async function saveSnapshot(payload) {
  const record = { id: SNAPSHOT_ID, ts: new Date().toISOString(), payload }
  if (!hasIdb()) {
    memFallback.set(SNAPSHOT_ID, record)
    return record
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite')
    store.clear()
    const req = store.put(record)
    req.onsuccess = () => resolve(record)
    req.onerror = () => reject(req.error)
  })
}

/** 读快照记录（没有则 null） */
export async function readSnapshot() {
  if (!hasIdb()) return memFallback.get(SNAPSHOT_ID) || null
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(SNAPSHOT_ID)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

/** 清掉快照 */
export async function clearSnapshot() {
  if (!hasIdb()) {
    memFallback.delete(SNAPSHOT_ID)
    return true
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(SNAPSHOT_ID)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

/** 给界面用的轻信息：{ ts, counts } 或 null */
export async function snapshotInfo() {
  try {
    const rec = await readSnapshot()
    if (!rec) return null
    return { ts: rec.ts, counts: (rec.payload && rec.payload.counts) || {} }
  } catch {
    return null
  }
}

export const SNAPSHOT_DB_NAME = REAL_DB_NAME
export const SNAPSHOT_KEY = SNAPSHOT_ID
