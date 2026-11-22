/**
 * 软键盘开合积木（2026-11-23）
 *
 * 职责：给出「键盘占了多少」的三个量，让输入浮岛跟着键盘走，而不是硬贴屏幕底。
 *
 *   kbInset —— 键盘盖住了多少像素（iOS 口径：可见区被顶掉的高度）→ 给消息列表补底部留白
 *   kbShift —— 输入栏该整体上浮多少像素（0 或负数）→ 输入栏 transform
 *   kbOpen  —— 键盘是否开着 → 底栏下沉、输入栏把留给浮岛的那 80px 收回
 *
 * 为什么要两套判据（本文件最重要的地方）：
 *   · iOS / Safari / WKWebView：**布局视口不缩**，缩的只是 visualViewport
 *     → innerHeight 不变、vv.height 变小，差值 = 键盘高度 → kbInset 有值。
 *   · Android WebView（Capacitor 默认 adjustResize）：**布局视口一起缩**
 *     → innerHeight 与 vv.height 同时变小，差值 ≈ 0 → kbInset 为 0；
 *       此时页面本身已经被压短，输入栏只要待在流里就自然落在键盘上方。
 *   所以 kbOpen 必须两条判据取或：① 可见区高度差 > 120；② 布局视口比本会话最高值矮 > 120。
 *   只写 ① 就是"在 Android 上碰巧对、换 iOS 就废"（2026-11-23 第一版正是如此）。
 *
 * 为什么不用 focus / blur：focus 只说明拿到了焦点（键盘可能还没弹，或接了外接键盘根本不弹）；
 * blur 更晚、还可能被点别处触发。这两个高度差是唯一直接量到的"可见区域"。
 */
import { ref } from 'vue'

const KEYBOARD_MIN = 120      // 判定阈值：键盘最矮也有 200 上下，地址栏折叠/旋转抖动只有几十像素

const kbInset = ref(0)        // 键盘盖住的高度（iOS 口径：可见区被顶掉多少）
const kbShift = ref(0)        // 输入栏上浮量（0 或负数）
const kbOpen  = ref(false)    // 键盘是否开着

let started = false
let baselineH = 0             // 本会话见过的最高布局视口（Android 判据的基准）

/** 量一次：每次 visualViewport 变动 / 窗口尺寸变化 / 旋转都调 */
function check() {
  const vv = window.visualViewport
  const h = window.innerHeight

  // 基准取"见过的最高的布局视口"：地址栏折叠会让它变高，键盘会把它压矮
  if (h > baselineH) baselineH = h

  const byVv = vv ? Math.max(0, h - vv.height) : 0        // iOS 口径：可见区被顶掉多少
  const byLayout = Math.max(0, baselineH - h)             // Android 口径：布局视口被压短多少

  kbInset.value = byVv > KEYBOARD_MIN ? byVv : 0

  // 上浮量：iOS 上可见区被顶掉多少就上浮多少；Android 那套布局已缩，不需要上浮（0）。
  // 两个都不是键盘时，只把 iOS 的 pan offset 补掉，免得浮件被系统滚动带走。
  const panOffset = vv ? vv.offsetTop : 0
  if (kbInset.value > 0) kbShift.value = -kbInset.value
  else if (byLayout > KEYBOARD_MIN) kbShift.value = 0
  else kbShift.value = Math.min(0, -panOffset)

  kbOpen.value = kbInset.value > 0 || byLayout > KEYBOARD_MIN
}

/** 取键盘状态（首次调用时装监听；模块级单例，重复调用不会重复绑事件） */
export function useKeyboard() {
  if (!started && typeof window !== 'undefined') {
    started = true
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', check)
      vv.addEventListener('scroll', check)   // iOS 键盘升降会连带触发 scroll（可见区被平移）
    }
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', () => {
      baselineH = 0                          // 旋转后布局视口重算，基准要重新取
      setTimeout(check, 150)
    })
    baselineH = window.innerHeight
    check()
  }
  return { kbInset, kbShift, kbOpen }
}
