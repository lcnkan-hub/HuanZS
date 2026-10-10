/**
 * 首屏 Tab 记忆积木（2026-10-10 · I03 方案 B）
 *
 * 口径：首次进来 → 王冠（产品叫王冠，第一眼就该是王冠）；之后 → 你上次待的地方。
 * 为什么要"之后记住"：百科是内容主体，重度用户常去的可能是笔记或生活，
 * 每次冷启动都把他扔到王冠，等于每次都要多点一下。首次的表态和重复使用的效率，两个都要。
 *
 * 非法值一律回落王冠：Tab 名可能因为版本改动（旧值已下线）或手改存储而失效，
 * 读到一个不存在的 Tab 会让界面整块空白 —— 宁可回王冠。
 */
import { STORAGE_KEYS, TAB_IDS } from '../constants/categories'
import { readJSON, writeJSON } from '../services/storageAdapter'

/** 首次进来的落地页：王冠 */
export const DEFAULT_TAB = 'crown'

/** 读上次停留的 Tab；没存过 / 存的是非法值 → 王冠 */
export function readLastTab() {
  const v = readJSON(STORAGE_KEYS.LAST_TAB, null)
  return typeof v === 'string' && TAB_IDS.includes(v) ? v : DEFAULT_TAB
}

/** 记下当前 Tab（非法值不写，避免把坏值传下去） */
export function writeLastTab(tab) {
  if (typeof tab === 'string' && TAB_IDS.includes(tab)) {
    writeJSON(STORAGE_KEYS.LAST_TAB, tab)
  }
}
