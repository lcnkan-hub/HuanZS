/**
 * 测试入口：注册解析钩子后加载「导入图片完整性」断言套件
 * 用法：npm run test:import
 */
import { register } from 'node:module'

register('./resolve-hook.mjs', import.meta.url)
await import('./import-images.test.mjs')
