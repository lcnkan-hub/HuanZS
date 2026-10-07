/**
 * AI 密钥配置积木（BYOK：用户自带密钥）
 * 职责：全项目唯一的密钥 / 服务商读写入口
 * 安全边界：密钥只存本机 localStorage，不上传任何服务器；不写入日志、记忆或错误提示
 *
 * 设计要点：模块级单例 —— 整个应用只创建一次响应式数据，所有组件读到同一引用，
 * 这样「我的」页保存后，王冠页的状态条立刻同步，不需要跨页面事件。
 */
import { useLocalStorage } from './useLocalStorage'
import { STORAGE_KEYS } from '../constants/categories'
import { AI_PROVIDERS, DEFAULT_PROVIDER } from '../constants/aiProviders'
import { getCurrentTimeString } from '../utils/uniqueId'

// 空配置模板（provider 给默认值，但 configured 判定只看 apiKey）
const EMPTY_CONFIG = { provider: DEFAULT_PROVIDER, apiKey: '', savedAt: '' }

// 模块级单例：首次 import 时创建，之后所有调用共享
const { data: config, error: storageError } = useLocalStorage(STORAGE_KEYS.AI_CONFIG, { ...EMPTY_CONFIG })

/**
 * 响应式配置（给组件做状态展示用）
 * @returns {{ config: import('vue').Ref, error: import('vue').Ref<string|null> }}
 */
export function useAIConfig() {
  return { config, error: storageError }
}

/**
 * 非响应式快照（请求前取用）
 * @returns {{ provider: string, baseUrl: string, model: string, apiKey: string, configured: boolean }}
 */
export function getAIConfig() {
  const provider = config.value?.provider || DEFAULT_PROVIDER
  const meta = AI_PROVIDERS[provider] || AI_PROVIDERS[DEFAULT_PROVIDER]
  const apiKey = (config.value?.apiKey || '').trim()
  return {
    provider,
    baseUrl: meta.baseUrl,
    model: meta.model,
    apiKey,
    configured: apiKey.length > 0
  }
}

/**
 * 保存密钥配置
 * @param {{ provider: string, apiKey: string }} param0 服务商 id 与密钥
 */
export function saveAIConfig({ provider, apiKey }) {
  config.value = {
    provider: AI_PROVIDERS[provider] ? provider : DEFAULT_PROVIDER,
    apiKey: (apiKey || '').trim(),
    savedAt: getCurrentTimeString()
  }
}

/** 清除密钥配置（回到未配置状态） */
export function clearAIConfig() {
  config.value = { ...EMPTY_CONFIG }
}

/** 是否已有可用密钥 */
export function hasUsableKey() {
  return getAIConfig().configured
}

/**
 * 密钥脱敏显示：保留前 3 位 + 后 4 位
 * 长度不足 12 时全部打码（固定 8 个星号，不泄漏真实长度）
 * @param {string} key 原始密钥
 * @returns {string} 形如 sk-****abcd
 */
export function maskKey(key) {
  const k = (key || '').trim()
  if (!k) return ''
  if (k.length < 12) return '********'
  return `${k.slice(0, 3)}****${k.slice(-4)}`
}
