/**
 * 界面体检 —— 零依赖，直接 node 跑
 * 运行：npm run check:ui
 *
 * 为什么需要它：这个项目里有一条规矩是"写错了不会报错、只能在真机上被眼睛发现"的。
 * check-tokens.mjs 管的是 var() 写错名字（静默丢声明），这个脚本管字号：
 *
 *   1. 字号跳过刻度写裸 px。
 *      2026-10-11 之前全库长出 18 档裸 px，中间夹着 11.5 / 12.5 / 13.5 三个半像素值 ——
 *      它们跟相邻整数档在真机上肉眼无差别，却让基线对不齐、字阶也说不清是几档。
 *      现在字号只有一个来源：variables.css 的 --text-N。绕过它就该拦住。
 *      刻意允许 rem / em：将来跟系统字体大小走（Dynamic Type）时，只有相对单位会跟着放大，
 *      px 不会 —— 所以这里拦的是 px，不是"没用变量"。
 *
 *   2. var(--text-N) 引用了刻度表里没有的档位（比如手滑写成 --text-19）。
 *      刻度表从 variables.css 读，不在这里抄第二份 —— 抄一份就会有两份真相。
 *
 * 为什么不管动效时长：《王冠视觉与交互设计系统》那条 700ms 天花板管的是**交互反馈**
 * 的延迟感，而 CrownEntrance / SplashScreen 的入场编排（1~3s）、ChatView 跨 6:00/18:00
 * 的换底（0.8s）、CrownBackdrop 的夜色淡入（1.2s）都是氛围，本来就该慢。
 * 静态扫描分不出这两类，硬做成红绿灯只会训练人忽略输出，所以不在这里判。
 *
 * 扫描前先剥注释：三层注释（<!-- -->、块注释、行注释）都要剥，
 * 否则"解释这个坑"的注释本身会被当成这个坑。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const STYLE_EXT = /\.(vue|css)$/
const VARS_FILE = join(ROOT, 'styles', 'variables.css')

function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (STYLE_EXT.test(e.name)) acc.push(p)
  }
  return acc
}

if (!statSync(ROOT, { throwIfNoEntry: false })) {
  console.error(`找不到 ${ROOT}/ —— 请在项目根目录运行`)
  process.exit(1)
}

// 刻度表：唯一来源是 variables.css
const scale = new Set()
for (const line of stripComments(readFileSync(VARS_FILE, 'utf8')).split(/\r?\n/)) {
  const m = line.match(/^\s*--text-(\d+)\s*:/)
  if (m) scale.add(m[1])
}
if (scale.size === 0) {
  console.error(`[check-ui] ${VARS_FILE} 里没读到任何 --text-N，刻度表可能被改坏了`)
  process.exit(1)
}

const files = walk(ROOT)
const errors = []

for (const file of files) {
  const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/)

  lines.forEach((line, i) => {
    const at = { file, line: i + 1 }

    // 1. 裸 px 字号（值里带 var(--text-…) 的放过：那是刻度的 fallback）
    for (const m of line.matchAll(/font-size\s*:\s*([^;{}]+)/g)) {
      const value = m[1].trim()
      if (value.includes('var(--text-')) continue
      const px = value.match(/(\d+(?:\.\d+)?)px/)
      if (!px) continue
      const half = px[1].includes('.')
      errors.push({
        ...at,
        msg: `font-size 写了裸 px「${value}」` +
             (half ? '（还是半像素值，与相邻整数档在真机上没有差别，只会让基线对不齐）' : '') +
             ` —— 改成 var(--text-N)，刻度表见 ${VARS_FILE}`,
      })
    }

    // 2. var(--text-N) 的档位必须存在
    for (const m of line.matchAll(/var\(\s*--text-(\d+)/g)) {
      if (scale.has(m[1])) continue
      errors.push({ ...at, msg: `引用了刻度表里没有的 --text-${m[1]}（现有档位：--text-${[...scale].join(' / --text-')}）` })
    }
  })
}

const rungs = [...scale].sort((a, b) => a - b).join(' / ')
console.log(`扫描 ${files.length} 个样式文件：刻度 ${scale.size} 档（--text-${rungs}）`)

if (errors.length) {
  console.log(`\n✗ ${errors.length} 个问题：`)
  for (const e of errors) console.log(`  ${e.file}:${e.line}\n      ${e.msg}`)
} else {
  console.log('\n✓ 没有绕过字号刻度的裸 px，也没有不存在的档位')
}

process.exit(errors.length ? 1 : 0)
