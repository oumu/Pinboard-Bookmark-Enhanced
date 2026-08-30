---
paths:
  - "docs/theme-surface/**"
  - "popup.css"
  - "options.css"
  - "library.css"
  - "pinboard-themes.js"
  - "tests/render-audit-checklist.mjs"
  - "tests/render-audit-known-failures.json"
  - "tests/ui-contract-tests.mjs"
  - "scripts/ui-render-audit.mjs"
---

# Theme Factory 深水区（站点主题 + 三表面 UI 主题）

`docs/theme-surface/` 是 token-driven 主题生成系统：13 套 preset 从 `pilots/*.tokens.json` 经 composer 渲染，写入四个文件——`pinboard-themes.js`（站点，全文件生成）+ `popup.css` / `options.css` / `library.css`（扩展 UI，各含**两个独立生成区**）。

## 两个生成区

- `@generated:ui-themes` — 逐主题颜色/状态角色，`popup-chrome.mjs` / `options-chrome.mjs` / `library-chrome.mjs` 经 `_ui-derive.mjs` 派生；pilot 可用 `ui.popup/options/library.light/dark` 调整受支持的输入角色。公共 finalizer 会在覆盖之后统一推导 `btn-fg` / `danger-quiet-fg` / `on-danger` / `chip-bg` / `chip-fg`；popup 另行推导 `preset-fg` / `spinner-fg`。这些是**输出角色，不是覆盖输入**，`validate-contracts.mjs` 会按 JSON pointer 硬阻断，禁止再出现“写了但被静默吃掉”。`on-accent` 是合法 popup 输入并逐主题显式发射，勿依赖 var() fallback——自定义属性继承使 fallback 成死代码。
- `@generated:ui-components` — 组件**结构**配方（按钮/chip/危险分级/表单几何 + 状态反馈，不分主题、三表面各一份），单源 `composers/ui-components.mjs`，独立哨兵（`start (popup|options|library)` / `end (...)`），**绝不**与 ui-themes 共用 `@generated:ui-themes end` 标记（这是 css-region-audit 解析区块的锚点）。

## 唯一编辑顺序

改 `composers/*.mjs` 或 `pilots/*.tokens.json` → `node docs/theme-surface/tools/sync-all.mjs`（写入并执行 12 道门）→ `node docs/theme-surface/tools/sync-all.mjs --check`（同一管线、严格只读、生成物逐字节一致）→ commit。**禁止手工编辑 `pinboard-themes.js` 与六个 `@generated:*` 区。** CSS 规则、声明和选择器列表统一经 `tools/css-syntax.mjs` 扫描；它保留字符串/注释/嵌套 component value 边界，并把 `@media`/`@supports` 等分组 at-rule 上下文纳入规则身份，工具内禁止再写正则或裸逗号/分号切分器。

## 间距边界（design-uplift 修订）

「组件原语 generated，页面布局手写」。**几何/间距 token 是主题不变量**（不逐主题覆盖——这也是 render-audit 单次扫描覆盖全部主题的前提）。间距 token（`--pp-sp-*` / `--opt-sp-*` / `--lib-sp-*`、reader 的 `--prose-fs` 族）**定义**落各文件手维护的 `:root`，不进 composer；配方经 `SPACING` adapter（ui-components.mjs 的 `sp(ns, px)`）把配方声明的像素语义映射到既有 token 档位——**禁止跨表面同名 `--sp-N` 直译**（三表面标尺刻度不同：popup/options 7 档、library 5 档）。页面级布局、reader prose 体系、单表面一次性特例仍手写。

## 质量门地图

Pre-commit 使用**同一组触发条件**（theme-surface 源、pinboard-themes.js 或三份 CSS 任一改动）：先跑复杂 CSS 语法回归，再跑完整 `sync-all --check` 只读管线，随后补跑 source/cascade/hand-edit/UI contract 门；任一红即 block，禁止 `--no-verify`。`scripts/setup-hooks.sh` 安装的是委托器而非脚本快照，受版本控制的 hook 脚本更新后无需重装。

`sync-all --check` 覆盖：`validate-contracts`、`render-all --check`、UI 六个生成区逐字节检查、13 个站点主题逐字节检查、`diff-all --strict --check`、`contrast-audit`、`css-region-audit`、`ui-token-coverage`、`layout-lint`、`url-lint`、`recipe-lint`、`override-debt`。其中 `override-debt` 从 CSS 解析器真实消费的 `(at-rule 上下文, selector, property, !important, theme)` 身份做 ratchet：删债直接通过，新增结构债必须阻断；禁止只看总数。补充门为 `token-coverage`、`cascade-lint`、`override-drift`、`handedit-audit` 与 `tests/ui-contract-tests.mjs`；CSS 解析器自身由 `tests/theme-css-syntax-tests.mjs` 固定复杂语法边界。

**verify.sh [theme] 段**还执行 `tests/theme-contract-tests.mjs`、`tests/theme-tooling-tests.mjs`、`tests/theme-css-syntax-tests.mjs`、`tests/theme-ui-derive-tests.mjs`、`tests/theme-override-debt-tests.mjs` 与 `tests/theme-sync-check-tests.mjs`；最后一项同时快照内容与 mtime，证明 `--check` 全程零写入。

**verify.sh [render-audit] 段**：`scripts/ui-render-audit.mjs` 用 playwright 装未打包扩展，逐主题量 `getComputedStyle` 与几何；断言清单来自**手写**的 `tests/render-audit-checklist.mjs`——**禁止从配方源生成**（同源会让「组件漏注册」类缺陷在生成器与审计器两侧同时消失）。`render-audit-known-failures.json` 是迁移期基线，**当前为空**（命中区债战役已清零，2026-08）。`hitAreaMin` 族不手工枚举选择器，由 runner 的 sweepProbe（family 4）类扫描全部无文字子节点的 `<button>`，一次通过覆盖全部主题。

## 迁移与删改陷阱（真实事故沉淀）

- **同特异性删除必须双向查；「外观相同」不能当「语义相同」删。** 生成区插入点移动会反转同特异性选择器的源序胜负；主题覆盖块里「看似冗余」的声明可能正在压制另一条特异性更高、源序更晚的规则（popup 密钥显隐 `background: transparent` 案，13 套预设立刻冒出不透明方块——COMPONENTS.md §8.6 + 附录 C32）。内部件覆盖一律写 `.<unit> > .<child>` 显式限定，不赌源序；删「冗余」声明前先量特异性、真机核对渲染。
- **断言问得太窄等于没门。** 只测命中过的选择器 = 枚举实例，同类新缺陷绕门无察觉；检查「存在」不代表覆盖「量级」（insetBand 被压到 ~2px 仍判过的教训——加严为量级 + 圆角阶梯比对才补上）。通用原则见根文件《测试与夹具》。
- **文本 grep 覆盖判定必被注释/字符串击穿。**「这个东西有没有被处理」的判定，要从程序真实消费的数据结构（注册表、Set、导出清单）拿答案，不要退回源码文本扫描（contrast-audit orphan 守卫被一条说明性注释击穿的案例）。

组件设计规范：`COMPONENTS.md`（结构配方 / token 对 / 几何约束 / 使用守则 + 状态反馈裁决表 + 人审清单）。新主题脚手架：`NEW_THEME.md`。
