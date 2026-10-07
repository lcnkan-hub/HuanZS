/**
 * AI 服务商配置中心
 * 服务商 / 接口地址 / 模型名的唯一真相源 —— 组件与积木里禁止硬编码 URL 或模型名
 * 接口地址与模型名于 2026-09-28 核对官方文档（docs.bigmodel.cn / api-docs.deepseek.com）
 */

export const AI_PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-flash',
    applyUrl: 'https://platform.deepseek.com',
    note: '按量计费，需先充值',
    keyHint: '以 sk- 开头'
  },
  zhipu: {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4.7-flash',
    applyUrl: 'https://open.bigmodel.cn',
    note: '官方免费模型，无需充值',
    keyHint: '形如 xxxxxxxx.yyyyyyyy'
  }
}

// 可选服务商 id 列表（设置界面按此顺序渲染）
export const PROVIDER_IDS = Object.keys(AI_PROVIDERS)

// 默认服务商
export const DEFAULT_PROVIDER = 'deepseek'
