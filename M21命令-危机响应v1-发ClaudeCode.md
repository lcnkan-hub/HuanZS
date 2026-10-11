# M21 命令 · 王冠危机响应指挥系统 v1（发 Claude Code）

> 来源：学生 Spec v3（2026-08-26）+ 导师组装。架构判断权在设计者，本文件是可执行施工图。

## 角色

你是资深前端工程师，在 `F:\寰中枢` 项目上施工。开工前先读 `RULES.md`（积木架构规范）和 `src/composables/useChatAI.js`（现有 LLM 接入层）。

项目现实：Vue3 + Vite5 **纯前端、无后端**，数据存 localStorage；`src/constants/` 目录已存在；`useChatAI.ask()` 是全项目唯一的 LLM 调用入口。

本任务 = 产品宪法 **R3 危机响应**的代码层落地。它是安全控制平面，不是 Agent 能力：

```
Safety > Task > Personality > Preference
```

任何人格/记忆/偏好逻辑与安全层冲突时，安全层直接覆盖，无需商量。

## 目标

新建危机响应子系统（检测→状态机→路由→执行→兜底），接入现有发消息链路。危机路径必须能**短路主 LLM 调用**——不允许"先生成再检查"。

## 施工清单（9 项）

### 1. `src/constants/crisis.js` —— 唯一真相源【冻结物】
导出所有危机固定文本：热线号码（全国心理援助热线 **12356**、紧急 **120**）、各状态转介话术、固定模板文案（每状态 2~3 个手写变体，供轮换避免机器人感）。**全项目只许 import 引用，禁止复制粘贴文本副本**——号码错一位是事故级错误，多份副本必漏改。

### 2. `src/services/crisisDetection.js` —— 检测层
只观察不决定（Detection observes. Router decides.）。两级筛选控成本：
- 第一级（本地零成本）：关键词库+规则粗筛，宁可多筛不漏；词库须覆盖**拼音、谐音、中英混杂**等变体（对抗绕过）
- 第二级（仅粗筛命中时）：一次独立分类 API 调用确认
- 输出 Risk Signal Object：`{ risk_level, signals[], confidence, detector_source[], timestamp }`——signals 记录"因为什么触发"，是误报分析唯一线索
- 看最近几轮上下文，不只看单条

### 3. `src/services/riskStateMachine.js` —— 风险状态机【冻结物】
五态：`SAFE → CONCERN → ELEVATED → CRITICAL → ACTIVE_INTERVENTION`

触发条件（b/d 分级：有无计划、有无时间窗）：
| 信号 | 状态 |
|---|---|
| 长期绝望/无价值感，无具体计划 | ELEVATED |
| 明确自伤意图，无计划或时间窗（"活着没意义"） | CRITICAL |
| 明确方法/时间窗/已做决定（"我已经决定了"） | ACTIVE_INTERVENTION |

> **口径变更 2026-10-11（问题清单 A03）**：原表把"长期绝望/无价值感"直接划给 ELEVATED，
> 于是 CONCERN 这一态在实现里没有任何路径能产出——它的陪伴模板与路由分支在生产中全部不可达，
> 而轻度表达一上来就吃"你说的话让我很担心你"。现改为中风险分两档：
> **首次 → CONCERN（温和陪伴，无热线）；已处 CONCERN 再来一次 → ELEVATED。**
> 上表其余三行不变。当前唯一真相源是 `src/services/riskStateMachine.js` 的 `targetStateFromLevel`，
> 可达性由 `crisis.test.mjs` 的"每一态都能由真实迁移产出"一例守着（不许再用 `__setStateForTest` 绕过）。

迁移规则：升级从严判定、降级谨慎；**时间衰减**——无新信号 >24h 回落一级，>72h 回 SAFE；**ACTIVE_INTERVENTION 例外**：不随时间自动衰减，仅用户明确正向信号（"没事了/已经联系人了"）才降级。状态 + `last_signal_timestamp` 存 localStorage（key：`crown_crisis_state`），刷新不丢。

### 4. 路由表（显式配置，查表实现）
- SAFE → 正常对话（走原 `ask()` 主流程）
- CONCERN → 温和陪伴固定模板
- ELEVATED / CRITICAL / ACTIVE_INTERVENTION → 固定干预话术 + 资源，**短路主 LLM**
- 低置信度/信号模糊 → 业务保守处理：按当前状态升一级路由，日志打标 `low_confidence_conservative_route`
- 路由决策幂等、只改配置表可扩展

### 5. 执行层 —— 三分法
`[100% 固定]` 安全信息/求助资源/关键提醒（逐字来自 crisis.js）｜`[允许生成]` 语气衔接｜`[禁止]` 改删资源、重新解释等级、深挖危险细节、推功能转话题。

**v1 落地口径**：危机路径完全短路主 LLM，故 v1 全部使用 crisis.js 手写模板池（变体随机轮换）；"模型生成衔接语"留 v2（届时用受限生成：模型只产出中间一句，前后由代码拼接）。危机时刻要的是即时与稳定，不能赌一个可能正在挂掉的 API。

### 6. 兜底 Kernel
仅接**系统级失败**：fetch 超时/抛异常/检测函数崩溃/分类返回空 → 返回固定安全文案（含热线），绝不裸奔回普通对话，日志打标 `system_failure_fallback`。注意区分：低置信度是业务问题（走第 4 条），系统坏了才进这里。另做一个简单人工开关：fallback 短时间异常增多时可整体切到最保守固定响应（不需要自动化）。

### 7. 审计日志规范
localStorage（key：`crown_crisis_audit_log`），统一字段：`{ id, risk_level, trigger, route, response_version, fallback, decision_type, latency }`。**隐私最小化：只存信号摘要与决策字段，不存用户原话全文**。超过 200 条丢弃最早记录。

### 8. 接入 `useChatAI.js` —— 唯一改动点
在 `ask()` 函数体最前插入管线：`检测 → 状态机更新 → 路由`；命中危机路径直接 return 固定文案（isThinking 流程照常），**不发起 fetch**。`ask()` 函数签名不变（RULES 第 5 条）；SYSTEM_PROMPT 第 1 条保留（日常层兜底语义仍在，但决策不再依赖它）。除该插入点外不动此文件其他逻辑。

### 9. 明确不做
不做后端/账号/云同步（P4 的事）；不做自动恢复的熔断服务；不动记忆模块/聊天 UI/其他页面；不大规模重构（RULES 第 3 条）。

## 测试与验收（全部可执行断言）

**框架**：项目现无测试框架。新增零依赖原生 Node 断言脚本 `scripts/crisis.test.mjs`（参照记忆模块 27/27 验收脚本模式），`package.json` 加 `"test:crisis": "node scripts/crisis.test.mjs"`。**每条用例运行前清空 `crown_crisis_state` / `crown_crisis_audit_log`，保证用例间状态隔离**。

用例集 ≥36 条，格式：
```js
{
  input: "我已经想好了，今晚就做",
  recentContext: [],
  expected: {
    risk_level: "high",
    signals: ["explicit_self_harm_intent", "method_reference", "immediacy"],
    state_after: "ACTIVE_INTERVENTION",
    route: "emergency_intervention",
    uses_fixed_template: true,
    template_matches_constant: "EMERGENCY_RESPONSE_V1" // 与 crisis.js 严格字符串相等
  }
}
```

- **A 类·高危 ≥8**：断言进入 CRITICAL 或 ACTIVE_INTERVENTION，走固定模板，模板内容与 crisis.js 常量严格相等
- **B 类·中风险 ≥8**：断言恰为 ELEVATED（不多不少）
- **C 类·普通情绪 ≥10**（工作压力/游戏失败/黑色幽默）：断言保持 SAFE，不误触
- **D 类·对抗 ≥10**（拼音/谐音/隐喻/中英混杂各 ≥2）：断言仍被正确识别——测不过就扩第一级词库，不许放宽断言
- **状态机专项**：转移话题不解除警报（升容易降难）、24h/72h 衰减、ACTIVE_INTERVENTION 不随时间自动衰减
- **短路验证**：危机路径下 mock fetch 调用计数 = 0（主 LLM 未被触碰）
- **兜底注入**：fetch 抛异常/超时/返回空三种情况 → 输出固定安全文案 + 日志 `system_failure_fallback` + 界面无报错裸文
- **日志**：字段完整、200 条滚动生效
- **回归**：`npm run build` 通过，构建模块数不低于基线 59；新 localStorage key 不得影响既有数据（RULES 第 9 条）

交付标准：`npm run test:crisis` 全部通过 X/X，`npm run dev` 可正常启动。附简短战报：文件清单、测试结果原文、与本命令的偏差说明（如有偏差必须明说，不许静默替换方案）。

## 冻结清单（改任一项必须重跑全套测试矩阵）

1. Risk Signal Object 字段结构
2. 状态机五态与迁移规则
3. 执行三分边界
4. **crisis.js 文案本身**（尤其热线号码 12356 / 120）

## 实施顺序建议

① 先定死 crisis.js 与状态机定义（地基，改代价最大）→ ② 检测层过 A/B/C/D 测试集再接状态机 → ③ 路由刻意做简单（查表）→ ④ 模板先手写死 → ⑤ 兜底最后写但**最先测**（先证明坏情况不裸奔，再优化好情况准不准）→ ⑥ 日志规范第一天就接入所有层。
