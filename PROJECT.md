# 寰中枢 — 个人百科知识库

## 技术栈
- Vue 3（Composition API + `<script setup>`）
- Vite 5 构建
- localStorage 持久化（5MB 上限）
- 纯 CSS（CSS Variables 主题体系）
- 零后端依赖（纯前端 SPA）

## 页面结构（Tab 导航）
| Tab | 路径 | 说明 |
|-----|------|------|
| 🎮 游戏 | categories.game | 游戏百科列表 |
| 📝 笔记 | categories.note | 笔记百科列表 |
| 🍀 生活 | categories.life | 生活百科列表 |
| 👤 我的 | mine | 个人中心 |

## 数据结构
```js
dbData = {
  game: [
    { id: string, name: string, wiki: string(Markdown),
      creator: string, time: string("YYYY/MM/DD HH:mm") }
  ],
  note: [ /* 同上 */ ],
  life: [ /* 同上 */ ]
}

userProfile = {
  id: string(6位数字), name: string, avatar: string(emoji)
}
```

## 核心功能
1. 百科条目 CRUD（增删改查）
2. 搜索过滤（按分类+关键词）
3. Markdown 渲染（标题/加粗/代码/颜色标签）
4. 个人中心（足迹统计、条目管理、数据备份导入导出）
5. 开屏动画

## 设计风格
- Apple 风格（白底、圆角、浅阴影）
- 移动端优先（`-webkit-overflow-scrolling: touch`）
- CSS 变量体系（`variables.css`），换肤改一处

## 积木清单
| 目录 | 文件 | 职责 |
|------|------|------|
| common | SplashScreen.vue | 开屏动画 |
| common | ModalBox.vue | 通用弹窗 |
| common | HelloGuide.vue | 欢迎引导 |
| layout | BottomNav.vue | 底部导航 |
| layout | AppHeader.vue | 顶部搜索栏 |
| wiki | WikiDetail.vue | 详情+编辑器 |
| wiki | WikiList.vue | 列表+搜索 |
| wiki | WikiCard.vue | 单张卡片 |
| user | MinePage.vue | 个人中心编排 |
| user | 5 个子组件 | 名片/足迹/面板/备份/弹窗 |
