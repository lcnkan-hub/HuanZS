/**
 * 存储适配器
 * 职责：为危机子系统提供 localStorage 读写；node 测试环境无 localStorage 时自动降级为内存 Map
 * 设计原因：断言脚本要在纯 node 里跑（无浏览器），服务层必须不依赖 window
 */
import { scopeKey } from '../utils/storageScope'

const memStore = new Map()

/** 读 JSON（不存在/损坏返回 fallback） */
export function readJSON(key, fallback = null) {
  const k = scopeKey(key) // 业务数据按登录账号隔离（未登录 / node 测试 = 原键名）
  try {
    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.getItem) {
      const raw = globalThis.localStorage.getItem(k)
      return raw === null ? fallback : JSON.parse(raw)
    }
    const raw = memStore.get(k)
    return raw === undefined ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** 写 JSON */
export function writeJSON(key, value) {
  const k = scopeKey(key)
  const serialized = JSON.stringify(value)
  try {
    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.setItem) {
      globalThis.localStorage.setItem(k, serialized)
      return
    }
  } catch {
    // 隐私模式等写入失败 → 落内存兜底
  }
  memStore.set(k, serialized)
}

/** 清除指定 key（测试隔离用） */
export function removeKey(key) {
  const k = scopeKey(key)
  try {
    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.removeItem) {
      globalThis.localStorage.removeItem(k)
    }
  } catch {
    // 忽略
  }
  memStore.delete(k)
}

/** 测试辅助：清空全部内存态 */
export function __clearMemForTest() {
  memStore.clear()
}
