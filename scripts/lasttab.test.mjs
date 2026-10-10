/**
 * 首屏 Tab 记忆 · 断言套件（零依赖原生 node）· 配套问题清单 I03「首屏不是王冠」
 * 运行：npm run test:lasttab
 *
 * 为什么单独立一套：DEFAULT_TAB 这个常量**就是 I03 的结论本身**（产品叫王冠，第一眼就该是王冠）。
 * 它哪天被改回 'game'，界面不会报错、不会崩，只是第一眼又偏了 —— 只有这里能拦住。
 * 另一半是坏值兜底：Tab 名会因为版本改动或手改存储而失效，读到一个不存在的 Tab 会让界面整块空白。
 */
// ─────────── 先铺环境，再 import 被测模块 ───────────
// storageScope 在模块加载时就解析登录态，所以 localStorage 必须提前就位
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: k => { store.delete(k) }
}

const { DEFAULT_TAB, readLastTab, writeLastTab } = await import('../src/composables/useLastTab.js')
const { TAB_IDS, STORAGE_KEYS } = await import('../src/constants/categories.js')

let passCount = 0
let failCount = 0
const failures = []
function ok(name, fn) {
  try {
    fn()
    passCount++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failCount++
    failures.push({ name, msg: e.message })
    console.log(`  ✗ ${name}\n    → ${e.message}`)
  }
}
const assert = (await import('node:assert/strict')).default
const reset = () => store.clear()

console.log('\n【冻结物】I03 的结论：首次进来落在王冠')
ok('冻结物: 默认落地页是王冠（不是游戏）', () => assert.equal(DEFAULT_TAB, 'crown'))
ok('冻结物: 合法 Tab 就是导航栏那五个', () => {
  assert.deepEqual([...TAB_IDS].sort(), ['crown', 'game', 'life', 'mine', 'note'])
})

console.log('\n【首次进来 / 存过 / 坏值】')
ok('没存过 → 王冠', () => {
  reset()
  assert.equal(readLastTab(), 'crown')
})
ok('存过 note → note（往返）', () => {
  reset()
  writeLastTab('note')
  assert.equal(readLastTab(), 'note')
})
ok('五个 Tab 都能往返', () => {
  for (const t of TAB_IDS) {
    reset()
    writeLastTab(t)
    assert.equal(readLastTab(), t, t)
  }
})
ok('存的是不存在的 Tab（旧版本遗留下来的）→ 回落王冠，不返回坏值', () => {
  reset()
  store.set(STORAGE_KEYS.LAST_TAB, JSON.stringify('settings'))
  assert.equal(readLastTab(), 'crown')
})
ok('存的不是字符串（数字 / 对象 / 布尔 / null）→ 回落王冠', () => {
  for (const v of [3, {}, true, null, ['crown']]) {
    reset()
    store.set(STORAGE_KEYS.LAST_TAB, JSON.stringify(v))
    assert.equal(readLastTab(), 'crown', JSON.stringify(v))
  }
})
ok('存储里的值损坏（不是 JSON）→ 回落王冠，不抛错', () => {
  reset()
  store.set(STORAGE_KEYS.LAST_TAB, '{"crown')
  assert.equal(readLastTab(), 'crown')
})
ok('写非法值不落盘（不把坏值传下去）', () => {
  reset()
  writeLastTab('note')
  writeLastTab('settings')
  writeLastTab(null)
  assert.equal(readLastTab(), 'note', '非法写入应该被忽略，原值不动')
})
ok('键名就是 STORAGE_KEYS.LAST_TAB（不另起一个）', () => {
  reset()
  writeLastTab('life')
  assert.ok(store.has(STORAGE_KEYS.LAST_TAB), Array.from(store.keys()).join(','))
  assert.equal(JSON.parse(store.get(STORAGE_KEYS.LAST_TAB)), 'life')
})

console.log('\n【账号隔离】换账号不该继承对方的习惯')
ok('LAST_TAB 在「需按账号隔离」表里（首账号认领旧数据时才不会丢）', async () => {
  const { SCOPED_BASE_KEYS } = await import('../src/utils/storageScope.js')
  assert.ok(SCOPED_BASE_KEYS.includes(STORAGE_KEYS.LAST_TAB))
})

console.log('\n══════════════════════════════')
console.log(`结果: ${passCount} 通过 / ${failCount} 失败 / 共 ${passCount + failCount}`)
if (failCount > 0) {
  console.log('\n失败明细:')
  failures.forEach(f => console.log(`  ✗ ${f.name}\n    ${f.msg}`))
  process.exit(1)
} else {
  console.log('ALL PASS ✓')
  process.exit(0)
}
