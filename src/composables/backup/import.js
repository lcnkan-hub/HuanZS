/**
 * 备份导入与回退（2026-11-24 从 useBackup.js 拆出）
 *
 * 三条硬边界（改之前先读）：
 *  1. **导入一律写进「当前登录账号」的命名空间**（scopeKey）。备份里那个旧 account_label / account.id
 *     不参与写入 —— 否则会把数据写到不存在的账号名下（等于导入后一片空白）。
 *  2. **导入前必须先快照、且能回退**（快照在 useBackupStore.js）。只存不能退 = 假安全感。
 *     快照存不成就不许往下走。
 *  3. **报出的数字必须是真的**（A04）：坏了几张图就报几张，绝不允许
 *     「图片库已清空 / 文本已换代，界面却报导入完成」。
 *
 * 坏图闸门：备份里有坏图时默认中止且零改动（与导出侧口径一致：解析失败即中止）。
 * 但这份备份可能就是他唯一的一份，所以允许调用方显式 allowDamagedImages 放行；
 * 放行之后丢了几张必须如实报出来。
 */
import { stripChildren, normalizePics } from '../useRecords'
import { saveSnapshot, readSnapshot } from '../useBackupStore'
import { humanError } from './errors'
import {
  TEXT_SOURCES, CRISIS_SOURCES, writeTracked, getByPath
} from './keys'
import { inspectImages, replaceAllImages } from './images'
import { restoreRescueCopies } from './rescue'
import { buildBackupPayload, BACKUP_FORMAT, BACKUP_SCHEMA_VERSION } from './export'

/**
 * 校验备份内容。任何一条不过就返回 { ok:false }，调用方必须**中止且不改动任何存储**。
 * 结构口径（schema 2 起）：data.records 是单层记录数组。
 * 旧版（schema 0/1，{game,note,life} 三分类）不再支持 —— 明确拒绝并说明原因，
 * 绝不尝试半懂不懂地迁移（迁移错了比拒绝更糟：用户以为导进来了）。
 */
export function validateBackupPayload(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '文件读不了：内容不是有效的备份数据' }
  }

  // v0：老版导出的就是纯百科对象 {game, note, life}
  const isLegacyShape = !raw.schema_version && !raw.format &&
    Array.isArray(raw.game) && Array.isArray(raw.note) && Array.isArray(raw.life)
  if (isLegacyShape) {
    return { ok: false, error: '这是三分类时代的旧备份，当前版本不再支持直接导入（见备份中心说明）' }
  }

  if (raw.format !== BACKUP_FORMAT) return { ok: false, error: '这不是寰中枢的备份文件' }
  if (typeof raw.schema_version !== 'number') return { ok: false, error: '备份缺版本号' }
  if (raw.schema_version > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: '这个备份来自更新的版本，请先升级 App 再导入' }
  }
  if (raw.schema_version < BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: '这是旧版备份（schema ' + raw.schema_version + '），三分类结构已下线，无法直接导入' }
  }

  const data = raw.data
  if (!data || typeof data !== 'object') return { ok: false, error: '备份缺 data 段' }
  if (!Array.isArray(data.records)) {
    return { ok: false, error: '记录数据形状不对' }
  }
  if (data.chat != null && !Array.isArray(data.chat)) return { ok: false, error: '聊天记录形状不对' }
  if (data.memory != null && !Array.isArray(data.memory)) return { ok: false, error: '记忆数据形状不对' }
  if (data.crisis != null && typeof data.crisis !== 'object') return { ok: false, error: '危机数据形状不对' }
  if (raw.images != null && !Array.isArray(raw.images)) return { ok: false, error: '图片段形状不对' }
  if (raw.rescue != null && (typeof raw.rescue !== 'object' || Array.isArray(raw.rescue))) {
    return { ok: false, error: '损坏留证段形状不对' }
  }

  // 条数核对：对不上说明文件在传输/编辑中损坏了
  if (raw.counts && typeof raw.counts === 'object') {
    const actual = {
      records: data.records.length,
      memory: (data.memory || []).length,
      chat: (data.chat || []).length,
      images: (raw.images || []).length
    }
    const bad = Object.keys(actual).filter(k => typeof raw.counts[k] === 'number' && raw.counts[k] !== actual[k])
    if (bad.length) return { ok: false, error: '条数对不上（' + bad.join('、') + '）—— 文件可能损坏' }
  }

  // 图片段的**逐张**体检（A04）：条数对得上，不代表每一张图都能解开。
  // 这里只数、不碰存储 —— 真正的写入在 replaceAllImages 里用同一套判据再走一遍。
  const imageReport = inspectImages(raw.images)

  return { ok: true, legacy: false, payload: raw, imageReport }
}

/** 把校验过的 payload 写进当前账号的命名空间；返回写过的键（测试要断言这个） */
export function applyPayload(payload) {
  const written = []
  const data = payload.data || {}

  // 一律按完整路径取（getByPath），不能用 path[0] ——
  // path 一旦是多段（如 ['proactive','log']），path[0] 拿到的是整个 {log,enabled} 对象，
  // 会被原样写进每一个同前缀的键里，把账本和开关一起写坏。
  // 单段路径下 getByPath 与 path[0] 等价，所以这个改动对老数据是等价的。
  TEXT_SOURCES.forEach(s => {
    let v = getByPath(data, s.path)
    if (v === undefined) return
    // 旧备份里可能带 children：导入时剥掉，不让子词条借备份复活（2026-11-22 下线）
    // 旧备份里的图片还写在正文里：normalizePics 抽进 pics，不让「图在正文里」从备份复活
    if (s.path[0] === 'records') v = normalizePics(stripChildren(v))
    writeTracked(s.key(), v === null ? null : v, written)
  })

  if (!payload.legacy) {
    CRISIS_SOURCES.forEach(s => {
      const v = getByPath(data, s.path)
      if (v === undefined) return
      writeTracked(s.key(), v === null ? null : v, written)
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
 * 导入主流程：解析 → 校验 →（坏图闸门）→ **快照** → 写入 → 图片。
 * 返回 { ok, error?, code?, written?, legacy?, images?, imagesDropped?, imageError? }
 * 调用方拿到 ok 之后必须整页重载（业务 composable 的存储键在 import 时就绑定了）。
 */
export async function importBackup(file, options = {}) {
  const allowDamagedImages = !!(options && options.allowDamagedImages)
  let raw
  try {
    raw = JSON.parse(await readFileText(file))
  } catch {
    return { ok: false, error: '文件读不了：内容不是有效的 JSON' }
  }

  const v = validateBackupPayload(raw)
  if (!v.ok) return v

  const report = v.imageReport || inspectImages(raw.images)
  if (report.damaged > 0 && !allowDamagedImages) {
    const first = report.issues.slice(0, 3).map(i => i.reason).join('；')
    return {
      ok: false,
      code: 'IMAGES_DAMAGED',
      error: `这份备份里有 ${report.damaged} 张图片是坏的（${first}${report.issues.length > 3 ? ' 等' : ''}）。` +
        `已经中止，什么都没动 —— 你可以选「仍然导入」，但会丢掉这 ${report.damaged} 张图。`,
      imageReport: report
    }
  }

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

  // 图片：失败不回滚文字数据（数据比图片重要），但必须把失败**报出来**，不许当成功
  let imageResult = { written: 0, dropped: 0, droppedDetail: [], expected: report.expected, unavailable: false }
  let imageError = ''
  if (!v.legacy) {
    try {
      imageResult = await replaceAllImages(v.payload.images || [])
    } catch (e) {
      imageError = humanError(e)
    }
  }

  // 损坏留证（A09 延伸）：文字数据已经换代了，留证也跟着写回来。
  // 失败不算导入失败 —— 它救的是"上一轮损坏"，不该反过来毁掉这一轮导入。
  let rescueResult = { restored: 0, skipped: 0, failed: 0 }
  try {
    rescueResult = restoreRescueCopies(v.payload.rescue)
  } catch { /* 保持 0，不阻断 */ }

  return {
    ok: true,
    legacy: !!v.legacy,
    written,
    // 这三个数字是**实际发生的事**，界面报表就用它们，不许拿 counts（备份自称的）充数
    images: imageResult.written,
    imagesDropped: imageResult.dropped,
    imagesExpected: imageResult.expected,
    imageUnavailable: !!imageResult.unavailable,
    imageDroppedDetail: imageResult.droppedDetail || [],
    imageError,
    imageReport: report,
    rescue: rescueResult,
    counts: (v.payload && v.payload.counts) || {}
  }
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
  try {
    restoreRescueCopies(rec.payload.rescue)   // 回退也要把留证带回来（快照里本来就有）
  } catch { /* 忽略 */ }
  return { ok: true, ts: rec.ts }
}
