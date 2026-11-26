/**
 * 取「卡片 ↔ 详情」两端的矩形（2026-11-23 共享元素转场专用）
 *
 * 职责：只做测量，不碰状态、不改样式。动画层（useCardZoom）拿它算插值。
 * 边界：量不到就返回 null —— 调用方据此**退回无动画**，不能拿一个假矩形硬跑。
 *
 * 为什么单图才给 photo：
 *   多图详情是一整块拼图（2×2、左一大…），跟卡片封面的比例没有对应关系。
 *   硬 morph 会看到图片被拉伸/裁切。规格（用户 2026-11-23）是：多图整体淡出、整体淡入。
 *
 * 为什么文字取「加粗首行」而不是整个正文：
 *   卡片上看到的是「首行 + 前两行」，详情是全文。让整块文字飞过去，会带着后面几百字一起
 *   缩放；取首行作为锚点，剩下的一次性接手，眼睛只需要跟住那一行。
 */

function rectOf(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return null
  return { l: r.left, t: r.top, w: r.width, h: r.height }
}

/** 卡片端：壳 = 整张卡；照片 = 封面；文字 = 首行 + 预览合并那块 */
export function readCardRects(cardEl) {
  if (!cardEl) return null
  const rc = rectOf(cardEl)
  if (!rc) return null

  const cover = rectOf(cardEl.querySelector('.card-cover'))
  const leadEl = cardEl.querySelector('.card-lead')
  const bodyEl = cardEl.querySelector('.card-body')
  const lead = rectOf(leadEl)
  const body = rectOf(bodyEl)

  let text = null
  if (lead || body) {
    const top = (lead || body).t
    const bottom = body ? body.t + body.h : lead.t + lead.h
    text = {
      l: Math.min((lead || body).l, (body || lead).l),
      t: top,
      w: Math.max((lead || body).w, (body || lead).w),
      h: Math.max(1, bottom - top)
    }
  }

  return {
    sheet: rc,
    // 单图的封面才参与 morph；多图时卡片只显示第一张 + 角标，形状跟详情拼图对不上
    photo: cover,
    text
  }
}

/**
 * 正文**开头那一行**的加粗（没有就返回 null）。
 *
 * 2026-11-25 修「点卡片后正文开头往下飞」：
 *   原来直接 `querySelector('.body-read strong')` —— 取的是正文里**第一个**加粗，
 *   默认"加粗 = 开头那行标题"。可旧数据的标题存在 name 字段里（正文开头没加粗），
 *   或者长文里中途才出现 `**重点**`，这时第一个加粗在正文深处（实测 y=870），
 *   文字副本就会从卡片一路飞向那个位置 —— 用户看到的正是"正文开头被拽到下面去了"。
 *   判据改成"离正文容器顶部 6px 以内才算开头"，取不到就退回正文容器本身（落点正确、不飞歪）。
 */
function openingStrong(bodyRead) {
  const strong = bodyRead.querySelector('strong')
  if (!strong) return null
  const bodyTop = bodyRead.getBoundingClientRect().top
  const strongTop = strong.getBoundingClientRect().top
  return strongTop - bodyTop <= 6 ? strong : null
}

/** 详情端：壳 = 整块 sheet；照片 = 单图那个 cell；文字 = 正文首行的 strong */
export function readDetailRects(sheetEl) {
  if (!sheetEl) return null
  const rs = rectOf(sheetEl)
  if (!rs) return null

  const cells = sheetEl.querySelectorAll('.photo-grid .cell')
  const single = cells.length === 1 ? rectOf(cells[0]) : null

  const bodyRead = sheetEl.querySelector('.body-read') || sheetEl.querySelector('.body-placeholder')
  const strong = bodyRead && bodyRead.classList.contains('body-read') ? openingStrong(bodyRead) : null
  const bodyRect = rectOf(bodyRead)
  const strongRect = rectOf(strong)
  /**
   * 文字副本的落点：**宽度取正文容器，不能取 strong**。
   * `<strong>` 是行内元素，它的 rect 宽度只有那三五个字（实测 51px）——
   * 照它当终点，文字副本会一路被挤窄、整段重新折行，看到的正好是「文字在变形」。
   * 高度也取正的容器高度（至少 140），否则到站时只剩一行。
   */
  /**
   * 落点 top 用**段落（行盒）顶**，不是 strong 的 rect 顶（2026-11-25）。
   * strong 是行内元素，它的 rect 是**文字**的边界；副本容器里第一个 div 的 top 是**行盒**顶。
   * 两者差半个行距（29.75−17)/2 ≈ 6.4px —— 行高改成 1.75 之后这 6.4px 会变成可见的下沉，
   * 反而比原来更明显。p 是块元素，它的 top 就是第一个行盒的顶，直接用它。
   */
  const firstP = bodyRead ? bodyRead.querySelector('p') : null
  const lineTop = firstP ? firstP.getBoundingClientRect().top : (strongRect ? strongRect.t : null)
  const text = lineTop !== null && bodyRect
    ? { l: bodyRect.l, t: lineTop, w: bodyRect.w, h: Math.max(bodyRect.h, 140) }
    : bodyRect
      ? { l: bodyRect.l, t: bodyRect.t, w: bodyRect.w, h: Math.max(bodyRect.h, 140) }
      : null

  /**
   * 文字副本在终点要长成的样子（2026-11-25，配套 cardTextHtml 的插值）：
   * 这些值全从真 DOM 量，不写死 —— 以后正文行高或段落间距一改，副本自动跟上，
   * 不用再回来改第二份数字（同一个数字存两处，就是"文字对不齐"那类 bug 的温床）。
   */
  let textStyle = null
  if (bodyRead) {
    const bs = getComputedStyle(bodyRead)
    const fsPx = parseFloat(bs.fontSize) || 17
    const lhPx = parseFloat(bs.lineHeight)
    const p1 = bodyRead.querySelector('p')
    const p2 = p1 && p1.nextElementSibling
    textStyle = {
      // 行高存倍数（1.75），不存 px —— 副本容器会缩放，px 值跟着字号一起被拉长
      lh: lhPx > 0 && fsPx > 0 ? lhPx / fsPx : 1.75,
      weight: strong ? (parseFloat(getComputedStyle(strong).fontWeight) || 700) : 700,
      // 段与段之间的空隙：卡片上是 2px，详情里是一个 p 的 margin（16px）
      gap: p2 ? Math.max(0, p2.getBoundingClientRect().top - p1.getBoundingClientRect().bottom) : 0
    }
  }

  return {
    sheet: rs,
    photo: single,
    text,
    textStyle,
    // 文字块到站后要放开成的高度（露出更多行）—— 取正文真实高度，至少 120
    textTo: Math.max(120, bodyRect ? bodyRect.h : 120),
    // 内容层与功能层：动画最后 60ms 由它们接手
    inner: sheetEl.querySelector('.detail-page-wrapper'),
    header: sheetEl.querySelector('.detail-header'),
    bar: sheetEl.querySelector('.detail-toolbar'),
    page: sheetEl
  }
}

/**
 * 起点那一块的圆角（壳从它长出去，第一帧必须跟它同一个形状）。
 * 卡片是 14px；右下角那颗 ＋ 钮写的是 50%，`getComputedStyle` 会把 "50%" 原样吐回来 ——
 * 这时按"圆"算（取短边的一半），否则会当成 50px 的圆角方块。
 */
export function readOriginRadius(el) {
  if (!el) return 14
  try {
    const raw = getComputedStyle(el).borderTopLeftRadius || '0px'
    if (raw.indexOf('%') !== -1) {
      const r = el.getBoundingClientRect()
      return Math.min(r.width, r.height) / 2
    }
    const n = parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? n : 14
  } catch {
    return 14
  }
}

/**
 * 把卡片文字两段拼成一份 HTML 给浮层副本用。
 *
 * 2026-11-25 修「展开完毕时文字闪一下」：
 *   副本原来把行高**写死成卡片的值**（标题 1.45、正文 1.55），可详情页正文是 **1.75**。
 *   实测（点卡片刻 39 帧采样）：首行 top 与真内容严丝合缝（Δ=0），
 *   **第二行起每行偏 5.2px** —— 交接那一帧文字整体往下跳，就是用户看到的那一闪。
 *   同一个坑还有两处：标题字重 650（详情里 <strong> 是默认 700）、段距 2px（详情 p 之间 16px）。
 *
 *   修法不是「改成详情值」——那会让第一帧和卡片自己的文字错位、起点先闪一下。
 *   真正对的做法是**随进度插值**：起点用卡片值，终点用详情值，中间连续。
 *   所以这里只留 class，数值交给 useCardZoom 每帧按 q 算（见 applyTextMetrics）。
 */
export function cardTextHtml(cardEl) {
  if (!cardEl) return ''
  const lead = cardEl.querySelector('.card-lead .lead-text')
  const body = cardEl.querySelector('.card-body')
  const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const head = lead ? `<div class="zt-lead" style="font-size:17px;font-weight:650;line-height:1.45;letter-spacing:-0.01em">${esc(lead.textContent)}</div>` : ''
  const tail = body ? `<div class="zt-body" style="font-size:17px;line-height:1.55;margin-top:2px">${esc(body.textContent)}</div>` : ''
  return head + tail
}
