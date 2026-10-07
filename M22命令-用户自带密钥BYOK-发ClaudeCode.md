# M22 命令 · 用户自带密钥（BYOK）+ 模型适配层（发 Claude Code）

> 来源：2026-09-28 会话。学生自主提出方案（"在界面加按钮让用户填自己的 Key"），导师补架构判断。
> 本任务 = 消灭 P0-1「API Key 暴露」。**验收的第一硬指标是"产物里再也搜不到 Key"，不是"界面能填"。**

## 角色

你是资深前端工程师，在 `F:\寰中枢` 施工。开工前先读 `RULES.md`（积木架构规范）、`PROJECT.md`（积木清单）、`src/composables/useChatAI.js`（现有 LLM 接入层）、`src/composables/useLocalStorage.js`（现成存储积木）。

项目现实：Vue3 + Vite5 **纯前端、无后端**；`useChatAI.ask()` 是全项目唯一 LLM 调用入口；Key 现由 `import.meta.env.VITE_DEEPSEEK_API_KEY` 提供——**构建时被 Vite 内联进 JS 产物**（已实测：`dist/assets/index-rtpk9HjQ.js` 里能搜到明文 Key）。

## 目标

1. **Key 来源从编译期彻底改为运行期**：用户在界面里填、只存本机 localStorage。**生产源码与产物里都不存在任何 Key 来源。**
2. **加一层模型适配**，让用户可选 DeepSeek（付费）或智谱 GLM 免费档（`glm-4.7-flash`，官方标注免费、200K 上下文），降低他人上手成本。
3. **没配 Key 时不是一句报错**，而是明确的配置引导——这是新用户第一个 3 分钟。

## 架构决定（导师已拍，施工照办，别自行改回）

**不走"dev 用 .env、prod 用本机"的兜底路线。** 那条路要靠 Rollup 的 DCE 去摇掉被内联的字符串，属于"应该能行"——**Key 泄漏这件事不配"应该"。**

改为：**`import.meta.env.VITE_*` 这条通道整体退休。** 开发时也走界面填一次（localStorage 持久，填一次长期有效）。
- `useChatAI.js` 施工后**不得出现任何 `import.meta.env.VITE_*` 引用**
- `.env` 里的 `VITE_DEEPSEEK_API_KEY` 行删除；`.env.example` 对应行同步删除
- 这样 A1 断言变成结构性必然，而不是靠打包器行为兜底

## 施工清单（9 项）

### 1. `src/constants/aiProviders.js` —— 服务商唯一真相源【新积木】
导出 `AI_PROVIDERS`（对象）与 `PROVIDER_IDS`（数组）。每个服务商字段：`id / label / baseUrl / model / applyUrl / note / keyHint`。

已核实（2026-09-28 实抓官方文档，**照抄，勿凭印象改**）：
- DeepSeek：`baseUrl = 'https://api.deepseek.com/chat/completions'`，`model = 'deepseek-flash'`，申请页 `https://platform.deepseek.com`
- 智谱：`baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'`，`model = 'glm-4.7-flash'`，申请页 `https://open.bigmodel.cn`，note 注明"官方免费模型，无需充值"

同文件导出 `DEFAULT_PROVIDER = 'deepseek'`。**全项目只许 import 引用，禁止在组件里硬编码 URL / 模型名**。

### 2. `src/constants/categories.js` —— 加一个存储键【改一处】
在 `STORAGE_KEYS` 加 `AI_CONFIG: 'huan_zhong_shu_ai_config'`（沿用现有前缀）。**不动其余任何键**（RULES 第 9 条）。

### 3. `src/composables/useApiKey.js` —— 密钥读写积木【新积木】
职责：全项目唯一的 Key / 服务商读写入口。存 localStorage，结构：
```js
{ provider: 'deepseek'|'zhipu', apiKey: 'sk-xxx', savedAt: 'YYYY/MM/DD HH:mm' }
```
导出方法（命名固定，验收会查）：
- `useAIConfig()` → **模块级单例**：在模块作用域创建一次响应式数据（基于 `useLocalStorage`），每次调用返回**同一个 ref**。这样"我的"页与王冠页的状态自动同步，不会各存一份。
- `getAIConfig()` → 非响应式快照 `{ provider, baseUrl, model, apiKey, configured }`（请求前取用）
- `saveAIConfig({ provider, apiKey })` / `clearAIConfig()`
- `hasUsableKey()` → boolean
- `maskKey(key)` → 形如 `sk-****abcd`（保留前 3 + 后 4，中间固定 4 个星号；长度不足 12 时全部打码，不泄漏长度）

**兜底顺序（写死，只有两级）**：本机保存的 → 无。没有第三级。

### 4. `src/composables/useChatAI.js` —— 唯一改动点【改】
- 删掉 `API_URL` / `MODEL` 两个常量，改为每轮请求前从 `getAIConfig()` 取 `baseUrl` / `model` / `apiKey`。
- 两处 `import.meta.env.VITE_DEEPSEEK_API_KEY`（`:65`、`:127`）改为读配置。
- `SYSTEM_PROMPT`、危机管线插入点、`ask()` 签名、`askStructured()` 导出**一律不动**（RULES 第 5、11 条）。
- 缺 Key 时的错误文案改为引导式："还没有配置密钥，去「我的 → AI 设置」填一个，或先选智谱免费模型。"
- **新增导出 `verifyAIConfig({ provider, apiKey })`**：向该服务商发一次最小请求（`max_tokens: 1`，内容 "hi"），返回 `{ ok, message }`。401 → "密钥无效，请检查是否复制完整"；402/余额类 → "余额不足"；其余非 2xx → 带状态码的人话；网络异常不抛出。**成功返回 "连接正常"**。
- **禁止**把 Key 拼进任何错误提示、console 输出、日志或记忆写入路径。

### 5. `src/components/user/AiSettingsModal.vue` —— 设置弹窗【新积木】
复用 `ModalBox.vue`（用法参照 `EditProfileModal.vue`）。**组件必须自包含**（自己读写积木、自己管状态），因为要在"我的"页和王冠页两处复用挂载，不许引入跨页面事件总线。

内容：
- 服务商选择（两项，显示 `label` + `note`，智谱那条标"免费"）
- Key 输入框：`type="password"` + 显示/隐藏切换
- 已保存时默认显示 `maskKey()` 结果而非明文；点"修改"才出现输入框
- 三个动作：**测试连接**（调 `verifyAIConfig`，就地显示结果）· **保存** · **清除密钥**
- 一行说明（原话照用）："密钥只保存在你这台设备上，不会上传到任何服务器。"
- 每个服务商附"去哪里申请"的可点击链接（`applyUrl`）

### 6. `src/components/crown/ChatView.vue` —— 未配 Key 的门【改两处】
- 输入区上方加**状态条**：未配置时显示"王冠还没拿到钥匙 —— 先配置 AI 密钥" + "去配置"按钮，点击**就地**打开 `AiSettingsModal`（不跳页）。
- 发送前检查：没有可用 Key 就**不发 fetch**，直接给引导，别让用户在"正在输入"里转圈等到报错。
- 现有 `error-hint`（`:72`）保留。样式沿用现有苹果风（白底圆角浅阴影、无 emoji 装饰）。

### 7. `src/components/user/MinePage.vue` —— 设置入口【改】
在"修改资料"按钮旁加 **AI 设置** 按钮（同款样式，`AppIcon` 用现有图标即可），并显示状态副标题：已配置 / 未配置。点击打开 `AiSettingsModal`。

### 8. `scripts/check-no-secret.mjs` —— 防回归闸门【新积木】
零依赖 Node 脚本。检查两件事，任一命中即 `exit 1`，并打印命中文件名（**只打印文件名，绝不打印 Key 本身**）：
- **形态扫描**：`dist/**/*.js` 出现 `sk-[A-Za-z0-9]{20,}` 这类长密钥形态
- **历史值扫描**：若 `.env` 仍存在且该行有值，取其值在 `dist/` 全量文本里搜完整字符串（防止旧通道残留）

`package.json`：加 `"check:secret": "node scripts/check-no-secret.mjs"`，并把闸门串进构建：`"build": "vite build && npm run check:secret"`。**闸门失败就不许构建通过**——这是机制保障，不是提醒。

### 9. 明确不做
不做后端 / 账号 / 云同步（P4 的事）；不做多密钥管理 / 用量统计 / 计费；不动危机响应系统与记忆模块；不重构现有页面；不改任何既有 composable 的导出方法名（RULES 第 5 条）。

## 测试与验收

**A. 机器可验（交付时必须贴每条的实际运行输出原文，不许概述）**

| 编号 | 断言 | 怎么验 |
|:---|:---|:---|
| A1 | **产物零 Key** | `npm run build` 全绿（含 `check:secret`）；再手工 `grep -rE 'sk-[A-Za-z0-9]{20,}' dist/ -l` 应**无输出**（基线：命中 1 个文件，要降到 0） |
| A2 | **源码零 env Key** | `grep -rn "VITE_DEEPSEEK_API_KEY\|import.meta.env.VITE" src/` 应**无输出** |
| A3 | 缺 Key 不请求 | 无配置时发消息：mock fetch 调用计数 = 0，且界面出现引导文案（不是裸报错） |
| A4 | 单例同步 | `useAIConfig()` 两处调用返回同一引用：A 处 save 后 B 处读到新值（写个小断言脚本证明） |
| A5 | 脱敏 | `maskKey('sk-1234567890abcdef')` 结果不含原 Key 连续 8 位以上；短串（<12）全部打码 |
| A6 | 验证函数 | 无效 Key → `ok:false` + 人话；网络异常不抛到界面；成功 → `ok:true` + "连接正常" |
| A7 | 回归 | `npm run test:crisis` 全部通过（RULES 第 11 条）；`npm run build` 模块数不低于基线 |
| A8 | 数据兼容 | 既有 localStorage 键（user / db / chat / memory）读写不受影响 |

**B. 必须人工验（机器验不了，交付时明确标出哪些做了、哪些待验）**

1. 打开 → 我的 → AI 设置 → 选 DeepSeek → 填自己的 Key → **测试连接** 正常 → 保存
2. 回王冠发一条消息 → 有回复
3. 切智谱免费档 + 填智谱 Key → 再发一条 → 有回复（**这步是"零成本上手"能否成立的关键**）
4. 清除密钥 → 王冠页出现配置引导，且不再转圈报错

**交付报告必须包含**：文件清单 · A 类每条实际输出原文 · B 类已验/待验 · 与本命令的偏差（有偏差必须明说，不许静默换方案）。

## 冻结与禁止

1. `SYSTEM_PROMPT` 与危机响应五层管线**一字不动**
2. `ask()` / `askStructured()` 的签名与返回结构不变
3. 不改 `dbData` 结构与既有 `STORAGE_KEYS` 的值
4. Key 禁止出现在：错误提示、console、localStorage 与用户输入框之外的任何位置、记忆写入、审计日志
5. **生产代码里禁止保留任何形式的"内置 Key 兜底"**（含 `import.meta.env` 通道）

## 实施顺序建议

① 先写 `aiProviders.js` + `useApiKey.js`（地基）→ ② **立刻**写 `check-no-secret.mjs` 并在**改动前**跑一次——此时应当**失败**（证明闸门真的在测，不是空转）→ ③ 改 `useChatAI.js` 两个取值点 + 清 `.env` → ④ 再跑闸门，应转绿 → ⑤ 做 `AiSettingsModal` + 两处挂载 → ⑥ 最后做 ChatView 的门与引导 → ⑦ 全量验收 + 人工项交接。

> ②→④ 是本次任务的核心证据链：**先看见闸门失败，再看见它转绿**。别跳过中间那次失败——只看"最后是绿的"，分不清是修好了还是闸门没在工作。

## 交付后要人工做的事（不在 Claude Code 范围内）

- 若旧 `dist/` 或装过旧 APK 的产物**曾发给过任何人**：去 DeepSeek 后台**吊销该 Key 并重新生成**。旧 Key 已随产物泄漏，改代码救不回已发出去的副本。
- 以后每次要外发构建产物前，跑一遍 `npm run check:secret`。
