/**
 * 存储健康 · 断言套件（零依赖原生 node）· 配套问题清单 I15「容量硬限」
 * 运行：npm run test:storage
 *
 * 这一套守的是什么：**本机存储满的时候，界面不许假装没事。**
 * 修之前的写法是「弹一句 alert，然后继续跑」—— 内存里的值还在、界面看着正常，
 * 实际这条改动没落盘，刷新就没了，用户还不知道是从哪一刻开始丢的。
 * 所以这里盯三件事：① 失败要记账、账上写的是人话 ② 不许刷屏 ③ 恢复了要销账，
 * 以及一条反向的：**原值绝不能被写坏**（setItem 失败是原子的，我们只需保证不去碰它）。
 *
 * 环境：node 没有 localStorage / alert —— 这里给一个"能撑满"的替身：
 *   超过 quotaBytes 就像浏览器一样抛 QuotaExceededError。测试替身必须**可枚举**
 *   （length/key），否则就测不到容量体检那一段。
 */
import { register } from 'node:module'
register('./resolve-hook.mjs', import.meta.url)

// ─────────── 可控存储替身 ───────────
const bytesOf = (k, v) => (String(k).length + String(v == null ? '' : v).length) * 2

function makeStore(quotaBytes = Infinity) {
  const map = new Map()
  const api = {
    failNext: false,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const total = Array.from(map.entries()).reduce((n, [kk, vv]) => n + bytesOf(kk, vv), 0)
      const after = total - bytesOf(k, map.get(k)) + bytesOf(k, v)
      if (api.failNext || after > quotaBytes) {
        const e = new Error("Failed to execute 'setItem' on 'Storage': exceeded the quota.")
        e.name = 'QuotaExceededError'
        throw e
      }
      map.set(String(k), String(v))
    },
    removeItem: k => map.delete(k),
    clear: () => map.clear(),
    key: i => Array.from(map.keys())[i],
    get length() { return map.size }
  }
  return api
}

const STORE = makeStore(5 * 1024 * 1024)
globalThis.localStorage = STORE
let alerts = 0
globalThis.alert = () => { alerts++ }

// ─────────── 被测模块（必须在替身就位之后 import）───────────
const { nextTick } = await import('vue')
const { useLocalStorage } = await import('../src/composables/useLocalStorage.js')
const health = await import('../src/utils/storageHealth.js')
const { STORAGE_KEYS, KEY_LABELS } = await import('../src/constants/categories.js')

const assert = (await import('node:assert/strict')).default
let pass = 0
let fail = 0
const failed = []
async function ok(name, fn) {
  try {
    await fn()
    pass++
    console.log('  ✓ ' + name)
  } catch (e) {
    fail++
    failed.push({ name, msg: e.message })
    console.log('  ✗ ' + name + '\n    → ' + e.message)
  }
}

const reset = () => {
  STORE.clear()
  STORE.failNext = false
  health.__resetStorageHealth()
  alerts = 0
}

/** 造一次「写失败」：把 failNext 打开，改一次值，等 watch 跑完 */
async function writeFailing(data, value) {
  STORE.failNext = true
  data.value = value
  await nextTick()
  STORE.failNext = false
}

console.log('\n【标签：报账要说人话，不是念键名】')
await ok('基础键 → 人话标签', () => {
  assert.equal(health.labelOfKey(STORAGE_KEYS.DB), '百科条目')
  assert.equal(health.labelOfKey(STORAGE_KEYS.MEMORY), '王冠的记忆')
})
await ok('带账号后缀的键也能翻出来（剥后缀再查表）', () => {
  assert.equal(health.labelOfKey(STORAGE_KEYS.MEMORY + '@uCUR123'), '王冠的记忆')
})
await ok('表里没有的键 → 原样返回，绝不编一个好听的名字', () => {
  assert.equal(health.labelOfKey('some_unknown_key'), 'some_unknown_key')
})
await ok('每个业务键都在标签表里（漏一个用户就会看到键名）', () => {
  for (const k of [STORAGE_KEYS.USER, STORAGE_KEYS.DB, STORAGE_KEYS.CHAT, STORAGE_KEYS.MEMORY]) {
    assert.ok(KEY_LABELS[k], k + ' 没有标签')
  }
})

console.log('\n【写失败：记账、不刷屏、原值不坏】')
// 这一条必须放在本段最前：writeAlerted 是模块级"只弹一次"的闸门，
// 前面任何一次写失败都会把它关上（那正是被测的行为），之后就再也数不到弹窗了。
await ok('弹窗只弹一次（持续的告知交给常驻提示条）', async () => {
  reset()
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  await writeFailing(data, { game: [{ id: 'a' }], note: [], life: [] })
  await writeFailing(data, { game: [{ id: 'b' }], note: [], life: [] })
  assert.equal(alerts, 1)
})
await ok('写不下 → 记一笔，账上是人话标签', async () => {
  reset()
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  await writeFailing(data, { game: [{ id: 'g1' }], note: [], life: [] })
  const f = health.useStorageHealth().failures.value
  assert.equal(f.length, 1)
  assert.equal(f[0].label, '百科条目')
  assert.match(f[0].reason, /空间|quota/i)
})
await ok('内存里的值还在（用户看得见自己刚写的），只是没落盘', async () => {
  reset()
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  STORE.setItem(STORAGE_KEYS.DB, JSON.stringify({ game: [], note: [], life: [] }))  // 先落一份旧的
  await writeFailing(data, { game: [{ id: 'g1' }], note: [], life: [] })
  assert.deepEqual(data.value.game, [{ id: 'g1' }])
})
await ok('★ 原值没被破坏（写失败是原子的，旧数据仍完整）', async () => {
  reset()
  const old = { game: [{ id: 'old' }], note: [], life: [] }
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  STORE.setItem(STORAGE_KEYS.DB, JSON.stringify(old))
  await writeFailing(data, { game: [{ id: 'new' }], note: [], life: [] })
  assert.deepEqual(JSON.parse(STORE.getItem(STORAGE_KEYS.DB)), old)
})
await ok('同一个键连续失败三次 → 只留一条（不刷屏）', async () => {
  reset()
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  await writeFailing(data, { game: [{ id: 'a' }], note: [], life: [] })
  await writeFailing(data, { game: [{ id: 'b' }], note: [], life: [] })
  await writeFailing(data, { game: [{ id: 'c' }], note: [], life: [] })
  assert.equal(health.useStorageHealth().failures.value.length, 1)
})
await ok('两个不同的键都失败 → 两条，各自说清是哪一份', async () => {
  reset()
  const db = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  const mem = useLocalStorage(STORAGE_KEYS.MEMORY, [])
  await writeFailing(db.data, { game: [{ id: 'a' }], note: [], life: [] })
  await writeFailing(mem.data, [{ id: 'm1', type: 'event', content: 'x' }])
  const labels = health.useStorageHealth().failures.value.map(f => f.label).sort()
  assert.deepEqual(labels, ['王冠的记忆', '百科条目'].sort())   // 按字符序，不按我们想要的顺序
})
await ok('★ 空间腾出来、写成功了 → 这笔账要销掉（恢复了就说恢复）', async () => {
  reset()
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  await writeFailing(data, { game: [{ id: 'a' }], note: [], life: [] })
  assert.equal(health.useStorageHealth().failures.value.length, 1)
  data.value = { game: [{ id: 'b' }], note: [], life: [] }   // failNext 已关 → 这次写得进去
  await nextTick()
  assert.equal(health.useStorageHealth().failures.value.length, 0)
})
await ok('销账只销自己那个键，不动别人的账', async () => {
  reset()
  const db = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  const mem = useLocalStorage(STORAGE_KEYS.MEMORY, [])
  await writeFailing(mem.data, [{ id: 'm1' }])
  await writeFailing(db.data, { game: [{ id: 'a' }], note: [], life: [] })
  db.data.value = { game: [{ id: 'b' }], note: [], life: [] }  // db 恢复
  await nextTick()
  const labels = health.useStorageHealth().failures.value.map(f => f.label)
  assert.deepEqual(labels, ['王冠的记忆'])
})

console.log('\n【容量体检】')
await ok('逐键算字节（UTF-16：字符数 ×2）并给出总量', () => {
  reset()
  STORE.setItem('aaa', 'bbbb')          // (3+4)*2 = 14
  const u = health.measureUsage()
  assert.equal(u.totalBytes, 14)
  assert.equal(u.limitBytes, 5 * 1024 * 1024)
  assert.equal(u.byKey[0].key, 'aaa')
})
await ok('最占地方的那一项排在最前，且带人话标签', () => {
  reset()
  STORE.setItem(STORAGE_KEYS.DB, 'x'.repeat(1000))
  STORE.setItem(STORAGE_KEYS.MEMORY, 'y'.repeat(10))
  const u = health.measureUsage()
  assert.equal(u.byKey[0].label, '百科条目')
  assert.ok(u.byKey[0].bytes > u.byKey[1].bytes)
})
await ok('损坏留证（__corrupt）会被标出来，不当普通数据混着报', () => {
  reset()
  STORE.setItem(STORAGE_KEYS.DB + '__corrupt', '{"game"')
  const u = health.measureUsage()
  assert.equal(u.byKey[0].rescue, true)
})
await ok('没有 length/key 的存储替身（老测试桩）→ 体检不抛错、报 0', () => {
  reset()
  const stub = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  const u = health.measureUsage(stub)
  assert.equal(u.totalBytes, 0)
  assert.deepEqual(u.byKey, [])
})
await ok('formatMB 保留一位小数', () => {
  assert.equal(health.formatMB(5 * 1024 * 1024), '5.0 MB')
  assert.equal(health.formatMB(0), '0.0 MB')
  assert.equal(health.formatMB(undefined), '0.0 MB')
})
await ok('真的写满一次：超限后记账、且体检能报出用量', async () => {
  reset()
  const tight = makeStore(2000)   // 2KB 就满
  globalThis.localStorage = tight
  health.__resetStorageHealth()
  const big = { game: [{ id: 'g', wiki: 'x'.repeat(1500) }], note: [], life: [] }
  let threw = false
  try { tight.setItem(STORAGE_KEYS.DB, JSON.stringify(big)) } catch { threw = true }
  assert.ok(threw, '替身必须真的会因为超限抛错')
  health.reportWriteFailure(STORAGE_KEYS.DB, '本机存储空间满了')
  const u = health.useStorageHealth().usage.value
  assert.equal(u.limitBytes, 5 * 1024 * 1024)
  globalThis.localStorage = STORE
})

console.log('\n══════════════════════════════')
console.log(`结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail}`)
if (fail) {
  console.log('\n失败明细:')
  failed.forEach(f => console.log(`  ✗ ${f.name}\n    ${f.msg}`))
  process.exit(1)
} else {
  console.log('ALL PASS ✓')
  process.exit(0)
}
