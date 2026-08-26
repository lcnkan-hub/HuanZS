/**
 * ESM 解析钩子：让原生 node 能解析无扩展名的相对导入
 * （src 按 Vite 惯例写 './xxx'，node ESM 默认要求 './xxx.js'——此钩子补齐）
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?js(\?|$)/.test(specifier)) {
    try {
      return await next(`${specifier}.js`, context)
    } catch {
      return await next(`${specifier}/index.js`, context)
    }
  }
  return next(specifier, context)
}
