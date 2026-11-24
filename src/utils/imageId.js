/**
 * 图片 id 形态（2026-11-24 从 useImageStore 上收到 utils）
 *
 * 为什么搬：这两样是**纯格式知识**，不含任何 IO、不依赖 Vue/IndexedDB。
 * 而 markdownParser 要用它做校验和正则，之前却 import 了 composables/useImageStore ——
 * 一个纯解析模块被拖进了浏览器存储依赖，node 里单跑它就得先准备 IndexedDB 替身。
 * 现在方向是：utils/imageId ← markdownParser，且 useImageStore 也从这里取（唯一出处不变）。
 *
 * ⚠️ 形态说明（原注释保留）：
 *   saveImage 生成的是 `img-<base36 时间戳>_<序号>`，**含字母**，绝不能写成 `img-\d+`。
 *   2026-10-10 查清：因为「id 形态」被三处各写各的、且三处都错写成 `img-\d+`，
 *   图片在编辑器预览、正文渲染、URL 替换三条路上全部静默失效 —— 一张图都显示不出来。
 *   以后新增任何用到图片 id 的地方，一律 import 这里，别再手写正则。
 *   同时兼容更早数据里的纯数字 id。
 */
export const IMAGE_ID_SOURCE = 'img-[0-9a-z_]+'

/** 判断一个字符串是不是合法图片 id */
export function isImageId(value) {
  return new RegExp('^' + IMAGE_ID_SOURCE + '$').test(String(value || ''))
}
