/**
 * 图片回收断言套件（零依赖 · 纯 node）· 配套问题清单 A02「图片只进不出」
 * 用法：npm run test:image
 *
 * 覆盖：引用集合走全库（含深层子词条、三个分类）/ 删条目与删子词条后只清孤儿 /
 *       被别的条目还引用着的图绝不能被清 / 库空了也要清 / 闸门没被放宽 / 清理失败不静默也不挡删条目
 *
 * 环境说明：node 没有 localStorage 与 indexedDB —— 都在此铺替身。
 *   替身必须**异步**回回调：生产代码是「先发起请求、再挂回调」的写法，
 *   同步回调会让那些回调永远挂不上（Promise 悬着），测试就成了假绿。
 */
// ─────────── 极简 IndexedDB 替身 ───────────
// 只实现本项目用到的几件事：open / 单 store 的 add·get·delete·getAllKeys / 事务完成回调
function makeIDB() {
  const dbs = new Map()               // 库名 -> Map<store 名, Map<key, record>>
  const ctl = { failTx: false }       // 用来模拟「图片库用不了」（真实场景：隐私模式 / 库已关闭）
  const soon = fn => queueMicrotask(fn)

  function makeDB(bag) {
    return {
      objectStoreNames: { contains: n => bag.has(n) },
      createObjectStore: n => { if (!bag.has(n)) bag.set(n, new Map()) },
      close: () => {},
      transaction: (n) => {
        if (ctl.failTx) throw new Error('图片库已关闭')
        if (!bag.has(n)) throw new Error('One of the specified object stores was not found')
        const map = bag.get(n)
        const tx = { error: null, oncomplete: null, onerror: null, onabort: null }
        const req = fn => {
          const r = { result: undefined, error: null, onsuccess: null, onerror: null }
          soon(() => {
            try { r.result = fn(); r.onsuccess && r.onsuccess({ target: r }) }
            catch (e) { r.error = e; r.onerror && r.onerror({ target: r }) }
          })
          return r
        }
        tx.objectStore = () => ({
          add:        rec => { map.set(rec.id, rec); return req(() => undefined) },
          get:        k   => req(() => map.get(k)),
          delete:     k   => { map.delete(k); return req(() => undefined) },
          getAllKeys: ()  => req(() => Array.from(map.keys()))
        })
        // 真实 IDB 在所有请求之后才回调 oncomplete；这里等本轮微任务跑完再交给宏任务
        setTimeout(() => { tx.oncomplete && tx.oncomplete() }, 0)
        return tx
      }
    }
  }

  return {
    ctl,
    count: (name, store) => (dbs.get(name)?.get(store)?.size ?? 0),
    keys: (name, store) => Array.from(dbs.get(name)?.get(store)?.keys() ?? []),
    api: {
      open (name) {
        const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
        if (!dbs.has(name)) dbs.set(name, new Map())
        const bag = dbs.get(name)
        soon(() => {
          if (!bag.has('images')) {
            bag.set('images', new Map())
            req.onupgradeneeded && req.onupgradeneeded({ target: { result: makeDB(bag) } })
          }
          req.result = makeDB(bag)
          req.onsuccess && req.onsuccess({ target: { result: req.result } })
        })
        return req
      },
      deleteDatabase (name) {
        const r = { onsuccess: null, onerror: null, onblocked: null }
        dbs.delete(name)
        soon(() => r.onsuccess && r.onsuccess())
        return r
      }
    }
  }
}

const idb = makeIDB()
globalThis.indexedDB = idb.api

// localStorage 替身（useLocalStorage 在模块加载时就会读它）
const map = new Map()
globalThis.localStorage = {
  getItem: k => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => { map.set(k, String(v)) },
  removeItem: k => { map.delete(k) },
  clear: () => map.clear(),
  key: i => Array.from(map.keys())[i],
  get length () { return map.size }
}

const { useWikiData } = await import('../src/composables/useWikiData.js')
const { saveImage, dropUnused, IMAGE_DB_NAME, IMAGE_STORE_NAME } = await import('../src/composables/useImageStore.js')
const { STORAGE_KEYS } = await import('../src/constants/categories.js')
const { scopeKey, SCOPE_SEP } = await import('../src/utils/storageScope.js')

// ─────────── 断言工具 ───────────
const chk = []
const ok = (name, cond, extra) => chk.push([name, !!cond, extra])
const imgCount = () => idb.count(IMAGE_DB_NAME, IMAGE_STORE_NAME)
const imgKeys = () => idb.keys(IMAGE_DB_NAME, IMAGE_STORE_NAME)
const fakeFile = n => ({ type: 'image/png', name: n })

const wiki = useWikiData()
const ref = id => '![图](id://' + id + ')'

// ─────────── 造数据 ───────────
// 五张图，各自代表一种引用位置，缺哪一种都会让「引用集合」这个前提失守：
//   imgA 主词条正文 + 另一个分类的条目也引用（★核心：删一边不能伤另一边）
//   imgB 子词条正文
//   imgC 深层子词条正文（导入的数据真可能套到 10 层）
//   imgD 谁都不引用（孤儿）
//   imgE 第三个分类的条目
const imgA = await saveImage(fakeFile('a.png'))
const imgB = await saveImage(fakeFile('b.png'))
const imgC = await saveImage(fakeFile('c.png'))
const imgD = await saveImage(fakeFile('d.png'))
const imgE = await saveImage(fakeFile('e.png'))

wiki.importData({
  game: [{
    id: 'g1', name: '艾尔登法环', wiki: ref(imgA), creator: '刘', time: '2026/10/11 09:00',
    children: [{
      id: 'c1', name: 'DLC', wiki: ref(imgB), creator: '刘', time: '2026/10/11 09:01',
      children: [{ id: 'd1', name: '黄金树', wiki: ref(imgC), creator: '刘', time: '2026/10/11 09:02' }]
    }]
  }],
  note: [{ id: 'n1', name: '备考', wiki: ref(imgA), creator: '刘', time: '2026/10/11 09:03' }],
  life: [{ id: 'l1', name: '作息', wiki: ref(imgE), creator: '刘', time: '2026/10/11 09:04' }]
})
// imgD 谁都不引用：造一个孤儿（正常流程里它来自「插入后又把图删掉」）
ok('前置:五张图都进了库', imgCount() === 5, '实际 ' + imgCount())

// ─────────── ★ 引用集合：漏一个字段就会删掉活图 ───────────
const used = wiki.collectUsedImageIds()
ok('引用集合:主词条正文里的图算被引用', used.has(imgA))
ok('引用集合:子词条正文里的图算被引用', used.has(imgB))
ok('引用集合:深层嵌套子词条（导入数据可能到 10 层）的图算被引用', used.has(imgC), '集合里只有 ' + used.size + ' 个')
ok('引用集合:三个分类都走（note）', used.has(imgA) && used.has(imgE))
ok('引用集合:没人引用的图不在集合里（否则永远清不掉）', !used.has(imgD))
ok('引用集合:数量正好等于真实引用数', used.size === 4, '实际 ' + used.size)

// ─────────── 删子词条 ───────────
await wiki.deleteChildItem('game', 'g1', 'c1')
{
  const left = await wiki.collectUsedImageIds()
  ok('删子词条:子词条正文的图已不在引用集合里', !left.has(imgB))
  ok('删子词条:深层子词条的图也随它一起消失（人是整棵子树删的）', !left.has(imgC))
  ok('删子词条:被别的条目还引用着的图**没**被清掉', left.has(imgA))
  ok('删子词条:剩下 2 张（imgA、imgE）—— 孤儿 imgD 被顺手扫掉', imgCount() === 2, '实际 ' + imgCount() + ' 张')
}

// 父词条不存在：不能抛错（删除入口的既有行为）
let threw = null
try { await wiki.deleteChildItem('game', '不存在', 'c1') } catch (e) { threw = e.message }
ok('删子词条:父词条不存在时不抛错、也不动图片库', !threw && imgCount() === 2, threw || '')

// ─────────── ★ 删条目：被别处还引用着的图必须活下来 ───────────
const pending = wiki.deleteItem('game', 'g1')
const stillThere = wiki.dbData.value.game.some(i => i.id === 'g1')
ok('删条目:数组同步先改完（调用后立刻就能读到新数据，界面不用等回收）', !stillThere)
const r1 = await pending
ok('删条目:回收跑通了（没有被闸门挡下）', r1 && r1.refused === false, JSON.stringify(r1))
ok('删条目:imgA 仍被 note 里的条目引用 → 必须活着', imgCount() === 2, '实际 ' + imgCount() + ' 张')

await wiki.deleteItem('note', 'n1')
ok('删条目:最后一个引用者也没了 → imgA 这时才被清掉', imgCount() === 1, '实际 ' + imgCount() + ' 张')

// ─────────── 库空了也要清（allowEmptyRefs 存在的理由） ───────────
const r2 = await wiki.deleteItem('life', 'l1')
ok('清库:删掉最后一个带图条目后引用集合为空 → 仍然清理干净', imgCount() === 0, '实际 ' + imgCount() + ' 张')
ok('清库:返回结果如实报告删了几张', r2.deleted === 1, JSON.stringify(r2))

// ─────────── 闸门没被放宽 ───────────
const imgF = await saveImage(fakeFile('f.png'))
const noSet = await dropUnused(['img-x'])
ok('闸门:dropUnused 拿到非 Set 仍然拒绝（本次改动没放宽它）', noSet.refused === true, JSON.stringify(noSet))
const emptyRefs = await dropUnused(new Set())
ok('闸门:空引用 + 库非空、且没传 allowEmptyRefs 时仍然拒绝', emptyRefs.refused === true, JSON.stringify(emptyRefs))
ok('闸门:被拒时图片一张都没少', imgCount() === 1, '实际 ' + imgCount() + ' 张')

// ─────────── 清理失败：不静默，也不能把删条目一起拖死 ───────────
wiki.importData({ game: [{ id: 'g9', name: '带图', wiki: ref('img-zzz'), creator: '刘', time: '' }], note: [], life: [] })
const warns = []
const realWarn = console.warn
console.warn = (...a) => warns.push(a.join(' '))
idb.ctl.failTx = true
const r3 = await wiki.deleteItem('game', 'g9')
idb.ctl.failTx = false
console.warn = realWarn

ok('图片库不可用时:条目照样删掉（不因清理失败而删不掉）', !wiki.dbData.value.game.some(i => i.id === 'g9'))
ok('图片库不可用时:返回结果里说清了原因', r3.refused === true && /清理失败/.test(r3.reason || ''), JSON.stringify(r3))
ok('图片库不可用时:留痕到 console（不静默吞掉）', warns.some(w => w.includes('[图片回收]')), JSON.stringify(warns))
ok('图片库不可用时:图片一张没动（没删一半）', imgCount() === 1, '实际 ' + imgCount() + ' 张')

// ─────────── ★ 跨账号：图片库是全设备单库，别人的图绝不能清 ───────────
// 现状：图片库 huan_zhong_shu_images 不分账号（DB_NAME 是常量），
// 而百科数据按账号分键（huan_zhong_shu_db@u<id>）。只按当前账号算引用集合，
// 换个账号删一条条目，上个账号的图就全被当孤儿清掉 —— 那是毁数据，不是留垃圾。
const imgX = await saveImage(fakeFile('x.png'))
localStorage.setItem(STORAGE_KEYS.DB + SCOPE_SEP + 'OTHER', JSON.stringify({
  game: [{
    id: 'og1', name: '别人的条目', wiki: ref(imgX), creator: '别人', time: '',
    children: [{ id: 'oc1', name: '子', wiki: ref(imgX), creator: '别人', time: '' }]
  }],
  note: [], life: []
}))
wiki.importData({ game: [{ id: 'mine', name: '我的条目', wiki: '', creator: '刘', time: '' }], note: [], life: [] })
await wiki.deleteItem('game', 'mine')
ok('跨账号:另一个账号引用着的图必须活下来', imgKeys().includes(imgX), JSON.stringify(imgKeys()))
ok('跨账号:全设备都没人引用的图才清得掉（imgF 无人引用 → 该清）', !imgKeys().includes(imgF), JSON.stringify(imgKeys()))
ok('跨账号:这一轮只留下了别人的那张图', imgKeys().length === 1, JSON.stringify(imgKeys()))

// 有账号数据读不出来 → 读不全就不敢判定谁是孤儿，整轮放弃（宁可不清，不可错杀）
const imgY = await saveImage(fakeFile('y.png'))
localStorage.setItem(STORAGE_KEYS.DB + SCOPE_SEP + 'BROKEN', '{"game":[{"id":"坏')
wiki.importData({ game: [{ id: 'mine2', name: '我的条目2', wiki: '', creator: '刘', time: '' }], note: [], life: [] })
const rBad = await wiki.deleteItem('game', 'mine2')
ok('跨账号:有一份账号数据读不出来 → 整轮放弃回收', rBad.refused === true && /读不出来/.test(rBad.reason || ''), JSON.stringify(rBad))
ok('跨账号:放弃回收时一张图都没动', imgKeys().includes(imgX) && imgKeys().includes(imgY), JSON.stringify(imgKeys()))

// 当前账号那一份必须取内存：localStorage 由 useLocalStorage 的 watch 异步落盘，
// 刚删完这一瞬间它还是旧的 —— 照它算，等于「刚删掉的条目还引用着自己的图」，永远清不掉
localStorage.removeItem(STORAGE_KEYS.DB + SCOPE_SEP + 'BROKEN')
const imgZ = await saveImage(fakeFile('z.png'))
const myDB = { game: [{ id: 'mz', name: '带图', wiki: ref(imgZ), creator: '刘', time: '' }], note: [], life: [] }
wiki.importData(JSON.parse(JSON.stringify(myDB)))
localStorage.setItem(scopeKey(STORAGE_KEYS.DB), JSON.stringify(myDB))   // 钉住「旧快照」
await wiki.deleteItem('game', 'mz')
ok('当前账号:以内存为准 —— localStorage 那份还是旧快照也必须清掉', !imgKeys().includes(imgZ), JSON.stringify(imgKeys()))
ok('当前账号:别人的图在这一轮依然没被牵连', imgKeys().includes(imgX), JSON.stringify(imgKeys()))

// ─────────── 汇总 ───────────
let pass = 0
for (const [name, cond, extra] of chk) {
  if (cond) { pass++; console.log('PASS  ' + name) } else { console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')) }
}
console.log('--- 图片回收断言: ' + pass + '/' + chk.length + ' ---')
if (pass !== chk.length) process.exitCode = 1
