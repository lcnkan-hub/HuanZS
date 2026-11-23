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
 * 从正文里剥掉图片引用，返回干净的纯文字（纯函数）。
 * 2026-11-22 图片改为附件存储（`pics` 字段）后，正文里不该再有 `![alt](id://xxx)`。
 * 同时收掉删行留下的一串空行 —— 否则正文会出现大段空白。
 */
export function stripPicsFromWiki(wiki) {
  if (!wiki) return ''
  return String(wiki)
    .replace(/!\[[^\]]*\]\(id:\/\/[^)]+\)/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 把记录数组规整成「图片附件化」形状（纯函数，不改入参）。
 *
 * 用在哪：备份的**导入 / 恢复**路径。老备份文件里图片还写在正文里（`![alt](id://xxx)`），
 * 直接写回去就绕过了启动时的迁移，等于让「图在正文里」这个旧形态从备份里复活。
 * 新备份已经带 pics，这里只做形状校验。
 *
 * 与 migratePicsOutOfWiki 的区别：那个改 records.value 并落盘，这个只返回新数组。
 */
export function normalizePics(list) {
  if (!Array.isArray(list)) return list
  return list.map(item => {
    if (!item || typeof item !== 'object') return item
    const wiki = item.wiki || ''
    const explicit = Array.isArray(item.pics)
      ? item.pics.filter(pid => typeof pid === 'string' && pid)
      : []
    const fromBody = [...extractImageIds(wiki)]
    const merged = explicit.slice()
    fromBody.forEach(id => { if (!merged.includes(id)) merged.push(id) })
    // 只有真从正文里抽到东西才改正文 —— 否则会把新格式的正文平白 trim 一遍
    return { ...item, wiki: fromBody.length ? stripPicsFromWiki(wiki) : wiki, pics: merged }
  })
}

/**
 * 一次性迁移：把正文里的图片引用搬进 `pics` 字段（图片附件化）。
 * 幂等 —— 正文里没有图片引用、且已经有 pics 数组的记录会被原样放回，不会每个启动都写盘。
 *
 * ⚠️ 这是**不可逆**的：图片从「第几段之后」变成「一律在正文顶部」，
 * 原文里那种「图 1 是界面、图 2 是配色」的指代会失去对应关系。
 * 用户已于 2026-11-22 显式确认接受。
 *
 * @returns {number} 实际改动的记录条数（0 = 本来就不用改）
 */
function migratePicsOutOfWiki() {
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

/**
 * 把「标题」并进正文首行并加粗（2026-11-23 取消标题系统，纯函数）。
 *
 * 为什么不是直接渲染 name：改完之后标题要**可编辑**，而编辑态的载体是正文 textarea。
 * 只有把标题写进 wiki，用户才能改它；留在 name 字段里就永远改不了了。
 *
 * 幂等：正文已经以 `**标题**` 开头时原样返回，重复调用不会叠出两个标题。
 */
export function foldTitleIntoBody(wiki, name) {
  const title = String(name || '').trim()
  if (!title) return String(wiki || '')
  const body = String(wiki || '')
  const head = `**${title}**`
  if (body.startsWith(head)) return body
  return body ? `${head}\n\n${body}` : head
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
function migrateTitleIntoBody() {
  const list = records.value
  if (!Array.isArray(list) || list.length === 0) return 0
  const dirty = list.filter(i => i && typeof i === 'object' && String(i.name || '').trim())
  if (dirty.length === 0) return 0

  // 退路：整份数据先快照一次。失败也不拦迁移（localStorage 满的时候宁可迁完再说），但要留痕。
  const snapKey = scopeKey(STORAGE_KEYS.RECORDS) + '__pre_fold_title'
  try {
    if (localStorage.getItem(snapKey) === null) {
      localStorage.setItem(snapKey, JSON.stringify(list))
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

migrateDropChildren()
// 顺序有意：先剥 children（旧字段），再抽图片（新字段），最后折标题（标题进正文）。
// 三步都幂等，重启多次也只动一次盘。
migratePicsOutOfWiki()
migrateTitleIntoBody()

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
        /**
         * ⚠️ 这一句是图片附件化的保命线（2026-11-22）。
         * 迁移后图片 id 存在 pics 里、正文已经清空，只扫 wiki 会算出「一张图都没被引用」，
         * 于是下一次删任意一条记录，dropUnused 就把全库图片清空 ——
         * 图片库是全设备单库、不分账号，删了没法恢复。少扫一处 = 直接毁数据。
         */
        ;(Array.isArray(item.pics) ? item.pics : []).forEach(id => used.add(id))
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
    updateRecordPics,
    dropIfEmpty,
    collectUsedImageIds,
    purgeUnusedImages,
    syncCreatorName
  }
}
