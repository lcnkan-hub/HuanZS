/**
 * 卡片 / ＋钮 → 详情 的形变转场（2026-11-25 重写：弹簧进度 + 裁剪窗口）
 *
 * 一句话：起点那一块**自己长成整页**，圆角一路化到 0；过程中点一下能掉头。
 *
 * 为什么重写（旧版是 WAAPI 一次性 440ms）：
 *   1. 旧版的时长和曲线是写死的采样，跑到一半不能改主意。用户要的参考稿（circle-morph.html）
 *      是**进度驱动**：p 由弹簧积分算出来，手指/点击随时能把它按回去。这一条只有自己算帧才做得到。
 *   2. 旧版每帧写 shell 的 width/height **和 box-shadow**，还在给文字副本改宽度 ——
 *      前者每帧重新排版+重绘一整屏，后者每帧让一段长文重新折行。这都是主线程上的活，
 *      手机上必掉帧。现在：壳只改 clip-path（只影响绘制，不动布局），
 *      图片和文字副本只改 transform（合成器直接接），文字宽度**一次都不改**。
 *
 * 形状：壳是"铺满整屏的一张纸"，靠 `clip-path: inset(… round …)` 裁成当前大小 ——
 *   于是"长大"不需要改元素尺寸，也就没有排版。第一帧的裁剪矩形和圆角由起点元素量出来
 *   （卡片 14px / ＋钮 50%），所以它和起点严丝合缝。
 *
 * 顺序（层位没变）：列表 → 壳（z 0）→ 详情真内容（z 1）。
 *   壳下面那层永远比详情页低一层，所以真内容淡入时是"盖在壳上"，不会闪。
 *
 * ⚠️ 这里所有 DOM 查询与 rAF 时序都是量出来的，别顺手改成 ref / nextTick —— 转场的坑全是时序坑。
 */
import { ref, onBeforeUnmount } from 'vue'

/**
 * 弹簧参数（与参考稿同源：RESPONSE 0.5s）。
 *   · 打开 ζ0.86 → 约 3.5% 过冲：东西"弹"出来，落点有一点回弹才像有质量；
 *   · 收起 ζ1.00 → 不过冲：往回走时弹一下会被读成"没关掉"。
 * 方程：p'' = -k(p - target) - c·p'，k=(2π/R)², c=2ζ√k；每帧 4 个子步长，保证数值稳定。
 */
const OPEN  = { response: 0.50, damping: 0.86 }
const CLOSE = { response: 0.50, damping: 1.00 }

/** 进度到这儿，详情页真内容才开始显形（之前一直是壳自己的颜色） */
const FADE_IN_AT = 0.78

/** 壳的颜色：卡片长出来是卡片的白，＋钮长出来是酒红 —— "形状带着起点的颜色" */
export const SHELL_CARD = 'var(--color-bg-card)'
/**
 * ＋钮长出来的壳（2026-11-25 改）：必须是 **--color-accent-solid**，不是 --color-accent。
 * 钮的底色就是 solid（夜里 #B4436A），而 accent 夜里是亮玫瑰 #E08BA6 ——
 * 差一倍亮度，点下去第一帧就跳色，然后一整屏荧光粉铺开。
 * 这条令牌自己的注释就写着「亮玫瑰只配做文字，大面积填充用 solid」，
 * 而壳恰好是最大面积的那块填充。 */
export const SHELL_FAB  = 'var(--color-accent-solid)'

function prefersReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function useCardZoom() {
  /** 是否正在跑（界面可据此禁用点击；转场期间另有一层"点一下就掉头"的接收层） */
  const running = ref(false)

  let host = null
  let shell = null
  let wash = null
  let photo = null
  let text = null
  /** 副本里的两段 + 终点排版（2026-11-25）：见 applyTextMetrics */
  let textLead = null
  let textBody = null
  let textStyle = null
  let catcher = null

  let payload = null
  let src = null
  let dst = null
  let srcRadius = 14

  let p = 0
  let v = 0
  let target = 0
  let raf = 0
  let last = 0
  let vw = 0
  let vh = 0

  let contentOn = false
  let textWidthAnimates = false

  let runPromise = null
  let resolveRun = null

  // ---------- 构建浮层 ----------

  function build(shellColor) {
    if (host) { shell.style.background = shellColor; if (wash) wash.style.opacity = '0'; return }
    host = document.createElement('div')
    host.id = 'hz-zoom-layer'
    /**
     * ⚠ 挂载位置是这套东西最要紧的一行（2026-11-23 修「闪烁」）：
     * 必须插进 `.page-stack`、在详情 sheet 之前，并且 `z-index: 0` ——
     * 于是分层正好是：列表 → 壳 → 详情内容。壳挂在 body 上会盖住详情内容，内容看起来是"跳出来"的。
     */
    host.style.cssText =
      'position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;' +
      'contain:layout paint style;'
    shell = document.createElement('div')
    shell.style.cssText =
      'position:absolute;inset:0;pointer-events:none;background:' + shellColor
    /**
     * 洗层（2026-11-25）：铺一整套详情页的纸底 + 画布纹理，默认透明，
     * 尾段按进度淡入，把「起点色」洗成「终点色」。
     * 为什么需要它：壳是**纯色块**，长满整屏后 teardown 直接移除 ——
     * 从整屏酒红一刀切到纸面，白天也是割裂的（不只是夜里的跳色）。
     * 有了这一层，落定时壳和页面已经同色，拆掉的是一块看不见的东西。
     * 层位在 shell 之上、photo/text 之下 —— 只洗壳的底色，不盖内容副本。
     */
    wash = document.createElement('div')
    wash.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;' +
      'background-color:var(--color-bg-primary);background-image:var(--page-canvas-image);'
    photo = document.createElement('img')
    photo.style.cssText =
      'position:absolute;pointer-events:none;object-fit:cover;display:none;' +
      'border-radius:var(--radius-2xl);transform-origin:0 0;'
    text = document.createElement('div')
    text.style.cssText =
      'position:absolute;pointer-events:none;overflow:hidden;' +
      'color:var(--color-text-primary);transform-origin:0 0;'
    host.appendChild(shell)
    host.appendChild(wash)
    host.appendChild(photo)
    host.appendChild(text)

    const stack = document.querySelector('.page-stack')
    const detailSheet = stack && stack.querySelector('.detail-sheet')
    if (stack && detailSheet) stack.insertBefore(host, detailSheet)
    else document.body.appendChild(host)
  }

  /**
   * 转场期间的"点一下就掉头"接收层。
   * 必须有：转场跑着的时候详情页自己不吃点击（pointer-events 在 sheet 上），
   * 没有这一层，用户中途想反悔只能等它跑完。它盖在详情页上面（z 5），
   * 但只活到动画落定 —— 落定就摘掉，正文立刻可以点。
   */
  function showCatcher() {
    if (!payload || typeof payload.onTap !== 'function') return
    if (!catcher) catcher = document.createElement('div')
    catcher.id = 'hz-zoom-catcher'
    catcher.style.cssText = 'position:fixed;inset:0;z-index:5;background:transparent;'
    catcher.dataset.fired = ''
    if (!catcher.__wired) {
      catcher.__wired = true
      catcher.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (catcher && catcher.dataset.fired === '1') return
        if (catcher) catcher.dataset.fired = '1'
        const fn = payload && payload.onTap
        if (fn) fn()
      }, { passive: false })
    }
    const stack = document.querySelector('.page-stack')
    ;(stack || document.body).appendChild(catcher)
  }

  function hideCatcher() {
    if (catcher && catcher.parentNode) catcher.parentNode.removeChild(catcher)
  }

  // ---------- 每一帧 ----------

  function render() {
    if (!src || !dst || !shell) return
    const q = Math.max(0, p)

    // 壳：裁剪窗口从左上的起点矩形长到**详情面板的矩形**（不是 window 尺寸）——
    // 详情面板在刘海机上从安全区下沿起算，长到 0 会多盖一截状态栏区域。
    // 超出屏幕的部分夹住：过冲（ζ0.86 会冲到 1.03）时 inset 会变成负数，而负 inset 是非法值，
    // 整条声明会被丢掉，屏幕上就是"壳突然铺满"。
    const s = src.sheet
    const d = dst.sheet
    const l = s.l + (d.l - s.l) * q
    const t = s.t + (d.t - s.t) * q
    const w = s.w + (d.w - s.w) * q
    const h = s.h + (d.h - s.h) * q
    const top = Math.max(0, Math.min(t, vh))
    const left = Math.max(0, Math.min(l, vw))
    const right = Math.max(0, vw - (l + w))
    const bottom = Math.max(0, vh - (t + h))
    const rad = Math.max(0, srcRadius * (1 - q))
    const clip = 'inset(' + top + 'px ' + right + 'px ' + bottom + 'px ' + left + 'px round ' + rad + 'px)'
    shell.style.clipPath = clip
    shell.style.webkitClipPath = clip
    if (wash) {
      wash.style.clipPath = clip
      wash.style.webkitClipPath = clip
      // p 0.82 → 1 之间洗完。弹簧尾段本身慢，这 18% 大约占 60~90ms，够看出"化过去"
      wash.style.opacity = String(Math.max(0, Math.min(1, (q - 0.82) / 0.18)))
    }

    if (photo.style.display !== 'none' && src.photo && dst.photo) {
      const a = src.photo
      const b = dst.photo
      const sx = a.w ? b.w / a.w : 1
      const sy = a.h ? b.h / a.h : 1
      photo.style.transform =
        'translate3d(' + ((b.l - a.l) * q) + 'px,' + ((b.t - a.t) * q) + 'px,0) ' +
        'scale(' + (1 + (sx - 1) * q) + ',' + (1 + (sy - 1) * q) + ')'
    }

    applyTextMetrics(q)
    if (text.style.display !== 'none' && src.text && dst.text) {
      const a = src.text
      const b = dst.text
      text.style.transform =
        'translate3d(' + ((b.l - a.l) * q) + 'px,' + ((b.t - a.t) * q) + 'px,0)'
      // 高度只影响这一块的裁剪，不触发内部折行（宽度不动）
      text.style.height = (a.h + (b.h - a.h) * q) + 'px'
      if (textWidthAnimates) text.style.width = (a.w + (b.w - a.w) * q) + 'px'
      /**
       * 尾段让副本淡出（2026-11-25）。
       * 行高改成随进度插值之后，落点仍差约 1.8px（浏览器给行内框算的高度不是 font-size，
       * 没法从 CSS 里精确反推）。与其去猜那 1.8px，不如让它**在透明度里消失** ——
       * 副本是从 q=0.86 开始让位，正好接上真内容 120ms 的淡入，两边都半透明地交叉，
       * 眼睛看到的是"显影"，不是"跳一下"。teardown 那一刻副本已经是 0，拆什么都看不见。
       */
      text.style.opacity = String(1 - Math.max(0, Math.min(1, (q - 0.86) / 0.14)))
    }
  }

  function tick(now) {
    raf = 0
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016)
    last = now

    const cfg = target === 1 ? OPEN : CLOSE
    const k = Math.pow((2 * Math.PI) / cfg.response, 2)
    const c = 2 * cfg.damping * Math.sqrt(k)
    const n = 4
    const step = dt / n
    for (let i = 0; i < n; i++) {
      const a = -k * (p - target) - c * v
      v += a * step
      p += v * step
    }

    if (target === 1 && !contentOn && p >= FADE_IN_AT) {
      contentOn = true
      showContent()
    }
    render()

    if (Math.abs(p - target) < 0.0015 && Math.abs(v) < 0.02) {
      p = target
      v = 0
      render()
      finish()
      return
    }
    raf = requestAnimationFrame(tick)
  }

  function startRun() {
    if (raf) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function stopRun() {
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
  }

  // ---------- 内容交接（不逐帧写，交给一段短过渡） ----------

  function resetContent() {
    const pl = payload || {}
    if (pl.inner) {
      pl.inner.style.transition = 'none'
      pl.inner.style.opacity = '0'
    }
    if (pl.header) {
      pl.header.style.transition = 'none'
      pl.header.style.opacity = '0'
      pl.header.style.transform = 'translateY(8px)'
    }
    if (pl.bar) {
      pl.bar.style.transition = 'none'
      pl.bar.style.opacity = '0'
      pl.bar.style.transform = 'translateY(10px)'
    }
  }

  function showContent() {
    const pl = payload || {}
    if (pl.inner) {
      pl.inner.style.transition = 'opacity 120ms linear'
      pl.inner.style.opacity = '1'
    }
    if (pl.header) {
      pl.header.style.transition = 'opacity 90ms ease-out, transform 90ms ease-out'
      pl.header.style.opacity = '1'
      pl.header.style.transform = 'translateY(0)'
    }
    if (pl.bar) {
      pl.bar.style.transition = 'opacity 90ms ease-out, transform 90ms ease-out'
      pl.bar.style.opacity = '1'
      pl.bar.style.transform = 'translateY(0)'
    }
  }

  function hideContent() {
    const pl = payload || {}
    if (pl.inner) {
      pl.inner.style.transition = 'opacity 90ms linear'
      pl.inner.style.opacity = '0'
    }
    if (pl.header) {
      pl.header.style.transition = 'opacity 90ms linear'
      pl.header.style.opacity = '0'
    }
    if (pl.bar) {
      pl.bar.style.transition = 'opacity 90ms linear'
      pl.bar.style.opacity = '0'
    }
  }

  /** 落定后把动画期写进去的内联样式收回，免得干扰页面自己（详情页下次打开是新的元素，这里主要防同一页复用） */
  function clearChromeStyles() {
    const pl = payload || {}
    for (const el of [pl.header, pl.bar]) {
      if (!el) continue
      el.style.transition = 'none'
      el.style.removeProperty('opacity')
      el.style.removeProperty('transform')
    }
  }

  // ---------- 收尾 ----------

  /**
   * 副本排版随进度从「卡片的样子」过渡到「详情的样子」（2026-11-25）。
   *
   * 为什么必须插值、不能直接用详情值：
   *   起点要跟卡片自己的文字严丝合缝（行高 1.45/1.55、段距 2px、字重 650），
   *   终点要跟详情页对齐（行高 1.75、段距 16px、字重 700）。
   *   任选一头写死，另一头就错位 —— 而副本是透明的，错位会跟底层文字叠出重影，
   *   视觉上就是「闪了一下」。
   *
   * 代价：每帧改 line-height 会触发重排。副本只有卡片预览那两三行（不是全文），
   * 重排范围 = 这几十个字符，实测 60fps 不掉帧。
   */
  function applyTextMetrics(q) {
    if (!textStyle) return
    if (textLead) {
      textLead.style.lineHeight = (1.45 + (textStyle.lh - 1.45) * q).toFixed(3)
      textLead.style.fontWeight = String(Math.round(650 + (textStyle.weight - 650) * q))
    }
    if (textBody) {
      textBody.style.lineHeight = (1.55 + (textStyle.lh - 1.55) * q).toFixed(3)
      textBody.style.marginTop = (2 + (textStyle.gap - 2) * q).toFixed(1) + 'px'
    }
  }

  function teardown() {
    stopRun()
    hideCatcher()
    clearChromeStyles()
    if (!host) return
    // 先别拆 DOM：直接 removeChild 会让合成层当场销毁，低端机上就是「收尾闪一下」。
    const dead = host
    dead.style.opacity = '0'
    host = null; shell = null; wash = null; photo = null; text = null
    textLead = null; textBody = null; textStyle = null
    requestAnimationFrame(() => {
      if (dead.parentNode) dead.parentNode.removeChild(dead)
    })
  }

  function finish() {
    const at = target
    running.value = false
    hideCatcher()

    if (at === 1) {
      const pl = payload || {}
      if (pl.inner) {
        pl.inner.style.transition = 'none'
        pl.inner.style.opacity = '1'
      }
      clearChromeStyles()
    }
    teardown()

    const res = resolveRun
    resolveRun = null
    runPromise = null
    if (res) res(at)
  }

  function ensureRun() {
    if (!runPromise) runPromise = new Promise((res) => { resolveRun = res })
    return runPromise
  }

  // ---------- 对外 ----------

  /**
   * 打开：壳从 src 长成整屏，p 到 0.78 之后详情内容淡入。
   * @returns {Promise<number>} 落定时停在几（1=打开了，0=中途被点回去）
   */
  function open(pl) {
    if (running.value) return runPromise
    payload = pl
    src = pl.src
    dst = pl.dst
    srcRadius = Number.isFinite(pl.radius) ? pl.radius : 14
    textWidthAnimates = !!(src.text && dst.text && Math.abs(dst.text.w - src.text.w) > 0.5)

    build(pl.shell || SHELL_CARD)
    setupContent(pl)
    vw = window.innerWidth
    vh = window.innerHeight

    p = 0
    v = 0
    target = 1
    contentOn = false
    running.value = true
    resetContent()
    render()
    ensureRun()
    showCatcher()

    if (prefersReduced()) {
      p = 1
      render()
      contentOn = true
      showContent()
      // 让上面那两段短过渡先跑一帧再落定，避免"直接出现在终点却没有内容"
      requestAnimationFrame(() => finish())
      return runPromise
    }
    startRun()
    return runPromise
  }

  /**
   * 收起。**跑着的时候调用就是"掉头"**：不重量、不重置 p，只把目标翻成 0，
   * 弹簧从当前位置带着当前速度回去 —— 这就是参考稿那个"中途能反悔"。
   */
  function close(pl) {
    if (running.value) {
      // 掉头：页面这一层已经在场，只需要把内容压黑、把目标翻回去
      if (pl && pl.inner) payload = { ...payload, ...pl }
      target = 0
      hideContent()
      if (!raf) startRun()
      return runPromise
    }

    payload = pl
    src = pl.src
    dst = pl.dst
    srcRadius = Number.isFinite(pl.radius) ? pl.radius : 14
    textWidthAnimates = !!(src.text && dst.text && Math.abs(dst.text.w - src.text.w) > 0.5)

    build(pl.shell || SHELL_CARD)
    setupContent(pl)
    vw = window.innerWidth
    vh = window.innerHeight

    p = 1
    v = 0
    target = 0
    contentOn = false
    running.value = true
    // 注意：这里**不调用 resetContent**。收起时内容要先看得见，再淡出；
    // resetContent 是"清成透明"，用在这儿会让详情页在 0ms 内整个消失（看着像闪了一下）。
    hideContent()
    render()
    hideCatcher()
    ensureRun()

    if (prefersReduced()) {
      p = 0
      render()
      requestAnimationFrame(() => finish())
      return runPromise
    }
    startRun()
    return runPromise
  }

  /** 副本内容：照片地址 + 卡片那段文字的 HTML（与卡片同字号同行高，交接时不跳字） */
  function setupContent(pl) {
    const hasPhoto = !!(pl.src.photo && pl.dst.photo)
    const hasText = !!(pl.src.text && pl.dst.text)
    const a = pl.src

    photo.style.display = hasPhoto ? 'block' : 'none'
    if (hasPhoto) {
      photo.src = pl.photoUrl || ''
      photo.style.left = a.photo.l + 'px'
      photo.style.top = a.photo.t + 'px'
      photo.style.width = a.photo.w + 'px'
      photo.style.height = a.photo.h + 'px'
      photo.style.transform = 'none'
    }

    text.style.display = hasText ? 'block' : 'none'
    if (hasText) {
      text.innerHTML = pl.textHtml || ''
      textLead = text.querySelector('.zt-lead')
      textBody = text.querySelector('.zt-body')
      textStyle = pl.dst.textStyle || null
      text.style.left = a.text.l + 'px'
      text.style.top = a.text.t + 'px'
      text.style.width = a.text.w + 'px'
      text.style.height = a.text.h + 'px'
      text.style.transform = 'none'
    }
  }

  onBeforeUnmount(teardown)

  return { running, open, close, teardown }
}
