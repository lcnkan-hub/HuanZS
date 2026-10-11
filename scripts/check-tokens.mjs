/**
 * 令牌体检 —— 零依赖，直接 node 跑
 * 运行：npm run check:tokens
 *
 * 为什么需要它：全项目的样式靠 var(--x) 串起来，而 var() **写错名字不会报错**：
 *   · 没写 fallback 时，整条声明被静默丢弃（颜色一路继承到元素的默认值）
 *   · 写了 fallback 时，悄悄用另一个值顶上
 * 两种都是"看着正常、其实没生效"，不会在开发时暴露。
 *
 * 2026-10-11 真抓到一处：StarterCards 写的是 var(--color-text)，全库根本没有这个令牌，
 * 而它要的 --color-text-primary(#1d1d1f) 和 <button> 的浏览器默认色几乎一样，
 * 所以错了很久也没人看出来。同一次扫描还揪出 3 处 fallback 和令牌真值不一致
 * （--radius-md 真值 8px 却写 fallback 12px 之类）。
 *
 * 硬错误（exit 1）：
 *   1. 引用了全库都没有定义的令牌
 *   2. fallback 的字面值与令牌真值不一致 —— 令牌一改，这个 fallback 就成了没人知道的第二真相
 * 只提示、不报错：
 *   3. 定义了但零引用的令牌。不是错：--memory-signal 是留给 P2「记忆浮现」的，
 *      --radius-2xl 是 sm/md/lg/xl/2xl/3xl 圆角刻度里的一格，删了刻度就缺口。
 *
 * 扫描前先剥注释：否则"解释这个坑"的注释本身会被当成这个坑（第一版就自己误报了一次）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const TOKEN_USE = /var\(\s*(--[a-zA-Z0-9-]+)\s*(,)?/g
const TOKEN_DEF = /^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/

/** 剥掉 /* *​/ 块注释和 // 行注释，免得注释里举的例子被当成真引用 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.(vue|css|js|mjs)$/.test(e.name)) acc.push(p)
  }
  return acc
}
if (!statSync(ROOT, { throwIfNoEntry: false })) {
  console.error(`找不到 ${ROOT}/ —— 请在项目根目录运行`)
  process.exit(1)
}
const files = walk(ROOT)

const defined = new Map() // 令牌 -> { file, line, value }
const used = new Map()    // 令牌 -> [{ file, line, hasFallback, fallback }]

for (const file of files) {
  const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/)
  lines.forEach((line, i) => {
    const def = line.match(TOKEN_DEF)
    if (def) defined.set(def[1], { file, line: i + 1, value: def[2].trim() })
    for (const m of line.matchAll(TOKEN_USE)) {
      const name = m[1]
      if (!used.has(name)) used.set(name, [])
      // 取 var(...) 的 fallback 部分（到该层右括号为止）
      let fallback = null
      if (m[2]) {
        const rest = line.slice(m.index + m[0].length)
        let depth = 1, out = ''
        for (const ch of rest) {
          if (ch === '(') depth++
          else if (ch === ')') { if (--depth === 0) break }
          out += ch
        }
        fallback = out.trim()
      }
      used.get(name).push({ file, line: i + 1, fallback })
    }
  })
}

const errors = []

for (const [name, refs] of used) {
  if (defined.has(name)) continue
  for (const r of refs) {
    errors.push({
      kind: '未定义令牌',
      file: r.file, line: r.line,
      msg: `${name} 全库没有定义` +
        (r.fallback ? `（写了 fallback「${r.fallback}」，会悄悄顶上去）`
                    : '（没写 fallback，整条声明会被丢弃）'),
    })
  }
}

for (const [name, refs] of used) {
  const def = defined.get(name)
  if (!def) continue
  for (const r of refs) {
    if (!r.fallback || r.fallback.startsWith('var(')) continue
    if (r.fallback !== def.value) {
      errors.push({
        kind: 'fallback 不符',
        file: r.file, line: r.line,
        msg: `${name} 真值是「${def.value}」，这里却写了 fallback「${r.fallback}」` +
             `（令牌在 ${def.file}:${def.line}）`,
      })
    }
  }
}

const orphans = [...defined.entries()].filter(([n]) => !used.has(n))

console.log(`扫描 ${files.length} 个文件：定义 ${defined.size} 个令牌，引用到 ${used.size} 个`)

if (errors.length) {
  console.log(`\n✗ ${errors.length} 个问题：`)
  for (const e of errors) console.log(`  [${e.kind}] ${e.file}:${e.line}\n      ${e.msg}`)
} else {
  console.log('\n✓ 没有引用了不存在的令牌，也没有对不上的 fallback')
}

if (orphans.length) {
  console.log(`\n提示：${orphans.length} 个令牌定义了但没人用（不报错）：`)
  for (const [n, d] of orphans) console.log(`  ${n} = ${d.value}   (${d.file}:${d.line})`)
}

process.exit(errors.length ? 1 : 0)
