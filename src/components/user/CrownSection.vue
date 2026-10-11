<!--
  王冠设置积木（2026-10-10 新增 · I02；2026-10-11 并入「模型与密钥」入口）
  职责：「我的」页里的王冠卡片 —— 主动开口开关 + 本月已开口次数 + 模型密钥状态
        「能不能开口」是行为、「拿什么开口」是密钥，同一件事的两半，放在同一张卡里
  边界：不做人格/语气设置（那些还没定，没定就不摆出来）

  数值不写死：配额与间隔都从 constants/proactive.js 取（产品宪法 R1 的唯一出口），
  这里写死就会出现"宪法说 3 条、界面写着 5 条"。
-->
<template>
  <div class="crown-section">
    <h3><AppIcon name="crown" :size="16" /> 王冠</h3>

    <div class="crown-card">
      <div class="crown-row">
        <div class="crown-info">
          <div class="crown-name">让王冠主动开口</div>
          <div class="crown-meta">{{ enabled ? '开着' : '已关掉' }} · 本月已开口 {{ used }}/{{ QUOTA }} 次</div>
        </div>
        <button
          class="switch"
          :class="{ on: enabled }"
          type="button"
          role="switch"
          :aria-checked="enabled ? 'true' : 'false'"
          aria-label="让王冠主动开口"
          @click="toggle"
        >
          <span class="knob"></span>
        </button>
      </div>

      <p class="crown-note">
        开着的时候，王冠一个月最多主动找你说 {{ QUOTA }} 次，只在早上 6:00 到晚上 21:30 之间，而且要隔 {{ GAP_HOURS }} 小时以上没聊过。它说的不是问候模板，是顺着记着的事起个话头。关掉只影响它主动开口，你找它聊天不受影响。
      </p>

      <!-- 燃料：密钥没配时王冠连回复都发不出，这两行要挨着显示 -->
      <div class="crown-row crown-row-fuel">
        <div class="crown-info">
          <div class="crown-name">模型与密钥</div>
          <div class="crown-meta">{{ keyOn ? '已配置 · 本机保存' : '未配置 —— 还没密钥，王冠开口也没声' }}</div>
        </div>
        <button class="row-link" type="button" @click="$emit('open-ai-settings')">去设置 ›</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import {
  isProactiveEnabled, setProactiveEnabled, proactiveMonthCount
} from '../../composables/useProactive'
import { PROACTIVE_QUOTA_PER_MONTH, PROACTIVE_MIN_GAP_MS } from '../../constants/proactive'
import { useAIConfig } from '../../composables/useApiKey'

defineEmits(['open-ai-settings'])

const QUOTA = PROACTIVE_QUOTA_PER_MONTH
const GAP_HOURS = Math.round(PROACTIVE_MIN_GAP_MS / (60 * 60 * 1000))

// 进入「我的」页读一次当下状态（键不存在 = 开，见 useProactive.isProactiveEnabled）
const enabled = ref(isProactiveEnabled())
const used = ref(proactiveMonthCount())

// 密钥状态（BYOK 单例，与王冠页、AI 设置弹窗共享同一份）
const { config: aiConfig } = useAIConfig()
const keyOn = computed(() => !!(aiConfig.value?.apiKey || '').trim())

function toggle() {
  enabled.value = !enabled.value
  setProactiveEnabled(enabled.value)
}
</script>

<style scoped>
.crown-section { margin-top: 22px; }
.crown-section h3 {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 600; color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.crown-card {
  background: var(--color-bg-card);
  border-radius: var(--radius-3xl);
  box-shadow: var(--shadow-card);
  padding: 14px 15px;
  border: 1px solid var(--color-border-light);
}

.crown-row { display: flex; align-items: center; gap: 11px; }
.crown-info { flex: 1; min-width: 0; }
.crown-name { font-size: 15px; font-weight: 600; color: var(--color-text-primary); }
.crown-meta { font-size: 11.5px; color: var(--color-text-muted); margin-top: 2px; }

.crown-note {
  margin-top: 11px; font-size: 11.5px; line-height: 1.65; color: var(--color-text-muted);
}

/* 密钥那一行：与开关同卡，用一条浅分隔线分成「行为 / 燃料」两段 */
.crown-row-fuel {
  margin-top: 13px; padding-top: 13px;
  border-top: 1px solid var(--color-border-light);
}
.row-link {
  flex: 0 0 auto; background: none; border: none; padding: 4px 2px;
  font-size: 12.5px; font-weight: 500; color: var(--color-accent); cursor: pointer;
}
.row-link:active { opacity: 0.55; }

/* 开关：46 = 2(内边距) + 23(滑块) + 19(行程) + 2(内边距) */
.switch {
  flex: 0 0 auto; width: 46px; height: 27px; padding: 2px;
  display: flex; align-items: center;
  border: none; border-radius: 999px;
  background: var(--color-border-input);
  cursor: pointer; transition: background 0.2s;
}
.switch.on { background: var(--color-success); } /* 与 AI 连通测试的「成功」同一个绿 */
.knob {
  width: 23px; height: 23px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1.0);
}
.switch.on .knob { transform: translateX(19px); }
.switch:active .knob { transform: scale(0.94); }
.switch.on:active .knob { transform: translateX(19px) scale(0.94); }
</style>
