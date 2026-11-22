/**
 * 记录数据库积木（2026-11-21 单层重构 · 2026-11-22 子词条下线）
 *
 * 一个账号就是一条记录数组，不再有游戏 / 笔记 / 生活三分类，也不再有一层子词条：
 *   [{ id, name, wiki, creator, time, origin }]
 *
 * 为什么仍然保留「模块级单例」：useLocalStorage 的 ref 不感知外部对 localStorage 的直接写入，
 * 一旦出现第二个调用点（王冠代记就是第二个），两边各持一份快照，后写必然覆盖先写，静默丢数据。
 *
 * 删除记录时连带回收没人引用的图片（A02）。
 *
 * ⚠️ 2026-11-22 破坏面（用户已显式确认，测试阶段可丢）：
 *   存量记录上的 `children` 字段会被 migrateDropChildren() **永久剥掉**，子词条的标题与正文不可恢复。
 *   旧备份文件里若含 children，导入时同样会被剥掉（见 useBackup 的 stripRecordsChildren）。
 */
import { useLocalStorage } from './useLocalStorage'
import { extractImageIds, dropUnused } from './useImageStore'
import { STORAGE_KEYS } from '../constants/categories'
import { getCurrentTimeString, generateUniqueId } from '../utils/uniqueId'
import { scopeKey, SCOPE_SEP } from '../utils/storageScope'

const { data: records, error: storageError } = useLocalStorage(STORAGE_KEYS.RECORDS, [])

/**
 * 剥掉记录上的 `children` 字段（纯函数，不改入参）。
 * 2026-11-22 子词条功能下线：只留 { id, name, wiki, creator, time, origin }。
 * 导出/导入两处也复用它，保证「盘上、文件里、导回来」三处形状一致。
 */
export function stripChildren(list) {
  if (!Array.isArray(list)) return list
  return list.map(item => {
    if (!item || typeof item !== 'object') return item
    const { children, ...rest } = item
    return rest
  })
}

/**
 * 一次性迁移：把存量记录上的 children 剥掉并落盘。
 * 幂等 —— 剥完再跑时没有一条带 children，直接返回 0，不会每个启动都写盘。
 * 为什么放在模块加载时而不是 UI 里：这是数据形状的统一，跟用户操作无关，
 * 拖到某个按钮上反而会出现「没点过按钮 → 旧形状还在 → 各处都得多判一次」。
 * @returns {number} 实际剥掉几条（0 = 本来就没有）
 */
function migrateDropChildren() {
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

migrateDropChildren()

/** 记录数组的合法形状：必须是数组；单项只要是对象就算（老数据可能缺字段） */
function isRecordArray(v) {
  return Array.isArray(v)
}

/**
 * 读出本机**其它账号**命名空间下的记录数据（不含当前账号）。
 *
 * 为什么回收图片必须把别的账号也算进来：图片库 `huan_zhong_shu_images` 是**全设备单库**、
 * 不按账号分，而记录是按账号分键的（`huan_zhong_shu_records@u<id>`）。
 * 只按当前账号算引用集合，换个账号删一条，就会把上个账号的图当成孤儿清掉 —— 那是直接毁数据。
 *
 * 返回 broken：有读不出来 / 形状不对的账号。调用方据此放弃回收（读不全就不敢判定谁是孤儿）。
 */
function readOtherAccountsRecords() {
  const base = STORAGE_KEYS.RECORDS
  const curKey = scopeKey(base)
  const others = []
  const broken = []
  const keys = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k !== curKey && (k === base || k.startsWith(base + SCOPE_SEP))) keys.push(k)
    }
  } catch (e) {
    broken.push('枚举本机存储失败：' + (e && e.message))
  }
  keys.forEach(k => {
    let v = null
    try { v = JSON.parse(localStorage.getItem(k)) } catch { broken.push(k); return }
    if (isRecordArray(v)) others.push(v)
    else broken.push(k)
  })
  return { others, broken }
}

/**
 * 当前账号**落盘那一份**的状态（不看内存）。
 * 内存取的是刚改过的值（删完立刻算引用集合才对），但前提是内存确实代表用户的数据：
 * 若落盘那份解析失败，useLocalStorage 会回落成空数组，照它算等于把所有图都当孤儿清掉。
 */
function currentStoredKeyState() {
  let raw = null
  try {
    raw = localStorage.getItem(scopeKey(STORAGE_KEYS.RECORDS))
  } catch (e) {
    return { ok: false, why: '本机存储读不到：' + (e && e.message) }
  }
  if (raw === null) return { ok: true }
  let v = null
  try {
    v = JSON.parse(raw)
  } catch {
    return { ok: false, why: '当前账号的记录数据解析失败（原始内容还在，没被覆盖）' }
  }
  if (!isRecordArray(v)) return { ok: false, why: '当前账号的记录数据形状不对' }
  return { ok: true }
}

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
    return purgeUnusedImages()
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
   * 清理空记录（点「添加」直接进详情页的收尾）：
   * 返回详情时若标题和正文都还是空的，这条记录就是误触留下的，删掉它。
   * @returns {boolean} 是否真的删了
   */
  async function dropIfEmpty(id) {
    const item = (records.value || []).find(i => i.id === id)
    if (!item) return false
    const emptyTitle = !(item.name || '').trim()
    const emptyBody = !(item.wiki || '').trim()
    // 2026-11-22：不再有子词条，「有没有子词条」这个条件自然消失
    if (emptyTitle && emptyBody) {
      await deleteRecord(id)
      return true
    }
    return false
  }

  // ========== 图片回收（A02） ==========

  /**
   * 收集正文里引用到的所有图片 id。
   * 「全」是唯一正确性要求：dropUnused 会删掉不在集合里的图，少走一个字段就删掉还在用的图。
   * 2026-11-22：只走记录本身（子词条下线，不再递归 children）。
   * 注意：别的账号的旧数据若没跑过迁移，这里也读不到它们的 children → 那些图会被当孤儿清掉。
   * 这是可接受的：用户已确认子词条功能整体下线，那些图本来也没有入口能看到了。
   */
  function collectUsedImageIds(lists) {
    const used = new Set()
    const source = Array.isArray(lists) && lists.length ? lists : [records.value || []]
    source.forEach(list => {
      if (!Array.isArray(list)) return
      list.forEach(item => {
        if (!item || typeof item !== 'object') return
        extractImageIds(item.wiki || '').forEach(id => used.add(id))
      })
    })
    return used
  }

  /**
   * 回收没人引用的图片。
   * 引用集合 = 本机所有账号的记录正文（图片库是全设备单库）；
   * 当前账号取内存那份（落盘是异步的，刚删完照落盘算等于永远清不掉）。
   * 失败只留痕、不弹窗：后果只是「图多留一会儿」，不许打断删除流程。
   */
  async function purgeUnusedImages() {
    try {
      const cur = currentStoredKeyState()
      if (!cur.ok) {
        const reason = '当前账号的数据状态不明（' + cur.why + '），这轮不敢判定哪些图是孤儿'
        console.warn('[图片回收] 放弃本轮回收：' + reason)
        return { refused: true, reason }
      }
      const { others, broken } = readOtherAccountsRecords()
      if (broken.length) {
        const reason = '本机有 ' + broken.length + ' 份记录数据读不出来（' + broken[0] + '），这轮不敢判定哪些图是孤儿'
        console.warn('[图片回收] 放弃本轮回收：' + reason)
        return { refused: true, reason }
      }
      const used = collectUsedImageIds([records.value || []].concat(others))
      const r = await dropUnused(used, { allowEmptyRefs: true })
      if (r.refused) console.warn('[图片回收] 被闸门挡下，图片暂时留在库里：', r.reason)
      return r
    } catch (e) {
      console.warn('[图片回收] 失败，图片暂时留在库里（记录本身已删掉）：', e && e.message)
      return { refused: true, reason: '清理失败：' + (e && e.message) }
    }
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
    dropIfEmpty,
    collectUsedImageIds,
    purgeUnusedImages,
    syncCreatorName
  }
}
