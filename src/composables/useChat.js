/**
 * 王冠 AI 聊天积木
 * 管理聊天消息的增删、持久化
 * 消息结构：{ id, role: 'user'|'assistant', content, time }
 *
 * 模块级单例（2026-10-10 由工厂改为单例）：useLocalStorage 的 ref 不感知「外部对
 * localStorage 的直接写入」，所以同一个键一旦有两个活跃 ref，两边各持一份快照 →
 * 后写的那次会静默盖掉前一次（丢消息）。与 useWikiData / useApiKey 同一个道理。
 *
 * 为什么现在必须改：王冠主动开口（I02）要在**打开 app 的那一刻**就把话说进聊天记录，
 * 而那时王冠页可能还没挂载（首屏是用户上次停留的 Tab，见 I03）。单例之后谁写都安全。
 */
import { useLocalStorage } from './useLocalStorage'
import { STORAGE_KEYS } from '../constants/categories'
import { generateUniqueId, getCurrentTimeString } from '../utils/uniqueId'

/** 王冠初始问候语 — 人格化 */
const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是王冠 👑\n你的 AI 伙伴，很高兴认识你！\n\n你可以和我聊天、问我问题，我会记住你告诉我的重要的事。\n想聊聊什么？',
  time: getCurrentTimeString()
}

// 全应用只创建一次（账号切换走整页重载，键名在 boot 时重新解析，见 utils/storageScope.js）
const { data: messages, error } = useLocalStorage(STORAGE_KEYS.CHAT, null)

// 首次使用自动添加欢迎语
if (!messages.value || messages.value.length === 0) {
  messages.value = [WELCOME_MESSAGE]
}

export function useChat() {
  /** 发送用户消息 */
  function sendMessage(content) {
    if (!content || !content.trim()) return null
    const msg = {
      id: generateUniqueId(),
      role: 'user',
      content: content.trim(),
      time: getCurrentTimeString()
    }
    messages.value.push(msg)
    return msg
  }

  /** 添加 AI 回复 */
  function addReply(content) {
    const msg = {
      id: generateUniqueId(),
      role: 'assistant',
      content,
      time: getCurrentTimeString()
    }
    messages.value.push(msg)
    return msg
  }

  /** 清空聊天记录（保留欢迎语） */
  function clearChat() {
    messages.value = [WELCOME_MESSAGE]
  }

  /** 删除单条消息 */
  function deleteMessage(id) {
    messages.value = messages.value.filter(m => m.id !== id)
    // 如果全删光了，恢复欢迎语
    if (messages.value.length === 0) {
      messages.value = [WELCOME_MESSAGE]
    }
  }

  return {
    messages,
    error,
    sendMessage,
    addReply,
    clearChat,
    deleteMessage
  }
}
