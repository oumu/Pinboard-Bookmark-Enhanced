---
paths:
  - "ai.js"
  - "popup-ai.js"
  - "options-connectivity.js"
---

# AI provider 深水区：关思考（thinking/reasoning）方言

**勿凭记忆改 provider 表**——model 字段是自由文本，blanket 关思考字段会打到用户切换后的不兼容模型（400/422）。机制：`ai.js` 的 `OPENAI_COMPAT_PROVIDERS` 每家用 per-provider `thinkingOff` 方言字段（非 always-on `extraBody`），经 `_aiWithThinkingFallback` 在 4xx(400/422) 时去字段重试一次 + `storage.local` 记忆。

已核验字段表（2026-06-25 逐家官方 doc + 真实 400 issue 佐证；字段都在 top-level body）：

| provider | 关思考字段 |
|---|---|
| zhipu / moonshot(kimi) / minimax | `{"thinking":{"type":"disabled"}}`（minimax M2 接受但忽略，M3 才真生效） |
| siliconflow / qwen | `{"enable_thinking":false}` |
| openai / mistral / cohere | `{"reasoning_effort":"none"}`（flat，非 Responses 的 nested；cohere compat 端点仅 none/high） |
| openrouter | `{"reasoning":{"enabled":false}}`（勿用 exclude，仍计费） |
| gemini | bespoke：`thinkingConfig.thinkingBudget:0` |
| deepseek | thinkingOff（deepseek-reasoner 会拒收，靠 4xx 回退兜住） |
| groq / custom / ollama | **不加 thinkingOff**（groq 逐模型枚举互斥；custom/ollama 方言未知） |

改动后用 options 页联通性测试（options-connectivity.js）逐家验证；出现 400 先怀疑 thinking 字段与当前模型不兼容。

新增 provider、改默认端点或新增任何数据出口 → privacy.md 的 Network Requests / Permissions / Third-Party 三处必须同步披露（release.sh 文档硬门会拦，host 权限铁律见根文件）。
