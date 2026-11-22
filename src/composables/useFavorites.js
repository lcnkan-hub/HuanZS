/**
 * 收藏积木（2026-11-22 新增）
 * 职责：记录「哪些记录被收藏了」，只存 id 列表，**不碰记录本身**。
 *
 * 为什么独立一个键、不往记录上加 favorited 字段：
 *   RULES 第 4 条锁死了记录结构（2026-11-22 起为 {id,name,wiki,creator,time,origin}，
 *   children 随子词条下线一并移除），第 9 条要求新功能不破坏已有 localStorage 数据。
 *   独立键两头都满足 —— 旧记录一个字节没动；万一哪天判错了，删掉这个键就等于从没收藏过。
 *
 * 为什么模块级创建（不用函数内 useLocalStorage）：
 *   列表页和三处菜单各调一次 useFavorites()，必须读到同一份 ref，
 *   否则在 A 卡片点收藏，B 卡片看不到变化。useRecords 是同一个路子。
 */
import { computed } from 'vue'
import { useLocalStorage } from './useLocalStorage'
import { STORAGE_KEYS } from '../constants/categories'

/** 收藏 id 数组：新收的排前面（列表按它倒序展示） */
const { data: favoriteIds } = useLocalStorage(STORAGE_KEYS.FAVORITES, [])

/** 兜底：数据被手改坏成非数组时当空数组用，别让整个列表页崩 */
const ids = computed(() => (Array.isArray(favoriteIds.value) ? favoriteIds.value : []))

/** 是否已收藏 */
export function isFavorite(id) {
  return ids.value.includes(id)
}

/** 收藏 / 取消收藏，返回操作后的状态 */
export function toggleFavorite(id) {
  if (!id) return false
  const list = Array.isArray(favoriteIds.value) ? favoriteIds.value : []
  const i = list.indexOf(id)
  if (i >= 0) {
    list.splice(i, 1)
    favoriteIds.value = [...list]
    return false
  }
  favoriteIds.value = [id, ...list]
  return true
}

/**
 * 洗掉已经不存在的记录 id。
 * 记录被删时收藏不会自己消失（两个键互不相识），不清的话「我的收藏」里
 * 会留着点不开的幽灵条目。传进来的 records 是当前真正的记录数组。
 */
export function pruneFavorites(records) {
  const alive = new Set((Array.isArray(records) ? records : []).map((r) => r.id))
  const list = Array.isArray(favoriteIds.value) ? favoriteIds.value : []
  const kept = list.filter((id) => alive.has(id))
  if (kept.length !== list.length) favoriteIds.value = kept
}

/** 组件里用的完整接口 */
export function useFavorites() {
  return {
    ids,
    count: computed(() => ids.value.length),
    isFavorite,
    toggleFavorite,
    pruneFavorites
  }
}
