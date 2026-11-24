/**
 * 记录数据库积木（2026-11-21 单层重构 · 2026-11-22 子词条下线）
 *
 * 一个账号就是一条记录数组，不再有游戏 / 笔记 / 生活三分类，也不再有一层子词条：
 *   [{ id, name, wiki, creator, time, origin }]
 *
 * 为什么仍然保留「模块级单例」：useLocalStorage 的 ref 不感知外部对 localStorage 的直接写入，
 * 一旦出现第二个调用点（王冠代记就是第二个），两边各持一份快照，后写必然覆盖先写，静默丢数据。
 *
 * 2026-11-24 拆分（本文件从 439 行降到 ~120）：只留「状态 + 增删改查 + 对外门面」。
 *   records/shape.js    → 纯形状函数（stripChildren / normalizePics / foldTitleIntoBody…）
 *   records/migrate.js  → 三步一次性迁移（children / 图片 / 标题）
 *   records/imageGc.js  → 删记录后的图片回收（全库单库，最容易毁数据的一段）
 * 依赖方向：useRecords → records/*，反向禁止。
 * 门面仍然 re-export 形状函数 —— 备份层的 import 一行都不用改。
 */
import { useLocalStorage } from './useLocalStorage'
import { STORAGE_KEYS } from '../constants/storage'
import { getCurrentTimeString, generateUniqueId } from '../utils/uniqueId'
import { runRecordMigrations } from './records/migrate'
import {
  purgeUnusedImages as purgeUnusedImagesOf,
  collectUsedImageIds as collectUsedImageIdsFrom
} from './records/imageGc'

// 形状函数：新代码请直接 import './records/shape'，这里 re-export 只是兼容既有调用方
export { stripChildren, stripPicsFromWiki, normalizePics, foldTitleIntoBody } from './records/shape'

const { data: records, error: storageError } = useLocalStorage(STORAGE_KEYS.RECORDS, [])

// 三步一次性迁移在模块加载时跑（幂等，重启多次也只动一次盘）
runRecordMigrations(records)

export function useRecords() {
  // ========== 查询 ==========

  /** 按关键词搜索（名称 + 正文，大小写不敏感） */
  function searchRecords(query) {
    const list = records.value || []
    if (!query || !query.trim()) return list
    const q = query.trim().toLowerCase()
    return list.filter(item =>
      (item.name || '').toLowerCase().includes(q) ||
      (item.wiki || '').toLowerCase().includes(q)
    )
  }

  /** 某个用户创建的记录（「我创建的」/ 只看我创建的） */
  function myRecords(userName) {
    return (records.value || []).filter(item => item.creator === userName)
  }

  // ========== 增删改 ==========

  /** 新建一条记录（名称可为空串：点「添加」先进详情页再写标题） */
  function addRecord(name = '', creator = '') {
    const item = {
      id: generateUniqueId(),
      name: (name || '').trim(),
      wiki: '',
      pics: [], // 图片附件（图片 id 列表）。2026-11-22 起正文只存文字，图不进正文
      creator,
      time: getCurrentTimeString(),
      origin: 'user' // user = 用户手建；crown = 王冠代记（旧数据无此字段，按 user 看待）
      // 2026-11-22：不再带 children 字段（子词条下线）
    }
    records.value.push(item)
    return item
  }

  /** 删除一条记录（连带回收只被它引用的图片） */
  async function deleteRecord(id) {
    // 数组先同步改完再 await：界面不能等图片回收
    records.value = (records.value || []).filter(i => i.id !== id)
    return purgeUnusedImagesOf(records)
  }

  /** 改名（返回改后的条目；找不到返回 null） */
  function updateRecordName(id, name) {
    const item = (records.value || []).find(i => i.id === id)
    if (!item) return null
    item.name = (name || '').trim()
    return item
  }

  /** 更新正文（返回改后的条目；找不到返回 null） */
  function updateRecordBody(id, wiki) {
    const item = (records.value || []).find(i => i.id === id)
    if (!item) return null
    item.wiki = wiki || ''
    return item
  }

  /**
   * 更新图片附件列表（返回改后的条目；找不到返回 null）。
   * 2026-11-22 图片附件化：图不再写在正文里，改由这里整组替换。
   * 只接受非空字符串 id，挡住 undefined / '' 混进数组（那会让图片回收算错）。
   */
  function updateRecordPics(id, pics) {
    const item = (records.value || []).find(i => i.id === id)
    if (!item) return null
    item.pics = (Array.isArray(pics) ? pics : []).filter(pid => typeof pid === 'string' && pid)
    return item
  }

  /**
   * 清理空记录（点「添加」直接进详情页的收尾，以及 2026-11-22 起的通用规则）：
   * 标题、正文、图片三样全空 = 这条记录没有任何内容，删掉它。
   *
   * 2026-11-22 用户明确要求「任何记录，只要标题正文都空了，返回就删」——
   * 不再只针对刚新建的那条，老记录被清空也一样回收。
   * 注意 pics 也算内容：一条只有图没有字的记录不是空记录，不能删。
   * @returns {boolean} 是否真的删了
   */
  async function dropIfEmpty(id) {
    const item = (records.value || []).find(i => i.id === id)
    if (!item) return false
    const emptyTitle = !(item.name || '').trim()
    const emptyBody = !(item.wiki || '').trim()
    const emptyPics = !Array.isArray(item.pics) || item.pics.length === 0
    // 2026-11-22：不再有子词条，「有没有子词条」这个条件自然消失
    if (emptyTitle && emptyBody && emptyPics) {
      await deleteRecord(id)
      return true
    }
    return false
  }

  // ========== 图片回收（A02） ==========

  /** 收集正文里引用到的所有图片 id（实现见 records/imageGc.js） */
  function collectUsedImageIds(lists) {
    return collectUsedImageIdsFrom(lists, records)
  }

  /** 回收没人引用的图片（实现见 records/imageGc.js） */
  async function purgeUnusedImages() {
    return purgeUnusedImagesOf(records)
  }

  // ========== 用户名同步 ==========

  /** 改昵称后同步所有记录的 creator（2026-11-22：不再有子记录，只走顶层） */
  function syncCreatorName(oldName, newName) {
    ;(records.value || []).forEach(item => {
      if (item && (item.creator || '') === oldName) item.creator = newName
    })
  }

  return {
    records,
    storageError,
    searchRecords,
    myRecords,
    addRecord,
    deleteRecord,
    updateRecordName,
    updateRecordBody,
    updateRecordPics,
    dropIfEmpty,
    collectUsedImageIds,
    purgeUnusedImages,
    syncCreatorName
  }
}
