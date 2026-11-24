<!--
  「锁定本机」积木（2026-11-23 从 AccountSection 抽出）
  职责：只做一件事 —— 把界面锁回密码页。

  为什么不再是一个全宽红按钮（原来那样）：
  红色在语义上等于「破坏性、会丢东西」，而锁上不删任何数据、解锁只要密码；
  一个可逆动作穿着警告色，会让「数据与备份」那颗真正重要的主按钮被压下去。
  位置也从第二块挪到页面最底：低频动作放末尾，是 iOS 设置里「退出登录」的位置。

  锁定后整页重载：存储键必须在 boot 时按登录态重新解析（见 utils/storageScope.js）。
  锁上不弹确认 —— 它不是破坏性操作，解锁只要输密码。
-->
<template>
  <MineRow
    icon="key"
    label="锁定本机"
    meta="锁上只锁界面，数据一个字都不动"
    :chevron="false"
    quiet
    @click="handleLock"
  />
</template>

<script setup>
import MineRow from './MineRow.vue'
import { logoutAccount, reloadApp } from '../../composables/useAccount'

/** 锁定：清登录态并重载，回到密码页 */
function handleLock() {
  logoutAccount()
  reloadApp()
}
</script>
