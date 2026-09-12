/**
 * 时间模式积木 —— 王冠界面昼夜判定的唯一来源
 * 为什么单独成积木：入场动画（CrownEntrance 的 mode）与界面背景板（CrownBackdrop）
 * 必须共用同一个判定，否则"背景板的时间"会与"夜晚模式动画的时间"漂移成两套。
 * 判定：6:00–18:00 = day（白天「光启」），其余 = night（夜晚「灯醒」）
 */
import { ref, onMounted, onUnmounted } from 'vue'

/** 白天时段边界（左闭右开：DAY_START ≤ 小时 < DAY_END） */
export const DAY_START = 6
export const DAY_END = 18

/**
 * 纯函数：给定时刻 → 'day' | 'night'
 * 纯函数形式便于单测与在非组件环境复用
 * @param {Date} [now] 默认当前时刻
 * @returns {'day'|'night'}
 */
export function getTimeMode(now = new Date()) {
  const h = now.getHours()
  return (h >= DAY_START && h < DAY_END) ? 'day' : 'night'
}

/**
 * 响应式时间模式：跨过 6:00 / 18:00 边界时自动切换
 * 每分钟检查一次，值没变不写 ref（避免无谓渲染）
 * @returns {import('vue').Ref<'day'|'night'>}
 */
export function useTimeMode() {
  const mode = ref(getTimeMode())
  let timer = null

  const tick = () => {
    const next = getTimeMode()
    if (next !== mode.value) mode.value = next
  }

  onMounted(() => {
    timer = setInterval(tick, 60 * 1000)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return mode
}
