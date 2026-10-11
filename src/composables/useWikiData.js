/**
 * 百科数据库积木
 * 集中管理所有百科条目的增删改查、搜索、导入导出
 * 支持主词条-子词条的二级嵌套结构
 * 删条目 / 删子词条时连带回收没人引用的图片（A02：此前 dropUnused 全项目零调用点，图只进不出）
 */
import { useLocalStorage } from './useLocalStorage'
import { extractImageIds, dropUnused } from './useImageStore'
import { ALL_CATEGORIES, STORAGE_KEYS } from '../constants/categories'
import { getCurrentTimeString } from '../utils/uniqueId'

/**
 * 模块级单例：全项目共享同一份响应式百科数据。
 * 必须这么做 —— useLocalStorage 的 ref 不感知「外部对 localStorage 的直接写入」，
 * 一旦出现第二个 useWikiData() 调用点（王冠自动记笔记就是第二个），
 * 两边各持一份快照，后写必然覆盖先写，静默丢数据。
 */
const { data: dbData, error: storageError } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })

export function useWikiData() {
  let _idCounter = 0
  function genItemId(){return Date.now().toString(36)+('_'+(_idCounter++))}

  // ========== 查询 ==========

  /** 按分类 + 关键词搜索条目 */
  function searchItems(category, query) {
    const list = dbData.value[category] || []
    if (!query || !query.trim()) return list
    const q = query.trim().toLowerCase()
    return list.filter(item => item.name.toLowerCase().includes(q))
  }

  /** 获取当前用户在各分类下创建的条目 */
  function getMyItems(userName) {
    const result = {}
    ALL_CATEGORIES.forEach(cat => {
      result[cat] = (dbData.value[cat] || []).filter(item => item.creator === userName)
    })
    return result
  }

  // ========== 增删改 ==========

  /** 添加新条目 */
  function addItem(category, name, creator) {
    const newItem = {
      id: genItemId(),
      name: name.trim(),
      wiki: '',
      creator,
      time: getCurrentTimeString(),
      origin: 'user' // 来源：user = 用户手建；crown = 王冠代记（旧数据无此字段，按 user 看待）
    }
    dbData.value[category].push(newItem)
    return newItem
  }

  // ========== 图片回收（A02） ==========

  /**
   * 走一遍全库，收集正文里引用到的所有图片 id。
   *
   * 「全」是这里唯一的正确性要求：dropUnused 会把**不在这个集合里**的图全部删掉，
   * 少走一个字段 = 那张还在用的图被当成孤儿清掉，正文里留下一个坏图，而且一声不吭。
   * 三件事必须同时做到：
   *   ① 三个分类都走 ALL_CATEGORIES，不写死 game/note/life；
   *   ② 主词条正文 item.wiki 走；
   *   ③ 子词条正文走，且**递归**——validateImportData 允许 children 一直套到 10 层，
   *      导入进来的数据真可能更深，只扫一层就会删掉深层正文里的活图。
   * 正文之外没有别的图片引用可存：全项目只有 SubEntryEditor 会插入 id:// 引用（2026-10-11 查过）。
   */
  function collectUsedImageIds() {
    const used = new Set()
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      extractImageIds(node.wiki || '').forEach(id => used.add(id))
      if (Array.isArray(node.children)) node.children.forEach(walk)
    }
    ALL_CATEGORIES.forEach(cat => (dbData.value[cat] || []).forEach(walk))
    return used
  }

  /**
   * 回收没人引用的图片（A02：dropUnused 此前全项目零调用点，是死代码）。
   *
   * 为什么敢传 allowEmptyRefs：引用集合由 collectUsedImageIds() 走**全库**得出，
   * 「集合为空」是真话、不是漏算。不传的话「删掉最后一个带图条目」这个最常见的情况
   * 恰好会被闸门挡下——图照样永久留着，正是本条要修的东西。
   *
   * 失败只留痕、不弹窗：清理失败的后果只是「图多留一会儿」，条目该删已经删掉了；
   * 弹窗会打断删除流程，代价大于收益。但绝不静默——原文进 console。
   */
  async function purgeUnusedImages() {
    try {
      const r = await dropUnused(collectUsedImageIds(), { allowEmptyRefs: true })
      if (r.refused) console.warn('[图片回收] 被闸门挡下，图片暂时留在库里：', r.reason)
      return r
    } catch (e) {
      console.warn('[图片回收] 失败，图片暂时留在库里（条目本身已删掉）：', e && e.message)
      return { refused: true, reason: '清理失败：' + (e && e.message) }
    }
  }

  /** 删除条目（连带回收只被它引用的图片） */
  async function deleteItem(category, id) {
    // 数组先同步改完再 await：App.vue 删完立刻读 dbData 同步界面，不能等图片回收
    dbData.value[category] = dbData.value[category].filter(i => i.id !== id)
    return purgeUnusedImages()
  }

  /** 更新条目的百科正文 */
  function updateItemWiki(category, id, wiki) {
    const item = dbData.value[category].find(i => i.id === id)
    if (item) {
      item.wiki = wiki
      return item
    }
    return null
  }

  // ========== 子词条操作 ==========

  /** 在主词条下添加子词条 */
  function addChildItem(category, parentId, name, creator) {
    const parent = dbData.value[category].find(i => i.id === parentId)
    if (!parent) return null
    if (!parent.children) parent.children = []
    const child = {
      id: genItemId(),
      name: name.trim(),
      wiki: '',
      creator,
      time: getCurrentTimeString()
    }
    parent.children.push(child)
    return child
  }

  /** 删除主词条下的子词条（连带回收只被它引用的图片） */
  async function deleteChildItem(category, parentId, childId) {
    const parent = dbData.value[category].find(i => i.id === parentId)
    if (!parent) return
    parent.children = (parent.children || []).filter(c => c.id !== childId)
    return purgeUnusedImages()
  }

  /** 更新子词条的百科正文 */
  function updateChildWiki(category, parentId, childId, wiki) {
    const parent = dbData.value[category].find(i => i.id === parentId)
    if (!parent) return null
    const child = (parent.children || []).find(c => c.id === childId)
    if (child) {
      child.wiki = wiki
      return child
    }
    return null
  }// ========== 导入导出 ==========

  /** 导出全量数据（深拷贝） */
  function exportData() {
    return JSON.parse(JSON.stringify(dbData.value))
  }

  /** 导入并覆盖全量数据（调用前需做格式校验） */
  function importData(data) {
    dbData.value = data
  }

  /** 校验导入数据的格式合法性（深度检查） */
  function validateImportData(data) {
    if (!data || !Array.isArray(data.game) || !Array.isArray(data.note) || !Array.isArray(data.life)) return false
    const MAX_CHILDREN_DEPTH = 10
    function checkItem(item, depth = 0) {
      if (!item || typeof item !== 'object') return false
      if (!item.id || !item.name) return false
      if (depth > MAX_CHILDREN_DEPTH) return false
      if (item.children) {
        if (!Array.isArray(item.children)) return false
        if (item.children.length > 1000) return false // 单个词条最多1000个子词条
        for (const child of item.children) {
          if (!checkItem(child, depth + 1)) return false
        }
      }
      return true
    }
    for (const cat of ALL_CATEGORIES) {
      if (data[cat].length > 10000) return false // 单分类最多10000个条目
      for (const item of data[cat]) {
        if (!checkItem(item)) return false
      }
    }
    return true
  }

  // ========== 用户名同步（含子词条） ==========

  function syncCreatorName(oldName, newName) {
    ALL_CATEGORIES.forEach(cat => {
      dbData.value[cat].forEach(item => {
        if (item.creator === oldName) {
          item.creator = newName
        }
        if (item.children) {
          item.children.forEach(child => {
            if (child.creator === oldName) {
              child.creator = newName
            }
          })
        }
      })
    })
  }

  return {
    dbData,
    storageError,
    searchItems,
    getMyItems,
    addItem,
    deleteItem,
    updateItemWiki,
    addChildItem,
    deleteChildItem,
    updateChildWiki,
    collectUsedImageIds,
    purgeUnusedImages,
    syncCreatorName,
    exportData,
    importData,
    validateImportData
  }
}
