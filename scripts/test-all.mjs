/**
 * 统一测试入口（2026-11-24）
 *
 * 为什么需要：项目里有 11 个断言套件，分两种启动方式（run-xxx-tests.mjs 包装 / 直接 .test.mjs），
 * 以前只有 11 个 `npm run test:xxx` 各跑各的 —— 没有「一次跑完、一个退出码」的入口，
 * 于是 CI 没法接，人也会只跑自己记得的那两三个。
 *
 * 设计取舍：
 *   · **每个套件一个独立进程**：套件之间会改 globalThis.localStorage / indexedDB 替身，
 *     同进程跑必然互相污染（而且它们没法安全地反复 import）。
 *   · 判据只看**退出码**：11 个套件都已经在失败时 exit(1) 或置 process.exitCode=1（已逐个核对）。
 *   · 成功只打一行摘要，失败才把那一段输出倒出来 —— 失败信息全倒会把终端刷没。
 *
 * 用法：
 *   node scripts/test-all.mjs              跑全部
 *   node scripts/test-all.mjs backup image 只跑指定（调试时用）
 */
import { spawnSync } from 'node:child_process'

/** 套件清单：name 用于命令行筛选，file 是直接交给 node 的入口 */
const SUITES = [
  { name: 'crisis',    file: 'scripts/run-crisis-tests.mjs' },
  { name: 'backup',    file: 'scripts/run-backup-tests.mjs' },
  { name: 'image',     file: 'scripts/run-image-tests.mjs' },
  { name: 'import',    file: 'scripts/run-import-tests.mjs' },
  { name: 'proactive', file: 'scripts/run-proactive-tests.mjs' },
  { name: 'lasttab',   file: 'scripts/run-lasttab-tests.mjs' },
  { name: 'storage',   file: 'scripts/storage-health.test.mjs' },
  { name: 'sync',      file: 'scripts/storage-sync.test.mjs' },
  { name: 'reminder',  file: 'scripts/backup-reminder.test.mjs' },
  { name: 'retrieval', file: 'scripts/retrieval.test.mjs' },
  { name: 'silent',    file: 'scripts/silent-failure.test.mjs' }
]

const TIMEOUT_MS = 180_000

/** 从套件输出里挑一行当摘要（各套件的收尾格式不统一，按优先级找） */
function pickSummary(out) {
  const lines = String(out || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (/^结果:/.test(l) || /^全部通过/.test(l) || /^---.*断言/.test(l) || /^ALL PASS/.test(l)) return l
  }
  return lines[lines.length - 1] || ''
}

/** 失败时倒出的行数：够看出是哪一条断言炸了，又不至于把终端刷没 */
const TAIL_LINES = 24

function tail(text) {
  const lines = String(text || '').split(/\r?\n/)
  return lines.slice(-TAIL_LINES).join('\n')
}

const only = process.argv.slice(2)
const targets = only.length ? SUITES.filter(s => only.includes(s.name)) : SUITES

if (!targets.length) {
  console.error('没有匹配的套件。可选：' + SUITES.map(s => s.name).join(' / '))
  process.exit(1)
}

const started = Date.now()
let pass = 0
const failed = []

for (const suite of targets) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [suite.file], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    env: { ...process.env, FORCE_COLOR: '0' }
  })
  const ms = Date.now() - t0
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const ok = r.status === 0 && !r.error

  if (ok) {
    pass++
    console.log(`  ✓ ${suite.name.padEnd(10)} ${String(ms + 'ms').padStart(8)}  ${pickSummary(out)}`)
  } else {
    failed.push(suite.name)
    const why = r.error ? `启动失败：${r.error.message}` : `退出码 ${r.status}`
    console.log(`  ✗ ${suite.name.padEnd(10)} ${String(ms + 'ms').padStart(8)}  ${why}`)
    // 失败才倒输出尾部：成功时全倒会把汇总刷到看不见
    console.log(tail(out).split('\n').map(l => '      ' + l).join('\n'))
  }
}

const totalMs = Date.now() - started
console.log('')
console.log('─'.repeat(56))
console.log(`结果: ${pass} 通过 / ${failed.length} 失败 / 共 ${targets.length}（${(totalMs / 1000).toFixed(1)}s）`)
if (failed.length) {
  console.log('失败的套件：' + failed.join(', '))
  console.log('单独复跑：node scripts/test-all.mjs ' + failed.join(' '))
  process.exit(1)
}
console.log('ALL PASS ✓')
