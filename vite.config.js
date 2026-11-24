import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    watch: {
      // 原子写入（编辑器 / Agent 的「写临时文件再替换」）会在源码目录里留一个
      // `.文件名.随机数.tmpdir/` 目录，里面是一个短暂存在的 .tmp 文件。
      // Windows 上 Vite 的 watcher 一 watch 到它就被系统锁挡住 → EBUSY 抛错，整个 dev server 退出。
      // 这类目录永远不需要热更新，直接忽略；顺带忽略本机验收用的临时产物目录。
      ignored: ['**/*.tmpdir/**', '**/.tmp-shots/**', '**/.tmp-probe/**']
    }
  }
})
