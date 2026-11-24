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

/** 详情端：壳 = 整块 sheet；照片 = 单图那个 cell；文字 = 正文首行的 strong */
export function readDetailRects(sheetEl) {
  if (!sheetEl) return null
  const rs = rectOf(sheetEl)
  if (!rs) return null

  const cells = sheetEl.querySelectorAll('.photo-grid .cell')
  const single = cells.length === 1 ? rectOf(cells[0]) : null

  const strong = sheetEl.querySelector('.body-read strong')
  const bodyRead = sheetEl.querySelector('.body-read') || sheetEl.querySelector('.body-placeholder')
  const bodyRect = rectOf(bodyRead)
  const strongRect = rectOf(strong)
  /**
   * 文字副本的落点：**宽度取正文容器，不能取 strong**。
   * `<strong>` 是行内元素，它的 rect 宽度只有那三五个字（实测 51px）——
   * 照它当终点，文字副本会一路被挤窄、整段重新折行，看到的正好是「文字在变形」。
   * 高度也取正的容器高度（至少 140），否则到站时只剩一行。
   */
  const text = strongRect && bodyRect
    ? { l: bodyRect.l, t: strongRect.t, w: bodyRect.w, h: Math.max(bodyRect.h, 140) }
    : bodyRect
      ? { l: bodyRect.l, t: bodyRect.t, w: bodyRect.w, h: Math.max(bodyRect.h, 140) }
      : null

  return {
    sheet: rs,
    photo: single,
    text,
    // 文字块到站后要放开成的高度（露出更多行）—— 取正文真实高度，至少 120
    textTo: Math.max(120, bodyRect ? bodyRect.h : 120),
    // 内容层与功能层：动画最后 60ms 由它们接手
    inner: sheetEl.querySelector('.detail-page-wrapper'),
    header: sheetEl.querySelector('.detail-header'),
    bar: sheetEl.querySelector('.detail-toolbar'),
    page: sheetEl
  }
}

/** 把卡片文字两段拼成一份 HTML 给浮层副本用（跟卡片同样的字号/行高，避免交接时跳字） */
export function cardTextHtml(cardEl) {
  if (!cardEl) return ''
  const lead = cardEl.querySelector('.card-lead .lead-text')
  const body = cardEl.querySelector('.card-body')
  const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const head = lead ? `<div style="font-size:17px;font-weight:650;line-height:1.45;letter-spacing:-0.01em">${esc(lead.textContent)}</div>` : ''
  const tail = body ? `<div style="font-size:17px;line-height:1.55;margin-top:2px">${esc(body.textContent)}</div>` : ''
  return head + tail
}
