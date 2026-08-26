/**
 * 王冠 AI 聊天积木
 * 管理聊天消息的增删、持久化
 * 消息结构：{ id, role: 'user'|'assistant', content, time }
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

export function useChat() {
  const { data: messages, error } = useLocalStorage(STORAGE_KEYS.CHAT, null)

  // 首次使用自动添加欢迎语
  if (!messages.value || messages.value.length === 0) {
    messages.value = [WELCOME_MESSAGE]
  }

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
