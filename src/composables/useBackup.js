/**
 * 备份积木（2026-10-10 新增 · 对应问题清单 I01「数据会丢」）
 * 职责：把本机该带走的东西打成一个文件（导出），以及把文件完整写回来（导入）
 *
 * 完成标准是「丢得起」而不是「不丢」：任意时刻点一次导出得到一个文件，
 * 在另一台设备/另一个浏览器导入后，百科、王冠记忆、聊天记录、危机留痕、图片、用户档案全部回来。
 *
 * 三条硬边界（改动前先读）：
 *  1. **导入一律写进「当前登录账号」的命名空间**（scopeKey）。备份里那个旧 account_label / account.id
 *     不参与写入 —— 否则会把数据写到不存在的账号名下（等于导入后一片空白）。
 *  2. **导出绝不包含**：API 密钥（huan_zhong_shu_ai_config）、登录态（_session）、账号表（_accounts）。
 *     备份文件是要外传的，凭据进文件 = 回到 BYOK 之前那个坑。
 *  3. **导入前必须先快照、且能回退**（快照逻辑在 useBackupStore.js）。只存不能退 = 假安全感。
 *
 * 环境降级（与 services/storageAdapter.js 同一套思路）：
 *   node 测试环境没有 indexedDB / Blob / btoa —— 全部降级，不抛错，让断言脚本能在纯 node 里跑。
 */
import { STORAGE_KEYS } from '../constants/categories'
import { scopeKey } from '../utils/storageScope'
import { IMAGE_DB_NAME, IMAGE_STORE_NAME, getImageDB, releaseAllImageUrls } from './useImageStore'
import { saveSnapshot, readSnapshot } from './useBackupStore'

export const BACKUP_FORMAT = 'huanzhongshu-backup'
export const BACKUP_SCHEMA_VERSION = 1
export const SIZE_GATE_MB = 30 // 预估超过这个体积先问用户（含图片 / 不含图片）

const APP_VERSION = '1.0.0'

/**
 * 把底层原始报错翻成人话。
 * 产品界面上不该出现 `Failed to execute 'transaction' on 'IDBDatabase'...` 这种东西 ——
 * 用户看不懂，也不知道下一步该干什么。
 */
export function humanError(e) {
  const m = (e && e.message) || ''
  if (/object stores was not found|NotFoundError|DataError/i.test(m)) {
    return '本机图片库读不到。数据没动 —— 可以先试「只导文字数据」，或者完全关掉 App 重开再导'
  }
  if (/quota|QuotaExceeded/i.test(m)) return '本机存储空间不足'
  if (/被占用/.test(m)) return m
  return m || '未知错误'
}

// —— 文本真相源清单（进备份的）——
// path 是「相对于 payload.data」的路径，别写成 ['data','user']（会多出一层，导入时一条都写不进去）
const TEXT_SOURCES = [
  { path: ['user'],   key: () => STORAGE_KEYS.USER,   empty: null },
  { path: ['db'],     key: () => STORAGE_KEYS.DB,     empty: { game: [], note: [], life: [] } },
  { path: ['chat'],   key: () => STORAGE_KEYS.CHAT,   empty: [] },
  { path: ['memory'], key: () => STORAGE_KEYS.MEMORY, empty: [] }
]

const CRISIS_SOURCES = [
  { path: ['crisis', 'audit_log'], key: () => STORAGE_KEYS.CRISIS_AUDIT,   empty: [] },
  { path: ['crisis', 'pending'],   key: () => STORAGE_KEYS.CRISIS_PENDING, empty: null },
  { path: ['crisis', 'state'],     key: () => STORAGE_KEYS.CRISIS_STATE,   empty: null }
]

// ========== 底层读写 ==========

/** 读一个 JSON 键。不存在 → empty；存在但解析不了 → 抛错（宁可中止导出，也不导一份缺件的备份） */
function readJsonKey(baseKey, empty) {
  const realKey = scopeKey(baseKey)
  let raw = null
  try {
    raw = localStorage.getItem(realKey)
  } catch {
    throw new Error('本机存储读不到：' + baseKey)
  }
  if (raw === null) return cloneEmpty(empty)
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('本机数据有损坏，先别导出（' + baseKey + ' 解析失败）')
  }
}

/** 默认值是共享引用，返回副本，避免下游改到默认值本身 */
function cloneEmpty(empty) {
  if (empty === null || typeof empty !== 'object') return empty
  return JSON.parse(JSON.stringify(empty))
}

function writeJsonKey(baseKey, value) {
  const realKey = scopeKey(baseKey)
  if (value === null || value === undefined) {
    try { localStorage.removeItem(realKey) } catch { /* 忽略 */ }
    return
  }
  localStorage.setItem(realKey, JSON.stringify(value))
}

function setByPath(obj, path, value) {
  let cur = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (!cur[path[i]]) cur[path[i]] = {}
    cur = cur[path[i]]
  }
  cur[path[path.length - 1]] = value
}

function getByPath(obj, path) {
  let cur = obj
  for (const p of path) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[p]
  }
  return cur
}

// ========== 图片（IndexedDB）==========

/**
 * 打开图片库。
 * - node 环境没有 indexedDB → null（等于没有图片，正常降级）
 * - 浏览器里打不开 → **让错误往上抛**。宁可不导出，也不导一份「看起来成功、其实没图片」的备份。
 *   图片库半创建（有库没 store）的情况由 useImageStore.getImageDB 自愈。
 */
async function openImageDb() {
  if (typeof indexedDB === 'undefined') return null
  return getImageDB()
}

async function readAllImages() {
  const db = await openImageDb()
  if (!db) return [] // node / 无 IndexedDB → 无图片，不抛错
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readonly')
    const req = tx.objectStore(IMAGE_STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function blobToBase64(blob) {
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

function base64ToBlob(b64, mime) {
  if (typeof atob === 'undefined') return null
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

/** 把备份里的图片写回库：先清空再写，id 原样保留（百科正文靠 id:// 引用，改了就全变死链） */
async function replaceAllImages(images) {
  const db = await openImageDb()
  if (!db) return 0
  // 旧 blob URL 必须清掉：这批图已经整批换过，旧 URL 指向的数据已经没了
  //（不清的话，页面上正在显示的图会变成坏图 / 读到已删数据）
  try { releaseAllImageUrls() } catch { /* 忽略 */ }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IMAGE_STORE_NAME)
    store.clear()
    let n = 0
    ;(images || []).forEach(img => {
      if (!img || !img.id || !img.dataBase64) return
      const blob = base64ToBlob(img.dataBase64, img.mime)
      if (!blob) return
      store.put({ id: img.id, blob, mime: img.mime || '', name: img.name || '', time: img.time || Date.now() })
      n++
    })
    tx.oncomplete = () => resolve(n)
    tx.onerror = () => reject(tx.error)
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

// ========== 导出 ==========

/** 组装完整备份对象。includeImages=false 时 images 为空数组（体积闸门用） */
export async function buildBackupPayload({ includeImages = true } = {}) {
  const data = { crisis: {} }
  TEXT_SOURCES.forEach(s => setByPath(data, s.path, readJsonKey(s.key(), s.empty)))
  CRISIS_SOURCES.forEach(s => setByPath(data, s.path, readJsonKey(s.key(), s.empty)))

  let images = []
  if (includeImages) {
    const rows = await readAllImages()
    images = await Promise.all(rows.map(async r => ({
      id: r.id,
      mime: r.mime || '',
      name: r.name || '',
      time: r.time || 0,
      dataBase64: r.blob ? await blobToBase64(r.blob) : ''
    })))
  }

  const db = data.db || { game: [], note: [], life: [] }
  return {
    format: BACKUP_FORMAT,
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    app_version: APP_VERSION,
    account_label: currentAccountLabel(),
    counts: {
      wiki_items: ['game', 'note', 'life'].reduce((n, c) => n + (Array.isArray(db[c]) ? db[c].length : 0), 0),
      memory: (data.memory || []).length,
      chat: (data.chat || []).length,
      images: images.length
    },
    data,
    images
  }
}

function currentAccountLabel() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS)
    const sid = localStorage.getItem(STORAGE_KEYS.SESSION)
    if (!raw || !sid) return '本机'
    const id = (JSON.parse(sid) || {}).userId
    const acc = (JSON.parse(raw) || []).find(a => a.id === id)
    return (acc && acc.username) || '本机'
  } catch {
    return '本机'
  }
}

/** 预估导出体积（MB，保留一位小数）。图片 base64 比原始字节大约 4/3 */
export async function estimateSize(includeImages = true) {
  const payload = await buildBackupPayload({ includeImages: false })
  let bytes = JSON.stringify(payload).length
  if (includeImages) {
    const rows = await readAllImages()
    const raw = rows.reduce((n, r) => n + (r.blob && r.blob.size ? r.blob.size : 0), 0)
    bytes += Math.ceil(raw * 4 / 3) + rows.length * 120
  }
  return Math.round((bytes / 1024 / 1024) * 10) / 10
}

/**
 * 落文件。分块组装：先把 meta + data 作为第一段，图片逐张 stringify 追加，最后收尾。
 * 绝不把整个文件拼成一个巨型字符串（几张 5MB 图就会卡死/爆内存）。
 */
export async function downloadBackup({ includeImages = true } = {}) {
  const payload = await buildBackupPayload({ includeImages })
  const J = JSON.stringify
  const parts = ['{"format":', J(payload.format),
    ',"schema_version":', String(payload.schema_version),
    ',"exported_at":', J(payload.exported_at),
    ',"app_version":', J(payload.app_version),
    ',"account_label":', J(payload.account_label),
    ',"counts":', J(payload.counts),
    ',"data":', J(payload.data),
    ',"images":[']
  payload.images.forEach((img, i) => {
    if (i) parts.push(',')
    parts.push(J(img))
  })
  parts.push(']}')

  const blob = new Blob(parts, { type: 'application/json' })
  const filename = 'huanzhongshu-backup-' + safeLabel(payload.account_label) + '-' + localDateStr() + '.json'
  const via = await trySave(blob, filename)

  markExported()
  return { ok: true, filename, bytes: blob.size, images: payload.images.length, counts: payload.counts, via }
}

function safeLabel(label) {
  return String(label || '本机').replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 20) || '本机'
}

function localDateStr() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

/**
 * 选落文件方式（**纯函数**，优先级单独可测）。
 *
 * 顺序 = 从"最可靠"到"最不可靠"：
 *   native    → APK（安卓/iOS 原生壳）：走 Capacitor Filesystem 真写进设备 + 弹系统分享
 *   webshare  → 手机浏览器 / PWA：Web Share 能带文件时用系统分享面板
 *   download  → 桌面浏览器：<a download>
 *   none      → 什么路都没有（如实告诉用户，不许假装成功）
 *
 * ⚠️ 为什么 native 必须排第一：Android WebView 里 `<a download>` **对 blob 静默无效**
 *    （没有 DownloadListener 就什么都不发生，连报错都没有）——2026-10-10 查证，
 *    这正是"APK 里导出点了没反应"的根因。所以原生壳里绝不能落到 download 这条路。
 */
export function pickSaver({ isNative = false, canShare = false, canDownload = false } = {}) {
  if (isNative) return 'native'
  if (canShare) return 'webshare'
  if (canDownload) return 'download'
  return 'none'
}

/** 探当前环境能力（纯探测，不落文件） */
async function detectEnv() {
  const canDownload = typeof document !== 'undefined' && typeof URL !== 'undefined' && !!URL.createObjectURL
  let canShare = false
  try {
    canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File !== 'undefined'
  } catch { canShare = false }
  let isNative = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    isNative = !!(Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform())
  } catch { isNative = false }
  return { isNative, canShare, canDownload }
}

function fileShareable(file) {
  try {
    return !!(file && navigator.canShare && navigator.canShare({ files: [file] }))
  } catch {
    return false
  }
}

/**
 * 原生壳里落文件：先写进设备（Documents 优先，权限不许就退 App 缓存目录），再弹系统分享。
 * 为什么写完还要分享：写进 App 私有目录用户"看不到"，等于没导出 —— 必须给他一个
 * 「存到文件 / 发给自己 / 传电脑」的出口。
 * 返回 'native-share' | 'native-file' | null（null = 这条路走不通，交给上层继续往后退）
 */
async function saveViaNative(blob, filename) {
  let uri = null
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const b64 = await blobToBase64(blob)
    for (const dir of [Directory.Documents, Directory.Cache]) {
      try {
        const res = await Filesystem.writeFile({ path: filename, data: b64, directory: dir, recursive: true })
        uri = res && res.uri
        if (uri) break
      } catch { /* 这个目录不行 → 试下一个 */ }
    }
  } catch {
    return null
  }
  if (!uri) return null
  try {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: filename, url: uri, dialogTitle: '保存备份文件' })
    return 'native-share'
  } catch {
    return 'native-file' // 文件已经落地了，只是分享没弹出来
  }
}

/**
 * 按 pickSaver 选定的路落文件；**选定的那条失败就依次往后退**（不让用户一步拿不到就啥也没有）。
 * 返回实际走通的 via 值：'native-share' | 'native-file' | 'webshare' | 'download' | 'none'
 */
async function trySave(blob, filename) {
  const env = await detectEnv()
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: 'application/json' }) : null
  const canShareFile = !!(file && env.canShare && fileShareable(file))
  const how = pickSaver({ isNative: env.isNative, canShare: canShareFile, canDownload: env.canDownload })

  if (how === 'native') {
    const via = await saveViaNative(blob, filename)
    if (via) return via
    /* 原生那条走不通 → 继续往下退 */
  }
  if ((how === 'native' || how === 'webshare') && canShareFile) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'webshare'
    } catch {
      /* 用户取消或分享失败 → 退下载 */
    }
  }
  if (env.canDownload) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return 'download'
  }
  return 'none'
}

/** 记上次导出时间（按账号，走 scopeKey） */
function markExported() {
  try {
    writeJsonKey(STORAGE_KEYS.LAST_EXPORT, new Date().toISOString())
  } catch { /* 忽略 */ }
}

export function lastExportAt() {
  try {
    return readJsonKey(STORAGE_KEYS.LAST_EXPORT, null)
  } catch {
    return null
  }
}

// ========== 导入 ==========

/**
 * 校验备份内容。任何一条不过就返回 { ok:false }，调用方必须**中止且不改动任何存储**。
 * v0 兼容：老版导出的就是纯百科对象 {game, note, life}（没有 format / schema_version）。
 */
export function validateBackupPayload(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '文件读不了：内容不是有效的备份数据' }
  }

  const isLegacy = !raw.schema_version && !raw.format &&
    Array.isArray(raw.game) && Array.isArray(raw.note) && Array.isArray(raw.life)
  if (isLegacy) {
    return {
      ok: true,
      legacy: true,
      payload: { schema_version: 0, data: { db: { game: raw.game, note: raw.note, life: raw.life } }, images: [] }
    }
  }

  if (raw.format !== BACKUP_FORMAT) return { ok: false, error: '这不是寰中枢的备份文件' }
  if (typeof raw.schema_version !== 'number') return { ok: false, error: '备份缺版本号' }
  if (raw.schema_version > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: '这个备份来自更新的版本，请先升级 App 再导入' }
  }

  const data = raw.data
  if (!data || typeof data !== 'object') return { ok: false, error: '备份缺 data 段' }
  const db = data.db
  if (!db || !['game', 'note', 'life'].every(c => Array.isArray(db[c]))) {
    return { ok: false, error: '百科数据形状不对' }
  }
  if (data.chat != null && !Array.isArray(data.chat)) return { ok: false, error: '聊天记录形状不对' }
  if (data.memory != null && !Array.isArray(data.memory)) return { ok: false, error: '记忆数据形状不对' }
  if (data.crisis != null && typeof data.crisis !== 'object') return { ok: false, error: '危机数据形状不对' }
  if (raw.images != null && !Array.isArray(raw.images)) return { ok: false, error: '图片段形状不对' }

  // 条数核对：对不上说明文件在传输/编辑中损坏了
  if (raw.counts && typeof raw.counts === 'object') {
    const actual = {
      wiki_items: ['game', 'note', 'life'].reduce((n, c) => n + db[c].length, 0),
      memory: (data.memory || []).length,
      chat: (data.chat || []).length,
      images: (raw.images || []).length
    }
    const bad = Object.keys(actual).filter(k => typeof raw.counts[k] === 'number' && raw.counts[k] !== actual[k])
    if (bad.length) return { ok: false, error: '条数对不上（' + bad.join('、') + '）—— 文件可能损坏' }
  }

  return { ok: true, legacy: false, payload: raw }
}

/** 把校验过的 payload 写进当前账号的命名空间；返回写过的键（测试要断言这个） */
export function applyPayload(payload) {
  const written = []
  const data = payload.data || {}

  TEXT_SOURCES.forEach(s => {
    const field = s.path[0]
    if (!(field in data)) return
    writeJsonKey(s.key(), data[field])
    written.push(s.key())
  })

  if (!payload.legacy) {
    CRISIS_SOURCES.forEach(s => {
      const v = getByPath(data, s.path)
      if (v === undefined) return
      writeJsonKey(s.key(), v === null ? null : v)
      written.push(s.key())
    })
  }
  return written
}

function readFileText(file) {
  if (typeof file === 'string') return Promise.resolve(file)
  if (file && typeof file.text === 'function') return file.text()
  return Promise.reject(new Error('读不了这个文件'))
}

/**
 * 导入主流程：解析 → 校验 → **快照** → 写入 → 图片。
 * 返回 { ok, error?, written?, legacy?, images? }
 * 调用方拿到 ok 之后必须整页重载（业务 composable 的存储键在 import 时就绑定了）。
 */
export async function importBackup(file) {
  let raw
  try {
    raw = JSON.parse(await readFileText(file))
  } catch {
    return { ok: false, error: '文件读不了：内容不是有效的 JSON' }
  }

  const v = validateBackupPayload(raw)
  if (!v.ok) return v

  // 快照必须在写入之前 —— 存不成就不许往下走（否则一次导错就没得退）
  try {
    const current = await buildBackupPayload({ includeImages: true })
    await saveSnapshot(current)
  } catch {
    return { ok: false, error: '导入前的快照没存成，为了安全已中止导入' }
  }

  let written
  try {
    written = applyPayload(v.payload)
  } catch (e) {
    return { ok: false, error: '写入失败：' + (e && e.message ? e.message : '未知错误') }
  }

  let images = 0
  if (!v.legacy) {
    try {
      images = await replaceAllImages(v.payload.images || [])
    } catch {
      /* 图片失败不回滚数据：数据比图片重要，界面会提示 */
    }
  }

  return { ok: true, legacy: !!v.legacy, written, images, counts: (v.payload && v.payload.counts) || {} }
}

/**
 * 回退到导入前的快照。
 * 复用 applyPayload + replaceAllImages（**不另写一份写入逻辑** —— 两份必然漂移）。
 * 返回 { ok, error?, ts? }；调用方拿到 ok 之后整页重载。
 */
export async function restoreFromSnapshot() {
  let rec = null
  try {
    rec = await readSnapshot()
  } catch {
    return { ok: false, error: '读快照失败' }
  }
  if (!rec || !rec.payload) return { ok: false, error: '没有可回退的快照' }

  try {
    applyPayload(rec.payload)
  } catch (e) {
    return { ok: false, error: '回退写入失败：' + (e && e.message ? e.message : '未知错误') }
  }
  try {
    await replaceAllImages(rec.payload.images || [])
  } catch {
    /* 图片失败不回滚数据 */
  }
  return { ok: true, ts: rec.ts }
}
