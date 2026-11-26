# composables 索引 · 26 个文件各管什么

> 写于 2026-11-24 结构整理收尾。目的：**翻不到的时候不用打开文件**。
>
> 为什么不直接按域分目录：26 个文件里 20 个已经被组件直接 import，物理分组要改 60+ 处路径，
> 而收益只是"看得整齐"。眼下更值钱的是这张表和最后一节的迁移边界 —— 真要分组照表切就行。
> 已有的两个子目录（`backup/`、`records/`）是**拆大文件**的结果（门面 + 职责文件），不是分组。

## 一句话职责

| 文件 | 行数 | 管什么 | 域 | 状态 |
|---|---|---|---|---|
| `useAccount.js` | 290 | 注册 / 登录 / 退出 / 登录态持久化 / 首账号认领旧数据 | account | 纯函数 + 显式调用（无响应式状态） |
| `useApiKey.js` | 78 | 全项目唯一的密钥与服务商读写（BYOK），密钥只在本机 | account | **单例** |
| `useUserProfile.js` | 31 | 用户档案（昵称/头像）的读写 | account | 工厂（每次调用新建 ref） |
| `useLastTab.js` | 28 | 首屏 Tab 记忆（I03）：首次进王冠，之后落在上次的位置 | account | 纯函数（读/写各一次） |
| `useFavorites.js` | 64 | 收藏的 id 列表（不往记录上加字段） | records | **单例** |
| `useRecords.js` | 165 | 记录的增删改查 + 对外门面；迁移/形状/图片回收已拆到子目录 | records | **单例** |
| `records/shape.js` | 79 | 形状纯函数：剥 children、抽图、折标题 | records | 纯函数 |
| `records/migrate.js` | 118 | 三步一次性迁移（模块加载时跑，幂等） | records | 纯函数（接收 records ref） |
| `records/imageGc.js` | 145 | 删记录后的图片回收 + 「读不出来就放弃」的闸门 | records | 纯函数（接收 records ref） |
| `useImageStore.js` | 232 | IndexedDB 图片仓库（全设备单库，不按账号分） | storage | 模块级 |
| `useLocalStorage.js` | 145 | Vue 响应式外壳：读写走 adapter、损坏留证、跨标签同步、写失败记账 | storage | 工厂（每个键一个 ref） |
| `useStorageHealth.js` | 65 | 写失败账本 + 容量体检（响应式部分） | storage | **单例** |
| `useBackup.js` | 40 | 备份门面（re-export） | storage | — |
| `backup/*.js` | 21~226 | keys / images / rescue / saveFile / export / import / errors | storage | 纯函数 |
| `useBackupStore.js` | 97 | 导入前快照的存取（IndexedDB，只留最近一份） | storage | 模块级 |
| `useChat.js` | 94 | 聊天消息的增删与持久化 | chat | **单例** |
| `useChatAI.js` | 267 | 调 AI 接口、`askStructured`、错误翻译；向 services 注册分类器 | chat | 工厂 |
| `useChatScroll.js` | 53 | 聊天滚动到底 + 滑动即收键盘 | chat | 工厂（无状态） |
| `useMemory.js` | 398 | 王冠记忆：四类白名单写入、状态机、上下文注入 | chat | **单例** |
| `useProactive.js` | 229 | 王冠主动开口（I02）：配额、开关、快照 | chat | 工厂 |
| `useProactiveTrigger.js` | 65 | 决定「什么时候去问一句该不该开口」 | chat | 纯函数 |
| `useWikiContext.js` | 171 | 把用户记录整理成可注入的上下文（王冠读记录） | chat | 纯函数 |
| `useWikiWriter.js` | 139 | 王冠替用户记东西：解析动作 → 落库 | chat | 纯函数 |
| `useKeyboard.js` | 74 | 软键盘占位三量：kbOpen / kbInset / kbShift | ui | **单例** |
| `useTimeMode.js` | 47 | 昼夜判定（6:00–18:00 = 昼），入场动画与背景板同源 | ui | 工厂（getTimeMode 是纯函数） |
| `usePageRouter.js` | 83 | 详情面板开/关 + 进出动画状态机 | ui | 工厂 |
| `useCardZoom.js` | 244 | 卡片 ↔ 详情的共享元素转场（DOM 浮层） | ui | 工厂 |
| `useDetailTransition.js` | 202 | 转场的四个动作：打开 / 新建 / 收起 / 清理 | ui | 工厂（依赖由参数注入） |
| `useSheetDrag.js` | 109 | 底部卡片下拉关闭手势 | ui | 工厂 |
| `useAppNotice.js` | 55 | 常驻提示条的内容与动作（现在只剩"没存上"） | ui | 工厂 |

「单例」= 文件顶层就创建了 ref / 调用了 `useLocalStorage`，全应用共用一份；
「工厂」= 每次调用新建实例 —— 所以**调用两次就有两份状态**，跨组件共享必须靠 props 或模块级单例。

## 三条容易踩的依赖方向

1. `services/*` **不许** import `composables/*`。AI 能力经 `services/aiClassifierPort` 注册进来（`useChatAI` 注册，`services/crisisDetection` 取用）。
2. `utils/*` **不许** import vue / composables / services。图片 id 形态在 `utils/imageId.js`，图片来源由 `resolveImagesAsync(html, resolveImage)` 注入。
3. `records/*` 与 `backup/*` 都**不反向** import `useRecords` / `useBackup` —— 需要状态时由调用方把 ref 传进来。

跑一遍守卫：`node <skill>/scripts/guard-layers.mjs`（当前 88 个文件、2 处已说明的例外）。

## 如果将来真要物理分组，按这张表切

```
composables/
  account/   useAccount useApiKey useUserProfile useLastTab
  records/   useRecords useFavorites + shape/migrate/imageGc（已就位）
  storage/   useImageStore useLocalStorage useStorageHealth useBackup useBackupStore + backup/
  chat/      useChat useChatAI useChatScroll useMemory useProactive useProactiveTrigger useWikiContext useWikiWriter
  ui/        useKeyboard useTimeMode usePageRouter useCardZoom useDetailTransition useSheetDrag useAppNotice
```

代价预估：约 60 处 import 要跟着改（组件、App.vue、12 套断言脚本里的 `import('../src/composables/xxx.js')`）。
做的时候**必须**：改完先重启 dev server 再验收（Vite 的 HMR 图在大规模移动后会失效，模块会返回空壳、页面白屏），然后跑 `npm test` + `npm run build`。
