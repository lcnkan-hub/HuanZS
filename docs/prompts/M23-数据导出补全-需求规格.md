# M23 命令 · 数据导出补全 + 导入 + 回退（发 Claude Code）

> 来源：学习计划问题清单 **I01「数据会丢」**（`F:\ai\Hermes-Learning-System\状态数据\product-issues.json`）
> 完成标准：**「丢得起」而不是「不丢」** —— 任意时刻点一次导出得到一个文件，在另一台设备/另一个浏览器导入后，百科、王冠记忆、聊天记录、危机留痕、图片、用户档案**全部回来，一条不少**。
> 明确不覆盖（写进 I01 的备注，不算解决）：手机丢失、卸载前没导出 —— 这两条要等上后端。

---

## 角色

你是这个项目（寰中枢，Vue3 + Vite5 纯前端 AI 伙伴 App）的施工方。开工前先读项目根目录的 `RULES.md`、`CLAUDE.md`、`TASKS.md`，并遵守 `src` 现有积木架构（常量 → composable → 组件）。用户不写代码，他负责定义、命令和验收；你负责实现与自测。

## 目标

现在的导出按钮**只导百科**（`src/components/user/DataBackup.vue` 拿的是 `props.dbData`）。产品最值钱的部分 —— 王冠的记忆、聊天记录、危机留痕、图片 —— **一份都带不走**。本次把导出补全，并把导入和回退做通。

## 架构决定（导师已拍，施工照办，别自行改回）

1. **单文件 JSON，图片 base64 内嵌，零依赖。** 不走 ZIP：手写 ZIP 的读写（CRC/中央目录/偏移）是本功能最高风险处，一旦出错会产出「资源管理器能打开、但导不回来」的文件 —— 也就是**假成功**。备份的全部价值在能导回来。
2. **导入 = 写进「当前登录账号」的命名空间。** 数据库键名格式是 `基础键@u<账号id>`（见 `src/utils/storageScope.js`）。备份里那个旧 account.id **不参与写入** —— 一律用 `scopeKey(基础键)` 拿当前账号的键。
3. **导入前必须自动快照，且必须能回退。** 快照存 IndexedDB（不到 localStorage，那里只有 5MB），导入完成后提供「回退到导入前」入口。只存不能退 = 假安全感。
4. **导入完成必须整页重载**（`location.reload()`）。业务 composable 是模块级单例、存储键在 import 时就绑定了；不重载会留下绑旧键的 ref → 静默丢数据。这个坑 2026-10-10 刚踩过。
5. **零新增 npm 依赖。**

## 要导的东西（已盘点，照此实现）

| 基础键（真实键 = 基础键 + `@u<当前账号id>`） | 内容 | 进备份 |
|:---|:---|:---|
| `huan_zhong_shu_user` | `{id, name, avatar}` | ✅ |
| `huan_zhong_shu_db` | `{game[], note[], life[]}`，子词条在 `children[]`，正文内嵌 `![x](id://img-123)` | ✅ |
| `huan_zhong_shu_chat` | `[{id, role, content, time}]` | ✅ |
| `huan_zhong_shu_memory_v1` | 王冠记忆数组 | ✅ |
| `crown_crisis_audit_log` | 危机留痕数组（隐私最重） | ✅ |
| `crown_crisis_pending` | `{active, ts}` 或 null | ✅ |
| `crown_crisis_state` | `{state, last_signal_timestamp, concern_acknowledged}` 或 null | ✅ |
| IndexedDB `huan_zhong_shu_images` / store `images` | `{id, blob, mime, name, time}`，id 形如 `img-1700000000123` | ✅ |
| `huan_zhong_shu_accounts` | 账号表（含 salt/hash） | ❌ **不进**（避免把凭据塞进会外传的文件；导入不需要它） |
| `huan_zhong_shu_session` | 登录态 | ❌ **不进**（导进去会指向不存在的账号 id） |
| `huan_zhong_shu_ai_config` | API 密钥 | ❌ **绝不进** |
| `crown_intro_seen` | 引导动画标记 | ❌ 无价值 |

## 备份文件格式 v1（格式类示例，照此结构）

```json
{
  "format": "huanzhongshu-backup",
  "schema_version": 1,
  "exported_at": "2026-10-10T15:04:05+08:00",
  "app_version": "1.0.0",
  "account_label": "alice",
  "counts": { "wiki_items": 12, "memory": 8, "chat": 240, "images": 5 },
  "data": {
    "user": {},
    "db": { "game": [], "note": [], "life": [] },
    "chat": [],
    "memory": [],
    "crisis": { "audit_log": [], "pending": null, "state": null }
  },
  "images": [
    { "id": "img-1700000000123", "mime": "image/png", "name": "a.png", "time": 1700000000123, "dataBase64": "" }
  ]
}
```

- `account_label` 只作标注，导入时**不使用**。
- `counts` 用于导入前的条数核对；对不上就中止导入并报明哪一类对不上。
- 空数据也必须保留键（`"chat": []`），不许缺键。

## 施工清单（8 项）

### 1. `src/composables/useBackup.js` —— 备份积木【新积木】

导出四个函数，全部先做纯逻辑，不碰 UI：

- `buildBackupPayload()` → 组装上面那个对象（图片从 IndexedDB 异步取，转 base64）。**任何一个真相源读不到就抛错中止**，不许导出一个缺件的备份。
- `estimateSize(includeImages)` → 预估体积（给体积闸门用）。
- `downloadBackup({ includeImages })` → 分块组装后用 `Blob` + `<a download>` 落文件，文件名 **ASCII 安全**：`huanzhongshu-backup-<账号名>-YYYY-MM-DD.json`（别用中文文件名 —— APK/WebView 的下载链路对 CJK 文件名不稳）。**不许把整个文件拼成一个巨型字符串再 stringify**（大图会卡死/爆内存）：用 parts 数组分段 push 再 `new Blob(parts)`。
- 导出成功后写一条时间戳：`localStorage` 键 `scopeKey(STORAGE_KEYS.LAST_EXPORT)`（**按账号隔离**，即业务数据键，不要加进 `storageScope.js` 的 `GLOBAL_KEYS`）。
- `importBackup(file, { mode })` → 校验 → 快照 → 写入 → 返回结果摘要。

**导出前体积闸门（写死）**：预估 > 30MB 时，先返回 `{ needConfirm: true, sizeMB }`，由界面问用户「含图片 / 不含图片」，不许默默导出。

**图片注意事项**：
- 图片 id **必须原样保留**（百科正文靠 `id://img-xxx` 引用，错一个字符全变死链）。
- 导出/导入流程**绝不调用 `dropUnused`**（它会删掉没被引用的图片，等于导出前先自我阉割）。
- 导出时**全导**（含未被引用的），不做"只导被引用的"优化。

### 2. `src/constants/categories.js` —— 加一个存储键【改一处】

在 `STORAGE_KEYS` 里加 `LAST_EXPORT: 'huan_zhong_shu_last_export_at'`。注释写明它是**业务数据（按账号隔离，走 `scopeKey`）**，不是设备级 —— 别加进 `utils/storageScope.js` 的 `GLOBAL_KEYS`。

### 3. `src/composables/useBackupStore.js` —— 导入前快照与回退【新积木】

- 新建 IndexedDB 库 `huan_zhong_shu_backups`（版本 1，store `snapshots`，keyPath `id`）。
- `saveSnapshot()` 写一条 `{ id: 'pre_import', ts, payload }`（payload 结构与备份文件一致，图片也含）。**只保留最近 1 条**，写入前先清旧的。
- `readSnapshot()` / `restoreSnapshot()`：回退走**同一套写入逻辑**（复用 `applyPayload`），不要另写一份。
- 回退后同样整页重载。

### 4. `useBackup.js` 里的导入校验【同文件，写清】

按顺序校验，任何一条不过就**中止且不改动任何存储**：

1. JSON 能解析（否则报「文件读不了」）
2. **v0 兼容**：顶层有 `game`/`note`/`life` 三个数组、且没有 `schema_version` → 当作**老版百科备份**，只导百科，其余键一律不动
3. v1：`format === 'huanzhongshu-backup'` 且 `schema_version <= 1`（更高版本报「这个备份来自更新的版本」）
4. `data` 各键形状对（db 三个分类必须是数组；chat/memory 必须是数组）
5. `counts` 与实际条数一致
6. 图片 base64 能解回 Blob

**导入策略（写死）：全量覆盖 + 导入前自动快照。** 不做合并。

### 5. `src/components/user/BackupCenter.vue` —— 备份中心界面【新积木】

替换现在挂在「我的」页的旧备份盒。四块：

- **导出全量备份**（主按钮）+ 一行小字：「含百科 / 王冠记忆 / 聊天记录 / 图片」
- **从备份文件导入**（次要按钮，选文件）+ 二次确认（写清会覆盖当前账号数据、且会先自动存一份快照）
- **回退到导入前**（仅当存在快照时显示，带快照时间）
- 导出成功后显示一行：「上次导出：YYYY-MM-DD HH:mm」（从 `localStorage` 设备级键 `hzs_last_export_at` 读）

UI 硬约束（`RULES.md` + 项目设计 token）：只改动的 CSS 一律用 `var(--color-*)` / `var(--radius-*)` / `var(--shadow-*)` 现有变量，禁写死 hex；图标走 `AppIcon` + `icons.js`（禁 emoji）；动画只 `transform` + `opacity`，150~300ms，带 `prefers-reduced-motion` 降级；触控目标 ≥44px。

### 6. 换挂载 + 拆掉旧链路【改三个文件，逐一按下面写，别留悬空绑定】

1. `src/components/user/MinePage.vue`：`<DataBackup>` 换成 `<BackupCenter>`；**删掉** `:validateImport` 与 `@import-success` 两个绑定；`defineEmits` 里的 `'import-db-success'` 一并删。
2. `src/App.vue`：MinePage 上挂的 `@import-db-success="(data) => wikiData.importData(data)"` **一并删** —— 新流程自己写存储再重载，不再经由 `useWikiData` 的 ref。
3. **保留** `MinePage` 里的局部函数 `validateImportData`（DataBackup.vue 仍在仓库里、它的 prop 是 required，留着将来回退能直接复原）。**不删** `DataBackup.vue`。
4. `BackupCenter.vue` 显示条数/体积时**直接用 `useBackup.js` 自己读出来的结果**，不要为了显示再引入 `useWikiData()` 的 ref —— 那是启动时的快照，可能与磁盘不一致（同类坑 2026-07-31 数据形状事故）。

### 7. 文案诚实化【改三处，精确字符串】

- `src/components/user/AccountSection.vue` 里这句**是错的，必须改**：现在写「账号和百科数据都只存在这台设备上，各账号互相看不到对方的数据。换手机数据不会跟着走 —— 要带走请在上面导出备份。」—— 那个导出按钮根本带不走记忆。整句改为：「账号和百科数据都只存在这台设备上，各账号互相看不到对方的数据。换手机数据不会跟着走 —— 要带走，用上面的备份中心导出，百科、王冠记忆、聊天记录和图片都在同一个文件里。」
- `src/components/user/AccountSection.vue` 徽章：「N 个账号」→「N 个本机账号」（模板里是 `{{ accountCount }} 个账号`）。
- `src/components/user/AuthView.vue` 副标题：`'建一个属于你的账号'` → `'建一个本机账号'`；底部说明段（`.auth-note`）末补一句：「账号本身也只在这台设备上，换设备要重新注册。」

### 8. `scripts/backup.test.mjs` + `package.json` 加 `test:backup`【新积木】

照 `scripts/run-crisis-tests.mjs` + `scripts/resolve-hook.mjs` 的现成模式（原生 node + ESM 解析钩子 + polyfill `localStorage`/`alert`），零依赖。断言见下方 A 类。

## 测试与验收

### A. 机器可验（交付时必须贴每条的实际运行输出原文，不许概述）

| 编号 | 断言 | 怎么验 |
|:---|:---|:---|
| A1 | 导出对象含全部 6 类真相源，**空数据也保留键** | `npm run test:backup` 断言 `data` 下 user/db/chat/memory/crisis 全在，db 三分类是数组 |
| A2 | **导出绝不含敏感项** | 断言序列化后的字符串里不存在 `apiKey`、`huan_zhong_shu_session`、`salt`、`hash` |
| A3 | **导出文件不含明文 API 密钥** | 造一个假 key 存进 AI 配置 → 导出 → 全文搜该字符串应**无命中** |
| A4 | **导入写进当前账号命名空间** | 造一份 `account.id = 'OLDID'` 的备份 → 以当前账号导入 → 断言全部落在 `基础键@u<当前id>`，且**没有任何键带 `OLDID`** |
| A5 | **v0 老备份能导** | 喂 `{game:[],note:[],life:[]}` → 断言成功、只写百科、**不动 memory/chat/crisis** |
| A6 | **损坏文件被拦且零改动** | 三组反例：非 JSON / 缺 `format` / `schema_version: 99` → 断言返回失败，且**导入前后所有键逐字节相同** |
| A7 | 导入前快照真的存了 | 导入后读 `huan_zhong_shu_backups` → 有 `pre_import` 记录 |
| A8 | **回退真的能回** | 导入 → 手动改脏数据 → 回退 → 断言数据回到快照状态 |
| A9 | 图片 id 原样保留 | 断言导出的 `images[].id` 与库内一致；正文里 `id://` 引用能对上 |
| A10 | `counts` 与实际一致 | 断言 `counts` 每个字段等于实际条数 |
| A11 | 回归：危机矩阵全过 | `npm run test:crisis` 56/56 |
| A12 | 回归：构建全绿 | `npm run build`（含 `check:secret` 密钥闸门） |

**证据链要求**：A4/A6 这两条是本次最关键的防线。断言脚本里必须包含**故意做坏**的反例（A6 那三组），用来证明防线真的在工作 —— 只报「全绿」不足以说明它在拦。

### B. 必须人工验（机器验不了，交付时明确标出哪些做了、哪些待验）

真浏览器两设备演练（用户自己做，你只列步骤）：

1. A 设备：导出 → 看文件真的落地、体积合理
2. B 设备（无痕窗口或另一台）：注册一个**新的本机账号** → 导入刚才的文件
3. 逐项核对：百科条目数与子词条数、图片能正常显示、聊天记录在、王冠能说出记忆里的事、危机状态在
4. 回到 A 设备确认原始数据没被动

### 交付报告必须包含

文件清单 · A 类每条的实际输出原文 · B 类已验/待验 · 与本命令的偏差（有偏差必须明说，不许静默换方案）。

## 冻结与禁止

- **不改** `dbData` 的 `{game, note, life}` 三分类结构
- **不改**危机子系统任何逻辑（`src/services/crisis*`、`src/constants/crisis*`）——本命令只允许 import 它们
- **不动**王冠读写百科的链路（`useWikiWriter.js` / `useWikiContext.js`）
- **不引**任何 npm 依赖
- **不删** `DataBackup.vue`（只卸载）
- **不用** localStorage 存导入前快照（5MB 上限会爆）
- **不许**在导出/导入链路上调用 `dropUnused`
- **不许**导出 `huan_zhong_shu_ai_config` / `huan_zhong_shu_session` / `huan_zhong_shu_accounts`

## 实施顺序建议

1. 先跑基线并记录现状：`npm run build`、`npm run test:crisis`
2. 写 `scripts/backup.test.mjs` + 注册 `npm run test:backup` → **先跑一次，应当失败**（功能还没写）
3. 写 `useBackup.js` + `useBackupStore.js`（纯逻辑）→ 反复跑 `npm run test:backup` 直到全绿
4. 写 `BackupCenter.vue` → `MinePage.vue` 换挂载
5. 文案修正三处
6. 三条全绿收口：`npm run test:backup` + `npm run test:crisis` + `npm run build`
7. 出交付报告

## 交付后要人工做的事（不在你的范围内）

- **两设备导入演练**（B 类）只有用户能做 —— 交付报告里明确标为待验
- 演练产生的测试数据由用户清掉
- 本次**不做**：导出提醒（`上次导出 N 天前` 的主动提示）、localStorage 容量硬限 —— 这两项另立条目
