# 寰中枢 · Agent 须知

开工前先读 **RULES.md**（硬规则）与 **PROJECT.md**（现状）；改哪个文件就先读哪个文件。
记录结构 / 存储键 / 分层约定以 **RULES.md 第 4~10 条**为准：单层记录数组、`pics` 放图片 id、三分类与 `children` 不得复活。
项目级技能在 **`.hermes/skills/`**（vue / ui / debug / optimize / firebase / apple-icons），需要时按名字加载。
改完必须跑：`npm run build`、`npm run check:ui`、`npm run check:tokens`、`npm run lint`，以及对应 `npm run test:*`；不跑等于没改完。
