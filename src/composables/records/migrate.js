/**
 * 记录的一次性迁移（2026-11-24 从 useRecords.js 拆出）
 *
 * 三步都在**模块加载时**跑，不由 UI 触发：这是数据形状的统一，跟用户操作无关。
 * 拖到某个按钮上反而会出现「没点过按钮 → 旧形状还在 → 各处都得多判一次」。
 * 三步都幂等（没有要改的记录就直接返回 0），重启多次也只动一次盘。
 *
 * ⚠️ 两条破坏面（用户 2026-11-22 已显式确认，测试阶段可丢）：
 *   1. 记录上的 `children` 会被**永久剥掉**，子词条的标题与正文不可恢复；
 *   2. 正文里的图片引用会被搬进 `pics`（图片从「第几段之后」变成「一律在顶部」），
 *      标题会被折进正文首行（name 清空但保留字段）—— 位置信息不可逆。
 *
 * 留退路：折标题前先把整份数组快照到 `<recordsKey>__pre_fold_title`（只存一次，不覆盖）。
 */
import { STORAGE_KEYS } from '../../constants/storage'
import { resolveKey, readRaw, writeRaw } from '../../services/storageAdapter'
import { extractImageIds } from '../useImageStore'
import { stripChildren, stripPicsFromWiki, foldTitleIntoBody } from './shape'

/**
 * 一次性迁移：把正文里的图片引用搬进 `pics` 字段（图片附件化）。
 * 幂等 —— 正文里没有图片引用、且已经有 pics 数组的记录会被原样放回，不会每个启动都写盘。
 * @returns {number} 实际改动的记录条数（0 = 本来就不用改）
 */
export function migratePicsOutOfWiki(records) {
  const list = records.value
  if (!Array.isArray(list) || list.length === 0) return 0
  let touched = 0
  let movedCount = 0
  const next = list.map(item => {
    if (!item || typeof item !== 'object') return item
    const wiki = item.wiki || ''
    const ids = [...extractImageIds(wiki)]
    const hasPicsField = Array.isArray(item.pics)
    if (ids.length === 0 && hasPicsField) return item // 已经迁过，原样放回
    const merged = hasPicsField ? item.pics.slice() : []
    ids.forEach(id => { if (!merged.includes(id)) merged.push(id) })
    touched++
    movedCount += ids.length
    return { ...item, wiki: ids.length ? stripPicsFromWiki(wiki) : wiki, pics: merged }
  })
  if (touched === 0) return 0
  records.value = next
  // 破坏面留痕：不弹窗打断，但控制台要能查到一共动了几条、搬了几张
  console.info(`[记录迁移] 图片改为附件存储：${touched} 条记录补上 pics，${movedCount} 张图从正文移到顶部（位置信息不可恢复）`)
  return touched
}

/**
 * 一次性迁移：把存量记录上的 children 剥掉并落盘。
 * @returns {number} 实际剥掉几条（0 = 本来就没有）
 */
export function migrateDropChildren(records) {
  const list = records.value
  if (!Array.isArray(list) || list.length === 0) return 0
  const dirty = list.filter(i => i && Object.prototype.hasOwnProperty.call(i, 'children'))
  if (dirty.length === 0) return 0
  let childCount = 0
  dirty.forEach(i => { childCount += Array.isArray(i.children) ? i.children.length : 0 })
  records.value = stripChildren(list)
  // 破坏面留痕：不弹窗打断用户，但控制台要能查到这次到底删掉了多少
  console.info(`[记录迁移] 子词条功能已下线：剥掉 ${dirty.length} 条记录上的 children（共 ${childCount} 个子词条，内容不可恢复）`)
  return dirty.length
}

/**
 * 一次性迁移：把 `name` 折进 `wiki` 首行加粗，并把 name 清空（字段保留，不删）。
 * 幂等 —— 所有 name 都空时直接返回 0，不会每次启动都写盘。
 *
 * ⚠️ 破坏面（已按 RULES 第 9 条留退路）：
 *   1. 折叠前的整份记录数组会先存一份快照到 `<recordsKey>__pre_fold_title`（只存一次，不覆盖）；
 *   2. `name` 字段保留但清空 —— 旧备份导入回来时渲染层仍认 name（见 utils/cardText），
 *      所以在别的设备上打开不会突然少一行标题。
 *   3. 迁移后标题与正文之间从「两个不同字段」变成「同一段文字的首行」，位置信息不可逆。
 *
 * @returns {number} 实际折叠了几条（0 = 本来就不用折）
 */
export function migrateTitleIntoBody(records) {
  const list = records.value
  if (!Array.isArray(list) || list.length === 0) return 0
  const dirty = list.filter(i => i && typeof i === 'object' && String(i.name || '').trim())
  if (dirty.length === 0) return 0

  // 退路：整份数据先快照一次。失败也不拦迁移（localStorage 满的时候宁可迁完再说），但要留痕。
  // 快照键 = 当前账号的记录键 + 后缀，所以先 resolveKey 再拼，读写用不加工的 readRaw/writeRaw
  const snapKey = resolveKey(STORAGE_KEYS.RECORDS) + '__pre_fold_title'
  try {
    if (readRaw(snapKey) === null) {
      writeRaw(snapKey, JSON.stringify(list))
      console.info(`[记录迁移] 折标题前的快照已存到 ${snapKey}（${list.length} 条）`)
    }
  } catch (e) {
    console.warn('[记录迁移] 快照没存上（可能存储满了），仍继续折叠：' + (e && e.message))
  }

  let touched = 0
  records.value = list.map(item => {
    if (!item || typeof item !== 'object') return item
    const title = String(item.name || '').trim()
    if (!title) return item
    touched++
    return { ...item, wiki: foldTitleIntoBody(item.wiki, title), name: '' }
  })
  console.info(`[记录迁移] 取消标题字段：${touched} 条记录的标题折进正文首行（**加粗**），name 已清空（字段保留）`)
  return touched
}

/**
 * 按依赖顺序跑完三步迁移。
 * 顺序有意：先剥 children（旧字段），再抽图片（新字段），最后折标题（标题进正文）。
 * @returns {{children:number, pics:number, title:number}} 各步动了多少条
 */
export function runRecordMigrations(records) {
  const children = migrateDropChildren(records)
  const pics = migratePicsOutOfWiki(records)
  const title = migrateTitleIntoBody(records)
  return { children, pics, title }
}
