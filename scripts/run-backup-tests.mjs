/**
 * 测试入口：注册解析钩子后加载备份断言套件
 * 用法：npm run test:backup
 */
import { register } from 'node:module'

register('./resolve-hook.mjs', import.meta.url)
await import('./backup.test.mjs')
