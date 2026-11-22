/**
 * 底部逐卡淡出积木（2026-11-22）
 *
 * 职责：让每张记录卡按「它自己滚进底栏那一段的深度」**整体**变淡。
 *
 * 为什么不继续用 CSS 蒙版（`.primary-sheet` 的 mask-image）：
 *   蒙版是给**整片区域**削一层透明度。视觉上读成"整个底部在淡" —— 一张卡可以上半截实、
 *   下半截透明，人被切在中间；而且浮岛玻璃底下那一段也被削空，材质就没有内容可透（白做）。
 *   用户的原话是「不应该添加淡出的蒙版，看起来是整个底部在淡出而不是卡片淡出」。
 *   改成逐卡 opacity 之后：淡化的主体是卡片本身，位置在它自己身上，屏幕上不存在"一条带"。
 *
 * 几何口径（都从真实元素量，不抄像素）：
 *   · 淡出带 = 浮岛上沿到滚动容器底部那一段（`--nav-zone` 的实测值，含手势条安全区）
 *   · 一张卡的下边缘越过浮岛上沿开始变淡，到容器底部归零
 *   · 静止时最后一张卡落在淡出带之上（列表底部留白负责），所以读得全
 *
 * 性能：位置只在 items 变化 / 尺寸变化时量一次（measure）；
 *   滚动时只做算术，且仅对"本帧透明度变了 1% 以上"的卡写样式 —— 一帧通常写 0~2 张。
 */
import { watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

/** 淡出带量不到时的兜底高度（与 --nav-zone 的常规值同级，不是设计参数） */
const FALLBACK_SPAN = 72

export function useCardFade(rootRef, items) {
  let raf = 0
  let scroller = null
  let cards = []      // [{ el, top, height, last }]
  let viewH = 0       // 滚动容器可见高度
  let span = FALLBACK_SPAN

  /**
   * 元素相对滚动容器内容坐标的纵向位置。
   * **必须走 offsetTop 链，不能用 getBoundingClientRect**：列表入场时卡片在跑
   * cardFadeIn / bodyEnter 的 translateY 动画，rect 量到的是"动画中的位置"，
   * 卡片会被整体记低十几到几十像素 → 淡出提前、还没到浮岛就已经半透明
   * （2026-11-22 实测：静止时最后一张卡本该 opacity 1，量出来 0.73）。
   * offsetTop/offsetHeight 读的是布局盒，不受 transform 影响。
   */
  function posIn(el, box) {
    let y = 0
    let node = el
    while (node && node !== box) {
      y += node.offsetTop
      node = node.offsetParent
    }
    return node === box ? y : null   // 走不到容器（offsetParent 链断了）→ 交给兜底
  }

  /** 量一次静态几何：卡片在滚动内容里的位置、容器高度、浮岛上沿到容器底的距离 */
  function measure() {
    const root = rootRef.value
    if (!root) return
    const box = root.closest('.page-sheet') || root.parentElement
    if (!box) return
    scroller = box
    viewH = box.clientHeight

    // 浮岛上沿：量真实元素，不用读 --nav-zone（那是个 calc 字符串，取计算值不可靠）
    const dock = document.querySelector('.nav-dock')
    span = dock
      ? Math.max(1, box.getBoundingClientRect().bottom - dock.getBoundingClientRect().top)
      : FALLBACK_SPAN

    cards = [...root.querySelectorAll('.data-card')].map((el) => {
      const top = posIn(el, box)
      const r = el.getBoundingClientRect()
      return {
        el,
        // 拿不到布局坐标时退回 rect（接受那一帧的动画误差，总比不淡好）
        top: top === null ? r.top - box.getBoundingClientRect().top + box.scrollTop : top,
        height: el.offsetHeight || r.height,
        last: -1
      }
    })
  }

  /** 按当前滚动位置给每张卡算透明度；只在变化 ≥1% 时写样式 */
  function paint() {
    if (!scroller) return
    const st = scroller.scrollTop
    const fadeEnd = viewH      // 卡的下边缘到这里 = 全透明
    // 淡出带 = [fadeEnd - span, fadeEnd]：浮岛上沿开始变淡，到容器底部归零

    for (const c of cards) {
      const bottom = c.top + c.height - st
      const t = (fadeEnd - bottom) / span
      const opacity = t <= 0 ? 0 : t >= 1 ? 1 : t

      if (Math.abs(opacity - c.last) > 0.01) {
        c.el.style.opacity = opacity.toFixed(2)
        // 全透明的卡不该还能点（浮岛两侧的空白处会露出来）
        c.el.style.pointerEvents = opacity < 0.2 ? 'none' : ''
        c.last = opacity
      }
    }
  }

  function onScroll() {
    if (raf) return
    raf = requestAnimationFrame(() => { raf = 0; paint() })
  }

  /** 外部可以调：列表重新渲染 / 尺寸变化后重算 */
  function refresh() {
    measure()
    paint()
  }

  function bind() {
    if (!scroller) return
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', refresh)
  }

  function unbind() {
    if (scroller) scroller.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', refresh)
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
  }

  onMounted(async () => {
    await nextTick()
    measure()
    bind()
    paint()
  })

  // 列表内容变了（搜索 / 新建 / 删除）→ 位置全变了，重量一遍
  watch(items, async () => {
    await nextTick()
    refresh()
  }, { flush: 'post' })

  onBeforeUnmount(() => {
    unbind()
    // 别把内联透明度带走：卡片可能被复用，留着会让新列表凭空半透明
    cards.forEach((c) => { c.el.style.opacity = ''; c.el.style.pointerEvents = '' })
    cards = []
  })

  return { refresh }
}
