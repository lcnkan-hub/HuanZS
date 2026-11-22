---
name: firebase
description: Firebase/后端接入原则 — 先本地再云，不破坏现有数据
---

# Firebase / 后端指令

- 当前项目为零后端架构（纯前端 localStorage）
- 未来可接入 Firebase：`composables/useFirebase.js`
- 接入原则：不破坏 localStorage 现有数据路径
- 先本地再云：数据先存本地，可选同步到云
- Firebase config 不硬编码，走 `constants/firebase.js`
