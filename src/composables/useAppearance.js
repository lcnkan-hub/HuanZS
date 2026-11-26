/**
 * 外观积木 —— 「色系 × 明暗」两条轴的唯一出口（2026-11-26 新增）
 *
 * 职责：把「选哪套色系」和「白天还是夜里」合成一个类名字符串，交给根容器 +
 *       几个 Teleport 出去、继承不到根类的组件（CardMenu / MemorySheet）。
 *       全项目只有这一处拼这两个类，别在组件里各写一遍 —— 写两遍就会漂。
 *
 * 为什么色系不并进 useTimeMode：
 *   昼夜是"判据"（表 / 系统 / 手选），色系是"选值"（一套令牌），两件事正交。
 *   合进一个 composable 之后，任何一个想读昼夜的地方都会被迫知道色系的存在。
 *   这里只是把它们**拼**在一起，不互相改写。
 *
 * 存储：huan_zhong_shu_palette（设备级，进 storageScope 的 GLOBAL_KEYS）——
 *       换账号不该换个颜色；也不进备份，换手机重选一次即可（与昼夜档同一口径）。
 */
import { ref, computed } from 'vue'
import { STORAGE_KEYS } from '../constants/storage'
import { PALETTES, DEFAULT_PALETTE, paletteClass } from '../constants/palettes'
import { useTimeMode } from './useTimeMode'

/** 读本机存的色系；非法值/读不到 → 默认色系（老设备升级上来什么都不用做） */
export function readPalette() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.PALETTE)
    return PALETTES.some((p) => p.id === v) ? v : DEFAULT_PALETTE
  } catch {
    return DEFAULT_PALETTE
  }
}

/* ---------- 单例状态（与 useTimeMode 同一个道理：界面改了要立刻全员生效） ---------- */
const currentPalette = ref(readPalette())

/** 当前色系 id（给设置界面读 / 写） */
export const palette = computed(() => currentPalette.value)

/**
 * 改色系：写本机 + 立刻改 ref。色系只是覆盖 CSS 令牌，**不需要**刷新页面。
 * @param {string} next 注册表里的 id；非法值回落默认
 */
export function setPalette(next) {
  const v = PALETTES.some((p) => p.id === next) ? next : DEFAULT_PALETTE
  currentPalette.value = v
  try {
    localStorage.setItem(STORAGE_KEYS.PALETTE, v)
  } catch {
    /* 隐私模式写不进去：本次会话仍然生效，刷新后回到默认 —— 不值得弹错 */
  }
  return v
}

/**
 * 根容器要挂的类：非默认色系 → palette-xxx；夜里 → theme-deep。
 * 返回的是字符串（不是对象）：三个挂载点写法一致，避免某个地方写成布尔键。
 */
export const appearanceClass = computed(() => {
  const timeMode = useTimeMode()
  const cls = []
  const pc = paletteClass(currentPalette.value)
  if (pc) cls.push(pc)
  if (timeMode.value === 'night') cls.push('theme-deep')
  return cls.join(' ')
})

/**
 * 组件入口（根容器 / 底栏 / 「我的」/ 两个 Teleport 弹层用它）
 * @returns {{ palette: import('vue').ComputedRef<string>, appearanceClass: import('vue').ComputedRef<string> }}
 */
export function useAppearance() {
  return { palette, appearanceClass }
}
