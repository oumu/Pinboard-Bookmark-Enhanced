---
paths:
  - "popup.html"
  - "options.html"
  - "library.html"
  - "md-preview.html"
  - "popup.css"
  - "options.css"
  - "library.css"
  - "md-preview.css"
  - "shared.js"
  - "docs/theme-surface/ui-vocabulary.json"
  - "scripts/ui-vocabulary-baseline.json"
---

# UI 原语与设计语言（改任何表面 HTML/CSS 前必读）

设计语言不是靠记住规范，是靠**词汇注册表 + 门**。规范原文在 `docs/theme-surface/COMPONENTS.md`（§1–§9 组件族，§10 布局原语与关系律），注册表在 `docs/theme-surface/ui-vocabulary.json`，遗留基线在 `scripts/ui-vocabulary-baseline.json`。

## 新增任何 UI 元素，先答三问

1. **它属于哪个既有原语？** 先查注册表该表面的 `primitives`（options：`.fg` / `.fg-stack` / `.fg-indent` / `.fg-actions` / `.hint` / `.section-title` / `.divider` / `.choice-row` / `details.disclosure` + `.disclosure-body` / `.context-help-host` / `.pf`；popup：`.row` / `.label` / `.field` / `.suggest-area` / `.divider` / `.actions`（按钮行，gap sp-4）；library：`.notes-toolbar` / `.vocab-batch-bar` + `.notes-batch-bar` / `.notes-empty` / `.lib-cluster`（紧凑控件簇，gap sp-1）/ `.lib-section` / `.lib-block` / `.lib-quote`（详情面板的分节 / 文本块 / 引文）；md-preview：`.rail-section` / `.rail-label` / `.rail-sec-head` / `.msg-bar` / `.send-menu` / `.send-mi` / `.pop-panel`（浮层面板 chrome + sp-3 内距））。能用就用，不新造包装类。
2. **它的几何落在哪个阶梯？** 按钮/字段高度只有 md 26px 与 sm 20px 两阶（COMPONENTS.md §1.1 / §6.3），图标按钮命中区 ≥24px；按钮行 gap 一律 8px；可见文字 ≥11px；间距只用本表面的 `--*-sp-N` 刻度（md-preview 是 `--sp-N`）——margin、以及条/面板/弹层/行的 padding 与 gap 都算；控件与 chip 自身的竖向 inset 是组件几何（阶梯算术），可以是字面 px；圆角只用 `--*-radius-*` token。刻度外的字面 px 是缺陷，不是微调。
3. **它的间距由谁拥有？** 关系规则（容器 margin-bottom、`.fg > .fg-actions` 这类相邻规则）拥有间距；元素自身不带 margin，HTML 不写内联 `style="margin/padding/gap"`（layout-lint RULE 5 会 BLOCK）。

## 真要新造一个结构类

只有在三问都答"不能复用"时才新造：在 `ui-vocabulary.json` 对应表面的 `primitives` 登记（一个名字 = 一份几何契约），在 COMPONENTS.md §10 补一行契约，然后才写 CSS。`ui-vocabulary-lint` 会拦下任何名字像结构包装（`-row/-actions/-bar/-toolbar/-card/-section/...`，完整正则见注册表）却未登记、也不在遗留基线里的类；基线只能减不能增，`--write-baseline` 只在有意接受遗留时手动跑。

## 门在哪里响

- 编辑期：`.claude/settings.json` 的 PostToolUse 钩子对 Edit/Write 命中表面文件时跑 `scripts/ui-consumer-lint.mjs`（layout-lint + ui-vocabulary，<1s），红了直接把结论回喂。
- 提交期：`scripts/pre-commit-hook.sh` 第二触发组（HTML/JS/md-preview.css/注册表/基线）。
- push 期：`scripts/verify.sh` 的 `[ui-vocabulary]`；渲染几何由 `scripts/ui-render-audit.mjs` 的类扫描家族兜底（family 4–11，见 COMPONENTS.md §10.3）。`spacingScale` 的存量债在 `tests/render-audit-spacing-baseline.json`，只减不增：新写一个刻度外的 margin/padding/gap 会直接 FAIL，不要把它加进账本，改成 token。

## 已知反模式（本仓库真实踩过）

- 同一个「测试连接」按钮行三种 DOM 形态（内联 style / `.pf` 裸按钮 / `.vocab-entry-row`），间距 6/12/0px。
- 24px 帮助按钮撑高 grid 行，带帮助字段标签→控件 12.67px vs 4px。
- `.save-status` 基线 margin-left 对所有 flex 行都错，攒出 5 条逐行 reset。
- 两套折叠机制（JS accordion + native details）并存，三种标题面。
- 同特异性规则靠源序压住修复：`.fg-stack > label.bl` 与 `.fg label.bl` 平局，前者从未生效。
