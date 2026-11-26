/**
 * 测试入口：图片压缩纯函数断言套件
 * 用法：npm run test:compress
 */
import { register } from 'node:module'

register('./resolve-hook.mjs', import.meta.url)
await import('./image-compress.test.mjs')
