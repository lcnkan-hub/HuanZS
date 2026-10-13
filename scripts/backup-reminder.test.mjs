/**
 * 备份提醒判据 · 断言套件（零依赖原生 node）· 配套问题清单 I14「导出提醒」
 * 运行：npm run test:reminder
 *
 * 这条问题的根不是"没有提醒"，而是"提醒从来不真的发生"：
 * 能力早就有了（I01 导出 + 卡片上一行小字），但没人会主动去点。
 * 于是这套断言的一半在守**什么时候该闭嘴** —— 一条天天弹的提醒，
 * 用户第三天就学会无视它，那跟没有提醒是一回事。
 */
import { register } from 'node:module'
register('./resolve-hook.mjs', import.meta.url)

const assert = (await import('node:assert/strict')).default
const {
  shouldRemind, reminderText, daysSince, snoozeUntilTomorrow, REMIND_AFTER_DAYS, DAY_MS
} = await import('../src/utils/backupReminder.js')

let pass = 0
let fail = 0
const failed = []
const ok = (name, fn) => {
  try {
    fn()
    pass++
    console.log('  ✓ ' + name)
  } catch (e) {
    fail++
    failed.push({ name, msg: e.message })
    console.log('  ✗ ' + name + '\n    → ' + e.message)
  }
}

const NOW = Date.parse('2026-10-13T20:00:00+08:00')
const daysAgoIso = (n) => new Date(NOW - n * DAY_MS).toISOString()

console.log('\n【冻结物】阈值')
ok('提醒阈值是 14 天（要改先想清楚：改的是"多久算久了"）', () => {
  assert.equal(REMIND_AFTER_DAYS, 14)
})

console.log('\n【什么时候该闭嘴】')
ok('空库（没数据）→ 不提醒', () => {
  assert.equal(shouldRemind({ hasData: false, now: NOW }).remind, false)
  assert.equal(shouldRemind({ hasData: false, now: NOW }).reason, 'empty')
})
ok('空库且从没导出过 → 也不提醒（刚装好就被催很烦）', () => {
  assert.equal(shouldRemind({ hasData: false, lastExportAt: null, now: NOW }).remind, false)
})
ok('13 天前导过 → 不提醒', () => {
  const r = shouldRemind({ hasData: true, lastExportAt: daysAgoIso(13), now: NOW })
  assert.equal(r.remind, false)
  assert.equal(r.reason, 'fresh')
  assert.equal(r.days, 13)
})
ok('今天刚导过 → 不提醒', () => {
  assert.equal(shouldRemind({ hasData: true, lastExportAt: daysAgoIso(0), now: NOW }).remind, false)
})
ok('时间戳坏掉 → 不提醒（判不出来就别吓人）', () => {
  const r = shouldRemind({ hasData: true, lastExportAt: '不是时间', now: NOW })
  assert.equal(r.remind, false)
  assert.equal(r.reason, 'bad_timestamp')
})

console.log('\n【什么时候该说话】')
ok('14 天整 → 提醒（边界就在 14）', () => {
  const r = shouldRemind({ hasData: true, lastExportAt: daysAgoIso(14), now: NOW })
  assert.equal(r.remind, true)
  assert.equal(r.reason, 'overdue')
  assert.equal(r.days, 14)
})
ok('30 天前导过 → 提醒，并把天数报出来', () => {
  const r = shouldRemind({ hasData: true, lastExportAt: daysAgoIso(30), now: NOW })
  assert.equal(r.remind, true)
  assert.equal(r.days, 30)
})
ok('★ 从没导出过但有数据 → 提醒（这才是最该催的一种：用挺久、一次没备份）', () => {
  const r = shouldRemind({ hasData: true, lastExportAt: null, now: NOW })
  assert.equal(r.remind, true)
  assert.equal(r.reason, 'never_exported')
})

console.log('\n【「今天先不」只压一天，不永久消失】')
ok('点了「今天先不」→ 当天不再提醒', () => {
  const r = shouldRemind({
    hasData: true, lastExportAt: daysAgoIso(20), now: NOW, snoozedUntil: snoozeUntilTomorrow(NOW)
  })
  assert.equal(r.remind, false)
  assert.equal(r.reason, 'snoozed')
})
ok('★ 到了第二天 → 照旧提醒（事实没变，提醒就不该永久消失）', () => {
  const snooze = snoozeUntilTomorrow(NOW)
  const tomorrow = Date.parse(snooze) + 60 * 1000
  assert.equal(shouldRemind({ hasData: true, lastExportAt: daysAgoIso(20), now: tomorrow, snoozedUntil: snooze }).remind, true)
})
ok('暂缓时刻的坏值 → 当作没暂缓（不因为一个坏值就永远闭嘴）', () => {
  assert.equal(shouldRemind({ hasData: true, lastExportAt: daysAgoIso(20), now: NOW, snoozedUntil: '坏值' }).remind, true)
})
ok('snoozeUntilTomorrow 落在次日 0 点', () => {
  const iso = snoozeUntilTomorrow(NOW)
  const d = new Date(iso)
  assert.equal(d.getHours(), 0)
  assert.equal(d.getMinutes(), 0)
  assert.ok(Date.parse(iso) > NOW)
})

console.log('\n【文案】')
ok('从没导出过的文案说的是"还没导出过"', () => {
  const t = reminderText({ remind: true, reason: 'never_exported' })
  assert.match(t.title, /还没导出过/)
  assert.match(t.detail, /唯一/)
})
ok('超期文案带天数', () => {
  const t = reminderText({ remind: true, reason: 'overdue', days: 21 })
  assert.match(t.title, /21 天前/)
})
ok('daysSince 向下取整，解析不出来给 null', () => {
  assert.equal(daysSince(daysAgoIso(3.9), NOW), 3)
  assert.equal(daysSince('坏值', NOW), null)
})

console.log('\n══════════════════════════════')
console.log(`结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail}`)
if (fail) {
  console.log('\n失败明细:')
  failed.forEach(f => console.log(`  ✗ ${f.name}\n    ${f.msg}`))
  process.exit(1)
} else {
  console.log('ALL PASS ✓')
  process.exit(0)
}
