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
  library 6 档 2/4/8/12/16/24——sp-0 是 2026-09-06 补的 hairline，没有 6 档），配方**不得**引用 `--{ns}-sp-N`；
  由 `ui-components.mjs` 的 SPACING adapter 在发射时映射到该表面**数值相等**的 token，无对应档位发射字面 px。
- **圆角写 token 名**（`var(--{ns}-radius-md)`）。radius 三表面同名同角色（sm 在 options 是 3px、library 是
  4px，属刻度差异，与间距不同的是它不需要跨表面数值相等），直接引用不会算错。
- 过渡时长引用既有动效 token：options / library 是 `--motion-state`（150ms）、`--motion-pop` / `--motion-pop-out`，
  popup 是 `--pp-motion-state`。配方里按 ns 展开，别写字面毫秒。
- 本文给出的所有像素值是**规范值**，不是「现状抄录」。与现状的差异逐条列在附录 C。

---

## 0. 适用范围与豁免

| 组件族 | popup | options | library |
|---|---|---|---|
| 1 按钮族（几何 + 颜色 + 状态） | 配方全量发射，**消费按钮逐个迁移**（见下） | 全量 | 全量 |
| 2 btn-ic 图标容器 | 基础规则（display/align/svg），保留 `-3px`/`margin-right` 变体 | 全量 | 全量 |
| 3 状态反馈 | 全量（press 已收敛到 `scale(0.97)`） | 全量 | 全量 |
| 4 危险分级 | 全量 | 全量 | 全量 |
| 5 chip / badge | 几何律适用（施工排期见附录 C） | 全量 | 全量 |
| 6 表单控件 | 颜色对 + `accent-color` | 全量 | 全量 |
| 7 横切（color-scheme / focus / 状态色 / 成对消费） | 全量 | 全量 | 全量 |
| 8 融合控件（容器持 chrome / `:focus-within` 环 / 单一分隔线） | 全量 | 全量 | 全量 |

**popup 豁免的退役记录**（design-uplift 记为欠账，「popup 按钮族归一」战役 2026-08-07 结清）：

- 原文写的是「popup **没有 `.btn` 族**」——那是**代码现状**，不是设计立场。现在
  `@generated:ui-components` 区对 `pp` 发射与另外两个表面同源的 `.btn` / `.btn-sm` / `.ghost` /
  `.danger` 全族配方，token 名差异（popup 用 `--pp-btn-bd` / `--pp-input-bd`）由
  `ui-components.mjs` 的 `TOKEN_ALIAS` 解决。**剩下的是消费侧**：给某颗按钮加 `class="btn"` 是一次
  有布局后果的迁移，因此逐颗做。已迁：`#submit-btn`（`.btn`）、`.del-btn`（`.btn danger`）。
  未迁、仍走手写配方的四套是**登记在案的变体**，不是漏做——逐条见下表（controller 裁决
  2026-08-07）。另有 `action-link` / `clear-all-link` / `offline-clear` / `header-ic` 等链接态与
  图标态变体，它们没有按钮 chrome，本来就不属于本节。
- 原文写的「按钮**手感**本战役一律不动」已推翻（用户裁决 A，2026-08-07）：popup 的按压语言收敛到
  唯一的 `scale(0.97)`，`#submit-btn` / `.qbtn` 的 hover 抬起（`translateY(-1px)`）连同承载它的
  `@media (hover:hover)` 块一并删除。§3.1 裁决表 5/6 相应改判，见该表。
- 原文写的「popup 的 `.confirm-popover` 是 warn-on-warn……§4 不适用于 popup」已结清：solid 档配方
  对三表面发射，popup 的三层手写取色（默认 danger / `html.dark` 三个一次性字面量 /
  `html[data-theme]` **warn 家族**）全部删除。当时判断「需要新造 `danger × warn-bg` 审计对」是走错
  了方向——正确的做法是让弹层不再是 warn 底，`on-danger × danger` 早就在 `COMPONENT_PAIR_SPEC` 里。
  **这个缺陷对比度门永远看不见**（13 套 pilot 的 warn 对实测 4.5–5.2:1，全部达标），静态侧改由
  `tests/ui-contract-tests.mjs` 的类级门看管：手写区任何规则给 `.confirm-yes` 上色即 FAIL。
- popup 的第二套确认弹层 `.del-confirm-popover` 同期退休，改调 `showConfirmPopover()`。

**popup 按钮变体登记表**（controller 裁决 2026-08-07；这四套**永久**留在手写区，新增同类控件按此归类）：

| 变体 | 为什么不迁 `.btn` | 与族语言的关系 |
|---|---|---|
| `.qbtn`（quick-row 等分条） | 三颗共享一行 550px 定宽、`flex: 1 1 auto` + `flex-wrap: wrap`。族配方的 `padding: 4px 16px` 每颗多 12px 水平内距，在长标签语种（de/fr）会折行——`popup.css` 的 wrap-not-truncate 样式就是为这个后果预留的 | **高度并轨**：`min-height: 26px` 钉在 md 阶（实测 24.30 → 26），与 submit bar 等高。水平内距（4px）与字号（11px）保持手写。press / focus / hover 已并轨。与 `.md-strip-btn` 同属「**等分条**」这一类：宽度由 `flex` 分配、内距不能按族配方给 |
| `.md-strip-btn`（markdown 条，4 格） | 同为等分条（`flex: 1 1 0`），且 `height: 32px` 的 icon-only 方格在 `.btn` 的三个阶（md 26 / sm 20 / row）里**没有对应档**。命中区 32px 本来就达标 | press / focus 已并轨；几何是这一类自己的（32px 格） |
| `.fc-btn`（+ `.fc-btn-secondary` / `.fc-dismiss`） | **语境着色变体**：它坐在 feedback card 上，卡片有 warn / ok / offline / info 四种变体色，按钮用 `border: 1px solid currentColor` + `color: inherit` 让整颗按钮的颜色跟着卡片走——这正是它在四种卡片上都可读的机制（文件注释记着：曾用 `--pp-fg-hint`，深色卡片上直接看不清）。`.btn` 会给它 `color: var(--pp-btn-fg)`、`.ghost` 会给它 `border-color: transparent`，两条都要在更高特异性上反向覆盖回去，迁完只剩 padding/radius 是族配方的 | press / focus 已并轨（focus 走 §7.3 `borderless`，因为那圈 `currentColor` 边是**语义**边）。颜色由语境提供，§7.1 的成对消费律在这颗按钮上由「卡片自己的 fg/bg 对」承担 |
| `.preset-btn`（标签预设色板） | 几何是 pill，与 chip 族同形，但**颜色不同源**：它吃 `--pp-preset-btn-bg` / `--pp-preset-fg`，后者是 `contrast-audit` 的 `COMPONENT_PAIR_SPEC` 里 popup 专属的两行；chip 配方会把它换成 `--pp-chip-bg` / `--pp-chip-fg`。另有 `::before` 装饰点、`.used` 态语义，以及 §1.3 那段用户裁决史（边框粗细路线被否、改 2px accent 描边环） | press 早就是 `scale(0.97)`；focus 走 §7.3 `borderless`。**不并 chip 族** |

**一处显式豁免**（同日裁决，宪法侧留档）：`#submit-btn:disabled` 显式写 `opacity: 1`，退出
§3.1 裁决 9 的 `.btn:disabled { opacity: 0.45 }`。理由：这颗按钮不靠淡出表达禁用，它重绘成
`--pp-btn-bg` 底 + `--pp-fg-hint` 字——一对专门为这个底做过对比度选择的灰；再叠 45% 会读成
「坏了」而不是「不可用」，而 popup 开在 chrome:// 页面上时这是**每天都出现**的状态。同一条规则带
`html[data-theme]` 孪生（(1,2,1)），否则预设下 `html[data-theme] #submit-btn` (1,1,1) 会压掉它，
两层对「禁用长什么样」给出不同答案。这是 popup 侧唯一一处对组件语言的显式退出。

---

## 1. 按钮族

**适用**：三表面。popup 2026-08-07 起也发射本节配方（§0 有退役记录）——但 popup 侧「适用」指的是
**配方已发射**，某颗具体按钮吃不吃得到，取决于它有没有被迁到 `class="btn"`。

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
  border: 1px solid var(--{ns}-btn-border);
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
| `border-color` | `--{ns}-border` | `borderToAA(border, [btn-bg, panel])`——对 `btn-bg` 与 `panel` 两个背景同时 ≥3:1（非文本对比，WCAG 1.4.11）。design-uplift Task 16 前只是文档要求，未接线到 contrast-audit；Task 16 补上派生与门（`_ui-derive.mjs` 的 `borderToAA`，仿 `fgToAAMulti` 的收敛写法） |
| `outline`（focus） | `--{ns}-accent` | 对 `bg` 与 `panel` ≥3:1 |

**豁免：preset swatch row**（popup `.preset-btn` / `.preset-btn.used`，用户裁决 2026-08-04）——不适用上表 `border-color` 行的 3:1 门。理由：预设色板按钮本身有填充色（`--pp-preset-bg`）与文字（`--pp-preset-fg`）双重可供性，边框只是装饰性细描边，不是该控件边界的唯一或主要载体，WCAG 1.4.11 不强制装饰性描边达标。`--pp-preset-bd` 因此**不**接 `borderToAA`，维持派生前的原始（轻量）palette 值，与 `--pp-border` 各自独立——Task 16 一审版本曾短暂把 `.preset-btn.used` 的 `border-color` 对齐到派生后的 `--pp-border`（试图用「加重的一侧」统一预设行），真机复看后判定「太夸张，很 low」而打回，改成两个状态统一在 `--pp-preset-bd`（轻量）一侧（`popup.css` 的 `.preset-btn.used` 规则相应从 `var(--pp-border)` 改回 `var(--pp-preset-bd)`）。`preset-bd` 不在 `contrast-audit.mjs` 的 `COMPONENT_PAIR_SPEC` 对表内（该表只登记 `border` 这一个角色的两对，`preset-bd` 是另一个独立 token，从未被登记过），也不匹配 orphan 守卫的 `*-fg`/`on-*` 形状，故本次豁免无需改动任何门禁代码。**2026-08-04 全面重设计后更新**（附录 C30）：用户否定了「边框粗细」这条路本身，`.preset-btn`/`.preset-btn.used` 与 options 的 `.theme-preset-btn`/`.saved-theme-btn` 现在**完全无边框**（`border: none`）——不是本条豁免的进一步减轻，而是豁免的对象（边框）已不存在，`--pp-preset-btn-bd`/`--pp-preset-bd`/`--pp-preset-btn-used-bd`/`--opt-preset-active-border` 四个边框 token 随之从消费侧移除（**2026-08-05 追加**：`--pp-preset-bd` 的 composer 生成侧也已清空，见 C30 同日追记；另两个 popup token 本就不在 `emitPp` 的发射列表内，从未被 composer 产出过）。选中态改用 2px accent 描边环（`outline`，不是 `border`）承载，`outlineContrast`（≥3:1，WCAG 1.4.11 同一非文本门）改在渲染 oracle 里断言（`tests/render-audit-checklist.mjs` 的 `.theme-preset-btn.active` 两条新断言），不进本节的静态 `COMPONENT_PAIR_SPEC`——理由见 C30。

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
  文件尾。`.row-del-x`、`.vocab-load-more`、`.lib-cluster > .btn.ghost`、`.vocab-batch-bar .btn:not(.vocab-group-step)`、
  `.vocab-group-step` 这些排在插入点之后的手写规则**靠源顺序或特异性赢**，换位置会静默翻转级联。
- 新增按钮先 grep 同表面同类控件，归入既有阶与档，不新造第三套 padding。

---

## 2. 按钮内图标（`.btn-ic`）

**适用**：三表面。design-uplift 期间这是 popup 唯一进生成区的结构规则；2026-08-07 起 popup 也发射
按钮族与危险分级，`.btn-ic` 不再是孤例。两份配方的分野**依然成立**——popup 已迁到 `class="btn"` 的
按钮才有 flex `gap` 可用，未迁的手写配方仍靠 `.btn-ic` 自己的 `margin-right`。

**`gap` 与 `margin-right` 会叠加，而且触发器不是 `.btn-ic`。** 这里原本写的是「等某颗 popup 按钮
同时带 `class="btn"` 和 `.btn-ic` 时才会叠成 8px，已迁的两颗都是纯文字，暂未触发」——**实测证伪**
（2026-08-07 独立复审）：`.btn` 是 flex 容器，`gap` 对**任何**flex item 生效，而 loading spinner
的 `::before` 就是一个带 `margin-right` 的 flex item。submit bar 迁 `.btn` 之后 spinner→标签间距
实测 4px → 8px（按钮宽 80.70 → 84.70），每次保存每次删除都出现。已修：那条 `margin-right` 交还给
**非 flex 宿主**（`.action-link`）独有，flex 宿主的间距由 `gap` 单独负责。
**规则**：`.btn` 宿主内的子盒一律不要自带 `margin`，间距归 `gap`；`.btn-ic` 的 `margin-right` 是
同一叠加尚未兑现的另一个载体，给 popup 按钮加图标时先来读这一段。

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

### 2.5 options 上下文帮助（`.context-help-*`）

上下文帮助借用 `.btn.btn-sm.ghost` 的颜色、焦点与 Lucide 图标，但布局属于 options 页面层，
不进入 composer，也不随主题写几何覆盖。每个宿主必须且只能声明一个
`data-help-role="section|field|choice|group|action"`；角色决定文字度量与光学校准，主题只提供颜色。
每次 i18n 应用后，options 再按锚点**实际渲染文案**标记
`data-help-script="cjk|alphabetic"`；不得用页面 `lang` 推断，因为中文界面仍包含 `API Key` 等纯拉丁标签。

- 第一行固定为「语义锚点 + 24×24px 命中区」，13px help SVG 只移动可见墨迹，不移动 summary 的
  命中盒或焦点盒；说明正文由同一个 `<details>` 在第二行全宽展开。
- 校准最多按「角色 × 实际文案文字系统族」声明一次；禁止 ID、文案、单项 class、主题选择器或内联 transform。
  同一角色出现不同偏差时先修 DOM/布局异常，不新增例外；校准值必须同时落在 Windows 常用字体与
  CI 的 Liberation Sans/WenQuanYi 字体栅格交集内，门禁容许至多 2 个物理像素的抗锯齿量化差异。
- `<details>` 继续复用全局 disclosure 的 `::details-content` 动画与 one-open-per-panel 行为，组件层
  不另写 transition。
- 门：`options-context-help-tests.html` 扫完整角色注册表、相邻锚点、24px 命中区、展开归属与间距；
  `options-help-render-audit.mjs` 用真实截图像素覆盖 zh-CN/en、DPR 1/1.25/1.5/2 和五种角色。

---

## 3. 状态反馈（hover / active / focus-visible / disabled）

**一等条目**。现状至少五种按压语言并存，本节把三表面收敛成两种（`.btn` 族一种、可点行一种）。
popup 原先「维持现状并记录在案」的那一条已于 2026-08-07 结清（裁决 5/6 改判）。

### 3.1 裁决表

| # | 现状（证据） | 表面 | 裁决 | 理由 |
|---|---|---|---|---|
| 1 | `options.css:346` `.btn:active { transform: translateY(1px) }`，`:341` 的 `transition` 只列 `background/border-color/color`——**transform 不在过渡里 = 瞬时**。`a373dbd` commit message 写明「press must read instantly」，且这些按钮随后要在多秒网络调用里发呆，按压是唯一确认点击落地的信号 | options | **半保留半推翻**：保留「瞬时」，推翻「translateY」 | 瞬时性是这条裁决真正论证过的部分，且论据（按钮随后 inert）在 library 同样成立；位移量的选择当时没有被论证 |
| 2 | `library.css:124` `.btn:active { transform: scale(0.97) }`，注释「a press-down affordance that also reads on wide/short buttons where a 1px vertical nudge is barely visible」；`:120` 的 `transition` **含** `transform var(--motion-state)`（150ms 动画） | library | **半保留半推翻**：保留「scale(0.97)」，推翻「transform 进 transition」 | 几何论证成立：本仓库大量按钮是 200px 宽 / 20–26px 高的扁按钮与 26px 图标方块，1px 纵向位移在这种比例上读不出来；scale 与尺寸成比例。过渡则与裁决 1 冲突，按裁决 1 去掉 |
| **收敛结果** | — | options + library | **`.btn` 族唯一按压语言 = `transform: scale(0.97)`，不进 `transition`（按下与回弹都瞬时）** | 两条既有裁决各保留自己真正论证过的那一半；`a373dbd` 的核心结论「同页不得有两种按压」在此从「同页」扩到「同族跨表面」 |
| 3 | `library.css:945` `.vocab-stat-chip:active { transform: translateY(1px) }` | library | **推翻** → 改 `scale(0.97)` 瞬时 | stat-chip 是 `aria-pressed` 切换钮，视觉家族归 chip、按压家族归按钮；20px 高的扁 chip 上 1px 位移不可见，与收敛结果同理 |
| 4 | `library.css:509` `.notes-sib:active { background: color-mix(--lib-fg 9%, --lib-bg); transition-duration: 0s }`，`a373dbd` 补齐，与同侪 `.notes-hit-btn:active` / `.notes-card-top:active` 同配方 | library | **保留**，并升格为第二种按压语言 | 这些是**整行可点**元素，不是 `.btn`。`scale()` 会连带缩放子元素与文字（行文字发糊）、并在密集列表里破坏相邻行的视觉对齐。行按压 = 瞬时背景加深、禁 transform，是正确的分家而不是漏收敛 |
| 5 | `popup.css:2072` `#submit-btn:hover, .qbtn:hover { transform: translateY(-1px) }`，包在 `@media (hover:hover) and (pointer:fine)` 里；`:2067` 注释：这是本页唯一改几何的 hover，touch 上 `:hover` 会 latch，按钮会停在抬起态 | popup | **~~不动~~ → 推翻，整条删除**（用户裁决 A，2026-08-07） | 抬起是 popup 独有的第三种 hover 语言；hover 统一为「填充变化」之后它没有存在理由。删掉最后一个几何 hover 之后那个 media query 块本身也空了，一并删除。其门控规则仍作为 §7.5 保留，管的是**未来新增**的几何 hover |
| 6 | `popup.css:573` `#submit-btn:active { transform: translateY(0); box-shadow: none }`（从 hover 抬起态回位） | popup | **~~不动~~ → 推翻**（同上） | 「按下回位」只有在「hover 抬起」存在时才成立，裁决 5 删掉前提，这条随之作废。popup 全表面按压收敛到 `scale(0.97)`——原先并存四种（`preset-btn` 已是 scale、`md-strip-btn`/登录钮 `translateY(1px)`、`qbtn` 换底+回位、`fc-btn`/`header-ic`/offline 行内动作**没有** `:active`），后者五个同时补齐，§3.4「每个可按压元素都必须有 `:active`」在 popup 首次真正成立 |
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

**适用**：三表面。popup 的 solid 档 2026-08-07 起也由配方发射（§0 有 warn-on-warn 的退役记录）；
quiet 档在 popup 目前只有 `.del-btn` 一个消费者。

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
   （library-vocab.js:539 / library-notes.js:405 已经是 "btn btn-sm danger"） */
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
   （options.css:441 / library.css:194）。默认表面现状是把底色压深（#a00 / --lib-danger 的旧 fallback），
   收敛到预设的做法后所有表面一致；代价见附录 C14。 */
.confirm-popover .confirm-yes:hover { box-shadow: inset 0 0 0 1px var(--{ns}-on-danger); }
```

### 4.3 消费 token 对

| 属性 | token | 派生要求 |
|---|---|---|
| quiet 前景 | **`--{ns}-danger-quiet-fg`** | `fgToAAMulti(danger, [bg, panel, btn-bg, mix(danger 8%, bg), mix(danger 8%, btn-bg)])` ≥4.5:1。前三项覆盖静止态页面底/面板底/按钮底，后两项覆盖 ghost 与常规按钮的最终 hover 填色 |
| quiet hover 底 | `color-mix(danger 8%, <bg / btn-bg>)` | 两种最终填色都纳入 `danger-quiet-fg` 派生；render audit 等状态过渡结束后再测实际 `color-mix` 结果 |
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
   水平 10px 覆盖两种情况的有效半径。字号 11-12px 在阶内浮动（11px 是全表面文字下限，§10.3 textFloor），高度由 line-height 钉死。 */
.<chip> {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  font-size: 11px;         /* 实例可取 11-12px，不改 line-height；10px 触 textFloor */
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

**一套语言，三种落位**（2026-08-06 用户裁决，三表面全量统一）。语言 = 「柔光环」：焦点态
**恒**由 `--{ns}-focus-bd`（焦点边缘色）与 `--{ns}-focus-ring`（辉光）两个 token 承担，基准是
`#vocab-status-filter` 的既有表现（边框变色 + 辉光）。变的只是「芯画在哪」，不是画不画。

| 落位 | 适用 | 配方 |
|---|---|---|
| `bordered` | `.btn` 族 / 输入类字段（含 `<select>`）/ 载字段的融合外壳 / 有 1px 中性边框的 chip | `outline: none; border-color: var(--{ns}-focus-bd); box-shadow: var(--{ns}-focus-ring)` |
| `borderless` | 侧栏 tab / 链接 / ghost 图标钮 / checkbox / 无边框药丸 / 弹层动作钮 | `outline: 1px solid var(--{ns}-accent); outline-offset: 2px; box-shadow: var(--{ns}-focus-ring)` |
| `inset` | 列表整行 / 融合控件的格子 / stepper / `<option>` 行 | `outline: 2px solid var(--{ns}-focus-bd); outline-offset: -2px; box-shadow: none` |

**落位判定只问两件事**，按顺序：

1. **它是行、还是格子？**（列表整行、焊死分段里的一格、picker 的一行）→ `inset`。
   理由是几何：外环会溢到邻居身上或被父级 `overflow` 裁掉。
2. **它静息时有没有一圈「中性 chrome」边框？** 有 → `bordered`（焦点重新着色那圈边）；
   没有，或那圈边是**语义**的（danger / warn / `currentColor` 状态边）→ `borderless`。

第 2 条后半句是本次清扫真正吃掉时间的地方，写清楚免得下次重推：弹层里的
`.confirm-yes` / `.confirm-no` / `.tnp-save`、popup 的 `.fc-btn`（`border: 1px solid currentColor`）
这些控件**有**边框，但那圈边表达的是「这个操作有多危险 / 是不是主操作」。把它改涂成
accent 焦点色，等于焦点一来就抹掉危险信号——所以它们走 `borderless`，语义边原样留着，
1px accent 芯 + 辉光叠在外面。`.btn` 族的边框相反，是 Soft Fill 塌进填充里的中性 chrome
（§9 律 1），涂它没有任何信息损失，所以走 `bordered`。

**`--{ns}-focus-ring` 一律原样 `var()` 消费，绝不展开成字面阴影。** 这条是硬的：辉光的
**形状本身**是主题身份，不只是颜色——terminal 是 `0 0 6px 1px`（磷光模糊晕），paper-ink 是
`0 0 0 1px`（极简平环，无晕），solarized 是 `0 0 0 2px` 半透明平环，其余 pilot 走派生的
`glow`。任何一处把它拍成字面值，那一处就从 13 套预设塌成一个样子，而且是静默的——控件仍然
「有焦点环」，只是不再是这套主题的焦点环。同理，渲染门**不许断言单一形状**，只能断言各主题
皆真的属性（存在非 inset 阴影、且与未聚焦基线不同）。`--{ns}-focus-bd` 同理，别拿
`color-mix(accent …)` 就地替代——那会绕过 terminal / paper-ink / solarized 三套的显式覆盖。

**别把 `outline: none` 当成"去掉焦点环"**：它只在 `bordered` 落位里合法，且必须与
`border-color` + `box-shadow` 同时出现。裸 `outline: none` 一律 fail。唯一的例外是
**把指示交给容器**的内部件（§8 律 2）——`.notes-card-head` 就是这一形状：环画在整行
`.notes-card-top` 上，head 自己必须 `outline: none`，否则 Chromium 会在行环里面再画一圈 UA 默认环。
这种「交出指示」的 `outline: none` 必须有一条渲染断言点名它的容器确实画了环，不许只写一句注释。

- `inset` 落位**必须显式写 `box-shadow: none`**。两个理由，都被实测抓到过：① 生成区的
  `.btn:focus-visible` 现在带辉光，而分段格子多半也是 `.btn`，不压掉就会在焊缝上溢出一圈、
  同时和 inset 芯叠成两层；② 列表行的 selected / `aria-current` 态**已经占用了 `box-shadow`**
  （`inset 0 0 0 1px` / `inset 2px 0 0` 的强调边），同特异性下后写的那条会**替换**而不是叠加，
  焦点期间静默抹掉「你在这一行」。
- **焦点指示对相邻背景 ≥3:1（WCAG 1.4.11），由「芯」承担，不由辉光承担。**
  这条从本节写下来那天就在，但直到 2026-08-06 独立复审才第一次有执行者——在此之前
  `--{ns}-focus-bd` 的默认公式 `color-mix(accent 55%, input-bg)` 在多数表面只有
  **1.58–2.40:1**（默认浅色 1.90、`html.dark` 2.40、flexoki 2.10、solarized-light 1.58），
  而 terminal(13.93) / paper-ink(9.63) / solarized-dark(3.30) 达标恰恰是因为 pilot 覆盖
  **绕开了**那条公式。Soft Fill（§9 律 1）把静息边框塌进填充之后（`btn-border == btn-bg`，1.00:1），
  `bordered` 落位的这圈边就是整个 `.btn` 族、全部字段、全部融合外壳**唯一**的合规载体。
  现在 `focusBdToAA()`（`composers/_ui-derive.mjs`）逐主题派生：起点仍是原公式（已达标的主题
  逐字节不变），不足则先沿混合比走向纯 accent（**保住主题自己的色相**），纯 accent 仍不够才动明度。
  三个 chrome composer 发射进 `@generated:ui-themes`，pilot `ui.*` 覆盖照旧胜出。
  默认表面无 emit 路径，三处 `:root` 改为**手工搬运的同一派生结果**（popup 的 `html.dark` 层已于 2026-08-25 退役，无预设深色统一为 flexoki-dark 预设）
  （字面 hex，注释里写明重新派生的方法），由同一道门验证。
- **辉光 `--{ns}-focus-ring` 明确不进对比度门。** 它是带模糊半径的半透明晕，
  对任何填充的实测对比度是**模糊半径的属性而不是颜色的属性**——terminal 的
  `0 0 6px 1px rgba(51,255,51,0.4)` 在任何色相下都到不了 3:1，而且本来就不该到。
  合规住在芯里（上一条的两行门），辉光负责主题身份。**别**因为「这里少了一行」就往
  `COMPONENT_PAIR_SPEC` 里补一条没有主题能过的规则。
- **聚焦不重绘填充**（2026-08-05 收尾统一，三表面全量）。§8 律 6 最初只约束融合控件，但「聚焦时
  底色变白」在普通输入框上同样读作「控件换了材质」而不是「获得焦点」，而且同一屏里一半控件变底、
  一半不变，本身就是不一致。现在是横切规则：**任何控件聚焦只许改 `border-color` 并加环，
  不许改 `background`、不许改 `border-width`**。popup 的 `.field > input`/`.search-field` 是最后
  两处例外，已收敛。`--pp-input-focus-bg` token 保留（仍供两条 `button:hover` 使用），但
  **不再有任何 `:focus` 规则消费它**；2026-08-06 起它也**不再派生** `--pp-focus-bd`——
  后者改由 `focusBdToAA()` 以它为**起点种子**算出 AA 达标值，只在派生的第一步出现。
- **载字段的融合控件，环画在容器上**，见 §8 律 2；**纯按钮分段的环画在格子里**，见同条的格子豁免。
- 门，四道，各管一段：
  - 渲染 oracle 的 `focusRecipe`（`bordered` / `borderless` / `inset`）按名字断言**活级联**产出的
    形状，不是断言某条规则写了什么。探针元素与聚焦元素**可以不是同一个**（`.notes-card-head`
    交给 `.notes-card-top` 那种）——此时 runner 追加要求内部件自己什么都不画，否则「两层环」
    这类缺陷会从只看容器的断言底下溜过去。
  - 渲染 oracle 的 `fusedFocusRing`（外壳画环）与 `fusedSegmentRing`（外壳不动、格子画 inset 环），
    见 §8.4。
  - `tests/ui-contract-tests.mjs` 的**类级**静态门：手写区不许再出现「向外生长的 2px accent 环」
    这一整类写法（不是列举选择器——列举只挡得住已知的那几个，挡不住下一个新加的，
    CLAUDE.md「断言问得太窄等于没门」）。options 的 `.theme-preset-btn.active` 是显式豁免：
    那是**选中标记**不是焦点指示，由 `outlineContrast` 单独看管。
  - 渲染不可达的站点（弹层里只在用户动作后才存在的控件）由 `ui-contract-tests.mjs` 的静态文本
    契约看管——两处都要有主，不许没人管。

### 7.4 状态色一律 token 化

`save` / `warn` / `danger` / `ok` / `offline` 一律走 `--{ns}-*` token，手写区**零裸 hex**。
由 hex ratchet 门看守（计数只减不增，基线 popup 76 / options 103 / library 0，清零后升 RED）。
`color-mix()` 里作为纯运算常量的 `#000` / `#fff` 显式豁免；`rgba()` 只在 `background` / `color` /
`border-color` 属性上计数（阴影 rgba 是既有约定）。

第三条豁免容易被忘：**guard 只剥每行行首的第一个自定义属性定义**，所以 `:root` 里必须**一行一个
声明**——一行写两个 `--x: #aaa; --y: #bbb` 会让第二个字面值逃出豁免、被当成泄漏色报出来。
`library.css:8-12` 的注释在案：即使 `:root` 本身带着一整批合法 hex 字面量（每个都是在**定义**一个
token，不是**消费**一个，guard 本就不算这类），只要保持一行一个声明，「library 基线 = 0」照样成立。
门本身已是零容忍（`tests/ui-contract-tests.mjs` 的 `countBareHex(css) === 0`，三个文件都是），不是仍在
运行中的 ratchet 计数器——没有脚本会打印"当前还剩几个"这种数字。新增 token 定义时照此排版。

### 7.5 hover 的几何门控

任何**改变几何**的 `:hover`（transform / width / height / margin / padding）必须包在
`@media (hover: hover) and (pointer: fine)` 内——触摸设备上 `:hover` 会在点击后 latch，元素会停在
hover 态。**只改颜色的 hover 不需要门控**（颜色 latch 不影响布局，且门控会让触摸设备完全失去按下反馈）。
popup 已按此实践（`popup.css:2067` 注释在案），options/library 目前无几何 hover，本规则用于防新增。

### 7.6 文本内边距与子元素包含（Task 14 泛化）

真机截图揪出 options「查看当前预设 CSS」disclosure 的两条低级错误——summary 文字贴边框、`::after`
chevron 探出边框——根因是同一处：一条 id 选择器规则把水平 padding 清零，同时吃掉了 chevron 的落
脚空间。`scripts/ui-render-audit.mjs --sweep`（发现工具，不进 CI）把这类缺陷泛化成两条通用几何检查，
命中后逐一修复并转成 `tests/render-audit-checklist.mjs` 的手写 `[render]` 断言防回归：

| ID | 断言 | 层 |
|---|---|---|
| `textInset` | 含直接文本节点、且自身或最近的整框（四边都有 border）祖先之间，文本盒到该框内缘的水平间距 ≥4px、垂直间距 ≥2px | `[render]` |
| `childContainment` | `<summary>` 的图标/伪元素子节点（含 `::after` chevron）bbox 必须 ⊆ 宿主 border-box（±1px 容差） | `[render]` |

- `textInset` 只认**四边都有 border**的框（单边分隔线如 `.reset-tab-btn` 的 `border-top` 不算），并在
  遇到滚动/单行省略边界（`overflow:auto`/`scroll`，或 `white-space:nowrap`+`text-overflow:ellipsis`+
  `overflow-x:hidden` 的经典截断写法）时停止向上找框——那是内容设计上就该溢出，不是本条要抓的缺陷。
- `childContainment` 只扫 `<summary>`（disclosure 的图标/chevron），不扫普通按钮：按钮的 `::before`
  命中区扩张（§1.5）是**故意**探出自身视觉框的，同一条断言套用会把设计误判成缺陷。
- 两条都是渲染门（依赖真实级联与布局），不是静态门；新增 disclosure/图标组件时先看这两条是否适用，
  而不是重新发明一套间距判断。

---

## 8. 融合控件（fused control）

**适用**：三表面全量。

### 8.1 什么算融合控件

**两个及以上交互件拼成一个视觉单元**——输入框 + 步进钮、输入框 + 内嵌按钮、分段按钮组、
输入 + 下拉 + 按钮。判据只有一条：**这些件之间有没有可见间隙**。有间隙 = 一排各自独立的控件放在
同一个容器里（工具条、卡片、弹层），本节不适用；无间隙、共享边、读起来是一颗控件 = 融合控件。

这条判据要照字面用，别按"看起来像不像一组"来判。`.vocab-batch-bar` 是带边框带阴影的浮条，
里面的按钮两两之间有 6–8px 间隙——它是**容器**，不是融合控件，容器和子控件各画各的边框是正常的。
`#vocab-lookup-bar`、`.confirm-popover`、`.md-strip`、`.tabs`、预设行同理。清查时**先量间隙**，
不然会把半个表面误判成缺陷。

### 8.2 五条律

1. **边框 / 圆角 / 背景由容器唯一持有。** 内部件一律无独立边框、无独立圆角（容器 `overflow: hidden`
   裁角）、背景透明或 ghost。
2. **focus 环画在容器上——但只为「载文本录入的那一半」**（2026-08-06 修订，真机反馈）。

   | 单元类型 | 容器 | 格子 |
   |---|---|---|
   | 载字段（`.vocab-group-unit`、`.key-wrap`、`.tags-input-wrap`） | **输入框**聚焦时画 §7.3 `bordered` 环 | 步进钮聚焦时容器**不动**，格子自己画 `inset` 环 |
   | 纯按钮分段（`.vocab-sort-seg`） | **不画环** | 聚焦格子画 `inset` 环 |

   **原修订前的写法是 `:focus-within` 一把抓，两个缺陷都出在这里**：① `:focus-within` 没有键盘
   门控，鼠标点一下分段就亮一圈框（`:focus-visible` 才只认键盘）；② tab 到格子时，容器环和格子
   自己的 inset 环**同时**出现，读成两层框。载字段的单元用 `:has(> input[type="text"]:focus)`
   把容器环收敛到文本录入那一条路径上——文本字段的焦点属于包着它的那圈边，按钮格子的焦点属于
   格子自己的盒内，这两句话是这一律的全部内容。

   格子的 `inset` 环见 §7.3，**必须带 `box-shadow: none`**：格子多半是 `.btn`，而生成区的
   `.btn:focus-visible` 现在带辉光，不压掉就会从焊缝溢到邻格上。
3. **内部分隔线单一颜色单一粗细**（1px，与容器边框同色或降饱和一档），贯穿高度一致。分隔线的颜色
   **不得随任何状态变化**——选中态改分隔线颜色是这条律最容易踩的坑（`.vocab-sort-seg` 的原实现）。
4. **hover / press 反馈按 §3 既有语言**，但内部件用 ghost 底色变化，**`transform` 显式取消**：
   `scale(0.97)` 作用在焊死的分段上会在接缝处撕开一条缝。按压瞬时（`transition-duration: 0s`），
   与 §3.2 的行按压语言同源。
5. **内部件与容器边缘的内距上 spacing 阶**；原生附属物（`<input list>` 的 datalist ▼ 之类平台不可
   抑制的）保证在 padding 内不撞分隔线。
6. **rest ↔ focus 状态稳定律**（2026-08-05 第五轮加入）。聚焦只许改**边框颜色**并**加一圈环**
   （`box-shadow` 实现）。除此之外：
   - **禁止改 `border-width`**——宽度一变，容器与每个内部件全部位移，这是「眼睛图标偏移」的根因；
   - **禁止改任何 `background-color`**（容器与内部件都不许），focus 前后同值。字段在聚焦时变白
     读起来是「控件换了材质」，不是「获得焦点」；
   - **内部件不许用底色标示焦点**——一块填充会让它从「单元的一段」变成「浮在单元里的一颗 chip」，
     这正是眼睛钮被打回的原因。要标示当前段，用**项目统一的按钮焦点环**（§7.3 `button` 套）
     并以负 offset 收进内部件自己的盒内：`outline: 2px solid var(--{ns}-accent); outline-offset: -2px`。
     不占布局、不动图标、不碰背景，且不会越界与容器的 `:focus-within` 环打架。
     **不要自造第三种视觉词汇**——本节先后试过 ghost 填充与内嵌下划线，两次都被用户当场否掉
     （下划线那次的原话是「是什么？？？」）。另外，`box-shadow` 在分数定位的小盒上会沿边缘漏出
     一列设备像素的细线（实测：眼睛钮右缘 `rgb(25,77,25)`，聚焦时才出现），`outline` 无此问题。
   - hover **不受**本律约束（它是指针可供性，且不会与焦点态混淆），ghost 底色留给 hover。

   两份参考实现都印证这条：Primer 与 Pico 的分组配方在聚焦时**都只动环与边框颜色，从不动填充**。

### 8.3 结构配方

**出处与许可**（2026-08-05 第五轮方法整改令：禁止手造配方，移植成熟参考实现）：

| 参考 | 许可 | 取用的结构 |
|---|---|---|
| [Primer CSS](https://github.com/primer/css) `src/forms/input-group.scss` | MIT | 容器 + 内部件的分工；`:focus-within` 下把内部按钮的焦点样式对齐到输入框（原注释：「within input group, if button exists change focus styles to match input (no offset)」）；相邻段用负 margin 叠边框成**一条**缝（`.input-group-button:last-child .btn { margin-left: -1px }`）；内侧圆角一律归零 |
| [Pico.css](https://github.com/picocss/pico) `scss/components/_group.scss` | MIT | `[role="group"]` 的整体模型：容器 `display: inline-flex` + `border-radius` + **`box-shadow` 承载焦点环** + `transition: box-shadow`；内部件 `flex: 1 1 auto`、内侧圆角归零；**内部按钮聚焦时交出自己的指示**（原注释：「Remove button box shadow if we have a group box shadow」→ `button:focus { box-shadow: none }`）；聚焦时用 `:has()` 换环而**不换填充** |

**本仓库的适配**（两份参考都没有、必须自己判定的部分）：颜色全部换成 `--{ns}-*` token；
焦点环取本仓库既有的 `--{ns}-focus-ring` / `--{ns}-focus-bd`（Pico 用 `:has()` 换 CSS 变量，
本仓库用 `:focus-within` 直接换值，效果等价且不依赖 `:has()` 支持度）；
「当前是哪一段」用**收进盒内的标准焦点环**——两份参考在这一点上都只做到「段不画自己的环」，
没有正面回答「那用户怎么知道焦点在哪一段」。本仓库对这个缺口的答案是**复用既有语言**
（§7.3 的 button 环 + 负 offset），不是发明新的：自造视觉词汇的两次尝试都被用户否掉（律 6）。

```css
/* 容器（字段型：有文本录入。按钮组型见下方差异说明） */
.<unit> {
  display: inline-flex;
  align-items: stretch;                 /* 分隔线才能贯穿全高 */
  border: 1px solid var(--{ns}-input-border);
  border-radius: var(--{ns}-radius-md);
  background: var(--{ns}-input-bg);
  color: var(--{ns}-fg);
  overflow: hidden;                     /* 裁角：内部件因此不需要任何 radius */
  transition: border-color var(--motion-state) ease, box-shadow var(--motion-state) ease;
}
/* 律 2：容器环只为文本录入那条路径。`:focus-within` 会连步进钮一起吃进来，
   于是格子的 inset 环和容器环同时出现（真机打回的「两层框」）。 */
.<unit>:has(> input[type="text"]:focus) { border-color: var(--{ns}-focus-bd); box-shadow: var(--{ns}-focus-ring); }

/* 内部件。`> ` 让每条覆盖靠特异性 (0,2,0)+ 赢过生成区的 .btn (0,1,0)，不靠源序 */
.<unit> > input[type="text"] { border: 0; border-radius: 0; background: transparent; color: var(--{ns}-fg); }
.<unit> > input[type="text"]:focus,
.<unit> > input[type="text"]:focus-visible { outline: none; }
.<unit> > .<seg> {
  border: 0;
  border-left: 1px solid var(--{ns}-input-border);   /* 唯一分隔线 */
  border-radius: 0;
  background: transparent;
  color: var(--{ns}-fg);
}
.<unit> > .<seg>:hover:not(:disabled)  { background: color-mix(in srgb, var(--{ns}-fg) 6%, var(--{ns}-input-bg)); }
.<unit> > .<seg>:active:not(:disabled) { transform: none; background: color-mix(in srgb, var(--{ns}-fg) 10%, var(--{ns}-input-bg)); transition-duration: 0s; }
/* 律 6 + §7.3 `inset`：聚焦不碰填充；环收进盒内说明「焦点在这一段」。
   box-shadow: none 是必需的——格子是 .btn，生成区的 .btn:focus-visible 带辉光。 */
.<unit> > .<seg>:focus-visible         { outline: 2px solid var(--{ns}-focus-bd); outline-offset: -2px; box-shadow: none; }
```

**图标居中**：内部件是 icon-only 按钮时，**继承 `.btn` 的 `inline-flex` 居中，另加 `gap: 0`**，
不要写 `display: inline-grid; place-items: center`。`shared.js` 的 `setBtnIcon` **恒**发射一个空的
label span（`<span class="btn-ic">svg</span><span></span>`），在 grid 下它会变成第二行
（实测 `grid-template-rows: 14px 0px`），图标就被居中到两行之间、**偏上 2px**；flex 下空 span 是零宽项，
有没有 label 节点都居中。`gap: 0` 是必需的——`.btn` 自带 `gap: var(--{ns}-sp-1)`，会为那个空 span
留出间隙，把图标左推 2px。静态 HTML 写的单子节点按钮不会暴露这个差异（同一份 CSS、不同 DOM），
所以断言必须钉在 **JS 构建**的那一份上。

**按钮组型的三处差异**（`.vocab-sort-seg`）：容器边框取 `--{ns}-border`、底取 `--{ns}-btn-bg`；
**容器完全不画 focus 环**（2026-08-06 修订，见律 2 的表：没有文本录入就没有属于容器的焦点，
聚焦格子的 inset 环即全部指示）；分隔线只画在**有左邻居**的那一格（`.<seg> + .<seg>`），
因为容器的第一格左侧就是容器边框本身。

**内部件的前景取 `--{ns}-fg` 而不是 `--{ns}-btn-fg`**：`btn-fg` 是对 `btn-bg`/`btn-hover` 派生的，
而融合进字段型容器之后图标实际压在 `--{ns}-input-bg` 上。`--{ns}-fg` 才是对这个底派生过的那个
（§6.2）。这条在 `contrast-audit.mjs` 的 `COMPONENT_PAIR_SPEC` 里**没有**对应行（`fg × input-bg`
从未登记），目前唯一看管它的是下面的 `iconContrast` 渲染断言——16 套主题逐个实测，比一条 token 对
更强，但要知道静态侧是空的。

**`.key-wrap` 变体（容器无 chrome，输入框即视觉框）**：options 的 19 个密钥字段与 popup 的
`.secret-field` 是同一形状——`<span>` 只是定位壳，眼睛钮 `position: absolute` 浮在输入框上。这时
律 1 已经天然满足（只有输入框画 chrome），要补的只有律 2：环画在**单元**上而不是眼睛钮上。

```css
.key-wrap:focus-within input { border-color: var(--{ns}-focus-bd); box-shadow: var(--{ns}-focus-ring); }
/* 眼睛钮走 §7.3 `inset`。这里曾经写过 ghost 填充和内嵌下划线两版，都被用户当场否掉
   （律 6 记了原委）；下面这行才是 shipped 的形状。 */
.key-toggle:focus-visible    { outline: 2px solid var(--{ns}-focus-bd); outline-offset: -2px; box-shadow: none; border-radius: var(--{ns}-radius-sm); }
```

`.key-wrap` 保留 `:focus-within`（不是 `:has(> input:focus)`）：它的输入框**就是**视觉框，
眼睛钮浮在框上而不是框里的一格，两个 tab stop 落在同一个视觉盒里，容器环两次都该出现。
`.vocab-group-unit` 的步进钮是**并排的另一格**，形状不同，所以那边才要收敛。

### 8.4 几何 / 结构约束

| ID | 断言 | 层 |
|---|---|---|
| `fusedChildrenFlat` | 容器内每个点名的内部件：圆角为 0、有边框的边**至多一条**（那条就是分隔线）、非选中态背景 alpha 为 0；同一容器内画出来的所有分隔线颜色与粗细一致 | `[render]` |
| `fusedFocusRing` | 律 2 上半（**载字段单元 + 输入框持有焦点**）。`state: "focusWithin"` 下：容器自身渲染出 focus 指示（`outline` 或非 inset 的 `box-shadow`）、该指示相对未聚焦态**确实变了**、方向朝外（`outline-offset ≥ 0` 或非 inset 阴影）、且持有焦点的内部件允许画自己的 outline 但必须收进盒内、不得用 `box-shadow` 标示焦点（律 6） | `[render]` |
| `fusedSegmentRing` | 律 2 下半（**纯按钮分段，或载字段单元里的步进钮持有焦点**）。同一 `focusWithin` 状态下：容器的 `border-color` / `box-shadow` / `outline-style` 相对未聚焦态**三者全都没变**，且持有焦点的格子画出了自己的环、方向朝内（`outline-offset < 0`）、并且不画 `box-shadow`。**两半都要断言**：只查前者会放过「有外壳环但看不出是哪一格」，只查后者会放过「两层框」 | `[render]` |
| `fusedStateStable` | 律 6。rest 与 focus 两趟用**同一个探针**取快照并逐值比对，容器与 `fusedStateStableChildren` 点名的每个内部件都要过三关：① `getBoundingClientRect` 四值全等（并附带 `border-width` 一起报，好直接点名位移的成因）；② `background-color` 不变；③ 内部 `svg` 中心点不变 | `[render]` |
| `iconVCenter` | icon-only 内部件的 svg 中心与宿主内容盒中心纵向偏差 ≤1px。**必须钉在 JS 构建的实例上**——静态 HTML 的单子节点副本测不出 §8.3 说的那个空 label span 问题 | `[render]` |

两条都在 `tests/render-audit-checklist.mjs`，跑遍 16 套主题。`fusedChildrenFlat` 的
"非选中态"限定是有意的：分段控件选中格的填充**就是**选中状态本身（律 4 的 ghost 家族），
不是 chrome——`aria-pressed="true"` / `aria-selected="true"` / `.active` 三者任一即豁免该子句。
`fusedFocusRing` 的 `focusWithin` 状态需要 runner 配合两件事，改 `ui-render-audit.mjs` 前别拆：
聚焦后**等过渡结束再读**（同一 task 内读到的是 `none` 的 t=0 插值，看起来就像没有环），
以及聚焦前**先按一次真实按键**（Chromium 只在键盘模态下让 `<button>` 匹配 `:focus-visible`，
否则"内部件不画 outline"这条断言恒真、形同虚设）。

### 8.5 适用控件清单

| 控件 | 表面 | 判定 | 备注 |
|---|---|---|---|
| `.vocab-group-unit`（批量条 + 详情面板两处） | library | **本次重建** | 输入 + 双步进钮；用户四轮打回的主案 |
| `.vocab-sort-seg` | library | **本次重建** | 分段按钮对；分隔线原本随 `aria-pressed` 变色 |
| `.key-wrap`（19 个密钥字段） | options | **本次修律 2** | 容器无 chrome 变体 |
| `.secret-field` | popup | **本次修律 2** | 同上，跨表面同形 |
| `.tags-input-wrap` | popup | **已合规（参考实现）** | 本律的现成样板：容器持 chrome、input `border: none`、`:focus-within` 环 |
| `.progress-bar` / `.batch-progress` | options / popup | **已合规** | 非交互，律 2/4 不适用；`overflow: hidden` 裁角的现成先例 |
| chip + 单个 `×` 钮（`.vocab-group-chip.removable`、`.tag-item`） | library / popup | **不适用** | 只有一个交互件（药丸本身不可聚焦），不满足"两个及以上" |
| `.saved-theme-wrap` | options | **不适用** | 删除钮是浮在药丸外的角标，不共享边 |
| 容器类（`.vocab-batch-bar` / `#vocab-lookup-bar` / `.confirm-popover` ×3 / `.theme-name-popover` / `.md-strip` / `.tabs` / 预设行 / `.vocab-batch-cluster` / `.et-field` / `.quick-row` / `.notes-toolbar` / `.vocab-filter-toolbar` …） | 三表面 | **不适用** | 子控件之间有可见间隙（§8.1） |

### 8.6 使用守则

- 新增复合控件时先量间隙：**有间隙走容器，无间隙走本节**。别按"看着像一组"下判断。
- 内部件的覆盖一律写成 `.<unit> > .<child>` 形式。同特异性靠源序取胜的写法在本仓库出过事
  （Task 9 的 REVERSE 源序翻转），融合控件要覆盖的又恰好是生成区的 `.btn`，别赌。
- 容器加 `overflow: hidden` 之后，内部件的 `border-radius` 一律删干净，别留"反正被裁掉了"的死声明——
  下一个人删掉 `overflow` 时它们会一起复活。
- 主题覆盖块（`html[data-theme] …`）里**与基类同值的声明要删**：它的特异性通常比新写的
  `:focus-visible`/`:hover` 规则高一档，会让新规则只在默认表面生效、13 套预设下静默消失
  （popup `.key-toggle` 的 `background: transparent` 就是这个形状，见附录 C32）。
- 分隔线用内部件的 `border-left`，不要用伪元素——伪元素不参与 `align-items: stretch`，
  高度要另外维护。

---

## 9. Soft Fill（静息填充语言）

**适用**：三表面全量。**豁免**：terminal（见 §9.5）。

来历：2026-07-14 两轮画布迭代后用户本人选定 1b Soft Fill，同一份记录里 terminal 的身份写作
「硬边 #33ff33 + 磷光 bloom ring」。本节是把那次选择铺到全部三个表面，不是新提案。

### 9.1 六条律

1. **rest 去线框。** 静息态控件靠**填充**自证身份，`border-color` 塌陷到自己的填充色。
   `border-width` 保留 1px——**零布局位移**是这条律的硬约束，`border: none` 不算合规实现。
   承载塌陷的是**每角色一个 token**：`--{ns}-btn-border` / `--{ns}-input-border`
   （popup 用自己的 `-bd` 后缀：`--pp-btn-bd` / `--pp-input-bd`）。控件规则一律引用这些，
   **不再引用 `--{ns}-border`**——后者留给真正的结构边（浮层、表格线、滚动条）。

2. **填充必须与所在表面分离。** 去掉边框后，与宿主表面同色的填充 = 看不见的控件。
   派生函数 `fillSeparate(fill, surfaces, fg, min)`（`composers/_ui-derive.mjs`）把表面自己的
   `fg` 混进填充，直到对**每一个**宿主表面都达到 1.06:1。
   - **分离的基准是控件真正坐着的那层**，而且往往不止一层：library 的 `.btn` 既出现在
     `--lib-bg` 的工具条上，也出现在 `--lib-panel` 的详情面板里，只对其中一层分离会把填充
     推到另一层上。所以宿主是**数组**，不是单值。
   - 1.06:1 远低于 WCAG 1.4.11 的 3:1，这是**故意的**：1.4.11 管的是「控件边界对背景」，
     那件事仍由 focus 环与 hover 填充在做；这条门只管「静息形状还看不看得见」。
     白底上单通道差一级约 1.005:1（完全不可见），1.06:1 约四级，是平面填充开始读作
     「另一层」而不是「色带」的位置。
   - **hover 必须跟着重算。** 静息填充一变深，旧的 hover 填充就贴到了新静息上
     （实测默认表面 1.00–1.02:1，hover 完全不再是一个变化）。同一个函数，宿主取新静息填充。
   - 已达标的主题**恒等返回**，字节不变。

3. **列表选中 / hover 高亮内嵌。** 高亮带不得满幅铺到容器边：`border-radius > 0`
   且左右各留 ≥4px 内距，**永不触容器角**。左侧 accent 条不需要额外规则——inset `box-shadow`
   跟随 `border-radius`，带一有圆角，accent 条自动收进去并跟着圆。

4. **分隔线与卡片：不画完整包围框。** 卡片 / 分节的边降到发丝级（`--{ns}-border-section`），
   列表行之间靠间距与填充分层、不靠线。浮层（popover / dropdown）**例外**：它盖在无关内容上，
   那圈 3:1 的边在干实事，保留。

5. **不变的部分。** hover 加深、focus 环（§7.3）、selected accent、danger 两档（§4）
   **一律不动**。本节只改静息态。

6. **豁免只豁免颜色。** 见 §9.5。

7. **tab 是标签加一条选中边，不是穿着 tab 文案的按钮。** 无壳、无填充、无圆角；
   未选中 `--{ns}-fg-muted`，选中/hover `--{ns}-fg`；选中态 = 2px accent 下边框，
   且**边框宽度常驻**、只换颜色（零位移，同律 1）。**不改字重**——13px 标签 400→600
   宽约 +4px，每次切换都会推开邻座。焦点走 §7.3 的按钮环。

### 9.2 圆角三律

1. **圆角只许引用 radius token 阶梯**（`--{ns}-radius-{sm|md|lg|full}`）。不许字面量、
   不许 `calc()` 现编。terminal 之类把 radius 压到 2/4px 的 pilot 因此**自动**接近直角——
   这是本律在起作用，不是给它开豁免。门：`recipe-lint` 检查 13。
2. **嵌套同心律。** 严格形式是「内半径 = 外半径 − 内距」；可自动化的那一半是
   **内半径 ≤ 外半径**，且只对**贴边嵌套**的对生效（一颗 16px 内距的 `.btn` 坐在 `.panel` 里
   不是同心对，把它列进去只会逼出一个毫无意义的 0）。门：`recipe-lint` 检查 14，
   走**手写注册表** + 读**已发布 CSS** 的实际值。
3. **列表选中内嵌** = §9.1 律 3。门：render oracle 的 `insetBand`。

### 9.3 两条横切纪律（都是本轮实证踩出来的）

- **per-surface 规则不许写裸类名。** `.divider` / `.btn` 这类通用名三个表面共用，
  一条没限定作用域的规则会跨表面命中，并引用**在那个表面根本不存在**的 token。
  失败方式是**静默回退到 `currentcolor`**，不是报错——`hr` 的 UA 默认 `color: gray`
  于是画出一条 #808080 硬灰线，看起来像「设计得太重」而不是像 bug。
- **状态规则不许被 ID 选择器截胡。** 组件内部状态（pressed / seam / hover）的特异性必须高于
  任何 `#view-* .btn` 之类的表面级批量规则，否则状态被静默抹平（实测：分段控件的胶囊、缝、
  选中段三个探针读出**逐字节相同**的颜色）。正解是表面级规则**别用 ID**，
  而不是让下游一路加 ID 追特异性。

### 9.4 门

| 门 | 管什么 |
|---|---|
| `contrast-audit` 的 `border vs btn-bg` / `border vs panel` | 填充一移动，结构边的 3:1 就得跟着重算（本轮逮到三个陈旧默认值：options 2.97、library 2.76、popup 的 danger-quiet-fg 4.41） |
| `recipe-lint` 13 / 14 | 圆角 token 阶梯 + 嵌套同心 |
| render oracle `insetBand` | 列表高亮带内嵌：inline ≥4px、block ≥2px、圆角**等于本主题的 md 阶**（两个列表各一条，15 主题） |
| render oracle `tabChrome` | tab 无壳 + 选中下划线（选中/未选中各一条，15 主题） |
| `ui-token-coverage` | 新角色 token 在每个主题块都有定义 |

`fillSeparate` 本身**没有独立的门**：它的正确性由 `contrast-audit` 从下游反向约束
（填充错了，btn-fg / border / danger-quiet-fg 的配对必然红），加上恒等性质
（已达标主题字节不变）由 `diff-all --strict` 守着。

### 9.5 terminal 豁免

**只豁免颜色，不豁免几何。** 圆角与内距通过 token 阶梯自然生效（§9.2 律 1），不单独 `:not()`。

豁免走 pilot 的 `ui.<surface>.<mode>` 通道**逐角色**恢复边框：`btn-bd` / `input-bd`（popup）、
`btn-border` / `input-border`（options / library）。composer 把「pilot 声明了这个角色的边框」
本身当作豁免信号——**有框的控件不需要填充来承担可供性**——所以同一次声明也让该角色的填充
保持 pilot 原值。

值写 `var(--{ns}-border)` 而不是复制字面量：那个值是每表面 `borderToAA` 派生出来的，
字面量会在派生下次移动时变陈旧（本轮三个默认边正是这么坏的）。

验收（与铺开前逐块 diff）：三个表面的 terminal 块**只增不改**——原有 token 逐字节相同，
新增的每一个都解析成被删掉的手写规则原本画的那个值。

---

## 10. 布局原语与关系律（消费侧词汇）

§1–§9 管的是**组件**（按钮、chip、字段、融合控件）的配方；本节管的是把组件摆进页面的**结构词汇**——分区、表单组、动作行、提示、折叠——以及它们之间的**间距关系**。2026-09-05 的设置页复盘证明：组件配方全绿，页面仍能长出 27 个各自带 margin 的按钮行包装类、5 种分区标题面、2 套折叠机制，因为没有任何东西在新元素落地时逼问「既有原语能不能用」。本节 + `ui-vocabulary.json` 注册表 + `scripts/ui-vocabulary-lint.mjs` 就是那道逼问。

### 10.1 注册表（`docs/theme-surface/ui-vocabulary.json`）

每个表面三张名单：`primitives`（可复用的结构原语，本节定义契约）、`regions`（页面骨架，合法唯一：header / pane / list-region…）、`components`（§1–§9 已治理的组件族 token）。名字像结构包装（`structuralPattern`：`-row/-actions/-bar/-toolbar/-card/-section/-panel/-list/…`，或 `exactStructural` 里的短名如 `fg`/`hint`/`row`）却不在这三张名单里的类，必须在 `scripts/ui-vocabulary-baseline.json`（遗留基线，只减不增）里，否则 BLOCK。基线 2026-09-05 起算：popup 24 / options 32 / library 28 / md-preview 53 / shared 4 个结构性遗留 token，另 233 个非结构性 token 作观察项（新增只 WARN）。

### 10.2 各表面原语与契约

| 表面 | 原语 | 契约（拥有的几何） |
|---|---|---|
| options | `.fg` | 表单组；`margin-bottom: var(--opt-rhythm)`（12px）= 组间节律的唯一主人 |
| options | `.fg-stack` | `.fg` 修饰：peer 选项堆叠；标题 `.bl` → 首项 6px；行距 2/4px |
| options | `.fg-indent` | 从属项缩进 `--opt-indent`（20px = 13px 复选框 + sp-3，刻度外故有名） |
| options | `.fg-actions` | 按钮/状态行：flex + gap sp-4；作 `.fg` 末子元素时 `margin-top: sp-3`；作兄弟时不带 margin |
| options | `.hint` / `.hint-warn` | 11px 辅助文字；`.fg > .hint` 距控件 sp-1；组外 `margin: sp-1 0 rhythm` |
| options | `.section-title` | h2，13px/700，上下 sp-4；配 `.divider`（sp-6 0，1px） |
| options | `.choice-row` | 复选/单选行标记；在 `.fg-stack` 内行距 sp-1 |
| options | `details.disclosure` + `.disclosure-body` | 唯一折叠原语；标题 = section-title 面 + 右侧 chevron；成员自带上边线，堆叠对称 12px；正文齐平，`> :last-child` 去下 margin |
| options | `.context-help-host` (+ `-section` / `-action-row`) | 上下文帮助宿主 grid；24px 帮助按钮**不参与行高**（零高 margin box） |
| options | `.pf` | 带边框子面板（provider 卡）：padding sp-5，radius md |
| popup | `.row` / `.label` / `.field` | 表单行壳（flex，padding sp-2 sp-5，gap sp-4）/ 52px 标签槽 / 控件槽（flex:1，min-width:0） |
| popup | `.suggest-area` | chip 流容器 |
| popup | `.divider` | 表单与快捷区之间的分隔 |
| popup | `.actions` | 按钮行（flex wrap，align center，gap sp-4）：标签操作行、批量授权操作行、离线队列条目操作；margin 由父级关系规则拥有（`.batch-permission > .actions`、`.offline-queue-item > .actions`）。`.fc-actions` 仍是共享反馈卡的组件；`.quick-row`（space-between）与 `.submit-bar`（带内距的条）是另外两种形状 |
| library | `.notes-toolbar` | 控件行（flex wrap，gap sp-2，margin sp-2 0 sp-3），vocab/notes 共用 |
| library | `.vocab-batch-bar` / `.notes-batch-bar` | 粘底批量条（同一选择器列表） |
| library | `.notes-empty` | 空态块 |
| library | `.lib-cluster` | 紧凑控件簇（inline-flex，align center，gap sp-1，flex none）：两处「Select all」组与批量条里的标记簇。簇内 quiet 按钮走 `.btn.ghost`，只有静息前景 `--lib-fg-muted` 是簇自己的规则 |
| md-preview | `.rail-section` / `.rail-label` / `.rail-sec-head` | 侧栏分区容器 / 静态标题 / 可折叠标题（共享 margin sp-3 0 sp-2 契约） |
| md-preview | `.msg-bar` | 状态/提示/错误条（padding sp-2 sp-3，与 `.send-status` / `.export-note` / `#ask-tip` 同一条家族；`data-state`） |
| md-preview | `.send-menu` / `.send-mi` | 下拉菜单与菜单项 |
| md-preview | `.pop-panel` | 浮层面板 chrome：`--surface` 底、`--border` 1px 边、`--radius-lg`、统一阴影、13px、内距 sp-3；高亮卡 / 脚注 / 字号面板 / 快捷键帮助 / 搜索条五个 popover 共用，id 规则只留各自的定位与尺寸（帮助对话框内距 sp-4、搜索条 sp-2 sp-3 属有意覆盖） |

清点（2026-09-05 工作流，四表面 138/97/134/273 个 token）同时给出了**候选**原语——popup 的 `actions`/`field-foot`/`banner`/`card`/`list-row`、library 的 `lib-row`/`lib-cluster`/`lib-section`/`lib-block`/`lib-quote`、md-preview 的 `rail-row`/`panel-head`/`panel-actions`/`seg-row`/`stack`/`pop-body`/`scroll-list`——每个都能吸收 5～15 个遗留类。它们**尚未登记**：登记的时机是把对应遗留类真正迁过去的那次施工，不提前占名。

### 10.3 关系律（间距由关系拥有，不由元素拥有）

| ID | 律 | 层 |
|---|---|---|
| `fgRhythm` | options `.fg` 内：`label.bl` → 控件 3–6px；任何动作行（`.fg-actions` / 裸按钮）上方 ≥4px | `[render]` family 5 |
| `noInlineSpacing` | 四个表面 HTML 不得出现 `style="…margin/padding/gap…"` | `[static]` layout-lint RULE 5 |
| `vocabRegistered` | 结构类名必须在注册表或遗留基线；基线只减不增 | `[static]` ui-vocabulary-lint |
| `controlRung` | 所有可见 `input/select/.btn`/融合壳 高度 ∈ {26±1, 20±1}；结构性豁免：页签 32、textarea、设置搜索框、链接态按钮、整行可点元素与状态卡、无边框色板药丸、融合内层 | `[render]` family 6 |
| `headerFace` | 同表面分区标题集（options：h2 + `.disclosure > summary`；md-preview：`.rail-label` + `.rail-sec-head`）computed 面唯一 | `[render]` family 7 |
| `actionRowGap` | 含按钮的 flex/grid 行 column-gap **= 8px**（`--opt-sp-4` / `--pp-sp-4` / `--lib-sp-2` / `--sp-2`），四表面同一值；space-between 行、页签、融合壳、图标簇、色板/chip 行、分段条豁免 | `[render]` family 8 |
| `radiusScale` | 有 chrome 的盒子统一圆角 ∈ 本表面 radius token 的**实时**值（token 逐主题不同）或 pill；融合壳后代豁免 | `[render]` family 9 |
| `textFloor` | 任何可见文字 computed font-size ≥ 11px（`sup`/`sub` 除外；阅读器正文不在 chrome 扫描内） | `[render]` family 10 |
| `spacingScale` | 所有元素的 margin、以及**布局盒**（条/面板/弹层/行/列表）的 padding 与 gap，computed 值 ∈ 本表面 sp 刻度的**实时**值（`--opt-sp-N` / `--pp-sp-N` / `--lib-sp-N` / `--sp-N`）；`auto`/百分比/负值/≤1px hairline 不计。**控件与 chip 自身的 inset 是组件几何**（`.btn-sm` 2/8、chip padV 2、select 箭头位 26、key 字段眼睛位 32），由 controlRung / hitAreaMin / chip 律管，本律只查其 margin。页面壳（`main` / `.rail` / 空态）与派生对齐偏移（`.fg-indent` = 复选框 16 + 4）豁免。存量债在 `tests/render-audit-spacing-baseline.json`（只减不增：新增即 FAIL，删除放行并报 STALE；`--write-spacing-baseline` 是唯一写入口） | `[render]` family 11 |

### 10.4 门与触发面

- 编辑期：`.claude/settings.json` PostToolUse → `scripts/ui-consumer-lint.mjs`（layout-lint + ui-vocabulary，<1s，红即回喂）。
- 提交期：`scripts/pre-commit-hook.sh` 第二触发组（四 HTML / 表面 JS / md-preview.css / 注册表 / 基线）。
- push 期：`scripts/verify.sh` `[ui-vocabulary]`（含 `tests/ui-vocabulary-tests.mjs` CLI 契约）+ `[render-audit]` 的类扫描家族（family 4–11；`spacingScale` 对账 `tests/render-audit-spacing-baseline.json`，其余对账 `render-audit-known-failures.json`）。
- 新增原语的流程：注册表登记 → 本节补一行契约 → CSS 写关系规则 → 门自然放行。顺序反过来（先写 CSS 再想名字）就是本节要消灭的路径。

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
- [ ] 有没有 `!important` 参与这场级联？（popup `.del-btn` 的
      `border-color: var(--pp-danger) !important` 曾是 popup 豁免的成因之一，2026-08-07 随该按钮
      迁到 `class="btn danger"` 一并删除；`.del-confirm-popover` 系的另外三个 `!important` 随那套
      弹层退休消失。popup.css 现已无按钮相关 `!important`——这一条继续问的是**下一个**。）

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

**2026-08-05 融合控件批次追加**（§8；左列是本次改掉的现状）：

| Before | After | Why |
| --- | --- | --- |
| 焊死的分段上保留 `.btn:active { transform: scale(0.97) }` | `transform: none` + 背景加深 10%、`transition-duration: 0s` | 缩放一颗与邻居共边的格子会在接缝处撕开一条缝再合上——按压反馈本身制造了一个视觉故障。改用 §3.2 已有的行按压语言（背景加深、瞬时），不新造第三种 |
| 环画在内部件上，靠 `outline-offset` 调远近 | 环画在容器上（`:focus-within`） | 内部件的环尺寸等于内部件，不等于用户看到的那颗控件；且相邻件的不透明底色会把它盖掉。调 offset 只是把「盖掉多少」挪一挪，改不了「环框错了对象」 |
| focus 后立刻读 computed style 判断有没有环 | 聚焦 → 等过渡结束 → 再读 | `transition: box-shadow 150ms` 让 t=0 的 computed 值是 `none` 的插值（透明零尺寸阴影），看起来就是「没有环」。这条不是美学，是本批次调试时真的据此误判过一轮 |
| 脚本 `.focus()` 后断言「内部件不画 outline」 | 先发一次真实按键，再 `.focus()` | Chromium 只在键盘模态下让 `<button>` 匹配 `:focus-visible`。少了这一步，这条断言在任何实现下都通过——是一条永远为真的假断言 |
| 主题覆盖块里与基类同值的声明「可以顺手删掉」 | 先量特异性再删；本次实测不可删 | popup `html[data-theme] .login-body .key-toggle { background: transparent }` 看着是基类 `background: none` 的重复，实际压制的是 `html[data-theme] .login-body button` 的 `--pp-bg2`。删掉后 13 套预设下眼睛图标后面出现不透明方块（dracula/terminal 实测） |

---

## 附录 C：与现状的差异台账

本规范相对三份 CSS 现状的**可见变化**逐条在此登记。施工任务（Task 9 / 10）按此核销；用户过目点看这张表。

| # | 位置 | 现状 | 规范值 | 可见变化 | 排期 |
|---|---|---|---|---|---|
| C1 | `.btn`（opt + lib） | 无 `color`，`line-height: normal`，高 ≈24px；opt 默认浅色态边框是裸字面量 `#999`（lib 早已是 `var(--lib-border, #999)`，`--lib-border` 一直有定义，`#999` fallback 从未真正生效，故 lib 默认态边框无变化） | `color: var(--{ns}-btn-fg)`，`line-height: 16px`，高 26px；边框统一走 `var(--{ns}-border)` | 暗色主题下文字与图标**从不可见变为可见**（核心缺陷）；高度 +2px；zh-CN 与 en 下高度不再有差；**opt 默认浅色态边框 `#999`→`#ccc`**（本行记录 C1 当时的 `--opt-border` 默认值改动，变淡一档；该默认值后被 design-uplift Task 16 的 borderToAA 派生取代为 `#8a8a8a`——现状以 `options.css` 的 `--opt-border` 实际值为准，本条只保留历史对照，不代表现状），lib 默认态边框无可见变化 | 本战役 |
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
| C15 | `color-scheme`（lib） | 全文零声明 | `:root` + 每暗色主题块 | library 的原生滚动条 / `<select>` 弹层在暗色主题下**首次**变暗 | 本战役 |
| C16 | `--pp-tag-bg` / `--pp-tag-fg` | 直取 palette，无 AA 校正 | 由 `--pp-chip-bg` / `--pp-chip-fg` 取代，旧名退役 | 个别主题下 popup 标签 chip 配色会变 | 本战役 |
| C17 | `html[data-theme] .btn` 三条（`options.css:1325/1326/1359`） | 存在，特异性 (0,2,1) 赢过配方 | 删除 | 无独立视觉变化（配方接管同样的值），但**不删则 `--opt-btn-fg` 在 13 套预设下全是死代码**。与发射同 commit | 本战役 |
| C18 | `html[data-theme] .fg` 字段两条（`options.css:1187-1191`、`1192-1196`） | 存在，同上 | 删除 | themed 态字段的三色与 hover 边框改由配方供给；hover 边框值从 `--opt-fg-muted` 变成 `color-mix(input-border 55%, fg)`，暗色主题下描边会略淡 | 本战役 |
| C19 | `.opt-error` background（opt，默认态 + 13 套主题） | 硬编码字面量：默认态 `#fff0f0`（不透明浅粉），13 套主题态恒为 `rgba(220,80,80,0.08)`（与主题无关的固定半透明红，从不跟随各主题 danger 色相） | `color-mix(in srgb, var(--opt-danger) 8%, var(--opt-bg))`，删除 `--opt-danger-bg` 这个从未在任何主题块定义过的孤儿 token | 默认态从纯浅粉变为计算色（Chromium 实测 `rgb(255,240,240)`→`color(srgb 0.948 0.884 0.866)`，极接近，肉眼几乎无差）；13 套主题态**首次**随各自 danger 色相变化，不再是恒定的通用红 tint（14 态全部实测变化，见 task-12-report.md 计算样式矩阵） | 本战役 |
| C20 | `--opt-bg` / `--opt-panel` 默认浅色值（opt，composer DEFAULT_LIGHT） | 手写 `:root` 各给了一个通用猜测值：`--opt-bg: #fff`（与 `body` 实际渲染的 `#f5f5f0` 不符）、`--opt-panel: #fafafa`（与 `.panel` 实际渲染的 `#fff` 不符） | 移入 composer `DEFAULT_LIGHT`：`bg: #f5f5f0`（= body 真实值）、`panel: #ffffff`（= .panel 真实值） | **round 3 重写，列全全部消费点**（`grep -n "var(--opt-panel)\|var(--opt-bg)" options.css` 逐条核对，排除 `html[data-theme]` 覆盖块——那些只在主题态生效，不受默认值改动影响）：`--opt-panel` 默认态背景 `#fafafa`→`#fff` 波及 16 个消费点——`.panel`、`.sync-local-only`（9% 混色基准）、`.backup-import-preview`/`.backup-import-result`、`.accordion-header:hover`、`.saved-theme-btn.active`/`.theme-preset-btn.active`（前景色）、`.theme-preset-btn.active::after`（描边）、自定义 select 弹层的 `scrollbar-color` 第二值、`.confirm-popover`、`.theme-name-popover`、`.preset-preview-section summary`、`#wayback-log`、`.wayback-perm-tip`、`.tag-gov-group-row`、`#tag-gov-progress`、`.vocab-disclosure > summary:hover`、`.vocab-drive-fields`；`--opt-bg` 默认态 `#fff`→`#f5f5f0` 波及（除 `body` 本身这个角色的第一持有者外）：`.opt-error` 的 `color-mix`（已在 C19 单独登记）、`.btn.ghost:hover`/`.btn.danger.ghost:hover` 的 `color-mix` 混色基准（6-8% 混色下差值低于计算样式矩阵探测阈值，未在矩阵里单独出现但逻辑上同样波及）、自定义 select 弹层背景 `::picker(select)` | 本战役 |
| C21 | `--opt-save` 默认浅色值（opt，composer DEFAULT_LIGHT） | 未定义（仅 13 套主题各自有值），两处消费点各自发明了不一致的 fallback：`.save-status` / `.auto-save-hint.saved` 用 `#080`，`.et-test-status.ok` 用 `#1a7f37`（借的是 github-light 主题的真实值） | `save: #1a7f37`（与 `#f5f5f0` 页面背景对比度 4.65:1，`#080` 仅 4.25:1，不达 AA） | `.save-status` / `.auto-save-hint.saved` 默认态文字色 `#080`→`#1a7f37`（实测），柔和的 GitHub 绿而非饱和终端绿 | 本战役 |
| C22 | `--opt-warn` 默认浅色值 + `field-warn`/`.tnp-overwrite` 消费点（opt，composer DEFAULT_LIGHT + `--opt-warn-soft` 退役） | `--opt-warn` 未定义默认值，且 flexoki-light/dark 两套主题从未给它赋值（`.et-test-status.warn` 等消费点在这两套主题下读到的其实是未定义→初始值，非视觉 bug 但角色不完整）；`.field-warn` / `.tnp-overwrite` 另开了页面局部 `--opt-warn-soft`，恒为 `#b85c00`，从不随主题变化；`.overlay-byte-counter.warn` / `.sync-local-only` 各自的 fallback 文本还有 `#d97706` / `#e08040` 两个不一致的值 | `warn: #9a6700`（github-light 同款，对默认 `#f5f5f0` 背景 4.45:1，未达 4.5——见下方说明，本任务未重新派生这个值）；flexoki 两套主题在 `pilots/flexoki.tokens.json` 补上 `ui.options.light/dark.warn`；`--opt-warn-soft` 删除，全部消费点裸消费 `var(--opt-warn)` | 默认态：`.field-warn` 文字色 `#b85c00`→`#9a6700`，`.overlay-byte-counter.warn` `#d97706`→`#9a6700`（实测）。13 套主题态：`.field-warn` / `.tnp-overwrite` **首次**随主题变色（此前恒为 `#b85c00`，14 态全部实测变化）；flexoki 两套主题下 `.et-test-status.warn` 等**首次**拿到属于自己的 warn 色，此前读到的是未定义初始值。**round 3 修正**：flexoki-light 的 warn 值最初填的是该主题 palette 里现成的 `#AD8301`（`tag-fg` 角色），真机复审量出对 `--opt-panel`(`#F2F0E5`) 只有 **3.05:1**、对 `--opt-bg`(`#FFFCF0`) 只有 3.39:1——14 态里唯一不过 4.5:1 的（其余全部实测≥4.45，github-light 对本主题自身双底更是 4.57/4.87）。改用 `fgToAA(#AD8301, panel, 4.5)` 派生的 `#846401`：对 panel 4.83:1、对 bg 5.37:1，双底都过。flexoki-dark 的 `#D0A215` 未受影响（对该主题自身双底早已达标，未改动）。composer `options-chrome.mjs` 里此前声称"两值都对 `#f5f5f0` 过 4.5:1"的注释是假的（save 4.64:1 属实，warn 实测 4.45:1 不过），已改写为如实的对比度数值 + 不改默认态 warn 值的理由说明 | 本战役 |
| C23 | `#opt-custom-css.over-limit` 边框 / `.tag-gov-problem-kind.bad` / `.saved-theme-del`（opt） | 三处四个声明全部是与主题无关的固定字面量：`#c00`（边框/`.bad` 文字/`.saved-theme-del` 背景）、`#fff`（`.saved-theme-del` 文字），13 套主题下恒定不变 | 裸消费 `var(--opt-danger)` / `var(--opt-on-danger)` | 默认态 0 变化（`#c00` = `--opt-danger` 默认值、`#fff` = `--opt-on-danger` 默认值，精确相等）；13 套主题态**首次**跟随各自 danger/on-danger 配色（此前恒定不变），按 spec 判定为许可的修正性变化，非缺陷 | 本战役 |
| C24 | `.overlay-byte-counter` 默认文字色（opt） | `#888`（页面局部字面量） | 裸消费 `var(--opt-fg-muted)`（= `#666`） | 默认态从 `#888` 变 `#666`（实测），与同类次级说明文字（`.panel-foot a` 等）的灰阶统一 | 本战役 |
| C25 | `.kbd-help-chips kbd` 默认背景（opt） | `#f5f5f0`（与 `--opt-btn-bg` 数值巧合相同，语义借用按钮底色） | 裸消费 `var(--opt-input-bg)`（= `#fff`） | 默认态从 `#f5f5f0` 变 `#fff`（实测），与其余输入类控件底色一致 | 本战役 |
| C26 | `.et-field input[type=text\|password]:hover:not(:focus)` 边框（opt）——**round 3 改正**，原表述有误 | 固定字面量 `#9aa0a6`，13 套主题下恒定不变 | `color-mix(in srgb, var(--opt-input-border) 55%, var(--opt-fg))`，与 `.fg select:hover` 完全同配方 | 默认态从 `#9aa0a6` 变为计算值，**只影响两个 `<input>` 选择器**——`.et-field select:hover:not(:focus)` 原本也在同一条规则的选择器组里，但它是死代码：一条特异性相同、源序更靠后的 `.fg select:hover:not(:focus), .et-field select:hover:not(:focus) { border-color: var(--opt-input-border); }` 规则（customizable-select 配方块）从一开始就赢得了 select 分支，round 2 加的 color-mix 从未在 select 上真正生效过。round 3 已把 select 从两处（本条 + 对应的 `html[data-theme]` 覆盖）选择器组里删除，只保留 input。**因此 select 的 hover 边框本次 0 变化**（一直是 `var(--opt-input-border)`，无论主题） | 本战役 |
| C27 | `--opt-border-section` / `--opt-fg-hint` 默认值（opt，手写 `:root`） | 均未定义默认值：`--opt-border-section` 5 个调用点各写各的 fallback（`#e0e0e0`×2 / `#e8e8e8`×2 / `#ddd`×1）；`--opt-fg-hint` 5 个调用点里 4 个写 `#757575`、`.key-toggle` 单独写 `#888` | 补 `--opt-border-section: #e8e8e8;`（取众数，2 个调用点原本就是这个值）、`--opt-fg-hint: #757575;`（取众数，4/5 调用点原本就是这个值），全部调用点裸消费 | 默认态：`.reset-tab-btn` 顶边框 `#e0e0e0`→`#e8e8e8`、`.divider` `#ddd`→`#e8e8e8`、移动端 `.reset-tab-btn` 左边框 `#e0e0e0`→`#e8e8e8`（三处实测变化）；`.key-toggle` 文字色 `#888`→`#757575`（实测变化）。`.panel-foot`/`.accordion-section`（已是 `#e8e8e8`）、`.hint`/`.overlay-meta` 等 3 处（已是 `#757575`）0 diff | 本战役 |
| C28 | `.status-ic.ok` / `.status-ic.bad` / `.et-test-status.err` 默认文字色（opt）——**round 3 补登记**，round 2 报告的 B 类表格漏了这三处的可见变化列 | `.status-ic.ok` 固定 `#2a8a2a`（round 1 里从未有 `html[data-theme]` 覆盖，13 套主题下恒定不变）；`.status-ic.bad` 固定 `#c0392b`（round 1 里已有 `html[data-theme] .status-ic.bad { color: var(--opt-danger, #c0392b); }` 覆盖，主题态早已经由 danger 角色接管，只是覆盖行自己的 fallback 文本是死代码）；`.et-test-status.err` 固定 `#cf222e`（同上，round 1 覆盖行已把主题态交给 danger 角色） | 三处均裸消费既有角色：`.status-ic.ok`→`var(--opt-save)`，`.status-ic.bad`/`.et-test-status.err`→`var(--opt-danger)` | 默认态三处实测变化：`#2a8a2a`→`#1a7f37`、`#c0392b`→`#cc0000`、`#cf222e`→`#cc0000`。`.status-ic.ok` 是这三处里**唯一首次参与主题化**的（round 1 从未被任何 `html[data-theme]` 规则覆盖过，13 套主题下此前恒为 `#2a8a2a`）；`.status-ic.bad`/`.et-test-status.err` 的主题态渲染**不变**（round 1 的覆盖行虽然文本上写的是死 fallback，但两者引用的都已经是 `--opt-danger`，跟本次改动后的裸消费解析到同一个值） | 本战役 |
| C29 | `.preset-btn.used` 边框（popup，14 套主题）——**USER CHECKPOINT 2026-08-04 打回后改正**，替换 Task 16 一审登记的错误方向 | Task 16 一审曾让 `--pp-preset-bd` 跟随派生后的 `--pp-border` 走重（`ui["preset-bd"] = ui["border"]`），`.preset-btn.used` 与未用过的 `.preset-btn` 因此都读重描边——用户真机看到后判定「太夸张，很 low」，当场打回 | `--pp-preset-bd` 与 `--pp-border` 解绑，`preset-bd` 保留 Task 16 前的原始（未派生）palette 值；`.preset-btn.used` 的 `border-color` 从 `var(--pp-border)` 改回 `var(--pp-preset-bd)`，与 `.preset-btn`（未用过）同源。§1.3 补 preset swatch row 豁免（本节上方） | 14 套主题下 `.preset-btn.used` 边框实测变轻（回到战役前观感）；`.preset-btn`（未用过）无变化（`preset-bd` 从未真正被 Task 16 一审的重值污染过，只是 `.used` 单向读错了 token）。`--pp-preset-bd` 自此与 `--pp-border` 数值分道扬镳（战役前二者字节相同） | 本战役 |
| C30 | 预设按钮行整体重设计（popup `.preset-btn`/`.preset-btn.used` + options `.theme-preset-btn`/`.saved-theme-btn`）——**USER CHECKPOINT 2026-08-04，C29 之后用户再次打回**：「有什么更现代优雅的设计吗？或者不光是描边问题，是整个按钮设计的问题」。三版真实渲染变体（色板优先／静默卡片／胶囊分段，`.superpowers/sdd/2026-08-03-design-uplift/preset-variants-report.md`）供用户选定后，本行落地**用户选中的变体 A：色板优先** | popup：1px 描边 + `border-radius: var(--pp-radius-sm)` 小圆角矩形，文字色 `--pp-preset-fg`。options：`.theme-preset-btn`/`.saved-theme-btn` 继承 `.btn` 的 1px `--opt-border` 描边 + `radius-md`；`.active` 态整底反色填充（`background: var(--opt-accent); color: var(--opt-panel)`）+ 边框描边框 `--opt-preset-active-border` + 一个 `::after` 伪元素用两条边框画出的 4×8px 打勾图标，需要专门的 20px 左内边距为打勾腾位置 | 两侧均改为**无边框圆角药丸**（`border: none; border-radius: var(--{ns}-radius-full)`），静息态填充改为轻量 accent 色调（`color-mix(in srgb, var(--{ns}-accent) 10%, var(--{ns}-panel/bg))`），标签前追加一枚 `::before` accent 色圆点——**popup** 跨主题同源 `var(--pp-accent)`（tag 预设无「该 tag 自身颜色」这个概念，圆点只是「当前主题强调色」的装饰，没有专属色可取）；**options 圆点是每个预设自己的强调色**（2026-08-05 修正，替换首版「全部圆点同色」的处置——首版判定「options 无现成每预设取色源」不成立，权威源就是 theme factory 的 pilots：`composers/options-chrome.mjs` 的 `composeOptionsThemes` 循环里已经为每个 `POPUP_THEME_MAP` 条目算出 `--opt-accent` 的最终值 `map.accent`（含 pilot `ui.options.<mode>` 覆盖后的真值——catppuccin-latte/solarized-light 两家都在这层覆盖过 accent，若只读派生前的 palette 原值会取到错误颜色），新增 `SWATCH_SOURCE_BY_BUTTON_KEY` 表把 options.html 每颗 `.theme-preset-btn` 已有的 `data-theme` 属性值映射到取色的 `POPUP_THEME_MAP` id（自适应伞值 flexoki/solarized/catppuccin 固定取其 light 态、不随页面明暗切换——圆点是静态身份标记不是实时预览，一种取法比"跟随当前模式"更好推理），在 `composeOptionsThemes` 尾部追加 11 条 `.theme-preset-btn[data-theme="X"] { --variant-swatch: <accent>; }`，落进 `@generated:ui-themes` 区（无需新开区，`apply-ui-themes.mjs` 的 `spliceRegion` 是纯文本替换，不校验区内规则形状）。`--variant-swatch` 默认值 `var(--opt-accent)` 挂在手写基类上（"None" 预设与 `.saved-theme-btn` 落这一档，二者都没有可取的预设身份色），生成区规则靠属性选择器 `(0,2,0)` 天然赢过基类 `(0,1,0)`，不依赖源序。12 个真实色值全部落在生成区文本里，`tests/ui-contract-tests.mjs` 的 hex/rgba 零容忍门只扫手写区（`countBareHex` 按 `@generated` 标记整段切掉），故不触发；hover 态填充加深（沿用既有 `--pp-preset-btn-hover-bg`/`--pp-drop-hover`；options 新增 `color-mix(accent 18%, panel)`）；**唯一真正的「选中」态**（options 的 `.active`，popup 的 `.used` 语义是「已插入」而非「选中」，维持低调不借用环）删除整底反色 + 打勾图标，改为 accent 淡色底 + `color: var(--opt-accent)` 加粗文字 + **2px accent 描边环**（`outline: 2px solid var(--opt-accent); outline-offset: 2px`，环在 border-box 外侧，不贴文字）。按压/焦点语言：popup 新增 `:active { transform: scale(0.97) }`（此前该行零按压反馈）+ focus-visible 去掉死代码 fallback 字面量 `#4477bb`；options 两个都是 `.btn`/`.btn-sm` 的既有类，`scale(0.97)` 按压与 `outline: 2px solid var(--opt-accent)` 焦点环**直接继承**，未新写规则 | popup 14 套主题下：矩形小圆角→无边框圆角药丸，追加圆点，`used` 态圆点用 `currentColor` 淡化（不新增 token，随文字色 `--pp-used-fg`/`--pp-fg-hint` 走）。options 14 套主题下：`.theme-preset-btn`/`.saved-theme-btn` 从「有边框方角按钮，选中态整底反色+打勾」变为「无边框药丸，选中态淡色底+加粗文字+描边环」——check-tick 消失，`padding-left: 20px` 让位给 `gap: 6px` 的 flex 圆点布局；由于新底色/文字都是对 `--opt-accent`/`--opt-panel` 的 `color-mix()`/裸消费（两者本就随主题反应），`html[data-theme]` 原本单独为 `.active` 写的 opt-panel/opt-bg 互换覆盖块整块删除，13 套主题下**一套规则跑通**，不再需要每主题覆盖。四个描边 token（`--pp-preset-btn-bd`/`--pp-preset-bd`/`--pp-preset-btn-used-bd`/`--opt-preset-active-border`）的**消费侧**已清空；前三个是 popup `@generated:ui-themes` 区（composer 产出）的 token，落地本行时未动 composer/pilots，故它们在生成产物里仍然存在但已无消费者（不触发任何现有门禁——`auditOrphanTokens` 只查 `*-fg`/`on-*` 形状，`--pp-preset-bd` 不匹配；`COMPONENT_PAIR_SPEC` 从未登记过它），留作后续若有人清理 composer 时的已知可删项；`--opt-preset-active-border` 是 options 手写 `:root`（非生成区），已直接删除定义。**2026-08-05 追加（销号收尾）**：controller 复核指出"同色圆点"违背色板选择器本意后，本行追加两处 fix——① `composers/options-chrome.mjs` 新增 `SWATCH_SOURCE_BY_BUTTON_KEY`，在 `composeOptionsThemes` 尾部为每个 `.theme-preset-btn[data-theme="X"]` 生成专属 `--variant-swatch` 规则（见本表上方"options 圆点是每个预设自己的强调色"一段的完整机制记录）；② `--pp-preset-bd` 完成真正的销号——`popup-chrome.mjs` 的 `emitPp` 发射列表移除 `"preset-bd"`，composer 不再产出该声明，`sync-all.mjs` 重跑后 14 套主题 `popup.css` 里的 `--pp-preset-bd: ...` 行随之从 `@generated:ui-themes` 区消失（`diff-all --strict` 3892/3892 0 diff、`css-region-audit` PASS 验证一致，`_ui-derive.mjs` 仍内部计算 `preset-bd` 供 options/library 共享调用，但 popup 侧不再选它入 map，无消费者也无发射）。`--pp-preset-btn-bd`/`--pp-preset-btn-used-bd` 两项本就不在 `emitPp` 的 key 列表内，从未被 composer 产出过，措辞不受影响。至此本行记录的四个边框 token 在消费侧与生成侧均已清空 | 本战役 + 2026-08-05 断点续跑收尾（正式实现，preset-variants-report.md 附「正式实现」+「断点续跑」两节） |
| C31 | `--{ns}-chip-bg` 派生（options + library，`_ui-derive.mjs`/`options-chrome.mjs`/`library-chrome.mjs`）——vocab-group-inspect-report.md 2026-08-05 Finding 2：`.vocab-group-chip`（library）与 `.tag-gov-kind-badge`（options）共享同一条派生，9/13 pilot 的 `tag-bg` 是字面 `transparent`，composer 曾 `map["chip-bg"] = palette["tag-bg"]` 原样照抄，把这个字面量直接发射进 `@generated:ui-themes`——`chip-fg` 一侧的对比度检查用 `resolveOpaqueBg` 把它复合到 panel 上算分（读得到分），但**发射出去的 `--{ns}-chip-bg` 本身仍是裸 `transparent`**，两道门都测不到"这套主题的 chip 药丸没有背景"这个缺口（真机实测 dracula 的 `.vocab-group-chip` 只剩绿字，无药丸边界） | 新增 `resolveChipBg(raw, accentRgb, panelRgb)`（`_ui-derive.mjs`）：非透明色照抄；8 位 alpha 走既有 `resolveOpaqueBg`；字面 `transparent`（或任何非色值）改为 `mix(panel, accent, 0.10)`——与两份 `DEFAULT_LIGHT.chip-bg` 注释里"10% accent 混 panel"的既有公式完全一致（数值反推验证：options `#e8edf4`/library `#e8f1fd` 都精确对得上）。`chip-fg` 的对比度检查复用同一个 RGB，不再独立调用 `resolveOpaqueBg` 二次派生 | 9 套主题（catppuccin-latte/mocha、modern-card、github-light 4 家 tag-bg 本就是实色，0 diff）的 `--opt-chip-bg`/`--lib-chip-bg` 从字面 `transparent` 变为对应主题的浅色调（如 dracula `#2c3641`、terminal `#142914`）；`chip-fg` 数值联动微调（同一 RGB 重算，多数主题变化 <0.1 对比度）。`sync-all.mjs` contrast-audit 验证 14 主题 `chip-fg vs chip-bg` 全部 OK（此前 9 套是"读 panel 复合值算分，实际渲染看不见"的假绿） | 2026-08-05 vocab-group 修复 |

| C32 | 融合控件全类清查与统一修复（`.vocab-group-unit` ×2 + `.vocab-sort-seg`（library）、`.key-wrap` ×19（options）、`.secret-field`（popup））——**USER CHECKPOINT 2026-08-05，分组行第四次打回**：「focus 环钻到 + 按钮底下；不聚焦时是三种边框风格拼起来的」，并点明「同类型的问题肯定不止这一处」。三表面全类清查见 §8.5 | **`.vocab-group-unit`**：容器零 chrome，输入框自带 `--lib-input-border` 1px 边框 + 圆角 + 底色，两颗步进钮是 `.btn.btn-sm`、自带 `--lib-border` 1px 边框——实测默认表面 `rgb(213,213,218)` vs `rgb(144,144,159)`，**同一颗 215px 控件里两道接缝是两个颜色两种粗细**；focus 环 `outline: 2px solid accent; outline-offset: 1px` 画在**输入框**上，实测右边缘距容器右缘还差 53px（批量条）/ 158px（详情面板），后半截直接钻进两颗按钮的不透明 `.btn` 底色下面。**`.vocab-sort-seg`**：同形，且**分隔线颜色由 `aria-pressed` 驱动**（选中格 `border-color` 混 45% accent），点一下排序方向，接缝就换个颜色。**`.key-wrap` / `.secret-field`**：律 1 本就满足（只有输入框画 chrome），但眼睛钮自绘 2px 环，实测越过字段右边框 1px（options）/ 1px + 顶部 2px（popup） | 三者统一到 §8 配方：容器唯一持有 border/radius/background + `overflow: hidden` 裁角；内部件 `border: 0`、`border-radius: 0`、`background: transparent`、`outline: none`；分隔线单色 1px 由内部件 `border-left` 提供；focus 环走 `:focus-within` 画在容器上（字段型用 `--lib-focus-bd` + `--lib-focus-ring`，按钮组型用 `outline: 2px solid accent; offset 2px`）；内部件按压 `transform: none` + 背景加深瞬时（律 4）。`.key-wrap`/`.secret-field` 只改律 2：`:focus-within` 把环画到输入框（= 单元视觉框），眼睛钮改 ghost 底色标示当前段 | **library**：分组行与排序段在 16 套主题下**全部**可见变化——静息态从「三段拼接」变成单边框胶囊（步进钮的独立边框与圆角消失，接缝统一到 `--lib-input-border` / `--lib-border` 单色 1px）；focus 态从「半截环」变成包住整颗控件的柔光环/描边环；步进钮 hover 从整颗 `.btn` 换底变成 6% ghost 混色，按压从 `scale(0.97)` 变成 10% 背景加深（缝隙不再被撑开）。步进钮前景 `--lib-btn-fg` → `--lib-fg`（同一底色下派生正确的那个，见 §8.3）。**详情面板实例另有一处布局修正**：它是 `flex: 1 1 200px` 解析到 320px 的弹性项，而内容只用 215px——容器加上 chrome 之后那 105px 空白会显形成「`-` 之后还有一截空胶囊」，故给内部输入框补 `flex: 1 1 auto` 吸收余量（批量条实例本就有 `flex: 1 1 120px`，无变化）。排序段的选中格填充保留（那是选中态本身，非 chrome），但其 `border-color` 覆盖删除。**options**：19 个密钥字段的眼睛钮 focus 从 2px accent 环变成 10% ghost 底色 + 字段整体亮环；`html[data-theme] .key-toggle:focus-visible { outline-color }` 随之删除（基类已 `outline-style: none`，它变成死代码）。**popup**：`.secret-field` 同上。**popup 的 `html[data-theme] .login-body .key-toggle { background: transparent }` 必须保留**——施工中一度当作基类重复项删掉，实测 dracula/terminal 下眼睛图标后面立刻出现一块不透明 `--pp-bg2` 方块：它压制的是两行之上的 `html[data-theme] .login-body button`（(0,3,1) 赢 (0,2,2)），不是重复声明；新加的 focus 规则改用 `.login-body .secret-field .key-toggle:focus-visible` (0,4,0) 取胜，而不是靠删它让路 | 2026-08-05 融合控件清查 |

| C33 | 融合控件第五轮：图标居中 + rest↔focus 状态稳定（`.vocab-group-unit`、`.vocab-sort-seg`、`.key-wrap` ×19、`.secret-field`、`.tags-input-wrap`）——**USER CHECKPOINT 2026-08-05，第五轮打回**：加减号视觉不居中；`.secret-field`/`.key-wrap` 聚焦时「底色变白、眼睛图标偏移、眼睛段看着独立不融合」。同时下达方法整改令：禁止再手造配方，移植成熟参考实现（见 §8.3 出处表，Primer CSS + Pico.css，均 MIT） | **图标**：`.vocab-group-step` 用 `display: inline-grid; place-items: center`，而 `shared.js:112` 的 `setBtnIcon` 恒发射空 label span → 实测 `grid-template-rows: 14px 0px`，图标偏上 **2.00px**（批量条那对是静态单子节点 HTML，`18px`，从来不偏——同 CSS 不同 DOM，所以只有 JS 构建的那对出问题）。**底色**：`popup.css` 的 `.login-body input:focus` / `.tags-input-wrap:focus-within` 及各自 themed 分身在聚焦时把底换成 `--pp-input-focus-bg`，实测默认表面 `rgb(238,241,245)`→`rgb(255,255,255)`、terminal `rgb(17,17,17)`→`rgb(13,26,13)`。**眼睛段**：`.key-toggle:focus-visible` 画 10% ghost 填充（实测 options `color(srgb 0.92 0.92 0.92)`、terminal `color(srgb 0.08 0.16 0.08)`），一块不透明色块浮在字段上 | 图标：删 `inline-grid`/`place-items`，继承 `.btn` 的 `inline-flex` 居中并加 `gap: 0`（`.btn` 自带的 4px gap 会为空 span 留位、把图标左推 2px）。同一处理同步给 `.vocab-sort-btn`（它今天不暴露该差异，但共享形状可防复发）。底色：四条聚焦规则一律去掉 `background`（`--pp-input-focus-bg` **token 保留**——它仍派生 `--pp-focus-bd`，也仍填充非融合的普通输入框）。眼睛段与步进段的焦点标示改为 `box-shadow: inset 0 -2px 0 var(--{ns}-accent)` 内嵌下划线；ghost 填充移到 hover（`.key-toggle:hover` 新增，此前只改文字色） | **library**：详情面板两颗步进钮图标下移 2px 归正（16 主题；批量条那对本就正确，无变化）；步进/排序段的焦点标示从 10% 灰底改为 2px accent 下划线；排序段原先「选中+聚焦」加深填充的那条规则删除（改由下划线叠在选中填充上区分，四种组合仍可辨）。**popup**：`.secret-field` 与 `.tags-input-wrap` 聚焦时**不再变底色**（14 态全部可见变化——这是用户点名的那条）；眼睛钮新增 hover ghost 底、焦点改下划线。**options**：`.key-wrap` ×19 同上；眼睛钮新增 hover ghost 底。**未改**：`.field > input:focus`、`.search-field:focus` 两处普通输入框仍保留聚焦变底色——它们不是融合控件，不在律 6 管辖内，动它们属范围外 | 2026-08-05 第五轮 |

| C34 | 融合控件第六轮：内部件焦点环归一 + 眼睛右缘细线消除（`.key-toggle` ×2 家、`.vocab-group-step`、`.vocab-sort-btn`）——**USER CHECKPOINT 2026-08-05，放大截图后两项**：① 对内嵌下划线的反应是「是什么？？？」——自造视觉词汇不成立；② 眼睛与胶囊右缘之间有一条微弱竖线，浅色与 terminal 都能看到 | 两项**同一个根因**：C33 引入的 `box-shadow: inset 0 -2px 0 var(--{ns}-accent)`。下划线本身是发明出来的词汇，用户读不出含义；而同一条 inset 阴影在分数定位的小盒上还会沿右边缘漏出**一列设备像素**——3x 采集图逐列扫描实测：terminal 聚焦态 x=1957 为 `rgb(25,77,25)`（暗 accent），**同一列在静息态是 `rgb(17,17,17)` 纯背景**，即该细线只在聚焦态出现，位置正好是眼睛钮右边缘、距胶囊边框 3 CSS px | 四处一律改用 §7.3 的 button 焦点环并以负 offset 收进自己的盒内：`outline: 2px solid var(--{ns}-accent); outline-offset: -2px`（两家 `.key-toggle` 另加 `border-radius: var(--{ns}-radius-sm)` 让环是圆角）。`outline` 不产生阴影几何，两个缺陷同时消失。§8 律 6 与 §8.3 配方同步改写，并把「不要自造第三种视觉词汇」写进条文 | 四处内部件聚焦态在 16 套主题下全部可见变化：下划线 → 收在盒内的 2px accent 圆角环；眼睛右缘的细线消失。**取证**：`screens/state-matrix/zoom-eye-200/` 的 200% 裁剪 + 逐列像素扫描——修后 `focus-input` 态该列恢复为纯背景 `rgb(17,17,17)`，`focus-adornment` 态该列是满强度 `rgb(51,255,51)`（即刻意的环，不是 1px 残影）。静息/hover 态本就无细线（修前即已实测确认），故不受影响 | 2026-08-05 第六轮 |
| C35 | **Soft Fill 全量铺开：静息去线框 + 填充分离派生**（三表面 × 14 主题块） | 控件静息态靠 `--{ns}-border`（Task 16 起为 3:1 派生值）画一整圈框；填充与宿主表面常常同色——实测 options 的 `btn-bg` 在 6/14 块里与自己的 `panel` 逐字节相同，library 在 **14/14** 全同，`input-bg` 5/14 全同；popup 根本没有按钮填充角色，`.qbtn`/`.submit-bar button`/`.md-strip-btn` 画的是 `--pp-bg` 或 `--pp-bg2`，后者正是它们所坐的那条 strip | §9 律 1+2：新增 `--{ns}-btn-border` / `--pp-btn-bd` / `--pp-btn-bg` / `--pp-btn-hover` / `--pp-input-bd` 角色，静息 `border-color` 塌陷进填充（`border-width` 保留 1px）；`fillSeparate()`（`_ui-derive.mjs`）把表面 `fg` 混进填充直到对**每个**宿主表面 ≥1.06:1；hover 填充同法重算（旧值对新静息只有 1.00–1.02:1） | 三表面全部主题：控件静息态从「描边 + 与表面同色的填充」变为「无描边 + 可辨填充」。popup 侧另有 14 条 `html[data-theme]` 覆盖规则被删除（它们只是把 `--pp-border` 重新装回控件上，token 塌陷后无话可说）。**下游连锁三处**（由 `contrast-audit` 逮到，非人工发现）：options 默认 `border` `#8a8a8a`→`#858585`、library `#90909f`→`#858596`、popup 默认 `danger-quiet-fg` `#c24343`→`#bd3d3d`——填充变深后旧值分别掉到 2.97 / 2.76 / 4.41，均按原派生公式重算而非 allowlist | 2026-08-05 Soft Fill |
| C36 | **卡片与分节降到发丝级**（options `.panel` / `h1` / backup / wayback / tag-gov / drive 六个盒，library `.notes-card` / `#vocab-lookup-bar`，popup `.quick-actions hr.divider`） | 一律 1px `--{ns}-border`（3:1 结构边）画完整包围框；popup 搜索条上方那条 `hr` 画 `--pp-divider` | §9 律 4：卡片/分节改发丝级 `--{ns}-border-section`，不做包围框；`hr.divider` 的 `border-top-color` 塌陷为 `transparent`（**声明保留**，盒高逐字节不变，间距与字段填充承担分隔） | 14 套主题下这些容器的边明显变轻；popup 搜索条上方的横线消失。**浮层不动**（`.confirm-popover` / `.theme-name-popover` / `.autocomplete-dropdown` / `select::picker`）——它们盖在无关内容上，那圈边在干实事 | 2026-08-05 Soft Fill |
| C37 | **列表选中高亮内嵌**（library `#vocab-list` 与 `#notes-list` 两个列表） | vocab 侧 `border-radius: 0` + `margin-inline: 0`（满幅方角，选中行的角切掉列表容器自己的角）；notes 侧已有 `radius-sm` 但 `margin-inline: 0` | §9 律 3：两侧统一 `border-radius: var(--lib-radius-sm)` + `margin-inline: 4px`。accent 条**零成本**——`.vocab-card[aria-current]` 的 `inset 2px 0 0` 是 inset 阴影，跟随 `border-radius` 自动收进带内并跟着圆 | 16 套主题下两个列表的 hover/选中带从满幅色条变成浮在栏内的圆角卡片。选择器**只用类不用 id**（`#vocab-list` 前缀会盖过 `.selected`，反转 `--row-bg` 的既定优先级）。门：render oracle 新增 `insetBand`（2 选择器 × 15 主题 = 30 条，RED 验证实测 30 FAIL） | 2026-08-05 Soft Fill |
| C38 | **terminal 逐角色恢复边框**（`pilots/terminal.tokens.json` 的 `ui.popup/options/library.dark`） | terminal 与其他 12 套一起被 Soft Fill 拉平（填充被派生、边框被塌陷），身份丢失 | §9.5：pilot 通道逐角色声明 `btn-bd`/`input-bd`（popup）、`btn-border`/`input-border`（options/library，后者是 terminal 第一次拥有 `ui.library` 通道）。composer 把「声明了该角色的边框」本身当作豁免信号，同一次声明也让该角色的填充保持 pilot 原值。值写 `var(--{ns}-border)` 而非复制字面量（派生一移动，字面量就陈旧——本轮 C35 的三处连锁正是这么坏的） | 与铺开前逐块 diff：三个表面的 terminal 块**只增不改**——原有 token 逐字节相同，新增的每一个都解析成被删掉的手写规则原本画的那个值（`--pp-btn-bg: #111111` = 原 `--pp-bg2`，`--pp-btn-hover: #1a3a1a` = 原 `--pp-drop-hover`，三个 `*-border` 就是原规则点名的同一个 token）。**唯一登记的微差**：`html[data-theme] .md-strip-btn` 的底从 `--pp-bg`(#0a0a0a) 改读 `--pp-btn-bg`(#111111)，与同表面其他按钮统一。几何（圆角/内距）**不豁免**，走 token 阶梯自然生效 | 2026-08-05 Soft Fill |
| C39 | **列表选中带内嵌复检**（library 两个列表）——**USER CHECKPOINT 2026-08-05，网格终审打回**：paper-ink hover 行「左右只空了 ~2px 且圆角不可读，像没对齐」 | C37 落地的是 `margin-inline: 4px` + `border-radius: var(--lib-radius-sm)`。逐像素实测（1x 网格图，paper-ink）：卡片边框 x=24，卡片底色 x=25–28（**4px，规格是达标的**），带起于 x=29——但 **block 方向内距是 0**，带上下贴死卡片边框；且 `--lib-radius-sm` 在 paper-ink/dracula/solarized 是 **2px**。两侧内嵌 + 两侧贴边 = 读作「没对齐」，不是读作「浮起的卡片」；2px 弧在行高的带上 1x 下不成形 | 两个列表统一 `margin: 2px 4px`（**四边**内嵌）+ `border-radius: var(--lib-radius-md)`；同时 `.notes-card` 的边框塌陷为 `transparent`（§9 律 4：行靠间距与填充分层，不靠线）——一个圆角带套在一个圆角描边卡里，是相距 4px 的两条弧，外面那条赢眼睛，这是「内距看着只有 2px」的另一半根因。`border-width` 保留 1px，`.is-error` 仍能零 reflow 画它的红边 | 16 套主题下两个列表的 hover/选中带四边浮起、圆角可辨；vocab 行的外框消失（原 `--lib-border-section` 描边）。**oracle 收紧**见下 | 2026-08-05 网格终审 |
| C40 | **library 顶部 Vocabulary / Notes 改真 tab**（`.lib-tab`）——**USER CHECKPOINT 2026-08-05，网格终审打回**：「现状是带壳按钮，不像 tab」 | `border: 1px solid transparent` + `border-radius: var(--lib-radius-md)` + `padding: 6px 14px`；`:hover` 换 `--lib-btn-hover` 填充；`.active` 换 `--lib-tab-active` 填充 + `--lib-border` 描边。即一颗药丸按钮，选中态靠换底色 | 无壳无填充无圆角：`border-bottom: 2px solid transparent` 常驻（选中只换颜色 → 零位移），`.active` 的下边色改 `--lib-accent`；inactive `--lib-fg-muted`、active/hover `--lib-fg`；`:focus-visible` 用 §7.3 的按钮环（`outline: 2px solid accent; offset 2px`，与本表面其他控件同一套）。**刻意不加 `font-weight`**：13px 标签 400→600 宽约 +4px，每次切换都会把邻座 tab 推开，与下划线自己遵守的零位移律相抵触 | 16 套主题下页头两颗 tab 从药丸按钮变成纯文字 + accent 下划线。下划线**贴在标签自己底下**，没有焊到 `.lib-header` 的底线上（那条线在 tab 行下方 12px = 页头自己的 block padding，够到它要重构页头布局，而 `<h1>` 兄弟需要那个 padding）。**a11y 无需补**：`library.html` 早已有 `role="tablist"`/`role="tab"`/`aria-selected`，`library.js` 的 `_pbpLibApplyView` 同步 `aria-selected` + `.active` + roving `tabIndex`。`--lib-tab` / `--lib-tab-active` 两个 token 就此零消费者，从 `library-chrome.mjs` 的 map 与手写 `:root` 一并销号（同 C30 对 `--pp-preset-bd` 的处置） | 2026-08-05 网格终审 |
| C41 | **焦点语言三表面统一为柔光环**（`popup.css` / `options.css` / `library.css` 手写区 33 处 + 生成区 `.btn` / chip / checkbox 四条配方）——**USER CHECKPOINT 2026-08-06**：以 `#vocab-status-filter` 的表现（边框变色 + 辉光）为基准语言，三表面一起换 | 三套并存的具名配方（`button` 2px 硬环 / `field` 边框+辉光 / `softRow` 1px 芯+辉光），按「控件类型」三选一。同一屏里按钮套硬矩形与字段套柔光环并排出现 | §7.3 重写为**一套语言三种落位**：`bordered`（边框即芯）/ `borderless`（1px accent 芯 + 辉光）/ `inset`（2px focus-bd 芯收进盒内 + `box-shadow: none`）。落位判定两问：先问是不是行/格子（→ inset），再问静息边框是中性 chrome（→ bordered）还是语义边（danger/warn/currentColor，→ borderless） | 三表面全部可聚焦控件的焦点态改观：硬 2px accent 矩形消失，代之以主题自己的 `--{ns}-focus-ring`。**逐主题差异被刻意保留**——terminal 仍是 6px 磷光晕、paper-ink 仍是 `0 0 0 1px` 平环、solarized 仍是 2px 半透明环；配方一律 `var()` 消费两个 token，零展开。渲染门同步：`focusRecipe` 三个名字换成三个落位名，并且**不断言阴影字面量**（只断言「非 inset 且与未聚焦基线不同」——各主题皆真） | 2026-08-06 focus-unify |
| C42 | **分段控件的双层框与点击亮框**（`.vocab-sort-seg`、`.vocab-group-unit` 的两颗步进钮）——**USER CHECKPOINT 2026-08-06**：排序段「点一下就亮个框」「Tab 过去是两层框」 | 两个单元都用 `:focus-within` 在**外壳**画环。`:focus-within` 没有键盘门控（`:focus-visible` 才只认键盘），所以鼠标点击也亮；而格子自己另有 inset 环，于是 Tab 时外壳环 + 格子环同时出现 | §8 律 2 拆成两半并加表：**纯按钮分段外壳不画环**（`.vocab-sort-seg:focus-within` 整条删除），**载字段单元的外壳环收敛到文本录入**（`:focus-within` → `:has(> input[type="text"]:focus)`）。格子一律 `inset` | 排序段点击不再亮框，Tab 只剩格子内的一圈环；步进钮同理。**oracle 同步演进**：4 条 `fusedFocusRing` 期望改为新增的 `fusedSegmentRing`（断言外壳三属性全不变 **且** 格子画了朝内的环——两半都查，只查一半会分别放过「看不出是哪一格」和「两层框」）。group-unit 的 input 那条**仍留在 `fusedFocusRing`**，正是这一条证明收敛真的在区分而不是整个关掉 | 2026-08-06 focus-unify |
| C43 | **卡片行焦点环缺口 + 与删除钮叠压**（`.notes-card-head` → `.notes-card-top`） | 环画在 `.notes-card-head` 上，而 head 只占 `.notes-card-top` 三列网格的**第一列**——环因此在行中间断掉，右端还压在 `.row-del-x` 底下 | 环移到整行：`.notes-card-top:has(> .notes-card-head:focus-visible)`，走 `inset` 落位；head 自身 `outline: none`（§8 律 2 的「交出指示」，否则 Chromium 会在行环里再画一圈 UA 默认环） | 行焦点环完整包住整行、不再与删除钮相撞。**刻意用 outline 而不是 box-shadow**：`.vocab-card[aria-current] .notes-card-top` 同为 (0,3,0) 且已占用 `box-shadow` 画「你在这一行」的 accent 边，同特异性下后写者会**替换**它——焦点期间静默抹掉选中提示。门：`focusRecipe: "inset"` 探行、聚焦 head，runner 追加断言 head 自己什么都不画 | 2026-08-06 focus-unify |
| C44 | **ghost / danger 档的焦点边被静息值反超**（生成区 `.btn.ghost`、`.btn.danger`、`.btn.danger.ghost`） | `.btn:focus-visible` 换成 `bordered` 落位后要改 `border-color`，但 `.btn.ghost { border-color: transparent }`(0,2,0) 与 `.btn.danger`(0,2,0) 在生成区里**排在它后面**，同特异性由源序取胜 → 焦点边被静息值吃掉，只剩辉光 | 三条显式规则补齐特异性：`.btn.ghost:focus-visible`(0,3,0)、`.btn.danger:focus-visible`(0,3,0)、`.btn.danger.ghost:focus-visible`(0,4,0)，一律 `border-color: var(--{ns}-focus-bd)`。**不靠调整源序**（§8.6「别赌源序」） | 详情面板的两颗 ghost-danger 删除钮、以及全部 ghost 按钮，聚焦时真正画出焦点边而不只是发光。危险档语义不丢——它仍由 `--{ns}-danger-quiet-fg` 的文字色与 danger hover 填充承担 | 2026-08-06 focus-unify |
| C45 | **popup 五个 bordered 站点的焦点边在 13 套预设下静默消失**（`.submit-bar button` / `.qbtn` / `.md-strip-btn` / `.offline-queue-actions button` / `.login-body button`） | popup 有一整层手写主题覆盖，其中 `html[data-theme] .submit-bar button`(0,2,2) 等**静息**规则设 `border-color`，特异性高于基类焦点规则 `.submit-bar button:focus-visible`(0,2,1)。默认表面焦点边正常，13 套预设 + `html.dark` 下焦点边被静息值压掉 | 逐站点量级联后补 themed 焦点孪生规则：4 条既有 `html[data-theme] …:focus-visible` 改载 `border-color` + `box-shadow`，另新增 3 条 `html.dark …:focus-visible` 与 1 条 `html[data-theme] .offline-queue-actions button:focus-visible`。孪生规则同时携带 `box-shadow`，因为 `html[data-theme] .qbtn:hover` 等同特异性且源序更早，hover+focus 并存时焦点必须仍然赢 | 这五个控件在 16 个主题态下焦点边一致出现（此前只有默认浅色态正确）。**这是 CLAUDE.md「同特异性双向查」那条铁律的又一次兑现**——`grep` 看不出问题，只有逐条算特异性才发现。**门禁补记（2026-08-06 独立复审 F2）**：本条最初写的是「`.vocab-detail-relookup` 的 `bordered` 条目把这类回归钉死在 16 套主题上」，**不成立**——那条探针在 library，而本条修的五个站点全在 popup，当时 checklist 的 6 条 `focusRecipe` 里 popup 占 0 条，即这五处的级联修复没有任何渲染门看管，只有作者自己的特异性算术。现已补 `.qbtn` 与 `.md-strip-btn` 两条 popup `bordered` 条目（runner 同步补 `#main-section` / `#md-actions-strip` 去 `.hidden` 的 fixture 步骤，二者本被 popup.js 的书签态解析挡住而不可渲染）。**RED 实测**：临时删掉 `html[data-theme] .qbtn:focus-visible` 一条孪生规则 → 14 套预设各报一条 FAIL，报错文本直接点名「border-color 未变，疑似 themed rest 规则反超」；默认浅色与 `html.dark` 两态不受影响（它们不走 `html[data-theme]`），与特异性分析完全一致 | 2026-08-06 focus-unify |
| C46 | **生词列表的多选从 checkbox 改为行本体**（`library.html` 的 `#vocab-list`、`library.css` 的 `.vocab-card.selected`）——**USER RULING 2026-08-06**：「取消用 checkbox 标示单词被选中，直接用选中项的底色予以区别；注意区别鼠标点击选中（激活详情）和多项选中进行操作的状态」 | 每行一个 16px `input[type=checkbox]` 占一列；`.selected` 只换底（`color-mix(accent 10%, bg)`），`aria-current` 换底（`--lib-row-selected-bg`）+ 左侧 2px accent 条 | checkbox 删除，行左侧一列回收；手势改 Ctrl/Cmd+点击（切换）、Shift+点击（区间，与锚点动作一致因此支持区间取消）、键盘 `Ctrl+Space` / `Shift+Space`；`#vocab-list` 从 `role=list` 改 `role=grid` + `aria-multiselectable`，行 `role=row` + `aria-selected`，`.notes-card-top` 补 `role=gridcell`。视觉上 `.selected` 升为 **18%（hover 24%）填充 + 1px inset accent 环**，并新增 `.vocab-card.selected[aria-current]` (0,4,0) 显式合成两个标识物 | 选中态与「你在这一行」不再靠同一种形状的两个强度区分。**升到 18% + 环不是审美决定，是量出来的**：新增的渲染门 `bandDistinct` 在原 10% 无环方案下实测 rest↔selected 仅差 19（rose-pine）/18（solarized-dark），selected+current↔current 仅差 4（rose-pine），即「排队等批量操作」与「详情面板正在读」在多套主题下是同一个颜色。**门**：`bandDistinct`（新 `rowStates` 驱动——同一行用真实手势跑完 rest / selected / selected+current / current 四态，两两比较填充与标识物，任一对既无 ≥24 的填充差又无标识物差即 FAIL），并在同一条里连测四态下行文字对自身色带的 AA（拉高填充最容易吃掉的就是自己的标签）。**顺带修掉一个渲染 oracle 的结构性盲点**：`parseRgba` 只认 `rgb()`，而 `getComputedStyle` 把解析后的 `color-mix(in srgb, ...)` 序列化成 `color(srgb ...)`——于是 `compositeStack` 一直在**静默跳过**所有 color-mix 出来的背景层，改读它下面那层。整个 Soft Fill 行带家族的实测背景此前都是错的，是 `bandDistinct` 把两个明显不同的状态报成逐字节相同才暴露出来 | 2026-08-06 selection-rebuild |
| C47 | **笔记页补批量选中与 sticky 批量条**（`library.html` 的 `#notes-list` / 新 `.notes-list-region` / 新 `.notes-batch-bar`，`library-notes.js`）——**USER RULING 2026-08-06**：「为笔记页面也增加类似生词页面的批量选中、batch-bar 功能」 | 笔记列表只有「打开阅读」一个动作，唯一的删除在详情面板且作用域是整页记录；`role=list` / `role=listitem`；无选中概念 | 与生词页**同一套**手势与视觉：Ctrl/Cmd+点击切换、Shift+点击区间（含区间取消）、`Ctrl+Space` / `Shift+Space` 键盘孪生；`role=grid` + `aria-multiselectable`，行 `role=row` + `aria-selected`，按钮外包一层 `role=gridcell`（**必须是真盒子而非 `display:contents`**——行按钮靠 `border-radius: inherit` 取圆角）。sticky 条**复用**既有配方族：`.vocab-batch-bar` 一系规则改为选择器并列，不复制一份。操作集裁到笔记适用：已选计数 / 全选 / 反选 / 批量删除（§4 quiet 档 + confirm-popover）/ 清除 | **批量删除的作用域是「选中的 N 条高亮」，不是整页**：按页分组重写 `items[]`，某页被删空才 `storage.local.remove` 整条记录（与阅读器 `_pbpHlSave` 同形）。确认弹层开启时快照选中集，`onConfirm` 内重新比对，不一致即中止并把 `is-error` 打在按下的那颗按钮上——后台刷新（另一个标签页在写高亮）可能在弹层挂着时挪动列表。**顺带把笔记行的 aria-current 标识物从 1px 环换成 2px 左边条**：新的 selected 态在两个视图里都用环，而笔记侧 selected 与 current 的填充实测只差 7（gruvbox-dark）/ 9（terminal），共用一种形状等于看不出区别；原注释说左缘「已经属于高亮色条」是量错了——色条在按钮 8px 内距之后起画，2px 内嵌边落在那段内距里，两者相距 6px 不相碰 | 2026-08-06 selection-rebuild |
| C48 | **详情面板里的来源链接横向溢出**（`.notes-row-open`）——**USER REPORT 2026-08-06**：浏览器调窄时引句下的来源链接文本越过 `.vocab-detail-pane` 右缘 | `max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` 写在一个**裸 `<a>`（display: inline）**上。CSS 2.1：非替换行内盒上 `max-width` / `overflow` / `text-overflow` 全部不生效，而继承来的 `white-space: nowrap` 生效——于是规则读起来像「裁到某个宽度」，浏览器画的是一条不可断行的全宽文本。实测 900px 视口下越出面板内容边缘 350.99px，并给整个详情面板挂上 327px 横向滚动 | `display: block` + `max-width: 100%`（160px 上限一并去掉：那是给这个类**早已不再服务**的宽笔记行定的，塞进 68ch 阅读列里会把文章标题截到可用宽度的五分之一） | **门是类扫描不是选择器清单**：render oracle 新增 `paneFit`——在 900/960/1024/1100/1200 五档宽度下遍历两个视图各自两个 pane 内的**全部**元素，断言没有任何元素的边缘越出 pane 内容盒、且 pane 自身不产生横向滚动（`sr-only` 显式豁免，因为它本来就停在画布外）。**刻意不断言 `scrollWidth > clientWidth`**：那是每一个正确省略号元素的常态，首轮实测它把 1 条真问题埋在 5 条误报下面。RED 实测：把 `display: block` 去掉重跑，门直接报 `pastRightEdge +350.99px a.notes-row-open at 900px`。**夹具同步补洞**：审计种子原本只写 term/gloss，没有 context，因此这两条断言在补种子之前是**恒真**的——`pbpVocabSaveWord` 合并的是单数 `context`，传 `contexts` 数组会被静默丢弃 | 2026-08-06 selection-rebuild |

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
  （`.row-del-x`:350 与原 `.vocab-selection-actions .btn`:976，均为 `border-color: transparent` +
  `background: transparent` + 弱化前景；后者已于 2026-09-06 归并——「Select all」按钮改用 `.btn.ghost`，
  只剩 `.lib-cluster > .btn.ghost` 一行静息前景）。归并进配方是**删两份副本**，不是加一个新族；不归并也不违反
  本规范（只要两份副本的值与 §1.2 一致）。**options.css 没有等价副本**——`library.css:350` 的注释
  「options.css's shared recipe」是移植来源的说法，`grep row-del-x options.css` 零命中，options 侧要用
  ghost 档（详情面板类阅读面）时是**首次出现**，按 §1.2 配方来，不要去 options 里找样板。
