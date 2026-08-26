/**
 * 用户档案积木
 * 集中管理当前用户信息（创建、读取、修改、同步到条目）
 */
import { useLocalStorage } from './useLocalStorage'
import { generateUniqueId, generateDefaultUsername } from '../utils/uniqueId'
import { STORAGE_KEYS } from '../constants/categories'

export function useUserProfile() {
  const { data: userProfile } = useLocalStorage(STORAGE_KEYS.USER, null)

  // 首次访问自动创建用户
  if (!userProfile.value) {
    userProfile.value = {
      id: generateUniqueId(),
      name: generateDefaultUsername(),
      avatar: '🐱'
    }
  }

  /** 更新用户名和头像 */
  function updateProfile({ name, avatar }) {
    userProfile.value.name = name
    userProfile.value.avatar = avatar
  }

  return { userProfile, updateProfile }
}
