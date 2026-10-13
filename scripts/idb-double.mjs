/**
 * 极简 IndexedDB 替身（零依赖 · 纯 node）—— index-store / backup 两套断言共用。
 *
 * 为什么要共用一份：本项目有两套测试都要铺 IndexedDB（test:image 图片回收、test:import 导入图片），
 * 各写一份必然漂移，而漂移的方向恰好是「替身比真实 IDB 宽松」→ 测试假绿。
 *
 * ⚠️ 替身必须**异步**回回调：生产代码是「先发起请求、再挂回调」的写法，
 *    同步回调会让那些回调永远挂不上（Promise 悬着），测试就成了假绿。
 *
 * 只实现本项目用到的几件事：open / deleteDatabase / 单 store 的
 * add·put·get·delete·clear·count·getAll·getAllKeys / 事务完成回调。
 * `open` 对**新库**会触发 onupgradeneeded（真实 IDB 首次打开同样会），
 * 让各模块自己的 createObjectStore 生效；库里已有的 store 不会被重复创建。
 */
export function makeIDB() {
  const dbs = new Map()               // 库名 -> Map<store 名, Map<key, record>>
  const ctl = {
    failTx: false,                    // 模拟「库整个用不了」（隐私模式 / 库已关闭）
    failStore: ''                     // 只让某个 store 坏掉（如 'images'），别的 store 照常 —— 用来压「文字成功、图片失败」这条路
  }
  const soon = fn => queueMicrotask(fn)

  function makeDB(bag) {
    return {
      objectStoreNames: { contains: n => bag.has(n) },
      createObjectStore: n => { if (!bag.has(n)) bag.set(n, new Map()) },
      close: () => {},
      transaction: (n, mode) => {
        // failStore 只压「读得出来、**写**不进去」（配额满 / 库被锁在写）：
        // 读也一并坏掉的话，导入会在「导入前快照」那一步就中止，走不到图片写入那条路。
        const storeDown = ctl.failStore && ctl.failStore === n && mode === 'readwrite'
        if (ctl.failTx || storeDown) throw new Error('图片库已关闭')
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
          put:        rec => { map.set(rec.id, rec); return req(() => undefined) },
          get:        k   => req(() => map.get(k)),
          delete:     k   => { map.delete(k); return req(() => undefined) },
          clear:      ()  => { map.clear(); return req(() => undefined) },
          count:      ()  => req(() => map.size),
          getAll:     ()  => req(() => Array.from(map.values())),
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
        const isNew = !dbs.has(name)
        if (isNew) dbs.set(name, new Map())
        const bag = dbs.get(name)
        soon(() => {
          const db = makeDB(bag)
          req.result = db
          if (isNew) req.onupgradeneeded && req.onupgradeneeded({ target: { result: db } })
          req.onsuccess && req.onsuccess({ target: { result: db } })
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
