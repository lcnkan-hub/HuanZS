/**
 * 底部卡片「下拉关闭」手势积木（2026-11-21）
 *
 * 为什么抽出来：「我的」和「王冠记住的事」是两张底部卡片，手感必须一致
 * （跟手、阈值、回弹、关闭速度）。各写一份一定会长出两套手感 ——
 * 用户当时遇到的就是一张能拉、一张按着纹丝不动，而且拉的时候还闪。
 *
 * 为什么用 pointer 事件而不是 touch：
 * touch 事件在鼠标下根本不会触发，所以「按住横杠」在电脑上等于没绑定；
 * pointer 事件鼠标和触摸都走同一条路。
 *
 * 为什么要有 closing 态：
 * 拖到一半松手判定关闭时，如果先把位移归零再播离场动画，卡片会先跳回原位再滑出去，
 * 那一下跳就是用户看到的「闪烁」。closing 让卡片从**当前位置**接着滑出屏幕。
 */
import { ref, computed, onBeforeUnmount } from 'vue'

export function useSheetDrag({ onClose, travelLimit = 220, closeMs = 280 } = {}) {
  const dragging = ref(false)
  const closing = ref(false)
  const dragY = ref(0)
  const cardHeight = ref(1)
  let startY = 0
  let closeTimer = null

  /** 拉了多少比例（0~1）：遮罩随它变淡，物理上才说得通 */
  const progress = computed(() => Math.min(1, dragY.value / (cardHeight.value || 1)))

  const style = computed(() => {
    // 跟手中：关掉 transition，否则每一帧都会重新起一次补间 —— 那就是"抖"的来源
    if (dragging.value) {
      return { transform: `translateY(${dragY.value}px)`, transition: 'none' }
    }
    // 关闭中：从当前位置滑到屏幕外，用加速曲线
    if (closing.value) {
      return { transform: 'translateY(100%)', transition: `transform ${closeMs}ms cubic-bezier(0.4, 0, 1, 1)` }
    }
    // 松手但没拉够：交给 CSS 的入场曲线弹回原位
    if (dragY.value > 0) {
      return { transform: `translateY(${dragY.value}px)` }
    }
    return {}
  })

  function onDown(e) {
    if (closing.value) return
    dragging.value = true
    dragY.value = 0
    startY = e.clientY
    cardHeight.value = e.currentTarget.parentElement?.offsetHeight || 1
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onMove(e) {
    if (!dragging.value) return
    const dy = e.clientY - startY
    // 只允许往下拉：往上拖不该把卡片顶出屏幕顶部
    dragY.value = dy > 0 ? Math.min(dy, travelLimit) : 0
  }

  function onUp() {
    if (!dragging.value) return
    dragging.value = false
    const threshold = Math.min(120, cardHeight.value / 3)
    if (dragY.value > threshold) close()
    else dragY.value = 0
  }

  /** 统一关闭出口：拖够阈值、点遮罩、其它按钮都走这里，保证都有下滑动画 */
  function close() {
    if (closing.value) return
    closing.value = true
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => { if (onClose) onClose() }, closeMs + 20)
  }

  onBeforeUnmount(() => { if (closeTimer) clearTimeout(closeTimer) })

  return { dragging, closing, dragY, cardHeight, progress, style, onDown, onMove, onUp, close }
}
