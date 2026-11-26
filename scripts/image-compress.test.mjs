/**
 * 图片压缩 · 断言套件（零依赖原生 node）
 * 运行：npm run test:compress
 *
 * 守的是「加图前的三条承诺」：
 *   A. 只压该压的：PNG/WebP/GIF 绝不转 JPEG（透明/动画不能丢）；
 *   B. 阈值按用户规则：长边 2048、>1.5MB 或超长边才压，小图不重压；
 *   C. 压缩后的尺寸算得对：等比、不放大、不出现 0 边。
 *
 * 解码/编码依赖浏览器（createImageBitmap / canvas），不在 node 里假测 ——
 * 这里只测可以被证明的纯函数；真机上的画质与速度走手工验收。
 */
import { register } from 'node:module'
register('./resolve-hook.mjs', import.meta.url)

const {
  isImageFile,
  isCompressibleFile,
  targetSize,
  shouldCompress,
  compressedName
} = await import('../src/utils/imageCompress.js')

const chk = []
const ok = (name, cond, extra = '') => chk.push([name, !!cond, extra])
const file = (patch) => ({ name: 'photo.jpg', type: 'image/jpeg', size: 3 * 1024 * 1024, ...patch })

// ─────────── A. 哪些文件会被压（类型闸门）───────────
ok('类型:image/jpeg 可压', isCompressibleFile(file({})))
ok('类型:image/heic 可压', isCompressibleFile(file({ type: 'image/heic', name: 'a.heic' })))
ok('类型:大写 .JPG、没有 MIME 也能认出', isCompressibleFile(file({ type: '', name: 'IMG_0001.JPG' })))
ok('类型:image/png 不压（透明不能被压成白底）', !isCompressibleFile(file({ type: 'image/png' })))
ok('类型:image/webp 不压（可能是动图）', !isCompressibleFile(file({ type: 'image/webp' })))
ok('类型:image/gif 不压', !isCompressibleFile(file({ type: 'image/gif' })))
ok('类型:PNG 即使名字叫 .jpg 也不压（MIME 优先）', !isCompressibleFile(file({ type: 'image/png', name: 'fake.jpg' })))

// ─────────── 是不是图片（多选时挡掉误选文件）───────────
ok('图片:image/png 是', isImageFile(file({ type: 'image/png' })))
ok('图片:没有 MIME 的 .heic 是', isImageFile(file({ type: '', name: 'a.heic' })))
ok('图片:文本文件不是', !isImageFile(file({ type: 'text/plain', name: 'a.txt' })))
ok('图片:空对象不是', !isImageFile(null))

// ─────────── C. 等比缩放 ───────────
const land = targetSize(4000, 3000, 2048)
ok('尺寸:横图长边收到 2048', land.width === 2048 && land.height === 1536, JSON.stringify(land))
const port = targetSize(3000, 4000, 2048)
ok('尺寸:竖图收到 2048 高', port.width === 1536 && port.height === 2048, JSON.stringify(port))
const small = targetSize(1000, 800, 2048)
ok('尺寸:小图不放大', small.width === 1000 && small.height === 800 && small.scale === 1, JSON.stringify(small))
const exact = targetSize(2048, 2048, 2048)
ok('尺寸:正好 2048 不动', exact.width === 2048 && exact.height === 2048 && exact.scale === 1, JSON.stringify(exact))
const zero = targetSize(0, 0, 2048)
ok('尺寸:非法宽高原样返回（交给原图兜底）', zero.width === 0 && zero.height === 0, JSON.stringify(zero))
ok('尺寸:长边不会出现 0', targetSize(5000, 10, 2048).height >= 1, JSON.stringify(targetSize(5000, 10, 2048)))

// ─────────── B. 压不压的阈值 ───────────
ok('阈值:4000×3000 压', shouldCompress(file({}), 4000, 3000))
ok('阈值:2000×1500、500KB 不压', !shouldCompress(file({ size: 500 * 1024 }), 2000, 1500))
ok('阈值:2000×1500、2MB 压（体积超）', shouldCompress(file({ size: 2 * 1024 * 1024 }), 2000, 1500))
ok('阈值:4000×3000、100KB 也压（长边超）', shouldCompress(file({ size: 100 * 1024 }), 4000, 3000))
ok('阈值:PNG 永远不压', !shouldCompress(file({ type: 'image/png' }), 4000, 3000))
ok('阈值:宽高读不出来不压（解码失败走原图）', !shouldCompress(file({}), 0, 0))
ok('阈值:自定义长边 1024 生效', shouldCompress(file({ size: 500 * 1024 }), 1500, 1000, { maxEdge: 1024 }))

// ─────────── 输出文件名 ───────────
ok('命名:HEIC 改成 .jpg', compressedName('IMG_1234.HEIC') === 'IMG_1234.jpg')
ok('命名:多段扩展名只换最后一段', compressedName('a.b.jpeg') === 'a.b.jpg')
ok('命名:没有扩展名补 .jpg', compressedName('photo') === 'photo.jpg')
ok('命名:空名字兜底 image.jpg', compressedName('') === 'image.jpg')

// ─────────── 汇总 ───────────
let pass = 0
for (const [name, cond, extra] of chk) {
  if (cond) { pass++; console.log('  ✓ ' + name) } else { console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')) }
}
console.log('--- 图片压缩断言: ' + pass + '/' + chk.length + ' ---')
if (pass !== chk.length) process.exitCode = 1
