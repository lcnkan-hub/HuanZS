/**
 * 色系体检 —— 零依赖，直接 node 跑
 * 运行：npm run check:palettes（已串进 npm test）
 *
 * 管两件事，都是"写错了不会报错、只能在真机上看出来"的那一类：
 *
 *   1. **完整性**：每套色系必须成对写「白天块 + 夜里块」，并且两块都覆盖 REQUIRED 清单。
 *      缺一条的后果不是报错，而是**静默继承默认色系的值** —— 比如夜里漏了 --color-border，
 *      莓紫夜板上就会混进雾面板的冷灰边框。两套色混在一起，比整块不对还难查。
 *
 *   2. **对比度**：正文/次要/muted/主色/实心键的文字对底至少 4.5，图形类至少 3.0。
 *      色卡上的原色未必过得了 —— 例如虹彩雾的紫 #7C6BD6 压白字只有 4.26。
 *      这一条是底线，不是审美：过不了就按"保色相、只调明度"改，改完再跑一次。
 *
 * 解析口径与 check-tokens 一致：只认**同一行内** `--token: value;` 的写法。
 * 值一旦换行，这里读不到，会被判成"缺令牌"。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const VARS = join('src', 'styles', 'variables.css')
const PALETTE_DIR = join('src', 'styles', 'palettes')

/** 一套色系必须覆盖的令牌（材质类不在此列：玻璃 / 阴影 / 圆角全色系共用一套） */
const REQUIRED = [
  // 纸面 / 卡片 / 输入 / 弹层
  '--color-bg-primary', '--color-bg-card', '--color-bg-input', '--color-bg-modal', '--color-bg-subtle',
  // 文字四级
  '--color-text-primary', '--color-text-secondary', '--color-text-muted', '--color-text-neutral',
  // 主色三件 + 选中态 + 三种 on-*
  '--color-accent', '--color-accent-solid', '--color-accent-light',
  '--color-text-on-solid', '--color-text-on-accent', '--color-text-on-dark',
  // 语义色
  '--color-danger', '--color-danger-bg', '--color-success', '--color-success-deep', '--color-success-bg',
  // 边框
  '--color-border', '--color-border-light', '--color-border-input',
  // markdown 三种强调字
  '--color-markdown-blue', '--color-markdown-brown', '--color-markdown-green',
  // 纸面基色 + 色斑
  '--page-rgb', '--page-canvas-image', '--nav-pill-bg', '--nav-pill-fg',
  // 王冠身份色（白天跟色系走；夜板留给王冠那一轮）
  '--color-crown-lit', '--crown-avatar-bg', '--crown-avatar-shadow', '--crown-bg'
]

/**
 * 对比度检查对（前景, 背景, 下限）。
 * 背景取该色系自己的纸/卡/实心色 —— 不用默认色系的值，否则等于没测。
 */
const CONTRAST_PAIRS = [
  ['--color-text-primary', '--color-bg-primary', 4.5],
  ['--color-text-secondary', '--color-bg-primary', 4.5],
  ['--color-text-muted', '--color-bg-primary', 4.5],
  ['--color-text-muted', '--color-bg-card', 4.5],
  ['--color-accent', '--color-bg-primary', 4.5],
  ['--color-accent', '--color-bg-card', 4.5],
  ['--color-text-on-solid', '--color-accent-solid', 4.5],
  // 底栏反色药丸：夜里它是唯一一块不跟主色走的"选中"底（雾面板是紫、其余两套是近白）
  ['--nav-pill-fg', '--nav-pill-bg', 4.5],
  ['--color-danger', '--color-bg-card', 4.5],
  ['--color-success', '--color-bg-card', 4.5],
  ['--color-markdown-blue', '--color-bg-card', 4.5],
  ['--color-markdown-brown', '--color-bg-card', 4.5],
  ['--color-markdown-green', '--color-bg-card', 4.5],
  ['--color-crown-lit', '--color-bg-card', 3.0] // 只做线条图标
]

/** 剥注释（块注释 + 行注释），免得注释里的令牌名被当成定义 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
}

/** 取某个选择器后面的第一个 {…} 块里的令牌表（选择器按字面量匹配，含点号） */
function readBlock(src, selector) {
  const at = src.indexOf(selector + ' {')
  if (at < 0) return null
  const open = src.indexOf('{', at)
  let depth = 1
  let i = open + 1
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
  }
  const body = src.slice(open + 1, i - 1)
  const map = new Map()
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/)
    if (m) map.set(m[1], m[2].trim())
  }
  return map
}

/* ---------- 颜色解析 ---------- */
function parseColor(v) {
  if (!v) return null
  const s = v.trim()
  let m = s.match(/^#([0-9a-fA-F]{6})$/)
  if (m) {
    const n = m[1]
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
  }
  m = s.match(/^#([0-9a-fA-F]{3})$/)
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16))
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4])
    if (a < 0.99) return null // 半透明的值不参与测（底下是什么颜色取决于场景）
    return [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  return null
}

function relLum(rgb) {
  const f = (c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = rgb
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
  const la = relLum(a)
  const lb = relLum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/* ---------- 收集所有色系 ---------- */
const blocks = [] // { name, day: Map, night: Map }

const varsSrc = stripComments(readFileSync(VARS, 'utf8'))
const defaultDay = readBlock(varsSrc, ':root')
const defaultNight = readBlock(varsSrc, '.theme-deep')
if (!defaultDay) {
  console.error(`[check-palettes] ${VARS} 里没读到 :root 块`)
  process.exit(1)
}
if (!defaultNight) {
  console.error(`[check-palettes] ${VARS} 里没读到 .theme-deep 块（默认色系的夜版）`)
  process.exit(1)
}
blocks.push({ name: '雾面板（默认 · variables.css）', day: defaultDay, night: defaultNight })

if (statSync(PALETTE_DIR, { throwIfNoEntry: false })) {
  for (const f of readdirSync(PALETTE_DIR).filter((x) => x.endsWith('.css'))) {
    const src = stripComments(readFileSync(join(PALETTE_DIR, f), 'utf8'))
    // 文件名 → 类名：iridescent.css → .palette-iridescent
    const id = f.replace(/\.css$/, '')
    const sel = `.palette-${id}`
    const day = readBlock(src, sel)
    const night = readBlock(src, sel + '.theme-deep')
    if (!day) {
      console.error(`[check-palettes] ${join(PALETTE_DIR, f)} 里没读到 ${sel} 块`)
      process.exit(1)
    }
    blocks.push({ name: `${id}（${f}）`, day, night })
  }
}

const errors = []

for (const b of blocks) {
  if (!b.night) {
    errors.push(`[缺整块] ${b.name}：没有 ${'.theme-deep'} 夜版块（夜里会整块掉回默认色系）`)
    continue
  }
  for (const token of REQUIRED) {
    if (!b.day.has(token)) errors.push(`[缺令牌] ${b.name} · 白天块没写 ${token}`)
    if (!b.night.has(token)) errors.push(`[缺令牌] ${b.name} · 夜里块没写 ${token}`)
  }

  for (const [fgToken, bgToken, min] of CONTRAST_PAIRS) {
    for (const [when, set] of [['白天', b.day], ['夜里', b.night]]) {
      const fgRaw = set.get(fgToken)
      const bgRaw = set.get(bgToken)
      if (!fgRaw || !bgRaw) continue // 缺值已经报过，不再重复
      const fg = parseColor(fgRaw)
      const bg = parseColor(bgRaw)
      if (!fg || !bg) continue // 半透明（如 rgba 卡片底）不测
      const ratio = contrast(fg, bg)
      if (ratio < min) {
        errors.push(
          `[对比度] ${b.name} · ${when} · ${fgToken}(${fgRaw}) 压在 ${bgToken}(${bgRaw}) 上只有 ` +
          `${ratio.toFixed(2)}（要求 ≥ ${min}）`
        )
      }
    }
  }
}

console.log(`扫描 ${blocks.length} 套色系：${blocks.map((b) => b.name).join(' / ')}`)

if (errors.length) {
  console.log(`\n✗ ${errors.length} 个问题：`)
  for (const e of errors) console.log(`  ${e}`)
  process.exit(1)
}

console.log('\n✓ 每套色系昼夜完整，正文类对比度都过 4.5、图形类过 3.0')
