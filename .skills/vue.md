---
name: vue
description: Vue 3 开发规范 — Composition API + composables 复用
---

# Vue 3 开发指令

- 使用 Vue 3 Composition API + `<script setup>`
- 逻辑复用走 composables（`useXxx.js`，以 `use` 开头）
- 模板保持简洁，复杂逻辑放 composables
- 组件按功能分目录：`common/`、`layout/`、`wiki/`、`user/`
- 常量走 `constants/`，不要在组件里写硬编码
- 样式用 CSS Variables（`variables.css`）
- 新功能加新文件，不往已有大文件里塞
