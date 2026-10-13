<!--
  备份中心积木（2026-10-10 新增 · 对应问题清单 I01「数据会丢」）
  职责：把「能带走 + 能导回」做成用户点得到的东西
    - 导出全量备份（百科 / 王冠记忆 / 聊天记录 / 危机留痕 / 图片 / 用户档案）
    - 从备份文件导入（全量覆盖当前账号 + 导入前自动快照）
    - 回退到导入前（导错了能退回来）
  边界：不含 API 密钥、不含登录态、不含账号表；不引任何依赖；不碰危机逻辑
  交互：导入/回退完成后必须整页重载（业务积木的存储键在启动时就绑定了）
-->
<template>
  <div class="backup-section">
    <h3><AppIcon name="shield" :size="16" /> 存储与备份</h3>

    <div class="backup-card">
      <!-- 导出 -->
      <button class="bk-btn primary" type="button" :disabled="!!busy" @click="handleExport">
        <AppIcon name="export" :size="14" />
        {{ busy === 'export' ? '正在打包…' : '导出全量备份' }}
      </button>
      <p class="bk-hint">一个文件带走全部：百科 · 王冠记忆 · 聊天记录 · 图片 · 用户档案</p>
      <p class="bk-last" v-if="lastAt">上次导出：{{ fmtTime(lastAt) }}</p>
      <p class="bk-last warn" v-else>还没导出过 —— 现在手机丢了，东西就真没了</p>

      <!-- 导入 -->
      <button class="bk-btn ghost" type="button" :disabled="!!busy" @click="triggerImport">
        <AppIcon name="import" :size="14" />
        {{ busy === 'import' ? '正在导入…' : '从备份文件导入' }}
      </button>
      <input ref="fileEl" type="file" accept=".json,application/json" style="display: none" @change="handleFile" />

      <!-- 回退 -->
      <button v-if="snap" class="bk-btn ghost" type="button" :disabled="!!busy" @click="handleRestore">
        <AppIcon name="back" :size="14" /> 回退到导入前（{{ fmtTime(snap.ts) }}）
      </button>

      <!-- 结果提示 -->
      <p v-if="msg" class="bk-msg" :class="msgType">
        <AppIcon :name="msgType === 'error' ? 'close' : 'check'" :size="13" />{{ msg }}
      </p>

      <p class="bk-note">
        备份里不含 API 密钥。手机 App 里导出会把文件写进手机并弹出系统「保存 / 分享」；电脑浏览器里导出就是直接下载。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { downloadBackup, importBackup, restoreFromSnapshot, estimateSize, lastExportAt, humanError, SIZE_GATE_MB } from '../../composables/useBackup'
import { snapshotInfo, clearSnapshot } from '../../composables/useBackupStore'

const fileEl = ref(null)
const busy = ref('')       // '' | 'export' | 'import'
const msg = ref('')
const msgType = ref('ok')  // 'ok' | 'error'
const snap = ref(null)
const lastAt = ref(null)

onMounted(async () => {
  lastAt.value = lastExportAt()
  snap.value = await snapshotInfo()
})

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso).slice(0, 16)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const say = (text, type = 'ok') => { msg.value = text; msgType.value = type }

/** 导出：体积大就先问一句（含图片 / 不含图片） */
const handleExport = async () => {
  if (busy.value) return
  busy.value = 'export'
  say('')
  try {
    let includeImages = true
    const mb = await estimateSize(true)
    if (mb > SIZE_GATE_MB) {
      includeImages = confirm(
        `这份备份预估约 ${mb} MB（主要是图片）。\n\n` +
        `点「确定」＝导出完整备份（含图片）\n` +
        `点「取消」＝只导文字数据（百科 / 记忆 / 聊天），体积小很多，但图片不带`
      )
    }
    const r = await downloadBackup({ includeImages })
    const c = r.counts || {}
    const how = {
      'native-share': '已导出，系统已弹出「保存 / 分享」',
      'native-file': '已存进 App 的导出目录（分享没弹出来，可用系统文件管理找 ' + r.filename + '）',
      webshare: '已交给系统保存 / 分享',
      download: '已导出到下载目录'
    }[r.via] || '当前环境不支持直接存文件'
    say(`${how}（百科 ${c.wiki_items} · 记忆 ${c.memory} · 聊天 ${c.chat} · 图片 ${c.images}）` +
      (includeImages ? '' : '；这次没含图片'), r.via === 'none' ? 'error' : 'ok')
    lastAt.value = lastExportAt()
  } catch (e) {
    say('导出失败：' + humanError(e), 'error')
  } finally {
    busy.value = ''
  }
}

const triggerImport = () => {
  if (busy.value) return
  fileEl.value && fileEl.value.click()
}

const handleFile = async (event) => {
  const file = event.target.files && event.target.files[0]
  event.target.value = '' // 允许连续选同一个文件
  if (!file) return

  if (!confirm(`导入会用备份内容覆盖当前账号的全部数据。\n\n系统会先自动存一份「导入前快照」，导错了能退回来。\n\n继续？`)) return

  const r = await runImport(file, false)
  if (!r) return
  // 备份里有坏图：默认**什么都没动**（A04），把选择权交回用户 ——
  // 但这份备份可能就是他唯一的一份，所以给一条显式的「仍然导入」。
  const go = confirm(
    `${r.error}\n\n` +
    `点「确定」＝仍然导入（会丢掉这 ${r.imageReport.damaged} 张图）\n` +
    `点「取消」＝先不导（当前数据没有被改动）`
  )
  if (!go) return
  await runImport(file, true)
}

/** 跑一次导入；坏图被拦时返回结果交给上层问用户，其余情况在这里收尾 */
const runImport = async (file, allowDamagedImages) => {
  busy.value = 'import'
  say('')
  try {
    const r = await importBackup(file, { allowDamagedImages })
    if (r.ok) { finishImport(r); return null }
    if (r.code === 'IMAGES_DAMAGED') { say(r.error, 'error'); return r }
    say(r.error || '导入失败', 'error')
    return null
  } catch (e) {
    say('导入失败：' + humanError(e), 'error')
    return null
  } finally {
    busy.value = ''
  }
}

/**
 * 收尾报账：这里写的每个数字都必须是**真的写进去了多少**（A04）。
 * 不许拿 counts（备份自称的条数）充数，也不许把「图片没进来」藏起来。
 */
const finishImport = (r) => {
  const c = r.counts || {}
  let tail
  if (r.legacy) {
    tail = `（老版备份，只导了百科 ${c.wiki_items} 条）`
  } else {
    const img = r.imageUnavailable
      ? '图片：当前环境读不到图片库，这批图没进'
      : `图片 ${r.images}${r.imagesDropped > 0 ? `（备份里另有 ${r.imagesDropped} 张是坏的，没导入）` : ''}`
    tail = `（百科 ${c.wiki_items} · 记忆 ${c.memory} · 聊天 ${c.chat} · ${img}）`
  }
  const warn = r.imageError ? `\n\n⚠️ 图片没能导入：${r.imageError}\n（文字数据已经导入回来了）` : ''
  alert('导入完成 ' + tail + warn + '\n\n页面将重新加载。')
  location.reload()
}

const handleRestore = async () => {
  if (busy.value || !snap.value) return
  if (!confirm(`回退到 ${fmtTime(snap.value.ts)} 的快照？\n\n当前数据会被那份快照覆盖。`)) return
  busy.value = 'import'
  say('')
  try {
    const r = await restoreFromSnapshot()
    if (!r.ok) { say(r.error || '回退失败', 'error'); return }
    await clearSnapshot()
    alert('已回退到导入前的数据，页面将重新加载。')
    location.reload()
  } catch (e) {
    say('回退失败：' + humanError(e), 'error')
  } finally {
    busy.value = ''
  }
}
</script>

<style scoped>
.backup-section { margin-top: 22px; }
.backup-section h3 {
  display: flex; align-items: center; gap: 7px;
  font-size: var(--text-13); font-weight: 600; color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.backup-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-3xl);
  box-shadow: var(--shadow-card);
  padding: 15px;
  display: flex; flex-direction: column; gap: 9px;
}

.bk-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 44px; width: 100%;
  border-radius: var(--radius-lg); border: 1px solid var(--color-border);
  font-size: var(--text-14); font-weight: 500; font-family: var(--font-system);
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1.0), opacity 0.2s, background 0.2s;
}
.bk-btn:active { transform: scale(0.985); }
.bk-btn:disabled { opacity: 0.55; }
.bk-btn.primary { background: var(--color-accent); color: var(--color-text-on-accent); border-color: transparent; }
.bk-btn.ghost   { background: var(--color-bg-card); color: var(--color-text-secondary); }

.bk-hint { font-size: var(--text-12); color: var(--color-text-muted); text-align: center; line-height: 1.6; }
.bk-last { font-size: var(--text-12); color: var(--color-text-muted); text-align: center; }
.bk-last.warn { color: var(--color-danger); }

.bk-msg {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: var(--text-13); line-height: 1.6; margin-top: 2px;
}
.bk-msg.ok { color: var(--color-success); }
.bk-msg.error { color: var(--color-danger); }

.bk-note {
  margin-top: 3px; padding-top: 11px;
  border-top: 1px solid var(--color-border-light);
  font-size: var(--text-12); line-height: 1.65; color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .bk-btn { transition: none; }
}
</style>
