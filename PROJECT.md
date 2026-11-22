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
- 钥匙未配置时那条「先配置 AI 密钥」提示条仍是全宽横条，压在输入浮岛上方；
  键盘弹起后它会留在屏幕最底部（被键盘盖住）。
- **Android 上滑动列表不会自动收键盘**（这是系统/WebView 的默认行为，不是 bug）：用户滑聊天记录时键盘会一直在。
  要"滑动即收"，得在 `.message-list` 上加一条滚动 → `inputRef.blur()`（一次一行，需要用户点头再加）。
