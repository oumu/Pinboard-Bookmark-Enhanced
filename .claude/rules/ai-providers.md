---
paths:
  - "ai.js"
  - "popup-ai.js"
  - "options-connectivity.js"
---

# AI provider 深水区：关思考（thinking/reasoning）方言

**勿凭记忆改 provider 表**——model 字段是自由文本，blanket 关思考字段会打到用户切换后的不兼容模型（400/422）。机制：`ai.js` 的 `OPENAI_COMPAT_PROVIDERS` 每家用 per-provider `thinkingOff` 方言字段（非 always-on `extraBody`），经 `_aiWithDialectFallback` 在 4xx(400/422) 时去字段重试一次 + `storage.local` 记忆。

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

同一个包装器还管请求体参数方言（K133）：输出上限字段名是 per-provider 列 `tokenField`（openai = `max_completion_tokens`，其余留空即 `max_tokens`），`temperature` 则**不声明**——它在单一 provider 内逐模型变化（gpt-5 家族只接受默认值 1），只在服务端 400 点名后剥掉。两种修复都从服务端自己的 `error.param` / 报文里读（`handleAIError` 挂 `err.paramHint`），按 (provider, model) 记在 `storage.local` 的 `pbpAiParamFix`，**绝不做按 model id 的静态 allowlist**。Anthropic 的 `callClaude` / `_streamClaude` 用的 `max_tokens` 是 Messages API 必填字段，语义不同，永远不参与改名。

改动后用 options 页联通性测试（options-connectivity.js）逐家验证；出现 400 先怀疑 thinking 字段与当前模型不兼容。

新增 provider、改默认端点或新增任何数据出口 → privacy.md 的 Network Requests / Permissions / Third-Party 三处必须同步披露（release.sh 文档硬门会拦，host 权限铁律见根文件）。
