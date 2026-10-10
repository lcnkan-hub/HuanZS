/**
 * 空库开局（I04）断言套件 —— npm run test:starter
 *
 * 只测纯逻辑：判据、标题、以及「回答 → 能落库的动作」这个转换。
 * 落库本身（writeWikiItems）不在这里跑（要 localStorage + dbData），但转换出来的形状
 * 必须满足它的硬校验 —— 那几条在下面对应位置逐条钉住。
 */
import {
  isStarterTab, isCategoryEmpty, isLibraryEmpty, starterQuestion, entryTitle, buildStarterEntry
} from '../src/utils/starterJudge.js'
import { STARTER_CARDS, STARTER_TITLE_MAX } from '../src/constants/starter.js'
import { MIN_CONTENT_LEN } from '../src/composables/useWikiWriter.js'
import { setPendingStarter, takePendingStarter, peekPendingStarter } from '../src/composables/useStarter.js'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name) }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')) }
}

const emptyDb = { game: [], note: [], life: [] }
const someDb = { game: [{ id: 'a', name: '原神' }], note: [], life: [] }

// ─────────── 空不空：必须和「搜索没搜到」分开 ───────────
ok('三条分类都空 → 整库空', isLibraryEmpty(emptyDb) === true)
ok('有一条就不算整库空', isLibraryEmpty(someDb) === false)
ok('该分类空 → true', isCategoryEmpty(emptyDb, 'game') === true)
ok('该分类有条目 → false（哪怕别的分类是空的）', isCategoryEmpty(someDb, 'game') === false)
ok('别的分类空仍然 true', isCategoryEmpty(someDb, 'note') === true)
ok('非内容 tab（如 mine/crown）不给开局卡片', isCategoryEmpty(emptyDb, 'mine') === false && isCategoryEmpty(emptyDb, 'crown') === false)
ok('db 缺失不炸、也不算空', isCategoryEmpty(null, 'game') === false && isLibraryEmpty(null) === false)
ok('db[tab] 不是数组（半损坏）不误判', isCategoryEmpty({ game: 'oops' }, 'game') === false)

// ─────────── 问句与文案 ───────────
ok('三个分类都有问句', STARTER_CARDS.every(c => c.tab && c.question && c.where))
ok('每个 tab 都能取到问句', STARTER_CARDS.every(c => starterQuestion(c.tab) === c.question))
ok('非法 tab 取问句 → 空串', starterQuestion('mine') === '' && starterQuestion(undefined) === '')
ok('三个 tab 不重复', new Set(STARTER_CARDS.map(c => c.tab)).size === STARTER_CARDS.length)
ok('问句是问句（以？结尾）', STARTER_CARDS.every(c => c.question.endsWith('？')))

// ─────────── 标题：第一句 + 截断 ───────────
ok('标题取第一句', entryTitle('原神。最近在抽夜兰') === '原神')
ok('标题按句末标点切（！）', entryTitle('通关了！太难了') === '通关了')
ok('换行也切', entryTitle('原神\n另一个事') === '原神')
ok('超长截断到 ' + STARTER_TITLE_MAX + ' 字', entryTitle('一二三四五六七八九十甲乙丙丁戊己庚辛').length === STARTER_TITLE_MAX)
ok('短内容原样保留', entryTitle('原神') === '原神')
ok('空内容 → 空标题', entryTitle('   ') === '' && entryTitle(null) === '')

// ─────────── 回答 → 落库动作（这个功能的命门）───────────
const long = buildStarterEntry('最近在玩原神。刚抽到夜兰，主线做到第五章了', 'game')
ok('长回答：落成 game 分类的新建动作', long && long.mode === 'new' && long.category === 'game')
ok('长回答：正文就是原话（不污染成问答体）', long.content === '最近在玩原神。刚抽到夜兰，主线做到第五章了')
ok('长回答：标题取第一句', long.title === '最近在玩原神', long.title)

// ★ 逗号不断句：标题兼着「同名去重」职责，逗号处断会让两句不同的回答撞成同名 → 后一句被静默丢弃
ok('逗号不断句（少丢内容）', entryTitle('先学 vue，再学 react') === '先学 vue，再学 react', entryTitle('先学 vue，再学 react'))

// ★ 短回答必须能落库 —— 开局第一条最可能就是这么短（"原神"两个字）
const short = buildStarterEntry('原神', 'game')
ok('短回答也能落库（不被 8 字下限吃掉）', short !== null)
ok('短回答：正文补成问答形态并够长', short.content.length >= MIN_CONTENT_LEN, short.content)
ok('短回答：问句进来了', short.content.includes(starterQuestion('game')))
ok('短回答：答的内容没丢', short.content.includes('原神'))
ok('短回答：标题仍是原话', short.title === '原神')

ok('三个分类的短回答都能落库', ['game', 'note', 'life'].every(t => buildStarterEntry('原神', t) !== null))

// ★ 反例：真没内容就别硬凑
ok('空回答 → null（不硬造条目）', buildStarterEntry('', 'game') === null && buildStarterEntry('   ', 'game') === null)
ok('一个字不成话 → null（不塞用户转头就得删的垃圾）', buildStarterEntry('嗯', 'game') === null && buildStarterEntry('好', 'note') === null)
ok('两个字就算答了（「原神」能落库）', buildStarterEntry('原神', 'game') !== null)
ok('非法分类 → null（绝不写进白名单外的分类）', buildStarterEntry('最近在玩原神挺开心的', 'mine') === null && buildStarterEntry('最近在玩原神挺开心的', null) === null)

// ─────────── 形状契约：必须满足 useWikiWriter.normalize 的硬关（否则会被静默丢弃）───────────
const shapes = [long, short, buildStarterEntry('在学 vue 和 node', 'note')]
ok('契约：mode/title/category/content 四件齐', shapes.every(s => s.mode === 'new' && s.title && s.category && s.content))
ok('契约：category 在白名单内', shapes.every(s => ['game', 'note', 'life'].includes(s.category)))
ok('契约：正文 ≥ MIN_CONTENT_LEN（' + MIN_CONTENT_LEN + '）', shapes.every(s => s.content.length >= MIN_CONTENT_LEN))
ok('契约：标题 ≤ 40（writer 的 MAX_TITLE_LEN）', shapes.every(s => s.title.length <= 40))

// ─────────── 待办状态：take 语义（防残留把无关的话记成词条）───────────
setPendingStarter('note')
ok('set 之后 peek 得到', peekPendingStarter() === 'note')
ok('take 取得并清空', takePendingStarter() === 'note' && peekPendingStarter() === null)
ok('take 过了再 take → null（不会重复落库）', takePendingStarter() === null)
setPendingStarter(null)
ok('传 null 等于清空', peekPendingStarter() === null)

console.log('\n--- 空库开局断言: ' + pass + '/' + (pass + fail) + ' ---')
if (fail > 0) process.exitcode = 1
