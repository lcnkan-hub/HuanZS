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

/**
 * 读原始字符串：**不加账号前缀、不做 JSON 解析**（2026-11-24 补）
 *
 * 给「全局键」用：账号表、登录态、`crown_intro_seen` 这些不属于任何账号，
 * 走 readJSON 会被 scopeKey 加上 `@u...` 前缀，读到另一个键上去（等于丢数据）。
 * 值本身就是字符串（'1'）的键也不该被 JSON.parse 折腾。
 *
 * @param {string} key 原始键名（不加工）
 * @returns {string|null}
 */
export function readRaw(key) {
  try {
    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.getItem) {
      return globalThis.localStorage.getItem(key)
    }
  } catch {
    // 隐私模式下可能直接抛 → 落内存兜底
  }
  const raw = memStore.get(key)
  return raw === undefined ? null : raw
}

/** 写原始字符串：同样不加前缀、不做 JSON 化（与 readRaw 配对） */
export function writeRaw(key, value) {
  const serialized = String(value)
  try {
    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.setItem) {
      globalThis.localStorage.setItem(key, serialized)
      return
    }
  } catch {
    // 写失败（配额/隐私模式）→ 内存兜底，行为与 writeJSON 一致
  }
  memStore.set(key, serialized)
}

/**
 * 键 → 实际键（含账号前缀）。给**需要自己拼后缀**的调用方用：
 *   · 快照键（`resolveKey(records) + '__pre_fold_title'`）
 *   · 首账号认领迁移（无前缀旧键 → 带后缀新键）
 * 业务代码不必再直接 import scopeKey，换存储后端时只改这里。
 */
export function resolveKey(key) {
  return scopeKey(key)
}

/**
 * 读**已按账号作用域**的原始字符串，且**不吞异常**（2026-11-24 补）
 *
 * 和 readJSON 的区别只有一点，但是关键的一点：
 *   readJSON 把「键不存在」和「内容坏了」都变成 fallback —— 调用方分不出来。
 *   而记录层需要分清：没数据可以正常写；数据坏了绝不能当空库覆盖（那等于删库）。
 * 读失败会抛给调用方，由它决定是当空库还是拦住操作。
 *
 * @param {string} key 业务键（会加账号前缀）
 * @returns {string|null} 键不存在时为 null
 */
export function readRawScoped(key) {
  const k = scopeKey(key)
  if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.getItem) {
    return globalThis.localStorage.getItem(k) // 可能抛（隐私模式/存储异常）
  }
  const raw = memStore.get(k)
  return raw === undefined ? null : raw
}

/**
 * 枚举本机所有键（原样返回，不加前缀）。读不到时返回 []。
 * 用途：跨账号记录枚举（图片回收要先确认别人的记录没被误判成孤儿）、备份导出。
 */
export function listKeys() {
  const out = []
  try {
    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.length != null) {
      for (let i = 0; i < globalThis.localStorage.length; i++) {
        const k = globalThis.localStorage.key(i)
        if (k) out.push(k)
      }
      return out
    }
  } catch {
    return []
  }
  return [...memStore.keys()]
}

/**
 * 写 JSON，**返回是否真的落到 localStorage**（2026-11-24 补）
 *
 * 和 writeJSON 的区别：writeJSON 写失败会落内存兜底、调用方永远以为成功。
 * 账号表不能这样 —— 存储满时注册必须能如实说「没写进去」，
 * 否则用户重启后发现账号没了，还会以为密码记错了。
 * 所以这里失败就返回 false，**不落内存**（不留「看起来成了」的假象）。
 */
export function tryWriteJSON(key, value) {
  const k = scopeKey(key)
  try {
    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage.setItem) {
      globalThis.localStorage.setItem(k, JSON.stringify(value))
      return true
    }
  } catch {
    return false
  }
  // 没有 localStorage（node 测试）→ 落内存并视为成功，与 readJSON 的读取路径对齐
  memStore.set(k, JSON.stringify(value))
  return true
}

/** 测试辅助：清空全部内存态 */
export function __clearMemForTest() {
  memStore.clear()
}
