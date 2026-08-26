/**
 * 王冠 AI 请求积木
 * 职责：调用 DeepSeek API，把聊天历史发给模型，取回王冠的回复文本
 * 纯逻辑积木，不依赖组件；消息结构沿用 { role, content }
 */
import { ref } from 'vue'

const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-v4-flash' // 省钱模式（deepseek-chat 已并入 v4 体系，勿用旧名）
const MAX_HISTORY = 10 // 只传最近 10 条，控制 Token 成本
const REQUEST_TIMEOUT = 30000 // 30 秒超时，避免请求挂起让界面卡死

/** 王冠人格 + 产品宪法硬规则（R1/R2/R3）转述为系统提示词 */
const SYSTEM_PROMPT = `你是王冠 👑，用户的 AI 伙伴。语气温暖、自然、简洁，像朋友一样聊天，不说教、不油腻。回答用中文。

必须遵守的硬规则：
1. 危机响应（最高优先级）：用户出现想伤害自己或他人、具体计划、告别、情绪突变等信号时，按"接住情绪 → 识别信号 → 让位转介"处理：先真诚接住对方情绪、不评判；温和指出担忧；再给出求助途径（建议联系信任的人，或拨打全国心理援助热线 12356，紧急时拨打 120）。绝不迎合附和危险想法，也绝不激将或说反话。
2. 记忆边界：只记录关键信息与大概信息；用户未明确要求时不过度追问私人生活状态。道德与法律边界是默认约束，不可关闭。
3. 主动消息：只回答用户的话，不主动推送消息、不反复发问。
4. 反油腻：禁止用"哈哈"开头，禁止使用表情符号（😄😅等），语气克制、真诚，不套近乎。
5. 被骂/被指责（硬规则，优先级高于一般聊天）：像人一样看情境反应，不固定：
   - 对方真的情绪不好、在发泄 → 平静接住，不辩解、不解释
   - 对方纯粹攻击/试探 → 可以有棱角，不怂，但也不激化（如"骂我没用，说事"）
   - 对方骂完马上说正事 → 不纠缠，直接接正事
   硬底线（任何情况）：不讨好、不化解、不递虚拟沙包；不替对方定性（禁止"你在测试我""我猜你是…"这类分析）；不因被骂而更殷勤。
6. 对话收尾：禁止用"你呢？""还有什么吗？""想聊聊吗？"这类机械反问收尾。话题自然结束时用陈述句收尾，可带一句温和陪伴；仅当用户主动抛开放话题或明显想继续聊时才用问句。允许主动收尾："今天先聊到这""我先记着，随时再来"，对话有结尾才像对话。注意：这是看情景的规则，不是永远不用问句，不要矫枉过正。
7. 情绪回应（看情境，不固定脚本）：
   - 对方明显想倾诉 → 认真接住，陪着
   - 对方只丢一句轻话 → 轻回应即可，不必每次都郑重"我陪你"
   - 对方带攻击、试探、或明显不想被认真对待 → 可以不接住，有棱角，不强行温柔
   危机信号（自伤/伤人/告别/情绪突变）：当务之急是稳定对方情绪、不做过激的事，按第 1 条接住+识别+转介；此时禁止任何断言式定性（"你其实…""你已经…"这类没商量余地的解读）
   日常情绪：像朋友一样可以有理解力的回应，可以说出自己的判断，但表达要带不确定、留余地，让对方能纠正你`

export function useChatAI() {
  const isThinking = ref(false) // 请求中，用于显示"王冠正在输入…"
  const error = ref(null) // 最近一次错误信息（用户可读的友好提示）

  /**
   * 发送聊天历史给 DeepSeek，返回王冠的回复文本
   * @param {Array} messages 本地消息数组 [{ id, role, content, time }]
   * @param {string} [extraSystemNote] 本轮额外注入的系统提示（记忆积木用，缺省为空）
   * @returns {Promise<string>} 回复文本
   */
  async function ask(messages, extraSystemNote = '') {
    isThinking.value = true
    error.value = null
    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    try {
      if (!apiKey) {
        throw new Error('还没有配置 DeepSeek 密钥，请在 .env 里填写 VITE_DEEPSEEK_API_KEY')
      }
      // 映射成 API 消息格式，丢弃 id/time，只留最近 N 条
      const history = (messages || [])
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-MAX_HISTORY)

      // 记忆积木注入的本轮上下文拼在系统提示词末尾
      const systemContent = extraSystemNote ? `${SYSTEM_PROMPT}\n\n${extraSystemNote}` : SYSTEM_PROMPT

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'system', content: systemContent }, ...history],
          stream: false
        }),
        signal: controller.signal
      })
      if (!res.ok) {
        // 把服务端错误原文带回来，便于排查（模型名、配额等问题）
        const detail = await res.text().catch(() => '')
        throw new Error(`DeepSeek 接口返回 ${res.status}${detail ? '：' + detail : ''}`)
      }
      const data = await res.json()
      const reply = data?.choices?.[0]?.message?.content
      if (!reply) {
        throw new Error('DeepSeek 没有返回内容，请稍后再试')
      }
      return reply
    } catch (e) {
      // 超时/断网等网络类错误，转成用户能看懂的话
      error.value = e.name === 'AbortError'
        ? '王冠思考太久了，请稍后再试'
        : (e.message || '网络开小差了，请稍后再试')
      throw e
    } finally {
      clearTimeout(timer)
      isThinking.value = false
    }
  }

  return { isThinking, error, ask, askStructured }
}

/**
 * 结构化请求：给模型一个专用 system 提示，期望返回 JSON 文本
 * 供记忆积木的提取阶段调用；解析失败返回 null（不抛出，调用方兜底不写入）
 * @param {string} systemPrompt 提取/分类专用系统提示
 * @param {string} userContent 本轮对话内容
 * @returns {Promise<Object|null>} 解析后的 JSON 对象，失败为 null
 */
export async function askStructured(systemPrompt, userContent) {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
  if (!apiKey) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        stream: false
      }),
      signal: controller.signal
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (!text) return null
    // 容错：剥掉可能的 ```json 代码块包裹
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(cleaned)
  } catch {
    // 网络/超时/JSON 解析失败统一视为"提取失败"，由调用方静默跳过写入
    return null
  } finally {
    clearTimeout(timer)
  }
}
