/**
 * 备份积木 · 对外门面（2026-11-24 拆分为多文件）
 *
 * 原来这一个文件 816 行，同时管着「键清单 / 图片读写 / 落文件 / 导出组装 / 导入校验 / 回退」六件事。
 * 想改导出文件名，得先翻过图片事务和导入闸门；出 bug 时也分不清是「内容组装错」还是「落地方式选错」。
 *
 * 现在的结构（都在 ./backup/ 下，依赖单向）：
 *   errors.js   → 错误翻译（导入、导出两侧共用）
 *   keys.js     → 键清单 + 按键读写口径 + payload 路径工具
 *   images.js   → IndexedDB 图片的读 / 验 / 整批写回
 *   rescue.js   → 损坏留证（__corrupt）的收集与写回
 *   saveFile.js → 环境探测 + 落文件（Capacitor / Web Share / <a download>）
 *   export.js   → 组装 payload / 估体积 / 生成文件 / 记录导出时间
 *   import.js   → 校验 / 写入 / 坏图闸门 / 快照 / 回退
 *
 * 依赖方向：import → export → keys / images / rescue / saveFile，errors 谁都能用。
 * 禁止 export 反过来 import import（那会绕成环）。
 *
 * 四条硬边界按新位置各写了一份注释：keys.js（读坏即中止）、images.js（先验后写、数字要真）、
 * import.js（只写当前账号 + 先快照 + 坏图闸门）、rescue.js（留证跟着备份走且不跨账号）。
 *
 * 这个文件只做 re-export —— 调用方（BackupCenter / MinePage / 断言脚本）一行都不用改。
 * 新功能要用某一小块时，请直接 import './backup/xxx'，别继续往这个门面里加东西。
 */
export {
  BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, SIZE_GATE_MB,
  buildBackupPayload, estimateSize, downloadBackup, lastExportAt
} from './backup/export'

export { humanError } from './backup/errors'

export { checkImageRecord, inspectImages, countImages } from './backup/images'

export { readRescueCopies, restoreRescueCopies } from './backup/rescue'

export { pickSaver } from './backup/saveFile'

export {
  validateBackupPayload, applyPayload, importBackup, restoreFromSnapshot
} from './backup/import'
