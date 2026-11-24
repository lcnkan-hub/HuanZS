/**
 * 备份落文件（2026-11-24 从 useBackup.js 拆出）
 *
 * 职责：决定「这个环境该用哪条路把文件交出去」，并真的交出去。
 * 这一段是纯环境适配（Capacitor / Web Share / <a download>），跟备份内容无关 ——
 * 所以能独立改：以后加了 Tauri / Electron，只动这里。
 */
import { blobToBase64 } from './images'

/**
 * 选落文件方式（**纯函数**，优先级单独可测）。
 *
 * 顺序 = 从"最可靠"到"最不可靠"：
 *   native    → APK（安卓/iOS 原生壳）：走 Capacitor Filesystem 真写进设备 + 弹系统分享
 *   webshare  → 手机浏览器 / PWA：Web Share 能带文件时用系统分享面板
 *   download  → 桌面浏览器：<a download>
 *   none      → 什么路都没有（如实告诉用户，不许假装成功）
 *
 * ⚠️ 为什么 native 必须排第一：Android WebView 里 `<a download>` **对 blob 静默无效**
 *    （没有 DownloadListener 就什么都不发生，连报错都没有）——2026-10-10 查证，
 *    这正是"APK 里导出点了没反应"的根因。所以原生壳里绝不能落到 download 这条路。
 */
export function pickSaver({ isNative = false, canShare = false, canDownload = false } = {}) {
  if (isNative) return 'native'
  if (canShare) return 'webshare'
  if (canDownload) return 'download'
  return 'none'
}

/** 探当前环境能力（纯探测，不落文件） */
export async function detectEnv() {
  const canDownload = typeof document !== 'undefined' && typeof URL !== 'undefined' && !!URL.createObjectURL
  let canShare = false
  try {
    canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File !== 'undefined'
  } catch { canShare = false }
  let isNative = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    isNative = !!(Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform())
  } catch { isNative = false }
  return { isNative, canShare, canDownload }
}

export function fileShareable(file) {
  try {
    return !!(file && navigator.canShare && navigator.canShare({ files: [file] }))
  } catch {
    return false
  }
}

/**
 * 原生壳里落文件：先写进设备（Documents 优先，权限不许就退 App 缓存目录），再弹系统分享。
 * 为什么写完还要分享：写进 App 私有目录用户"看不到"，等于没导出 —— 必须给他一个
 * 「存到文件 / 发给自己 / 传电脑」的出口。
 * 返回 'native-share' | 'native-file' | null（null = 这条路走不通，交给上层继续往后退）
 */
export async function saveViaNative(blob, filename) {
  let uri = null
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const b64 = await blobToBase64(blob)
    for (const dir of [Directory.Documents, Directory.Cache]) {
      try {
        const res = await Filesystem.writeFile({ path: filename, data: b64, directory: dir, recursive: true })
        uri = res && res.uri
        if (uri) break
      } catch { /* 这个目录不行 → 试下一个 */ }
    }
  } catch {
    return null
  }
  if (!uri) return null
  try {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: filename, url: uri, dialogTitle: '保存备份文件' })
    return 'native-share'
  } catch {
    return 'native-file' // 文件已经落地了，只是分享没弹出来
  }
}

/**
 * 按 pickSaver 选定的路落文件；**选定的那条失败就依次往后退**（不让用户一步拿不到就啥也没有）。
 * 返回实际走通的 via 值：'native-share' | 'native-file' | 'webshare' | 'download' | 'none'
 */
export async function trySave(blob, filename) {
  const env = await detectEnv()
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: 'application/json' }) : null
  const canShareFile = !!(file && env.canShare && fileShareable(file))
  const how = pickSaver({ isNative: env.isNative, canShare: canShareFile, canDownload: env.canDownload })

  if (how === 'native') {
    const via = await saveViaNative(blob, filename)
    if (via) return via
    /* 原生那条走不通 → 继续往下退 */
  }
  if ((how === 'native' || how === 'webshare') && canShareFile) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'webshare'
    } catch {
      /* 用户取消或分享失败 → 退下载 */
    }
  }
  if (env.canDownload) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return 'download'
  }
  return 'none'
}

/** 文件名里的账号名：只留中英文数字和连字符，其它一律丢掉 */
export function safeLabel(label) {
  return String(label || '本机').replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 20) || '本机'
}

export function localDateStr() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}
