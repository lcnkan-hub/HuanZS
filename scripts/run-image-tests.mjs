/**
 * 测试入口：注册解析钩子后加载图片回收断言套件
 * 用法：npm run test:image
 */
import { register } from 'node:module'

register('./resolve-hook.mjs', import.meta.url)
await import('./image-store.test.mjs')
