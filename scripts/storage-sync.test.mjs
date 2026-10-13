/**
 * 跨标签页存储同步 · 断言套件（零依赖原生 node）· 配套问题清单 A07「多标签页互相覆盖」
 * 运行：npm run test:sync
 *
 * 这一套守的是什么：**同一个账号开两个标签页，不许一边静默吃掉另一边。**
 * 原先全项目没有一处 storage 监听，两边各持一份内存快照，后写的直接覆盖先写的，
 * 没有提示、没有合并、没有报错 —— 用户连"丢过"都不知道。
 *
 * 三条最容易写错、也最容易假绿的：
 *   ① 同步不能回写 —— 回写就成了两个标签页乒乓互写（所以这里数 setItem 调用次数）
 *   ② 账号隔离不能破 —— @u<别人> 的键即使 base 同名，也不许派发进来
 *   ③ 远端写进来的是坏值时，不许拿它覆盖本页内存（保留现场）
 *
 * 环境：node 没有 window / localStorage —— 这里塞替身；window.addEventListener 收到的
 * 处理器被收集起来，测试手动触发（模拟"另一个标签页改了东西"）。
 */
import { register } from 'node:module'
register('./resolve-hook.mjs', import.meta.url)

// ─────────── 替身：localStorage + window ───────────
const store = new Map()
let setItemCalls = 0
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { setItemCalls++; store.set(String(k), String(v)) },
  removeItem: k => store.delete(k),
  clear: () => store.clear()
}
const winHandlers = {}
globalThis.window = {
  addEventListener: (type, fn) => { (winHandlers[type] = winHandlers[type] || []).push(fn) },
  removeEventListener: () => {}
}

// 登录态：当前账号 CUR123（storageScope 在模块加载时解析）
const CUR = 'CUR123'
store.set('huan_zhong_shu_session', JSON.stringify({ userId: CUR, loginAt: '2026-10-01T00:00:00Z' }))

const { nextTick } = await import('vue')
const { useLocalStorage } = await import('../src/composables/useLocalStorage.js')
const { onExternalChange } = await import('../src/utils/storageSync.js')
const { STORAGE_KEYS } = await import('../src/constants/categories.js')
const { scopeKey } = await import('../src/utils/storageScope.js')

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

/** 模拟"另一个标签页改了某个键" */
async function fire(key, newValue) {
  const list = winHandlers.storage || []
  assert.ok(list.length > 0, '本页没有注册 storage 监听 —— 同步根本没装上')
  list.forEach(fn => fn({ key, newValue }))
  await nextTick()
}

console.log('\n【装上了没有】')
await ok('useLocalStorage 一建就会订阅（不必手动调）', () => {
  store.clear()
  setItemCalls = 0
  useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  assert.ok((winHandlers.storage || []).length > 0)
})
await ok('键名用的是真实键（带 @u 后缀），不是 base 名', () => {
  assert.equal(scopeKey(STORAGE_KEYS.DB), STORAGE_KEYS.DB + '@u' + CUR)
})

console.log('\n【同步进来：不再静默丢】')
await ok('★ 另一个标签页改了百科 → 本页数据跟着更新', async () => {
  store.clear(); setItemCalls = 0
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  const remote = { game: [{ id: 'g1', name: '对面写的' }], note: [], life: [] }
  await fire(scopeKey(STORAGE_KEYS.DB), JSON.stringify(remote))
  assert.deepEqual(data.value, remote)
})
await ok('★ 同步时绝不回写（回写 = 两个标签页乒乓互写）', async () => {
  store.clear(); setItemCalls = 0
  const { data } = useLocalStorage(STORAGE_KEYS.MEMORY, [])
  await fire(scopeKey(STORAGE_KEYS.MEMORY), JSON.stringify([{ id: 'm1', content: '对面写的' }]))
  assert.equal(setItemCalls, 0, '同步过程发生了 ' + setItemCalls + ' 次写入')
  assert.equal(data.value.length, 1)
})
await ok('本页自己改 → 照旧写盘（闸门只挡"接受远端值"那一次）', async () => {
  store.clear(); setItemCalls = 0
  const { data } = useLocalStorage(STORAGE_KEYS.MEMORY, [])
  data.value = [{ id: 'm2', content: '我自己写的' }]
  await nextTick()
  assert.equal(setItemCalls, 1)
  assert.ok(store.get(scopeKey(STORAGE_KEYS.MEMORY)).includes('我自己写的'))
})
await ok('连续两次远端同步 → 两次都不回写', async () => {
  store.clear(); setItemCalls = 0
  useLocalStorage(STORAGE_KEYS.CHAT, [])
  await fire(scopeKey(STORAGE_KEYS.CHAT), JSON.stringify([{ id: 'c1' }]))
  await fire(scopeKey(STORAGE_KEYS.CHAT), JSON.stringify([{ id: 'c1' }, { id: 'c2' }]))
  assert.equal(setItemCalls, 0)
})
await ok('远端把键删了（newValue = null）→ 回落默认值，也不回写', async () => {
  store.clear(); setItemCalls = 0
  const { data } = useLocalStorage(STORAGE_KEYS.MEMORY, [])
  data.value = [{ id: 'mine' }]
  await nextTick()
  setItemCalls = 0
  await fire(scopeKey(STORAGE_KEYS.MEMORY), null)
  assert.deepEqual(data.value, [])
  assert.equal(setItemCalls, 0)
})
await ok('★ 远端写进来的是坏 JSON → 不拿它覆盖本页内存（保留现场）', async () => {
  store.clear(); setItemCalls = 0
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  data.value = { game: [{ id: 'keep' }], note: [], life: [] }
  await nextTick()
  const warned = console.warn
  console.warn = () => {}
  await fire(scopeKey(STORAGE_KEYS.DB), '{"game":[')   // 截断的 JSON
  console.warn = warned
  assert.deepEqual(data.value.game, [{ id: 'keep' }])
})

console.log('\n【账号隔离：不能因为同步破一次口】')
await ok('★ 别的账号的同名键 → 不响应（本页数据不动）', async () => {
  store.clear(); setItemCalls = 0
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  data.value = { game: [{ id: 'mine' }], note: [], life: [] }
  await nextTick()
  await fire('huan_zhong_shu_db@uOTHER999', JSON.stringify({ game: [{ id: '别人的' }], note: [], life: [] }))
  assert.deepEqual(data.value.game, [{ id: 'mine' }])
})
await ok('没后缀的裸键 → 也不响应（本页是 @uCUR123 那一个）', async () => {
  store.clear(); setItemCalls = 0
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  data.value = { game: [{ id: 'mine' }], note: [], life: [] }
  await nextTick()
  await fire(STORAGE_KEYS.DB, JSON.stringify({ game: [{ id: '旧的' }], note: [], life: [] }))
  assert.deepEqual(data.value.game, [{ id: 'mine' }])
})
await ok('整块存储被清空（key = null）→ 订阅者收到，回落默认值', async () => {
  store.clear(); setItemCalls = 0
  const { data } = useLocalStorage(STORAGE_KEYS.DB, { game: [], note: [], life: [] })
  data.value = { game: [{ id: 'mine' }], note: [], life: [] }
  await nextTick()
  const list = winHandlers.storage || []
  list.forEach(fn => fn({ key: null, newValue: null }))
  await nextTick()
  assert.deepEqual(data.value, { game: [], note: [], life: [] })
})

console.log('\n【退订与降级】')
await ok('退订之后不再响应', async () => {
  store.clear(); setItemCalls = 0
  let hits = 0
  const off = onExternalChange('some_key', () => { hits++ })
  const fire1 = (winHandlers.storage || [])[winHandlers.storage.length - 1]
  fire1({ key: 'some_key', newValue: '1' })
  off()
  fire1({ key: 'some_key', newValue: '2' })
  assert.equal(hits, 1)
})
await ok('传空键 / 非函数 → 给一个空退订函数，不抛错', () => {
  assert.equal(typeof onExternalChange(null, () => {}), 'function')
  assert.equal(typeof onExternalChange('k', null), 'function')
})
await ok('没有 window 的环境（Node / SSR）→ 静默降级，不抛错', async () => {
  const saved = globalThis.window
  delete globalThis.window
  const fresh = await import('../src/utils/storageSync.js?nofallback')
  assert.equal(typeof fresh.onExternalChange('k', () => {}), 'function')
  globalThis.window = saved
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
