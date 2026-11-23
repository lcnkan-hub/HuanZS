/**
 * 卡片展开 / 收起的共享元素转场（2026-11-23）
 *
 * 一句话：点卡片时，**卡片里的东西自己走到详情页的落点上去**，不是整块白板盖上来。
 *   · 壳（白底 + 圆角 + 卡片阴影）从卡片矩形长到详情面板矩形；
 *   · 照片从卡片封面矩形平移到详情图区矩形 —— 两端宽高相同，所以只是平移；
 *   · 文字块从卡片文字矩形平移到正文矩形 —— 宽度与字号都相同，所以一个字都不重排；
 *   · 详情页的真内容在最后 60ms 淡入（顶栏 / 底栏再晚 10ms，且带 8~10px 上移）。
 *
 * 为什么用 Web Animations API 而不是自己算 rAF：
 *   rAF 回调拿到的时间戳是**帧开始**时间，可能早于起跑时刻，第一帧 dt 会算成负数；
 *   标签页被节流时更难对齐。实测踩过「位置一格不动、最后却瞬间跳到终点、浮层还不回收」。
 *   WAAPI 由浏览器管时间轴，`finished` 还能 await，收尾时机是确定的。
 *
 * 为什么不用 View Transitions API：
 *   它把整页做快照、动画期间无法交互，还要求目标先卸载再挂载 —— 我们详情 sheet 是常驻
 *   DOM，用它反而要踩「列表重建 → 入场动画重播」那条禁令。
 *
 * 为什么数值要「两端逐像素相等」：
 *   不等就会在动画里变形（图被放大 / 文字重新折行）。相等之后 keyframes 的 width/height
 *   两端是同一个值、插值恒定 —— 这就是「主页多大点开就多大」的实现依据，不是调参调出来的。
 *
 * 打断的取捨：动画期间浮层 `pointer-events: none`、详情真内容也不收点击，360ms 内点不了
 *   任何东西。iOS 的 zoom 基本也这样；真要「边飞边能点」得把浮层拆成可点区域，
 *   代价大收益小，先把 360ms 做稳。
 */
import { ref, onBeforeUnmount } from 'vue'

const DUR_OPEN  = 360
const DUR_CLOSE = 280
/** 打开：前段有响应、中段持续变化、尾段收住（实测比 .32/.72 均匀得多） */
const EASE_OPEN  = 'cubic-bezier(0.25, 0.1, 0.15, 1)'
/** 收起：直接加速离场，不做回弹 —— 用户已经在往回走了，别拖 */
const EASE_CLOSE = 'cubic-bezier(0.4, 0, 0.85, 1)'

const HANDOVER = 300      // 内容换手的起跑时刻（ms）

export function useCardZoom() {
  /** 是否正在跑（界面可据此禁用点击） */
  const running = ref(false)

  let host = null
  let shell = null
  let photo = null
  let text = null
  let anims = []

  function build() {
    if (host) return
    host = document.createElement('div')
    host.id = 'hz-zoom-layer'
    host.style.cssText =
      'position:fixed;inset:0;z-index:150;pointer-events:none;overflow:hidden;' +
      'contain:layout paint style;'
    shell = document.createElement('div')
    shell.style.cssText =
      'position:absolute;pointer-events:none;background:var(--color-bg-card);'
    photo = document.createElement('img')
    photo.style.cssText =
      'position:absolute;pointer-events:none;object-fit:cover;display:none;border-radius:var(--radius-2xl);'
    text = document.createElement('div')
    text.style.cssText =
      'position:absolute;pointer-events:none;overflow:hidden;color:var(--color-text-primary);'
    host.appendChild(shell)
    host.appendChild(photo)
    host.appendChild(text)
    document.body.appendChild(host)
  }

  function cancelAnims() {
    anims.forEach((a) => { try { a.cancel() } catch { /* 已结束的动画 cancel 会抛，忽略 */ } })
    anims = []
  }

  function teardown() {
    cancelAnims()
    if (host && host.parentNode) host.parentNode.removeChild(host)
    host = null; shell = null; photo = null; text = null
  }

  /** 副本内容：照片地址 + 卡片那段文字的 HTML（与卡片同字号同行高，交接时不跳字） */
  function setupContent(payload) {
    const hasPhoto = !!(payload.src.photo && payload.dst.photo)
    const hasText = !!(payload.src.text && payload.dst.text)

    photo.style.display = hasPhoto ? 'block' : 'none'
    if (hasPhoto) photo.src = payload.photoUrl || ''

    text.style.display = hasText ? 'block' : 'none'
    if (hasText) text.innerHTML = payload.textHtml || ''
  }

  const box = (r) => ({
    left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px'
  })

  async function open(payload) {
    const { src, dst } = payload
    build()
    setupContent(payload)
    running.value = true
    cancelAnims()

    const o = { duration: DUR_OPEN, easing: EASE_OPEN, fill: 'both' }

    anims.push(shell.animate([
      { ...box(src.sheet), borderRadius: 'var(--radius-2xl)', boxShadow: '0 2px 8px rgba(0,0,0,.04)' },
      { ...box(dst.sheet), borderRadius: '0px', boxShadow: '0 0 0 rgba(0,0,0,0)' }
    ], o))

    if (photo.style.display !== 'none') {
      anims.push(photo.animate([
        { ...box(src.photo) },
        { ...box(dst.photo) }
      ], o))
      // 最后 45ms 把图交还给详情页的真图（位置一致，接不上缝）
      anims.push(photo.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 45, delay: HANDOVER + 15, fill: 'both', easing: 'linear' }
      ))
    }

    if (text.style.display !== 'none') {
      anims.push(text.animate([
        { ...box(src.text) },
        // 高度到站后放开：卡片上只露两行，详情页要露出更多行（overflow:hidden 负责裁）
        { ...box(dst.text) }
      ], o))
      anims.push(text.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 50, delay: HANDOVER, fill: 'both', easing: 'linear' }
      ))
    }

    // 详情真内容接手
    if (payload.inner) {
      anims.push(payload.inner.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 60, delay: HANDOVER, fill: 'both', easing: 'linear' }
      ))
    }
    // 功能层：再晚 10ms，并带一点上移 —— 用户要求「铺满之后才出现」
    if (payload.header) {
      anims.push(payload.header.animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0px)' }],
        { duration: 70, delay: HANDOVER - 10, fill: 'both', easing: 'ease-out' }
      ))
    }
    if (payload.bar) {
      anims.push(payload.bar.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0px)' }],
        { duration: 70, delay: HANDOVER - 10, fill: 'both', easing: 'ease-out' }
      ))
    }

    await Promise.all(anims.map((a) => a.finished.catch(() => {})))

    // 收尾：把「动画终值」写成内联再拆浮层 —— 否则拆的瞬间内容会闪一下
    if (payload.inner) payload.inner.style.opacity = '1'
    running.value = false
    teardown()
  }

  async function close(payload) {
    const { src, dst } = payload
    build()
    setupContent(payload)
    running.value = true
    cancelAnims()

    const o = { duration: DUR_CLOSE, easing: EASE_CLOSE, fill: 'both' }
    // 起点是「铺满」（dst），终点是「卡片」（src）—— 与打开完全反向
    anims.push(shell.animate([
      { ...box(dst.sheet), borderRadius: '0px' },
      { ...box(src.sheet), borderRadius: 'var(--radius-2xl)' }
    ], o))

    if (photo.style.display !== 'none') {
      anims.push(photo.animate([{ ...box(dst.photo) }, { ...box(src.photo) }], o))
    }
    if (text.style.display !== 'none') {
      anims.push(text.animate([{ ...box(dst.text) }, { ...box(src.text) }], o))
    }

    // 真内容先退：否则会看到它跟着一起缩，读成「整页在缩」而不是「卡片在缩」
    if (payload.inner) {
      anims.push(payload.inner.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 80, fill: 'both', easing: 'linear' }
      ))
    }

    await Promise.all(anims.map((a) => a.finished.catch(() => {})))

    if (payload.inner) payload.inner.style.opacity = '0'
    running.value = false
    teardown()
  }

  onBeforeUnmount(teardown)

  return { running, open, close }
}
