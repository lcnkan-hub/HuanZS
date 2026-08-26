/**
 * 页面路由积木 — 管理详情面板的打开/关闭 + 叠层动画状态机
 *
 * 抽离自 App.vue，避免根组件承担页面切换细节
 * 用法：const { openedItem, openDetail, closeDetail, pageClass, primaryKey } = usePageRouter(currentTab)
 *
 * 导航状态持久化：
 * - openDetail(item) 时自动记录当前 currentTab 作为"来源页"
 * - closeDetail() 时若来源页与当前页不同，自动恢复来源页
 * - 确保从「我的」页面点词条后返回时，回到「我的」而非跳转到分类列表
 */
import { ref, computed, watch } from 'vue'

export function usePageRouter(currentTab) {
  const openedItem = ref(null)

  /** 记录打开详情前的 tab，用于返回时恢复导航上下文 */
  const sourceTab = ref(null)

  // ========== 动画状态机 ==========
  const activeView = computed(() => openedItem.value ? 'detail' : 'primary')

  const primaryKey = computed(() => {
    if (currentTab.value === 'mine') return 'mine'
    return 'list-' + currentTab.value
  })

  // 离开中的面板名（用于 sheet-leave 类）
  const leavingView = ref(null)
  let leaveTimer = null

  watch(activeView, (newView, oldView) => {
    if (leaveTimer) clearTimeout(leaveTimer)
    if (oldView && oldView !== newView) {
      leavingView.value = oldView
      leaveTimer = setTimeout(() => {
        leavingView.value = null
        leaveTimer = null
      }, 360)
    }
  })

  function pageClass(sheet) {
    if (leavingView.value === sheet) return 'sheet-leave'
    if (activeView.value === sheet) return 'sheet-active'
    return ''
  }

  // ========== 导航操作（含状态回溯） ==========

  /**
   * 打开详情页
   * 自动记录当前 tab 作为来源，供 closeDetail 恢复
   */
  function openDetail(item) {
    sourceTab.value = currentTab.value
    openedItem.value = item
  }

  /**
   * 关闭详情页，回到来源页
   * 如果当前 tab 与打开详情时的 tab 不同（如从「我的」页面跳转），自动恢复
   */
  function closeDetail() {
    openedItem.value = null
    // 恢复来源 tab：如果来源是 mine 但现在不是，切回去
    if (sourceTab.value && currentTab.value !== sourceTab.value) {
      currentTab.value = sourceTab.value
    }
    sourceTab.value = null
  }

  return {
    openedItem,
    activeView,
    primaryKey,
    pageClass,
    openDetail,
    closeDetail,
    sourceTab
  }
}
