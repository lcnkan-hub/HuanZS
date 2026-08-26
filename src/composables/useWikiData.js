/**
 * 百科数据库积木
 * 集中管理所有百科条目的增删改查、搜索、导入导出
 * 支持主词条-子词条的二级嵌套结构
 */
import { useLocalStorage } from './useLocalStorage'
import { ALL_CATEGORIES, STORAGE_KEYS } from '../constants/categories'
import { getCurrentTimeString } from '../utils/uniqueId'

export function useWikiData() {
  let _idCounter = 0
  function genItemId(){return Date.now().toString(36)+('_'+(_idCounter++))}
  const { data: dbData, error: storageError } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })

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
      time: getCurrentTimeString()
    }
    dbData.value[category].push(newItem)
    return newItem
  }

  /** 删除条目 */
  function deleteItem(category, id) {
    // 清理子词条引用的图片（由外部调用 dropUnused）
    dbData.value[category] = dbData.value[category].filter(i => i.id !== id)
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

  /** 删除主词条下的子词条 */
  function deleteChildItem(category, parentId, childId) {
    const parent = dbData.value[category].find(i => i.id === parentId)
    if (!parent) return
    parent.children = (parent.children || []).filter(c => c.id !== childId)
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
    syncCreatorName,
    exportData,
    importData,
    validateImportData
  }
}
