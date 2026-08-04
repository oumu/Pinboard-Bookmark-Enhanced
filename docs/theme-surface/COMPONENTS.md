# 组件设计规范（COMPONENTS.md）

扩展 UI 三表面（popup / options / library）的组件层单一真源。与 `NEW_THEME.md` 并列：
`NEW_THEME.md` 管「怎么加一套主题」，本文管「一个组件长什么样、消费哪对 token、几何要满足什么、
什么时候该用哪一档」。

**谁消费本文**：

| 消费方 | 消费哪部分 |
|---|---|
| `composers/ui-components.mjs`（`@generated:ui-components` 区的配方源） | 每节的**结构配方** |
| `composers/_ui-derive.mjs` + 三个 `*-chrome.mjs` | 每节的**消费 token 对**（派生要求） |
| `tools/recipe-lint.mjs`（配方单源静态门） | **几何约束**里标 `[static]` 的条目 |
| `tests/render-audit-checklist.mjs`（**手写** oracle，禁止从配方源生成） | **几何约束**里标 `[render]` 的条目 |
| `tools/contrast-audit.mjs` | 消费 token 对表派生出的配对清单 |
| 人（代码审查 / 真机验收） | **使用守则** + 附录 A 人审清单 |

**记号约定**：

- `{ns}` = 表面命名空间，取 `pp`（popup）/ `opt`（options）/ `lib`（library）。配方里写 `var(--{ns}-btn-fg)`，
  发射时展开成三份。
- 颜色一律**无 fallback** 的 `var(--{ns}-x)`。带 fallback 的 `var(--x, #fff)` 会被 `ui-token-coverage`
  的正则排除出 used 集合，静默逃门——生成区内禁止出现。
- **间距一律写像素值**（`padding: 4px 16px`）。三表面 `--sp-*` 刻度不同（popup/options 7 档 2..24，
  library 5 档 4..24），配方**不得**引用 `--{ns}-sp-N`；由 `ui-components.mjs` 的 SPACING adapter 在发射时
  映射到该表面**数值相等**的 token，无对应档位发射字面 px。
- **圆角写 token 名**（`var(--{ns}-radius-md)`）。radius 三表面同名同角色（sm 在 options 是 3px、library 是
  4px，属刻度差异，与间距不同的是它不需要跨表面数值相等），直接引用不会算错。
- 过渡时长引用既有动效 token：options / library 是 `--motion-state`（150ms）、`--motion-pop` / `--motion-pop-out`，
  popup 是 `--pp-motion-state`。配方里按 ns 展开，别写字面毫秒。
- 本文给出的所有像素值是**规范值**，不是「现状抄录」。与现状的差异逐条列在附录 C。

---

## 0. 适用范围与豁免

| 组件族 | popup | options | library |
|---|---|---|---|
| 1 按钮族（几何 + 颜色 + 状态） | **豁免**（见下） | 全量 | 全量 |
| 2 btn-ic 图标容器 | 基础规则（display/align/svg） | 全量 | 全量 |
| 3 状态反馈 | **豁免**（现状记录在案） | 全量 | 全量 |
| 4 危险分级 | **豁免**（confirm-popover 是 warn-on-warn） | 全量 | 全量 |
| 5 chip / badge | 几何律适用（施工排期见附录 C） | 全量 | 全量 |
| 6 表单控件 | 颜色对 + `accent-color` | 全量 | 全量 |
| 7 横切（color-scheme / focus / 状态色 / 成对消费） | 全量 | 全量 | 全量 |

**popup 豁免的确切边界**（本战役不动，随「popup 按钮族归一」后续战役再议）：

- popup **没有 `.btn` 族**：`popup.html` 零处 `class="btn"`，按钮是一次性配方——六套主力
  （`qbtn`:650 / `preset-btn`:308 / `fc-btn`:248 / `#submit-btn`:562 / `del-btn`:579 / `md-strip-btn`:2031），
  另有 `fc-btn-secondary`:259、`action-link`:378、`clear-all-link`:495、`offline-clear`:848、
  `header-ic`（`.header-bar .header-ic .btn-ic`:174）等链接态与图标态变体。按钮**几何**（高度阶梯、
  padding、字号）与**手感**（hover 抬起 `translateY(-1px)`、按下回位）本战役一律不动。
- popup 的 `.confirm-popover` 是 **warn-on-warn**（warn 底 + warn 前景），不是 danger 实底。§4 的危险两档
  **不适用于 popup**；统一它需要新造 `danger × warn-bg` 审计对，无门看管，本战役不做。
- popup 在本战役吃到的是：颜色补课（成对 token + `:root` / `html.dark` 基线）、`color-scheme` 发射、
  `.btn-ic` 基础规则等值发射、裸 hex 治理。

---

## 1. 按钮族

**适用**：options + library 的几何与颜色；popup 只吃 §7 的成对消费律，不吃本节几何。

### 1.1 高度阶梯（三个数，不再有第四个）

行盒高度由 `line-height` 钉死，**不靠 `line-height: normal`**——`normal` 随字体族浮动，中文回退到
YaHei/PingFang 时行盒比 Latin 高一截，同一颗按钮在 zh-CN 和 en 下高度不同。声明 line-height 之后，
字号可以在阶内浮动而高度不变，这正是「同行控件对齐」得以成立的机制。

| 阶 | 计算高度 | line-height | padding-block | border | 允许字号 | 用途 |
|---|---|---|---|---|---|---|
| **md** | **26px** | 16px | 4px | 1px | 12–13px | 页面主按钮、表单字段、与字段并排的控件 |
| **sm** | **20px** | 14px | 2px | 1px | 11–12px | 密集工具条、列表行内动作、详情面板内联动作 |
| **row** | 由内容撑 | 继承 | ≥4px | 0 | 继承 | 整行可点元素（`.notes-hit-btn` / `.notes-card-top` / `.notes-sib`），不属于 `.btn` 族 |

高度 = padding-block×2 + line-height + border×2。md = 4+4+16+1+1 = 26；sm = 2+2+14+1+1 = 20。

### 1.2 结构配方

```css
/* base (md rung) */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 16px;
  font-size: 12px;
  line-height: 16px;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid var(--{ns}-border);
  border-radius: var(--{ns}-radius-md);
  background: var(--{ns}-btn-bg);
  color: var(--{ns}-btn-fg);
  transition: background var(--motion-state), border-color var(--motion-state), color var(--motion-state);
}
.btn:hover:not(:disabled) { background: var(--{ns}-btn-hover); }
.btn:active:not(:disabled) { transform: scale(0.97); }              /* 不进 transition：见 §3 */
.btn:focus-visible { outline: 2px solid var(--{ns}-accent); outline-offset: 2px; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* sm rung */
.btn-sm { padding: 2px 8px; font-size: 11px; line-height: 14px; }

/* ghost chrome（与档位正交的第三种外壳；两表面各已存在手写副本，归并可选） */
.btn.ghost { background: transparent; border-color: transparent; }
.btn.ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--{ns}-fg) 6%, var(--{ns}-bg)); }
```

`transform` **不在** `transition` 列表里——这是按压瞬时性的实现手段，不是遗漏（§3 裁决 1/2）。

`display: inline-flex` 上移到 `.btn` 基类，取代 options 现有的 `a.btn` 专条：类选择器不看标签，
`<a class="btn">` 与 `<button class="btn">` 自动同形。`gap: 4px` 由此接管图标与文字的间距，
`.btn-ic` 不再需要 `margin-right`（§2）。

### 1.3 消费 token 对

| 属性 | token | 派生要求 |
|---|---|---|
| `background` | `--{ns}-btn-bg` | 既有 |
| `background`（hover） | `--{ns}-btn-hover` | 既有 |
| `color`（默认与 hover 共用一个值） | **`--{ns}-btn-fg`** | `fgToAAMulti(fg, [btn-bg, btn-hover])`——对**两个**背景同时 ≥4.5:1。只声明一次，hover 规则不重复声明。`fgToAAMulti` 现是 `library-chrome.mjs:11-23` 的本地函数，`_ui-derive.mjs` 只有 `fgToAA`/`bgToAA`/`pairToAA`；Task 5 把它上移并 export 后三表面共用 |
| `border-color` | `--{ns}-border` | 既有；对 `btn-bg` ≥3:1（非文本对比，WCAG 1.4.11） |
| `outline`（focus） | `--{ns}-accent` | 对 `bg` 与 `panel` ≥3:1 |

**缺陷 1/4 死在这一行**：两表面的 `.btn` 基类都不声明 `color`，文字与 `currentColor` 图标掉到 UA 的
`ButtonText` 系统色（跟随浏览器明暗偏好，不跟随 `data-theme`）。两表面的暴露面**不同**，别写成同一句话：

- **library**：全文没有任何 `html[data-theme] .btn` 覆盖，**13 套预设 + 默认态全中招**。上面那份
  1.10:1（dracula）/ 1.73:1（nord-night）/ 1.08:1（terminal）的实测值来自 library。
- **options**：`options.css:1325` 的 `html[data-theme] .btn { … color: var(--opt-fg) }` 在 themed 态兜住了，
  ButtonText 回退**只咬无预设的默认态**（`html { color-scheme: light }` 又让它落在近黑上，所以浅色默认
  表面看不出问题）。这也正是它的裸 hex 与默认表面从没进过对比度门的原因。

`--{ns}-btn-fg` 的存在意义就是让这个属性在**所有**表面（含默认态）都有一个必然被主题化、且经 AA 派生的值。

**`html[data-theme]` 覆盖层必须在同一 commit 里删除**（与 §7.2 对 `color-scheme` 的指令同款）：
`options.css` 的下列手写规则位于生成区插入点（≈:341）**之后**、特异性 (0,2,1) 高于配方的 (0,1,0)，
composer 一旦开始发射 `color: var(--opt-btn-fg)`，它们会逐条覆盖回去，让新 token 在 13 套预设下**全成死代码**：

| 行 | 规则 | 被谁取代 |
|---|---|---|
| `options.css:1325` | `html[data-theme] .btn { background; border-color; color: var(--opt-fg) }` | 配方基类的 `btn-bg` / `border` / **`btn-fg`** |
| `options.css:1326` | `html[data-theme] .btn:hover { background: var(--opt-btn-hover) }` | 配方的 `:hover` 规则 |
| `options.css:1359` | `html[data-theme] .btn:focus-visible { outline-color: var(--opt-accent) }` | 配方 focus 规则里的 `outline: 2px solid var(--opt-accent)` |

删除时机是**发射的同一个 commit**，不是「之后再清」——中间状态下新 token 无效，渲染 oracle 会绿着骗人。

### 1.4 几何约束

| ID | 断言 | 层 |
|---|---|---|
| `btnRung` | `.btn` 计算高度 = 26±1px；`.btn.btn-sm` = 20±1px | `[render]` |
| `btnPairedFg` | 配方里任何声明 `background` 的按钮规则，其组件族基类必须声明 `color` | `[static]` |
| `textContrast` | 按钮文字色 vs 实际合成背景 ≥4.5:1（`:disabled` 除外，WCAG 1.4.3 豁免禁用控件） | `[render]` |
| `iconContrast` | 按钮内 SVG 描边色 vs 实际合成背景 ≥3:1（WCAG 1.4.11） | `[render]` |
| `hitAreaMin` | icon-only 按钮的命中盒（含 `::before` 扩张）短边 ≥24px | `[render]` |
| `noSpVar` | 配方发射结果中不出现 `var(--{ns}-sp-` | `[static]` |
| `noVarFallback` | 配方发射结果中不出现 `var(--x, ...)` 形式 | `[static]` |

### 1.5 使用守则

- **选阶**：这颗按钮和什么并排？与输入框/表单字段并排 → md。在密集工具条或列表行里 → sm。
  独自站在页面主流程里 → md。**同一行内不得混阶**（§6 同行对齐律）。
- **sm 阶的 icon-only 按钮命中区不达标**（20px < 24px）。补救按轴选择：纵向不与邻居冲突就
  `::before { content:""; position:absolute; inset:-2px 0 }`；两轴都能扩就 `inset:-2px`；扩张会与相邻
  控件命中盒重叠（例如与输入框熔接的步进器）时，把**整行**升到 md 阶而不是留一个不达标的靶子。
  样板：`.row-del-x`（library.css）已用 `::before { inset:-3px -1px }` 做过一遍。
- **覆盖 `.btn` 的 `display` 会同时取消 `gap`**。只有纯文字按钮（`.vocab-load-more`，`display:block` 居中）
  和 icon-only 按钮（`.vocab-group-step`，`display:inline-grid` 居中）可以这么做；带「图标+文字」的按钮
  一律不许改 `display`，否则图标与文字贴死。
- 生成区**物理位置钉在各文件当前组件配方处**（library ≈:119 / options ≈:341 / popup ≈:137），不许搬到
  文件尾。`.row-del-x`、`.vocab-load-more`、`.vocab-selection-actions .btn`、`.vocab-batch-cluster > .btn`、
  `.vocab-group-step` 这些同特异性 (0,1,0) 手写规则**靠源顺序赢**，换位置会静默翻转级联。
- 新增按钮先 grep 同表面同类控件，归入既有阶与档，不新造第三套 padding。

---

## 2. 按钮内图标（`.btn-ic`）

**适用**：三表面。这是本战役里 popup 唯一进生成区的结构规则。

### 2.1 结构配方

```css
/* options / library：宿主是 flex 按钮，间距归 gap */
.btn-ic { display: inline-flex; align-items: center; }
.btn-ic svg { display: block; }

/* popup：宿主是 inline 上下文的一次性按钮配方，保留基线补偿与自带间距 */
.btn-ic { display: inline-flex; align-items: center; vertical-align: -3px; margin-right: 4px; }
.btn-ic svg { display: block; }
```

两份差异**收在密度表里显式声明**（`ui-components.mjs` 的 per-ns 参数），不是散落例外。差异的成因是
§0 的 popup 豁免：popup 按钮没有统一的 flex 容器可提供 `gap`。

`display: block` 消掉 SVG 的 baseline 空隙；`align-items: center` 让图标与文字按视觉中线而非基线对齐。
inline 元素的默认基线对齐在「图标 + 文字」场景下几乎总是错的。

**图标与文字的间距归宿主的 `gap`，不归 `.btn-ic`**（options/library）。`.btn-ic` 里只有一个 SVG，
在它自己身上写 `gap` 不产生任何间距；间距发生在「图标 span ↔ 文字节点」之间，只有宿主按钮作为 flex
容器时才能用 `gap` 表达。options 的 `a.btn { display:inline-flex; …; gap }` 已经把这个形状验证过一遍，
§1.2 把它从 `a.btn` 上移到 `.btn`。popup 宿主不是 flex 容器，所以那一份保留 `margin-right`。

### 2.2 消费 token 对

无自有颜色。图标 `stroke="currentColor"` 继承宿主按钮的 `color`——因此 §1.3 的 `--{ns}-btn-fg`
同时是图标色，`iconContrast` 与 `textContrast` 查的是同一个继承链上的两个阈值（3:1 与 4.5:1）。
**不要**给图标另开 token：图标色与文字色分家会让两者在 hover 态各自漂移。

### 2.3 几何约束

| ID | 断言 | 层 |
|---|---|---|
| `iconVCenter` | 图标 SVG 盒的垂直中线 vs 宿主按钮内容盒的垂直中线，差 ≤1px | `[render]` |
| `btnIcBase` | 配方中存在无限定的 `.btn-ic { display:inline-flex; align-items:center }` 与 `.btn-ic svg { display:block }` | `[static]` |

### 2.4 使用守则

- **缺陷 5 的形状**：`library.css` 只有四条容器限定的等价规则
  （`.row-del-x` / `.vocab-sort-btn` / `.vocab-batch-bar .btn` / `.vocab-group-step`），详情面板里的
  `.vocab-detail-delete`、`.vocab-detail-relookup`、`.vocab-detail-speak`、`.notes-detail-delete` 全部落回
  `display: inline` 吃基线对齐。全局基础规则落地后，这四条窄例外**必须删掉**（留着只会掩盖下一次同类缺口）。
- 图标只从 Lucide v0.525.0 同版本取 path，24-box、stroke 2。SVG 内**禁止 `<text>` 节点**（CJK 字形会踩
  字体回退停顿）。语义分配见附录 A。
- UI 里禁止字面 emoji / dingbat 字符（⚠ ✓ ✗ ↻ ▸ ▾ ℹ …），一律走 `PBP_ICONS` 内联 SVG。
  `U+FE0E` 与 `font-variant-emoji: text` 在 Chrome 实测无效，不要依赖。

---

## 3. 状态反馈（hover / active / focus-visible / disabled）

**一等条目**。现状至少五种按压语言并存，本节把 options + library 收敛成两种（`.btn` 族一种、可点行一种），
popup 维持现状并记录在案。

### 3.1 裁决表

| # | 现状（证据） | 表面 | 裁决 | 理由 |
|---|---|---|---|---|
| 1 | `options.css:346` `.btn:active { transform: translateY(1px) }`，`:341` 的 `transition` 只列 `background/border-color/color`——**transform 不在过渡里 = 瞬时**。`a373dbd` commit message 写明「press must read instantly」，且这些按钮随后要在多秒网络调用里发呆，按压是唯一确认点击落地的信号 | options | **半保留半推翻**：保留「瞬时」，推翻「translateY」 | 瞬时性是这条裁决真正论证过的部分，且论据（按钮随后 inert）在 library 同样成立；位移量的选择当时没有被论证 |
| 2 | `library.css:124` `.btn:active { transform: scale(0.97) }`，注释「a press-down affordance that also reads on wide/short buttons where a 1px vertical nudge is barely visible」；`:120` 的 `transition` **含** `transform var(--motion-state)`（150ms 动画） | library | **半保留半推翻**：保留「scale(0.97)」，推翻「transform 进 transition」 | 几何论证成立：本仓库大量按钮是 200px 宽 / 20–26px 高的扁按钮与 26px 图标方块，1px 纵向位移在这种比例上读不出来；scale 与尺寸成比例。过渡则与裁决 1 冲突，按裁决 1 去掉 |
| **收敛结果** | — | options + library | **`.btn` 族唯一按压语言 = `transform: scale(0.97)`，不进 `transition`（按下与回弹都瞬时）** | 两条既有裁决各保留自己真正论证过的那一半；`a373dbd` 的核心结论「同页不得有两种按压」在此从「同页」扩到「同族跨表面」 |
| 3 | `library.css:945` `.vocab-stat-chip:active { transform: translateY(1px) }` | library | **推翻** → 改 `scale(0.97)` 瞬时 | stat-chip 是 `aria-pressed` 切换钮，视觉家族归 chip、按压家族归按钮；20px 高的扁 chip 上 1px 位移不可见，与收敛结果同理 |
| 4 | `library.css:509` `.notes-sib:active { background: color-mix(--lib-fg 9%, --lib-bg); transition-duration: 0s }`，`a373dbd` 补齐，与同侪 `.notes-hit-btn:active` / `.notes-card-top:active` 同配方 | library | **保留**，并升格为第二种按压语言 | 这些是**整行可点**元素，不是 `.btn`。`scale()` 会连带缩放子元素与文字（行文字发糊）、并在密集列表里破坏相邻行的视觉对齐。行按压 = 瞬时背景加深、禁 transform，是正确的分家而不是漏收敛 |
| 5 | `popup.css:2072` `#submit-btn:hover, .qbtn:hover { transform: translateY(-1px) }`，包在 `@media (hover:hover) and (pointer:fine)` 里；`:2067` 注释：这是本页唯一改几何的 hover，touch 上 `:hover` 会 latch，按钮会停在抬起态 | popup | **不动**（§0 豁免） | popup 无 `.btn` 族，几何与手感整体列后续战役。但其 media query 门控上升为 §7 的三表面横切规则 |
| 6 | `popup.css:573` `#submit-btn:active { transform: translateY(0); box-shadow: none }`（从 hover 抬起态回位） | popup | **不动** | 同上。记录为已知分歧：popup 是「hover 抬起、按下回位」，options/library 是「静止、按下缩小」 |
| 7 | `a373dbd` 删掉 `a.btn` 的 `scale(0.97)` + transition 覆盖，理由「同页两种按压 + press must read instantly」 | options | **保留结论并扩大适用范围** | 本裁决表就是这条结论从「同页」扩到「同族跨表面」的执行 |
| 8 | hover 颜色过渡：两表面 `.btn` 均为 `transition: background/border-color/color var(--motion-state)`（150ms） | options + library | **保留** | 颜色/hover 变化用默认 `ease`，150ms 落在 100–300ms 区间内；逐属性列出而非 `all` |
| 9 | `:disabled { opacity: 0.45; cursor: not-allowed }` | options + library | **保留** | 两表面一致；opacity 同时压前景与背景，对比度必然下降——WCAG 1.4.3 豁免禁用控件，**对比度断言必须跳过 `:disabled`**，不要「修」它 |

### 3.2 结构配方（状态部分，与 §1.2 同源）

```css
.btn:hover:not(:disabled)  { background: var(--{ns}-btn-hover); }
.btn:active:not(:disabled) { transform: scale(0.97); }   /* transform 不在 transition 列表内 */
.btn:focus-visible         { outline: 2px solid var(--{ns}-accent); outline-offset: 2px; }
.btn:disabled              { opacity: 0.45; cursor: not-allowed; }

/* 行按压语言（整行可点元素；不属于 .btn 族，配方在此登记以免被误当遗漏） */
.<row>:hover  { background: color-mix(in srgb, var(--{ns}-fg) 5%, var(--{ns}-bg)); }
.<row>:active { background: color-mix(in srgb, var(--{ns}-fg) 9%, var(--{ns}-bg)); transition-duration: 0s; }
.<row>:focus-visible { outline: 2px solid var(--{ns}-accent); outline-offset: -2px; }
```

### 3.3 几何 / 时序约束

| ID | 断言 | 层 |
|---|---|---|
| `pressInstant` | `.btn` 的 `transition-property` 不含 `transform` | `[static]` + `[render]` |
| `noTransitionAll` | 配方中不出现 `transition: all` | `[static]` |
| `motionBudget` | 配方中所有 `transition-duration` ≤200ms | `[static]` |
| `hoverGeomGated` | 任何改变几何（transform/width/height/margin）的 `:hover` 规则必须包在 `@media (hover:hover) and (pointer:fine)` 内 | `[static]` |
| `focusRingContrast` | `outline-color` vs 相邻背景 ≥3:1 | `[render]` |

### 3.4 使用守则

- 每一个可按压元素都必须有 `:active` 反馈。缺 `:active` 是 `a373dbd` 已经抓过一次的漏（`.notes-sib`）。
- 选语言看**元素形态**，不看它长得像不像按钮：有边框/背景的独立控件 → `.btn` 族（scale）；
  撑满一栏、内容自撑高度的可点行 → 行语言（背景加深）。二选一，不许第三种。
- 按压反馈禁止走 `transition`；hover 的**颜色**变化必须走 transition（否则颜色跳变读起来像故障）。
- `prefers-reduced-motion` 下不需要为按压做特殊处理——它本来就没有动画。已有的全局 reduce 块
  （`animation-duration: 0.01ms !important` 等）不动。

---

## 4. 危险操作分级（两档）

**适用**：options + library。popup 的 `.confirm-popover` 是 warn-on-warn，**不适用**（§0）。

### 4.1 两档定义

| 档 | 出现位置 | 前景 | 底/边 |
|---|---|---|---|
| **quiet destructive** | 除确认弹层外的**所有**破坏性动作：列表行删除、详情面板删除、批量工具条删除 | `--{ns}-danger-quiet-fg` | 沿用宿主按钮的 chrome（`.btn` 有底有边 / `.ghost` 透明）；hover 才升出淡红底与红边 |
| **solid destructive** | **只有**确认弹层的确认钮（`.confirm-popover .confirm-yes`） | `--{ns}-on-danger` | `--{ns}-danger` 实底 |

「档」只规定**颜色权重**，不规定 chrome。同一档在密集工具条里（`.btn` 常规底与边）和在阅读正文流里
（`.ghost` 透明）看起来轻重不同——这个差异由所处容器提供，不需要第三档 CSS。

### 4.2 结构配方

```css
/* quiet：类名沿用 .btn.danger，配方重定义。JS 侧 className 无需改动
   （library-vocab.js:513 / library-notes.js:405 已经是 "btn btn-sm danger"） */
.btn.danger { color: var(--{ns}-danger-quiet-fg); border-color: color-mix(in srgb, var(--{ns}-danger) 55%, var(--{ns}-border)); }
.btn.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--{ns}-danger) 8%, var(--{ns}-btn-bg)); }

/* quiet + ghost chrome：阅读面（详情面板）的删除按钮 */
.btn.danger.ghost { border-color: transparent; background: transparent; }
.btn.danger.ghost:hover:not(:disabled) {
  background: color-mix(in srgb, var(--{ns}-danger) 8%, var(--{ns}-bg));
  border-color: color-mix(in srgb, var(--{ns}-danger) 45%, transparent);
}

/* solid：唯一允许的实底红 */
.confirm-popover .confirm-yes {
  background: var(--{ns}-danger);
  color: var(--{ns}-on-danger);
  border-color: var(--{ns}-danger);
}
/* hover 保持 background 不变，只加 inset 环——这正是 13 套预设现在的做法
   （options.css:1336 / library.css:214）。默认表面现状是把底色压深（#a00 / --lib-danger 的旧 fallback），
   收敛到预设的做法后所有表面一致；代价见附录 C14。 */
.confirm-popover .confirm-yes:hover { box-shadow: inset 0 0 0 1px var(--{ns}-on-danger); }
```

### 4.3 消费 token 对

| 属性 | token | 派生要求 |
|---|---|---|
| quiet 前景 | **`--{ns}-danger-quiet-fg`** | `fgToAAMulti(danger, [bg, panel, btn-bg])` ≥4.5:1。**三个背景**：quiet 档会出现在页面底（详情面板 ghost）、面板底（卡片内）、按钮底（工具条 `.btn`） |
| quiet hover 底 | `color-mix(danger ≤10%, <已审计背景>)` | 混入比例 ≤10%，使被审计的 `danger-quiet-fg × 背景` 配对仍具代表性（`contrast-audit` 解析不了 `color-mix`） |
| solid 底 | `--{ns}-danger` | 既有 |
| solid 前景 | **`--{ns}-on-danger`** | `pairToAA(danger)` ≥4.5:1。现状 `.confirm-yes` 用 `--lib-panel` / `--opt-panel` 当前景，这是**未经审计的借用**，本 token 就是来取代它的 |

### 4.4 几何 / 结构约束

| ID | 断言 | 层 |
|---|---|---|
| `solidDangerScope` | 配方里 `background: var(--{ns}-danger)` 只出现在 `.confirm-popover .confirm-yes` 选择器上 | `[static]` |
| `dangerPaired` | 任何声明 `--{ns}-danger` 作背景的规则必须同规则声明 `--{ns}-on-danger` 作前景 | `[static]` |
| `dangerQuietContrast` | `danger-quiet-fg` vs bg / panel / btn-bg 三者均 ≥4.5:1；hover 态同测 | `[render]` |

### 4.5 使用守则

- **判断题**：这颗按钮点下去会不会立刻发生不可撤销的事？会 → 它一定在确认弹层里 → solid。
  它只是打开确认弹层 / 只是删一条可再抓取的本地记录 → quiet。**没有第三种答案。**
- 视觉权重随「距离真正执行」的远近递增：入口安静、确认响亮。同一个删除动作在两个位置权重不同是对的。
- **缺陷 6 的形状**：`.notes-detail-delete` 与 `.vocab-detail-delete` 常亮红字红边地嵌在 15px/1.65
  行高的阅读正文流里，没有任何降噪。它们归 quiet + ghost。同文件的 `.row-del-x`（默认 `opacity: 0`，
  行 hover 才现身）是 quiet 档的**行内变体**——同一档 + 列表行特有的渐进披露，不是第三档。
- **`.notes-detail-delete.is-error` 是类级联依赖**（`library.css:442`）：失败标记用 `box-shadow` 而不是
  background，注释写明理由是「`.btn.danger:hover` 的 background 会赢过它并在下一次指针经过时抹掉失败痕迹」。
  改 danger 配方**必须**复核这个标记在新配方下仍可见——进附录 A 人审清单，不是自动门能判的。

---

## 5. chip / badge

**适用**：几何三定律三表面通用；颜色对三表面通用。施工排期见附录 C。

### 5.1 pill 三定律

1. **圆角 = 高度 / 2**。声明 `border-radius: var(--{ns}-radius-full)`（9999px）即等价——浏览器把它钳到
   短边的一半。断言时取**有效半径** `min(declared, height/2)`，不要读 computed 的 9999px。
2. **水平 padding ≥ 有效圆角半径**。否则弧线切进文字的可视包围盒，首尾字符贴边。
3. **垂直 padding ≥ 2px**。垂直 padding 为 0 时 chip 高度完全由行盒撑出，配上满圆角就是缺陷 3
   的确切形状（`.vocab-group-chip` 现状 `padding: 0 4px`）。

定律 1、2 只约束 pill（`radius-full`）；定律 3 约束所有 chip/badge，包括用 `radius-sm` 的
`.vocab-stat-chip`（现状 `padding: 1px 8px`）。

### 5.2 结构配方

```css
/* chip 阶：line-height 14px + padding-block 2px -> 无边框高 18px（有效半径 9px）、带边框高 20px（10px）。
   水平 10px 覆盖两种情况的有效半径。字号 10-12px 在阶内浮动，高度由 line-height 钉死。 */
.<chip> {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  font-size: 11px;         /* 实例可取 10-12px，不改 line-height */
  line-height: 14px;
  border-radius: var(--{ns}-radius-full);
  background: var(--{ns}-chip-bg);
  color: var(--{ns}-chip-fg);
}

/* 可按压 chip（aria-pressed 切换钮）追加按钮族的状态语言，不追加按钮族的几何 */
.<chip>[aria-pressed]:hover  { background: var(--{ns}-btn-hover); }
.<chip>[aria-pressed]:active { transform: scale(0.97); }
.<chip>[aria-pressed]:focus-visible { outline: 2px solid var(--{ns}-accent); outline-offset: 2px; }
```

方角 chip（`radius-sm`，如 `.vocab-stat-chip`）沿用同一 padding-block（≥2px）与 line-height，
只换 `border-radius`；定律 2 不适用。

### 5.3 消费 token 对

| 属性 | token | 派生要求 |
|---|---|---|
| `background` | **`--{ns}-chip-bg`** | 新增派生。现状 `tag-bg`/`tag-fg` 直取 palette **无 AA 校正** |
| `color` | **`--{ns}-chip-fg`** | `fgToAA(chip-fg, chip-bg)` ≥4.5:1。chip 若可按压（`[aria-pressed]`，hover 底换成 `btn-hover`），改用 `fgToAAMulti(chip-fg, [chip-bg, btn-hover])` |

popup 现有的 `--pp-tag-bg` / `--pp-tag-fg` 是同一角色的旧名。Task 5 发射新名、消费点迁移完成后
**退役旧名，不留别名**——两套真源迟早会漂移。

### 5.4 几何约束

| ID | 断言 | 层 |
|---|---|---|
| `padGteRadiusH` | pill chip：`padding-inline ≥ min(border-radius, height/2)` | `[render]` + `[static]` |
| `padVMin` | 所有 chip/badge：`padding-block ≥ 2px` | `[render]` + `[static]` |
| `chipTextContrast` | `chip-fg` vs `chip-bg` ≥4.5:1；可按压 chip（`[aria-pressed]`）hover 底是 `btn-hover`，故其 `chip-fg` 须对 **`[chip-bg, btn-hover]` 双背景**同时 ≥4.5:1（同 §1.3 的 `fgToAAMulti` 模式） | `[render]` |

### 5.5 使用守则

- 圆角**不是常数选择题**：32px 高的 chip 配 16px 圆角是标准药丸，同样 16px 放到 400px 卡片上根本看不出圆角。
  chip 用 `radius-full` 让它自己算；卡片/面板用 `radius-md`/`radius-lg`。
- **`.notes-meta-chip` 不属于 chip 族**：它是站点名/日期/语言的裸文本 span，刻意无药丸外观。
  真正提供药丸的是复合类里的 `.vocab-group-chip`。给 `.notes-meta-chip` 加背景会让每条元信息都变成标签，
  是本节要防的事故。
- **`.vocab-status-chip` 现状零规则**（DOM 里有这个类，CSS 里没有任何声明），退化成裸 `.notes-meta-chip`。
  它归 chip 族还是保持裸文本，是设计判断题，进附录 A 人审清单——本规范不替它拍板，也不许施工者顺手
  给它套一个配方了事。

---

## 6. 表单控件（input / select / textarea / checkbox / radio）

**适用**：options + library 全量；popup 只吃颜色对与 `accent-color`。

### 6.1 结构配方

```css
/* 字段基类（md 阶：13px 字号在 16px 行盒里，高度与 .btn 一致 = 26px） */
.fg input[type="text"], .fg input[type="password"], .fg input[type="number"], .fg select, .fg textarea {
  width: 100%;
  padding: 4px 8px;
  font-size: 13px;
  line-height: 16px;
  font-family: inherit;
  border: 1px solid var(--{ns}-input-border);
  border-radius: var(--{ns}-radius-md);
  background-color: var(--{ns}-input-bg);
  color: var(--{ns}-fg);
  -webkit-appearance: none; appearance: none;
  box-shadow: none;
  transition: border-color var(--motion-state) ease, background-color var(--motion-state) ease, box-shadow var(--motion-state) ease;
}
/* hover 边框：不开新 token，在既有两个 token 之间取混色（现状是字面 #9aa0a6，hex ratchet 要清掉）。
   同一 commit 必须删掉 options.css:1192-1196 的 html[data-theme] 版本，否则 themed 态永远走不到这里。 */
.fg input:hover:not(:focus), .fg select:hover:not(:focus), .fg textarea:hover:not(:focus) {
  border-color: color-mix(in srgb, var(--{ns}-input-border) 55%, var(--{ns}-fg));
}
.fg input:focus, .fg select:focus, .fg textarea:focus { outline: none; border-color: var(--{ns}-focus-bd); }
.fg input:focus-visible, .fg select:focus-visible, .fg textarea:focus-visible { box-shadow: var(--{ns}-focus-ring); }

/* 工具条里的字段（sm 阶，与同行的 .btn-sm 等高 = 20px） */
.<toolbar> input[type="text"] { padding: 2px 8px; font-size: 12px; line-height: 14px; }

/* 原生控件着色（三表面） */
input[type="checkbox"], input[type="radio"] { accent-color: var(--{ns}-accent); }
.fg input[type="checkbox"]:focus-visible { outline: 2px solid var(--{ns}-accent); outline-offset: 1px; box-shadow: none; }
```

`.fg select` 的自绘 chevron（`background-image` / `background-repeat` / `background-position` **写成
长手属性**，让只设 `background-color` 的主题覆盖不至于抹掉箭头）与 `.fg textarea` 的等宽字体栈是页面级
特例，**留在手写区**，不进生成区。

### 6.2 消费 token 对

| 属性 | token | 派生要求 |
|---|---|---|
| `background-color` | `--{ns}-input-bg` | 既有 |
| `color` | `--{ns}-fg` | 对 `input-bg` ≥4.5:1 |
| `border-color` | `--{ns}-input-border` | 对 `input-bg` 与页面底 ≥3:1 |
| `border-color`（hover） | `color-mix(input-border 55%, fg)` | 不开新 token；对 `input-bg` ≥3:1 |
| `border-color`（focus） | `--{ns}-focus-bd` | 既有 |
| `box-shadow`（focus） | `--{ns}-focus-ring` | 既有 |
| `accent-color` | `--{ns}-accent` | 既有 |

**字段与按钮同病**：`options.css:207` 与 `library.css:136` 的字段基类都声明了 `background-color` 却
**没有 `color`**——options 靠 `html[data-theme] .fg input…`（:1187-1191）补，library 的 `.fg` 是死代码所以
还没爆。成对消费律（§7）对字段和按钮一视同仁。

**同一 commit 删除的 `html[data-theme]` 字段覆盖**（同 §1.3 的理由与时机）：

| 行 | 规则 | 被谁取代 |
|---|---|---|
| `options.css:1187-1191` | `html[data-theme] .fg input/select/textarea { background-color; border-color; color }` | 配方基类的 `input-bg` / `input-border` / `fg` |
| `options.css:1192-1196` | `html[data-theme] .fg input:hover:not(:focus) { border-color: var(--opt-fg-muted) }` | 配方的 hover `color-mix` |

`html[data-theme] .fg …:focus` / `:focus-visible`（:1116 起）消费的 `--opt-focus-bd` / `--opt-focus-ring`
与配方同源同值，属可删可留的重复；删之前逐条比对值，不确定就留着（它不会让任何新 token 变成死代码）。

### 6.3 几何约束

| ID | 断言 | 层 |
|---|---|---|
| `rowRungEq` | 同一 flex 行内并排的 `.btn` / `.btn-sm` / `input` / `select`，两两计算高度差 ≤1px | `[render]` |
| `fieldRung` | `.fg` 字段计算高度 = 26±1px；工具条字段 = 20±1px | `[render]` |
| `fieldPairedFg` | 声明 `background-color` 的字段规则所在组件族必须声明 `color` | `[static]` |

### 6.4 使用守则

- **缺陷 2 的形状**：`.vocab-batch-bar` 一行里，图标按钮吃 `.btn-sm`（垂直 2px / 11px）而分组输入吃
  `padding: 4px 8px` / 12px，约 5px 高度差，读起来像两个控件家族硬拼。裁定：**整行统一到 sm 阶**——
  输入框 padding-block 4px→2px、显式 `line-height: 14px`，字号保持 12px（sm 阶允许 11–12px）。
  升到 md 阶会让用户已拍板的密集 sticky 批量条整体长高 7px，不取。
- `font-family: inherit` 是**性能规则不是美学规则**，勿删：表单控件默认不继承 `font-family`，会吃 UA 的
  Arial（无中文字形）→ 中文掉到 Chrome 的 Standard 字体，高 DPI Windows 上首屏 1–3s 冻结。
  两表面的覆盖面**不同**：`options.css:93` 是 `button, input, select`（**不含 textarea**，靠
  `.fg textarea` 自己的等宽栈以更高特异性兜住），`library.css:107` 是
  `button, input, select, textarea`。新增控件类型时按所在文件的实际清单核对，别照抄另一个文件。
- 不自绘 checkbox / radio。`accent-color` 一行解决主题跟随，自绘会同时丢掉原生焦点、键盘语义与
  高对比模式支持。
- 全宽字段（表单栈里独占一行）**不受同行对齐律约束**——它没有行伴。约束只在同一 flex 行内并排时生效。

---

## 7. 横切规则

**适用**：三表面全量。

### 7.1 成对消费律（本规范第一条铁律）

**任何声明 `background` / `background-color` 的组件规则，其组件族基类必须声明一个对该背景经 AA 派生的
`color`。** 不许「有背景没前景」，不许把前景色写死，不许从别处借一个没有为这个背景派生过的 token。

六项真机缺陷里的 1、4 就是这条律的两次违反；缺陷 5 是它在 `currentColor` 继承链上的第三次表现。

```
[static] recipe-lint: 配方源里每个含 background 的规则 -> 同族基类存在 color 声明
[render] oracle:      渲染后取 computed color 与向上合成的实际背景，算 WCAG 对比度
```

两道门**必须都在**：静态门看得见「配方里写没写」，渲染门看得见「级联之后实际是什么颜色」。
`.btn` 缺 `color` 这类缺陷对静态门是可见的，但「声明的背景 ≠ 实际背景」只有渲染门看得见。

### 7.2 `color-scheme`

```css
/* 默认基线（生成区发射，不再手写） */
:root { color-scheme: light; }          /* options / library */
html.dark { color-scheme: dark; }       /* popup 暗色默认表面 */
html[data-theme="<dark preset>"] { color-scheme: dark; }
```

- **三表面都要有**。`library.css` 现状 `grep color-scheme` 零命中，这是缺陷 1/4 的第二个成因：
  UA 的 `ButtonText`、原生滚动条、`<select>` 下拉弹层跟随的是 `color-scheme`，**不是** `data-theme`。
- 默认浅色基线的语义（防浅色页配暗滚动条）必须保留在生成结果里，注释一并移入生成源。
- popup/options 现有的手写 `color-scheme` 块位于生成区**之后**，源顺序赢。composer 开始发射的
  **同一个 commit** 里必须删掉它们，否则派生形同虚设。
- 基线选择器 `:root` 与 `html` **特异性不等价**（`:root` 是 (0,1,0)，`html` 是 (0,0,1)）。options 现状写的是
  `html { color-scheme: light }`（:1082）。因为手写块与发射同 commit 删除，两者不会共存，用哪个都行——
  但**别**在保留手写块的情况下用 `:root` 发射，那会静默翻转谁赢。
- **library 是三表面里唯一没有 webkit 自定义滚动条兜底的表面**，`color-scheme` 落地后它的滚动条外观会
  真的变——进渲染抽测。popup 的滚动条被 webkit 规则接管，`popup.css` 注释明令**不得**引入
  `scrollbar-width` / `scrollbar-color`，勿犯。

### 7.3 focus ring

两套配方，按控件类型二选一，**不许第三套**：

| 控件类型 | 配方 |
|---|---|
| 按钮 / 可点行 / chip / tab | `outline: 2px solid var(--{ns}-accent); outline-offset: 2px` |
| 输入类字段 | `outline: none; border-color: var(--{ns}-focus-bd); box-shadow: var(--{ns}-focus-ring)` |

- 控件贴着容器边缘或会被父级裁切时，`outline-offset` 取负值（`-2px`），不要改成别的形态。
- **`outline: none` 只能与替代焦点指示同时出现**。裸 `outline: none` 在配方里一律 fail。
- 焦点指示对相邻背景 ≥3:1（WCAG 1.4.11）。

### 7.4 状态色一律 token 化

`save` / `warn` / `danger` / `ok` / `offline` 一律走 `--{ns}-*` token，手写区**零裸 hex**。
由 hex ratchet 门看守（计数只减不增，基线 popup 76 / options 103 / library 0，清零后升 RED）。
`color-mix()` 里作为纯运算常量的 `#000` / `#fff` 显式豁免；`rgba()` 只在 `background` / `color` /
`border-color` 属性上计数（阴影 rgba 是既有约定）。

第三条豁免容易被忘：**guard 只剥每行行首的第一个自定义属性定义**，所以 `:root` 里必须**一行一个
声明**——一行写两个 `--x: #aaa; --y: #bbb` 会让第二个字面值逃出豁免、被当成泄漏色报出来。
`library.css:8-12` 的注释在案，它也是「library 基线 = 0」这个数字在 `:root` 有 28 个 hex 的情况下仍然
可复现的原因。新增 token 定义时照此排版。

### 7.5 hover 的几何门控

任何**改变几何**的 `:hover`（transform / width / height / margin / padding）必须包在
`@media (hover: hover) and (pointer: fine)` 内——触摸设备上 `:hover` 会在点击后 latch，元素会停在
hover 态。**只改颜色的 hover 不需要门控**（颜色 latch 不影响布局，且门控会让触摸设备完全失去按下反馈）。
popup 已按此实践（`popup.css:2067` 注释在案），options/library 目前无几何 hover，本规则用于防新增。

---

## 附录 A：人审清单（不可自动化的判断）

自动门覆盖约八成常规缺陷（对比度、几何比例、token 解析、级联结构）。以下四类结构上无法自动判定，
每次涉及组件的改动由人逐条过。

**A1 图标语义**

- [ ] 这个图标看起来像不像这个动作？（不是「对比度够不够」——那是自动门的事）
- [ ] 是否从 Lucide v0.525.0 同版本取 path，没有手绘、没有 `<text>` 节点？
- [ ] 专属语义有没有被挪用：`eye`/`eyeOff` 只用于密钥显隐；`refresh` 只用于「重跑同一动作」；
      `cross` 是删除/移除/关闭家族；`extOpen` 只用于真外链；`robot` 只用于花 token 的 AI 动作。
- [ ] icon-only 按钮是否同时有 `title` + `aria-label` + ≥24px 命中区？

**A2 危险档位选用**

- [ ] 这颗按钮在确认弹层里吗？在 → solid；不在 → quiet。有没有例外被「这个特别重要」说服？
- [ ] quiet 档在它所处的容器里是不是太吵？（阅读正文流 vs 密集工具条，同一档观感应当不同——
      如果在正文流里仍然抢眼，它需要的是 ghost chrome，不是新档位。）
- [ ] 整页扫一眼：实底红出现了几次？超过一次就是错的（同页只可能有一个确认弹层）。

**A3 新控件家族归属**

- [ ] 动手前有没有 grep 同表面的同类控件？（MEMORY 铁律：新增元素必须匹配既有设计系统）
- [ ] 它落在哪个阶（md / sm / row / chip）？如果四个都不像，是不是应该改成其中一个而不是新造第五个？
- [ ] 它的按压语言是 `.btn` 族还是行语言？（§3.4 的二选一）
- [ ] `.vocab-status-chip` 这类「DOM 有类、CSS 无规则」的空壳：归 chip 族还是保持裸文本？
      要有人拍板，不许施工时顺手套一个配方了事。

**A4 类级联依赖复核**（改配方前必查）

- [ ] `.notes-detail-delete.is-error`（`library.css:442`）：失败标记用 `box-shadow: inset 0 0 0 1px`
      而非 background，注释写明是为了绕开 `.btn.danger:hover` 的 background。改 danger 配方后，
      **真开一次失败态**（或临时加类目测）确认标记仍可见，且在指针经过后不被抹掉。
- [ ] `.notes-hit.is-error .notes-hit-btn`（同文件）用 `--row-bg` 变量通道传背景，同理复核。
- [ ] 生成区插入点**之后**的同特异性 (0,1,0) 手写规则清单是否重新核过：`.row-del-x`（`library.css:350`）、
      `.vocab-load-more`（:1063）、`.vocab-selection-actions .btn`（:976）、`.vocab-batch-cluster > .btn`（:1044）、
      `.vocab-group-step`（:1051）。它们靠源顺序赢，谁赢谁输在迁移后必须逐条复述一遍。
- [ ] **本规范自己要改的几何，其手写规则同样排在插入点之后、会赢过配方**，逐条确认已删或已改：
      `library.css:934` `.vocab-stat-chip { padding: 1px 8px }`（赢过配方的 `2px 8px`，C9 失效）、
      `library.css:1141` `.vocab-group-chip { padding: 0 4px }`（C8 失效）、
      `library.css:830` `.vocab-batch-bar input[type="text"] { padding: 4px 8px }`（C3 失效）、
      `popup.css:405` `.tag-item { padding: 1px 8px; line-height: 18px }`（C11 失效）。
- [ ] **同选择器、同特异性的手写规则**，Task 9 打开对应 family 的同一 commit 须删：
      `popup.css:555` `input[type="checkbox"], input[type="radio"] { accent-color: var(--pp-accent) }`
      （(0,1,1)，与 §6 form family 给 pp 发射的同一条选择器同特异性，排在生成区插入点之后——
      源顺序赢，配方打开后手写这条成死代码）、`options.css:1729` `.tag-gov-kind-badge { ... }`
      （C10 的目标选择器本体，Task 9 打开 options 的 chip family 后同理须删，否则配方的
      `padding: 2px 10px` 赢不过它）。
- [ ] **更高特异性的 `html[data-theme]` 覆盖块**是否已在发射的同一 commit 里删除：
      `options.css:1325/1326/1359`（`.btn` 的 background/border-color/**color**、hover、focus outline-color，
      §1.3 有表）、`options.css:1187-1196`（`.fg` 字段的三色与 hover 边框，§6.2 有表）。
      漏删的症状是「新 token 发射了、门也绿、13 套预设下毫无变化」——死代码，不是通过。
- [ ] 有没有 `!important` 参与这场级联？（popup `.del-btn` 带 `!important`，配方赢不了它——
      这是 popup 豁免的成因之一。）

---

## 附录 B：emil Review Format 自查

按 emil-design-eng 的 Review Format 对本规范里的动效/状态条目过一遍。左列是**规范起草时被否掉的写法**
（多数是三表面某处的现状），右列是本规范的规定。

| Before | After | Why |
| --- | --- | --- |
| `transition: background 150ms, border-color 150ms, color 150ms, transform 150ms` + `:active { scale(0.97) }`（`library.css:120/124` 现状） | 同一行删掉 `transform 150ms`，`:active { transform: scale(0.97) }` 保留 | 按压必须瞬时读出；`a373dbd` 的「press must read instantly」适用于整个 `.btn` 族，不止 options |
| `:active { transform: translateY(1px) }` 作为唯一按压（`options.css:346`、`library.css:945`） | `:active { transform: scale(0.97) }` | 1px 纵向位移在 200px 宽 / 20–26px 高的扁按钮与图标方块上读不出来；scale 与尺寸成比例 |
| 可点行没有 `:active`（`.notes-sib` 在 `a373dbd` 之前） | `:active { background: color-mix(--fg 9%, --bg); transition-duration: 0s }` | 每个可按压元素都要对按压有回应；行元素用背景加深而非 scale（scale 会缩放子元素并糊掉行文字） |
| `transition: all <t>` | 逐属性列出：`transition: background 150ms, border-color 150ms, color 150ms` | `all` 会把未来新增的任何属性也拖进过渡，包括 layout 属性 |
| 入场动画 `transform: scale(0)` | `transform: scale(0.95)` + `opacity: 0` | 现实里没有东西从虚无中出现；`scale(0)` 读起来像凭空冒出 |
| `ease-in` 用于 UI 状态变化 | 颜色/hover 用默认 `ease`；入场/退场用 `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` | `ease-in` 起步慢，恰好延迟了用户最盯着的那一刻；仓库已有的 `--ease-out`/`--ease-in-out` 就是 emil 推荐的强曲线 |
| 时长 >300ms 的 UI 过渡 | 状态过渡 150ms（`--motion-state`）、弹层入 140ms / 出 100ms（`--motion-pop` / `--motion-pop-out`），规范上限 200ms | UI 动效应当停在 300ms 以内；仓库现值已经合规，本规范只是把上限写死防新增 |
| 改几何的 `:hover` 不带 media query | `@media (hover: hover) and (pointer: fine)` 包住（只改颜色的 hover 不包） | 触摸设备上 `:hover` 点完就 latch，按钮会停在抬起态（`popup.css:2067` 注释记录的实际踩坑） |
| 弹层 `transform-origin: center` | 保持现状：`.confirm-popover` 锚在触发钮上，其入场配方本战役不动 | 原点感知对锚定弹层是对的，但本战役不碰 confirm-popover 的动效形态（§0 豁免），此行仅作核对未发现问题 |
| `:disabled` 对比度不足被当成缺陷「修」 | 对比度断言跳过 `:disabled` | WCAG 1.4.3 豁免禁用控件；`opacity: 0.45` 同时压前景背景是刻意的失能信号 |

---

## 附录 C：与现状的差异台账

本规范相对三份 CSS 现状的**可见变化**逐条在此登记。施工任务（Task 9 / 10）按此核销；用户过目点看这张表。

| # | 位置 | 现状 | 规范值 | 可见变化 | 排期 |
|---|---|---|---|---|---|
| C1 | `.btn`（opt + lib） | 无 `color`，`line-height: normal`，高 ≈24px；opt 默认浅色态边框是裸字面量 `#999`（lib 早已是 `var(--lib-border, #999)`，`--lib-border` 一直有定义，`#999` fallback 从未真正生效，故 lib 默认态边框无变化） | `color: var(--{ns}-btn-fg)`，`line-height: 16px`，高 26px；边框统一走 `var(--{ns}-border)` | 暗色主题下文字与图标**从不可见变为可见**（核心缺陷）；高度 +2px；zh-CN 与 en 下高度不再有差；**opt 默认浅色态边框 `#999`→`#ccc`**（`--opt-border` 默认值），变淡一档，lib 默认态边框无可见变化 | 本战役 |
| C2 | `.btn-sm`（opt + lib） | 高 ≈19px（字体相关） | `line-height: 14px`，高 20px | +1px，且不再随字体族浮动 | 本战役 |
| C3 | `.vocab-batch-bar input`（lib） | `padding: 4px 8px` / 12px，高 ≈24px | `padding: 2px 8px` / 12px / `line-height: 14px`，高 20px | 批量条输入框 −4px，与同行按钮齐平（缺陷 2 核销） | 本战役 |
| C4 | `.btn:active`（opt） | `translateY(1px)` | `scale(0.97)` | 按压反馈换形态，仍瞬时 | 本战役 |
| C5 | `.btn:active`（lib） | `scale(0.97)` + 150ms 过渡 | `scale(0.97)` 无过渡 | 按压变利落 | 本战役 |
| C6 | `.vocab-stat-chip:active`（lib） | `translateY(1px)` | `scale(0.97)` | 同 C4 | 本战役 |
| C7 | `.btn-ic`（lib） | 仅 4 处容器限定规则 | 全局基础规则 + 宿主 `gap: 4px` | 详情面板按钮的图标**从基线对齐变为居中对齐**（缺陷 5 核销）；四条窄例外删除 | 本战役 |
| C8 | `.vocab-group-chip`（lib） | `padding: 0 4px` + `radius-full`，字号继承、高度由行盒自撑（≈13–14px） | `padding: 2px 10px` + `line-height: 14px`，高 18px | 文字不再贴边（缺陷 3 核销）；高 +4~5px。字号仍继承容器，本规范只钉 line-height | 本战役 |
| C9 | `.vocab-stat-chip`（lib） | `padding: 1px 8px`，无 `line-height` | `padding: 2px 8px` + `line-height: 14px` | 高 18→20px（定律 3 + 行盒钉死） | 本战役 |
| C10 | `.tag-gov-kind-badge`（opt） | `padding: 2px 6px` + `radius-full`，高 ≈16px、有效半径 ≈8px | `padding: 2px 10px` + `line-height: 14px` | 水平内边距 +4px（定律 2：6px < 8px 现状违规）、高 +2px | 本战役 |
| C11 | `.tag-item`（pp） | `padding: 1px 8px` / `line-height: 18px`，有效半径 10px | `padding: 2px 10px` / `line-height: 14px` | 标签 chip 高 −2px、水平 +2px（定律 2、3 现状均违规） | **记账**：popup 本战役以颜色补课为主；由 Task 9 判定是否属「小幅修正」范围，不做则留在本表 |
| C12 | `.btn.danger`（opt + lib） | `color: var(--{ns}-danger)` | `color: var(--{ns}-danger-quiet-fg)` | 红色前景被推到对 btn-bg / bg / panel 三背景达标，个别主题下红色会略偏 | 本战役 |
| C13 | 详情面板删除钮（lib） | `.btn.btn-sm.danger`（常亮红字红边） | 追加 `ghost` chrome | **两半均已交付（Task 10，一次 fix round 后）**：`library-vocab.js:513`/`library-notes.js:405` 的 `class` 追加 `ghost`（`#vocab-batch-delete`/`library.html:122` 不在 §4.5 点名范围内，**保持 quiet 非 ghost** 不动）；`.btn.danger` 同时接住 quiet 前景 token。**geometry/chrome 也变了**：静息态背景/边框归零，按钮从"带底带边的红色药丸"变成正文里一段红色文字+图标，14 套预设下**全部**可见变化（与颜色是否恰好在 AA 派生下改变无关，chrome 移除本身就是可见变化）；`.notes-detail-delete.is-error` 的失败标记（`box-shadow: inset 0 0 0 1px`）在透明底上实测仍清晰可辨（真机截图核验，见 task-10-report.md） | 本战役 |
| C14 | `.confirm-popover .confirm-yes`（opt + lib） | `color: var(--{ns}-panel)` | `color: var(--{ns}-on-danger)` | 前景从未审计的借用值换成派生值，个别主题下会变 | 本战役 |
| C14b | `.confirm-popover .confirm-yes:hover`（opt + lib，**无预设明暗态**） | 底色压深（`options.css:1330` `#a00` / `library.css:208` `var(--lib-danger,#a00)`） | 底色不变，只加 `inset 0 0 0 1px var(--{ns}-on-danger)` 环 | 默认表面的确认钮 hover **失去底色加深**，改成与 13 套预设一模一样的 inset 环（预设块 `options.css:1336` / `library.css:214` 现在就是这么做的）。是三表面收敛，不是新行为 | 本战役 |
| C14c | `.confirm-popover .confirm-yes` 边框（**仅 opt 默认亮色态**） | `border-color: #a00`（裸字面量，比 `background: #c00` 深一档，给按钮描一圈细边） | `border-color: var(--opt-danger)` = `#c00` | 边框与底色变成同一个值，视觉上"消失"——按钮从有细描边变成纯色色块。**library 无此变化**：其手写版本迁移前就已经是 `border-color: var(--lib-danger, #a00)`（`--lib-danger` 恒定义，`#a00` fallback 从未真正生效），迁移前后 border-color 取值不变 | 本战役 |
| C17 | `html[data-theme] .btn` 三条（`options.css:1325/1326/1359`） | 存在，特异性 (0,2,1) 赢过配方 | 删除 | 无独立视觉变化（配方接管同样的值），但**不删则 `--opt-btn-fg` 在 13 套预设下全是死代码**。与发射同 commit | 本战役 |
| C18 | `html[data-theme] .fg` 字段两条（`options.css:1187-1191`、`1192-1196`） | 存在，同上 | 删除 | themed 态字段的三色与 hover 边框改由配方供给；hover 边框值从 `--opt-fg-muted` 变成 `color-mix(input-border 55%, fg)`，暗色主题下描边会略淡 | 本战役 |
| C15 | `color-scheme`（lib） | 全文零声明 | `:root` + 每暗色主题块 | library 的原生滚动条 / `<select>` 弹层在暗色主题下**首次**变暗 | 本战役 |
| C16 | `--pp-tag-bg` / `--pp-tag-fg` | 直取 palette，无 AA 校正 | 由 `--pp-chip-bg` / `--pp-chip-fg` 取代，旧名退役 | 个别主题下 popup 标签 chip 配色会变 | 本战役 |

**偏离实施计划之处**（Task 9/10 以本规范为准，但需知晓）：

- 计划 Task 10 写的是新增 `.btn.danger-quiet` 类。本规范改为**重定义 `.btn.danger` 本身为 quiet 档**——
  重定义之后，现存每一个 `.btn.danger` 站点都恰好是 quiet 档（solid 档在 `.confirm-popover .confirm-yes` 上，
  它从来不带 `.btn`），新类没有消费者。省掉一次 JS className 改动与一轮测试同步。
- **`gap` 放在宿主 `.btn` 上，不放在 `.btn-ic` 上**（brief 字面写的是「btn-ic：`display:inline-flex;
  align-items:center; gap` 全局基础规则」）。`.btn-ic` 里只有一个 SVG，在它自己身上写 `gap` 不产生任何
  间距——间距发生在「图标 span ↔ 文字节点」之间，只有宿主按钮是 flex 容器时才能用 `gap` 表达。因此
  `display:inline-flex + gap:4px` 上移到 `.btn` 基类（options 的 `a.btn` 已验证过这个形状），`.btn-ic`
  只留 `display`/`align-items` 与 `svg{display:block}`。推理详见 §2.1。
- `--{ns}-danger-quiet-fg` 的派生背景集从计划的 `[bg, panel]` 扩为 `[bg, panel, btn-bg]`（超集）：
  quiet 档也会出现在工具条的常规 `.btn` 底上（`#vocab-batch-delete`），漏掉 btn-bg 会让那颗按钮逃过审计。
- 按钮族追加 `ghost` chrome 变体。它不是新组件：`library.css` 里已有两份手写副本
  （`.row-del-x`:350 与 `.vocab-selection-actions .btn`:976，均为 `border-color: transparent` +
  `background: transparent` + 弱化前景）。归并进配方是**删两份副本**，不是加一个新族；不归并也不违反
  本规范（只要两份副本的值与 §1.2 一致）。**options.css 没有等价副本**——`library.css:350` 的注释
  「options.css's shared recipe」是移植来源的说法，`grep row-del-x options.css` 零命中，options 侧要用
  ghost 档（详情面板类阅读面）时是**首次出现**，按 §1.2 配方来，不要去 options 里找样板。
