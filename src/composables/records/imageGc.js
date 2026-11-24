/**
 * 记录删除后的图片回收（A02）（2026-11-24 从 useRecords.js 拆出）
 *
 * 为什么这块要单独成文件：它是全项目**最容易毁数据**的一段。
 * 图片库 `huan_zhong_shu_images` 是全设备单库、不按账号分，而记录是按账号分键的。
 * 只要引用集合算漏一处（少扫 pics、少算别的账号、把"读不出来"当成"没有记录"），
 * 下一次删任意一条记录就会把全库图片清空，而且图片删了没法恢复。
 *
 * 三条保命规则（改动前先读）：
 *   1. 引用集合 = 当前账号内存那份 + **本机所有其它账号**落盘那几份。漏一个账号就毁一件图。
 *   2. 「没数据」和「数据坏了」必须分开：读不出来时**放弃回收**，不许当作空库。
 *   3. 失败只留痕、不弹窗：后果只是「图多留一会儿」，绝不能打断删除流程。
 *
 * 与 useRecords 的关系：这里不持有状态，当前账号的记录数组由调用方传进来；
 * 依赖方向是 useRecords → imageGc，反向禁止。
 */
import { STORAGE_KEYS } from '../../constants/storage'
import { scopeKey, SCOPE_SEP } from '../../utils/storageScope'
import { readRaw, readRawScoped, listKeys } from '../../services/storageAdapter'
import { extractImageIds, dropUnused } from '../useImageStore'

/** 记录数组的合法形状：必须是数组；单项只要是对象就算（老数据可能缺字段） */
export function isRecordArray(v) {
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
export function readOtherAccountsRecords() {
  const base = STORAGE_KEYS.RECORDS
  const curKey = scopeKey(base)
  const others = []
  const broken = []
  const keys = []
  try {
    // 枚举交给适配器（它负责拿不到时的降级），筛「同一条记录键的其它账号命名空间」
    for (const k of listKeys()) {
      if (k !== curKey && (k === base || k.startsWith(base + SCOPE_SEP))) keys.push(k)
    }
  } catch (e) {
    broken.push('枚举本机存储失败：' + (e && e.message))
  }
  keys.forEach(k => {
    let v = null
    try { v = JSON.parse(readRaw(k)) } catch { broken.push(k); return }
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
export function currentStoredKeyState() {
  let raw = null
  try {
    // readRawScoped：不吞异常、也不把「坏数据」变成 null —— 这里必须分清「没数据」和「数据坏了」
    raw = readRawScoped(STORAGE_KEYS.RECORDS)
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

/**
 * 收集正文里引用到的所有图片 id。
 * 「全」是唯一正确性要求：dropUnused 会删掉不在集合里的图，少走一个字段就删掉还在用的图。
 * 2026-11-22：只走记录本身（子词条下线，不再递归 children）。
 * 注意：别的账号的旧数据若没跑过迁移，这里也读不到它们的 children → 那些图会被当孤儿清掉。
 * 这是可接受的：用户已确认子词条功能整体下线，那些图本来也没有入口能看到了。
 *
 * @param {Array[]} [lists] 记录数组的数组（多账号一起算）；不传则只用当前账号内存那份
 * @param {object} records 当前账号的记录 ref
 */
export function collectUsedImageIds(lists, records) {
  const used = new Set()
  const source = Array.isArray(lists) && lists.length
    ? lists
    : [records.value || []]
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
 *
 * @param {object} records 当前账号的记录 ref
 */
export async function purgeUnusedImages(records) {
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
    const used = collectUsedImageIds([records.value || []].concat(others), records)
    const r = await dropUnused(used, { allowEmptyRefs: true })
    if (r.refused) console.warn('[图片回收] 被闸门挡下，图片暂时留在库里：', r.reason)
    return r
  } catch (e) {
    console.warn('[图片回收] 失败，图片暂时留在库里（记录本身已删掉）：', e && e.message)
    return { refused: true, reason: '清理失败：' + (e && e.message) }
  }
}
