/**
 * 备份导出（2026-11-24 从 useBackup.js 拆出）
 *
 * 两条硬边界（改之前先读）：
 *  1. **导出绝不包含**：API 密钥（huan_zhong_shu_ai_config）、登录态（_session）、账号表（_accounts）。
 *     备份文件是要外传的，凭据进文件 = 回到 BYOK 之前那个坑。
 *  2. **报出的数字必须是真的**（A04）：图片逐张验、先备后写；坏了几张就报几张。
 *
 * 体积：绝不把整个文件拼成一个巨型字符串（几张 5MB 图就会卡死/爆内存）——
 *       downloadBackup 分块组装，图片逐张 stringify 追加。
 */
import { STORAGE_KEYS } from '../../constants/storage'
import { readRaw } from '../../services/storageAdapter'
import { stripChildren, normalizePics } from '../useRecords'
import { TEXT_SOURCES, CRISIS_SOURCES, readJsonKey, setByPath, writeJsonKey } from './keys'
import { readAllImages, blobToBase64 } from './images'
import { readRescueCopies } from './rescue'
import { trySave, safeLabel, localDateStr } from './saveFile'

export const BACKUP_FORMAT = 'huanzhongshu-backup'
// 2 = 单层记录（2026-11-21 重构）。1 及更早是 {game,note,life} 三分类结构，已不再支持导入。
export const BACKUP_SCHEMA_VERSION = 2
export const SIZE_GATE_MB = 30 // 预估超过这个体积先问用户（含图片 / 不含图片）

const APP_VERSION = '1.0.0'

/** 组装完整备份对象。includeImages=false 时 images 为空数组（体积闸门用） */
export async function buildBackupPayload({ includeImages = true } = {}) {
  const data = { crisis: {} }
  TEXT_SOURCES.forEach(s => {
    const v = readJsonKey(s.key(), s.empty)
    // 子词条已下线：导出文件里不带 children。
    // 存量数据在 useRecords 加载时已迁移，这里再兜一道 —— 万一某个账号的键没被迁移到
    //（比如切账号前导出的别的账号数据），文件形状也必须统一。
    // 图片附件化同理：别的账号的键可能没跑过启动迁移，导出时也要规整一遍，
    // 否则备份文件里会出现「一半记录 pics、一半记录图还写在正文里」的混合形态。
    setByPath(data, s.path, s.path[0] === 'records' ? normalizePics(stripChildren(v)) : v)
  })
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

  const recordList = Array.isArray(data.records) ? data.records : []
  return {
    format: BACKUP_FORMAT,
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    app_version: APP_VERSION,
    account_label: currentAccountLabel(),
    counts: {
      records: recordList.length,
      memory: (data.memory || []).length,
      chat: (data.chat || []).length,
      images: images.length
    },
    data,
    images,
    // 损坏留证（A09 延伸）：原文还在、只是读不出来 —— 只留在这台机器上就等于没有
    rescue: readRescueCopies()
  }
}

function currentAccountLabel() {
  try {
    // 账号表与登录态都是设备级键，用 readRaw（不加前缀）读原文，再自己解析出用户名
    const raw = readRaw(STORAGE_KEYS.ACCOUNTS)
    const sid = readRaw(STORAGE_KEYS.SESSION)
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
    ',"rescue":', J(payload.rescue || {}),
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
