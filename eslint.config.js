/**
 * ESLint 配置（flat config · ESM）
 * 目的：抓「AI 写了过时 API」这一类问题，不做风格审查。
 *
 * 为什么是 flat/essential 而不是 recommended：
 *   recommended 会把缩进、换行、属性顺序之类全报出来，对 68 个存量文件是一次性还债；
 *   essential 只留正确性问题，其中 vue/no-deprecated-* 那一组正是要抓的（Vue 2 写法
 *   在 Vue 3.5 里不会崩，但会静默走弃用分支）。
 *
 * 为什么不用 antfu/eslint-config：它是风格预设，接入当天会先欠几百条格式债，
 *   把「发现真问题」这件事淹掉。
 */
import pluginVue from 'eslint-plugin-vue'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'android/**', '.dsh-plugins/**', 'public/**', '.hermes/**']
  },
  ...pluginVue.configs['flat/essential'],
  {
    files: ['src/**/*.{js,vue}', 'scripts/**/*.mjs'],
    rules: {
      // 项目组件文件名是 PascalCase 多词（MinePage / AuthView…），这条在 Vue 3 无实际风险
      'vue/multi-word-component-names': 'off',
      // 本项目只用 <script setup>；出现 Options API / 普通 <script> 应当报警
      'vue/component-api-style': ['error', ['script-setup']],
      // 未使用变量：只提警告，不阻断；忽略参数（composable 常有占位参数）
      'no-unused-vars': ['warn', { args: 'none' }]
    }
  }
]
