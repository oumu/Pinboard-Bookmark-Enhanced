# Pinboard Bookmark Enhanced 项目配置

作者：pine2D
更新：2026-07-24

## 项目概述

Chrome Extension (Manifest V3)，一键将当前页面保存到 Pinboard，支持多 LLM 提供商的 AI 标签生成、摘要、全文翻译、Ask-the-page 问答与 opt-in 要点提炼（skim）。md-preview 阅读器带划词高亮/笔记/搜索/专注模式、在线词典与可选的 CC-CEDICT 离线汉英词典；高亮/笔记与生词集中在独立的「笔记与生词本」页（library.html，主从双栏 + 词条详情）；生词可按当前 Pinboard 账号搜索、排序、分组、加笔记、标记已掌握、批量管理（sticky 底部操作条）、导出，并发送到 Anki 或欧路词典。导出可 Send-to Obsidian/Gist/Webhook，另有可选 Wayback 自动归档、标签治理和 13 套 pinboard.in 站点主题（GitHub Light、Dracula、Catppuccin、Nord、Solarized、Flexoki、Terminal 等）。

## 技术栈

| 层级 | 技术 |
|------|------|
| 平台 | Chrome Extension Manifest V3 |
| 语言 | Vanilla JavaScript（无框架、无构建步骤） |
| 存储 | Chrome Storage API（sync + local）+ IndexedDB |
| AI providers | OpenAI / Anthropic / Gemini / DeepSeek / Qwen / MiniMax / OpenRouter / Groq / Mistral / Cohere / SiliconFlow / Zhipu (BigModel) / Moonshot / GitHub Models / Ollama (local) |
| 页面正文抽取 | [Defuddle](vendor/) (本地化部署，懒注入) |
| 备用抽取 | Jina Reader API (r.jina.ai) |
| 主题生产 | 自建 theme factory（`docs/theme-surface/`） |

## 目录结构

```
.
├── manifest.json                # MV3 配置（permissions / host_permissions / 入口）
├── background.js                # Service Worker（图标状态、书签检测、URL 缓存、storage 预热）
│
├── popup.html/css/js            # 主弹出界面
├── popup-ai.js                  # AI 标签/摘要请求 + 各 provider 适配
├── popup-batch.js               # 批量保存操作
├── popup-offline.js             # 离线兜底
├── popup-tags.js                # 标签自动补全 + suggested tags
├── popup-theme-early.js         # 主题 bootstrap（防止 FOUC）
│
├── options.html/css/js          # 设置页
├── options-connectivity.js      # 各 provider 联通性测试 UI（运行时，非 dev 测试页）
├── options-backup.js            # 手工 JSON schema v3 导出/预览/分项导入（设置 + 可选高亮/生词）
├── options-vocab.js             # 生词设置侧（Drive 状态、全量 TSV/Anki/欧路导出、ECDICT 词典包）；列表已迁 library-vocab.js
├── options-theme-early.js       # 同 popup
│
├── library.html/css/js          # 笔记与生词本独立页（视图切换 + hash 路由 + visibilitychange 刷新；入口在 popup / options / 阅读器 Notebook）
├── library-vocab.js             # library 生词视图（当前 owner 主列表：搜索/筛选/排序/选择/批量条 + 右侧详情面板、笔记编辑、按需重新查词、窄窗单栏回退）
├── library-notes.js             # library 笔记视图（高亮/笔记列表与存储用量，迁自 options-notes.js）
│
├── vocab-store.js               # pbp-vocab IDB v2 唯一写边界（words + vector/outbox/tombstone/sync 状态）
├── vocab-gdrive.js              # SW-only Google Drive appDataFolder 客户端与同步 runner（当前待 OAuth 激活）
│
├── md-preview.html/css/js       # markdown 预览弹窗（摘要 / 全文翻译 / Ask-the-page / 阅读器）
├── md-ai-core.js                # md-preview AI 公共层（block 索引、占位符 shield、流式 JSON 解析、IDB 缓存）
├── md-translate.js              # md-preview 全文翻译（术语抽取 + 占位符守恒质量门 + 批队列 + 原文/双语/仅译文三态 + 阅读锚点恢复）
├── md-ask.js                    # md-preview Ask-the-page 问答（引用 chip）+ explain-pop（Explain/Translate/Dictionary、固定/拖动/关闭、焦点交接）
├── md-highlight.js              # 划词高亮（五色 + 笔记 + Notebook 面板 + 重渲染/翻译锚定恢复）
├── md-reader.js                 # 阅读工具（`/` 搜索含正则、脚注浮层、静默回位、`?` 快捷键帮助、`t/d/v/h` 单键契约、专注模式）
├── md-skim.js                   # AI 要点层（设置 opt-in，默认关——生成消耗 token）
├── md-dict.js                   # 词典视图（精确→小写→lemma、Free Dictionary API 熔断/Wiktionary 兜底 + AI 语境义 + speechSynthesis + owner-scoped pbp-vocab）
├── md-vocab-echo.js             # 生词再现提示（CSS Custom Highlight 点状下划线 + 点击开词典；`dictEchoEnabled` 默认**开**，与默认关的 skim 不同——它不花 token）
├── dict-pack.js                 # 离线词典包：CC-CEDICT 汉英（.txt/.txt.gz/.zip，中文查词短路）+ **ECDICT 英汉**（.csv，用户自备文件，**扩展不指向不下载**；三档累积谓词 R1/R2/R3，原子替换单事务，IDB v2）；options 静载，md-preview 懒加载
├── anki-connect.js              # 生词批量发送到本机 AnkiConnect（127.0.0.1:8765；纯层测试页可载）
├── eudic-sync.js                # 生词批量发送到欧路词典 OpenAPI（en/fr/de/es；纯层测试页可载）
├── ai-cache.js                  # md-preview 结果 IDB 缓存（dict2_ 独立 500 条 LRU；其他缓存仍受 200 条全局上限约束）
├── md-preview-theme-early.js    # md-preview 明暗 bootstrap（跟随 optTheme，防白闪，同 popup 模式）
├── md-convert.js                # markdown 转换中枢（marked→DOMPurify 单点 sanitize + 导出 + frontmatter/byline）
├── md-embed.js                  # 导出图片离线内嵌（扫描/预算/并发抓取远程图转 data URI 或 fetched Map，供 .md/.html/EPUB 导出复用）+ 防盗链修复取图（pbpImgFixWithReferer：向 SW 申请规则 → 带 Referer 重取）
├── md-epub.js                   # 单文章 EPUB 打包（纯层 zip/OPF/nav/XML 转义 + 运行时 XHTML 序列化与 DOM 派生目录 pbpBuildEpub）
├── export-targets.js            # Send-to 目标注册表（Obsidian / GitHub Gist / Webhook；纯层，测试页可载）
├── md-export-send.js            # Send-to 运行时（权限请求 + 预检 + 发送 + 剪贴板兜底）
├── ai.js                        # AI 调用核心（被 popup.html / options.html / md-preview.html 共载）
├── shared.js                    # 跨文件常量 + 工具（含 $id 记忆化 DOM 缓存）
├── jina.js                      # Jina Reader fallback
├── i18n.js                      # 多语言
├── tag-gov.js                   # 标签治理（重复/低频聚类 + 节流批量合并）
├── wayback.js                   # Wayback Machine 自动归档（队列 + 日志 + 重试）
├── site-rules.js                # 站点抽取适配器（Zhihu / HN / SO / arXiv…，注入并先于 Defuddle 运行）
├── pinboard-style.js            # 注入 pinboard.in 站点主题 CSS
├── pinboard-sort.js             # pinboard.in 标签页热度排序（第二段 content script，document_idle）
├── pinboard-themes.js           # 13 套主题 CSS preset（theme factory 产物，588KB）
│
├── icons/                       # 图标资源（16~128px，default / saved 两种状态）
├── _locales/                    # i18n 字符串（en / zh-CN / zh-HK / zh-TW / ja / de / fr / pl / ru）
├── vendor/                      # Defuddle 本地化（懒注入到 content script）
├── tests/                       # dev 测试页（md-ai / md-convert / export-targets，file:// 直开；不入 release ZIP）
│
├── docs/                        # GitHub Pages + theme factory
│   ├── theme-surface/           # ← 主题工厂（重要架构）
│   │   ├── composers/           # 布局模板（classic-list-v2 主力 + 4 备用）
│   │   ├── pilots/              # 13 主题的 tokens.json（输入）
│   │   ├── tools/               # 5 道 lint + sync-all 同步管道
│   │   ├── manifest.json        # surface inventory
│   │   ├── tokens.schema.json   # tokens 校验
│   │   └── NEW_THEME.md         # 新主题脚手架文档
│   └── superpowers/             # 内部规划草稿（gitignored）
│
└── scripts/                     # 发布工具链
    ├── bump-version.sh          # 按 commit 类型自动 bump（feat→minor / fix→patch）
    ├── release.sh               # 打 ZIP + 创建 GH release + changelog + 刷 camo cache
    ├── pre-commit-hook.sh       # 5 道 lint（见下）
    ├── commit-msg-hook.sh       # conventional commits 检查
    ├── setup-hooks.sh           # 安装 hooks
    └── update-vendor.sh         # 更新 Defuddle 版本
```

## 开发约定

| 约定 | 说明 |
|------|------|
| 加载方式 | `chrome://extensions/` → 加载已解压的扩展，选择项目根目录 |
| 无构建流程 | 直接编辑源文件，刷新扩展即可生效（vendor/ 例外，由脚本同步） |
| 存储分层 | `optSyncEnabled` 始终存于 `chrome.storage.local` 且按设备生效；普通设置按该标志选择 `sync` / `local`。凭据另受账号级 `syncApiKeys` 控制，但仅本机设置同步开启时参与。生词及其 Drive 协议状态在 IndexedDB，逐设备连接标记在 `chrome.storage.local`；缓存、瞬态状态与离线队列始终只在本机 |
| 书签缓存 | URL 书签状态 TTL 为 5 分钟 |
| Storage prime | 冷启动慢，靠 `chrome.alarms` 周期性预热 SETTINGS_DEFAULTS |
| 提示词模板变量 | `{{title}}`、`{{url}}`、`{{content}}`、`{{lang_instruction}}` |
| 图标状态 | 区分 default（未收藏）和 saved（已收藏）两套图标 |
| DOM 查询 | 用 `shared.js` 的 `$id(id)`（记忆化），不要 `document.getElementById`；**例外**：`md-preview.html` 加载 shared.js（供 `SETTINGS_DEFAULTS`/`deobfuscate*` 使用），但 `md-preview.*` 与 `md-*.js` 仍一律用原生 `document.getElementById`，不用 `$id` |
| Commit message | conventional commits（feat / fix / refactor / perf / docs / style / chore），英文 |

### 同步与备份边界

| 机制 | 数据 | 边界 |
|------|------|------|
| Chrome Sync | 普通设置；另行启用时包含凭据 | 每台设备通过 `optSyncEnabled` 参与；不含生词、高亮、缓存或任务状态 |
| Google Drive | 当前 Pinboard owner 的生词 | 每台设备由用户单独连接；只用 `drive.appdata`，不接管设置、凭据或高亮 |
| 手工 JSON schema v3 | 设置、主题，以及用户选择的高亮/笔记、当前 owner 生词和凭据 | 导出为明文文件；导入前预览并分项选择。凭据两端都默认关，勾选后以明文写入；不含 Drive 账号、OAuth、vector、outbox 或 tombstone |

## Theme Factory 工作流

`docs/theme-surface/` 是 token-driven 的主题生成系统，13 套 preset 都从 `pilots/*.tokens.json` 经 composer 渲染出来，写入四处：`pinboard-themes.js`（站点）+ `popup.css` / `options.css` / `library.css` 的 `@generated:ui-themes` 区（扩展 UI，`popup-chrome.mjs` / `options-chrome.mjs` / `library-chrome.mjs` 经 `_ui-derive.mjs` 派生；pilot 可用 `ui.popup/options/library.light/dark` 覆盖任意派生值；`on-accent` 每主题显式发射，勿依赖 var() fallback——自定义属性继承使 fallback 成死代码）。

**编辑顺序**：改 `composers/*.mjs` 或 `pilots/*.tokens.json` → 跑 `node docs/theme-surface/tools/sync-all.mjs`（8 步：render → apply×13 → diff-all --strict → contrast-audit → css-region-audit → ui-token-coverage → layout-lint → url-lint）→ commit。**禁止手工编辑 `pinboard-themes.js` 与三个 `@generated:ui-themes` 区**（handedit-audit / css-region-audit 拦截）。间距 token（`--pp-sp-*` / `--opt-sp-*` / `--lib-sp-*`、reader 的 `--prose-fs` 族）是主题不变量，落各文件手维护区，**不进 composer**。

**Pre-commit 5 道 lint**（任一红就 block，全部禁止 `--no-verify`）：
1. `diff-all --strict` — composer 输出 vs shipped 字符级一致
2. `token-coverage` — 所有 `v("...")` token 引用都解析得到
3. `cascade-lint` — CSS cascade 模拟（13 主题 × 15 探针，含 flexoki dark mode）
4. `override-drift` — 主题 overrides 不重新拉宽 composer 的 `:not(...)` 限定
5. `handedit-audit` — `pinboard-themes.js` 里没有 composer 不产出的规则

新主题脚手架：`docs/theme-surface/NEW_THEME.md`。

## 发布流程

```bash
# 1. 改完代码 + commit（pre-commit 会跑全套 lint）
git commit -m "fix(...): ..."

# 2. 按 commit 类型自动 bump manifest 版本
bash scripts/bump-version.sh

# 3. push
git push origin main

# 4. release（打 ZIP + GitHub release + 自动生成 changelog）
bash scripts/release.sh
```

### 多语言文档文案规范（README ×9 / 用户可见文案）

本地化 = **按目标语言重写,不是翻译**。铁律与依据(2026-07 READMEfeature 文案返工教训):

1. **项目术语一致性最高优先**:动笔前先查 `_locales/<lang>/messages.json` 与既有 README——既定叫法:「**追踪**参数」(非跟踪)、「稍后阅读」「标签治理」「高亮/笔记」(非批注)、「存档」(Wayback)。UI 里叫什么,文档就叫什么。
2. **中文**(微软 zh-CN 指南 + 阮一峰规范 + 排版指北):用「你」不用「您」;代词能省则省;禁逐词直译与欧化句式(「带走它」「链接不再腐烂」这类 calque 一律重写);一句一义,强动词(「找回」不是「有…可查」);全角标点,中英文之间空格;半正式语气,忌广告腔(「秒变」)与过俗口语(「揪出」)。
3. **其他语种**:各按微软对应语种 Localization Style Guide 的语气与惯例重写(<https://learn.microsoft.com/en-us/globalization/reference/microsoft-style-guides>)。
4. **README 面向潜在用户**:收益优先、一行一条、砍机制话术(实现细节留给设置页与 release notes);×9 locale 逐行镜像、同 commit 更新。
5. 铺多语言文案时优先调用 `~/projects/skills` 的文档本地化 skill(如已建成)。

### 发版前文档核查（硬规则）

每次发版前核查以下文档是否与新功能同步：**README.md（×9 locale 逐行镜像，同 commit 内更新）/ CLAUDE.md / docs/privacy.md（隐私政策）/ docs/index.md（Pages 门面）/ docs/theme-surface/README.md + NEW_THEME.md（theme factory 机制有变更时必须同步）**。新增任何数据出口（新 API 调用、新导出目标、新 AI 触发面）时，privacy.md 的 Network Requests / Permissions / Third-Party 三处必须同步披露。`release.sh` 内置硬门：自上个 tag 以来存在 feat commit 而上述文档全部未改动时直接中止（中止信息会打印逐项核查清单）；确认确实无需更新后可用 `--docs-ok` 显式跳过。privacy.md 与 index.md 经 GitHub Pages 自动部署（push 即生效），不依赖扩展发版。

**文案质量融入（2026-07）**：凡更新用户可见文案——多语言走 `content-l10n` skill；英文/中文散文按 `humanizer`/`humanizer-zh` 自查（破折号群、广告腔、三连套式、宣传性强化）。commit subject 是 release notes 的原料，同样适用。机械契约由 `scripts/docs-lint.mjs` 守护（verify.sh/CI 内）：README ×9 结构镜像、features 定界符策略（EN/CJK/de/fr 用冒号族，**pl/ru 保留母语破折号，勿"统一"**）、README.md 与 privacy.md 的英文散文破折号禁令。

### Release 打包规则（release.sh）

`release.sh` 自动扫描 + sanity check，不再硬编码文件清单：

- **自动包含**（root 下匹配 glob）：`*.html` / `*.js` / `*.css` / `manifest.json`
- **递归包含目录**：`vendor/` / `icons/` / `_locales/`
- **扩展 ID 与 OAuth 分层**：源码 `manifest.json` 使用公开开发公钥和开发 OAuth client，固定为开发 ID `feoognahlmfmbllpmgailahcnjppiegb`，可与 CWS 版并存；`release.sh` 校验源码身份后，只在 ZIP 内替换为 CWS 公钥和生产 OAuth client，使正式解压安装版固定为 CWS ID `pnjndmjhljjbdlbejeenkepdalokfooh`
- **显式排除**：
  - `tests/`（dev 测试页整目录——不在 INCLUDE_DIRS，自动 skip）
  - `perf-baseline.json` / `perf-after-*.json`（measurement 数据）
  - `*.md` / `LICENSE`（文档）
  - 隐藏文件/目录（`.git/` / `.claude/` / `.qa-scan/` 等）
  - 项目目录 `scripts/` / `docs/` / `release/`（不在 INCLUDE_DIRS 里自动 skip）
- **Sanity check**：扫 `manifest.json` 的 `background.service_worker` / `content_scripts.js+css` / `action.default_popup` / `options_page`，再扫所有 included HTML 的 `<script src>` / `<link href>`，**断言**每个引用都在 ZIP 内。少一个就 release.sh exit 1。

**新增扩展运行时文件时**：只要文件落在 root 且 `.js` / `.html` / `.css` 后缀，自动被 release.sh 包含——无需手动改脚本。Sanity check 会兜底报错。

**新增其他类型的运行时资源**（如 `themes/*.js` / 子目录 / 非 `.js`/`.html`/`.css` 后缀的文件）：必须更新 `scripts/release.sh` 的 `INCLUDE_DIRS` 或 `TOP_LEVEL_PATTERNS`。

### Release ZIP smoke test

`release.sh` 在 ZIP 构建后、`gh release create` 前会自动跑 `scripts/zip-install-smoke.mjs`：

- 解压 ZIP 到临时目录
- 用 Playwright bundled Chromium + `--load-extension` 安装该 ZIP
- 校验 Service Worker 注册成功（catch importScripts 404 等）
- 校验 Release ZIP 的扩展 ID 精确等于 CWS ID，OAuth client 精确等于生产 client（源码目录保持独立开发 ID/client）
- 校验 `vocab-store.js` / `vocab-gdrive.js` 已由 SW 成功加载，设置页显示可用的“连接 Google Drive”
- 校验 popup.html 打开无 pageerror（catch `ReferenceError` 等）
- 校验 options.html 打开无 pageerror
- 任一失败 → release.sh 中止，不发 GitHub release

**跳过 smoke**：`bash scripts/release.sh --skip-smoke`（仅在调试 release 脚本本身时使用）

**单独运行 smoke**：`node scripts/zip-install-smoke.mjs` 默认拿 release/ 里最新 ZIP；`--zip <path>` 指定。

**前置**：`.qa-scan/` 装好 playwright + bundled Chromium（`cd .qa-scan && npm install && npx playwright install chromium`）。

## API 规范

- Pinboard API v1：通过 `auth_token` 认证
- **Pinboard 账号隔离不变量**：所有 Pinboard v1 请求在实际 dispatch 前必须原子重读有效凭据；同用户名 token 轮换时用新 token 重写请求，登出或跨用户名切换时取消且不得发网。任何由账号数据派生的 cache / message / preview payload / 持久任务必须携带非秘密 owner，并在读取、异步回写和 UI 提交时逐次校验 owner。
- AI 请求统一走各 provider 的 chat completion 接口
- API key、token、password 与导出目标凭据不能硬编码。新用户默认保存在 `chrome.storage.local`；仅当本机 `optSyncEnabled=true` 且账号级 `syncApiKeys=true` 时使用 `chrome.storage.sync`。旧云端已有非空 secret 时迁移保留 `syncApiKeys=true`，避免升级丢失凭据
- Defuddle 在 popup 打开时**懒注入**，避免冷启动开销；`site-rules.js` 与其成对注入且**先于** Defuddle 运行（命中站点规则即短路）
- **网络端点与 host 权限不变量**：required host 仅 Pinboard；AI / Jina / Wayback / Gist / Webhook / Free Dictionary API / Eudic、AnkiConnect 精确回环 origin 与 Batch 所选站点，只能从对应的直接用户动作请求当前精确 origin。后台/自动路径只做 `permissions.contains`，禁止运行时申请 wildcard。可配置网络端点必须 HTTPS，HTTP 仅允许字面 `localhost` / `127.0.0.1` / `[::1]`；LAN/public HTTP、凭据 URL 与无权限请求一律阻断并保留配置。升级时一次性清理 legacy all-sites grant。
- **Google Drive OAuth 构建契约**：源码开发公钥、开发扩展 ID、开发 OAuth client 和生产 OAuth client 均使用已注册的真实公开值；manifest 声明可选 `identity` 与唯一 scope `drive.appdata`。release 必须同时替换公钥和 OAuth client，并核验 ZIP 的 CWS ID/client。两个真实 client 对同一 Google 账号的 `appDataFolder` 双向可见性仍须在发布前实测；若不互通，开发版使用独立测试数据，生产双设备验收改用同一 CWS build。严禁占位 client ID 或 client secret。
- **Google Drive 权限与断开语义**：只有“连接 Google Drive”这一直接用户动作可申请 `identity` 和精确 Google API origin；后台同步只做 `permissions.contains`，SW 启动不得弹 OAuth。断开本设备时移除 token cache 与可选权限，但保留本地生词、outbox、tombstone 和远端 `appDataFolder` 文件。Drive 中保存的是当前 owner 生词的明文应用私有副本，不是端到端加密。
- **生词同步不变量**：`vocab-store.js` 是 `pbp-vocab` 的唯一写入口。每次本地 mutation 在同一 IDB transaction 中核验 owner，并原子更新 word 或 tombstone、版本向量和 coalesced outbox；删除保留 tombstone，不自动 GC。远端批次用 owner hash 隔离，vector dominance 与稳定 dot 决定收敛；并发删除遇到新修改时 live 胜出并留下持久 notice，用户再次删除后 tombstone 才支配。每个网络 await 和 IDB commit 前都重核验 Pinboard owner 与 Drive `permissionId`，变化时不得推进游标或上传旧账号数据。
- **生词同步错误码与指引契约**：`auth`（Google 令牌失败）、`pinboard_auth`（无 Pinboard 账号，
  发生在任何 Google 调用之前，不写 preflight）、`not_connected`（本机未连接，**不渲染成错误**）、
  `permission`、`corrupt`（远端批次不合法）、`local_store`（本机 IndexedDB 写失败，与 `corrupt`
  严格分开）、`entry_too_large`、`network`、`remote`。`applyRemotePage` 只返回
  `invalid_remote_page`，必须显式认领。**每个 blocked 状态都要点名一个当前屏幕上可见的按钮**：
  已连接指向「断开此设备」，未连接指向「连接 Google Drive」，重连救不了的指向「立即同步」
  （`force` 是唯一能清除 blocked 的入口）。仍在退避的状态只显示下次重试时间，不给指令。
  按钮名称逐字复用该 locale 已发布的按钮文案，不另造叫法。
- **ECDICT 英汉包不变量**：扩展只读 ECDICT 的 CSV 字段布局，**不发网络请求、不提供下载链接、不指向来源、不申请任何 host permission**——文件由用户自备，其许可由用户负责，UI 与 privacy.md 一律不得写成已确认的数据许可。三档谓词 R1⊆R2⊆R3 **必须单调**（升档只增不减）；基础条件（`word` 归一后非空 AND `translation` trim 后非空 AND 按字面 `\n` 切分后至少一个非空 sense）先于 rung 判定。未闭合引号 → **拒绝整个文件**（跳行会让续行变成伪记录）。导入是**原子替换**：全量解析成功且所有资源门通过后才开唯一事务，`clear + put×N + meta.put` 同 scope `[ecdict, packs]`；`meta.put` 必须在最终批最后一个 request 的 `success` 回调内**同步**排入；**禁止**对 request error 调 `preventDefault()`。查词槽拆 `.xp-dict-local` / `.xp-dict-online` 两个稳定子容器，**任何路径都不得 `replaceChildren()` slot 本身**；本地支线只在 `en` 启动、不被在线链 await、失败一律 UI 静默但须 `console.warn`，且不写 `cur.*`。导出侧的中文是**设备级现算**：compute-only，不回写 `pbp-vocab`、不进 Drive，Anki 六字段不变。性能验收走 `scripts/ecdict-import-perf.mjs`（不进 pre-commit / verify.sh）。
- **手工备份 schema v3**：导出前 flush 待保存设置，payload 通过与导入相同的 preflight；备份含 `_backup` 元数据、设置/主题和可选的当前 owner 高亮/生词，只含运行时 word 字段。导入必须先预览，再由用户分项选择；生词按 100 条通过 store primitive 合并并在每批前后重核验 owner。OAuth、Drive 账号、vector、dot、outbox、tombstone 和 batch 一律不进入备份。
- **备份中的凭据是 opt-in，两端都 fail-closed**：默认导出不含任何凭据（三道过滤：`EXPORTABLE_KEYS` 白名单、`pbpBuildBackupSnapshot` 内部的 `API_KEY_FIELDS` 过滤、export-target registry 的 secret 删除）。勾选后导出全部 `API_KEY_FIELDS` 与 export-target 的 token/URL，文件名带 `with credentials`，`_backup.includesSecrets=true`（`pbpSanitizeBackupMetadata` 必须同步接受该字段，否则自己导不回来）。导入侧凭据是独立 section：`pbpApplyBackupPayload` 的 `selected.secrets` **只认显式 `=== true`**，不随"其余默认全开"继承——备份文件是不可信输入，任何文件都可能被手工塞进凭据字段，静默覆盖本机可用凭据是攻击面（`tests/settings-persist-tests.html` 的 E7b 正反两条断言钉死此边界）。预览的 checkbox 在 enabled 时也保持不勾选。凭据经 `persistSettings` 写入，由其 `pbpSplitSecretBatch` 自行路由存储区，secrets 分支必须排在 settings 分支**之后**（settings 会用无凭据副本重建 exportTargets）。
- **WebDAV 删除清理临时代码（引入 2026-07-24；最早清理 2026-08-24）**：`background.js` 的 `pbpCleanupRemovedWebdav` 会清除旧 `webdav-push` alarm，以及 local/sync 中遗留的 WebDAV 配置和状态。至少保留一个月的升级覆盖；到期后先核查已发布版本和用户升级情况，再删除 `PBP_WEBDAV_REMOVAL_*`、清理函数及对应测试。不得按日期自动删除，历史审计文档继续保留。
- **防盗链图片修复不变量（`declarativeNetRequestWithHostAccess`，改 md-embed / background 规则代码前必读）**：部分 CDN（实测 cdnfile.sspai.com）**只拒空 Referer**，而扩展页只能发空 Referer（且预览对图片强制 `no-referrer`——这对更常见的"封外站/放空"型防盗链是正确默认，勿改）。修复=**SW 独占**的临时 DNR session rule：① rule id 由 SW 在保留段 786001-786999 内分配，**页面绝不自行分配**（id 是扩展全局的，页面局部计数器必然跨 tab 冲突）；② install / remove / sweep **全部走同一条串行队列**，install 在临界区内用 `tabs.get` 重核验该 tab 仍是**同一预览文档**（否则规则会落到已导航走的普通网站 tab 上）；③ 规则条件必须含 `initiatorDomains:[chrome.runtime.id]`——这是"普通网页请求不可能命中"的**结构性**保证，不是靠清扫抢时间；④ tab 作用域取自 `sender.tab`；删除做 (tab, 文档) owner-check——但 owner 表是 SW 内存态，**SW 重启后降级为仅 tab 校验**（同 tab 跨文档的 id 复用在那个窗口内仍可能误删，属已知残留风险，非不变量）；⑤ 清扫三路：tab 关闭 / 离开预览文档 / 预览页加载时自清（同 URL reload 不触发 `changeInfo.url`，靠第三路兜底）；⑥ 重试取图必须 `cache:"reload"`——失败的 `<img>` 已把 403 写进 HTTP 缓存，`force-cache` 会直接复用它导致规则形同虚设。自动修复只对**已授权 origin** 生效（`permissions.contains`，绝不 prompt），批次在首个 await 前**冻结**（否则等待授权期间新入队的未授权 origin 会混进自动批次）。`zip-install-smoke.mjs` check 5 守护其中五条：跨 tab id 唯一、跨 tab 删除被拒、非预览 tab 拒装、规则带 `initiatorDomains`、离开预览即清扫（**不覆盖** SW 重启后的同 tab 跨文档删除）。
- **关思考（thinking/reasoning）—— 勿凭记忆改 provider 表**：`ai.js` `OPENAI_COMPAT_PROVIDERS` 每家用 **per-provider `thinkingOff` 方言字段**（非 always-on `extraBody`），经 `_aiWithThinkingFallback` 在 **4xx(400/422) 时去字段重试一次 + `storage.local` 记忆**。根因：model 字段是自由文本，blanket 关思考会把用户切换的不兼容模型打 400。**custom/ollama/groq/githubmodels 不加 thinkingOff**（githubmodels 是网关，转发多家 publisher，没有跨家安全的字段）；gemini 走 `thinkingBudget:0`；deepseek 也走 thinkingOff（reasoner 会拒收）。各家已核验字段勿凭记忆改（会 400），核验表见 CC 记忆 `reference_provider_thinking_disable_params`。
- **md-preview 全文翻译（`md-translate.js`，改前必读）**：block 切分 → `pbpAiShield` 占位符 `⟦C/L/I/M\d+⟧` 屏蔽代码/链接/图片/数学 → JSON `{translations:[{id,text}]}` 流式 → 块 hash 缓存。三条不变量勿破坏：① **占位符守恒**门（`pbpTrPlaceholdersConserved`，硬）+ 长度比（软）二者皆过才 fill；② glossary = 用户表 ∪ 自动抽取（**用户优先**）按批命中裁剪注入；③ 抽取/缓存任何失败必须 **degrade 不阻断**翻译。`md-translate.js` 顶段保持纯（无 DOM/chrome/fetch，供 `tests/md-ai-tests.html` file:// 加载）。
- **md-preview 三态视图与单键不变量**：`v` 严格按原文 → 双语 → 仅译文 → 原文循环，不保存“上次非原文模式”；`t` 与翻译按钮共用启动路径，`d` 与 `e` 共用选区捕获，`h` 与 `1-5` 共用高亮路径。切换前记录逻辑块 `n`、阅读侧 `side` 与块内比例 `frac`，切换后以 `behavior:"instant"` 恢复对应位置；View Transition 只处理短暂透明度变化，不能驱动滚动。reduced-motion 或无 `startViewTransition` 时直接恢复，位置正确性不得依赖动画。
- **md-preview 在线词典不变量**：`dict2_` 缓存键保留大小写，查询链为原词精确 → 语义未命中后的小写候选 → 再未命中后的 AI lemma。只有 HTTP 404 与 HTTP 200 空/不可渲染结果属于语义未命中；超时、断网、429、5xx 和坏 JSON 都是加载失败，不能伪装成“没有词条”。**实测（2026-07-29）：线上服务对查无此词返回的是 `200 + {"entries":[]}`，不是 404**——404 分支是防御性保留（代理/上游变更），别当成主路径读，也别因为“没见过 404”就删掉它。Free Dictionary API 连续 3 次网络类失败后在本会话熔断 60 秒，父级 abort 不计失败；Wiktionary 兜底固定导航到 English Wiktionary，不是后台请求。`dict2_` 最多保留 **500 个缓存记录**，其他缓存仍最多 200 条；这不限制查词次数、`pbp-vocab` 生词数量或 CC-CEDICT 词条数，原词别名与实际命中词可分别占一条记录。
- **explain-pop 会话与焦点不变量**：固定状态和拖动位置只在当前页面会话有效，不写 storage。只在 closed → open 时记录焦点来源，固定重入和动作切换不得覆盖；Esc 或关闭按钮仅在焦点仍位于弹层内时恢复到仍连接且可见的来源，并使用 `preventScroll`。来源失效时临时借用当前可见阅读块的 `tabindex="-1"`，blur 后清理；外部点击若已把焦点移到弹层外，不得抢回。
- **生词 owner、选择与刷新不变量**：生词列表、筛选、选择、单删、批删与加组都限定当前非秘密 Pinboard owner；账号切换先清空旧 owner 的可见行，再读取新 owner，失败时保持 fail-closed。UI 选择只影响批量删除和添加分组；TSV 与 Anki 始终处理当前 owner 的全部生词，欧路词典始终从当前 owner 全量中只发送 `en/fr/de/es`。每次 mutation 在用户确认时取得刷新代际，旧 IDB 快照不得晚写覆盖新状态；最新 mutation 即使失败也要重读真实 IDB。事务内逐条 owner 校验不得移到 UI 层或省略。

## 性能与踩坑（hard-won，改 UI / SW / 字体前必读）

> 真实事故的根因沉淀，**勿重新引入**。机制依据：Blink fonts README、crbug 1266022/491556、developer.chrome.com（SW lifecycle / storage / CSP / alarms）、web.dev（content-visibility / style 计算）。

### 远端 API 的测试夹具（2026-07 根因）

服务端响应的夹具**绝不能由写入侧构造器生成**。`tests/vocab-gdrive-tests.html` 的 `driveFile()`
曾用 `pbpVocabDriveMetadata()`（写入侧，硬编码创建期别名 `parents:["appDataFolder"]`）造"远端
文件"，而 Drive 读取时返回的是不透明 folder ID。结果 60 条断言全绿、一碰真机就 `corrupt`；
实测把同一个回归注入 runner，套件**仍然全绿**。校验器越严（精确 key 集合、派生字段相等、字节级
canonical 重序列化），这种"我和我自己一致"的自测越有假安全感。**铁律：远端响应夹具按真实抓包/
官方 schema 手写，与写入侧构造器物理分离**；补纯函数谓词的单测不够，runner 路径的夹具也必须是
服务端形状。同理，夹具里的 `||` 默认值会吞掉 `""` 这类合法边界值（`authAccount || "pin-a"` 让
"未登录"这个状态根本无法被表达），用 `=== undefined` 判定。

### 字体回退卡顿（2026-06 根因）

popup/options 是**短命单次渲染、无暖 shape cache**——首屏要付满「字体匹配 + 回退 + HarfBuzz shaping + 字体首次加载」成本。任何「UI 文本回退到一个大/慢字体」都会在高 DPI Windows 上造成 **1-3s 冻结**（计入 Rendering / Recalc+Layout，Paint 反而很小）。已踩中三种形态，对应三条铁律：

| 形态 | 机制 | 铁律 |
|------|------|------|
| emoji / dingbat（⚠ ✓ ✗ ✕ ↻ ▸ ▾ ℹ …） | 回退到 Segoe UI Emoji 彩色字体，首次加载 ~1.6s | UI 里**一律内联 SVG**（`PBP_ICONS` / `setBtnIcon` / `setStatusIcon` / CSS 三角），**禁止字面 emoji/符号字符**。`U+FE0E`(VS15) 和 `font-variant-emoji:text` 在 Chrome 实测**无效**，别依赖。**图标只从 Lucide 同版本取 path**（2026-08 起 PBP_ICONS 全族源自 Lucide v0.525.0/ISC，24-box、stroke 2，唯一例外 obsidian 品牌钻石）：新图标不许手绘、SVG 内禁止 `<text>` 节点（CJK 字形会重踩字体回退）；`eye/eyeOff` 独占密钥显隐、`refresh` 限定「重跑同一动作」、`cross` 是删除/移除/关闭家族、`extOpen` 限定真外链、`robot` 限定花 token 的 AI 动作；icon-only 按钮必须 `title` + `aria-label` + ≥24px 命中区 |
| CJK 正文 | font-family 只列拉丁字体 + 通用 `sans-serif` → 中文回退到 profile 的 **Standard 字体**（用户可能设了大 CJK 字体如 Sarasa） | body font-family **必须在 `sans-serif` 前显式列快 CJK 字体**：`"PingFang SC","Microsoft YaHei","Hiragino Sans","Noto Sans CJK SC"` |
| 等宽（Latin） | 裸 `monospace` **和 `ui-monospace` 都** → profile 的 **Fixed-width 字体**（`ui-monospace` 在 Chrome 不映射到 OS 等宽 UI 字体，而是同 Fixed-width 设置） | **以命名字体打头**：`"SF Mono",Consolas,Menlo,…`。**禁止用 `ui-monospace` 或裸 `monospace` 打头** |
| 等宽里的 **CJK**（最隐蔽） | Consolas/SF Mono **没有中文字形**，monospace 元素里的中文字符会穿过整个 Latin 栈、落到栈尾 `monospace` 通用名 → **Fixed-width CJK = Sarasa** 又中招。**典型触发**：zh-CN 下 Bookmark 的 tag-presets、Appearance 的 custom-CSS 这两个 textarea 的**中文 placeholder** | monospace 栈在 `monospace` 之前**必须再列快 CJK 字体**：`…,"PingFang SC","Microsoft YaHei","Hiragino Sans","Noto Sans CJK SC",monospace`。只修 Latin 一半 → Bookmark/Appearance 仍卡（2026-06 实测）。用 `CSS.getPlatformFontsForNode` 验证：Latin→Consolas、CJK→YaHei，都不到通用名 |
| **表单控件**的 CJK（2026-06 实际根因） | `<button>`/`<input>`/`<select>` 默认**不继承** `font-family` → 吃 UA 默认 `Arial`（无中文字形）→ 中文标签掉到 Standard 字体 = Sarasa。按钮**每个 tab 都有** → 表现为「每次首切 tab 都卡」。`.fg textarea` 反而早已命名 YaHei 没事——前几轮只盯 textarea 全找错了方向 | options.css 顶部 `button, input, select { font-family: inherit; }` 让其继承 body 的 CJK 栈（`.fg textarea` 凭更高 specificity 仍保 monospace） |

**测量陷阱**：chrome-dbg / 已打开的页面是**暖态**，测不到冷首屏（同代码暖态 ~3ms vs 日常 Chrome 1.7s）。判定：第二次操作就快 = 一次性冷成本；**只能在用户真实机器冷启动验证**。预热（idle 强制 layout）会阻塞主线程造成「看着渲染完却卡死」，**不可取**——优先消除慢字体回退这个根因。热路径避免 `:has()` 等慢选择器；超长面板可考虑 `content-visibility:auto`。

**CJK 字体名 & 检测**：① CJK 名要列**真实存在的全集**——`"Noto Sans SC"`（不是只 `"Noto Sans CJK SC"`，二者是不同 family）、本地化 `"微软雅黑"`、`"Source Han Sans SC"`、`"WenQuanYi Micro Hei"`，覆盖 Win/Mac/Linux。② 判断字体在不在**别用「测 ASCII 宽度」的探针**——它对 CJK 字体会**误报**（Win11 的 YaHei 被误判 false 害我绕了几轮）；用 `document.fonts.check('16px "字体名"', '中')` 或 DevTools「Rendered Fonts」/ `CSS.getPlatformFontsForNode` 这种按真实渲染判定的方法。

### MV3 不变量（改 background.js / 存储 / manifest 前别破坏）

- **SW 无持久状态**：30s idle 即终止、全局变量被清空。状态一律落 `chrome.storage`，每个 handler 开头重读；全局只作单次调用内的暖缓存。
- **optional permission 的命名空间不能在顶层捕获（2026-07-27 真实事故）**：`chrome.identity` 等
  optional permission 的 API，在权限未授予时**整个命名空间不存在**。SW 顶层的
  `const client = makeClient()` 若把 `chrome.identity` 作为默认参数捕获，就会把 `undefined`
  钉死在整个 worker 世代上——而权限恰恰是在那之后才由用户授予的（**每个新用户第一次连接的必经
  顺序**）。表现：调用抛 TypeError 被 catch 吞掉，报成"授权失败"，而同一时刻 Console 里
  `chrome.identity` 看着完好；SW 空闲重启后又自愈，所以极难复现和归因。**铁律：optional
  permission 的 API 一律在调用点现取**（`vocab-gdrive.js` 的 `identityApi()`），不做模块级捕获；
  测试注入的 fixture 仍优先。**调试推论**：给 SW 开着 DevTools 会阻止它被回收，"重启一下就好了"
  这类推理在开着 DevTools 时不成立。
- **吞异常必须留痕**：`catch (_)` 配上只有一个词的错误码，会让远程诊断一轮一轮空转。凡是把
  平台 API 异常折叠成产品错误码的地方，先 `console.warn` 出 `error.name` / `error.message`
  （二者都不含 token、邮箱或生词内容）。
- **监听器顶层同步注册**：`chrome.*.on*` 与 `importScripts` 只能在 SW 顶层同步执行；async 注册在 MV3 不保证生效。
- **存储分层**：`optSyncEnabled` 是每设备 `local` 开关，普通设置据此路由到 `sync` 或 `local`；`syncApiKeys` 是账号级 `sync` 标志，但设置同步关闭的设备始终读取本地凭据。凭据同步关闭时 secret 留在各设备 `local`，开启时仅参与设置同步的设备使用云端副本。`sync` 单 item ≤8KB、总约 100KB、写入限流；写后检查 `lastError`。缓存/大/瞬态始终用 `local`。
- **离线队列隔离**：`offlineQueue` 只存 `chrome.storage.local`。新记录仅保存保存模式、URL、标题、备注、标签、私密/稍后读/归档标志、书签时间、队列 ID/入队时间与非秘密 Pinboard 用户名绑定，禁止保存 token；启动或读取时把 legacy token 改写为账号绑定并删除 token。重放必须使用当前登录 token，且用户名与队列绑定精确一致，否则保留队列并失败关闭。
- **消息异步响应**：`onMessage` 里 `return true` 保持通道，且**别**把该 listener 设成 `async`（二者只能取一）。
- **CSP**：禁 `eval`/远程代码；只能远程取**数据**（JSON/CSS）。Defuddle 因此本地 vendor。
- **content script**：仅 `pinboard.in` 注入、保持瘦身；`document_start` 仅主题注入需要（第二段注册 = `pinboard-sort.js`，`document_idle`）。
- **setIcon**：仅状态真正变化时调用 + 缓存 ImageData，别每个 tab 事件重新 fetch PNG（见 `9b689c1` 回归修复）。

## 与 Claude Code 协作

### 期望你主动做的

- 发现 JS 中的类型隐患和潜在 Bug（null 判断、异步错误处理）
- 指出 Chrome Extension API 的使用限制（MV3 Service Worker 生命周期）
- 补充缺失的 try/catch，尤其是 fetch 调用和 chrome API 调用
- 改 theme 时走 composer + sync-all + lint 链路，不动 `pinboard-themes.js`

### 不希望你做的

- 不要将项目迁移到框架或引入构建工具（保持零依赖）
- 不要过度拆分文件（当前结构是刻意为之）
- 不要添加未要求的功能
- 不要主动创建文档文件
- 不要在 `pinboard-themes.js` 里手工加 CSS 规则
- 不要 `--no-verify` 绕过 pre-commit
