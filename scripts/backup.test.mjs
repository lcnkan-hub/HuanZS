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
// 主动开口（I02）与首屏落地页（I03）：换设备后月配额和习惯都不该归零/重置
set(STORAGE_KEYS.PROACTIVE_LOG, [{ ts: 1759999999999, excerpt: '上次说的那个考试' }])
set(STORAGE_KEYS.PROACTIVE_ENABLED, false)
set(STORAGE_KEYS.LAST_TAB, 'note')
// 设备级敏感项（用来验证它们绝不进备份）
const FAKE_KEY = 'sk-fake000000000000000000000000000'
localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify({ provider: 'deepseek', apiKey: FAKE_KEY }))
localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify([{ id: CUR, username: 'liu', salt: 'SALTSALT', hash: 'HASHHASH', algo: 'sha256' }]))

// ─────────── A1 导出完整性 ───────────
const payload = await backup.buildBackupPayload()
ok('A1 导出含 user/db/chat/memory/crisis 五段', ['user', 'db', 'chat', 'memory', 'crisis'].every(k => k in payload.data))
ok('A1 导出含 proactive（账本+开关）与 last_tab', ['proactive', 'last_tab'].every(k => k in payload.data))
ok('A1 主动开口账本原样带走', (payload.data.proactive.log || []).length === 1 && payload.data.proactive.enabled === false && payload.data.last_tab === 'note')
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
ok('A4 首屏落地页与主动开口账本都跟着导入回来', get(STORAGE_KEYS.LAST_TAB) === 'note' && (get(STORAGE_KEYS.PROACTIVE_LOG) || []).length === 1 && get(STORAGE_KEYS.PROACTIVE_ENABLED) === false)
// proactive 两个键是**多段路径**（data.proactive.log / data.proactive.enabled）。
// 曾经按 path[0] 取值 → 整个 {log,enabled} 对象被写进这两个键，账本不再是数组、开关不再是布尔。
ok('A4 账本落盘后仍是数组（多段路径没串味）', Array.isArray(get(STORAGE_KEYS.PROACTIVE_LOG)), JSON.stringify(get(STORAGE_KEYS.PROACTIVE_LOG)))
ok('A4 开关键落盘后是布尔值而不是对象', typeof get(STORAGE_KEYS.PROACTIVE_ENABLED) === 'boolean', JSON.stringify(get(STORAGE_KEYS.PROACTIVE_ENABLED)))

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

// ─────────── 图片 id 提取（2026-10-10 那个"图片永远显示不出来"的 bug 的回归钉）───────────
{
  const { extractImageIds } = await import('../src/composables/useImageStore.js')
  // ⚠️ 必须用**真实形态**的 id：saveImage 生成的是 img-<base36>_<序号>（含字母）。
  //    用纯数字 id 测的话新旧正则都能过 —— 测了等于没测（这正是当初漏掉这个 bug 的原因）。
  const real = extractImageIds('图：![p](id://img-m3k9x_0)')
  ok('正则:真实形态 id（含字母）能提取出来', real.has('img-m3k9x_0'), JSON.stringify([...real]))
  ok('正则:带序号后缀也完整保留', [...real].every(id => !id.endsWith('_')), JSON.stringify([...real]))
  const legacy = extractImageIds('老数据 ![p](id://img-1700000000123)')
  ok('正则:老数据里的纯数字 id 仍兼容', legacy.has('img-1700000000123'), JSON.stringify([...legacy]))
  const multi = extractImageIds('![a](id://img-aaa_0) 和 ![b](id://img-bbb_1)')
  ok('正则:多条引用全部提取', multi.size === 2, JSON.stringify([...multi]))
  ok('正则:非 id:// 的普通图片链接不受影响', extractImageIds('![x](https://a.com/b.png)').size === 0)
}

// ─────────── 落文件方式选择（纯函数 · 优先级即正确性）───────────
{
  const { pickSaver } = backup
  ok('pickSaver 原生壳里必走 native（WebView 里 download 是静默死的）', pickSaver({ isNative: true, canShare: true, canDownload: true }) === 'native')
  ok('pickSaver 原生壳里即使啥都没有也选 native（交给它自己退）', pickSaver({ isNative: true }) === 'native')
  ok('pickSaver 手机浏览器 → webshare', pickSaver({ isNative: false, canShare: true, canDownload: true }) === 'webshare')
  ok('pickSaver 桌面浏览器 → download', pickSaver({ isNative: false, canShare: false, canDownload: true }) === 'download')
  ok('pickSaver 什么都没有 → none（不许假装成功）', pickSaver({}) === 'none')
}

// ─────────── 清理闸门（纯函数：防「把图片库清空」）───────────
{
  const { shouldRefuseDrop } = await import('../src/composables/useImageStore.js')
  ok('闸门:空引用 + 库里有图 → 拒绝', shouldRefuseDrop(0, 5) === true)
  ok('闸门:空引用 + 空库 → 放行（没图可删）', shouldRefuseDrop(0, 0) === false)
  ok('闸门:有引用 → 放行', shouldRefuseDrop(3, 5) === false)
  ok('闸门:显式 allowEmptyRefs 才放行清空', shouldRefuseDrop(0, 5, true) === false)
  ok('闸门:计数拿不到 → 拒绝（宁可不删）', shouldRefuseDrop(NaN, 5) === true)
}

// ─────────── 无 DOM / 无原生壳时的降级 ───────────
ok('无 DOM 环境 via 如实报 none', (await backup.downloadBackup({ includeImages: false })).via === 'none')

/* ── 图片 id 形态的唯一出处见 useImageStore.IMAGE_ID_SOURCE，别在本文件手写 img-\d+ ── */

// ─────────── 正文渲染的正反例钉（2026-10-10：这个 bug 让图片一张都显示不出来）───────────
{
  const { renderMarkdownToHtml } = await import('../src/utils/markdownParser.js')
  // ★ 正向：真实形态 id（含字母）必须真的生成 <img> —— 旧代码在 sanitizeUrl 就把它拦掉了
  const html = renderMarkdownToHtml('看图：![p](id://img-m3k9x_0)')
  ok('渲染:真实形态 id 生成 md-image', html.includes('class="md-image"'), html.slice(0, 120))
  ok('渲染:src 保留 id:// 原引用（交给后面换 blob）', html.includes('data-img-src="id://img-m3k9x_0"'), html.slice(0, 160))
  ok('渲染:不再把图片语法当普通文字输出', !html.includes('![p]'), html.slice(0, 120))
  // 老数据里的纯数字 id 仍要能渲染
  ok('渲染:老数据纯数字 id 仍可渲染', renderMarkdownToHtml('![p](id://img-1700000000123)').includes('class="md-image"'), '')
  // ★ 反向：注入与非法 URL 必须仍然被拦住（安全回归，不能被这次放宽搞崩）
  const bad = renderMarkdownToHtml('![x](javascript:alert(1))')
  ok('渲染:javascript: 仍被拦（不放宽安全）', !bad.includes('<img'), bad.slice(0, 120))
  const inj = renderMarkdownToHtml('![x](id://img-1" onerror="alert(1))')
  // 被拦 = **不生成 img**（原文当纯文本保留，所以字面上还能看到 onerror 这几个字符）
  ok('渲染:属性注入不生成 img', !inj.includes('<img'), inj.slice(0, 120))
  ok('渲染:外链图片仍可渲染', renderMarkdownToHtml('![x](https://a.com/b.png)').includes('class="md-image"'), '')
  // 相对路径规则（既有行为，钉住别被后人误改）：必须是 ./ 或 ../ 开头
  ok('渲染:./ 开头的相对路径可渲染', renderMarkdownToHtml('![x](./local/a.png)').includes('class="md-image"'), '')
  ok('渲染:裸相对路径按既有规则仍被拦（不是这次改动引入的）', !renderMarkdownToHtml('![x](local/a.png)').includes('<img'), '')

  // ★ HTML 里待解析图片 id 的提取 —— 这里有"二次转义"这个隐形杀手：
  //   正则里斜杠被多转义一层（\\/）之后，整个正则去匹配"反斜杠+斜杠"，永远匹配不到，
  //   症状是"页面图片不显示"且不报任何错（2026-10-10 在真浏览器里查实并固定）。
  const { findImageRefsInHtml, withBlobSrc } = await import('../src/utils/markdownParser.js')
  const imgHtml = '<img src="id://img-m3k9x_0" alt="q" class="md-image" data-img-src="id://img-m3k9x_0">'
  const refs = findImageRefsInHtml(imgHtml)
  ok('HTML 提取:能抓到待解析的真形态 id', refs.length === 1 && refs[0].id === 'img-m3k9x_0', JSON.stringify(refs))
  ok('HTML 提取:整段匹配到的是整个 <img> 标签（替换要连 src 一起换）', refs.length === 1 && refs[0].full.startsWith('<img') && refs[0].full.endsWith('>'), JSON.stringify(refs))
  ok('HTML 提取:老数据纯数字 id 也能抓', findImageRefsInHtml('<img data-img-src="id://img-1700000000123">').length === 1)
  ok('HTML 提取:没有图片引用时返回空（不误抓）', findImageRefsInHtml('<p>纯文字</p>').length === 0)

  // ★ 换 src 必须**换掉**原来的，不能变成两个 src（2026-10-10：浏览器只认第一个，图片依然是坏的）
  const fixed = withBlobSrc('<img src="id://img-m3k9x_0" alt="q" class="md-image" data-img-src="id://img-m3k9x_0">', 'blob:http://x/abc')
  // 注意：用 `\ssrc="` 计数 —— 宽松的 /src=/ 会把 data-img-src= 也算进去（自己坑自己一次）
  ok('换 src:真正的 src 属性只有一个', (fixed.match(/\ssrc="/g) || []).length === 1, fixed)
  ok('换 src:src 变成 blob', fixed.includes('src="blob:http://x/abc"'), fixed)
  ok('换 src:data-img-src 仍保留 id:// 原引用（便于二次解析）', fixed.includes('data-img-src="id://img-m3k9x_0"'), fixed)
  ok('换 src:没有 src 的标签会补上', withBlobSrc('<img data-img-src="id://img-1">', 'blob:x').includes(' src="blob:x"'))
  ok('换 src:alt/class 等其它属性保留', fixed.includes('alt="q"') && fixed.includes('class="md-image"'), fixed)
}

// ─────────── 汇总 ───────────
await sleep(0)
let pass = 0
for (const [name, cond, extra] of chk) {
  if (cond) { pass++; console.log('PASS  ' + name) } else { console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')) }
}
console.log('--- 备份/导入断言: ' + pass + '/' + chk.length + ' ---')
if (pass !== chk.length) process.exitCode = 1
