# Pinboard Bookmark Enhanced 项目配置

作者：pine2D
更新：2026-08-10

> 本文件只保留每个会话都需要的跨领域约定。子系统深水区规则在 `.claude/rules/`（按 paths 匹配自动加载，见文末索引表）；机器可验证的铁律已由 pre-commit / verify.sh / release 硬门强制——prose 是提醒，lint 是底线。

## 项目概述

Chrome Extension (Manifest V3)，一键将当前页面保存到 Pinboard，支持多 LLM 提供商的 AI 标签/摘要/全文翻译/Ask-the-page 问答与 opt-in 要点提炼（skim）。md-preview 阅读器带划词高亮/笔记/搜索/专注模式、YouTube / B 站视频页的播放器+多语种字幕面板、在线词典与可选离线词典（CC-CEDICT 汉英 + 用户自备 ECDICT 英汉）；高亮/笔记与生词集中在独立的「笔记与生词本」页（library.html，主从双栏）；生词按当前 Pinboard 账号隔离，可管理/导出/发送到 Anki 或欧路词典，并支持 Google Drive 同步。导出可 Send-to Obsidian/Notion/NotebookLM/Gist/Webhook，另有 Wayback 自动归档、标签治理和 13 套 pinboard.in 站点主题。功能全貌见 README.md。

## 技术栈

| 层级 | 技术 |
|------|------|
| 平台 | Chrome Extension Manifest V3 |
| 语言 | Vanilla JavaScript（无框架、无构建步骤、零运行时依赖——保持这一点） |
| 存储 | Chrome Storage API（sync + local）+ IndexedDB |
| AI providers | OpenAI / Anthropic / Gemini / DeepSeek / Qwen / MiniMax / OpenRouter / Groq / Mistral / Cohere / SiliconFlow / Zhipu (BigModel) / Moonshot / GitHub Models / Ollama (local) |
| 页面正文抽取 | Defuddle（vendor/ 本地化，懒注入）；备用 Jina Reader API |
| 主题生产 | 自建 theme factory（`docs/theme-surface/`） |

## 目录结构

```
manifest.json                # MV3 配置（permissions / host_permissions / 入口）
background.js                # Service Worker：图标状态、书签检测、URL 缓存、storage 预热、DNR 防盗链规则
popup.{html,css,js}          # 主弹窗 + popup-{ai,batch,offline,tags,theme-early}.js（AI 标签/摘要、批量、离线兜底、标签补全、防 FOUC）
options.{html,css,js}        # 设置页 + options-{connectivity,backup,vocab,theme-early}.js（联通测试、JSON 备份、生词设置侧）
library.{html,css,js}        # 笔记与生词本独立页 + library-{vocab,notes}.js（主从双栏，owner 隔离）
md-preview.{html,css,js}     # 阅读器弹窗 + md-preview-theme-early.js（明暗 bootstrap 防白闪）
bili-player-bridge.js        # B 站播放器桥（动态内容脚本：授权 player.bilibili.com 后由 md-video.js 注册，仅回传进度/状态）
md-*.js                      # 阅读器子模块：ai-core / translate / ask / highlight / reader / skim（默认关，花 token）
                             #   / dict / vocab-echo（默认开，不花 token）/ convert（marked→DOMPurify 单点 sanitize）
                             #   / embed / epub / export-send / mermaid / video
vocab-store.js               # pbp-vocab IndexedDB 唯一写边界（words + vector/outbox/tombstone/sync 状态）
vocab-gdrive.js              # SW-only Google Drive appDataFolder 同步
dict-pack.js                 # 离线词典包导入（CC-CEDICT + 用户自备 ECDICT）
anki-connect.js / eudic-sync.js  # 生词外发（本机 AnkiConnect / 欧路 OpenAPI；纯层，测试页可载）
ai.js / ai-cache.js          # AI 调用核心（popup/options/md-preview 共载）/ 结果 IDB 缓存
export-targets.js            # Send-to 目标注册表（Obsidian / Notion / NotebookLM / Gist / Webhook；纯层）
shared.js                    # 跨文件常量 + $id 记忆化 DOM 缓存
jina.js / i18n.js / tag-gov.js / wayback.js / site-rules.js  # 兜底抽取 / 多语言 / 标签治理 / 归档队列 / 站点适配器
pinboard-style.js / pinboard-sort.js / pinboard-themes.js    # pinboard.in 注入：主题 CSS（生成产物，勿手改）+ 标签热度排序
icons/  _locales/（9 locale）  vendor/（Defuddle，由 update-vendor.sh 同步）
README*.md ×9 / privacy-policy.md / LICENSE
tests/                       # file:// 直开的 HTML 测试页 40+ 套（不入 release ZIP）
                             # + render-audit-checklist.mjs（手写渲染 oracle，禁止从配方源生成）
                             # + render-audit-known-failures.json（迁移期基线，当前为空）+ ui-contract-tests.mjs
scripts/                     # 发布链：bump-version.sh / release.sh / zip-install-smoke.mjs
                             # 质量门：verify.sh / pre-commit-hook.sh / commit-msg-hook.sh / docs-lint.mjs / ui-render-audit.mjs
                             # 工具：setup-hooks.sh / update-vendor.sh / sync-runtime.sh / qa-drive.mjs / perf 与截图辅助若干
docs/                        # GitHub Pages：index.md / privacy.md / _layouts / assets / screenshots / cws-assets
docs/theme-surface/          # 主题工厂：composers/ pilots/ tools/ qa-harness/ snapshots/ + COMPONENTS.md / NEW_THEME.md / README.md
docs/site-rules/             # 站点适配器编写文档 + 调试脚本
docs/superpowers/ DESIGN-IS-2026-07-22/ release/  # gitignored 本地产物（.qa-scan/ 仅 package*.json 与 run-test.mjs 入库）
```

## 开发约定

| 约定 | 说明 |
|------|------|
| 加载方式 | `chrome://extensions/` → 加载已解压的扩展，选择项目根目录 |
| 无构建流程 | 直接编辑源文件、刷新扩展即生效（vendor/ 例外，走 update-vendor.sh） |
| DOM 查询 | 用 shared.js 的 `$id(id)`（记忆化）；**例外**：md-preview.html 虽加载 shared.js（供 SETTINGS_DEFAULTS/deobfuscate* 使用），但 `md-preview.*` 与 `md-*.js` 一律用原生 `document.getElementById` |
| 提示词模板变量 | `{{title}}`、`{{url}}`、`{{content}}`、`{{lang_instruction}}` |
| 书签缓存 | URL 书签状态 TTL 5 分钟 |
| Storage prime | 冷启动慢，靠 chrome.alarms 周期性预热 SETTINGS_DEFAULTS |
| 图标状态 | default（未收藏）/ saved（已收藏）两套 |
| Commit message | conventional commits（feat / fix / refactor / perf / docs / style / chore），英文 |

## 存储与同步边界（唯一权威表述）

| 机制 | 数据 | 边界 |
|------|------|------|
| Chrome Sync | 普通设置；另行启用时含凭据 | `optSyncEnabled` 是**每设备** local 开关，普通设置据此路由 sync/local；不含生词、高亮、缓存、任务状态 |
| Google Drive | 当前 Pinboard owner 的生词 | 每设备单独连接；只用 `drive.appdata`；不接管设置、凭据、高亮 |
| 手工 JSON schema v3 | 设置、主题 + 用户分项选择的高亮/生词/凭据 | 明文文件；导入先预览分项选择；凭据两端默认关、fail-closed（详见 rules/backup.md） |

- 凭据（API key / token / password / 导出目标）不能硬编码。默认存 `chrome.storage.local`；仅当本机 `optSyncEnabled=true` 且账号级 `syncApiKeys=true` 时用 sync；旧云端已有非空 secret 时迁移保留 `syncApiKeys=true`，避免升级丢凭据。
- sync 配额：单 item ≤8KB、总约 100KB、写入限流；写后检查 `lastError`。缓存、大对象、瞬态状态一律 local。
- 生词及 Drive 协议状态在 IndexedDB（vocab-store.js 是唯一写入口）；逐设备连接标记在 local。
- **离线队列**只存 local：新记录**仅**保存保存模式、URL、标题、备注、标签、私密/稍后读/归档标志、书签时间、队列 ID/入队时间与非秘密 Pinboard 用户名绑定——此外一律不存，禁止保存 token；legacy token 记录读取时改写为账号绑定并删除 token。重放必须用当前登录 token 且用户名与队列绑定精确一致，否则保留队列并 fail-closed。

## 跨领域安全铁律

- **Pinboard 账号隔离**：所有 Pinboard v1 请求（`auth_token` 认证）在实际 dispatch 前原子重读有效凭据；同用户名 token 轮换时用新 token 重写请求，登出或跨用户名切换时取消且不得发网。账号数据派生的 cache / message / preview payload / 持久任务必须携带非秘密 owner，并在读取、异步回写、UI 提交时逐次校验 owner。
- **网络端点与 host 权限**：required host 仅 Pinboard；AI / Jina / Wayback / Gist / Webhook / Notion / Free Dictionary / 欧路、AnkiConnect 精确回环 origin（`127.0.0.1:8765`）、YouTube/B 站字幕（www.youtube.com / api.bilibili.com；**首次**由视频页预览内的「启用字幕并加载视频」点击申请精确 origin；授权后打开视频页预览即自动抓取——字幕即正文的产品语义，自动路径仅 `permissions.contains` 判定绝不 request。YouTube 优先注入用户已开的 www.youtube.com 标签页 same-origin 取数——页内自带登录与 PO Token 语境，扩展页跨站 fetch 被 LOGIN_REQUIRED 常态拦截；无标签页时回退扩展页 fetch，仅该回退受 `mdVideoUseLogin` 控制，默认开；B 站三个字幕 API 以登录态 credentials:include 调用；**B 站播放进度**走 `player.bilibili.com` 精确 origin——与 api.bilibili.com 同一次点击申请，授权后 md-video.js 用 `scripting.registerContentScripts` 注册 `bili-player-bridge.js` 到该 origin 的所有 frame，脚本在预览页以扩展 origin 握手前完全静默，只回传 currentTime/状态/时长并执行 seek/play/pause/rate；caption 的 `contains` 门只看 api origin，早期只授过 api 的用户由工具条「启用播放跟随」按钮补授）与 Batch 所选站点，以及**内嵌框架抽取**（顶层文档无正文而存在单个占视口 ≥40% 的跨源 https iframe 时，阅读器错误态给「授权并重试」按钮，点击才请求该帧精确 origin，随后以 `allFrames` 重抽取；`sandbox` 无 `allow-same-origin` 的帧不作候选）——**首次授权**一律只能来自直接用户动作请求当前精确 origin。**YouTube 播放器经本项目自有 Pages 中继页内嵌**（扩展页不发 Referer，YouTube 播放器因此拒载；中继页是 iframe，与封面图 `i.ytimg.com` 同属子资源，均不需 host 权限）。后台/自动路径只做 `permissions.contains`，禁止运行时申请 wildcard。可配置端点必须 HTTPS，HTTP 仅允许字面 `localhost` / `127.0.0.1` / `[::1]`；LAN/public HTTP、凭据 URL 与无权限请求一律阻断并保留配置。升级时一次性清理 legacy all-sites grant。
- AI 请求统一走各 provider 的 chat completion 接口（关思考方言勿凭记忆改，见 rules/ai-providers.md）。
- Defuddle 在 popup 打开时**懒注入**；site-rules.js 与其成对注入且**先于** Defuddle 运行（命中站点规则即短路）。

## MV3 铁律（改 background.js / manifest / 存储代码前必读）

- **SW 无持久状态**：30s idle 即终止、全局变量清空。状态一律落 chrome.storage，每个 handler 开头重读；全局只作单次调用内的暖缓存。
- **optional permission 的 API 在调用点现取**：权限未授予时 `chrome.identity` 等整个命名空间不存在，SW 顶层或默认参数捕获会把 `undefined` 钉死一整个 worker 世代（新用户首次连接的必经顺序，2026-07 真实事故；范式见 vocab-gdrive.js 的 `identityApi()`，测试注入的 fixture 仍优先）。调试注意：给 SW 开着 DevTools 会阻止它被回收，「重启一下就好了」的推理此时不成立。
- **吞异常必须留痕**：把平台 API 异常折叠成产品错误码前，先 `console.warn` 出 `error.name` / `error.message`（不含 token、邮箱、生词内容）。
- **监听器与 importScripts 只能在 SW 顶层同步执行**；async 注册在 MV3 不保证生效。
- **onMessage 异步响应**：`return true` 保持通道，且该 listener 不能是 async 函数（二者只能取一）。
- **CSP**：禁 eval / 远程代码；只能远程取数据（JSON/CSS）。Defuddle 因此本地 vendor。
- **content script**：仅 pinboard.in 注入、保持瘦身；`document_start` 仅主题注入需要（pinboard-sort.js 是第二段注册，`document_idle`）。
- **setIcon**：仅状态真正变化时调用 + 缓存 ImageData，别每个 tab 事件重新 fetch PNG（回归修复见 `9b689c1`）。

## UI 性能铁律：字体回退（改任何 UI 文本/CSS 前必读）

<!-- 机制依据：Blink fonts README、crbug 1266022/491556、developer.chrome.com（SW lifecycle / storage / CSP / alarms）、web.dev（content-visibility / style 计算） -->
popup/options 是短命单次渲染、无暖 shape cache——任何「UI 文本回退到大/慢字体」都会在高 DPI Windows 上造成 1-3s 首屏冻结。四种已踩形态：

| 形态 | 铁律 |
|------|------|
| emoji / dingbat 字符 | UI 一律内联 SVG（`PBP_ICONS` / `setBtnIcon` / `setStatusIcon` / CSS 三角），**禁止字面 emoji/符号**——⚠ ✓ ✗ ✕ ↻ ▸ ▾ ℹ 这类单色 dingbat 同禁（回退 Segoe UI Emoji，首次加载 ~1.6s）。`U+FE0E` 与 `font-variant-emoji:text` 实测无效 |
| CJK 正文 | body font-family 必须在 `sans-serif` 前显式列快 CJK 字体：`"PingFang SC","Microsoft YaHei","Hiragino Sans","Noto Sans CJK SC"`（CJK 名要列真实存在的全集：`"Noto Sans SC"` 与 `"Noto Sans CJK SC"` 是**不同 family**，另补 `"微软雅黑"` `"Source Han Sans SC"` `"WenQuanYi Micro Hei"` 覆盖 Win/Mac/Linux） |
| 等宽（Latin） | 以命名字体打头（`"SF Mono",Consolas,Menlo,…`）；**禁止 `ui-monospace` 或裸 `monospace` 打头**（都会落到 profile 的 Fixed-width 字体） |
| 等宽里的 CJK（最隐蔽） | monospace 栈在 `monospace` 之前必须再列快 CJK 字体，否则中文 placeholder 穿过 Latin 栈踩中 Fixed-width CJK |

- 表单控件（button/input/select）默认**不继承** font-family → 必须 `button, input, select { font-family: inherit; }`（`.fg textarea` 凭更高 specificity 保 monospace）。
- 图标契约：只从 Lucide v0.525.0（ISC）取 path（24-box、stroke 2，唯一例外 obsidian 品牌钻石；版本基准钉在 shared.js 顶部注释，勿从其他版本拷 path），新图标不手绘、SVG 内禁 `<text>` 节点；`eye/eyeOff` 独占密钥显隐、`refresh` 限定重跑同一动作、`cross` 是删除/移除/关闭家族、`extOpen` 限定真外链、`robot` 限定花 token 的 AI 动作；icon-only 按钮必须 `title` + `aria-label` + ≥24px 命中区。
- 测量陷阱：暖态（chrome-dbg / 已打开页面）测不到冷首屏，只能在用户真实机器冷启动验证；卡顿计入 Rendering / Recalc+Layout 而 Paint 很小，第二次操作就快 = 一次性冷成本；idle 预热会阻塞主线程，不可取——根治慢字体回退本身。判断字体存在用 `document.fonts.check('16px "字体名"', '中')` 或 DevTools Rendered Fonts / `CSS.getPlatformFontsForNode`，别用测 ASCII 宽度的探针（对 CJK 字体误报）。
- 热路径避免 `:has()` 等慢选择器；超长面板可考虑 `content-visibility:auto`。

## 测试与夹具

- tests/ 全部 file:// 直开、不依赖构建；改逻辑同时跑对应测试页。
- **远端 API 响应夹具按真实抓包/官方 schema 手写，禁止用写入侧构造器生成**——「我和我自己一致」的自测全绿仍会真机 corrupt（2026-07 Drive 事故）。补纯函数谓词的单测不构成修复，runner 路径的夹具本身必须换成服务端形状；校验器越严（精确 key 集合 / 派生字段相等 / canonical 重序列化），这种自洽假安全感越强。夹具默认值用 `=== undefined` 判定，`||` 会吞掉 `""` 这类合法边界值。
- 断言要泛化到类别而不是枚举实例；新增或审查断言先问「这条检查漏判的最简单反例长什么样」，别只问「现在能不能过」。
- 「这个东西有没有被处理」的判定，要从程序真实消费的数据结构（注册表、Set、导出清单）拿答案，别退回源码文本 grep——注释与字符串字面量会击穿它（实例见 rules/theme-factory.md）。

## Theme Factory（改主题源 / 三份 UI CSS / pinboard-themes.js 前必读 rules/theme-factory.md）

13 套站点主题与扩展三表面（popup/options/library）主题均由 `docs/theme-surface/` token-driven 生成。**唯一工作流**：改 `composers/*.mjs` 或 `pilots/*.tokens.json` → `node docs/theme-surface/tools/sync-all.mjs` → commit。**禁止手工编辑** `pinboard-themes.js` 与三份 CSS 里的六个 `@generated:*` 区——pre-commit（含 css-region-audit / handedit-audit 的 8 道门）会拦截，但 `ui-token-coverage` 与 `contrast-audit` 只在 sync-all / verify.sh 里，改生成区前必须手动跑一次。组件原语 generated，页面级布局与间距 token 的 `:root` 定义手写。规范：COMPONENTS.md；新主题：NEW_THEME.md。

## 发布流程

```bash
git commit -m "fix(...): ..."   # pre-commit 自动跑全套 lint（禁止 --no-verify）
bash scripts/bump-version.sh    # 按 commit 类型 bump manifest（feat→minor / fix→patch）
git push origin main
bash scripts/release.sh         # 打 ZIP + GH release + changelog；--build-only 仅构建+冒烟不发布，其余任何运行都会直接发布
```

- **发版前文档核查（release.sh 硬门）**：自上个 tag 有 feat commit 而 README×9 / CLAUDE.md / docs/privacy.md / docs/index.md / theme-surface 文档全未改动时直接中止；确认无需更新用 `--docs-ok` 显式跳过。新增任何数据出口（新 API 调用、新导出目标、新 AI 触发面）必须同步 privacy.md 的 Network Requests / Permissions / Third-Party 三处。privacy.md 与 index.md 走 GitHub Pages，push 即生效，不依赖扩展发版。
- **用户可见文案 / README 改动**：×9 locale 逐行镜像、同 commit 更新；按目标语言重写而非翻译——细则见 rules/l10n.md。
- **打包规则**：root 的 `*.html` / `*.js` / `*.css` / `manifest.json` 自动进 ZIP，递归包含 `vendor/ icons/ _locales/`；`tests/ scripts/ docs/ release/ *.md` 与隐藏目录排除。新增非上述后缀/位置的运行时资源必须改 release.sh 的 INCLUDE_DIRS / TOP_LEVEL_PATTERNS；sanity check 断言 manifest 与所有 HTML 引用的文件都在 ZIP 内，少一个 exit 1。
- **扩展 ID 分层**：源码 manifest 固定开发 ID `feoognahlmfmbllpmgailahcnjppiegb`（开发公钥 + 开发 OAuth client，可与 CWS 版并存）；release.sh 校验源码身份后只在 ZIP 内替换为 CWS 公钥与生产 OAuth client，正式版固定 CWS ID `pnjndmjhljjbdlbejeenkepdalokfooh`。严禁占位 client ID/secret。Drive 两个 OAuth client 对同一 Google 账号 appDataFolder 的互通性 smoke 测不到，发布前需人工实测（细则见 rules/vocab-sync.md）。
- **ZIP smoke**（release.sh 内置，失败即中止）：Playwright 装解压后的 ZIP，校验 SW 注册、扩展 ID/OAuth client、vocab 模块加载、popup/options 无 pageerror、DNR 防盗链契约。`--skip-smoke` 仅限调试 release 脚本本身；单独跑 `node scripts/zip-install-smoke.mjs`。前置：`.qa-scan/` 已装 playwright + bundled Chromium。

## 临时事项（有到期日，过期即清）

- **WebDAV 删除清理代码**（引入 2026-07-24；最早清理 2026-08-24）：background.js 的 `pbpCleanupRemovedWebdav` 清旧 `webdav-push` alarm 与 local/sync 遗留配置。到期先核查已发布版本与用户升级情况，再删 `PBP_WEBDAV_REMOVAL_*`、清理函数及对应测试；不得按日期自动删除，历史审计文档继续保留。

## 与 Claude Code 协作

### 期望你主动做的

- 发现 JS 中的类型隐患和潜在 Bug（null 判断、异步错误处理）
- 指出 Chrome Extension API 的使用限制（MV3 Service Worker 生命周期）
- 补充缺失的 try/catch，尤其是 fetch 调用和 chrome API 调用
- 改主题时走 composer + sync-all + lint 链路，不动 `pinboard-themes.js`

### 不希望你做的

- 不要将项目迁移到框架或引入构建工具（保持零依赖）
- 不要过度拆分文件（当前结构是刻意为之；隔离脚本上下文间允许少量重复，不强行抽公共模块）
- 不要添加未要求的功能
- 不要主动创建文档文件
- 不要在 `pinboard-themes.js` 里手工加 CSS 规则
- 不要 `--no-verify` 绕过 pre-commit

## 子系统深水区规则索引（.claude/rules/）

读到匹配文件时自动加载；若本会话未触发（或你是不加载 rules 的工具），改下列文件前**必须先读对应规则文件**：

| 改这些文件 | 必读 |
|------|------|
| docs/theme-surface/**、popup/options/library.css、pinboard-themes.js、render-audit 家族 | `.claude/rules/theme-factory.md` |
| vocab-store.js、vocab-gdrive.js、options-vocab.js、library-vocab.js、anki-connect.js、eudic-sync.js | `.claude/rules/vocab-sync.md` |
| md-preview.*、md-translate / md-ask / md-reader / md-highlight / md-ai-core 等 md-*.js | `.claude/rules/md-preview.md` |
| md-dict.js、dict-pack.js、md-vocab-echo.js、ai-cache.js | `.claude/rules/dict.md` |
| options-backup.js（备份 schema v3 / 凭据 opt-in） | `.claude/rules/backup.md` |
| md-embed.js、background.js（DNR 防盗链修复） | `.claude/rules/hotlink-dnr.md` |
| ai.js、popup-ai.js、options-connectivity.js（关思考 provider 方言） | `.claude/rules/ai-providers.md` |
| README*.md、_locales/**、docs/privacy.md、docs/index.md | `.claude/rules/l10n.md` |
