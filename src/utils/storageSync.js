/**
 * 跨标签页存储同步积木（2026-10-13 新增 · 对应问题清单 A07「多标签页互相覆盖」）
 *
 * 为什么需要它：全项目原先**没有任何** storage 事件监听 —— 每个 composable 都是模块级单例，
 * 各持一份内存快照；同一个账号开两个标签页编辑，后写的那一边直接覆盖先写的，
 * 没有冲突提示、没有合并、没有报错。用户会静默丢掉一边的改动（连"丢过"都不知道）。
 *
 * 职责：全项目只注册**一次** window 'storage' 监听，按「真实键」（含 @u<账号id> 后缀）派发。
 *
 * 边界（改动前先读）：
 *  1. storage 事件只在**别的标签页**改动时触发（规范如此），本页自己的写入不触发 → 不会自激
 *  2. 键名**精确匹配**：别的账号的同名 base 键不会被派发（账号隔离不能被这条破掉）
 *  3. IndexedDB（图片库）没有 storage 事件 → 不在本积木覆盖范围内
 *  4. 没有 window 的环境（node 测试 / SSR）= 空实现，不抛错
 */

const listeners = new Map() // realKey -> Set<fn>
let installed = false

/** 当前环境的 window（测试可往 globalThis.window 塞替身） */
function envWindow() {
  return typeof globalThis !== 'undefined' && globalThis.window ? globalThis.window : null
}

function safeCall(fn, e) {
  try {
    fn(e)
  } catch (err) {
    // 订阅者（某个 composable 的同步逻辑）出错不许拖垮别人，也不许静默
    console.warn('[存储同步] 订阅者出错：' + (err && err.message))
  }
}

function ensureInstalled() {
  if (installed) return
  const w = envWindow()
  if (!w || typeof w.addEventListener !== 'function') return
  installed = true
  w.addEventListener('storage', (e) => {
    // e.key === null：另一个标签页调了 localStorage.clear() —— 整块存储被清空，所有订阅者都要知道
    if (e.key === null || e.key === undefined) {
      listeners.forEach(set => set.forEach(fn => safeCall(fn, e)))
      return
    }
    const set = listeners.get(e.key)
    if (!set) return
    set.forEach(fn => safeCall(fn, e))
  })
}

/**
 * 订阅某个真实键的外部改动
 * @param {string} realKey 已按账号加过后缀的真实键名（必须传 scopeKey 之后的值）
 * @param {(e: StorageEvent) => void} fn 收到事件时的回调
 * @returns {() => void} 退订函数
 */
export function onExternalChange(realKey, fn) {
  if (!realKey || typeof fn !== 'function') return () => {}
  if (!listeners.has(realKey)) listeners.set(realKey, new Set())
  const set = listeners.get(realKey)
  set.add(fn)
  ensureInstalled()
  return () => {
    set.delete(fn)
    if (!set.size) listeners.delete(realKey)
  }
}

/** 仅供测试：清掉注册状态与订阅者（生产不调用） */
export function __resetStorageSync() {
  listeners.clear()
  installed = false
}
