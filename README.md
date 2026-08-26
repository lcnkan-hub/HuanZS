# 寰中枢 (Huan Zhong Shu)

> 属于你的多维核心枢纽百科系统

一个轻量化的移动端个人知识库 App，支持**游戏 / 笔记 / 生活**三大分类，拥有 Markdown 编辑器、颜色标记、数据导入导出等功能。

---

## 🏗️ 项目结构（积木式架构）

```
寰中枢/
├── index.html                          # HTML 入口
├── package.json                        # 依赖配置
├── vite.config.js                      # Vite 构建配置
├── README.md
└── src/
    ├── main.js                         # Vue 应用入口
    ├── App.vue                         # 根组件（路由编排，110行 → 仅编排逻辑）
    │
    ├── constants/                      # 🔧 配置积木
    │   └── categories.js               #    Tab/分类/头像/存储键 统一管理
    │
    ├── utils/                          # 🔧 工具积木（纯函数，无副作用）
    │   ├── markdownParser.js           #    Markdown → HTML 安全编译器
    │   └── uniqueId.js                 #    ID 生成 + 时间格式化
    │
    ├── styles/                         # 🎨 视觉积木
    │   └── variables.css               #    CSS 变量体系（换肤只需改此文件）
    │
    ├── composables/                    # 🧠 逻辑积木（Vue 3 Composable）
    │   ├── useLocalStorage.js          #    持久化存储（自动同步 localStorage）
    │   ├── useUserProfile.js           #    用户档案（创建/读取/修改）
    │   └── useWikiData.js              #    百科数据库（增删改查/搜索/导入导出）
    │
    └── components/                     # 🧩 UI 积木
        ├── common/                     #    通用组件
        │   ├── SplashScreen.vue        #      开屏动画
        │   ├── ModalBox.vue            #      通用弹窗容器
        │   └── HelloGuide.vue          #      欢迎引导页
        ├── layout/                     #    布局组件
        │   ├── BottomNav.vue           #      底部导航栏
        │   └── AppHeader.vue           #      顶部搜索/添加栏
        ├── wiki/                       #    百科组件
        │   ├── WikiDetail.vue          #      详情页（阅读+编辑）
        │   ├── WikiList.vue            #      列表页（搜索过滤）
        │   └── WikiCard.vue            #      单张卡片
        └── user/                       #    用户中心组件
            ├── MinePage.vue            #      个人中心（组装编排）
            ├── UserProfileCard.vue     #      用户名片
            ├── FootprintSummary.vue    #      创造力足迹
            ├── CategoryGroup.vue       #      折叠分类面板（复用核心）
            ├── DataBackup.vue          #      数据导入导出
            └── EditProfileModal.vue    #      修改资料弹窗
```

---

## 🚀 快速启动

```bash
# 1. 进入项目目录
cd 寰中枢

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 构建生产版本
npm run build
```

---

## 🔑 架构设计理念

| 原始问题 | 优化方案 |
|----------|----------|
| App.vue 臃肿（210行，混入所有逻辑） | 拆为 110 行编排层，逻辑下沉 composables |
| 硬编码分类散落各处 | 统一 `constants/categories.js`，修改一处全局生效 |
| MinePage 3 处 18 行重复 HTML | `CategoryGroup.vue` 积木复用，3 行配置驱动 |
| localStorage 直接操作 | `useLocalStorage` 封装，自动 watch 同步 |
| Markdown 解析嵌入组件 | 纯函数抽取至 `utils/markdownParser.js` |
| 样式值硬编码 | CSS 变量体系，换肤只需改 `variables.css` |
| 数据 CRUD 与 UI 耦合 | `useWikiData` 独立管理，任何组件可调用 |

---

## 📱 功能概览

- 🎮📝🍀 三大百科分类 + 搜索过滤
- ✍️ Markdown 编辑器 + 颜色标记（蓝/棕/绿）
- 👤 个人中心 + 创造力足迹统计
- 📥📤 JSON 备份导出/导入（含沙箱校验）
- 💾 localStorage 自动持久化
- 📱 移动端优先设计

---

## 🛠️ 技术栈

- **Vue 3** (Composition API + `<script setup>`)
- **Vite 5** 构建工具
- 纯 CSS（CSS Variables 主题体系）
- 零后端依赖（纯前端 localStorage）
