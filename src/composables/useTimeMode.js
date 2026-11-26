/**
 * 时间模式积木 —— 全站昼夜判定的唯一来源（2026-11-25 加手动档 · 2026-11-26 加「跟随系统」）
 *
 * 四个档位（存本机，设备级偏好，不按账号隔离）：
 *   auto   —— 跟随时间：6:00–18:00 白天「光启」，其余夜晚「灯醒」（默认，与旧行为一致）
 *   system —— 跟随系统：读 prefers-color-scheme，系统深色就是夜；窗口开着时实时跟随
 *   day    —— 锁白天
 *   night  —— 锁夜晚
 *
 * 为什么「跟随系统」要和「跟随时间」分成两档：
 *   它们是两套互相独立的判据 —— 一个是表（6 / 18 点），一个是操作系统。
 *   合成一档就会出现"下午两点、手机开了深色、到底算哪一档"这种没人说得清的中间态。
 *   默认仍是 auto：加这一档之前用户看到什么，之后还是什么。
 *
 * 为什么改成模块级单例：
 *   以前每次 useTimeMode() 都新建一个 ref + 一个 setInterval，App / ChatView / 入口动画各拿各的；
 *   加手动档之后，开关在「我的」里改，三个消费者必须**同一帧**看到同一个值，
 *   各持一份的写法会让「我的」变了、王冠还是旧的。现在只有一个 ref、一个定时器（懒启动）。
 *
 * 为什么保留 getTimeMode 纯函数：单测与「非组件环境」还要用，且它是 auto 档的唯一算法。
 */
import { ref, computed } from 'vue'
import { STORAGE_KEYS } from '../constants/storage'

/** 白天时段边界（左闭右开：DAY_START ≤ 小时 < DAY_END） */
export const DAY_START = 6
export const DAY_END = 18

/** 四个档位（界面的顺序就是这张表的顺序） */
export const THEME_MODES = ['auto', 'system', 'day', 'night']

/**
 * 纯函数：给定时刻 → 'day' | 'night'
 * @param {Date} [now] 默认当前时刻
 * @returns {'day'|'night'}
 */
export function getTimeMode(now = new Date()) {
  const h = now.getHours()
  return (h >= DAY_START && h < DAY_END) ? 'day' : 'night'
}

/** 系统深浅色：读不到（老 WebView / node）→ 当作白天，与不支持的旧行为一致 */
const darkQuery = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

/** 纯函数：系统当前是深色吗 */
export function getSystemMode() {
  return darkQuery && darkQuery.matches ? 'night' : 'day'
}

/** 读本机存的档位；非法值/读不到 → auto（老设备升级上来什么都不用做） */
export function readThemeMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.THEME_MODE)
    return THEME_MODES.includes(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

/* ---------- 单例状态 ---------- */
const clockMode = ref(getTimeMode())      // 表的结论
const systemMode = ref(getSystemMode())   // 操作系统的结论
const savedMode = ref(readThemeMode())    // 用户选的那一档
let started = false

function tick() {
  const next = getTimeMode()
  if (next !== clockMode.value) clockMode.value = next
}

/** 系统切换深浅色时的回调（只改 ref，不碰存储 —— 用户选的是 system 这一档，不是这一刻的颜色） */
function onSystemChange(e) {
  systemMode.value = e.matches ? 'night' : 'day'
}

/** 懒启动：第一次有人用这个积木时才起表 + 挂系统监听 */
function ensureStarted() {
  if (started) return
  started = true
  // 精度一分钟足够（边界是整点）
  setInterval(tick, 60 * 1000)
  if (darkQuery) {
    if (darkQuery.addEventListener) darkQuery.addEventListener('change', onSystemChange)
    else if (darkQuery.addListener) darkQuery.addListener(onSystemChange) // Safari < 14
  }
}

/** 当前档位（'auto' | 'system' | 'day' | 'night'）—— 给设置界面读 */
export const themeMode = computed(() => savedMode.value)

/**
 * 最终生效的模式：手动 > 系统 > 时间。
 * 消费者（ChatView / 入口动画 / 背景板 / App 根类）永远只看到 day / night 两个值。
 */
export const mode = computed(() => {
  if (savedMode.value === 'auto') return clockMode.value
  if (savedMode.value === 'system') return systemMode.value
  return savedMode.value
})

/**
 * 改档位：写本机 + 立刻改 ref。
 * 这么小的对象不值得引 useLocalStorage（那套是 deep watch 给业务数据用的），直接读写更清楚。
 */
export function setThemeMode(next) {
  const v = THEME_MODES.includes(next) ? next : 'auto'
  savedMode.value = v
  try {
    localStorage.setItem(STORAGE_KEYS.THEME_MODE, v)
  } catch {
    /* 隐私模式写不进去：本次会话仍然生效，刷新后回到 auto —— 不值得弹错 */
  }
  return v
}

/**
 * 组件入口：返回只读的 mode（保持旧签名，ChatView / 入口动画 / 背景板一行都不用改）
 * @returns {import('vue').ComputedRef<'day'|'night'>}
 */
export function useTimeMode() {
  ensureStarted()
  return mode
}
