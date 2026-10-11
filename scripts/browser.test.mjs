/**
 * 真浏览器验收（零依赖：node 内置 WebSocket 直连 CDP）
 * 运行：npm run test:browser
 *
 * 为什么需要它：A08（子词条发布后被弹回列表）、A10（顶部安全区）这类缺陷全是**接线与样式**问题——
 * 服务层单测打不到，源码文本断言也只能证明"某行还在"。它们的现场只在真实 DOM 与布局里：
 *   · A08 的保存本身是成功的（存储里内容确实更新了），坏的只是界面被卸载 ——
 *     只看数据会以为一切正常，这正是它一直没被发现的原因。
 *   · A10 的 env(safe-area-inset-top) 在无刘海环境下恒为 0，只能靠改 --safe-top 变量来模拟。
 * 所以这两条各配一条真浏览器护栏，逻辑与 scripts/silent-failure.test.mjs 同源：一个缺陷一条栏。
 *
 * 依赖：本机装了 Chrome（可用 CHROME 环境变量覆盖），以及 Vite（由本脚本自己拉起）。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT_VITE = 5175
const PORT_CDP = 9333
const APP = `http://localhost:${PORT_VITE}/`
const CHROME = process.env.CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const bad = []
async function ok(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { fail++; bad.push([name, e.message]); console.log(`  ✗ ${name}\n    → ${e.message}`) }
}
const must = (c, m) => { if (!c) throw new Error(m) }
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol

if (!existsSync(CHROME)) {
  console.log(`跳过：没找到 Chrome（${CHROME}）。用 CHROME=<路径> 指定。`)
  process.exit(0)
}

// ── 起 Vite（--strictPort：端口被占就报错，别悄悄换一个害得后面 URL 全错）──
const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js')
const vite = spawn(process.execPath, [viteBin, '--port', String(PORT_VITE), '--strictPort'], {
  stdio: 'ignore', cwd: process.cwd()
})
let up = false
for (let i = 0; i < 100 && !up; i++) {
  try { up = (await fetch(APP)).ok } catch { /* 还没起来 */ }
  if (!up) await sleep(300)
}
if (!up) { console.error(`Vite 没能在 ${APP} 起来`); vite.kill(); process.exit(1) }

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT_CDP}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-verify-'))}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'
], { stdio: 'ignore' })

const cleanup = () => {
  try { chrome.kill() } catch {}
  try { vite.kill() } catch {}
}
const watchdog = setTimeout(() => { console.error('\n[看门狗] 超时退出'); cleanup(); process.exit(2) }, 180000)

// ── CDP 连接 ──
let target = null
for (let i = 0; i < 80 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json()).find(t => t.type === 'page') } catch {}
  if (!target) await sleep(300)
}
if (!target) { console.error('连不上 Chrome DevTools'); cleanup(); process.exit(1) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Page.javascriptDialogOpening') {
    cmd('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
  }
})
function cmd(method, params = {}) {
  const id = ++seq
  return new Promise((res, rej) => {
    pending.set(id, m => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function ev(expr) {
  const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}
async function waitFor(expr, ms = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { if (await ev(expr)) return true } catch { /* 页面可能在重载中 */ }
    await sleep(120)
  }
  return false
}
const SET_INPUT = `
function __set(el, val) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}`

await cmd('Page.enable'); await cmd('Runtime.enable')

// alert/confirm 会阻塞页面 JS，headless 下没人点就整页冻住（发布后那句「已保存」就是 alert）
await cmd('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__alerts = [];
    window.alert = (m) => { window.__alerts.push(String(m)) };
    window.confirm = (m) => { window.__alerts.push('[confirm] ' + String(m)); return true };
    window.prompt = () => null;`,
  runImmediately: true
})

await cmd('Page.navigate', { url: APP })
await sleep(1800)

// ═══ 准备：注册本机账号 + 播一条带子词条的百科 ═══
console.log('\n═══ 准备 ═══')
await ok('注册并进入', async () => {
  const n = await ev(`(() => { ${SET_INPUT}
    const ins = [...document.querySelectorAll('.field-input')]
    if (ins.length < 3) return ins.length
    __set(ins[0], 'cdpuser'); __set(ins[1], 'cdppass123'); __set(ins[2], 'cdppass123')
    return ins.length
  })()`)
  must(n === 3, `应处于注册态（3 个输入框），实际 ${n}`)
  await ev(`document.querySelector('.auth-submit').click()`)
  must(await waitFor(`!document.querySelector('.auth-wrap')`), '注册后没进主界面')
})
const uid = await ev(`JSON.parse(localStorage.getItem('huan_zhong_shu_session')).userId`)

await ok('播数据 + 首屏落 game，重载后看到条目', async () => {
  await ev(`(() => {
    localStorage.setItem('huan_zhong_shu_db@u${uid}', JSON.stringify({
      game: [{
        id: 'g1', name: '测试主词条', creator: 'cdpuser', time: '2026-10-11 12:00',
        children: [{ id: 'c1', name: '测试子词条', creator: 'cdpuser', time: '2026-10-11 12:00',
                    wiki: '# 原始标题\\n\\n这是发布前的正文。' }]
      }], note: [], life: []
    }))
    // 注意必须写成 JSON 字面量：业务键走 useLocalStorage，值是 JSON.parse 出来的
    localStorage.setItem('huan_zhong_shu_last_tab@u${uid}', JSON.stringify('game'))
    location.reload()
  })()`)
  must(await waitFor(`!!document.querySelector('.data-card')`), '重载后没看到条目卡片')
})

// ═══ A10 · 顶部安全区 ═══
console.log('\n═══ A10 · 顶部安全区 ═══')
await ok('基准：顶栏贴顶、容器正好一屏、无溢出', async () => {
  const r = await ev(`(() => {
    const c = document.querySelector('.app-container'), h = document.querySelector('.header')
    return {
      varDef: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
      boxSizing: getComputedStyle(c).boxSizing,
      cTop: c.getBoundingClientRect().top, cH: c.getBoundingClientRect().height,
      headerTop: h.getBoundingClientRect().top, innerH: innerHeight,
      docScrollH: document.documentElement.scrollHeight,
      docScrollW: document.documentElement.scrollWidth, innerW: innerWidth
    }
  })()`)
  must(r.varDef !== '', '--safe-top 未定义')
  must(r.boxSizing === 'border-box', `box-sizing 应为 border-box，实际 ${r.boxSizing}`)
  must(near(r.cTop, 0), `容器不该有偏移（body 默认外边距须清零），实际 top=${r.cTop}`)
  must(near(r.headerTop, 0), `顶栏应贴顶，实际 ${r.headerTop}`)
  must(near(r.cH, r.innerH), `容器应正好一屏高：${r.cH} vs ${r.innerH}`)
  must(r.docScrollH <= r.innerH + 1, `不该纵向溢出：${r.docScrollH} > ${r.innerH}`)
  must(r.docScrollW <= r.innerW + 1, `不该横向溢出：${r.docScrollW} > ${r.innerW}`)
})
await ok('模拟刘海 44px：顶栏下移到状态栏下沿，底部导航仍在屏内', async () => {
  const r = await ev(`(() => {
    document.documentElement.style.setProperty('--safe-top', '44px')
    const c = document.querySelector('.app-container'), nav = document.querySelector('.bottom-nav')
    return {
      headerTop: document.querySelector('.header').getBoundingClientRect().top,
      cH: c.getBoundingClientRect().height, innerH: innerHeight,
      navBottom: nav ? nav.getBoundingClientRect().bottom : null,
      docScrollH: document.documentElement.scrollHeight
    }
  })()`)
  must(near(r.headerTop, 44), `顶栏应落在 44px，实际 ${r.headerTop}`)
  must(near(r.cH, r.innerH), `容器仍应正好一屏高（不能被撑溢）：${r.cH} vs ${r.innerH}`)
  must(r.docScrollH <= r.innerH + 1, `不该纵向溢出：${r.docScrollH} > ${r.innerH}`)
  if (r.navBottom !== null) must(r.navBottom <= r.innerH + 1, `底部导航被挤出屏幕：${r.navBottom} > ${r.innerH}`)
})
await ok('恢复 0px → 顶栏回到贴顶', async () => {
  await ev(`document.documentElement.style.removeProperty('--safe-top')`)
  must(near(await ev(`document.querySelector('.header').getBoundingClientRect().top`), 0), '恢复后顶栏应贴顶')
})

// ═══ A08 · 子词条发布 ═══
console.log('\n═══ A08 · 子词条发布 ═══')
await ok('进入主词条 → 子词条 → 编辑器', async () => {
  await ev(`[...document.querySelectorAll('.data-card')].find(c=>/测试主词条/.test(c.textContent)).click()`)
  must(await waitFor(`!!document.querySelector('.child-card')`, 6000), '详情页没出现子词条卡片')
  await ev(`document.querySelector('.child-card').click()`)
  must(await waitFor(`!!document.querySelector('.sub-editor-wrapper')`, 6000), '子词条编辑器没打开')
})
await ok('切编辑态并改内容', async () => {
  await ev(`[...document.querySelectorAll('.state-toggle-btn')].find(b=>/编辑/.test(b.textContent)).click()`)
  must(await waitFor(`!!document.querySelector('.markdown-textarea')`, 5000), '没进到编辑态')
  await ev(`(() => { ${SET_INPUT}
    __set(document.querySelector('.markdown-textarea'), '# 改过的标题\\n\\n这是发布后的正文。') })()`)
})
await ok('点发布 → 仍留在编辑器（没被弹回列表）', async () => {
  await ev(`[...document.querySelectorAll('.state-toggle-btn')].find(b=>/发布/.test(b.textContent)).click()`)
  await sleep(600)
  const r = await ev(`(() => ({
    editorAlive: !!document.querySelector('.sub-editor-wrapper'),
    listVisible: !!document.querySelector('.child-list'),
    readView: !!document.querySelector('.markdown-render-view'),
    btn: (document.querySelector('.state-toggle-btn')||{}).textContent?.trim()
  }))()`)
  must(r.editorAlive, '编辑器被卸载了 —— 用户被弹回了列表（A08 回归）')
  must(!r.listVisible, '子词条列表不该同时出现')
  must(r.readView, '应停在阅读态')
  must(/编辑/.test(r.btn || ''), `发布后按钮应变回「编辑」，实际「${r.btn}」`)
})
await ok('阅读态显示的是刚发布的内容', async () => {
  const txt = await ev(`document.querySelector('.markdown-render-view').textContent`)
  must(/改过的标题/.test(txt), `阅读态没显示新内容：${txt.slice(0, 50)}`)
  must(!/原始标题/.test(txt), '阅读态还在显示旧内容')
})
await ok('内容确实落到了存储', async () => {
  const wiki = await ev(`JSON.parse(localStorage.getItem('huan_zhong_shu_db@u${uid}')).game[0].children[0].wiki`)
  must(/改过的标题/.test(wiki), `存储里的 wiki 没更新：${wiki}`)
})
await ok('「返回」仍能回列表（离场通道没被堵死）', async () => {
  await ev(`document.querySelector('.back-link-btn').click()`)
  await sleep(500)
  const r = await ev(`({ editor: !!document.querySelector('.sub-editor-wrapper'), list: !!document.querySelector('.child-list') })`)
  must(!r.editor && r.list, '返回应回到子词条列表')
})

// ═══ 移动端适配 · 375px ═══
// 两条验收：窄屏不横向溢出、可点控件真的够得着。
// 为什么不写进 check-ui.mjs：命中区是**布局算出来的**。静态读 CSS 只读得到"写了 32px"，
// 读不到 ::after 外扩了多少，更读不到外扩的部分有没有被祖先的 overflow 裁掉
// （缩略图那个 ✕ 就正是被裁掉的那种）。
//
// 量法用「探点」而不是去解析 ::after 的 computed 值：abspos 伪元素的 top/bottom
// 回传的是 used value，算出来的盒子会离谱（第一版就量到过 -750）。探点问的是浏览器
// 本人：从这个控件的中心往上/往下走，elementFromPoint 认不认它 —— 外扩出来的面积
// 只要真的点得到，就一定认；被祖先裁掉的，就一定不认。
console.log('\n═══ 移动端适配（375×667）═══')
await cmd('Emulation.setDeviceMetricsOverride', {
  width: 375, height: 667, deviceScaleFactor: 2, mobile: true
})

// 候选"可点件"取两路的并集：
//   · 语义选择器 —— button / role=switch / 各类 btn、chip / 几个 div 当按钮用的
//   · cursor:pointer —— 这一路不用维护清单。Vue 的 @click 挂在 div 上时 DOM 里看不出来，
//     但作者一定会给它 cursor:pointer，所以"像可点的东西"就等于"是可点的东西"。
// 然后只留最外层的那个：cursor 是**继承**属性，父级可点则其下每个 svg、span 都算
// pointer，真正该够得着的是父级这一整块，子级不该单独计数。
const HIT_AUDIT = `
window.__hitH = function (el) {
  var r = el.getBoundingClientRect()
  var x = Math.round(r.left + r.width / 2)
  var up = 0, down = 0
  if (x >= 0 && x < window.innerWidth) {
    function mine(y) {
      if (y < 0 || y > window.innerHeight - 1) return false
      var t = document.elementFromPoint(x, y)
      return !!t && (t === el || el.contains(t))
    }
    for (var y1 = Math.ceil(r.top) - 1; up < 30; y1--) { if (!mine(y1)) break; up++ }
    for (var y2 = Math.floor(r.bottom); down < 30; y2++) { if (!mine(y2)) break; down++ }
  }
  // 拆开回三个数：本体多高 + 上/下各探到几像素。只报一个总数的话，
  // 44 而量到 42 时分不清是"外扩不够"还是"外扩被什么压住了"。
  return { box: Math.round(r.height), up: up, down: down, h: r.height + up + down }
}
window.__audit = function () {
  var SEL = 'button, [role="switch"], a[href], [class*="btn"], [class*="chip"], ' +
            '.nav-item, .data-card, .child-card, .provider-item, .avatar-option'
  var set = new Set()
  document.querySelectorAll(SEL).forEach(function (e) { set.add(e) })
  document.querySelectorAll('body *').forEach(function (e) {
    if (getComputedStyle(e).cursor === 'pointer') set.add(e)
  })
  var small = []
  set.forEach(function (el) {
    for (var p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return
    var r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    if (getComputedStyle(el).visibility === 'hidden') return
    if (r.bottom < 0 || r.top > window.innerHeight) return
    var m = window.__hitH(el)
    if (m.h < 43.5) {
      small.push({
        cls: String(el.getAttribute('class') || el.tagName).slice(0, 36),
        text: (el.textContent || '').trim().slice(0, 10),
        h: Math.round(m.h * 10) / 10,
        why: m.box + '+' + m.up + '+' + m.down
      })
    }
  })
  return {
    innerW: window.innerWidth,
    scrollW: document.documentElement.scrollWidth,
    over: [].slice.call(document.querySelectorAll('body *')).filter(function (e) {
      var r = e.getBoundingClientRect()
      return r.right > window.innerWidth + 1
    }).map(function (e) {
      return String(e.getAttribute('class') || e.tagName).slice(0, 30)
    }).slice(0, 6),
    small: small.slice(0, 10),
    smallTotal: small.length
  }
}`

const audit = () => ev(HIT_AUDIT + '; window.__audit()')

/** 量当前这一屏：横向不许溢出，可点件不许矮于 44 */
async function mustFit() {
  const r = await audit()
  must(r.innerW === 375, `视口没切到 375（实际 ${r.innerW}），这一屏的量测不算数`)
  if (r.scrollW > r.innerW + 1) {
    throw new Error(`横向溢出：scrollWidth ${r.scrollW} > 375；越界元素 ${r.over.join(' / ') || '(取不到)'}`)
  }
  if (r.smallTotal) {
    throw new Error(`命中区高度不足 44 的控件 ${r.smallTotal} 个：` +
      r.small.map(s => `${s.cls || s.text}${s.text ? '/' + s.text : ''}=${s.h}(${s.why})`).join('、'))
  }
}

/** 切到某屏 → 等它到位 → 量一遍
    settle 要留够入场/切页动画（王冠页还有一层入场编排），否则量到的是一堆还没落位的盒子 */
async function screen(name, gotoExpr, readyExpr, settle = 500) {
  await ok(name, async () => {
    if (gotoExpr) await ev(gotoExpr)
    must(await waitFor(readyExpr, 8000), `没进到目标界面：${readyExpr}`)
    await sleep(settle)
    await mustFit()
  })
}

const NAV = (t) => `[...document.querySelectorAll('.nav-item')].find(n => n.textContent.includes('${t}')).click()`

await ok('先退出详情页（底栏被详情页盖着点不到）', async () => {
  await ev(`document.querySelector('.back-link-btn').click()`)
  must(await waitFor(`!document.querySelector('.detail-page-wrapper')`, 5000), '没退出详情页')
})

await screen('游戏列表', NAV('游戏'), `!!document.querySelector('.data-card')`)
await screen('主词条详情', `document.querySelector('.data-card').click()`, `!!document.querySelector('.child-card')`)
await screen('子词条编辑器（阅读态）', `document.querySelector('.child-card').click()`, `!!document.querySelector('.sub-editor-wrapper')`)
await ok('编辑器切成编辑态 → 量工具条与输入区', async () => {
  await ev(`[...document.querySelectorAll('.state-toggle-btn')].find(b => /编辑/.test(b.textContent)).click()`)
  must(await waitFor(`!!document.querySelector('.markdown-textarea')`, 5000), '没进到编辑态')
  await sleep(400)
  await mustFit()
})
await ok('退出编辑器与详情（连按两次返回）', async () => {
  await ev(`document.querySelector('.back-link-btn').click()`)
  must(await waitFor(`!document.querySelector('.sub-editor-wrapper')`, 5000), '没退出编辑器')
  await ev(`document.querySelector('.back-link-btn').click()`)
  must(await waitFor(`!document.querySelector('.detail-page-wrapper')`, 5000), '没退出详情页')
})
await screen('「我的」页', NAV('我的'), `!!document.querySelector('.account-card')`)
await screen('王冠聊天页（含底部输入栏）', NAV('王冠'), `!!document.querySelector('.chat-container')`, 2500)
await ok('打开修改资料弹窗 → 量头像格与动作键', async () => {
  // 王冠 Tab 是故意藏底栏的（聊天有自己的输入栏），所以从它自己的返回键出去，
  // 回到进王冠之前那个 Tab（这时是「我的」）
  await ev(`document.querySelector('.back-btn').click()`)
  must(await waitFor(`!!document.querySelector('.edit-data-trigger-btn')`, 6000), '王冠返回后没回到「我的」页')
  await ev(`document.querySelector('.edit-data-trigger-btn').click()`)
  must(await waitFor(`!!document.querySelector('.avatar-option')`, 5000), '弹窗没打开')
  await sleep(400)
  await mustFit()
})
await ok('关闭弹窗 → 退出登录 → 登录页也在 375 下过一遍', async () => {
  await ev(`document.querySelector('.cancel-btn').click()`)
  must(await waitFor(`!document.querySelector('.avatar-option')`, 5000), '弹窗没关掉')
  await ev(`document.querySelector('.acc-btn.danger').click()`)
  must(await waitFor(`!!document.querySelector('.auth-wrap')`, 10000), '退出登录后没回到登录页')
  await sleep(700)
  await mustFit()
})

console.log('\n' + '═'.repeat(30))
console.log(`结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail}`)
if (fail) for (const [n, m] of bad) console.log(`  ✗ ${n}\n    ${m}`)

try { ws.close() } catch {}
clearTimeout(watchdog)
cleanup()
const dir = chrome.spawnargs.find(a => a.startsWith('--user-data-dir='))?.split('=')[1]
if (dir) { try { rmSync(dir, { recursive: true, force: true }) } catch {} }
process.exit(fail ? 1 : 0)
