/**
 * 「静默失败」批量回归断言（问题清单 A01 / A09 / A04 / A05 …）
 * 运行：npm run test:silent
 *
 * 为什么单开一组：这批缺陷的共同点是**出错时不吭声**——用户以为一切正常，其实东西少了。
 * 它们的现场多在「半途接线」与「降级路径」上（调用点顺序、异常分支、存储失败分支），
 * 现有 test:crisis 的 A/B/C/D 矩阵打的是服务层，照不到这些缝，故单列一组：
 * 每条缺陷配一条回归护栏，防止修好之后被后来的改动悄悄推回去。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'

register('./resolve-hook.mjs', import.meta.url)

// node 里没有 localStorage：装一个内存版，并把 alert 收进数组（A09 要跑「解析失败」的真实分支，
// 且要能断言「只弹一次」）。必须在下面所有模块 import 之前装好——有模块在 import 期就读存储。
const store = new Map()
const alerts = []
globalThis.alert = (msg) => { alerts.push(msg) }
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => { store.delete(k) },
  clear: () => store.clear()
}

const { useChatAI } = await import('../src/composables/useChatAI.js')
const { __clearStateForTest } = await import('../src/services/crisisResponse.js')
const { __clearMemForTest } = await import('../src/services/storageAdapter.js')
const { useLocalStorage } = await import('../src/composables/useLocalStorage.js')
const { nextTick } = await import('vue')

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
async function okAsync(name, fn) {
  try {
    await fn()
    passCount++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failCount++
    failures.push({ name, msg: e.message })
    console.log(`  ✗ ${name}\n    → ${e.message}`)
  }
}
/** 每条用例前的隔离清理：危机内存态 + 危机审计 + 存储 shim */
function reset() {
  __clearMemForTest()
  __clearStateForTest()
  store.clear()
}

// ─────────────────────────────────────────────────────────────
console.log('\n═══ A01 · 安全兜底不得被密钥闸门挡住 ═══')
// 缺陷原貌：密钥闸门设在 ask() 之外，没配密钥时危险表达整条落进普通流程、无人接住。
// 契约：危机管线是纯本地的，detectCrisis() 不读密钥。
const { detectCrisis } = useChatAI()

await okAsync('行为: 没配密钥时，高危表达仍被接住', async () => {
  reset()
  const r = await detectCrisis('遗书都写好了', [])
  assert.ok(typeof r === 'string' && r.length > 0, '没配密钥也必须给回复，不能落进普通流程')
})

await okAsync('行为: 没配密钥时，普通聊天不误报', async () => {
  reset()
  const r = await detectCrisis('今天天气不错', [])
  assert.equal(r, null, '无风险应放行，不能把普通聊天当危机')
})

ok('接线: ChatView 里危机检测排在「弹设置窗」之前', () => {
  const src = readFileSync(new URL('../src/components/crown/ChatView.vue', import.meta.url), 'utf8')
  const gate = src.indexOf('if (!aiConfigured.value)')
  assert.ok(gate > -1, '找不到密钥闸门（ChatView 结构变了，本条护栏需同步更新）')
  const block = src.slice(gate)
  const detect = block.indexOf('detectCrisis(')
  const settings = block.indexOf('showAiSettings.value = true')
  assert.ok(detect > -1, '没配密钥的分支里找不到 detectCrisis —— A01 的修复被回退了')
  assert.ok(settings > -1, '没配密钥的分支里找不到设置窗调用')
  assert.ok(detect < settings, '必须"先跑危机检测、再弹设置窗"，否则没密钥时安全兜底整个不跑')
})

// ─────────────────────────────────────────────────────────────
console.log('\n═══ A09 · 本地数据损坏不得被静默顶掉 ═══')
// 缺陷原貌：JSON.parse 失败只 catch 成默认值，不设 error、不提示；
// 下一次任何变更照常 setItem，把损坏原文永久顶掉——发生在用户正常操作过程中，且不可逆。
const CORRUPT_KEY = 'test_silent_corrupt'

await okAsync('行为: 损坏原文不被默认值顶掉', async () => {
  reset()
  const raw = '{"game":[{"id":"a1"' // 截断的 JSON：模拟半损坏
  localStorage.setItem(CORRUPT_KEY, raw)
  const { data, error } = useLocalStorage(CORRUPT_KEY, { game: [], note: [], life: [] })
  assert.deepEqual(data.value, { game: [], note: [], life: [] }, '读不出来时回落默认值（不能崩）')
  assert.equal(localStorage.getItem(CORRUPT_KEY + '__corrupt'), raw, '原始串必须另存副本')
  assert.ok(error.value, '必须如实报错，不能静默')
})

await okAsync('行为: 覆盖发生后原文仍在，且提示不被写入清掉', async () => {
  reset()
  const raw = 'not-json-at-all'
  localStorage.setItem(CORRUPT_KEY, raw)
  const { data, error } = useLocalStorage(CORRUPT_KEY, [])
  data.value = ['新数据'] // 触发 watch 写入——原来这一步就是「覆盖发生的那一刻」
  await nextTick()
  assert.equal(localStorage.getItem(CORRUPT_KEY + '__corrupt'), raw, '覆盖发生后原始串仍要在')
  assert.ok(error.value, '损坏提示不能被这次写入清掉（它恰好在覆盖那一刻消失）')
  assert.deepEqual(JSON.parse(localStorage.getItem(CORRUPT_KEY)), ['新数据'], '正常数据照常落盘')
})

ok('行为: 救援提示只弹一次（多键同时损坏不连环弹窗）', () => {
  assert.equal(alerts.filter(m => /读不出来/.test(m)).length, 1, '本次会话应恰好提示一次')
})

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(30))
console.log(`结果: ${passCount} 通过 / ${failCount} 失败 / 共 ${passCount + failCount}`)
if (failCount) {
  for (const f of failures) console.log(`  ✗ ${f.name}\n    → ${f.msg}`)
  process.exit(1)
}
console.log('ALL PASS ✓')
