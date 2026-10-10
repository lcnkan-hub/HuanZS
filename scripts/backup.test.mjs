/**
 * 备份 / 导入 断言套件（零依赖 · 纯 node）· 配套问题清单 I01「数据会丢」
 * 用法：npm run test:backup
 *
 * 覆盖：导出完整性 / 敏感项绝不入文件 / 导入只写当前账号 / v0 老备份兼容 /
 *       损坏文件被拦且零改动 / 导入前快照 / 回退 / 条数核对 / 本机数据损坏时拒绝导出
 *
 * 环境说明：node 没有 localStorage —— 在此 polyfill；
 *   IndexedDB **故意不** polyfill，用来验证「无 IndexedDB 环境自动降级」这条路径（快照走内存兜底）。
 *   node 也没有 document / navigator → 落文件走 none 分支，只验不抛错与文件名。
 */
// ─────────── 先铺环境，再 import 被测模块 ───────────
// storageScope 在模块加载时就解析登录态，所以 localStorage 必须提前就位
const map = new Map()
globalThis.localStorage = {
  getItem: k => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => { map.set(k, String(v)) },
  removeItem: k => { map.delete(k) },
  clear: () => map.clear(),
  key: i => Array.from(map.keys())[i],
  get length() { return map.size }
}
const CUR = 'CUR123'
localStorage.setItem('huan_zhong_shu_session', JSON.stringify({ userId: CUR, loginAt: '2026-10-10T00:00:00Z' }))

const backup = await import('../src/composables/useBackup.js')
const store = await import('../src/composables/useBackupStore.js')
const { STORAGE_KEYS } = await import('../src/constants/categories.js')
const { scopeKey } = await import('../src/utils/storageScope.js')

// ─────────── 断言工具 ───────────
const chk = []
const ok = (name, cond, extra) => chk.push([name, !!cond, extra])
const sk = k => scopeKey(k)
const set = (k, v) => localStorage.setItem(sk(k), JSON.stringify(v))
const get = k => JSON.parse(localStorage.getItem(sk(k)) || 'null')
const dumpAll = () => JSON.stringify(Array.from(map.entries()).sort())
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─────────── 造一份有代表性的本机数据 ───────────
const db = {
  game: [{
    id: 'g1', name: '艾尔登法环', wiki: '带图：![图](id://img-111)', creator: '刘', time: '2026/10/10 10:00',
    children: [{ id: 'g1c1', name: 'DLC', wiki: '', creator: '刘', time: '2026/10/10 10:01' }]
  }],
  note: [],
  life: [{ id: 'l1', name: '作息', wiki: '', creator: '刘', time: '2026/10/10 10:02' }]
}
set(STORAGE_KEYS.DB, db)
set(STORAGE_KEYS.USER, { id: 'u1', name: '刘', avatar: '🐱' })
set(STORAGE_KEYS.CHAT, [{ id: 'm1', role: 'user', content: '今天好累', time: '2026/10/10 10:03' }])
set(STORAGE_KEYS.MEMORY, [{ id: 'mem1', type: 'goal', content: '准备考研', created_at: '2026-10-01T00:00:00Z' }])
set(STORAGE_KEYS.CRISIS_AUDIT, [{ id: 'a1', ts: '2026-10-10T00:00:00Z', route: 'normal' }])
set(STORAGE_KEYS.CRISIS_PENDING, { active: false, ts: '2026-10-10T00:00:00Z' })
set(STORAGE_KEYS.CRISIS_STATE, { state: 'SAFE', last_signal_timestamp: null })
// 设备级敏感项（用来验证它们绝不进备份）
const FAKE_KEY = 'sk-fake000000000000000000000000000'
localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify({ provider: 'deepseek', apiKey: FAKE_KEY }))
localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify([{ id: CUR, username: 'liu', salt: 'SALTSALT', hash: 'HASHHASH', algo: 'sha256' }]))

// ─────────── A1 导出完整性 ───────────
const payload = await backup.buildBackupPayload()
ok('A1 导出含 user/db/chat/memory/crisis 五段', ['user', 'db', 'chat', 'memory', 'crisis'].every(k => k in payload.data))
ok('A1 db 三分类都是数组', ['game', 'note', 'life'].every(c => Array.isArray(payload.data.db[c])))
ok('A1 crisis 三段齐（null 也保留键）', ['audit_log', 'pending', 'state'].every(k => k in payload.data.crisis))
ok('A1 格式头正确', payload.format === 'huanzhongshu-backup' && payload.schema_version === 1)
ok('A1 空分类也保留（note 是空数组）', Array.isArray(payload.data.db.note) && payload.data.db.note.length === 0)
ok('A1 子词条跟着导出', JSON.stringify(payload.data.db.game[0].children || []).includes('DLC'))
ok('A1 正文里的图片引用原样保留', String(payload.data.db.game[0].wiki).includes('id://img-111'))

// ─────────── A10 条数核对 ───────────
const c = payload.counts
ok('A10 counts 与实际一致', c.wiki_items === 2 && c.memory === 1 && c.chat === 1 && c.images === 0, JSON.stringify(c))

// ─────────── A2/A3 敏感项绝不进备份 ───────────
const serialized = JSON.stringify(payload)
ok('A2 全文无 apiKey 字段名', !/apiKey/.test(serialized))
ok('A2 全文无 session 键名', !/huan_zhong_shu_session/.test(serialized))
ok('A2 全文无 salt/hash 字样', !/"salt"|"hash"|SALTSALT|HASHHASH/.test(serialized))
ok('A3 全文搜不到真实 API 密钥', !serialized.includes(FAKE_KEY))

// ─────────── A4 导入只写「当前账号」 ───────────
const foreign = JSON.parse(JSON.stringify(payload))
foreign.account_label = 'OLDID'
foreign.data.db.life.push({ id: 'l2', name: '从别的设备带来的', wiki: '', creator: '刘', time: '2026/10/10 11:00' })
foreign.counts.wiki_items = 3
const res4 = await backup.importBackup(JSON.stringify(foreign))
ok('A4 导入成功', res4.ok === true, JSON.stringify(res4).slice(0, 200))
ok('A4 数据写进当前账号', String(localStorage.getItem(sk(STORAGE_KEYS.DB))).includes('从别的设备带来的'))
ok('A4 没有任何键带旧账号 id', !Array.from(map.keys()).some(k => k.includes('OLDID')))
ok('A4 写过的键都在当前账号前缀下', (res4.written || []).every(b => map.has(b + '@u' + CUR)), JSON.stringify(res4.written))

// ─────────── A6 损坏文件被拦且零改动 ───────────
const badCases = [
  ['非 JSON', '这不是 json{{{'],
  ['缺 format', JSON.stringify({ schema_version: 1, data: { db: { game: [], note: [], life: [] } } })],
  ['版本过高', JSON.stringify({ format: 'huanzhongshu-backup', schema_version: 99, data: { db: { game: [], note: [], life: [] } } })]
]
for (const [label, content] of badCases) {
  const before = dumpAll()
  const r = await backup.importBackup(content)
  ok('A6 ' + label + ' → 被拦', r.ok === false && !!r.error, JSON.stringify(r))
  ok('A6 ' + label + ' → 存储零改动', dumpAll() === before)
}
{
  const tampered = JSON.parse(JSON.stringify(payload))
  tampered.counts.chat = 999
  const before = dumpAll()
  const r = await backup.importBackup(JSON.stringify(tampered))
  ok('A6 条数对不上 → 被拦', r.ok === false && /条数对不上/.test(r.error), JSON.stringify(r))
  ok('A6 条数对不上 → 存储零改动', dumpAll() === before)
}

// ─────────── A5 v0 老备份兼容 ───────────
{
  const legacyDb = { game: [{ id: 'old1', name: '老备份里的条目', wiki: '', creator: '刘', time: '2026/01/01 00:00' }], note: [], life: [] }
  const beforeMem = localStorage.getItem(sk(STORAGE_KEYS.MEMORY))
  const beforeChat = localStorage.getItem(sk(STORAGE_KEYS.CHAT))
  const r = await backup.importBackup(JSON.stringify(legacyDb))
  ok('A5 老备份能导', r.ok === true && r.legacy === true, JSON.stringify(r))
  ok('A5 百科被覆盖成老备份内容', String(localStorage.getItem(sk(STORAGE_KEYS.DB))).includes('老备份里的条目'))
  ok('A5 记忆没被动', localStorage.getItem(sk(STORAGE_KEYS.MEMORY)) === beforeMem)
  ok('A5 聊天没被动', localStorage.getItem(sk(STORAGE_KEYS.CHAT)) === beforeChat)
}

// ─────────── A7 导入前快照真的存了 ───────────
const snap = await store.readSnapshot()
ok('A7 快照已存', !!snap && !!snap.payload && !!snap.ts, snap ? snap.ts : 'null')
ok('A7 快照里含图片段与 counts', !!snap.payload.images && !!snap.payload.counts)

// ─────────── A8 回退真的能回 ───────────
{
  set(STORAGE_KEYS.DB, { game: [], note: [], life: [{ id: 'junk', name: '导入之后又乱改的', wiki: '', creator: 'x', time: '' }] })
  set(STORAGE_KEYS.MEMORY, [])
  const r = await backup.restoreFromSnapshot()
  const after = get(STORAGE_KEYS.DB)
  ok('A8 回退成功', r.ok === true, JSON.stringify(r))
  ok('A8 百科回到快照状态', JSON.stringify(after).includes('从别的设备带来的'))
  ok('A8 脏数据没了', !JSON.stringify(after).includes('导入之后又乱改的'))
  ok('A8 记忆也回到快照状态', (get(STORAGE_KEYS.MEMORY) || []).length === 1)
}

// ─────────── 拒绝导出「缺件的备份」 ───────────
{
  localStorage.setItem(sk(STORAGE_KEYS.DB), '{坏掉的 json')
  let threw = false
  try { await backup.buildBackupPayload() } catch { threw = true }
  ok('本机数据损坏 → 拒绝导出（不产半份备份）', threw)
  set(STORAGE_KEYS.DB, db)
}

// ─────────── 落文件路径（node 无 document → 走 none，但不能抛） ───────────
{
  const r = await backup.downloadBackup({ includeImages: false })
  ok('downloadBackup 在无 DOM 环境不抛错', r.ok === true && r.filename.endsWith('.json'))
  ok('文件名 ASCII 安全', /^[A-Za-z0-9._-]+\.json$/.test(r.filename), r.filename)
  ok('导出后记下上次导出时间', !!backup.lastExportAt())
}

// ─────────── 无 IndexedDB 环境降级 ───────────
ok('无 IndexedDB 时图片数为 0 且不抛错', payload.images.length === 0)
ok('无 IndexedDB 时快照走内存兜底可用', (await store.snapshotInfo()) !== null)

// ─────────── 汇总 ───────────
await sleep(0)
let pass = 0
for (const [name, cond, extra] of chk) {
  if (cond) { pass++; console.log('PASS  ' + name) } else { console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')) }
}
console.log('--- 备份/导入断言: ' + pass + '/' + chk.length + ' ---')
if (pass !== chk.length) process.exitCode = 1
