/**
 * 本地账号积木（2026-10-10 新增）
 * 职责：注册 / 登录 / 退出 / 登录态持久化 / 首个账号认领本机旧数据
 *
 * ⚠️ 诚实边界（不要对外吹成"安全"）：
 *   没有后端 —— 账号表就存在本机 localStorage 里，密码只存「盐 + 哈希」不存明文。
 *   它防的是「别人随手打开我的 app」，**不防「拿到这台设备的人」**：能读 localStorage 就能绕过。
 *   真安全需要后端 + 服务器校验，那是后面的事（对应问题清单 I01）。
 *
 * ⚠️ 登录 / 退出后必须整页重载（location.reload）：
 *   业务 composable 是模块级单例，存储键在 import 时就绑定了，运行中换账号会留下绑旧键的 ref。
 */
import { STORAGE_KEYS } from '../constants/categories'
import { scopeSuffix, setScope, SCOPED_BASE_KEYS } from '../utils/storageScope'

const USERNAME_MIN = 2
const USERNAME_MAX = 20
const PASSWORD_MIN = 6

// ========== 底层读写（设备级键，不走作用域） ==========

function readAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAccounts(list) {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(list))
    return true
  } catch {
    return false // 隐私模式等写入失败 → 让调用方给提示
  }
}

function genAccountId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ========== 对外查询 ==========

/** 账号列表（脱敏：不含 salt / hash） */
export function listAccounts() {
  return readAccounts().map(a => ({
    id: a.id,
    username: a.username,
    createdAt: a.createdAt,
    lastLoginAt: a.lastLoginAt
  }))
}

/** 是否已注册过账号（决定首页显示「登录」还是「注册」） */
export function hasAnyAccount() {
  return readAccounts().length > 0
}

/** 当前登录态（未登录返回 null） */
export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s && s.userId ? s : null
  } catch {
    return null
  }
}

export function isLoggedIn() { return !!getSession() }

/** 当前登录账号（脱敏） */
export function currentAccount() {
  const s = getSession()
  if (!s) return null
  const a = readAccounts().find(x => x.id === s.userId)
  if (!a) return null
  return { id: a.id, username: a.username, createdAt: a.createdAt, lastLoginAt: a.lastLoginAt }
}

// ========== 密码 ==========

function randomSalt() {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 密码哈希：优先 WebCrypto SHA-256（加盐）；环境不支持时退到 djb2。
 * 记录 algo 字段，登录时按记录的算法验 —— 见 verifyPassword。
 */
async function sha256Hex(input) {
  try {
    if (globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.subtle.digest) {
      const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    /* 不可用 → 返回 null，由调用方决定降级还是报错 */
  }
  return null
}

/** djb2 兜底哈希：纯 JS，任何环境都算得出来 */
function djb2Hex(input) {
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
  return 'djb2:' + h.toString(16)
}

/** 注册用：优先 sha256，环境不支持就落 djb2 */
export async function hashPassword(password, salt) {
  const input = salt + '::' + password
  const s = await sha256Hex(input)
  return s ? { algo: 'sha256', hash: s } : { algo: 'djb2', hash: djb2Hex(input) }
}

/**
 * 登录校验：必须按「账号记录里的算法」验，不能跟着当前环境走。
 * 为什么（2026-10-10 真浏览器验收抓到的 bug）：
 *   在没 WebCrypto 的环境注册 → 存的是 djb2；后来环境恢复了 WebCrypto，
 *   如果登录时改用 sha256 去算，跟存的 djb2 永远对不上 → 用户被自己锁在门外。
 * djb2 是纯 JS 永远算得出来；sha256 需要 WebCrypto —— 环境没有时如实说，
 * 不能假装"密码不对"（那会把用户引到改密码，其实密码没错）。
 */
export async function verifyPassword(password, account) {
  const input = account.salt + '::' + password
  const algo = account.algo || 'sha256'
  if (algo === 'djb2') return { ok: djb2Hex(input) === account.hash }
  const s = await sha256Hex(input)
  if (!s) return { ok: false, unavailable: true }
  return { ok: s === account.hash }
}

// ========== 数据认领（首个账号继承本机旧数据） ==========

/**
 * 把「没有账号时代」的旧数据复制到新账号名下。
 * 只复制、不删除旧键 —— 万一账号体系出问题，旧数据还在原地（数据兼容 RULES 第 9 条）。
 * @returns {string[]} 被认领的键（不含后缀的 base key）
 */
export function claimLegacyData(userId) {
  const suffix = scopeSuffix(userId)
  const claimed = []
  SCOPED_BASE_KEYS.forEach(base => {
    try {
      const legacy = localStorage.getItem(base)
      if (legacy === null) return
      const target = base + suffix
      if (localStorage.getItem(target) !== null) return // 该账号已有数据 → 不覆盖
      localStorage.setItem(target, legacy)
      claimed.push(base)
    } catch {
      /* 单个键失败不影响其它键 */
    }
  })
  return claimed
}

// ========== 注册 / 登录 / 退出 ==========

function validateUsername(username) {
  const name = String(username || '').trim()
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return { ok: false, error: `用户名需要 ${USERNAME_MIN}~${USERNAME_MAX} 个字符` }
  }
  return { ok: true, name }
}

function validatePassword(password) {
  const pwd = String(password || '')
  if (pwd.length < PASSWORD_MIN) {
    return { ok: false, error: `密码至少 ${PASSWORD_MIN} 位` }
  }
  return { ok: true, pwd }
}

/**
 * 注册并直接登录（成功后调用方整页重载）。
 * 第一个注册的账号会自动认领本机旧数据。
 */
export async function registerAccount(username, password, confirmPassword) {
  const u = validateUsername(username)
  if (!u.ok) return { ok: false, error: u.error }
  const p = validatePassword(password)
  if (!p.ok) return { ok: false, error: p.error }
  if (typeof confirmPassword === 'string' && confirmPassword !== p.pwd) {
    return { ok: false, error: '两次输入的密码不一致' }
  }

  const accounts = readAccounts()
  const lower = u.name.toLowerCase()
  if (accounts.some(a => String(a.username).toLowerCase() === lower)) {
    return { ok: false, error: '这个用户名已经有人用了，换一个' }
  }

  const isFirst = accounts.length === 0
  const salt = randomSalt()
  const { algo, hash } = await hashPassword(p.pwd, salt)
  const now = new Date().toISOString()
  const account = {
    id: genAccountId(),
    username: u.name,
    salt,
    hash,
    algo,
    createdAt: now,
    lastLoginAt: now
  }
  accounts.push(account)
  if (!writeAccounts(accounts)) {
    return { ok: false, error: '本机存储写不进去（可能是隐私模式或空间已满）' }
  }

  // 首个账号：继承「没有账号时代」的本机数据
  let claimed = []
  if (isFirst) {
    try { claimed = claimLegacyData(account.id) } catch { /* 认领失败不阻断注册 */ }
  }

  seedProfileName(account.id, u.name)
  setSession(account.id)
  return { ok: true, account: { id: account.id, username: account.username }, claimedCount: claimed.length }
}

/** 登录（成功后调用方整页重载） */
export async function loginAccount(username, password) {
  const name = String(username || '').trim()
  const pwd = String(password || '')
  if (!name || !pwd) return { ok: false, error: '用户名和密码都要填' }

  const accounts = readAccounts()
  const lower = name.toLowerCase()
  const account = accounts.find(a => String(a.username).toLowerCase() === lower)
  if (!account) return { ok: false, error: '没有这个用户名' }

  const v = await verifyPassword(pwd, account)
  if (v.unavailable) return { ok: false, error: '这台设备暂时不支持安全哈希，没法验证这个账号（换台设备或更新系统 WebView 再试）' }
  if (!v.ok) return { ok: false, error: '密码不对' }

  account.lastLoginAt = new Date().toISOString()
  writeAccounts(accounts)
  setSession(account.id)
  seedProfileName(account.id, account.username)
  return { ok: true, account: { id: account.id, username: account.username } }
}

/** 退出登录（只清登录态；各账号数据保留在自己的命名空间里，下次登录还在） */
export function logoutAccount() {
  try { localStorage.removeItem(STORAGE_KEYS.SESSION) } catch { /* 忽略 */ }
  setScope(null)
}

/** 写登录态（同时同步内存作用域，重载前两者保持一致） */
function setSession(userId) {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({
      userId,
      loginAt: new Date().toISOString()
    }))
  } catch { /* 忽略 */ }
  setScope(userId)
}

/** 首次进入某账号且没有昵称时，用账号名兜底（昵称在「我的」里可以改）
 *  注意：这里必须用「显式拼出来的账号键」，不能靠模块级当前作用域 ——
 *  注册流程里本函数跑在 setSession 之前，那时作用域还是 null，会写到本机旧键上去（2026-10-10 实测踩到）。 */
function seedProfileName(userId, username) {
  try {
    const key = STORAGE_KEYS.USER + scopeSuffix(userId)
    const raw = localStorage.getItem(key)
    if (raw) {
      const p = JSON.parse(raw)
      if (p && p.name) return // 已有昵称不动它
    }
    localStorage.setItem(key, JSON.stringify({
      id: 'u_' + userId,
      name: username,
      avatar: '🐱'
    }))
  } catch { /* 忽略 */ }
}

/** 重载页面（登录/退出后调用，让存储键在 boot 时重新解析）；测试环境无 location 时跳过 */
export function reloadApp() {
  if (typeof location !== 'undefined' && location && typeof location.reload === 'function') {
    location.reload()
  }
}
