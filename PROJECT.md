# 寰中枢 — 个人百科知识库

> 更新：2026-11-21（v3.0 单层记录重构：游戏/笔记/生活/我的四页下线，底栏只剩「记录 / 王冠」，「我的」改为右上角呼出的浮层，记录正文首次有编辑入口）

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




