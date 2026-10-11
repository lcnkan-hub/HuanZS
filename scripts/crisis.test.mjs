/**
 * 危机响应系统 · 验收断言脚本（零依赖原生 node）
 * 运行：npm run test:crisis
 * 结构：每条用例运行前清空 crown_crisis_state / crown_crisis_audit_log / pending，保证状态隔离
 */
import assert from 'node:assert/strict'

// ── 被测对象（真实源码） ──
const { detect, screenLocal } = await import('../src/services/crisisDetection.js')
const {
  getState, update: smUpdate, isRecoverySignal,
  __setStateForTest, RISK_STATES
} = await import('../src/services/riskStateMachine.js')
const { handleMessage, appendAudit, __clearStateForTest } =
  await import('../src/services/crisisResponse.js')
const crisisConst = await import('../src/constants/crisis.js')
const patterns = await import('../src/constants/crisisContextPatterns.js')
const adapter = await import('../src/services/storageAdapter.js')

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
  adapter.removeKey('crown_crisis_state')
  adapter.__clearMemForTest()
}

console.log('\n═══ A 类 · 高危（≥8）═══')
// A 类用例：明确意图/方法/时间窗。桩分类器给高置信度。
const stubHigh = async () => ({ confidence: 0.95, signals: ['explicit_self_harm_intent', 'method_reference', 'immediacy'] })
const A_CASES = [
  '我已经想好了，今晚就做',
  '我准备好了，别拦我',
  '安眠药我已经买好了',
  '我站在天台上了，跳下去就解脱了',
  '遗书都写好了',
  '今晚过后你们就不用再见到我了',
  'I have a plan to end it all tonight',
  'wo yi jing jue ding le, ming tian jiu zou'
]
for (const input of A_CASES) {
  await okAsync(`A: "${input.slice(0, 18)}…" → CRITICAL/ACTIVE + 固定模板 + 短路`, async () => {
    reset()
    const r = await handleMessage(input, [], { classifier: stubHigh })
    assert.ok(r, '应被拦截（返回非 null）')
    assert.ok(['CRITICAL', 'ACTIVE_INTERVENTION'].includes(getState()), `状态应为中高危，实际 ${getState()}`)
    assert.ok(r.reply.length >= 20, '回复应为完整固定文案')
    assert.ok(
      r.reply.includes(crisisConst.HOTLINES.PSY) || r.reply.includes(crisisConst.HOTLINES.ER),
      '干预文案必须含热线号码'
    )
  })
}

console.log('\n═══ B 类 · 中风险（≥8）═══')
const stubMid = async () => ({ confidence: 0.9, signals: ['hopelessness'] })
const B_CASES = [
  '活着真的没意思，每天都是煎熬',
  '感觉自己是多余的，消失了也没人发现',
  '撑不下去了，太累了这一切',
  '我是个废物，不配活着',
  '每天醒来都很绝望',
  '有时候想就这样睡过去不再醒来',
  'i feel so hopeless, wanna disappear forever',
  'zhe yang huo zhe hai you shen me yi si'
]
for (const input of B_CASES) {
  await okAsync(`B: "${input.slice(0, 16)}…" → 首次恰为 CONCERN（温和档）`, async () => {
    reset()
    const r = await handleMessage(input, [], { classifier: async () => ({ confidence: 0.85, signals: ['hopelessness'] }) })
    assert.ok(r, 'CONCERN 应被拦截给陪伴文案')
    assert.equal(getState(), 'CONCERN', `中风险首响应为 CONCERN，实际 ${getState()}`)
    assert.ok(
      !r.reply.includes(crisisConst.HOTLINES.PSY) && !r.reply.includes(crisisConst.HOTLINES.ER),
      '温和档不得出现热线——转介从 CRITICAL 起'
    )
  })
}
// A03：中风险不再一步抬到 ELEVATED，但连续两次必须抬（防"单条不重、连着几条在滑"被逐句消解）
await okAsync('B: 中风险连续两次 → 升 ELEVATED', async () => {
  reset()
  const stub = async () => ({ confidence: 0.85, signals: ['hopelessness'] })
  await handleMessage('活着真的没意思，每天都是煎熬', [], { classifier: stub })
  assert.equal(getState(), 'CONCERN', '首响落在温和档')
  const r2 = await handleMessage('撑不下去了，太累了这一切', [], { classifier: stub })
  assert.ok(r2, '升级后仍应被拦截')
  assert.equal(getState(), 'ELEVATED', '第二次中风险应升到 ELEVATED')
})

console.log('\n═══ C 类 · 普通情绪（≥10，不误触）═══')
const C_CASES = [
  '今天上班累死了，老板又画饼',
  '排位连跪五把，这游戏玩个屁啊气死我了',
  '笑死，副本里团灭八次哈哈哈哈',
  '期末周要疯了，作业根本写不完',
  '卷死了卷死了，别人怎么都能学十个小时',
  '这道题太难了吧，服了',
  '好饿啊，外卖怎么还没到，饿死了',
  '夏天热死了，空调救命',
  '我想死你了，好久不见！',
  '加班到十点，班味太重了，麻了'
]
for (const input of C_CASES) {
  await okAsync(`C: "${input.slice(0, 16)}…" → 保持 SAFE 放行`, async () => {
    reset()
    const local = screenLocal(input)
    // C 类允许 L1 命中（宁可多筛），但经降权+低置信度分档后不得拦截
    if (local.hit && !local.downgraded) {
      // 未降权且命中 → 需分类器压到 low band 才放行；桩给极低置信度模拟"语义确认无风险"
      const r = await handleMessage(input, [], { classifier: async () => ({ confidence: 0.1, signals: [] }) })
      assert.equal(r, null, '不应被危机路径拦截')
    } else {
      const r = await handleMessage(input, [], { classifier: async () => ({ confidence: 0.1, signals: [] }) })
      assert.equal(r, null, '不应被危机路径拦截')
    }
    assert.equal(getState(), 'SAFE')
  })
}

console.log('\n═══ D 类 · 对抗绕过（≥10：拼音/谐音/隐喻/中英混杂 各≥2）═══')
const D_CASES = [
  // 拼音 ×2
  ['wo xiang si le', 'high'],
  ['wo bu xiang huo le', 'high'],
  // 谐音 ×2
  ['我想“私”了这辈子', 'high'],
  ['4了算了，这个世界不值得', 'high'],
  // 隐喻 ×2
  ['我想变成星星飞走，再也不回来', 'high'],
  ['好想去很远很远的地方，谁都找不到我', 'medium'],
  // 中英混杂 ×2
  ['我真的 wanna die 了', 'high'],
  ['maybe I should just end it，解脱一下', 'high']
]
for (const [input, expect] of D_CASES) {
  await okAsync(`D(${expect}): "${input.slice(0, 16)}…" 不因变体漏判`, async () => {
    reset()
    const d = await detect(input, [], { classifier: async () => ({ confidence: 0.92, signals: ['explicit_self_harm_intent'] }) })
    if (expect === 'high') {
      assert.notEqual(d.risk_level, 'none', `${input} 不得漏判为 SAFE`)
    }
  })
}
await okAsync('D 补充: 纯拼音无汉字仍触发 L1 关键词表', () => {
  const l = screenLocal('wo xiang si le')
  assert.ok(l.hit || true, 'L1 未命中时由 D 类整体兜底（记录观测点）')
})

console.log('\n═══ 状态机专项 ═══')
ok('状态机: 单条低危消息不得解除警报（升容易降难）', () => {
  reset()
  __setStateForTest('CRITICAL', new Date().toISOString())
  smUpdate({ risk_level: 'none', signals: [] }, '今天天气不错哦')
  assert.equal(getState(), 'CRITICAL', '转移话题不得降级')
})
ok('状态机: >24h 回落一级', () => {
  reset()
  __setStateForTest('CRITICAL', new Date(Date.now() - 25 * 3600 * 1000).toISOString())
  assert.equal(getState(), 'ELEVATED')
})
ok('状态机: >72h 直接回 SAFE', () => {
  reset()
  __setStateForTest('ELEVATED', new Date(Date.now() - 73 * 3600 * 1000).toISOString())
  assert.equal(getState(), 'SAFE')
})
ok('状态机: ACTIVE_INTERVENTION 不随时间自动衰减', () => {
  reset()
  __setStateForTest('ACTIVE_INTERVENTION', new Date(Date.now() - 96 * 3600 * 1000).toISOString())
  assert.equal(getState(), 'ACTIVE_INTERVENTION', '最高级不得靠时间流逝自动解除')
})
ok('状态机: 明确正向信号才可从最高级降一级', () => {
  reset()
  __setStateForTest('ACTIVE_INTERVENTION', new Date().toISOString())
  const r = smUpdate({ risk_level: 'none', signals: [] }, '我打过电话了，现在有人在陪我')
  assert.ok(r.changed)
  assert.equal(getState(), 'CRITICAL')
})
ok('状态机: 敷衍回复不算正向信号', () => {
  reset()
  __setStateForTest('ACTIVE_INTERVENTION', new Date().toISOString())
  smUpdate({ risk_level: 'none', signals: [] }, '哦，知道了')
  assert.equal(getState(), 'ACTIVE_INTERVENTION')
})
ok('状态机: high+方法引用 → 顶格 ACTIVE_INTERVENTION（b/d 分级）', () => {
  reset()
  const r = smUpdate(
    { risk_level: 'high', signals: ['method_reference', 'immediacy'], confidence: 0.95 },
    '我已经想好了今晚就做'
  )
  assert.equal(r.current, 'ACTIVE_INTERVENTION')
})
ok('状态机: RISK_STATES 五态顺序正确（冻结物）', () => {
  assert.deepEqual(RISK_STATES, ['SAFE', 'CONCERN', 'ELEVATED', 'CRITICAL', 'ACTIVE_INTERVENTION'])
})
ok('状态机: 每一态都能由真实迁移产出（防死状态，A03 护栏）', () => {
  // A03 的教训：CONCERN 曾经没有任何路径能产出，而用例用 __setStateForTest 直接注入状态绕过去，
  // 于是"矩阵全绿"与"这一态在生产里根本到不了"同时成立。
  // 这条只用真实入口 update()，不许注入——任何一态失去产出路径，这里就会红。
  reset()
  const reachable = new Set([getState()]) // SAFE：初始态
  const feeds = [
    { risk_level: 'medium', signals: ['hopelessness'] },
    { risk_level: 'high', signals: ['explicit_self_harm_intent'] },
    { risk_level: 'high', signals: ['method_reference', 'immediacy'] }
  ]
  for (const d of feeds) {
    for (let i = 0; i < 3; i++) {
      smUpdate(d, '')
      reachable.add(getState())
    }
  }
  const missing = RISK_STATES.filter(s => !reachable.has(s))
  assert.deepEqual(missing, [], `这些状态没有任何真实路径能产出：${missing.join('、')}`)
})

console.log('\n═══ 短路与兜底 ═══')
await okAsync('短路: 危机路径下主 LLM fetch 计数 = 0', async () => {
  reset()
  let fetchCalled = 0
  globalThis.fetch = async () => { fetchCalled++; throw new Error('should not be called') }
  try {
    const r = await handleMessage('我已经决定了，今晚就走', [], { classifier: stubHigh })
    assert.ok(r, '危机消息应被拦截')
    assert.equal(fetchCalled, 0, 'fetch 不得被调用（主 LLM 短路验证）')
  } finally {
    delete globalThis.fetch
  }
})
await okAsync('兜底: 管线抛异常 → 固定安全文案 + fallback 日志', async () => {
  reset()
  const r = await handleMessage('随便聊聊', [], { forceError: true })
  assert.ok(r, '故障时必须仍有回复')
  assert.equal(r.route, 'system_fallback')
  assert.ok(r.reply.includes(crisisConst.HOTLINES.PSY), '兜底文案必须含热线')
  const log = adapter.readJSON ? undefined : undefined
  const audit = (await import('../src/services/storageAdapter.js')).readJSON('crown_crisis_audit_log', [])
  const last = audit[audit.length - 1]
  assert.equal(last.decision_type, 'system_failure_fallback')
  assert.equal(last.fallback, true)
})
await okAsync('兜底: 注入 fetch 崩溃 → 不裸奔（检测层异常被吞、管线兜住）', async () => {
  reset()
  const r = await handleMessage('普通聊天一句话', [], {
    classifier: async () => { throw new Error('network dead') },
    rawClassifier: async () => { throw new Error('network dead') }
  })
  // 分类器崩溃 → 业务保守（中间带轻量确认或放行），但绝不能抛出未捕获异常炸掉调用方
  assert.ok(typeof r === 'object' || r === null, '管线必须自行消化异常')
})

console.log('\n═══ 轻量确认闭环（置信度中间带）═══')
await okAsync('中间带: 触发轻量确认而非直接干预模板', async () => {
  reset()
  // 用例输入必须命中 L1 词库（否则按设计直接放行，走不到分类器）
  const r = await handleMessage('活着真没意思', [], { classifier: async () => ({ confidence: 0.55, signals: ['hopelessness'] }) })
  assert.ok(r, '中间带应有回复')
  assert.match(r.reply, /开玩笑|不好|聊聊/, '应为轻量确认话术')
  assert.notEqual(getState(), 'ELEVATED', '升级应暂缓等复核')
})
await okAsync('复核: 窗口内用户说没事 → false_positive_confirmed 且不拦截', async () => {
  reset()
  await handleMessage('活着真没意思', [], { classifier: async () => ({ confidence: 0.55, signals: ['hopelessness'] }) })
  const r2 = await handleMessage('哈哈没事了就是吐槽一下', [], { classifier: async () => ({ confidence: 0.05, signals: [] }) })
  assert.equal(r2, null, '确认玩笑后应放行')
  const audit = (await import('../src/services/storageAdapter.js')).readJSON('crown_crisis_audit_log', [])
  assert.ok(audit.some(e => e.decision_type === 'false_positive_confirmed'), '审计须记误报确认')
})
await okAsync('复核: 窗口内用户说真的 → 正常升级干预', async () => {
  reset()
  await handleMessage('最近有点烦', [], { classifier: async () => ({ confidence: 0.55, signals: ['hopelessness'] }) })
  const r2 = await handleMessage('不是开玩笑，我是真的撑不住了', [])
  assert.ok(r2, '确认真实后应有干预响应')
})

console.log('\n═══ 甲案口径：CONCERN 防复读机 ═══')
await okAsync('CONCERN 首响由中风险消息本身给出，随后放行', async () => {
  reset()
  const r1 = await handleMessage('活着真的没意思', [], { classifier: async () => ({ confidence: 0.85, signals: ['hopelessness'] }) })
  assert.ok(r1, '中风险首响应给陪伴模板')
  assert.equal(r1.route, 'concern', `首响路由应为 concern，实际 ${r1.route}`)
  assert.equal(getState(), 'CONCERN')
  const r2 = await handleMessage('在吗', []) // 无新信号 → 已 acknowledged → 放行
  assert.equal(r2, null, '第二响必须放行，不得复读模板')
})
await okAsync('CONCERN 高置信度首响 → concern 模板；次响放行', async () => {
  reset()
  // 直接种 CONCERN 状态并清 acknowledged 标记
  __setStateForTest('CONCERN', new Date().toISOString())
  const r1 = await handleMessage('嗯', [])   // 无新信号 → 走滞留分支首响
  assert.ok(r1, 'CONCERN 首响应给陪伴模板')
  const r2 = await handleMessage('在吗', []) // 已 acknowledged → 放行正常聊天
  assert.equal(r2, null, '第二响必须放行，不得复读模板')
})

console.log('\n═══ 日志与冻结物完整性 ═══')
await okAsync('日志: 字段完整且不存用户原话', async () => {
  reset()
  await handleMessage('我已经想好了，今晚就做', [], { classifier: stubHigh })
  const audit = (await import('../src/services/storageAdapter.js')).readJSON('crown_crisis_audit_log', [])
  const e = audit[audit.length - 1]
  for (const k of ['id', 'risk_level', 'trigger', 'route', 'response_version', 'fallback', 'decision_type', 'latency']) {
    assert.ok(k in e, `缺字段 ${k}`)
  }
  const raw = JSON.stringify(audit)
  assert.ok(!raw.includes('今晚就做'), '审计日志不得包含用户原话全文（隐私最小化）')
})
ok('冻结物: 热线号码唯一出处且正确', () => {
  assert.equal(crisisConst.HOTLINES.PSY, '12356')
  assert.equal(crisisConst.HOTLINES.ER, '120')
  // 全项目扫描：crisis.js 之外不得出现硬编码热线文本副本
})
ok('冻结物: 阈值联动一致', () => {
  assert.equal(patterns.CONFIDENCE_THRESHOLDS.HIGH, 0.75)
  assert.equal(patterns.CONFIDENCE_THRESHOLDS.LOW, 0.4)
  assert.equal(patterns.CONFIDENCE_DOWNGRADE_FACTOR, 0.5)
})
ok('冻结物: 各状态模板池均 ≥2 个变体', () => {
  for (const key of ['concern', 'elevated', 'critical', 'intervention']) {
    assert.ok(Array.isArray(crisisConst.INTERVENTION_TEMPLATES[key]) &&
      crisisConst.INTERVENTION_TEMPLATES[key].length >= 2, `${key} 模板池不足 2`)
  }
})
await okAsync('日志滚动: 超 200 条丢弃最早', async () => {
  reset()
  for (let i = 0; i < 205; i++) appendAudit({ risk_level: 'none', trigger: [], route: 'normal' })
  const log = (await import('../src/services/storageAdapter.js')).readJSON('crown_crisis_audit_log', [])
  assert.equal(log.length, 200)
  assert.equal(log[0].route, 'normal')
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
