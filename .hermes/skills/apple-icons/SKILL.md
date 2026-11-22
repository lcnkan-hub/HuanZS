---
name: apple-icons
description: SF Symbols 图标体系 — Web 端使用 SVG 替代方案，保持苹果风格
knowledge_sources:
  - https://developer.apple.com/sf-symbols/
  - https://developer.apple.com/design/human-interface-guidelines/sf-symbols
---

# Apple Icons 技能 — Web 端图标指南

> SF Symbols 是 Apple 平台统一图标库（7000+ 图标、9 级字重、3 级缩放），Web 端无法直接使用 SF Symbols 字体。本技能使用纯 SVG 实现所有图标，保证跨平台一致性和苹果风格。

---

## 一、技术规范与设计标准

### 1.1 统一基准
- **viewBox**：所有图标强制使用 `viewBox="0 0 24 24"`，确保组件在布局中尺寸一致
- **尺寸**：通过外层容器 `width`/`height` 控制显示大小，SVG 属性不写死 px 值

### 1.2 iOS 审美 — 描边逻辑
- 优先采用描边（Stroking）风格，统一 `stroke-width="2"`
- 必须设置 `stroke-linecap="round"` 和 `stroke-linejoin="round"`，契合苹果生态圆润感
- 实心填充图标除外（如圆点标签），此时用 `fill` 替代 `stroke`

### 1.3 动态化 — currentColor
- 所有 `fill` 和 `stroke` 属性强制替换为 `currentColor`
- 确保图标颜色能随主题（暗黑模式）及交互状态（hover/active/selected）自动响应
- 特例：颜色标签图标使用 CSS 变量（如 `var(--color-markdown-blue)`）

### 1.4 无障碍
- 每个 SVG 必须嵌入 `<title>` 标签，描述图标用途
- 外层容器设置 `aria-hidden="true"`（装饰性图标）或 `role="img"` + `aria-label`（功能性图标）

### 1.5 轻量化
- 使用 SVGOMG 清除冗余路径数据和元数据
- 图标函数统一通过 `svg(size, innerHTML)` 模板生成，避免重复声明属性

---

## 二、防御性编码对策

### 2.1 组件化管理（防止代码臃肿）
- ❌ 禁止在页面模板中直接内嵌原始 SVG 代码
- ✅ 所有图标统一定义在 `src/constants/icons.js`，通过 `ICON_MAP` 导出
- ✅ 通过 `<AppIcon name="xxx" :size="20" />` 组件统一调用

### 2.2 路径完整性校验（防止渲染残缺）
- 多 path 图标修改时必须全量扫描，确保每个 `<path>` / `<line>` / `<circle>` / `<polyline>` 都正确设置 `stroke` 或 `fill`
- 禁止遗漏导致"半截变色"

### 2.3 容器居中对齐（防止布局偏移）
- 不依赖 SVG 内部坐标定位
- 强制使用 CSS Flexbox 包裹：`display: inline-flex; align-items: center; justify-content: center;`
- 规避不同图标留白不一致导致的视觉偏差

### 2.4 交互状态增强（防止静态感）
- 所有图标容器添加过渡动画：
```css
.app-icon {
  transition: transform 0.15s ease-out, color 0.2s ease;
}
```
- 可点击图标按钮添加 `:active` 缩放反馈 `scale(0.92)`
- 赋予 App"原生 iOS"操作质感

---

## 三、图标定义规范

### 图标函数模板
```js
// src/constants/icons.js
const svg = (size, title, inner) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>${title}</title>${inner}</svg>`

export const iconBack = (size = 20) =>
  svg(size, '返回', '<polyline points="15,18 9,12 15,6"/>')
```

### 图标命名规范
- 函数名：`icon` + PascalCase，如 `iconChevronLeft`、`iconGame`
- 导出 key：kebab-case，如 `back`、`game`、`book-open`
- 文件名：`icons.js`，放在 `src/constants/` 下

---

## 四、图标清单

| key | title | 类型 | 用途 |
|:---|:---|:---|:---|
| `back` | 返回 | 描边 | 返回上一页 |
| `forward` | 前进 | 描边 | 前进/展开项 |
| `down` | 下拉 | 描边 | 展开/下拉 |
| `up` | 收起 | 描边 | 收起 |
| `close` | 关闭 | 描边 | 关闭弹窗/页面 |
| `check` | 确认 | 描边 | 保存/发布 |
| `plus` | 添加 | 描边 | 添加条目 |
| `trash` | 删除 | 描边 | 删除条目 |
| `edit` | 编辑 | 描边 | 编辑内容 |
| `search` | 搜索 | 描边 | 搜索 |
| `game` | 游戏 | 描边 | 游戏分类 |
| `note` | 笔记 | 描边 | 笔记分类 |
| `life` | 生活 | 描边 | 生活分类 |
| `mine` | 我的 | 描边 | 个人中心 |
| `doc` | 文档 | 描边 | 子词条 |
| `book` | 百科 | 描边 | 百科词条 |
| `book-open` | 详情 | 描边 | 主词条详情 |
| `clock` | 时间 | 描边 | 时间戳 |
| `author` | 作者 | 描边 | 创建者 |
| `tag` | 标签 | 描边 | 分类标签 |
| `list` | 列表 | 描边 | 数量统计 |
| `has-content` | 有内容 | 描边 | 内容状态 |
| `settings` | 设置 | 描边 | 修改资料 |
| `export` | 导出 | 描边 | 导出备份 |
| `import` | 导入 | 描边 | 导入恢复 |
| `shield` | 备份 | 描边 | 数据安全 |
| `stats` | 统计 | 描边 | 足迹统计 |
| `puzzle` | 积木 | 描边 | 模块组件 |
| `color-blue` | 深海蓝 | 实心 | 颜色标记 |
| `color-brown` | 暖木棕 | 实心 | 颜色标记 |
| `color-green` | 苔藓绿 | 实心 | 颜色标记 |

---

## 五、AppIcon 组件规范

```html
<!-- 基本用法 -->
<AppIcon name="back" :size="20" />

<!-- 按钮内的图标 -->
<button>
  <AppIcon name="plus" :size="14" />
  添加
</button>
```

组件职责：
- 通过 `ICON_MAP[name]` 查找对应图标函数
- 传入 `size` 渲染 SVG，自动匹配尺寸变体 class
- 提供 CSS transition 动画支持

---

## 六、图标设计规则

- 统一 24×24 画布
- 描边图标：`stroke-width="2"`，`fill="none"`
- 实心图标：`fill` 直接设置颜色
- 最小触摸目标 44×44px（图标可 20px，外层 padding 扩展）
- 颜色跟随 `currentColor`，选中态用 `systemBlue`
