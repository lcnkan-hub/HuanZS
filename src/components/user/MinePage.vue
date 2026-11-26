<!--
  「我的」内容积木（2026-11-21 单层重构版；2026-11-23 重排成「一张名片 + 三行 + 一行」）
  职责：布局编排，数据计算和事件转发。容器是 MineSheet（底部浮层），本组件只管里面放什么。

  为什么重排（排版 / 内容两条都是硬伤，原方案见 docs/screenshots/06-*）：
    · 原页 ≈1370px、可用区 ≈620px —— 两屏多，首屏正好切在「导出全量备份」上；
      而这张卡片 88% 高，内容却只有 466px，往上堆只会越堆越空。
    · 一页里同一件事出现两次：用户出现两回、同一张头像画两遍、
      「都在同一个文件里」与备份卡的 hint 重复。
    · 红色的「锁定本机」比真正的主按钮（导出）更抓眼，语义还是错的（可逆动作穿警告色）。
  现在：名片 →（王冠 / 收藏 / 数据）→ 锁定，四行各有去处，其余内容进二级页。

  二级页由 MineSheet 的头部标题 + 返回箭头承载，页面状态在 MineSheet（它才知道自己多高）。
  单人化：没有「我创建的」—— 只有一个用户时，它是一个会说谎的数字。
-->
<template>
  <div class="page-content mine-page-container">
    <!-- ========== 首页 ========== -->
    <template v-if="!page">
      <!-- 名片：整张卡就是「修改资料」入口（原来是页面最底下一颗离对象 500px 的按钮） -->
      <UserProfileCard
        :avatar="userProfile?.avatar"
        :name="userProfile?.name"
        :meta="profileMeta"
        @edit="$emit('edit-profile')"
      />

      <!-- 三行入口：行只负责进页面，状态用副行说 -->
      <div class="mine-card">
        <MineRow icon="crown" label="王冠" :meta="crownMeta()" @click="$emit('navigate', 'crown')" />
        <MineRow icon="bookmark" label="我的收藏" :value="favCount" @click="$emit('navigate', 'favorites')" />
        <MineRow icon="shield" label="数据与备份" :meta="backupMeta()" @click="$emit('navigate', 'backup')" />
        <!-- 外观（2026-11-25）：整台设备的昼夜偏好，放最后一行 —— 它是设置，不是内容 -->
        <MineRow icon="appearance" label="外观" :meta="appearanceMeta()" @click="$emit('navigate', 'appearance')" />
      </div>

      <!-- 锁定：低频、可逆，放最底，不穿红 -->
      <div class="mine-card mine-lock-card">
        <LockRow />
      </div>
    </template>

    <!-- ========== 二级页 ========== -->
    <CrownSection v-else-if="page === 'crown'" @open-ai-settings="$emit('open-ai-settings')" />

    <MyFavoritesEntry
      v-else-if="page === 'favorites'"
      :records="records"
      @open-item="(item) => $emit('open-item', item)"
    />

    <BackupCenter v-else-if="page === 'backup'" />

    <AppearancePage v-else-if="page === 'appearance'" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import UserProfileCard   from './UserProfileCard.vue'
import MineRow           from './MineRow.vue'
import LockRow           from './LockRow.vue'
import CrownSection      from './CrownSection.vue'
import MyFavoritesEntry  from './MyFavoritesEntry.vue'
import BackupCenter      from './BackupCenter.vue'
import AppearancePage    from './AppearancePage.vue'

import { currentAccount } from '../../composables/useAccount'
import { useFavorites } from '../../composables/useFavorites'
import { isProactiveEnabled, proactiveMonthCount } from '../../composables/useProactive'
import { PROACTIVE_QUOTA_PER_MONTH } from '../../constants/proactive'
import { useAIConfig } from '../../composables/useApiKey'
import { lastExportAt } from '../../composables/useBackup'
import { themeMode, mode } from '../../composables/useTimeMode'
import { palette } from '../../composables/useAppearance'
import { findPalette } from '../../constants/palettes'

defineProps({
  userProfile: { type: Object, default: null },
  records:     { type: Array,  default: () => [] },
  // 当前二级页：'' | 'crown' | 'favorites' | 'backup'（由 MineSheet 持有，它才知道标题该写什么）
  page:        { type: String, default: '' }
})
// 事件：navigate（切二级页）/ edit-profile / open-ai-settings（两个弹窗挂在 MineSheet 上）/
//       open-item（收藏里点一条 → 交给 App 关浮层并打开记录）
defineEmits(['navigate', 'edit-profile', 'open-ai-settings', 'open-item'])

/* ---------- 名片副行：本机 + 创建日期（原来在「本机锁」卡里，现在并到名片上） ---------- */
const account = currentAccount()
const profileMeta = account && account.createdAt
  ? `本机 · 创建于 ${slashDate(account.createdAt)}`
  : '本机'

/* ---------- 收藏数 ---------- */
const { ids: favIds } = useFavorites()
const favCount = computed(() => favIds.value.length)

/* ---------- 王冠行 / 数据行的副行 ----------
   用函数而不是 computed：这两行只在首页分支渲染，回到首页时会重新算一次，
   刚在二级页里改过的开关 / 刚导出完的时间都能立刻反映出来（computed 不会重算）。 */
const { config: aiConfig } = useAIConfig()

function crownMeta() {
  const keyOn = !!(aiConfig.value?.apiKey || '').trim()
  if (!keyOn) return '密钥未配置'
  const on = isProactiveEnabled()
  const used = proactiveMonthCount()
  return `${on ? '开启' : '已关掉'} · 本月 ${used}/${PROACTIVE_QUOTA_PER_MONTH} 次`
}

function backupMeta() {
  const t = lastExportAt()
  return t ? `只在本机 · 上次导出 ${monthDay(t)}` : '只在本机 · 还没导出过'
}

/**
 * 外观行副行：说"现在实际是什么"，而不是只说档位。
 * 2026-11-26 起外观有两条轴，副行把两条都说出来：色系名在前、明暗在后。
 * 跟随时间时不写死白天 —— 它是会被时间改掉的，进一次页面重算一次（同 crownMeta 的理由）。
 */
function appearanceMeta() {
  const now = mode.value === 'day' ? '白天' : '夜晚'
  const color = findPalette(palette.value).name
  if (themeMode.value === 'day') return `${color} · 白天`
  if (themeMode.value === 'night') return `${color} · 夜晚`
  if (themeMode.value === 'system') return `${color} · 跟随系统`
  return `${color} · 跟随时间 · ${now}`
}

/** '2026-11-23T…' → '2026/11/23'（记录时间本来就用斜杠，界面上别两套分隔符） */
function slashDate(iso) {
  const s = String(iso || '').slice(0, 10)
  return s.replace(/-/g, '/')
}

/** 导出时间只留「月-日」：首页这一行不该出现年份 */
function monthDay(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso).slice(0, 10)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
</script>

<style scoped>
/* 2026-11-21：容器从右侧抽屉换成底部卡片后，顶部留白由卡片的横杠+标题接管，
   这里不再自留 20px，否则第一块名片会被顶下去一截。
   2026-11-23：原来这里的入场 animation 撤掉了 —— 淡入改由 MineSheet 的
   <transition> 统一做，两处各淡一次会变成 0.48s 的拖沓。 */
.page-content { padding: 4px 20px 20px; }
.mine-page-container { display: flex; flex-direction: column; gap: 16px; }

.mine-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-3xl);
  box-shadow: var(--surface-card-rim), var(--surface-card-shadow);
  overflow: hidden;   /* 圆角要裁掉行自己的 hover 底色 */
}

/* 锁定与上面那组再拉开 8px（16 的组间距 + 8 = 24）：它不是一个普通入口 */
.mine-lock-card { margin-top: 8px; }
</style>
