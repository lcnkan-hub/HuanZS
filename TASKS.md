# 寰中枢 — 开发计划

> 上次更新：2026-08-26（v2.5 基线，对齐代码现状，避免重复开发）

## ✅ 已完成

### 百科基础（v1）
- [x] 条目 CRUD + 分类/关键词搜索
- [x] Markdown 渲染（标题/加粗/代码/颜色标签）
- [x] 个人中心（足迹统计、条目管理、数据备份导入导出）
- [x] 子词条二级结构（`WikiDetail` + `SubEntryEditor`，阅读/编辑双模式）
- [x] 图片插入（IndexedDB 图片仓库 `useImageStore.js`，`id://img-xxx` 引用标记，缩略图预览）

### AI 能力（v2.0+）
- [x] 王冠 AI 聊天打通（`useChatAI.js` 直连 DeepSeek API，人格系统、30s 超时、最近 10 条控 Token）
- [x] 王冠记忆模块（`useMemory.js`：fact/goal/event/preference 白名单四类 + 情绪状态机 + 沉默阈值 + C 档留门式开口）
- [x] 隐私边界（情感依赖类请求回应但不落库；"记住"私密事件固定话术）
- [x] 危机响应系统（五层管线 + 风险状态机 + 轻量确认 + 12356 转介；`npm run test:crisis` 测试矩阵）

## 📌 待完成

### Phase 1 — 编辑器增强
- [ ] 图片放大查看（缩略图已就绪，缺点击放大 lightbox）
- [ ] 思维导图编辑（嵌入 mind-elixir 库）
- [ ] BaseButton 通用按钮积木

### Phase 2 — AI 能力
- [ ] AI 检索面板（调用 DeepSeek API）
- [ ] AI 百科条目自动完善（王冠读百科数据 + 补全条目）
- [ ] AI 问答搜索（基于百科数据回答，区别于纯聊天）

### Phase 3 — 辩论模式（差异化核心）
- [ ] 底部导航加「🗣️ 辩论」Tab
- [ ] 辩题创建
- [ ] AI 对抗辩论（正反方）
- [ ] 辩论记录存储 + 回顾

### Phase 4 — 附加功能
- [ ] 浏览历史记录
- [ ] 收藏夹
- [ ] 子条目搜索
- [ ] 一键发布为静态 HTML（现有 dist 仅为构建产物）
- [ ] PWA 离线支持（已有 manifest，缺 Service Worker）

## 完成标准
- 每个功能 = 1 个 composable + N 个组件积木
- 不破坏已有条目数据
- 移动端优先
- 危机系统结构性改动必须跑 `npm run test:crisis` 全量矩阵（RULES.md 第 11 条）
