---
name: ui
description: Apple HIG 设计规范 — 布局/颜色/字体/间距/导航/动画/无障碍，统一 iOS 原生体验
knowledge_sources:
  - https://developer.apple.com/design/human-interface-guidelines/
  - https://developer.apple.com/design/resources/
  - https://developer.apple.com/documentation/swiftui
  - https://developer.apple.com/tutorials/swiftui
---

# Apple Design 技能 — 完整 Vue/CSS 实现指南

> 知识源优先采用 Apple 官方资料。在每次生成、修改、重构 Vue 代码时自动参考本技能，统一视觉、交互、动画和代码风格，使应用尽可能接近原生 iOS 设计体验。

---

## 一、布局原则（HIG Layout）

### 安全区与边距
- 内容区左右边距：**16px**（iPhone 标准水平边距）
- 顶部安全区：`env(safe-area-inset-top)`，底部：`env(safe-area-inset-bottom)`
- 卡片与卡片间距：**12px**
- section 之间的垂直间距：**24px**（标题）→ **12px**（内容）

### 8pt 网格系统
- 所有间距必须是 4 或 8 的倍数：`4, 8, 12, 16, 20, 24, 32, 40, 48`
- 图标尺寸：`16, 20, 24, 28, 32px`（对应 SF Symbols small/medium/large）
- 触摸目标最小：**44×44px**（HIG 硬性要求）

### CSS 实现
```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --margin-horizontal: 16px;
  --spacing-xs: 4px; --spacing-sm: 8px; --spacing-md: 12px;
  --spacing-lg: 16px; --spacing-xl: 20px; --spacing-xxl: 24px;
}
```

---

## 二、字体排印（HIG Typography + SF Font）

### 字体栈
```css
--font-system: -apple-system, BlinkMacSystemFont, "SF Pro Display",
  "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
--font-mono: "SF Mono", "Menlo", "Consolas", monospace;
--font-rounded: "SF Pro Rounded", -apple-system, sans-serif;
```

### 字号层级（对应 iOS Dynamic Type）
| 用途 | 字号 | 字重 | 行高 |
|:---|:---:|:---|:---:|
| 大标题（largeTitle） | 34px | 700 | 1.2 |
| 标题1（title1） | 28px | 700 | 1.2 |
| 标题2（title2） | 22px | 600 | 1.25 |
| 标题3（title3） | 20px | 600 | 1.25 |
| 正文（body） | 17px | 400 | 1.5 |
| 标注（callout） | 16px | 400 | 1.4 |
| 副文（subhead） | 15px | 400 | 1.4 |
| 脚注（footnote） | 13px | 400 | 1.3 |
| 说明1（caption1） | 12px | 400 | 1.3 |
| 说明2（caption2） | 11px | 400 | 1.3 |

### CSS 实现
```css
:root {
  --text-large-title: 34px; --text-title1: 28px;
  --text-title2: 22px; --text-title3: 20px;
  --text-body: 17px; --text-callout: 16px;
  --text-subhead: 15px; --text-footnote: 13px;
  --text-caption: 12px;
}
```

---

## 三、色彩体系（HIG Color）

### Apple 系统色映射
```css
:root {
  /* 背景 */
  --color-bg-primary: #f2f2f7;      /* systemGroupedBackground */
  --color-bg-secondary: #ffffff;     /* systemBackground */
  --color-bg-tertiary: #f2f2f7;     /* systemGroupedBackground */
  
  /* 文字 */
  --color-text-primary: #000000;     /* label */
  --color-text-secondary: #3c3c43;   /* secondaryLabel (60% opacity) */
  --color-text-tertiary: #3c3c43;    /* tertiaryLabel (30% opacity) */
  --color-text-placeholder: #3c3c43; /* placeholderText */
  
  /* 分隔线 */
  --color-separator: #3c3c43;        /* separator (20% opacity) */
  --color-separator-opaque: #c6c6c8; /* opaqueSeparator */
  
  /* 系统色 */
  --color-blue: #007aff;             /* systemBlue */
  --color-green: #34c759;            /* systemGreen */
  --color-orange: #ff9500;           /* systemOrange */
  --color-red: #ff3b30;              /* systemRed */
  --color-pink: #ff2d55;             /* systemPink */
  --color-purple: #af52de;           /* systemPurple */
  --color-teal: #5ac8fa;             /* systemTeal */
  --color-indigo: #5856d6;           /* systemIndigo */
  
  /* 填充色 */
  --color-fill-primary: #787880;     /* systemFill (20% opacity) */
  --color-fill-secondary: #787880;   /* secondarySystemFill (16%) */
  --color-fill-tertiary: #767680;   /* tertiarySystemFill (12%) */
}
```

### 用色规则
- 文本永远不直接放在背景色上不加对比：正文 `#000` 对 `#fff`（21:1）
- 灰色文本用 `rgba(60,60,67,0.6)`（secondary）或 `rgba(60,60,67,0.3)`（tertiary）
- 强调色只用 systemBlue（`#007aff`），除非特殊语义（红=删除、绿=成功）
- 暗黑模式：所有颜色提供 `.dark` 或 `prefers-color-scheme: dark` 版本

---

## 四、圆角（HIG Corners + iOS 连续曲线）

### 连续曲线（squircle）模拟
iOS 圆角不是普通 border-radius，是"连续曲线"（squircle）。CSS 最佳模拟：
```css
/* 标准卡片 — 近似连续曲线 */
.card {
  border-radius: 16px;
  /* 用两个值近似 squircle:
     border-radius 的 / 语法表示椭圆角
     连续曲线介于圆形和椭圆之间 */
}

/* 按钮 */
.btn { border-radius: 10px; }        /* 小型按钮 */
.btn-lg { border-radius: 14px; }     /* 大型按钮 */

/* 弹窗（sheet） */
.sheet { border-radius: 20px 20px 0 0; }  /* 顶部弹窗 */
.modal { border-radius: 14px; }            /* 居中弹窗 */

/* 图标/头像 */
.avatar { border-radius: 50%; }            /* 圆形头像 */
.app-icon { border-radius: 22.37%; }       /* iOS App 图标比例 */
```

### 圆角层级
```css
--radius-none: 0;    --radius-sm: 6px;    --radius-md: 10px;
--radius-lg: 14px;   --radius-xl: 16px;   --radius-xxl: 20px;
```

---

## 五、阴影（HIG Depth + Elevation）

iOS 阴影极浅，用于表达层级：
```css
/* 卡片浮起（1 级） */
--shadow-card: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);

/* 导航栏/工具栏（2 级） */
--shadow-nav: 0 0 0.5px rgba(0,0,0,0.12), 0 -1px 4px rgba(0,0,0,0.06);

/* 弹窗遮罩（3 级） */
--shadow-modal: 0 8px 40px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.08);

/* 浮动按钮（4 级） */
--shadow-floating: 0 4px 14px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);
```

### 阴影规则
- 只用黑色阴影，不用带色阴影
- 最多 4 级深度
- 阴影永远向上投射（光源在顶部）
- 不要给纯白色背景加阴影——阴影来自卡片之间

---

## 六、导航模式（SwiftUI Navigation → Vue）

### 页面结构对应
| iOS 原生 | Vue 实现方式 |
|:---|:-----|
| TabView + TabItem | `BottomNav` 组件 + `v-model` 绑定 currentTab |
| NavigationStack | 叠层 div + transform 动画（你现在的方案） |
| .sheet() 弹窗 | `ModalBox` 组件 + 底部弹出动画 |
| .alert() 确认框 | `confirm()` / 自定义 Alert 组件 |
| List | `v-for` 渲染条目列表 |
| ScrollView | `overflow-y: auto; -webkit-overflow-scrolling: touch` |

### Tab Bar 规范
- 2~5 个 tab，每个 tab 有标题 + 图标
- 选中态：蓝色图标 + 文字，未选中：灰色
- 高度 83px（含安全区），内容区 49px
- 当前 tab 永远高亮，不要用纯文字 tab

### 导航栏规范
- 大标题模式（large title）→ 列表顶部的大标题（34px 加粗）
- 标准模式 → 顶部 44px 导航栏
- 返回按钮永远在左侧，文本用上一个页面标题

---

## 七、组件映射（SwiftUI → Vue）

| SwiftUI 组件 | Vue/CSS 对等实现 |
|:---|:-----|
| Button | `<button>` + 蓝色文字或填充背景 |
| Toggle | `<input type="checkbox">` + 自定义 CSS track/thumb |
| Slider | `<input type="range">` + 自定义样式 |
| Stepper | 两个按钮 + 中间文本 |
| Picker | `<select>` 或自定义 wheel picker |
| TextField | `<input>` + 底部 1px 分隔线（非 border） |
| TextEditor | `<textarea>` + 透明背景 + 等宽字体 |
| ProgressView | 自定义进度条（线性/圆形） |
| GroupBox | 卡片容器 + 标题 |
| Section | 分组列表 + header/footer |
| ContextMenu | 长按弹出菜单或操作按钮 |

### TextField 样式（iOS 风格）
```css
.ios-input {
  border: none;
  border-bottom: 1px solid var(--color-separator-opaque);
  border-radius: 0;           /* iOS 输入框无圆角 */
  padding: 8px 0;
  font-size: var(--text-body);
  background: transparent;
}
```

---

## 八、动画（HIG Motion + iOS Curves）

### 速度参考（单位：毫秒）
| 用途 | 时长 | 曲线 |
|:---|:---:|:-----|
| 微交互（点击反馈） | 100-150ms | ease-out |
| 小动画（开关/选中） | 200-250ms | ease-in-out |
| 中等动画（页面切换） | 300-360ms | cubic-bezier(0.2,0.8,0.2,1.0) |
| 大型动画（弹窗进出） | 400-500ms | spring-like ease |

### iOS 标准缓动
```css
/* iOS 默认（接近 spring，但有阻尼） */
--ease-ios: cubic-bezier(0.25, 0.1, 0.25, 1.0);

/* iOS 弹性（弹窗出场） */
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);

/* iOS 减速（滚动停止） */
--ease-decelerate: cubic-bezier(0.0, 0.0, 0.2, 1.0);

/* iOS 加速（离开屏幕） */
--ease-accelerate: cubic-bezier(0.4, 0.0, 1.0, 1.0);
```

### 动画黄金规则
- 动画只操作 `transform` + `opacity`（GPU 合成，60fps）
- 避免动画 `width/height/top/left`（触发 Layout 重排）
- 使用 `will-change` 提前告知浏览器
- 使用 `backface-visibility: hidden` 避免渲染闪烁
- 缩放从 `1.0` 开始，最小 `0.97`（不要低于 `0.95`）
- 列表项交错入场：`index * 50~70ms` 延迟

### 手势反馈（HIG Gestures）
- 点击：`scale(0.97)` + 100ms ease-out
- 长按：需要 `contextmenu` 或触觉反馈（无 web API 则省略）
- 滑动删除：`translateX(-100%)` + 红色删除按钮显现
- 下拉刷新：暂无 web 等效（可省略）

---

## 九、无障碍（HIG Accessibility）

```css
/* 最小触摸目标 */
.touch-target { min-width: 44px; min-height: 44px; }

/* 对比度要求 */
/* 正文文字 ≥ 4.5:1 */
/* 大文字(≥18px 粗体) ≥ 3:1 */
/* 图标 ≥ 3:1 */

/* 焦点环 */
:focus-visible {
  outline: 2px solid var(--color-blue);
  outline-offset: 2px;
}
```

### 语义化 HTML
- 用 `<h1>~<h6>` 代替 `<div class="title">`
- 用 `<button>` 代替 `<div onclick>`（键盘可达）
- 用 `<input>` 代替自定义输入框（除非完全模拟）
- 给图标加 `aria-label` 或 `role="img"`
- `aria-hidden="true"` 隐藏装饰性图标

---

## 十、图片与素材

### 图片规范
- 头像：圆形裁剪（`border-radius: 50%`）
- 缩略图：`border-radius: var(--radius-sm)`（6px）
- 全屏图：零圆角
- 图片加载前显示占位色：`var(--color-fill-tertiary)`

### SF Symbols 参考
详见 `apple-icons` 技能。Web 端优先使用 emoji 作为图标（天然支持所有平台，无需额外字体或 SVG），仅在需要精确图标时使用 SVG。

---

## 禁止事项

- ❌ 不要用 `box-shadow` 做发光边框（iOS 无此风格）
- ❌ 不要用渐变背景做卡片（iOS 卡片纯白/纯灰）
- ❌ 不要用超过 2px 的粗边框
- ❌ 不要用高饱和度颜色做背景
- ❌ 不要用 `transform: rotate()` 做图标动画（SF Symbols 用缩放/透明度）
- ❌ 不要给所有元素加 `transition: all`（性能差）
- ❌ 不要修改业务逻辑，本技能仅约束 UI 层
