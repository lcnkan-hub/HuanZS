# 寰中枢 (Huan Zhong Shu)

> 属于你的多维核心枢纽百科系统

一个轻量化的移动端个人知识库 App：**游戏 / 笔记 / 生活**三大分类百科 + 子词条二级结构，内置 **👑 王冠 AI 伙伴**（DeepSeek 驱动聊天 + 长期记忆 + 危机响应）。

---

## 🏗️ 项目结构（积木式架构）

```
寰中枢/
├── index.html                          # HTML 入口
├── package.json                        # 依赖配置
├── vite.config.js                      # Vite 构建配置
├── capacitor.config.json               # Capacitor 配置（Android 打包）
├── android/                            # Android 工程
├── scripts/                            # 测试脚本
│   ├── run-crisis-tests.mjs            #   危机系统用例运行器
│   └── crisis.test.mjs                 #   A/B/C/D 用例矩阵
└── src/
    ├── main.js                         # Vue 应用入口
    ├── App.vue                         # 根组件（页面叠层编排 + 状态持有）
    │
    ├── constants/                      # 🔧 配置积木
    │   ├── categories.js               #   Tab/分类/头像/存储键 统一管理
    │   ├── icons.js                    #   SVG 图标库（AppIcon 渲染）
    │   ├── crisis.js                   #   危机信号定义
    │   └── crisisContextPatterns.js    #   危机上下文模式
    │
    ├── utils/                          # 🔧 工具积木（纯函数）
    │   ├── markdownParser.js           #   Markdown → HTML 安全编译器（含图片引用）
    │   └── uniqueId.js                 #   ID 生成 + 时间格式化
    │
    ├── styles/                         # 🎨 视觉积木
    │   └── variables.css               #   CSS 变量体系（换肤只需改此文件）
    │
    ├── services/                       # ⚙️ 服务积木（危机子系统）
    │   ├── crisisDetection.js          #   五层管线检测
    │   ├── riskStateMachine.js         #   风险状态机
    │   ├── crisisResponse.js           #   响应路由 + 话术
    │   └── storageAdapter.js           #   存储适配（node 测试降级内存）
    │
    ├── composables/                    # 🧠 逻辑积木（Vue 3 Composable）
    │   ├── useLocalStorage.js          #   持久化存储（deep watch 同步）
    │   ├── useUserProfile.js           #   用户档案
    │   ├── useWikiData.js              #   百科数据库（CRUD + 子词条 + 导入导出）
    │   ├── usePageRouter.js            #   页面叠层路由 + 动画状态机
    │   ├── useChat.js                  #   王冠聊天消息管理
    │   ├── useChatAI.js                #   DeepSeek 请求 + 危机管线短路
    │   ├── useMemory.js                #   王冠记忆（写入/注入/状态机）
    │   └── useImageStore.js            #   IndexedDB 图片仓库
    │
    └── components/                     # 🧩 UI 积木
        ├── common/                     #    通用组件
        │   ├── SplashScreen.vue        #      开屏动画
        │   ├── AppIcon.vue             #      SVG 图标渲染
        │   ├── ModalBox.vue            #      通用弹窗容器
        │   └── HelloGuide.vue          #      欢迎引导页
        ├── crown/                      #    王冠 AI 组件
        │   ├── ChatView.vue            #      聊天页编排
        │   ├── CrownEntrance.vue       #      入场动画（夜晚灯醒/白天光启）
        │   └── MemorySheet.vue         #      记忆查看面板
        ├── layout/                     #    布局组件
        │   ├── BottomNav.vue           #      底部导航栏（5 Tab）
        │   └── AppHeader.vue           #      顶部搜索/添加栏
        ├── wiki/                       #    百科组件
        │   ├── WikiDetail.vue          #      详情页（子词条列表）
        │   ├── SubEntryEditor.vue      #      子词条编辑器（阅读/编辑/图片）
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

# 5. 运行危机系统测试（修改危机结构后必跑）
npm run test:crisis
```

---

## 📱 功能概览

- 🎮📝🍀 三大百科分类 + 搜索过滤
- 📚 主词条-子词条二级结构（独立编辑器，阅读/编辑双模式）
- 🖼️ 图片插入（IndexedDB 存储，不占 localStorage 额度，Markdown `id://img-xxx` 引用）
- ✍️ Markdown 渲染（标题/加粗/代码/颜色标签/图片）
- 👑 王冠 AI 聊天（DeepSeek API，人格系统、隐私边界）
- 🧠 王冠记忆（白名单四类 + 情绪状态机 + 留门式开口）
- 🛡️ 危机响应（五层管线 + 风险状态机 + 心理援助转介）
- 👤 个人中心 + 创造力足迹统计
- 📥📤 JSON 备份导出/导入（含沙箱校验）
- 💾 localStorage + IndexedDB 双持久化
- 📱 移动端优先设计 + 页面叠层动画

---

## 🛠️ 技术栈

- **Vue 3** (Composition API + `<script setup>`)
- **Vite 5** 构建工具
- 纯 CSS（CSS Variables 主题体系）
- localStorage（数据/聊天/记忆）+ IndexedDB（图片仓库）
- 零后端依赖（AI 直连 DeepSeek API）
- Capacitor 8（Android 打包）
