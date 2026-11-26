/**
 * 卡片 ↔ 详情 的转场机械（2026-11-24 从 App.vue 抽出，**纯搬家、逻辑未改**）
 *
 * 为什么抽：App.vue 675 行里有 200 行是这一套「量矩形 → 让卡片长成整屏 → 收回卡片」的细节，
 * 和登录门、Tab、通知混在一个 setup 里。抽出来之后 App.vue 只剩装配，这堆时序说明也有了安身之处。
 *
 * ⚠️ 这里的所有 DOM 查询、requestAnimationFrame 都**照原样**保留 —— 不换成 ref、
 *    不改执行顺序。转场的坑全是时序坑（量早了两帧就二次长大、量晚了布局已变），
 *    搬家时顺手"优化"最容易把稳的东西弄坏。
 *
 * 输入全部是 App.vue 持有的响应式对象/函数（通过参数传进来，不在这里 new），
 * 所以不存在两个实例各持一份状态的问题。
 *
 * @param {object} deps
 * @param {import('vue').Ref<object|null>} deps.openedItem       当前打开的记录（usePageRouter 提供）
 * @param {import('vue').Ref<string|null>} deps.pendingNewId     刚新建、还没写内容的记录 id
 * @param {object} deps.recordsApi                               useRecords() 的返回
 * @param {{open:Function, close:Function}} deps.zoom            useCardZoom() 的返回
 * @param {(item:object)=>void} deps.openDetail
 * @param {()=>void} deps.closeDetail
 * @param {import('vue').ComputedRef<string>} deps.profileName  新建记录时的 creator
 */
import { nextTick } from 'vue'
import { readCardRects, readDetailRects, cardTextHtml, readOriginRadius } from '../utils/cardZoomRects'
import { SHELL_CARD, SHELL_FAB } from './useCardZoom'

export function useDetailTransition({
  openedItem, pendingNewId, recordsApi, zoom, openDetail, closeDetail, profileName
}) {
  /**
   * 点卡片打开详情。
   *
   * 顺序不能反：**先记下卡片的矩形**（打开后列表会淡出、布局也会变），再 openDetail，
   * 等两帧让详情挂载、让 header 卸载带来的高度变化稳定下来，最后才量目标矩形。
   * 拿早了的矩形会让白块飞到半路「二次长大」（实测踩过：early 量到 y=316 的目标）。
   */
  async function handleOpenItem(item, cardEl) {
    const src = readCardRects(cardEl)
    const textHtml = cardTextHtml(cardEl)
    const photoUrl = cardEl?.querySelector('.card-cover img')?.src || ''

    openDetail(item)
    await nextTick()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

    const dst = readDetailRects(document.querySelector('.detail-sheet'))
    // 量不到（卡片没图 / 目标还没渲染完）→ 不做动画，详情页自己在那儿，不跳也不丢内容
    if (!src || !dst) return

    await zoom.open({
      src,
      dst,
      photoUrl,
      textHtml,
      textTo: dst.textTo,
      inner: dst.inner,
      header: dst.header,
      bar: dst.bar,
      radius: readOriginRadius(cardEl),
      shell: SHELL_CARD,
      // 跑到一半点一下 → 掉头回卡片（走的就是"返回"那条路，空记录回收等逻辑一并复用）
      onTap: () => closeDetailAndCleanup()
    })
  }

  /**
   * 点「记录」新建：**从那条横条本身长出来**，返回时也收回横条（2026-11-23）。
   *
   * 两件事要一起说清：
   * 1. **为什么先落库**：详情页的所有读写都依赖 openedItem.id 真实存在（正文保存、图片都是按 id 定位）；
   *    造一个"假条目"要把每个调用点都判空，改动面反而大。返回时若标题正文图片全空，
   *    dropIfEmpty 会把它删掉（见 closeDetailAndCleanup）。
   * 2. **为什么起点是横条**：新建的记录没有「用户点的那张卡」——列表里刚插进去的那张还是空的，
   *    而且返回时马上会被回收。用横条当起点，进出才对称：从哪儿发起，就回哪儿去。
   */
  async function handleCreateRecord() {
    const barEl = document.querySelector('.record-fab')
    const src = readCardRects(barEl)

    const item = recordsApi.addRecord('', profileName.value)
    pendingNewId.value = item.id
    openDetail(item)

    await nextTick()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const dst = readDetailRects(document.querySelector('.detail-sheet'))
    if (!src || !dst) return        // 量不到就让它直接出现，不硬跑一个没起点的动画

    await zoom.open({
      src,
      dst,
      photoUrl: '',
      textHtml: '',
      inner: dst.inner,
      header: dst.header,
      bar: dst.bar,
      // ＋钮是圆的：壳的第一帧必须也是那个圆，否则开头会是一个圆角方块
      radius: readOriginRadius(barEl),
      // 颜色跟着起点走：这颗钮是酒红的，长出去就是酒红
      shell: SHELL_FAB,
      onTap: () => closeDetailAndCleanup()
    })
  }

  /** 返回列表：先把详情缩回那张卡，再关；空记录在关完之后回收 */
  async function closeDetailAndCleanup() {
    // 2026-11-22 用户明确要求「任何记录，只要标题正文都空了，返回就删」——
    // 原来只清 pendingNewId（刚点「记录」新建的那条），老记录被清空后会留一张「未命名」空卡。
    // dropIfEmpty 现在把 pics 也算内容：只有图没有字的记录不算空，不会被误删。
    const openedId = openedItem.value && openedItem.value.id
    // 刚点「记录」建的那条：它是从横条长出来的，收也要收回横条（那张卡马上会被删掉）
    const returnToBar = !!pendingNewId.value && pendingNewId.value === openedId
    const id = openedId || pendingNewId.value
    pendingNewId.value = null
    // 空记录的删除放进 closeWithZoom、在跑动画之前执行 —— 见那里的说明：
    // 先收再删会让别的卡在动画结束后整体上移一截，看起来像「卡片跳动」。
    await closeWithZoom(returnToBar, id)
    closeDetail()
    // 内联的 transform/opacity 必须等 closeDetail 之后再摘：
    // 摘早了 primary 会先掉回 sheet-leave（opacity 0）闪一下，才被 sheet-active 接住。
    const primary = document.querySelector('.primary-sheet')
    if (primary) {
      primary.style.removeProperty('transition')
      primary.style.removeProperty('opacity')
      primary.style.removeProperty('transform')
    }
  }

  /**
   * 收起动画（2026-11-23）。
   *
   * 两个细节：
   * 1. **卡片和详情都要重新量**：列表可能滚过、详情可能滚过，用打开时的旧矩形会缩到错的落点。
   * 2. **列表要先显形**：详情打开期间列表是 `sheet-leave`（opacity 0），不先恢复的话，
   *    东西会「飞回一片空白」。这里临时压掉它的 transition 直接显形，收完再交还给它自己。
   */
  async function closeWithZoom(returnToBar = false, dropId = null) {
    const sheetEl = document.querySelector('.detail-sheet')
    const id = openedItem.value && openedItem.value.id
    if (!sheetEl || !id) return false

    /**
     * 先让列表显形 + 归位，再量落点。
     * 详情打开期间列表是 `sheet-leave`（opacity 0 + translateY(-18px)），
     * 照那个状态量出来的位置比真实落点高 18px —— 收完它才归位，壳就缩歪了。
     */
    const primary = document.querySelector('.primary-sheet')
    if (primary) {
      primary.style.transition = 'none'
      primary.style.opacity = '1'
      primary.style.transform = 'none'
    }
    await new Promise((r) => requestAnimationFrame(r))

    const cardEl = [...document.querySelectorAll('.data-card')].find((el) => el.dataset.id === id)
    /**
     * 落点：新建的空记录收回「记录」横条，老记录收回它自己的卡。
     * 收回那张空卡的话，卡缩到一半就被 dropIfEmpty 删掉 —— 用户看到的是
     * 「东西缩进一个随即消失的位置」，像是没落点（2026-11-23 反馈）。
     */
    const originEl = returnToBar ? document.querySelector('.record-fab') : cardEl
    const src = readCardRects(originEl)
    const dst = readDetailRects(sheetEl)
    if (!src || !dst) {
      // 没有落点就跑不了动画，但空记录仍然必须删掉（否则会留一张空卡）
      if (dropId) recordsApi.dropIfEmpty(dropId)
      return false
    }

    // 落点和副本素材都先取下来：下面可能把这条记录删掉，删了 DOM 就没了
    const photoUrl = cardEl?.querySelector('.card-cover img')?.src || ''
    const textHtml = cardTextHtml(cardEl)

    /**
     * 顶栏补偿（2026-11-25 **删掉**，它是过期规则，也是个 bug）。
     *
     * 旧逻辑：详情打开时顶栏被卸载、收完再挂回来，于是给落点整体 +55px（--header-height）。
     * 但顶栏从 2026-11-23 起就是 `position: absolute` 的**浮层**，卸载它根本不动布局 ——
     * 实测（390×844，详情开着、列表临时复位后量）：卡片 top 138 → 138，一格都没变。
     * 于是这 55px 变成纯粹的偏移：每次收起，壳都落到真实位置下方 55px。
     * 卡片是白的、壳也是白的，这个错位看不出来；＋钮在屏幕底边，落点被推到 834，
     * 下半截被视口裁掉 —— 用户看到的就是"按钮变扁"（一条 44×10 的横片）。
     */

    /**
     * **空记录先删、再收**（2026-11-23 第二次修「已经记录的卡片跳动」）。
     *
     * 留着它先收再删的话：列表在收起动画一开始就已经显形了，而那张空卡要等动画
     * 结束才消失 —— 它一消失，下面每一张卡都要上移一整张卡的高度，用户看到的是
     * 「别的卡跳了一下」。
     *
     * 而且它本来就没在列表里"出现过"：新建是从横条长出来的，收回也是回横条。
     * 提前删掉等于这一趟没发生过 —— 不 await 是因为数组改动本身是同步的
     * （await 的只是后面的图片回收，那是后台事）。
     */
    if (dropId) recordsApi.dropIfEmpty(dropId)

    await zoom.close({
      src,
      dst,
      photoUrl,
      textHtml,
      textTo: dst.textTo,
      inner: dst.inner,
      header: dst.header,
      bar: dst.bar,
      radius: readOriginRadius(originEl),
      shell: returnToBar ? SHELL_FAB : SHELL_CARD
    })
    return true
  }

  return { handleOpenItem, handleCreateRecord, closeDetailAndCleanup }
}
