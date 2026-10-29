/**
 * 检索 · 断言套件（零依赖原生 node）· 配套问题清单 I06「语义检索弱」+ A06「全量塞清单」
 * 运行：npm run test:retrieval
 *
 * 这一套守的是什么：**用户换个说法，王冠还找得到那条记录。**
 *
 * 但也守着一条更重要的底线：**不许为了"找得到"而开始乱找。**
 * 原来只做字面 2-gram，改用近义扩展之后，最大的风险不是漏召，
 * 是"问天气也命中租房条目"这类噪音 —— 假命中会让王冠一本正经地答错东西，
 * 比找不到更糟。所以三组断言缺一不可：
 *   A. 同义不同词 → 必须命中（能力）
 *   B. 字面能命中的 → 仍然命中，且走字面通道（不退化）
 *   C. 不相干的 → 一条都不许命中，老实走回退清单（不出噪音）
 *
 * 环境：node 没有 localStorage —— 给一个最小替身（getItem/setItem/removeItem/key/length）。
 * 数据直接塞进百科键，走 status=未登录 的原键（storageScope 在无登录态时返回原键）。
 */
import { register } from 'node:module'
register('./resolve-hook.mjs', import.meta.url)

// ─────────── 最小存储替身 ───────────
const STORE = new Map()
globalThis.localStorage = {
  getItem: k => (STORE.has(k) ? STORE.get(k) : null),
  setItem: (k, v) => STORE.set(String(k), String(v)),
  removeItem: k => STORE.delete(k),
  clear: () => STORE.clear(),
  key: i => Array.from(STORE.keys())[i],
  get length() { return STORE.size }
}

const { STORAGE_KEYS } = await import('../src/constants/categories.js')
const { bigrams, buildQuery, canonicalWordsOf } = await import('../src/utils/textMatch.js')
const { buildWikiContext } = await import('../src/composables/useWikiContext.js')

// ─────────── 断言计分 ───────────
let pass = 0
const fails = []
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fails.push(name + (extra ? ' —— ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' —— ' + extra : '')) }
}

// ─────────── 造库 ───────────
const DB = {
  game: [
    { name: '塞尔达：神庙的圆球机关', wiki: '把圆球推进墙上的坑里，机关门就开了。', time: '2026/10/01 10:00' },
    { name: '艾尔登法环：女武神打法', wiki: '二阶段她跳起来放水鸟乱舞，看到起跳就往侧面跑。', time: '2026/10/05 20:00' }
  ],
  note: [
    { name: '番茄工作法', wiki: '25 分钟专注干活，然后休息 5 分钟，四轮之后休息长一点。', time: '2026/10/10 09:00' },
    { name: '记忆方法：三个要点', wiki: '重复检索、间隔复习、说给别人听。', time: '2026/10/16 21:00' }
  ],
  life: [
    { name: '快递丢了怎么处理', wiki: '先找派件员，再联系网点，最后走平台投诉。', time: '2026/10/12 15:00' },
    { name: '租房要问清的费用', wiki: '押金、中介费、水电费、网费，还有物业费谁出。', time: '2026/10/14 11:00' },
    { name: '做饭的基本顺序', wiki: '先备菜再开火，炒菜前把调料摆到手边。', time: '2026/10/15 18:00' },
    { name: '看病挂号的流程', wiki: '先在手机上挂号选科室，到了自助机取号，再等叫号。', time: '2026/10/17 08:30' }
  ]
}

const loadDb = db => STORE.set(STORAGE_KEYS.DB, JSON.stringify(db))
const HIT_HEADER = '与本次提问相关的条目全文'
const FALLBACK_HEADER = '背景知识，供你理解上下文'

console.log('\nA. 同义不同词 —— 换个说法必须找得到')
loadDb(DB)
const synonymCases = [
  ['包裹不见了我该找谁', '快递丢了怎么处理', '快递 / 包裹 + 丢了 / 不见'],
  ['在家自己烧菜有啥讲究', '做饭的基本顺序', '做饭 / 烧菜'],
  ['去医院挂什么科', '看病挂号的流程', '看病 / 去医院'],
  ['复习过的知识点怎么不忘', '记忆方法：三个要点', '复习 / 不忘 → 记忆'],
  ['一个月花多少钱', '租房要问清的费用', '多少钱 → 费用'],
  ['做饭要注意什么', '做饭的基本顺序', '字面就命中（对照组）']
]
for (const [q, expectName, note] of synonymCases) {
  const ctx = buildWikiContext(q)
  ok(`「${q}」→ ${expectName}（${note}）`, ctx.includes(expectName) && ctx.includes(HIT_HEADER), '实际注入：' + ctx.slice(0, 80).replace(/\n/g, ' '))
}

console.log('\nB. 字面能命中的 —— 必须仍然命中，而且走字面通道（不退化）')
const exactCases = [
  ['女武神怎么打', '女武神打法'],
  ['圆球机关怎么过', '圆球机关'],
  ['番茄工作法是什么', '番茄工作法']
]
for (const [q, expectName] of exactCases) {
  const ctx = buildWikiContext(q)
  const q2 = buildQuery(q)
  ok(`「${q}」→ ${expectName}`, ctx.includes(expectName) && ctx.includes(HIT_HEADER), '实际注入：' + ctx.slice(0, 80).replace(/\n/g, ' '))
  ok(`「${q}」的查询带着字面 gram（exact 非空）`, q2.exact.size > 0, 'exact=0')
}

console.log('\nC. 不相干 —— 一条都不许命中，老实走回退清单')
for (const q of ['今天天气怎么样', '帮我写一段代码', '你好', '今天好累']) {
  const ctx = buildWikiContext(q)
  ok(`「${q}」不产生假命中`, ctx.includes(FALLBACK_HEADER) && !ctx.includes(HIT_HEADER), '实际注入：' + ctx.slice(0, 80).replace(/\n/g, ' '))
}

console.log('\nD. 边界')
STORE.clear()
ok('空库不注入（返回空串）', buildWikiContext('随便问问') === '')

loadDb(DB)
ok('空查询走回退清单', buildWikiContext('').includes(FALLBACK_HEADER))
ok('未登录时不加账号后缀（读到的是原键）', STORE.has(STORAGE_KEYS.DB))

const longDb = JSON.parse(JSON.stringify(DB))
longDb.game[0].wiki = '机关'.repeat(600)
loadDb(longDb)
const longCtx = buildWikiContext('圆球机关怎么过')
const bodyLine = longCtx.split('\n').find(l => l.includes('机关机关'))
ok('超长正文被截断（≤ 600 字 + 省略号）', !!bodyLine && bodyLine.length <= 620 && bodyLine.includes('…'), '长度=' + (bodyLine || '').length)

console.log('\nE. 匹配积木单元')
ok('虚字 gram 被丢掉（"的了是什么" 无有效 gram）', bigrams('的了是什么').size === 0, '得到 ' + [...bigrams('的了是什么')].join(','))
ok('近义扩展对完整说法生效（包裹不见了 → 快递）', canonicalWordsOf('包裹不见了').has('快递'))
ok('近义扩展不吃截断形（花多少钱 → 费用，不会只剩"钱"）', canonicalWordsOf('一个月花多少钱').has('费用'))
ok('无近义变体时 near 为空（不多做一次比对）', buildQuery('圆球机关').near.size === 0, '得到 ' + [...buildQuery('圆球机关').near].join(','))
ok('含近义变体时 near 非空（如"怎么打"→攻略）', buildQuery('女武神怎么打').near.size > 0)

// ─────────── A06：不许全量塞，塞进去的必须"够用且相关" ───────────
console.log('\nF. A06 · 提取提示的预算（记忆 + 百科清单都只带相关条目）')

const { pickRelevant, lineChars } = await import('../src/utils/retrievalSelect.js')

// 记忆场景：200 条，目标条排在最老的位置（按"最近优先"排序时它会被排除）
const makeMemories = n => Array.from({ length: n }, (_, i) => ({
  id: 'M' + String(i + 1).padStart(3, '0'),
  content: i === 199 ? '他在准备前端的实习面试，简历定稿在十月' : `第${i + 1}条无关记录：今天吃了点什么`,
  last_mentioned_at: Date.now() - i * 86400000
}))

const memories = makeMemories(200)
const memPick = pickRelevant(memories, '面试要准备什么', {
  limit: 15, fill: 3, minScore: 2, titleHit: 1, bodyHit: 1,
  getTitle: () => '', getBody: m => m.content
})
ok('记忆：目标条（面试）被挑出来', memPick.picked.some(m => m.id === 'M200'), '挑到 ' + memPick.picked.map(m => m.id).join(','))
ok('记忆：总量不超过硬顶 15', memPick.picked.length <= 15, '实际 ' + memPick.picked.length)
ok('记忆：少给的那条没带偏（无关条目不会被当成相关）', memPick.relevantCount <= 15, 'relevant=' + memPick.relevantCount)

const memPickNone = pickRelevant(memories, '今天天气怎么样', {
  limit: 15, fill: 3, minScore: 2, titleHit: 1, bodyHit: 1,
  getTitle: () => '', getBody: m => m.content
})
ok('记忆：完全无关时只给 3 条兜底（不是 15 条）', memPickNone.picked.length === 3, '实际 ' + memPickNone.picked.length)

// 百科清单场景：300 条标题，目标条在中间
const wikiTitles = Array.from({ length: 300 }, (_, i) => ({
  category: 'game',
  name: i === 249 ? '塞尔达：神庙的圆球机关' : `无关主题${i + 1}`,
  time: `2026/09/${String((i % 28) + 1).padStart(2, '0')}`,
  parent: ''
}))
const wikiAllLines = wikiTitles.map(w => `游戏｜${w.name}｜${w.time}`)
const wikiPick = pickRelevant(wikiTitles, '那个圆球机关怎么过', {
  limit: 40, fill: 12, minScore: 3,
  getTitle: w => w.name, getBody: () => ''
})
const wikiPickedLines = wikiPick.picked.map(w => `游戏｜${w.name}｜${w.time}`)

ok('百科：目标条目进了清单', wikiPick.picked.some(w => w.name.includes('圆球机关')))
ok('百科：清单条数不超过 40（原来是 300）', wikiPick.picked.length <= 40, '实际 ' + wikiPick.picked.length)
ok('百科：提示字符数砍掉一半以上（验收要的 token 对比）',
  lineChars(wikiPickedLines) * 2 < lineChars(wikiAllLines),
  `改前 ${lineChars(wikiAllLines)} 字 → 改后 ${lineChars(wikiPickedLines)} 字`)
ok('百科：库里总数如实报告（清单不全时提示要能说清）', wikiPick.total === 300, 'total=' + wikiPick.total)

// ─────────── 汇总 ───────────
console.log('\n' + '─'.repeat(56))
if (fails.length === 0) {
  console.log(`全部通过：${pass} 条断言`)
  process.exit(0)
} else {
  console.log(`通过 ${pass} / 失败 ${fails.length}`)
  for (const f of fails) console.log('  ✗ ' + f)
  process.exit(1)
}
