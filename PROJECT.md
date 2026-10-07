# 寰中枢 — 个人百科知识库

> 更新：2026-09-28（v2.6，对齐代码现状）

## 技术栈
- Vue 3（Composition API + `<script setup>`）
- Vite 5 构建
- localStorage 持久化（百科数据/聊天/记忆）+ IndexedDB（图片仓库，避开 5MB 上限）
- 纯 CSS（CSS Variables 主题体系）
- 零后端依赖（纯前端 SPA；王冠 AI 直连 DeepSeek API）
- Capacitor 8（Android 打包，`android/` 目录）

## 页面结构（Tab 导航）
| Tab | key | 说明 |
|-----|-----|------|
| 🎮 游戏 | game | 游戏百科列表 |
| 📝 笔记 | note | 笔记百科列表 |
| 🍀 生活 | life | 生活百科列表 |
| 👑 王冠 | crown | AI 伙伴聊天（全屏，隐藏底部导航） |
| 👤 我的 | mine | 个人中心 |

## 数据结构
```js
dbData = {
  game: [ /* note/life 同构 */
    {
      id: string, name: string, wiki: string(Markdown),
      creator: string, time: string("YYYY/MM/DD HH:mm"),
      children: [ /* 子词条，可选 */
        { id: string, name: string, wiki: string, creator: string, time: string }
      ]
    }
  ],
  note: [ /* 同上 */ ],
  life: [ /* 同上 */ ]
}

userProfile = { id: string(6位数字), name: string, avatar: string(emoji) }
chatMessages = [ { id, role: 'user'|'assistant', content, time } ]  // huan_zhong_shu_chat
memories = [ { id, type, content, source, sentiment, status, created_at, ... } ]  // huan_zhong_shu_memory_v1
```

## 核心功能
1. 百科条目 CRUD + 主词条-子词条二级结构
2. 搜索过滤（按分类 + 关键词）
3. Markdown 渲染（标题/加粗/代码/颜色标签/图片引用 `id://img-xxx`）
4. 子词条编辑器（阅读/编辑双模式 + IndexedDB 图片插入 + 缩略图预览）
5. 个人中心（足迹统计、条目管理、数据备份导入导出）
6. 王冠 AI 聊天（DeepSeek API + 人格系统 + 隐私边界）
7. 王冠记忆（白名单四类 + 情绪状态机 + C 档留门式开口）
8. 危机响应系统（五层管线 + 风险状态机 + 12356 转介）
9. 开屏动画 + 王冠入场动画（夜晚灯醒/白天光启双模式）
10. **用户自带密钥（BYOK）** + 模型适配层（DeepSeek / 智谱免费档可切，密钥只存本机、不进产物）
11. **王冠读百科 + 代记**：最近条目注入 → 提问命中注入正文 → 对话里自动归类落库（一次调用三岔路口）

## 积木清单
| 目录 | 文件 | 职责 |
|------|------|------|
| common | SplashScreen.vue | 开屏动画 |
| common | AppIcon.vue | SVG 图标渲染（替代 emoji） |
| common | ModalBox.vue | 通用弹窗 |
| common | HelloGuide.vue | 欢迎引导 |
| crown | ChatView.vue | 王冠聊天页编排 |
| crown | CrownEntrance.vue | 王冠入场动画（昼夜双模式） |
| crown | MemorySheet.vue | 记忆查看面板 |
| layout | BottomNav.vue | 底部导航（5 Tab） |
| layout | AppHeader.vue | 顶部搜索栏 |
| wiki | WikiDetail.vue | 详情页（子词条列表 + 添加/删除） |
| wiki | WikiList.vue | 列表 + 搜索 |
| wiki | WikiCard.vue | 单张卡片 |
| wiki | SubEntryEditor.vue | 子词条编辑器（阅读/编辑/图片插入） |
| user | MinePage.vue | 个人中心编排 |
| user | UserProfileCard / FootprintSummary / CategoryGroup / DataBackup / EditProfileModal | 名片/足迹/面板/备份/弹窗 |
| user | AiSettingsModal.vue | AI 设置弹窗（选服务商 / 填密钥 / 测试连接 / 清除）· BYOK |
| composables | useLocalStorage.js | localStorage 封装（deep watch 同步） |
| composables | useUserProfile.js | 用户档案（创建/读取/修改） |
| composables | useWikiData.js | 百科 CRUD + 子词条 + 导入导出校验 |
| composables | usePageRouter.js | 页面叠层路由 + 动画状态机 |
| composables | useChat.js | 聊天消息管理（增删/持久化/欢迎语） |
| composables | useChatAI.js | DeepSeek 请求 + 危机管线短路 |
| composables | useMemory.js | 记忆写入/注入/状态机/隐私话术 |
| composables | useImageStore.js | IndexedDB 图片仓库（增删查/清理） |
| composables | useApiKey.js | 密钥 / 服务商读写（模块级单例，只存本机 localStorage）· BYOK |
| composables | useWikiContext.js | 百科 → 王冠上下文（命中给正文 / 未命中给最近清单）· 只读 |
| composables | useWikiWriter.js | 回合提取结果校验后写入百科（保守过滤 + origin 标记） |
| constants | categories.js | Tab/分类/存储键统一配置 |
| constants | aiProviders.js | AI 服务商 / 接口地址 / 模型名唯一真相源 |
| constants | icons.js | SVG 图标库（统一 viewBox/描边） |
| constants | crisis.js + crisisContextPatterns.js | 危机信号定义 + 上下文模式 |
| services | crisisDetection / crisisResponse / riskStateMachine / storageAdapter | 危机五层管线 + 存储适配 |
| utils | markdownParser.js / uniqueId.js | Markdown 编译 / ID 生成 |
| styles | variables.css | 主题变量体系（换肤改一处） |
| scripts | check-no-secret.mjs | 产物密钥闸门（已串进 `npm run build`，命中即构建失败） |

## 测试
- `npm run test:crisis` — 危机响应系统 A/B/C/D 用例矩阵（修改危机结构必跑，见 RULES.md 第 11 条）
- `npm run check:secret` — 密钥泄漏闸门：扫 `dist/` 里的密钥形态与 `.env` 历史值；已串进 `npm run build`
