/**
 * 色系注册表（2026-11-26 · 多套外观）
 *
 * 职责：告诉界面"有哪几套色系、各叫什么、怎么在色卡上预览"。
 * ⚠ **这里不存任何色值**。颜色只有一个来源：CSS。
 *    默认色系（雾面板）写在 styles/variables.css 的 :root 里，
 *    其余色系各一个文件（styles/palettes/*.css），用 .palette-xxx 覆盖同名令牌。
 *    色卡上那几颗圆点由组件读该色系的 --color-* 现场取（getComputedStyle），
 *    这样"改一个令牌"不会漏掉 JS 里抄的第二份 hex。
 *
 * 为什么默认色系没有类名：默认 = 现在这套 :root 的值，一个类都不用挂；
 * 只有非默认色系才挂类。这样"什么都不做"的老用户走的就是最短的那条路。
 */
export const PALETTES = [
  {
    id: 'fog',
    name: '雾面板',
    note: '冷灰纸 · 四团雾 · 近黑药丸',
    className: ''
  },
  {
    id: 'iridescent',
    name: '虹彩雾',
    note: '柔光纸 · 电光蓝 · 青绿点',
    className: 'palette-iridescent'
  },
  {
    id: 'coral',
    name: '珊瑚跑道',
    note: '玫瑰灰纸 · 莓紫 · 琥珀点',
    className: 'palette-coral'
  }
]

/** 默认色系 id：写在 :root 里那套 */
export const DEFAULT_PALETTE = 'fog'

/** 色系 id → 根容器上的类名（默认色系给空串，不挂类） */
export function paletteClass(id) {
  const p = PALETTES.find((x) => x.id === id)
  return p ? p.className : ''
}

/** 色系 id → 注册项（读不到 / 非法 id → 默认那套，不让界面拿到 undefined） */
export function findPalette(id) {
  return PALETTES.find((x) => x.id === id) || PALETTES[0]
}
