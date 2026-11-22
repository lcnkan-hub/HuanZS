# 寰中枢 — Claude Code 指南

## 启动
- 每次修改变更前先读 PROJECT.md + RULES.md + TASKS.md
- 默认遵守 RULES.md，不重复询问
- 只读要改的文件，不全景扫描

## 积木架构
```
src/
├── constants/     ← 配置积木
├── utils/         ← 工具积木（纯函数）
├── styles/        ← 视觉积木（CSS变量）
├── composables/   ← 逻辑积木（useXxx）
└── components/    ← UI积木（按功能分文件夹）
```

## 记录列表的硬约束（详见 AGENTS.md）
- `.sheet-body`（包住 `<WikiList>` 的那层）**不许加 `:key` / `v-if`**：重建会让卡片入场动画集体重播。
- 卡片入场动画只能一次性：`WikiList` 的模块级 `enteredOnce` 按 id 判定，`WikiCard` 的 `.is-entering` 播完即收。
- 逐卡淡出（`useCardFade`）与入场动画共用 `opacity`，禁止再加常驻 `animation` 覆盖它。
