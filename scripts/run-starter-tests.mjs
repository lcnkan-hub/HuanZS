/**
 * 测试入口：注册解析钩子后加载断言套件
 * 用法：npm run test:starter
 */
import { register } from 'node:module'

register('./resolve-hook.mjs', import.meta.url)
await import('./starter.test.mjs')
