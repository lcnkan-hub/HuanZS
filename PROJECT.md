# 寰中枢 — 个人百科知识库

> 更新：2026-10-11（v2.7，对齐代码现状：我的页重排 / 主动开口 / 空库开局 / 备份中心 / 本地账号 / 形态认下）

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
dbData = {
  game: [ /* note/life 同构 */
    {
      id: string, name: string, wiki: string(Markdown),
      creator: string, time: string("YYYY/MM/DD HH:mm"),
      children: [ /* 子词条，可选 */
        { id: string, name: string, wiki: string, creator: string, time: string }
      ]
    }
  ],
  note: [ /* 同上 */ ],
  life: [ /* 同上 */ ]
}

userProfile = { id: string(6位数字), name: string, avatar: string(emoji) }
chatMessages = [ { id, role: 'user'|'assistant', content, time } ]  // huan_zhong_shu_chat
memories = [ { id, type, content, source, sentiment, status, created_at, ... } ]  // huan_zhong_shu_memory_v1
```

## 核心功能
1. 百科条目 CRUD + 主词条-子词条二级结构
2. 搜索过滤（按分类 + 关键词）
3. Markdown 渲染（标题/加粗/代码/颜色标签/图片引用 `id://img-xxx`）
4. 子词条编辑器（阅读/编辑双模式 + IndexedDB 图片插入 + 缩略图预览）
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
| wiki | WikiDetail.vue | 详情页（子词条列表 + 添加/删除） |
| wiki | WikiList.vue | 列表 + 搜索 + 「只看我创建的」筛选 chip |
| wiki | WikiCard.vue | 单张卡片 |
| wiki | StarterCards.vue | 空库开局三张卡片（I04） |
| wiki | SubEntryEditor.vue | 子词条编辑器（阅读/编辑/图片插入） |
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
