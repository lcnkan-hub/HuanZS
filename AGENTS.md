# 寰中枢 · Agent 须知

开工前先读 **RULES.md**（硬规则）与 **PROJECT.md**（现状）；改哪个文件就先读哪个文件。
记录结构 / 存储键 / 分层约定以 **RULES.md 第 4~10 条**为准：单层记录数组、`pics` 放图片 id、三分类与 `children` 不得复活。
项目级技能在 **`.hermes/skills/`**（vue / ui / debug / optimize / firebase / apple-icons），需要时按名字加载。
改完必须跑：`npm run build`、`npm run check:ui`、`npm run check:tokens`、`npm run lint`，以及对应 `npm run test:*`；不跑等于没改完。

---

## 记录列表的三条禁令（2026-11-23 立，踩过两次才立）

1. **`App.vue` 里包住 `<WikiList>` 的 `.sheet-body` 不许加 `:key`，也不许加 `v-if`。**
   加了就是整块列表重建、卡片重新挂载 → 入场动画集体重播（按序号 ×70ms 排队，记录越多越夸张）。
   详情页的 `v-if` 与切王冠时的 `:key` 都干过这事，症状一致：**"已经记录的卡片会跳动出现"**、
   **"已经淡到透明的卡又亮一次再淡回去"**。要藏内容就藏动画（`opacity` / 位移动画），别拆 DOM。
2. **卡片入场动画只能是"一次性事件"，不许写成 `.data-card` 的常驻 `animation`。**
   入口在 `WikiList`：模块级 `enteredOnce` 按 id 记住谁入过场，只给第一次出现的卡 `.is-entering`；
   `WikiCard` 在 `animationend` 时 emit `entered`，列表立刻摘标记。
   理由：重播期间 CSS 动画优先级**高于**内联 `opacity`，会把逐卡淡出的状态盖掉。
   ⚠ **`animationend` 里只能按前缀认动画名，不能写全等**：Vue 的 scoped 样式会给
   `@keyframes` 改名（实测 `cardFadeIn-373722f9`），写 `=== 'cardFadeIn'` 会让标记永远摘不掉，
   结果透明度又永久被那条 animation 管着 —— 同一个坑换个入口再踩一次。
   新加入场动画请复用这条通道，别再自己挂常驻 animation。
3. **逐卡淡出（`useCardFade`）与入场动画共用 `opacity`，谁也别抢。**
   淡出走内联 `style.opacity`（滚到浮岛那一段整张变淡）；动画必须靠 `.is-entering` 开、播完就收。
   以后若要用内联 `opacity` / `transform` 做状态，先确认没有常驻动画会盖住它。

## 功能层（底栏浮岛）的规矩

1. **底栏在王冠页常驻**（2026-11-23）。切王冠时只有内容在动，浮岛原地不动 —— HIG · Motion
   「视觉运动要被限制在一个不动的区域里，整个画面都在动会让人不适」。它也是"回记录页"的入口，
   所以王冠页**不再有左上角返回键**（两套返回语义并存会让人猜）。
2. **给底栏提层位必须写在 `.bottom-nav` 包装元素上**（`z-index: 40`）。它是 `position: fixed`、
   自成堆叠上下文，只给里面的 `.nav-dock` 写 z-index 无效 —— 实测会被王冠页（`.chat-container` 是 2）
   整片盖住，`elementFromPoint` 命中的是 chat-container。
3. **两种底部浮件（输入栏 / 导航）用同一族材质、共轴、隔 8px**：输入 = 主动作，导航 = 次要。
   别把输入栏做成全宽带底色的横条 —— 那就是"一条面板 + 一颗药丸"两种语言。
4. **键盘弹起时两条都要让位**：浮岛下沉（`is-sunk`）、输入栏的 `margin-bottom` 从
   `calc(var(--nav-zone) + 8px)` 收回到 `8px`。判据走 `composables/useKeyboard.js`（visualViewport 高度差 > 120px），
   别用 focus 猜。

