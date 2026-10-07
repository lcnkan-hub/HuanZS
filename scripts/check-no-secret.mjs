/**
 * 密钥泄漏闸门（零依赖 Node 脚本）
 * 用法：npm run check:secret（已串进 npm run build，闸门失败则构建不通过）
 * 职责：扫构建产物，确认里面没有密钥 —— 这是 P0-1「API Key 暴露」的机制保障
 *
 * 两条检查：
 *   1. 形态扫描：dist 下出现 sk-xxxxxxxx… 这类长密钥形态
 *   2. 历史值扫描：.env 里若还留着密钥值，在 dist 全量文本里搜该完整字符串
 *
 * 隐私纪律：命中时只打印文件名与行号，绝不打印密钥本身。
 */
import fs from 'fs'
import path from 'path'

const DIST_DIR = 'dist'
const ENV_FILE = '.env'
const SECRET_PATTERN = /sk-[A-Za-z0-9]{20,}/g

let failed = false

/** 递归收集目录下所有文件（跳过不存在） */
function walk(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** 读 .env 里仍在生效（未被注释）的密钥值 */
function envSecretValues() {
  if (!fs.existsSync(ENV_FILE)) return []
  const values = []
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue // 注释行不参与
    const m = trimmed.match(/^VITE_DEEPSEEK_API_KEY\s*=\s*(.+)$/)
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, '')
      if (v) values.push(v)
    }
  }
  return values
}

if (!fs.existsSync(DIST_DIR)) {
  console.error(`[check-no-secret] 找不到 ${DIST_DIR}/，请先执行 vite build`)
  process.exit(1)
}

const files = walk(DIST_DIR)
const envValues = envSecretValues()

for (const file of files) {
  // 只扫文本类产物，二进制跳过
  if (/\.(png|jpg|jpeg|webp|gif|ico|ttf|woff2?|map)$/i.test(file)) continue

  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }

  // 检查 1：密钥形态
  const hits = text.match(SECRET_PATTERN)
  if (hits && hits.length > 0) {
    console.error(`[check-no-secret] ✗ 产物中发现密钥形态：${file}（${hits.length} 处）`)
    failed = true
  }

  // 检查 2：.env 里的历史密钥值
  for (const secret of envValues) {
    if (text.includes(secret)) {
      console.error(`[check-no-secret] ✗ 产物中发现 .env 的密钥值：${file}`)
      failed = true
    }
  }
}

if (failed) {
  console.error('[check-no-secret] 构建产物里存在密钥，禁止发布。请检查代码是否仍在读取 import.meta.env.VITE_*')
  process.exit(1)
}

console.log(`[check-no-secret] ✓ 已扫 ${files.length} 个产物文件，未发现密钥`)
