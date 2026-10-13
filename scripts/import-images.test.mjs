/**
 * 导入图片完整性断言套件（零依赖 · 纯 node）· 配套问题清单 A04
 *    「导入时图片会静默丢：先清空再写，坏数据一声不吭跳过」
 * 用法：npm run test:import
 *
 * 覆盖：
 *   · 坏图判据（checkImageRecord 是唯一出处，预检与写入共用）
 *   · 导入前逐张预检：坏图**数得出来**
 *   · 坏图默认中止 —— 当前数据零改动、**图片库里原来的图必须还在**（老实现会先清空再写）
 *   · 显式放行「仍然导入」后：报出的数字是真的（written / dropped 分别对得上）
 *   · 图片库坏掉时不许冒充成功（文字已导入，但必须报出图片失败）
 *   · 图片回收的两道闸门：当前账号落盘那份坏了 → 不清；其它账号读不出来 → 不清
 *
 * 环境说明：node 没有 localStorage / indexedDB —— 都在此铺替身（IndexedDB 替身见 idb-double.mjs）。
 */
import { makeIDB } from './idb-double.mjs'

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
localStorage.setItem('huan_zhong_shu_session', JSON.stringify({ userId: CUR, loginAt: '2026-10-13T00:00:00Z' }))

const idb = makeIDB()
globalThis.indexedDB = idb.api

const backup = await import('../src/composables/useBackup.js')
const { useWikiData } = await import('../src/composables/useWikiData.js')
const { saveImage, IMAGE_DB_NAME, IMAGE_STORE_NAME } = await import('../src/composables/useImageStore.js')
const { STORAGE_KEYS } = await import('../src/constants/categories.js')
const { scopeKey } = await import('../src/utils/storageScope.js')

const chk = []
const ok = (name, cond, extra) => chk.push([name, !!cond, extra])
const sk = k => scopeKey(k)
const set = (k, v) => localStorage.setItem(sk(k), JSON.stringify(v))
const dumpAll = () => JSON.stringify(Array.from(map.entries()).sort())
const imgKeys = () => idb.keys(IMAGE_DB_NAME, IMAGE_STORE_NAME)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 'hello' 的 base64 —— 合法、可解码、长度是 4 的倍数
const GOOD = 'aGVsbG8='
const goodImg = (id) => ({ id, mime: 'image/png', name: id + '.png', time: 1700000000000, dataBase64: GOOD })

/** 造一份格式合法的备份（counts 必须与实际一致，否则会被校验层先拦下） */
function makeBackup(images, db) {
  const data = db || {
    game: [{ id: 'g1', name: '带图的条目', wiki: '![p](id://img-good)', creator: '刘', time: '2026/10/13 10:00' }],
    note: [], life: []
  }
  const wiki = ['game', 'note', 'life'].reduce((n, c) => n + (data[c] || []).length, 0)
  return {
    format: 'huanzhongshu-backup',
    schema_version: 1,
    exported_at: '2026-10-13T10:00:00.000Z',
    app_version: '1.0.0',
    account_label: '本机',
    counts: { wiki_items: wiki, memory: 0, chat: 0, images: images.length },
    data: { user: null, db: data, chat: [], memory: [], crisis: {}, proactive: { log: [], enabled: false }, last_tab: null },
    images
  }
}

// ═══════════ 一、坏图判据（唯一出处）═══════════
ok('判据:合法记录通过', backup.checkImageRecord(goodImg('img-a')).ok === true)
ok('判据:缺 id 被拦', /缺图片 id/.test(backup.checkImageRecord({ dataBase64: GOOD }).reason))
ok('判据:缺图片数据被拦', /缺图片数据/.test(backup.checkImageRecord({ id: 'img-x' }).reason))
ok('判据:base64 截断被拦', /不完整/.test(backup.checkImageRecord({ id: 'img-x', dataBase64: GOOD.slice(0, 3) }).reason))
ok('判据:不是对象被拦', /不是一张图/.test(backup.checkImageRecord(null).reason))
ok('判据:数组也算「不是一张图」', /不是一张图/.test(backup.checkImageRecord([]).reason))
{
  const seen = new Set()
  backup.checkImageRecord(goodImg('img-dup'), seen)
  const dup = backup.checkImageRecord(goodImg('img-dup'), seen)
  ok('判据:重复 id 被拦（同一张图出现两次只有一条能留下）', dup.ok === false && /重复/.test(dup.reason))
}

// ═══════════ 二、预检：只数、不碰存储 ═══════════
{
  const rep = backup.inspectImages([goodImg('img-a'), { id: 'img-b' }, goodImg('img-c')])
  ok('预检:坏图数得出来', rep.damaged === 1 && rep.usable === 2 && rep.expected === 3, JSON.stringify(rep))
  ok('预检:坏图带位置与原因', rep.issues[0] && rep.issues[0].index === 1 && /缺图片数据/.test(rep.issues[0].reason), JSON.stringify(rep.issues))
  ok('预检:全好时零坏图', backup.inspectImages([goodImg('a'), goodImg('b')]).damaged === 0)
  ok('预检:images 缺失按空算（不抛错）', backup.inspectImages(undefined).expected === 0)
}

// ═══════════ 三、坏图闸门：默认中止且**零改动** ═══════════
{
  // 库里先有一张「本机原有的」图 —— 老实现（先 clear 再逐条写、坏的 return）
  // 会在这条路径上把它清掉，然后还报「导入完成」。
  // 用**真的 Blob**：快照那一步会走 btoa(blob.arrayBuffer())，塞个普通对象进去会让快照失败、
  // 导入被「为了安全已中止」拦下 —— 那是另一条路径，不是本节要测的东西。
  const oldId = await saveImage(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
  ok('前置:库里已有一张本机原有的图', imgKeys().length === 1 && imgKeys()[0] === oldId, JSON.stringify(imgKeys()))

  set(STORAGE_KEYS.DB, { game: [{ id: 'local', name: '本机原有的条目', wiki: '![p](id://' + oldId + ')', creator: '刘', time: '' }], note: [], life: [] })
  set(STORAGE_KEYS.CHAT, [{ id: 'm1', role: 'user', content: '本机原有聊天', time: '' }])

  const payload = makeBackup([goodImg('img-good'), { id: 'img-bad', mime: 'image/png' }])
  const before = dumpAll()

  const r = await backup.importBackup(JSON.stringify(payload))
  ok('闸门:坏图默认被拦下', r.ok === false && r.code === 'IMAGES_DAMAGED', JSON.stringify(r).slice(0, 240))
  ok('闸门:错误信息里说清坏了几张', /有 1 张图片是坏的/.test(r.error || ''), r.error)
  ok('闸门:文本数据零改动', dumpAll() === before)
  ok('闸门:★图片库里原来的图还在（不是「先清空再写」）', imgKeys().length === 1 && imgKeys()[0] === oldId, JSON.stringify(imgKeys()))

  // 显式放行：这份备份可能就是他唯一的一份 —— 放行后必须如实报出丢了几张
  const r2 = await backup.importBackup(JSON.stringify(payload), { allowDamagedImages: true })
  ok('放行:导入完成', r2.ok === true, JSON.stringify(r2).slice(0, 200))
  ok('放行:真写进去的图片数是对的', r2.images === 1 && r2.imagesExpected === 2, JSON.stringify({ w: r2.images, e: r2.imagesExpected }))
  ok('放行:丢了几张如实报出', r2.imagesDropped === 1, JSON.stringify(r2.imagesDropped))
  ok('放行:坏的那张没进库、好的那张进去了', imgKeys().length === 1 && imgKeys()[0] === 'img-good', JSON.stringify(imgKeys()))
  ok('放行:坏图原因留在返回值里（界面能说清为什么）', /缺图片数据/.test(r2.imageDroppedDetail[0].reason || ''), JSON.stringify(r2.imageDroppedDetail))
  ok('放行:本机原有的那张已被整批替换掉（这是导入的正常语义）', !imgKeys().includes(oldId))
  ok('放行:文字数据也换代了', String(localStorage.getItem(sk(STORAGE_KEYS.DB))).includes('带图的条目'))
  ok('放行:没有图片失败标记', r2.imageError === '')
}

// ═══════════ 四、全好的一份：不许报出假的丢图数 ═══════════
{
  const payload = makeBackup([goodImg('img-1'), goodImg('img-2'), goodImg('img-3')])
  const r = await backup.importBackup(JSON.stringify(payload))
  ok('正常:导入完成', r.ok === true, JSON.stringify(r).slice(0, 200))
  ok('正常:三张全进库', r.images === 3 && r.imagesDropped === 0, JSON.stringify({ w: r.images, d: r.imagesDropped }))
  ok('正常:库里正好这三张', imgKeys().sort().join(',') === 'img-1,img-2,img-3', JSON.stringify(imgKeys()))
}

// ═══════════ 五、图片库坏掉时：不许冒充成功 ═══════════
{
  // 5a：库整个用不了 → 连「导入前快照」都存不成 → 按既有口径中止（存不成就不许往下走）
  const payload = makeBackup([goodImg('img-x')])
  const before = dumpAll()
  const beforeImgs = imgKeys().sort().join(',')
  idb.ctl.failTx = true
  const r = await backup.importBackup(JSON.stringify(payload))
  idb.ctl.failTx = false
  ok('库整个坏掉:导入被拦下（不给退路的写入不许开始）', r.ok === false, JSON.stringify(r).slice(0, 200))
  ok('库整个坏掉:错误说清是快照没存成', /快照/.test(r.error || ''), r.error)
  ok('库整个坏掉:文本零改动', dumpAll() === before)
  ok('库整个坏掉:图片库零改动', imgKeys().sort().join(',') === beforeImgs, JSON.stringify(imgKeys()))
}
{
  // 5b：读得出来、**写**不进去（配额满 / 库被锁在写）→ 文字照常导入，但必须把图片失败报出来
  const payload = makeBackup([goodImg('img-y')])
  idb.ctl.failStore = 'images'
  const r = await backup.importBackup(JSON.stringify(payload))
  idb.ctl.failStore = ''
  ok('只写不进:导入仍然成功（数据比图片重要，不回滚文字）', r.ok === true, JSON.stringify(r).slice(0, 200))
  ok('只写不进:★图片失败必须被报出来（不许静默吞掉）', !!r.imageError && r.imageError.length > 0, JSON.stringify(r.imageError))
  ok('只写不进:图片数为 0 且不假装写了', r.images === 0, JSON.stringify(r.images))
  ok('只写不进:文字数据确实换代了', String(localStorage.getItem(sk(STORAGE_KEYS.DB))).includes('带图的条目'))
}

// ═══════════ 六、老版备份（无 images 段）不受影响 ═══════════
{
  const legacy = { game: [{ id: 'old1', name: '老备份条目', wiki: '', creator: '刘', time: '' }], note: [], life: [] }
  const r = await backup.importBackup(JSON.stringify(legacy))
  ok('老备份:仍然能导（走 legacy 分支）', r.ok === true && r.legacy === true, JSON.stringify(r))
  ok('老备份:不碰图片库（库里还是上一轮那三张）', r.images === 0 && imgKeys().length === 3, JSON.stringify(imgKeys()))
}

// ═══════════ 七、图片回收的两道闸门（A02 残留② 挂启动回收时补的）═══════════
{
  const wiki = useWikiData()

  // 内存里造一条「引用了 img-keep」的条目（落盘由 watch 异步做，这里不管）
  const item = wiki.addItem('game', '有图的条目', '刘')
  wiki.updateItemWiki('game', item.id, '看图：![p](id://img-keep)')

  // 库里放两张：一张被引用（img-keep），一张是孤儿（img-orphan）
  // 直接往库里铺指定 id（走 idb 替身，与生产同一套 store 结构）
  {
    const dbi = await (await import('../src/composables/useImageStore.js')).getImageDB()
    const tx = dbi.transaction(IMAGE_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IMAGE_STORE_NAME)
    store.clear()
    store.put({ id: 'img-keep', blob: null, mime: 'image/png', name: 'k.png', time: 1 })
    store.put({ id: 'img-orphan', blob: null, mime: 'image/png', name: 'o.png', time: 1 })
    await new Promise(r => { tx.oncomplete = r })
  }
  ok('前置:库里两张（一张被引用、一张孤儿）', imgKeys().sort().join(',') === 'img-keep,img-orphan', JSON.stringify(imgKeys()))

  // ★闸门：当前账号**落盘那份**坏了 → 拒绝回收（内存里此刻可能是回落后的默认空值，
  //   照它算就会把本账号所有图片清光，而原始文本其实还有救）
  localStorage.setItem(sk(STORAGE_KEYS.DB), '{坏掉的 json')
  const refused = await wiki.purgeUnusedImages()
  ok('闸门:当前账号数据坏了 → 放弃回收', refused && refused.refused === true, JSON.stringify(refused))
  ok('闸门:★放弃时一张图都没动', imgKeys().length === 2, JSON.stringify(imgKeys()))

  // 反例对照：落盘那份恢复正常 → 正常回收（闸门没有误伤正常路径）
  set(STORAGE_KEYS.DB, { game: [{ id: 'local2', name: '本机原条目', wiki: '![p](id://img-keep)', creator: '刘', time: '' }], note: [], life: [] })
  const done = await wiki.purgeUnusedImages()
  ok('正常路径:回收执行了（闸门没有误伤）', done && done.refused !== true, JSON.stringify(done))
  ok('正常路径:孤儿被清掉、被引用的还在', imgKeys().length === 1 && imgKeys()[0] === 'img-keep', JSON.stringify(imgKeys()))
}

// ─────────── 汇总 ───────────
await sleep(0)
let pass = 0
for (const [name, cond, extra] of chk) {
  if (cond) { pass++; console.log('PASS  ' + name) } else { console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')) }
}
console.log('--- 导入图片完整性断言: ' + pass + '/' + chk.length + ' ---')
if (pass !== chk.length) process.exitCode = 1
