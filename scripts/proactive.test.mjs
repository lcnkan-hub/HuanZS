/**
 * 王冠主动开口 · 判据验收断言脚本（零依赖原生 node）
 * 运行：npm run test:proactive
 *
 * 为什么单独一套：这条判据是 I02 的命门 —— 错了王冠就会变粘人、或者半夜发消息。
 * 判据是纯函数，所以可以脱离界面把边界全钉死（时间窗两端 / 配额边界 / 间隔边界 / 跨月重置）。
 */
import assert from 'node:assert/strict'

// ── 被测对象（真实源码） ──
const judge = await import('../src/utils/proactiveJudge.js')
const consts = await import('../src/constants/proactive.js')

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

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** 2026-10-15 本地时间的某时某分（判据走本地时间，所以这里也按本地构造） */
const at = (h, m = 0) => new Date(2026, 9, 15, h, m)

/**
 * 必然通过的基线输入：上午 10 点 + 3 天没聊 + 本月 0 条 + 记忆 5 条 + SAFE。
 * 每条用例只改其中一项，这样失败时能一眼看出是哪个条件没拦住。
 */
const base = (now) => ({
  now,
  lastUserAt: now.getTime() - 3 * DAY,
  lastProactiveAt: null,
  monthCount: 0,
  enabled: true,
  memoryCount: 5,
  riskState: 'SAFE'
})

console.log('\n【冻结物】判据数值必须与产品宪法 R1 一致（改了这里就是改宪法）')
ok('冻结物: 月配额 = 3 条', () => assert.equal(consts.PROACTIVE_QUOTA_PER_MONTH, 3))
ok('冻结物: 时间窗 = 6:00–21:30', () => {
  assert.equal(consts.PROACTIVE_WINDOW_START_MIN, 6 * 60)
  assert.equal(consts.PROACTIVE_WINDOW_END_MIN, 21 * 60 + 30)
})
ok('冻结物: 最小间隔 = 20 小时', () => assert.equal(consts.PROACTIVE_MIN_GAP_MS, 20 * HOUR))

console.log('\n【基线】一个必然开口的输入（其余用例都拿它做对照）')
ok('基线: 上午10点 + 3天没聊 + 本月0条 → 开口', () => {
  assert.deepEqual(judge.shouldCrownSpeak(base(at(10))), { speak: true, reason: 'ok' })
})

console.log('\n【时间窗边界】05:59 / 06:00 / 21:29 / 21:30 / 21:31')
for (const [h, m, want, label] of [
  [5, 59, false, '05:59'],
  [6, 0, true, '06:00'],
  [21, 29, true, '21:29'],
  [21, 30, true, '21:30'],
  [21, 31, false, '21:31']
]) {
  ok(`时间窗 ${label} → ${want ? '开口' : '不开口'}`, () => {
    const r = judge.shouldCrownSpeak(base(at(h, m)))
    assert.equal(r.speak, want, `reason=${r.reason}`)
    if (!want) assert.equal(r.reason, 'outside-window')
  })
}
ok('深夜 23:30 → 不开口(outside-window)', () => {
  assert.equal(judge.shouldCrownSpeak(base(at(23, 30))).reason, 'outside-window')
})
ok('凌晨 00:30 → 不开口(outside-window)', () => {
  assert.equal(judge.shouldCrownSpeak(base(at(0, 30))).reason, 'outside-window')
})

console.log('\n【配额边界】第 3 条 vs 第 4 条')
for (const n of [0, 1, 2]) {
  ok(`本月已开口 ${n}/3 → 还能开口`, () => {
    const i = base(at(10)); i.monthCount = n
    assert.equal(judge.shouldCrownSpeak(i).speak, true)
  })
}
ok('本月已开口 3/3（用满）→ 不开口(quota-used)', () => {
  const i = base(at(10)); i.monthCount = 3
  assert.equal(judge.shouldCrownSpeak(i).reason, 'quota-used')
})
ok('本月已开口 4/3（脏数据）→ 不开口(quota-used)', () => {
  const i = base(at(10)); i.monthCount = 4
  assert.equal(judge.shouldCrownSpeak(i).reason, 'quota-used')
})

console.log('\n【间隔边界】距上次互动够不够久')
ok('距用户消息正好 20 小时 → 开口', () => {
  const i = base(at(10)); i.lastUserAt = at(10).getTime() - 20 * HOUR
  assert.equal(judge.shouldCrownSpeak(i).speak, true)
})
ok('距用户消息差 1 分钟不够 20 小时 → 不开口(too-soon)', () => {
  const i = base(at(10)); i.lastUserAt = at(10).getTime() - (20 * HOUR - 60 * 1000)
  assert.equal(judge.shouldCrownSpeak(i).reason, 'too-soon')
})
ok('装完当天聊过（2 小时前）→ 不开口(too-soon)', () => {
  const i = base(at(10)); i.lastUserAt = at(10).getTime() - 2 * HOUR
  assert.equal(judge.shouldCrownSpeak(i).reason, 'too-soon')
})
ok('距用户消息 3 天、但 2 小时前刚主动过 → 不开口(too-soon)', () => {
  const i = base(at(10)); i.lastProactiveAt = at(10).getTime() - 2 * HOUR
  assert.equal(judge.shouldCrownSpeak(i).reason, 'too-soon')
})
ok('距上次主动正好 20 小时 → 开口', () => {
  const i = base(at(10)); i.lastProactiveAt = at(10).getTime() - 20 * HOUR
  assert.equal(judge.shouldCrownSpeak(i).speak, true)
})
ok('从没聊过（lastUserAt = null）→ 不开口(no-user-history)', () => {
  const i = base(at(10)); i.lastUserAt = null
  assert.equal(judge.shouldCrownSpeak(i).reason, 'no-user-history')
})

console.log('\n【开关 / 记忆 / 风险状态】')
ok('用户关掉了开关 → 不开口(disabled)', () => {
  const i = base(at(10)); i.enabled = false
  assert.equal(judge.shouldCrownSpeak(i).reason, 'disabled')
})
ok('关掉开关时优先于其他条件（哪怕时间窗和配额都合适）', () => {
  const i = base(at(10)); i.enabled = false; i.monthCount = 3
  assert.equal(judge.shouldCrownSpeak(i).reason, 'disabled')
})
ok('记忆库为空（0 条）→ 不开口(no-memory)', () => {
  const i = base(at(10)); i.memoryCount = 0
  assert.equal(judge.shouldCrownSpeak(i).reason, 'no-memory')
})
for (const st of ['CONCERN', 'ELEVATED', 'CRITICAL', 'ACTIVE_INTERVENTION']) {
  ok(`风险状态 ${st} → 不开口(risk-state)`, () => {
    const i = base(at(10)); i.riskState = st
    assert.equal(judge.shouldCrownSpeak(i).reason, 'risk-state')
  })
}
ok('风险状态回到 SAFE → 恢复开口', () => {
  const i = base(at(10)); i.riskState = 'SAFE'
  assert.equal(judge.shouldCrownSpeak(i).speak, true)
})

console.log('\n【坏输入】不抛错、不误开口')
ok('now 无法解析 → 不开口(bad-clock)', () => {
  const i = base(at(10)); i.now = 'not-a-date'
  assert.equal(judge.shouldCrownSpeak(i).reason, 'bad-clock')
})
ok('now = null → 不开口(bad-clock)', () => {
  const i = base(at(10)); i.now = null
  assert.equal(judge.shouldCrownSpeak(i).reason, 'bad-clock')
})
ok('空参数 → 不开口且不抛错', () => {
  const r = judge.shouldCrownSpeak()
  assert.equal(r.speak, false)
})
ok('lastUserAt 是无法解析的字符串 → 不开口(no-user-history)', () => {
  const i = base(at(10)); i.lastUserAt = 'garbage'
  assert.equal(judge.shouldCrownSpeak(i).reason, 'no-user-history')
})

console.log('\n【跨月重置】月配额从记录现算，不靠计数器')
const rec = (d) => ({ ts: d.getTime() })
ok('空账本 → 本月 0 条', () => assert.equal(judge.countProactiveInMonth([], at(10)), 0))
ok('本月 3 条 → 3', () => {
  const log = [rec(at(1)), rec(new Date(2026, 9, 2, 9)), rec(new Date(2026, 9, 9, 9))]
  assert.equal(judge.countProactiveInMonth(log, at(10)), 3)
})
ok('上月 3 条 + 本月 1 条 → 本月只算 1（跨月自动归零）', () => {
  const log = [
    rec(new Date(2026, 8, 5, 9)), rec(new Date(2026, 8, 15, 9)), rec(new Date(2026, 8, 25, 9)),
    rec(new Date(2026, 9, 3, 9))
  ]
  assert.equal(judge.countProactiveInMonth(log, at(10)), 1)
})
ok('去年同月（2025-10）不计入 → 0', () => {
  const log = [rec(new Date(2025, 9, 15, 9))]
  assert.equal(judge.countProactiveInMonth(log, at(10)), 0)
})
ok('坏记录（缺 ts / ts 乱）直接跳过，不抛错', () => {
  const log = [{}, { ts: 'garbage' }, { ts: null }, rec(at(9)), null]
  assert.equal(judge.countProactiveInMonth(log, at(10)), 1)
})
ok('log 不是数组 → 0，不抛错', () => {
  assert.equal(judge.countProactiveInMonth(null, at(10)), 0)
  assert.equal(judge.countProactiveInMonth('x', at(10)), 0)
})
ok('配额判断与现算条数联动：上月满 3 条，本月仍能开口', () => {
  const log = [rec(new Date(2026, 8, 5, 9)), rec(new Date(2026, 8, 15, 9)), rec(new Date(2026, 8, 25, 9))]
  const now = at(10)
  const i = base(now)
  i.monthCount = judge.countProactiveInMonth(log, now)
  assert.equal(judge.shouldCrownSpeak(i).speak, true)
})

console.log('\n【纯函数】不改动入参（用户先开口时配额不动，靠的是"只读账本"这条性质）')
ok('判据不改动传入的 input 与账本', () => {
  const log = [rec(at(9))]
  const logSnapshot = JSON.stringify(log)
  const input = base(at(10))
  const inputSnapshot = JSON.stringify(input)
  judge.shouldCrownSpeak(input)
  judge.countProactiveInMonth(log, at(10))
  assert.equal(JSON.stringify(log), logSnapshot)
  assert.equal(JSON.stringify(input), inputSnapshot)
})
ok('同一输入连续两次调用结果一致（无内部状态）', () => {
  const i = base(at(10))
  assert.deepEqual(judge.shouldCrownSpeak(i), judge.shouldCrownSpeak(i))
})

console.log('\n【取时间】从聊天记录 / 账本里提取判据要的两个时间')
ok('取用户最后一次开口：王冠的回复不算，取最后一条 user', () => {
  const msgs = [
    { role: 'assistant', content: '你好', time: '2026/10/11 09:00' },
    { role: 'user', content: '在吗', time: '2026/10/12 20:30' },
    { role: 'assistant', content: '在的', time: '2026/10/12 20:31' },
    { role: 'user', content: '哦', time: '2026/10/13 08:00' }
  ]
  assert.equal(judge.lastUserTime(msgs), '2026/10/13 08:00')
})
ok('只有王冠说过话（刚装完只有欢迎语）→ null', () => {
  assert.equal(judge.lastUserTime([{ role: 'assistant', content: '你好', time: '2026/10/11 09:00' }]), null)
})
ok('最后一条 user 没带时间 → 往前找上一条带时间的 user', () => {
  const msgs = [
    { role: 'user', content: 'a', time: '2026/10/12 20:30' },
    { role: 'user', content: 'b' }
  ]
  assert.equal(judge.lastUserTime(msgs), '2026/10/12 20:30')
})
ok('空 / 非数组 → null，不抛错', () => {
  assert.equal(judge.lastUserTime([]), null)
  assert.equal(judge.lastUserTime(null), null)
  assert.equal(judge.lastUserTime('x'), null)
})
ok('取上次主动开口：账本乱序时取最大 ts，不取最后一条', () => {
  const log = [{ ts: at(12).getTime() }, { ts: at(7).getTime() }]
  assert.equal(judge.lastProactiveTs(log), at(12).getTime())
})
ok('账本没开口过 / 全是坏记录 → null，不抛错', () => {
  assert.equal(judge.lastProactiveTs([]), null)
  assert.equal(judge.lastProactiveTs([{}, { ts: 'garbage' }, null]), null)
  assert.equal(judge.lastProactiveTs(null), null)
})

console.log('\n【真实时间串】聊天记录的 time 是 "YYYY/MM/DD HH:mm"，判据必须能吃下去')
// 这条接的是最危险的缝：聊天记录里的 time 是给人看的格式，判据要的是毫秒。
// 一旦解析不了，gapCheck 会退回 no-user-history —— 王冠从此永远不开口，而且不报错、不崩。
ok('真实聊天记录（王冠+用户混排）→ 判据能解析并放行', () => {
  const msgs = [
    { id: 'welcome', role: 'assistant', content: '你好', time: '2026/10/11 09:00' },
    { id: 'u1', role: 'user', content: '在吗', time: '2026/10/12 20:30' }
  ]
  const now = at(10) // 2026-10-15 10:00，距 10/12 20:30 约 61.5 小时
  const r = judge.shouldCrownSpeak({ ...base(now), lastUserAt: judge.lastUserTime(msgs) })
  assert.equal(r.speak, true, `reason=${r.reason}（解析不了会退成 no-user-history）`)
})
ok('同一格式、但只有 2 小时前 → 拦住(too-soon)', () => {
  const msgs = [{ role: 'user', content: 'x', time: '2026/10/15 08:00' }]
  const r = judge.shouldCrownSpeak({ ...base(at(10)), lastUserAt: judge.lastUserTime(msgs) })
  assert.equal(r.reason, 'too-soon', `reason=${r.reason}`)
})
ok('账本 → lastProactiveTs → 判据 全链：2 小时前刚开口过 → 拦住(too-soon)', () => {
  const now = at(10)
  const log = [{ ts: at(8).getTime(), excerpt: '…' }]
  const r = judge.shouldCrownSpeak({ ...base(now), lastProactiveAt: judge.lastProactiveTs(log) })
  assert.equal(r.reason, 'too-soon', `reason=${r.reason}`)
})

console.log('\n【账本长度上限】裁剪不能剪到当月记录')
ok('冻结物: 账本上限 ≥ 两个月的配额（当月记录永远不会被裁掉）', () => {
  assert.ok(Number.isInteger(consts.PROACTIVE_LOG_MAX))
  assert.ok(consts.PROACTIVE_LOG_MAX >= consts.PROACTIVE_QUOTA_PER_MONTH * 2)
})

// ═══════════════════════════════════════════════════════════════════════════
// 接线验收：真的跑一遍 useProactive（假 localStorage + 假 fetch）
// 上面全是判据的用例。判据全绿、接线接错，照样会出现"永远不开口"或者"一打开就开口"，
// 而这两种坏法都不会报错、不会崩 —— 只能靠这里钉住。
// ═══════════════════════════════════════════════════════════════════════════
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

const KEY_AI = 'huan_zhong_shu_ai_config'
const KEY_LOG = 'crown_proactive_log'
const KEY_STATE = 'crown_crisis_state'
const KEY_ENABLED = 'crown_proactive_enabled'

// useLocalStorage / storageAdapter 读的是裸 localStorage，所以灌一个全局 shim 进去。
// 必须在 import useProactive 之前装好 —— useApiKey 是模块级单例，import 时就取值了。
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => { store.delete(k) }
}
/** 每个用例都从干净的账本出发（AI 密钥已在内存里，清掉也不影响） */
function reset() {
  store.clear()
  store.set(KEY_AI, JSON.stringify({ provider: 'deepseek', apiKey: 'sk-test', savedAt: '' }))
  fetchCalls = []
  fetchReply = '上次说的那个考试，后来还顺利吗'
}
let fetchCalls = []
let fetchReply = ''
const passThroughFetch = async (url, opts) => {
  fetchCalls.push(opts)
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: fetchReply } }] }) }
}
globalThis.fetch = passThroughFetch
reset()

const proactive = await import('../src/composables/useProactive.js')

const pad = (n) => String(n).padStart(2, '0')
/** 复刻 uniqueId.getCurrentTimeString() 的格式：YYYY/MM/DD HH:mm */
const fmt = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

const NOW = new Date(2026, 9, 15, 10, 0) // 10/15 10:00，落在窗口内
const MEM_BLOCK = '【你的已知信息（来自记忆，供自然融入；不要逐条复述，不要显得背诵）】\n- 【事实】你之前说过下周有考试'
/** 一段真实形状的聊天记录：欢迎语 + 用户在 lastUser 那一刻说过话 */
const chat = (lastUser) => [
  { id: 'welcome', role: 'assistant', content: '你好，我是王冠', time: fmt(new Date(lastUser.getTime() - 60000)) },
  { id: 'u1', role: 'user', content: '在吗', time: fmt(lastUser) }
]
const ask = (msgs, over = {}) => proactive.maybeSpeakProactive({
  messages: msgs, memoryCount: 5, memoryBlock: MEM_BLOCK, now: NOW, ...over
})
const THREE_DAYS_AGO = new Date(2026, 9, 12, 20, 30)

console.log('\n【接线 · 该开口时要真开口】')
await okAsync('接线: 条件都满足 → 开口，账本只记 1 条，聊天记录不被改动', async () => {
  reset()
  const msgs = chat(THREE_DAYS_AGO)
  const snapshot = JSON.stringify(msgs)
  const r = await ask(msgs)
  assert.equal(r.spoken, true, `reason=${r.reason}`)
  assert.equal(r.line, fetchReply)
  assert.equal(JSON.stringify(msgs), snapshot, '不该改动传进去的聊天记录')
  const log = proactive.readProactiveLog()
  assert.equal(log.length, 1)
  assert.equal(typeof log[0].ts, 'number', 'ts 必须是毫秒数')
  assert.ok(log[0].excerpt.includes('考试'))
  assert.equal(proactive.proactiveMonthCount(NOW.getTime()), 1)
})
await okAsync('接线: 系统注记里写明了"这一轮是你主动开口"，且记忆块跟着走', async () => {
  reset()
  await ask(chat(THREE_DAYS_AGO))
  assert.equal(fetchCalls.length, 1)
  const body = JSON.parse(fetchCalls[0].body)
  const sys = body.messages[0]
  assert.equal(sys.role, 'system')
  assert.ok(sys.content.includes('本轮是你主动开口'), '不写明这句，模型会以为自己违反了会话节奏那条规则')
  // 10/12 20:30 → 10/15 10:00 是 61.5 小时，按天取整（向下）说"2 天"：宁可少说，不夸大成 3 天
  assert.ok(sys.content.includes('2 天'), `注记里要带上隔了多久，实际=${sys.content.match(/已经有[^没]*没开口/)}`)
  assert.ok(sys.content.includes('你之前说过下周有考试'), '记忆块要带上')
  const last = body.messages[body.messages.length - 1]
  assert.equal(last.role, 'user', '末轮是那条指令性触发（聊天记录里不写它）')
  assert.ok(last.content.includes('跳过'), '触发里要给出"没什么可说"的出口')
  assert.ok(sys.content.includes('跳过'), '注记里也要给出这个出口')
})

console.log('\n【接线 · 不该开口时一次 API 都不发】')
await okAsync('接线: 2 小时前才聊过 → too-soon，不发请求、不记账', async () => {
  reset()
  const r = await ask(chat(new Date(2026, 9, 15, 8, 0)))
  assert.equal(r.reason, 'too-soon')
  assert.equal(fetchCalls.length, 0)
  assert.equal(proactive.readProactiveLog().length, 0)
})
await okAsync('接线: 本月已满 3 条 → quota-used，不发请求', async () => {
  reset()
  store.set(KEY_LOG, JSON.stringify([
    { ts: new Date(2026, 9, 2, 9).getTime(), excerpt: 'a' },
    { ts: new Date(2026, 9, 5, 9).getTime(), excerpt: 'b' },
    { ts: new Date(2026, 9, 9, 9).getTime(), excerpt: 'c' }
  ]))
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.reason, 'quota-used')
  assert.equal(fetchCalls.length, 0)
})
await okAsync('接线: 开关存了 false → disabled（这是用户能关掉的那条路）', async () => {
  reset()
  store.set(KEY_ENABLED, 'false')
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.reason, 'disabled')
  assert.equal(fetchCalls.length, 0)
})
await okAsync('接线: 开关没存过 → 默认开（默认关等于 I02 没做）', async () => {
  reset()
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.spoken, true, `reason=${r.reason}`)
})
await okAsync('接线: 风险状态不是 SAFE → risk-state，不发请求', async () => {
  reset()
  store.set(KEY_STATE, JSON.stringify({ state: 'ELEVATED', last_signal_timestamp: new Date().toISOString() }))
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.reason, 'risk-state')
  assert.equal(fetchCalls.length, 0)
})
await okAsync('接线: 记忆库为空 → no-memory（没有可"想起"的东西就不说话）', async () => {
  reset()
  const r = await ask(chat(THREE_DAYS_AGO), { memoryCount: 0 })
  assert.equal(r.reason, 'no-memory')
  assert.equal(fetchCalls.length, 0)
})

console.log('\n【接线 · 失败了不记账、不占配额】')
await okAsync('接线: 模型回「跳过」→ 不记账（没开口就不该占配额）', async () => {
  reset()
  fetchReply = '跳过'
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.spoken, false)
  assert.equal(r.reason, 'skip')
  assert.equal(fetchCalls.length, 1, '请求发过了')
  assert.equal(proactive.readProactiveLog().length, 0)
})
await okAsync('接线: 模型回「跳过。」（带句号）也认', async () => {
  reset()
  fetchReply = '跳过。'
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.reason, 'skip')
  assert.equal(proactive.readProactiveLog().length, 0)
})
await okAsync('接线: 请求失败（断网）→ 静默放弃，不记账、不抛错', async () => {
  reset()
  globalThis.fetch = async () => { throw new Error('boom') }
  try {
    const r = await ask(chat(THREE_DAYS_AGO))
    assert.equal(r.spoken, false)
    assert.equal(r.reason, 'generate-failed')
    assert.equal(proactive.readProactiveLog().length, 0)
  } finally {
    globalThis.fetch = passThroughFetch
  }
})
await okAsync('接线: 返回空内容 → 不记账', async () => {
  reset()
  fetchReply = '   '
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.spoken, false)
  assert.equal(proactive.readProactiveLog().length, 0)
})

console.log('\n【接线 · 竞态与并发】')
await okAsync('接线: 生成期间用户先开口了 → 这句话作废且不占配额', async () => {
  reset()
  const msgs = chat(THREE_DAYS_AGO)
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push(opts)
    // 模拟"AI 还在想，用户已经自己说话了"
    msgs.push({ id: 'u2', role: 'user', content: '我自己先说', time: fmt(NOW) })
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: fetchReply } }] }) }
  }
  try {
    const r = await ask(msgs)
    assert.equal(r.spoken, false)
    assert.equal(r.reason, 'chat-moved')
    assert.equal(proactive.readProactiveLog().length, 0, '作废的开口不该占配额')
  } finally {
    globalThis.fetch = passThroughFetch
  }
})
await okAsync('接线: 并发两次调用 → 只开口一次、只记 1 条', async () => {
  reset()
  const msgs = chat(THREE_DAYS_AGO)
  const [a, b] = await Promise.all([ask(msgs), ask(msgs)])
  assert.deepEqual([a.reason, b.reason].sort(), ['in-flight', 'ok'])
  assert.equal(fetchCalls.length, 1, '不该并发发两次请求')
  assert.equal(proactive.readProactiveLog().length, 1)
})

console.log('\n【接线 · 跨月与账本长度】')
await okAsync('接线: 上月满 3 条 → 本月照样能开口（配额从记录现算）', async () => {
  reset()
  store.set(KEY_LOG, JSON.stringify([
    { ts: new Date(2026, 8, 5, 9).getTime(), excerpt: 'a' },
    { ts: new Date(2026, 8, 15, 9).getTime(), excerpt: 'b' },
    { ts: new Date(2026, 8, 25, 9).getTime(), excerpt: 'c' }
  ]))
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.spoken, true, `reason=${r.reason}`)
  assert.equal(proactive.readProactiveLog().length, 4, '旧记录保留 + 新增 1 条')
  assert.equal(proactive.proactiveMonthCount(NOW.getTime()), 1, '跨月归零')
})
await okAsync('接线: 账本超长时裁到上限，且当月记录仍在', async () => {
  reset()
  const old = Array.from({ length: 100 }, (_, i) => ({ ts: new Date(2025, 0, 1).getTime() + i * 1000, excerpt: 'x' }))
  store.set(KEY_LOG, JSON.stringify(old))
  const r = await ask(chat(THREE_DAYS_AGO))
  assert.equal(r.spoken, true, `reason=${r.reason}`)
  const log = proactive.readProactiveLog()
  assert.equal(log.length, consts.PROACTIVE_LOG_MAX)
  assert.equal(proactive.proactiveMonthCount(NOW.getTime()), 1, '裁剪不能把当月那条剪掉')
  assert.ok(log[log.length - 1].excerpt.includes('考试'), '最新一条在末尾')
})

console.log('\n【接线 · 开口一次之后，当天不会再开口】')
await okAsync('接线: 连开两次 → 第二次被间隔拦住（不会一天烧两条配额）', async () => {
  reset()
  const msgs = chat(THREE_DAYS_AGO)
  const first = await ask(msgs)
  assert.equal(first.spoken, true, `reason=${first.reason}`)
  // 同一时刻再试一次（模拟退出重进王冠）
  const second = await ask(msgs)
  assert.equal(second.spoken, false)
  assert.equal(second.reason, 'too-soon', `reason=${second.reason}`)
  assert.equal(fetchCalls.length, 1)
  assert.equal(proactive.readProactiveLog().length, 1)
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
