import { createApp } from 'vue'
import App from './App.vue'
import './styles/variables.css'
// 多套色系（2026-11-26）：默认那套写在 variables.css 的 :root 里，
// 其余各一个文件 —— 换色系只换 .palette-xxx 上的令牌覆盖，不动任何结构。
import './styles/palettes/iridescent.css'
import './styles/palettes/coral.css'
import './styles/motion.css'

createApp(App).mount('#app')
