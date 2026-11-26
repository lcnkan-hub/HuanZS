# 寰中枢 — 个人百科知识库

> 更新：2026-11-25（v3.6 多图添加 + 进库前压缩，见文末；v3.0 单层记录重构见下方）

## 技术栈
- Vue 3（Composition API + `<script setup>`）
- Vite 5 构建
- localStorage 持久化（百科数据/聊天/记忆）+ IndexedDB（图片仓库，避开 5MB 上限）
- 纯 CSS（CSS Variables 主题体系）
- 零后端依赖（纯前端 SPA；王冠 AI 直连 DeepSeek API）
- Capacitor 8（Android 打包，`android/` 目录）

## 页面结构（Tab 导航）
| Tab | key | 说明 |
|-----|-----|------|
| 🎮 游戏 | game | 游戏百科列表 |
| 📝 笔记 | note | 笔记百科列表 |
| 🍀 生活 | life | 生活百科列表 |
| 👑 王冠 | crown | AI 伙伴聊天（全屏，隐藏底部导航） |
| 👤 我的 | mine | 个人中心 |

## 数据结构
```js
// 2026-11-21 起：记录是单层数组，存在 huan_zhong_shu_records（按账号隔离）
records = [
  {
    id: string, name: string, wiki: string(Markdown),   // 标题 + 正文
    creator: string, time: string("YYYY/MM/DD HH:mm"),
    origin: 'user' | 'crown'                            // 手建 / 王冠代记
    // 2026-11-22：children（子词条）已下线，记录是纯单层，不再有父子
  }
]

userProfile = { id: string(6位数字), name: string, avatar: string(emoji) }
chatMessages = [ { id, role: 'user'|'assistant', content, time } ]  // huan_zhong_shu_chat
memories = [ { id, type, content, source, sentiment, status, created_at, ... } ]  // huan_zhong_shu_memory_v1
```
> 旧的三分类 `dbData = {game, note, life}` 与存储键 `huan_zhong_shu_db` 已于 2026-11-21 删除；
> 备份 schema 升到 2，旧备份文件会被明确拒绝导入。

## 核心功能
1. 记录 CRUD（单层，无父子层级）
2. 搜索过滤（按分类 + 关键词）
3. Markdown 渲染（标题/加粗/代码/颜色标签/图片引用 `id://img-xxx`）
4. 正文编辑器（阅读/编辑双模式 + IndexedDB 图片插入 + 缩略图预览）
5. 个人中心（足迹统计 + 「我创建的」一行数字入口 + 本机账号 + 备份中心 + 王冠设置）
6. 王冠 AI 聊天（DeepSeek API + 人格系统 + 隐私边界）
7. 王冠记忆（白名单四类 + 情绪状态机 + C 档留门式开口）
8. 危机响应系统（五层管线 + 风险状态机 + 12356 转介）
9. 开屏动画 + 王冠入场动画（夜晚灯醒/白天光启双模式）
10. **用户自带密钥（BYOK）** + 模型适配层（DeepSeek / 智谱免费档可切，密钥只存本机、不进产物）
11. **王冠读百科 + 代记**：最近条目注入 → 提问命中注入正文 → 对话里自动归类落库（一次调用三岔路口）
12. **王冠主动开口**（宪法 R1 代码层落地）：每月 ≤3 条 / 仅 6:00–21:30 / 距上次互动 ≥20 小时 / 记忆为空不开口；开关在「我的 → 王冠」
13. **空库开局**：空列表不是空表格，三张能作答的卡片 + 「换手机了？从旧手机带进来」
14. **数据备份中心**：导出全量（百科/记忆/聊天/危机留痕/图片/档案）→ 换设备导入 → 导入前自动快照可回退
15. **本地账号系统**：注册/登录/退出，业务数据按账号隔离（`base@u<账号id>`），设备级键不加后缀
16. **首屏定位**：首次进来 → 王冠；之后 → 上次停留的 Tab
17. **「我的」页按用途重排**（一页里同一件事不出现两次）：名片 → 足迹 → 我创建的（点数字跳分类 + 只看我创建的）→ 账号 → 备份 → 王冠 → 修改资料

## 积木清单
| 目录 | 文件 | 职责 |
|------|------|------|
| common | SplashScreen.vue | 开屏动画 |
| common | AppIcon.vue | SVG 图标渲染（替代 emoji） |
| common | ModalBox.vue | 通用弹窗 |
| crown | ChatView.vue | 王冠聊天页编排 |
| crown | CrownEntrance.vue | 王冠入场动画（昼夜双模式） |
| crown | MemorySheet.vue | 记忆查看面板 |
| layout | BottomNav.vue | 底部导航（5 Tab） |
| layout | AppHeader.vue | 顶部搜索栏 |
| wiki | WikiDetail.vue | 详情页（返回 / 点标题改名 / 写正文） |
| wiki | WikiList.vue | 列表 + 搜索 + 「只看我创建的」筛选 chip |
| wiki | WikiCard.vue | 单张卡片 |
| wiki | StarterCards.vue | 空库开局三张卡片（I04） |
| user | MinePage.vue | 个人中心编排（按用途重排：名片→足迹→我创建的→账号→备份→王冠→资料） |
| user | UserProfileCard / FootprintSummary / MyItemsEntry / EditProfileModal | 名片 / 足迹总量与占比 / 「我创建的」一行数字入口 / 改资料弹窗 |
| user | AccountSection.vue + AuthView.vue | 本机账号（当前账号 / 退出换号）+ 账号门（注册/登录） |
| user | BackupCenter.vue | 备份中心（导出全量 / 导入 / 回退到导入前）· 取代旧 DataBackup |
| user | CrownSection.vue | 王冠卡（主动开口开关 + 本月次数 + 模型密钥行） |
| user | AiSettingsModal.vue | AI 设置弹窗（选服务商 / 填密钥 / 测试连接 / 清除）· BYOK |
| composables | useLocalStorage.js | localStorage 封装（deep watch 同步） |
| composables | useUserProfile.js | 用户档案（创建/读取/修改） |
| composables | useWikiData.js | 百科 CRUD + 子词条 + 导入导出校验 |
| composables | usePageRouter.js | 页面叠层路由 + 动画状态机 |
| composables | useChat.js | 聊天消息管理（增删/持久化/欢迎语） |
| composables | useChatAI.js | DeepSeek 请求 + 危机管线短路 |
| composables | useMemory.js | 记忆写入/注入/状态机/隐私话术 |
| composables | useImageStore.js | IndexedDB 图片仓库（增删查/清理） |
| composables | useApiKey.js | 密钥 / 服务商读写（模块级单例，只存本机 localStorage）· BYOK |
| composables | useAccount.js | 本机账号（注册/登录/退出；账号表与登录态是设备级键） |
| composables | useBackup.js + useBackupStore.js | 全量导出 / 导入 / 导入前快照与回退 |
| composables | useStarter.js | 空库开局：卡片问句 → 王冠接问 → 回答落成该分类第一条 |
| composables | useProactive.js + useProactiveTrigger.js | 主动开口账本与生成 + 触发点（挂 app 生命周期） |
| composables | useLastTab.js | 首屏定位（首次→王冠，之后→上次停留；非法值回落王冠） |
| composables | useTimeMode.js | 昼夜判定唯一来源（入场动画与背景板共用） |
| composables | useWikiContext.js | 百科 → 王冠上下文（命中给正文 / 未命中给最近清单）· 只读 |
| composables | useWikiWriter.js | 回合提取结果校验后写入百科（新建 / 追加 / 挂子词条 + 保守过滤 + origin 标记） |
| constants | categories.js | Tab/分类/存储键统一配置（含设备级 vs 业务级键的划分） |
| constants | proactive.js | 主动开口唯一出口（配额/时间窗/最小间隔/账本上限）——宪法 R1 的代码层 |
| constants | starter.js | 空库开局的卡片与问句 |
| constants | aiProviders.js | AI 服务商 / 接口地址 / 模型名唯一真相源 |
| constants | icons.js | SVG 图标库（统一 viewBox/描边） |
| constants | crisis.js + crisisContextPatterns.js | 危机信号定义 + 上下文模式 |
| services | crisisDetection / crisisResponse / riskStateMachine / storageAdapter | 危机五层管线 + 存储适配 |
| utils | markdownParser.js / uniqueId.js | Markdown 编译 / ID 生成 |
| utils | proactiveJudge.js | 「该不该主动开口」纯函数判据（可脱离界面单测） |
| utils | starterJudge.js / storageScope.js | 空库开局判据 / 按账号给存储键加后缀 |
| styles | variables.css | 主题变量体系（换肤改一处） |
| scripts | check-no-secret.mjs | 产物密钥闸门（已串进 `npm run build`，命中即构建失败） |

## 产品形态：纯前端的三道天花板（2026-10-11 认下，非缺陷）

形态是**刻意选择**（数据本地优先、零后端），因此下面三条是**认下的边界**，不是待修 bug。
它们写在这里是为了让后来读代码的人（包括 AI）不再把它们当成"忘了做"：

| 天花板 | 表现 | 为什么认下 | 上后端才解 |
|:---|:---|:---|:---|
| 后台推送 | app 关着时王冠发不出消息；主动开口只在**打开 app 那一刻**判一次 | 浏览器不许网页后台自醒，硬做只能靠推送通道 | 需要服务端 + 推送 |
| 密钥 | 只能 BYOK（用户自带） | 前端放不下服务端密钥，放进产物等于公开 | 需要服务端代理 |
| 数据位置 | 数据只在这台设备；换手机靠导出/导入 | 无账号体系就无云端；导出/导入已做到"丢得起" | 需要账号 + 云存储 |

判据（什么时候重开这条）：**当"第二个人/第二周"这两关里，有哪一关是因为上面任一条过不去的时候**。
在那之前，上后端的成本（1~2 周 + 钱 + 合规）不划算。

## 测试
- `npm run test:crisis` — 危机响应系统 A/B/C/D 用例矩阵（修改危机结构必跑，见 RULES.md 第 11 条）
- `npm run test:compress` — 图片压缩阈值 / 等比尺寸 / 类型闸门（28 条纯函数断言）
- `npm run check:secret` — 密钥泄漏闸门：扫 `dist/` 里的密钥形态与 `.env` 历史值；已串进 `npm run build`

## 2026-11-21 单层记录重构（v3.0）

> 上面「积木清单」表是 v2.7 的快照，**本次重构后有出入**（删了 6 个文件、加了 4 个）。
> 以本节为准，等下次整体重写文档时再把表合并。

**删除**：\StarterCards.vue\、\FootprintSummary.vue\、\useWikiData.js\、\useStarter.js\、\utils/starterJudge.js\、\constants/starter.js\（空库开局三张卡 + 三分类数据层 + 足迹统计）。

**新增**：
- \composables/useRecords.js\ — 单层记录数组的 CRUD / 搜索 / 子记录 / 图片回收
- \components/user/MineSheet.vue\ — 「我的」浮层（宽 88%，从右滑入，不盖底栏，点遮罩关闭）
- \components/wiki/ItemBodyEditor.vue\ — 记录正文的阅读/编辑区（主记录 wiki 首次有 UI 入口）
- \components/wiki/AddRecordBar.vue\ — 搜索框下方占满一行的「记录一条」

**关键变化**：
1. 底栏只剩「记录 / 王冠」；\NAV_ITEMS\ 两项，\STORAGE_KEYS.DB\ → \RECORDS\。
2. 「我的」不再是 Tab：顶栏左侧按钮 → 右侧滑入卡片（名片 → 我创建的 → 账号 → 备份 → 王冠 → 修改资料）。
3. 点「添加」直接进空白详情页，标题与正文都在详情里写；返回时标题正文都空则自动删掉这条空记录。
4. 王冠代记仍保留「新建 / 追加 / 挂子记录」三种判断，但**不再判断分类**。
5. 备份 \BACKUP_SCHEMA_VERSION = 2\；旧三分类备份会被拒绝并说明原因。
6. 危机系统未改动（`npm run test:crisis` 仍 60/60 通过）。

## 2026-11-22 子词条下线（v3.1）

> 上面两节是 11-21 与更早的快照，**子词条相关内容已作废**。以本节为准。

**删除的文件**
- `components/wiki/SubEntryEditor.vue`（298 行）

**删除的能力**
- 详情页的「添加子词条」按钮、子词条列表、「N 个子词条」统计、「主词条」徽章、添加弹窗
- `useRecords` 的 `addChild` / `deleteChild` / `updateChildWiki`
- 王冠代记的 `mode: "child"`（提示词、`normalize`、写入分支、清单与查找里的 children 下钻全部移除）
- 王冠上下文里的 `flatten()` 不再展开 children

**数据形状**
- 记录变成纯单层：`{id,name,wiki,creator,time,origin}`
- 存量 `children` 在 `useRecords` 加载时由 `migrateDropChildren()` 一次性剥掉（幂等）
- 导出与导入两侧都过 `stripChildren()`：导出文件不再带 children，旧备份导入时同样剥掉
- ⚠️ 破坏面：旧子词条的标题与正文**永久不可恢复**（用户已确认，测试阶段可丢）

**不变**
- 危机系统、王冠聊天与记忆、备份/导入主流程、账号隔离、收藏（`huan_zhong_shu_favorites`）

## 2026-11-23 王冠页：底栏常驻 + 输入栏浮岛（v3.2）

**为什么**：切王冠时内容是推入的、底栏也一起退场 —— 整屏都在动（HIG · Motion 说该留一个不动的参照）。
底栏常驻之后，"记录"那颗就是回去的路，左上角返回键随之删除。

**改动**
- `BottomNav.vue`：删除 `pushed` 状态（王冠页不退场），只留 `sunk`（「我的」/ 键盘）；
  `.bottom-nav` 加 `z-index: 40`（必须写在这层包装上，它 `position: fixed` 自成堆叠上下文；
  只给 `.nav-dock` 写无效，实测会被 `.chat-container`（z-index 2）整片盖住）。
- `ChatView.vue`：输入栏从"全宽横条 + 三个裸浮物件"改成**一颗玻璃浮岛**（`--crown-glass-bg` + blur +
  999 圆角 + 内高光/描边/投影），垃圾桶收进浮岛；`margin-bottom: calc(var(--nav-zone) + 8px)` 让它落在浮岛上方；
  删除左上角 `.back-btn` 与其样式、删除 `back` emit。
- 新增 `composables/useKeyboard.js`（模块级单例）：用 `visualViewport` 高度差（>120px）判键盘，别用 focus 猜。
  键盘弹起 → 浮岛下沉（App 传 `sunk`）+ 输入栏让位收回 8px。
- `AGENTS.md` 新增「功能层（底栏浮岛）的规矩」四条。

**验证**（390×844）：王冠页浮岛 `opacity 1`、`dockTop 772`；输入栏 716~764，与浮岛间距 **8px**；
玻璃底 `rgba(255,255,255,.10)`（夜间令牌）、圆角 999px；`.back-btn` 已不存在；
真实点击浮岛「记录」→ 回记录页；「我的」浮层仍下沉；详情页底栏仍卸载。`build`/`check:ui`/`check:tokens`/`lint` 全绿。

**键盘（同日二次修正，改成"跟着键盘走"）**
- `useKeyboard.js` 从布尔升级成三个量：`kbInset`（键盘盖住多少）/ `kbShift`（输入栏上浮量）/ `kbOpen`。
  **两套判据取或**：① 可见区高度差 >120（iOS，布局视口不缩）；② 布局视口比本会话最高值矮 >120（Android adjustResize）。
  只写 ① 就是"在 Android 上碰巧对、换 iOS 就废"。
- 输入栏 `.kb-open` 时：`margin-bottom` 收回 8px + `transform: translateY(var(--kb-shift))` 整体上浮；
  消息列表 `padding-bottom` 补 `var(--kb-inset)`（否则最后一条被输入栏压住）；`kbInset` 变化时滚一次底。
- 键盘收起（含系统自动收起）→ `kbInset` 归 0、`kbOpen` 转 false，输入栏自动回到浮岛上方，无额外代码。
- 令牌 `--kb-inset` / `--kb-shift` 在 `variables.css` 里给 0 默认值（JS 行内覆盖）；
  不定义会被 `check:tokens` 判成"引用了不存在的令牌"。
- 实测（注入 300px 模拟键盘）：输入栏 bottom **536** = 键盘上沿 544 − 8；`margin 8px`、`transform -300`、
  列表 `padding-bottom 308`、浮岛 `translateY 98`（出屏）；撤掉后全部回到 716~764 / 80px / none / 8px。
- ⚠ 真机未验：桌面 Chromium 合成不出软键盘，`visualViewport` 不会变 ——
  打字时"光标行是否始终可见""切换输入法不抖"必须手机上确认。

**已知没做的**
- 无。原先挂在这里的两张欠账都已补上（见下），剩的唯一未验项是真机键盘手感（桌面合成不出软键盘）。

**2026-11-23 收尾（v3.2.1）**
- 未配密钥提示条：从全宽横条收成 **93×32「配置密钥」胶囊**（整颗可点、热区 44px），
  与输入栏一起放进 `.bottom-dock` 浮件组 —— 「跟随键盘」靠结构（同一 transform），不靠两份位移；
  组内 `gap: 6px`，常态与键盘态间距都是 6px。材质比输入浮岛薄一档（`--color-bg-input`），
  **用户定：保持这个次要档，不再提亮**。
- Android「滑动即收键盘」：`.message-list` 加 `touchstart`/`touchmove`，手指位移 >12px 即 `inputRef.blur()`
  （一次手势只收一次）。**不用 `scroll` 事件**：发消息后会自己调 `scrollToBottom()`，
  用 scroll 会在"刚发完一条消息"时把键盘收掉 —— 恰是最不想它收的时刻。
  真浏览器验证：40px 位移失焦 ✓ / 6px 抖动保持焦点 ✓ / 无焦点滑动不报错 ✓。

## 2026-11-23 「我的」页重排（v3.3）

**为什么**：原页约 1370px 高、可用区约 620px —— 两屏多，首屏正好切在「导出全量备份」按钮上；
同一件事在页内出现两次（用户出现两回、同一张头像画两遍、「都在同一个文件里」与备份卡提示重复）；
红色的「锁定本机」比真正的主按钮更抓眼，而它不删任何数据（语义用错）。

**结构**：名片（整卡可点 → 修改资料）→ 王冠 / 我的收藏 / 数据与备份 三行 → 锁定本机一行（页尾、次要色、无箭头）。
其余内容进二级页，标题与返回箭头由 `MineSheet` 头部承载（`page` 状态在 MineSheet，它才知道标题写什么）。

**卡片高度**：`height:88%` → `auto` + `max-height:88%`。内容只有 466px 时，固定 88% 会在下方空出四百多像素
（实测渲染，看着像没加载完）；改后卡高 449px，仍留 12% 记录页当「这是浮层」的参照。
内容超长由 max-height 夹住、卡片内部滚动（`.mine-card-body` 加 `min-height:0`，否则 flex 子项不缩、滚不动）。

**文案删改**：枢纽 ID、75 字的「本机说明」、备份卡的平台说明（手机 App / 电脑浏览器）、
「现在手机丢了，东西就真没了」、王冠 100 字说明（压成 3 次 / 6:00–21:30 / 20 小时三个数）。

**文件**：新增 `user/MineRow.vue`（一行的唯一实现）、`user/LockRow.vue`；
删除 `user/AccountSection.vue`（锁 → LockRow，账号与创建日期 → 名片副行）；
改 `MineSheet` / `MinePage` / `UserProfileCard` / `CrownSection` / `BackupCenter` / `MyFavoritesEntry`。

**验证**（442×786 真浏览器）：`build` / `check:ui` / `check:tokens` / `lint` 全绿，`test:backup` 89/89；
卡高 449、`scrollWidth = 442`（无横向溢出）；二级页标题/返回正常，王冠页 285px；
420 高视口下卡被夹到 370 = 88%，body 可滚动。截图见 `docs/screenshots/06~10`。

**2026-11-23 二次修正（弹窗与二级页尺寸）**
- **弹窗位置不受控**：`EditProfileModal` / `AiSettingsModal` 原来挂在 MinePage 里，
  落在 `.mine-card-body` 的滚动容器内，而 `.mine-card` 有 `transform`（入场动画）→
  它成了 fixed 的包含块，`100vw/100vh` 的遮罩按视图算、被卡片 `overflow:hidden` 裁掉，
  表现为「弹窗位置不对、看不全」。现在两个弹窗是卡片的直接子元素、在滚动区外。
- **高度上限改成 JS 量**：卡片的 height 是 auto，百分比 `max-height` 在"祖先高度不确定"的链条里
  会被当成 `none`（实测 `100%` 与 `calc(100% - 24px)` 都无效），所以 `ModalBox` 在 mount/resize 时
  按遮罩实际高度写 `maxHeight = 高度 − 20`；同时 `box-sizing:border-box`（限额必须按 border-box 裁，
  否则 padding 40 漏在限额外）、内容区单独滚动、标题与动作键钉住。
- **二级页与首页同高**：打开时量一次 `.mine-card-body` 的自然高度写死成内联 height。
  `.mine-card-body` 必须 `flex: 0 1 auto`（`flex:1` 的 `flex-basis:0` 会把 height 顶掉，实测切页后卡片缩回内容高）
  + `box-sizing:border-box`（量的是 border-box，写回的也得是，否则每量一次长 8px）。内容多了在卡内滚。
- **头部高度钉 44**：返回键本身 44，会让头部从 36 长到 52 —— 进二级页卡片凭空长 16px。
- **切换淡入**：`<transition mode="out-in">` 0.1s 出 / 0.18s 入，高度已固定所以只有透明度在动；
  MinePage 原来那条 `fadeInContent` 撤掉（两处各淡一次 = 0.48s 的拖沓）。
- **实测**（442×786）：首页 / 王冠 / 我的收藏 / 数据与备份四页卡高都是 **457**；
  编辑弹窗 **429**、AI 设置 **437**，都在卡内（上下留 10~14px），无需滚动；
  500 高视口下卡 440、弹窗 420，弹窗内部可滚 9px。截图 `docs/screenshots/07~12`。

## 2026-11-24 记录页：纸面 + 上下雾幕（v3.4）

**为什么**：用户给了一份参考（`frosted_glass_top_bottom_navigation_v2.html`）和一份设计方向说明。
要的是「轻量、通透、悬浮、内容穿透、柔和渐隐」这套**设计语言**，不是给按钮加一层 `blur()`。
原来的记录页恰好相反：深色画布（昼 `#070910` 白网格 + 蓝橙青斑，夜 `#17100F` 玫瑰网格），
卡片是深色半透明。浅纸底 + 白玻璃悬浮是另一套空间关系，不是调个色能到的地方。

**只改记录页**（用户明确：先只改主页、验方向，别一次改整个项目）。
详情页 / 王冠 / 「我的」仍是旧语言，留给"统一语言"那一轮。

**改动**
- `variables.css`：新增 `--page-rgb` / `--page-canvas-image` / `--mist-top(-mask)` /
  `--mist-bottom(-mask)` / `--mist-top-height` / `--mist-bottom-height` / `--sheet-top-gap`。
  ⚠ `--page-rgb` 与 `--color-bg-primary` 是**同一个颜色的两处书写**（CSS 无法从 hex 反推 channel），
  改纸色要两处一起改。
- `App.vue`：`.app-container` 去掉 `is-deep`（深色画布不再铺在记录页），改挂 `--page-canvas-image`；
  夜间令牌覆盖从 `.is-deep.is-night` 收窄成 `.is-night` —— **它现在只服务详情页**，
  写回三元条件会让夜里进详情页掉回蓝紫霓虹底。
  `.primary-sheet` 作为纸面作用域覆盖 `--surface-card*` 四条（卡片轻量化，不动全局令牌）。
  `.sheet-body` 顶部让位 55 → 55 + `--sheet-top-gap`(44)。
- `AppHeader.vue`：新增 `.chrome-mist`（`z-index:-1`，父级 `.header` 已有 z-index:20 自成上下文
  → 正好压在内容之上、按钮之下）。gradient 给颜色、mask 柔化远端；附 `@supports` 降级。
- `BottomNav.vue`：新增 `.nav-mist`（同上口径；geometric 是 `absolute` + `bottom:0`，
  父级 fixed/height:0 → 雾从屏幕底往上长，盖住手势条）。王冠页 `is-hidden`、浮岛下沉时 `is-sunk` 淡出。
  `theme-deep` 改成由 `App.vue` 只在「夜间 + 王冠 Tab」绑 —— 记录页昼夜都是浅色。
- `WikiDetail.vue`：`.theme-deep .detail-page-wrapper` → 无条件 `.detail-page-wrapper`，
  否则 page-stack 不挂 theme-deep 后详情页的网格与色斑会整个消失（只剩一块死黑）。
- `vite.config.js`：`server.watch.ignored` 加 `**/*.tmpdir/**`。原子写入会在源码目录留
  `.文件名.随机.tmpdir/`，Windows 上 Vite watcher 一 watch 到就 `EBUSY` 抛错、dev server 直接退出
  （本轮实测崩了两次，其中一个症状是编辑工具报 `ReplaceFileW EIO`）。

**验证**（390×844 真 Chrome：headless + 真尺寸 iframe，不用窗口缩放）
- 截图：`docs/screenshots/13-record-paper-glass.png`（静止）、`14-record-scroll-mist.png`（滚 520px：
  内容从顶栏后穿过并淡出）、`15-record-before-dark.png`（改前）。
- 像素采样（竖扫 x=300/700）：纸底 `rgb(246,241,240)`；雾幕边缘上下相邻采样色差 **≤5/255**，
  没有横向分层/色带；卡片边 `rgb(253,251,251)`。
- 王冠页实拍确认：仍深色、浮岛仍走 `theme-deep`、底部雾幕不出现（`is-hidden`）。
- `build`（含 `check:secret`）/ `check:ui` / `check:tokens` / `lint` 全绿。

**已知没做的**
- **夜间记录页也是浅色**（按设计方向，不再跟昼夜走）。若用户要"夜里回到深色"，
  在 `App.vue` 给 `.is-night` 加一组 `--page-*` / `--mist-*` 覆盖即可，不用动结构。
- 「我的」浮层夜间仍是深色（`theme-deep` 绑定未动），压在浅色记录页上会显得跳；留给统一那一轮。
- 真机未验：`backdrop-filter` 在 Android WebView（Capacitor）上的合成开销、
  iOS Safari 的 `mask-image` 前缀行为 —— 桌面 Chromium 与真机在这两点上不等价。

## 2026-11-24 详情页跟进：也换成纸面（v3.4.1）

用户要求"把详情页也按照改动"。做的是**同一套材质**，不是新设计：两页共用
`--color-bg-primary` + `--page-canvas-image`，卡片展开时从纸面长成纸面，中途没有底色跳变。

**改动**
- `WikiDetail.vue`：`.detail-page-wrapper` 底色从 `--deep-canvas-*` 换成纸面；
  删掉文末那条重复的同名规则（同一个东西写两遍，改一处必漏一处）。
- `WikiDetail.vue` `.top-menu`：填充 `.66 → .86`。这一块里是三行**要读的字**，且正压在正文上：
  `.66` 时背后正文透成一层灰影子（实测暗字透出约 **1.4:1**，读不动又甩不掉），
  且不支持 `backdrop-filter` 的环境里模糊完全不生效。图标类浮件（圆钮 / 工具栏）保持 `.66`。
- `variables.css` + `App.vue`：`--deep-canvas-bg` / `--deep-canvas-image` 全库零引用后连令牌一起删，
  连同 `.app-container.is-night` 的覆盖与容器上的 `is-night` 类。留一段指向已删令牌的 CSS 比没有更糟。
  （回退所需的两段都在换纸前那个提交里。）

**验证**（390×844 真视口）
- 截图：`docs/screenshots/16-detail-paper.png`（阅读态）、`17-detail-edit-toolbar.png`（编辑态工具栏）。
- 顶部「⋯」菜单：改前模块内暗字 177/255、改后 228/255（同一坐标），即背景正文从"灰影子"退成"看不太见"。
- `build`（含 `check:secret`）/ `check:ui` / `check:tokens` / `lint` 全绿；
  `check:tokens` 的孤儿令牌从 3 个降到 1 个（剩 `--ease-pop` 是历史遗留，与本轮无关）。

**仍未做**
- 卡片→详情的转场外壳仍用 `--color-bg-card`（纯白）：最后一帧 60ms 内有白→纸的交叉，量级小但存在。
- 桌面 headless 的合成器不跑 `backdrop-filter`，所以"模糊是否真生效"只能靠真机确认；
  菜单的 `.86` 就是按"糊不掉也必须读得清"的底线定的，真机上会显得比现在更实一点。

**2026-11-24 追加：去掉详情页的底部雾幕**
详情页曾经也有上下两条雾幕（与记录页共用 `--mist-*` 令牌）。用户指出编辑态底部"还有一层"：
实测那是 `.detail-mist.bottom`（172px、`z-index:1`、纸色渐变，压在正文之上、工具栏之下），
它加上 `.detail-body` 的 172px 底部留白，把底部切成了"正文 → 雾 → 工具栏"三层。

- 删掉 `.detail-mist.bottom` 元素与规则，**只保留顶部那条**（随滚动淡入）。
- `.detail-body` 底部留白随后又按用户要求**归零**（"滚动框要一直到屏幕最底"）：
  96px 那块在纸面上就是一截空白，正文看着像被截在中间。
  代价是编辑态的工具栏改由 `.body-input` 自己留 `66px + 安全区` 的**内部**下内边距 —
  滚动框仍然顶到屏幕底，但滚到底时最后一行停在工具栏上方，不会被栏压住。
- `--mist-bottom*` 令牌**没删**：记录页的 `.nav-mist` 还在用。
- 截图 `docs/screenshots/16-detail-paper.png` / `17-detail-edit-toolbar.png` 已按新状态更新。
  （`--mist-*` 令牌后来在下一节里整组删掉了，这行当时写的"没删"已过期。）

## 2026-11-24 顶部/底部过渡层：换成「玻璃场」（v3.5）

参考 `huanzhongshu_glass_homepage_full.html` 的 `.ambient`。用户明确：**只改过渡层，按钮不动；
以手机效果为准，网页端无所谓**。

**做了什么**
- `variables.css`：删掉上一版的纸色雾幕令牌（`--mist-top/-mask/-height`、`--mist-bottom/-mask/-height`），
  换成玻璃场令牌：`--fade-size: 56px`、`--blur-wide/mid/core`（18/24/32）、
  `--fade-mask-wide/mid/core`、`--fade-tint`、`--fade-veil`、`--glass-sat`。
  共享实现（`.ambient` / `.layer.wide|mid|core` / `::after` 面纱 / `.is-up` 翻转）放在 variables.css，
  组件里只写「在哪、第几层」—— 三处不再各抄一份。
- `AppHeader.vue`：`.chrome-mist` → `.ambient`（三层），位置与层位不变。
- `BottomNav.vue`：`.nav-mist` → `.ambient.is-up`，隐藏逻辑（切王冠 / 下沉）原样保留。
- `WikiDetail.vue`：顶部 `.detail-mist` → `.ambient.top`（保留"停在顶上时隐去"的 `.is-on` 判据）；
  **底部新增** `.ambient.is-up.bottom`，阅读态与编辑态都在。

**为什么是三层**
单层模糊的遮罩边界太硬，换个半径就能看见一条边。三层半径错开、透明度各 0.55、遮罩浓淡递减，
边界才被抹成连续过渡 —— 这是参考文件的设计意图（原注释：three independently feathered blur fields），
不是随手叠了三层。**别把它们合成一层**，合成后边界会回来。

**必须记住的限制**
Chromium 里，元素**或它的祖先**带 `mask` 时，`backdrop-filter` 整层失效（实测两种写法都不糊）。
所以桌面预览里只能看到那 28% 的染色 —— 不是没生效，是渲染器不支持这个组合。
目标环境（iOS Safari / Android WebView）支持，手机上才是完整效果。

**手机验收清单（桌面看不到，只能真机）**
1. 字滚进顶/底那条 56px 带子时是**糊掉**，不是单纯变淡。
2. 带子的上下边界**没有一条线**（有的话说明某层 mask 没生效）。
3. 编辑态：底部那条带子在工具栏后面，工具栏本身不该被染白/染糊。
4. 快速滚动是否掉帧（三层 backdrop-filter 叠在滚动容器上，低端机有成本）。
5. 详情页阅读态底部：最后一行/日期滚到底时应该"化进边缘"，不是被切。

**验证**
- 计算样式实测（390×844）：四处场各 3 层，`backdrop-filter` 分别为 `blur(18/24/32) saturate(1.45)`、
  `opacity: .55`、`mask-image` 各不相同；高度都是 56；详情页顶场 0–56、底场 788–844。
- `build`（含 `check:secret`）/ `check:ui` / `check:tokens` / `lint` 全绿。
- 截图：`docs/screenshots/20-detail-bottom-field.png`（阅读态到底）、`21-detail-edit-field.png`（编辑态）。
  桌面截图里只能看到淡色，看不到模糊 —— 这是上面那条限制，不是缺陷。

**2026-11-24 同日：删掉「逐卡淡出」（useCardFade）**
底部过渡层换成 56px 玻璃场之后，卡片淡出区间（从浮岛上沿 772 起）和模糊带（从 788 起）差了 16px，
最下面一截成了"已半透明、还没进模糊"的死区。用户要求把这套逻辑整组去掉。

- 删 `composables/useCardFade.js`（整文件）、`WikiList` 里的 import / 调用 / `ref="listRoot"`。
- 现在底部只有玻璃场负责"化开"；卡片滚到底仍是不透明的，也不再因为 `opacity < 0.2`
  被写 `pointer-events: none`（那条副作用一并消失，底部几张卡恢复可点）。
- 同步改了提到它的注释与规则：`AGENTS.md` 第 3 条从"逐卡淡出与入场动画共用 opacity"
  改成"别用常驻动画管状态类透明度"（教训保留，机制不再存在）；`variables.css` / `App.vue` /
  `BottomNav.vue` / `WikiList.vue` 里过期的说明一并改掉。
- 验证：`build` / `check:ui` / `check:tokens` / `lint` 全绿；390×844 滚到底截图确认
  最后一张卡完整不透明、浮岛只压住它下沿的一小条。截图 `docs/screenshots/22-no-card-fade.png`。

## 2026-11-25 新建入口搬到右下角 + 转场换成「弹簧进度」

**入口**
- 删掉列表顶部那条 390×46 的「＋ 记录」整行入口（`AddRecordBar.vue` 删除），
  换成右下角 44×44 的实心圆钮 `RecordFab.vue`：右 16、底 `calc(14px + 安全区 + 7px)`
  （44 的钮坐在 58 的浮岛带里，上下各让 7 → 圆心与浮岛同心，实测 801 = 801）。
- 材质**沿用原来那颗**（`--color-accent` 实心 + 反白加号 + 一档投影），不是玻璃 ——
  底部只有这一个"主动作"，它是整屏唯一一块实心色（与详情页「完成」同一族）。
- 三种离开：`is-covered` 详情页打开（**不拆 DOM**，返回要从它的位置量落点）、
  `is-sunk` 开「我的」/键盘（跟浮岛一起沉）、`is-off` 王冠页下滑消失。

**转场（`useCardZoom` 重写）**
- 从 WAAPI 一次性 440ms 改成 rAF + 弹簧积分：`p'' = -k(p-target) - c·p'`，
  打开 ζ0.86（约 3.5% 过冲）/ 收起 ζ1.00（不回弹），RESPONSE 0.5s，4 子步长。
- 壳从"每帧改 width/height + 阴影"改成 `clip-path: inset(… round …)` 的**裁剪窗口**；
  照片与文字副本只走 `transform`，文字副本的宽度一次都不改（卡片正文与详情正文同宽）。
- 壳的颜色跟着起点：卡片长出来是卡片的白，＋钮长出来是酒红（`SHELL_CARD` / `SHELL_FAB`）。
- 跑着的时候点一下会**掉头**：`#hz-zoom-catcher` 接那一下，走的就是"返回"那条路
  （`closeDetailAndCleanup`），空记录回收 / 列表显形都不另写一套。

**修掉的 bug：点卡片后"正文开头往下飞"**
`readDetailRects` 原来取正文里**第一个** `<strong>` 当文字副本的落点。旧数据（标题在 `name` 字段、
正文开头没加粗）或长文中途才出现 `**重点**` 时，那个加粗在正文深处（实测 y=870），
文字副本就从卡片（y=198）一路飞下去 —— 用户看到"正文开头被拽到屏幕下面"。
现在只有**贴在正文顶部 6px 内**的加粗才算落点（`openingStrong`），取不到就退回正文容器本身。

**验证（390×844 实机尺寸 headless）**
- ＋钮：44×44、top 779、圆心 801 = 浮岛圆心 801；`background rgb(126,35,64)`。
- ＋钮展开：clip 从 `inset(779px 16px 21px 330px round 22px)` 收到 `inset(0px)` 约 425ms；
  内容在进度 0.78 开始显形，325ms 时到 1。
- 卡片展开：文字副本 top 151 → 67（**往上**），不再飞向 y=781 的加粗。
- 中途点一下：110ms 打断 → 900ms 后详情已关、列表 opacity 1、浮层与接收层都已摘掉。
- 王冠页 `is-off`（opacity 0、translateY 84）、开「我的」`is-sunk`（translateY 84）。
- `build`（含 check:secret）/ `check:ui` / `check:tokens` / `lint` 全绿；`npm test` 12/12。
- 过程图：`docs/preview/record-fab-morph.png`。


## 2026-11-25 多图添加 + 进库前压缩（v3.6）

**为什么**：手机相册一次只能选一张，12 张图要点 12 次「插入图片」。用户要的是一次勾多张，
并且**在手机上真的能跑**（不是只在桌面拖拽）。

**用户 2026-11-25 定的规则（实现按这个来，别再自行加限制）**
1. **单条记录不设图片上限**；单次选多少处理多少，进度逐张报。
2. **只压新图**：长边 2048 + JPEG q=0.82；原图 ≤1.5MB 且长边 ≤2048 不重压；
   PNG / WebP / GIF 原样（透明、动图不转码）；HEIC 能解码就转 JPEG，解不了原图兜底。
3. **顺序按系统返回的 FileList** 追加，不猜拍摄时间（EXIF 会被压缩丢掉，按它排会自相矛盾）。
4. **进度 / 结果用底部轻提示**，失败不弹 `alert`；单张失败不打断整批，最后汇总
   「已添加 N 张，M 张失败」。
5. **中途返回即停**：已加入的图保留，未处理的停掉（逐张落库，不做整批回滚）。
6. 总数**跨过 9 张**时提示一次「图区显示前 9 张，点开可滑看全部」；
   点 `+N` 角标**从第 10 张**开始看（点第 5 格仍从第 5 张开始）。
7. **旧图、旧记录一个字节不动**：不重压、不截断、不改 `pics` 既有顺序。

**新增 / 改动**
- 新增 `utils/imageCompress.js`（纯函数阈值 + 浏览器解码/编码）：
  `createImageBitmap(file, { imageOrientation: 'from-image' })` 解码（EXIF 方向转正），
  `OffscreenCanvas.convertToBlob` 优先、失败退回 `<canvas>.toBlob`；
  压完反而更大（已高度压缩的图）就保留原图；所有失败路径都返回原图，绝不丢图。
- `ItemBodyEditor.vue`：`input` 加 `multiple`（**不加 `capture`**，加了 Android 会直接进相机、
  只能拍一张）；逐张 `prepareImage → saveImage → emit('add-pic')`；`disposed` 在卸载时置位，
  循环每张前检查；新增 `image-batch` 事件给详情页显示进度/结果。
- `WikiDetail.vue`：新增固定在工具栏上方的状态胶囊（进度 `正在添加 3/12` / 结果 / 跨 9 提示），
  不随正文滚走；键盘弹起时跟工具栏一起上浮。
- `PhotoGrid.vue`：`+N` 从 `<span>` 改成 `<button>`，`@click.stop` 打开 `preview(9)`，
  `@pointerdown.stop` 不触发长按删图；热区用 `::after` 外扩，不挡照片主体。
- 新增 `scripts/image-compress.test.mjs` + `run-compress-tests.mjs`（28 条纯函数断言），
  接入 `npm test`（12 套）。

**验证（390×844 真 Chrome · DPR 3 · 真跑 change 事件）**
- 9 张已有图 → 一次塞 3 个 `File` → 最终 `pics=12`、图区 9 格 + `+3`；
  状态条「已添加 3 张 · 共 12 张 / 图区显示前 9 张，点开可滑看全部」。
- 压缩实测：2600×1950 JPEG 96KB → **2048×1536 / 约 46KB**（三张都落在这个量级）。
- 点 `+N` → 查看器停在 **10 / 12**（不是第 5 张）。
- 慢速（CPU 降频）下批量到一半点返回 → 批量停在当前张，已加入的保留；
  详情页正常关闭，没有回滚或半套数据。
- `npm test` 12/12 套通过（compress 28/28、image 25/25）；`build`（含 `check:secret`）/
  `check:ui` / `check:tokens` / `lint` 全绿。
- 截图：`docs/screenshots/23-multi-image-progress.png`（进度）、
  `docs/screenshots/24-multi-image-added.png`（结果 + `+3`）。

**已知没做的 / 真机未验**
- **真机未验**：iOS Safari / Android WebView 的原生相册多选面板、HEIC 解码、系统杀后台时
  批量中断的行为。桌面 Chrome 的多选是 `DataTransfer` 模拟的，不等于系统相册 UI。
- 压缩在主线程做（单张 12MP 约 0.2–0.5s）；批量每张之间让一帧、有进度，但低端机连续处理
  十几张仍可能掉帧。要彻底顺滑需要搬进 Worker（Safari 对 `OffscreenCanvas` 支持不齐，暂不做）。
- 没有「保留原图」开关；也没有「取消」按钮（返回即停）。
- PNG 截图不压（保留透明），所以截图类大图不会因此变小。

## 2026-11-25 外观：白天 / 夜晚（全站换肤，v3.7）

**为什么**：在此之前昼夜只听表（`useTimeMode` 按 6:00–18:00 切），而且只有王冠、「我的」、
底栏会变深，记录页 / 详情页 / 登录页 / 弹窗一直是纸面。用户要的是「整个 app 的白天晚上切换」。

**做法：不新增主题系统，把 `.theme-deep` 升级成"整站夜间作用域"**
- `variables.css` 的 `.theme-deep` 补齐纸面令牌：`--page-rgb`（23,16,15）、`--page-canvas-image`
  （夜里的玫瑰 / 暖沙色斑）、`--surface-card*`（卡从白卡变 `rgba(255,235,240,.07)` 的半透明玫白）、
  以及新的 `--color-accent-solid` / `--color-text-on-solid`。
- ⚠ `--page-rgb` 与 `--color-bg-primary` 是同一个颜色的两处书写，改一处必须改另一处。
- **实心色拆成两条令牌**：`--color-accent`（文字/图标，夜里提亮到 `#E08BA6`）与
  `--color-accent-solid`（大面积填充，夜里深一档 `#B4436A` + 白字）。改用的组件：
  `RecordFab` / `WikiDetail.done-btn` / `BackupCenter.bk-btn.primary` / `AuthView.auth-submit` /
  `EditProfileModal.save-btn` / `AiSettingsModal.save-btn`。王冠页自己的 `.night` 仍把
  `--color-text-on-accent` 翻成深墨（用户气泡/发送键走那条，本轮不动）。

**判定源改成单例 + 三档**
- `useTimeMode.js`：`auto`（6:00–18:00，默认，与旧行为完全一致）/ `day` / `night`。
  模块级 `savedMode` + `clockMode` + 一个懒启动的分钟定时器，`useTimeMode()` 仍返回 `mode`
  （ChatView / 入口动画 / 背景板一行没改）；另导出 `themeMode` / `setThemeMode()`。
- 存储键 `huan_zhong_shu_theme_mode`（设备级，进 `GLOBAL_KEYS`，不按账号隔离）。
- `App.vue`：根节点挂 `.theme-deep`；`.app-container.theme-deep .primary-sheet` 覆盖记录页
  那四条卡片令牌（比 `.primary-sheet` 多一级，不靠书写顺序）；底栏 `theme-deep` 从
  「夜间 + 王冠」放宽到「夜间」。

**界面**
- 「我的」新增第 4 行「外观」，副行说真实状态（`跟随时间 · 现在是白天` / `夜晚`）；
  点进二级页 `AppearancePage.vue`（新积木，RULES 第 8 条），三选一 + 一行范围说明。
- `constants/icons.js` 新增 `appearance` 图标（对比度半圆）。

**验证（430×932 · DPR 2 headless，真点界面而不是注入）**
- 白天启动 → 我的 → 外观 → 点「夜晚」：`localStorage` 写入 `night`，`mine-card` 与
  `app-container` 背景都变成 `rgb(23,16,15)`；记录页 / 详情页 / 王冠 / 备份页同步变深。
- 点回「跟随时间」：档位回到 `auto`，背景回到 `rgb(246,241,240)`，与改动前完全一致。
- `npm test` 12/12；`build`（含 `check:secret`）/ `check:ui` / `check:tokens` / `lint` 全绿。
- 截图：`docs/screenshots/25-appearance-entry.png`（新行）、`26-appearance-page.png`（白天）、
  `27-appearance-page-night.png`（选夜晚后同一页）、`28-record-night.png`、`29-mine-night.png`。

**已知没做的**
- 王冠页 `ChatView` 的 `.night` 仍自带 `--color-text-on-accent: #1A0E12`（亮玫瑰底 + 深墨），
  与其它页的「深玫瑰底 + 白字」不是同一套；统一它要动用户气泡，另开一轮。
- 夜间截图是真机尺寸 headless 拍的，`backdrop-filter` 在桌面合成器不跑；
  iOS Safari / Android WebView 上的雾幕与玻璃观感仍需真机确认。

### 2026-11-25 补：三处「Teleport / 硬编码」漏掉的夜间

用户报了两处（详情页「⋯」菜单、王冠「记住了 N 件事」），查同类问题时多修了一处（卡片长按菜单）。

- **`.top-menu`（详情页）**：底色原来写死 `rgba(255,252,253,.86)`，夜里是一块白板。
  抽出令牌 `--popover-fill`（昼 `rgba(255,252,253,.86)` / 夜 `rgba(42,32,35,.94)`，
  比 `--glass-fill` 实一档 —— 上面全是字）；`:active` 底色从写死的黑 6% 换成 `--color-bg-subtle`。
- **`MemorySheet` / `CardMenu`（都 `Teleport to="body"`）**：挂在 body 上，继承不到
  `.app-container` 的 `theme-deep`，所以白天黑夜一个色。两处都自己挂一次
  `theme-deep`（读 `useTimeMode()` 单例，与「我的」由父级挂类同一个道理）。
  记忆表顺手把夜间四类 pastel 换成低透明底 + 提亮文字，卡片底从 `--color-bg-primary`
  换成 `--color-bg-subtle`（primary 在夜里是整页底色，卡会"凹"下去）；长按菜单的「收藏」
  chip 夜里用 `rgba(224,139,166,.16)`（`accent-light` 在暗底只有 6% 白，几乎看不见）。
- 验证：430×932 夜间实拍，`.top-menu` 计算色 `rgba(42,32,35,.94)`、
  记忆表 `rgb(36,26,28)` 且带 `theme-deep`；`build` / `check:ui` / `check:tokens` / `lint` 全绿；
  `npm test` 12/12。截图 `docs/screenshots/30-detail-menu-night.png` /
  `31-memory-sheet-night.png` / `32-card-menu-night.png`。

### 2026-11-25 修：详情页「⋯」菜单三项点不动（层位 bug，与夜间无关）

**症状**：菜单能展开、看着正常，但点「收藏 / 分享 / 删除」全都没反应，点一下菜单就关掉。

**根因**：`.detail-header` 是 `position: absolute` + `z-index: 2`，**自成堆叠上下文**；
菜单的 `z-index: 20` 只在这个上下文里排序。透明遮罩 `.menu-mask` 是它的兄弟节点、
`z-index: 10` —— 两者比较的是 `2 vs 10`，所以遮罩透明地压在菜单上，把点击全吃掉了
（`elementFromPoint` 在菜单项中心返回的是 `.menu-mask`）。

**修法**：`.detail-header` 的层位 2 → 20（高于 mask 10、低于看图 300）。顶栏只有 55px 高、
`pointer-events: none`，抬高不影响正文滚动与点击；菜单在顶栏内部，自然落在遮罩之上。

**验证**（430×932，真实 `Input.dispatchMouseEvent`，不是 `el.click()`）：
菜单项中心 `elementFromPoint` = 菜单内的 `<span>`；点「收藏」→ 收藏列表 `["r1","r3"] → ["r3"]`、
菜单关闭；点「分享」→ 菜单关闭并走降级提示。`build` / `lint` / `check:tokens` 全绿。

> 时间上是在夜间那轮之后被注意到的，但这行 `z-index: 2` 从 2026-11-24 顶栏改浮层起就在，
> 遮罩的 10 也没动过 —— 夜间改动只换了菜单底色，没有碰层位。

## 2026-11-26 顶栏搜索：右锚点展开 + 按钮淡出（v3.8）

**来源**：用户给的参考稿 `search_refined.html`，原话是「按钮淡出而不挤压，搜索框从右侧锚点向左延展」。

**只改了一处动画，没动数据与路由**
- `AppHeader.vue`：`.search-slot` 从 flex 子项改成**绝对定位**（`right:12`，`width:44 → calc(100% - 24px)`），
  展开时右端钉死在 378，只有左边缘在走；玻璃 / 描边 / 投影从 `<input>` 挪到槽上、输入框改透明 ——
  这样长出来的是"整颗胶囊"，不是"一个透明容器里的框在拉长"。
  `.search-box` 整组晚 120ms 淡入（先有形、字后到）；两颗键不再 `width:0`，只 `opacity` + `transform`
  （「我的」左移 7px + 缩 .98，搜索键缩 .94）—— **整行零重排**，收/展两态里搜索键的位置不变。
- `variables.css` 新增 `--search-dur: 390ms` / `--ease-search: cubic-bezier(.22,.68,.18,1)`：
  账本（三曲线 + 四时长）之外**特批的一条**，只服务搜索位；`motion.css` 的 reduced-motion 同步补 `--search-dur: 1ms`。
- 顺手修一处死代码：夜间那两条写的是 `.header.theme-deep`，而 `App.vue` 从没给顶栏挂过这个类
  → 夜里搜索框一直带着白描边。改成 `.theme-deep .search-slot`（根节点有它就命中）。
- 聚焦时机保持**立刻**（参考稿的 340ms 是桌面 demo，手机上没有软键盘那条时间线）。

**当天追加：搜索框换成跟圆钮同一套材质**
- 用户报「框外面还有一圈颜色」。两层原因：① 聚焦光环 `0 0 0 3px rgba(126,35,64,.16)` ——
  它以前挂在 `<input>` 上被槽 `overflow:hidden` 裁掉，玻璃挪到槽上之后整圈露出来了；
  ② 框本来就不是玻璃：只有 `--glass-fill` 底色，没有 `backdrop-filter`，边是 1px 白线、阴影是另一套。
- 改法：删掉聚焦光环（要恢复只能用 `inset`，不能外扩）；框直接用圆钮那套令牌 ——
  `backdrop-filter: var(--glass-blur)` + `box-shadow: var(--glass-highlight), var(--glass-edge), 0 2px 8px`。
  夜间因此**不再需要单独覆盖**，`--glass-*` 在 `.theme-deep` 里本来就有夜间值。
- ⚠ 记一笔"当年那条代价"：2026-11-23 摘掉模糊的理由是「两端圆角处一道竖亮边」，
  那是深色网格底上的结论。换成纸面 + 色斑之后**没有再复现**（昼/夜各拍一张，两端像素干净）。
  真复发的话正确解法是把模糊挪到内层矩形、外层只做裁剪 —— 不是又把框的模糊摘掉。
- 验证：昼/夜两张计算样式对比，槽与圆钮的 `background-color / backdrop-filter / box-shadow` **逐字一致**
  （只有 `border-radius` 999px vs 50% 不同）；`check:ui` / `check:tokens` / `lint` / `build` 全绿。
- 截图：`.tmp-shots/mat-day-closed.png`、`mat-day-open.png`、`mat-night-closed.png`、`mat-night-open.png`（3× 放大）。

**当场第二轮：夜间那圈外框**
- 用户报「晚上这外面的一圈还有」。定位：不是聚焦光环（第一轮已删），是 `--glass-edge` 里的
  `0 0 0 1px rgba(255,230,238,.16)` —— **同一枚令牌，44px 圆钮上读作边缘，366px 宽的搜索框上读作一圈"画上去的框"**。
  白天那条是 `0.5px / 6% 酒红`，本来就看不见（所以只有夜里显形）。
- 改法：把 `--glass-edge` 拆成 `--glass-vignette`（内暗角）+ 外描边两条令牌，
  `--glass-edge: <描边>, var(--glass-vignette)` 保持原语义；搜索框改用 `var(--glass-vignette)`，
  **厚度还在、外框没了**。圆钮 / 浮岛继续用 `--glass-edge`。
- 验证：夜间槽的 `box-shadow` 里已无 `0 0 0 1px`（改为 `highlight + vignette + 2px 8px`），
  10× 左端特写对比确认外框消失、顶光仍在；`check:tokens` / `check:ui` / `lint` / `build` 全绿。
- 截图：`.tmp-shots/ring-01-left.png`（改前，有外框）→ `final-night-left.png`（改后）。

**验证**（390×844 · DPR2 · 真 Chrome 走 CDP 点真按钮）
- 展开：`44 → 366`，左右边 `334..378 → 12..378`；逐帧采样 t=0/99/182/284/452ms = `44/253.8/331.6/358.9/366`，
  曲线确实是"快起慢收"，不是线性拉伸；两颗键 opacity ~180ms 归 0；「我的」终态 `translateX(-7px) scale(.98)`。
- 收起：`366 → 44`、opacity 归 0、输入值清空、输入框失焦；按钮回到原位（宽高仍 44）。
- 立刻聚焦 ✓（`document.activeElement` 就是输入框）。
- `build`（含 check:secret）/ `check:ui` / `check:tokens` / `lint` 全绿；`npm test` 12/12。
- 截图：`.tmp-shots/day-search-03-open.png`（展开态）。

## 2026-11-26 多套色系（外观的第一条轴，v3.8）

**为什么**：昼夜已经能切，但整站只有一套颜色。用户给了三张样板图（雾面板 / 虹彩雾 / 珊瑚跑道，
每张含昼 + 夜），要求"只要颜色"——结构、几何、材质一个都不许动。

**做法：给「一套配色」一个类，不给主题做引擎**
- 默认色系（雾面板）直接写进 `variables.css` 的 `:root`（昼）与 `.theme-deep`（夜），**不挂类**；
  其余两套各一个文件（`styles/palettes/iridescent.css` / `coral.css`），用
  `.palette-xxx`（昼）与 `.palette-xxx.theme-deep`（夜）覆盖同名令牌。
- 夜块用**复合选择器**（0,2,0）而不是靠书写顺序 —— 顺序赌输过一次（见 App.vue 那条注释）。
- 「酒红丝绒」整组删除（用户 2026-11-26 定：直接删、不留退路）。要回退看
  `git show <换色前提交>:src/styles/variables.css`。

**新增积木**
- `constants/palettes.js` —— 注册表：id / 名称 / 一句说明 / className，**不含色值**（色值只在 CSS）。
- `composables/useAppearance.js` —— 单例：当前色系 + `appearanceClass`（'palette-xxx' + 'theme-deep'）。
  全项目只有这一处拼类名，根容器 / 「我的」/ 底栏 / 两个 Teleport 弹层共用。
- `scripts/check-palettes.mjs` —— ① 完整性：每套昼夜两块都要覆盖 REQUIRED 清单，
  缺一条就是"两套色杂交"；② 对比度：正文类 ≥4.5、图形类 ≥3.0。已串进 `npm test`。

**明暗轴加一档「跟随系统」**（`useTimeMode`）：`auto / system / day / night`，默认仍是 auto；
system 读 `prefers-color-scheme` 并实时监听 `change`。`mode` 对外仍只有 day / night，消费者一行没改。

**收回 5 处硬编码颜色**（换色系会当场露馅的那几处）：底栏药丸（`--nav-pill-bg/-fg`）、
长按菜单收藏 chip（`--color-accent-soft`）、记忆面板抓手（`--color-handle`）、
详情页「⋯」菜单投影（`--shadow-float`）、记录页与夜里的卡片阴影色相（玫瑰 → 中性）。
**浮岛与右下角加号的材质一字未动**（用户 2026-11-26 明确）：只换了颜色。

**验证**（390×844 · DPR2 · 真 Chrome 走 CDP）
- 三套 × 昼夜实测：根类分别是 `''` / `palette-iridescent` / `palette-coral` + `theme-deep`；
  纸色 `rgb(246,246,250)` / `rgb(243,242,250)` / `rgb(242,236,240)`，夜里 `rgb(20,19,25)` 等，与令牌一致。
- 跟随系统：CDP 模拟 `prefers-color-scheme: dark` → 根类转 `theme-deep`、纸色 `rgb(20,19,25)`。
- `check:palettes` / `check:tokens` / `check:ui` / `build`（含 check:secret）/ `lint` 全绿；`npm test` 12/12。
- 截图：`.tmp-shots/palette-{fog,iridescent,coral}-{day,night}.png`。

**已知没做的**
- 王冠页只换了身份色（头像珊瑚 / 就绪琥珀 / 白天纸色），夜板与入场动画仍是酒红黑 —— 用户定"首页改完再说"。
- 色卡上的"第一张卡自带染色"（紫面板 / 桃面板）没有对应机制，暂不实现。
- 三张样板图里编号跳了 2（只有 1 和 3），若还有一套没发，补一个 CSS 文件 + 注册表一行即可。
