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

const { useChatAI } = await import('../src/composables/useChatAI.js')
const { __clearStateForTest } = await import('../src/services/crisisResponse.js')
const { __clearMemForTest } = await import('../src/services/storageAdapter.js')

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
/** 每条用例前的隔离清理 */
function reset() {
  __clearMemForTest()
  __clearStateForTest()
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
console.log('\n' + '═'.repeat(30))
console.log(`结果: ${passCount} 通过 / ${failCount} 失败 / 共 ${passCount + failCount}`)
if (failCount) {
  for (const f of failures) console.log(`  ✗ ${f.name}\n    → ${f.msg}`)
  process.exit(1)
}
console.log('ALL PASS ✓')
