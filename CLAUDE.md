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
