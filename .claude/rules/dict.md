---
paths:
  - "md-dict.js"
  - "dict-pack.js"
  - "md-vocab-echo.js"
  - "ai-cache.js"
---

# 词典深水区（在线词典 / 离线词典包 / 缓存）

## 在线词典不变量（md-dict.js）

- `dict2_` 缓存键保留大小写；查询链：原词精确 → 语义未命中后的小写候选 → 再未命中后的 AI lemma。
- 只有 HTTP 404 与 HTTP 200 空/不可渲染结果属于**语义未命中**；超时、断网、429、5xx 和坏 JSON 都是**加载失败**，不能伪装成「没有词条」。实测（2026-07-29）：线上服务对查无此词返回 `200 + {"entries":[]}`，不是 404——404 分支是防御性保留（代理/上游变更），别当主路径读，也别因为「没见过 404」就删掉。
- Free Dictionary API 连续 3 次网络类失败后在本会话熔断 60 秒，父级 abort 不计失败；Wiktionary 兜底固定导航到 English Wiktionary，不是后台请求。
- `dict2_` 最多保留 **500 条缓存**（独立 LRU）；其他缓存仍最多 200 条（全局上限）。这不限制查词次数、`pbp-vocab` 生词数量或 CC-CEDICT 词条数；原词别名与实际命中词可分别占一条记录。

## ECDICT 英汉包不变量（dict-pack.js）

- 扩展只读 ECDICT 的 CSV 字段布局，**不发网络请求、不提供下载链接、不指向来源、不申请任何 host permission**——文件由用户自备，其许可由用户负责；UI 与 privacy.md 一律不得写成已确认的数据许可。
- 三档谓词 R1⊆R2⊆R3 **必须单调**（升档只增不减）；基础条件（`word` 归一后非空 AND `translation` trim 后非空 AND 按字面 `\n` 切分后至少一个非空 sense）先于 rung 判定。未闭合引号 → **拒绝整个文件**（跳行会让续行变成伪记录）。
- 导入是**原子替换**（IDB schema v2）：全量解析成功且所有资源门通过后才开唯一事务，`clear + put×N + meta.put` 同 scope `[ecdict, packs]`；`meta.put` 必须在最终批最后一个 request 的 `success` 回调内**同步**排入；**禁止**对 request error 调 `preventDefault()`。
- 查词槽拆 `.xp-dict-local` / `.xp-dict-online` 两个稳定子容器，**任何路径都不得 `replaceChildren()` slot 本身**；本地支线只在 `en` 启动、不被在线链 await、失败一律 UI 静默但须 `console.warn`，且不写 `cur.*`。
- 导出侧的中文是**设备级现算**：compute-only，不回写 `pbp-vocab`、不进 Drive，Anki 六字段不变。性能验收走 `scripts/ecdict-import-perf.mjs`（不进 pre-commit / verify.sh）。
- CC-CEDICT 汉英包（.txt/.txt.gz/.zip）命中中文查词时短路在线链；dict-pack 在 options 静载、md-preview 懒加载。
