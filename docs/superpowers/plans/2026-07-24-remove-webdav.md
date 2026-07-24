# WebDAV 功能完整移除实施计划

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**目标：** 从扩展中完整移除 WebDAV 的 UI、网络能力、后台任务、配置、凭据路由和用户文案，同时以一段临时、无网络、可重试的启动迁移清除升级用户的旧数据。

**架构：** 删除 `webdav.js` 及所有调用方，不保留兼容适配层。唯一暂留的是 `background.js` 中的启动清理函数：删除 local/sync 旧键和 `webdav-push` alarm，成功后用 `chrome.storage.session` 标记本浏览器会话已完成。旧手工备份继续走现有 `SETTINGS_DEFAULTS` 白名单，因此旧 WebDAV 字段会自然忽略，其他字段照常恢复。

**技术栈：** Chrome Extension Manifest V3、Vanilla JavaScript、Chrome Storage/Alarms API、HTML 浏览器测试、Playwright 测试运行器。

**设计依据：** `docs/superpowers/specs/2026-07-24-remove-webdav-design.md`

## 实施约束

- 保留 `manifest.json` 的 `alarms` 和 `optional_host_permissions: ["*://*/*"]`，它们仍被其他功能使用。
- 不撤销任何 origin 权限，不访问或删除远端 WebDAV 文件。
- 用户已确认删除当前未提交的 `tests/webdav-tests.html` 修改，不另行备份。
- 保留 `docs/superpowers/` 中既有 WebDAV 历史资料。
- `options.css` 的 WebDAV 样式位于手维护区，不改 theme factory composer、pilot 或生成区；最终用全量主题 lint 验证。
- 本轮不 bump 版本、不 push、不 release，除非用户另行要求。

---

## Task 1：删除运行能力并清理升级残留

**Files:**

- Modify: `background.js:5, 209-225, 1398-1510`
- Modify: `shared.js:359-362, 778, 1393, 1472-1477, 1588-1624`
- Modify: `options-backup.js:133-151, 275-280`
- Modify: `options.html:109-206, 1010`
- Modify: `options.css:1572-1608`
- Modify: `options.js:117-289, 1067-1089, 1262-1278, 1787-1977, 2024-2705, 2717, 2852-2858, 2891-2911, 2954-2955`
- Modify: `tests/background-active-tab-tests.html:99-148, 326-346`
- Modify: `tests/settings-persist-tests.html:15-20, 79-331, 444-590, 985-989, 1390-1416, 2460-2490, 2509-2512, 2582-2586, 2690-2710, 2920-2925`
- Modify: `tests/ui-contract-tests.mjs:1-420, 829-847, 1028`
- Modify: `tests/md-convert-tests.html:2551`
- Modify: `.qa-scan/run-test.mjs:44-68`
- Delete: `webdav.js`
- Delete: `tests/webdav-tests.html`

### Step 1：先写会失败的移除契约

在 `tests/background-active-tab-tests.html` 中用清理迁移 harness 替换旧的自动推送 alarm harness，并新增三条测试：

1. 成功时精确删除 local/sync 键、清除 `webdav-push` alarm，最后写 session 标记。
2. session 标记已存在时不重复调用 alarm/local/sync。
3. 分别模拟 alarm、local、sync 失败；任何失败都不得写标记，再次调用时必须重试。

精确键集合：

```js
const syncKeys = [
  "webdavUrl",
  "webdavUser",
  "webdavPass",
  "webdavFolderMode",
  "webdavRelativePath",
  "webdavLayoutVersion",
];

const localKeys = syncKeys.concat([
  "webdavAutoPush",
  "_webdavAutoPushLocalV1",
  "_webdavSyncState",
  "_webdavEtagState",
  "webdavLastPush",
]);
```

在 `tests/settings-persist-tests.html` 中把现有 E7b 导入用例改成兼容性契约：输入旧备份中的 `webdavUrl`、`webdavPass`、`webdavAutoPush`，断言它们不进入 `importedBatch`，同时 `optTheme` 和非秘密 export-target 字段仍正确恢复。

在 `tests/ui-contract-tests.mjs` 中新增静态契约：

```js
check(!existsSync(resolve(root, "webdav.js")), "webdav.js still exists");
check(!optionsHtml.includes('id="opt-webdav') &&
  !optionsHtml.includes('src="webdav.js"'), "options.html still exposes WebDAV");
check(!optionsJs.toLowerCase().includes("webdav"), "options.js still owns WebDAV behavior");
check(!optionsCss.toLowerCase().includes("webdav"), "options.css still ships WebDAV styles");
check(manifest.permissions.includes("alarms"), "shared alarms permission was removed");
check(manifest.optional_host_permissions.join(",") === "*://*/*",
  "shared optional-host declaration changed");
```

清理函数的源码契约还要断言：

- 不含 `fetch(`；
- 不含 `permissions.request`、`permissions.remove` 或远端 URL；
- session 标记写入发生在 alarm/local/sync 三步之后；
- `background.js` 不再导入 `webdav.js`，不再处理 `webdav-push` alarm。

### Step 2：运行针对性测试，确认新契约先失败

Run:

```bash
node ".qa-scan/run-test.mjs" "tests/background-active-tab-tests.html"
node ".qa-scan/run-test.mjs" "tests/settings-persist-tests.html"
node "tests/ui-contract-tests.mjs"
```

Expected: FAIL，原因分别是清理函数尚不存在、旧备份仍恢复 WebDAV 字段、运行时和 UI 仍存在。

### Step 3：实现最小启动清理迁移并移除后台执行路径

在 `background.js` 中加入唯一保留的 WebDAV 相关运行时代码：

```js
const PBP_WEBDAV_REMOVAL_SESSION_KEY = "_webdavRemovalCleanupV1";
const PBP_WEBDAV_REMOVAL_SYNC_KEYS = [/* Step 1 的 6 个键 */];
const PBP_WEBDAV_REMOVAL_LOCAL_KEYS = [
  ...PBP_WEBDAV_REMOVAL_SYNC_KEYS,
  /* Step 1 的 5 个 local-only 键 */
];

async function pbpCleanupRemovedWebdav({
  alarms = chrome.alarms,
  local = chrome.storage.local,
  sync = chrome.storage.sync,
  session = chrome.storage.session,
} = {}) {
  const done = await session.get(PBP_WEBDAV_REMOVAL_SESSION_KEY);
  if (done[PBP_WEBDAV_REMOVAL_SESSION_KEY] === true) return false;
  await alarms.clear("webdav-push");
  await local.remove(PBP_WEBDAV_REMOVAL_LOCAL_KEYS);
  await sync.remove(PBP_WEBDAV_REMOVAL_SYNC_KEYS);
  await session.set({ [PBP_WEBDAV_REMOVAL_SESSION_KEY]: true });
  return true;
}
```

顶层以 fire-and-forget 调用，失败只记录固定标签和错误类型，不得输出 storage 值、URL、用户名或密码：

```js
pbpCleanupRemovedWebdav().catch((error) => {
  console.warn("[webdav-removal] legacy cleanup failed", error?.name || "Error");
});
```

同时从 `background.js` 删除：

- `webdav.js` 的 `importScripts`；
- `loadSettings()` 的 `pbpWebdavReadAutoPush`；
- `syncWebdavPushAlarm` 及其队列；
- `webdav-push` alarm handler；
- WebDAV storage-change cache/alarm 接线；
- 启动时的 `syncWebdavPushAlarm()`。

把清理调用放在其他启动维护任务附近；不得等待它完成或阻塞 Service Worker 监听器的顶层同步注册。

### Step 4：删除设置、凭据和备份传输特例

在 `shared.js`：

- 从 `SETTINGS_DEFAULTS` 删除 6 个 WebDAV 设置；
- 从 `API_KEY_FIELDS` 删除 `webdavPass` 及其专用注释；
- 把备份注释改回只描述手工导入/导出；
- 将 `pbpBuildBackupSnapshot(settings, extra, options)` 简化为 `pbpBuildBackupSnapshot(settings, extra)`；
- 删除 `includeWebdavTransport`、WebDAV URL/用户名反混淆以及 `_webdav` metadata 分支；
- 仅保留通用的 secret/export-target 清理和高亮备份逻辑。

在 `options-backup.js`：

- 删除“文件导入或 WebDAV pull”等过时注释；
- 调用两参数 `pbpBuildBackupSnapshot(raw, extra)`；
- 保持 `pbpPreflightBackupPayload` 的白名单行为不变，这是旧备份兼容的唯一机制。

不要新增显式 WebDAV import 过滤器；从 `SETTINGS_DEFAULTS` 移除字段后，现有白名单已经覆盖需求。

### Step 5：删除设置页 UI、脚本和样式

在 `options.html`：

- 保留手工导出/导入和“包含高亮与笔记”控件；
- 把 `backupIncludeHighlightsHint` 的英文 fallback 改为只描述手工备份；
- 删除从 WebDAV URL 到“停止使用 WebDAV”的完整区块；
- 删除 `<script defer src="webdav.js"></script>`；
- 检查相邻分隔线和 section 结构，避免留下空白区域。

在 `options.js`：

- 删除文件顶部全部 WebDAV UI guard、布局迁移和本地清除 helper；
- 删除初始化读取、fieldMap、folder radio；
- 删除表单预览、权限、状态、测试、推送、拉取、迁移、清除事件；
- 从 `collectSettingsFromForm()`、`savedState`、`saveAll()` 删除 WebDAV 字段和 device-local schedule 特例；
- 删除启动末尾的 `_pbpRenderWebdavTarget()` / `_pbpMaybeInspectWebdavMigration()`；
- 把 auto-save 互斥注释改为只列仍存在的 bulk flows。

在 `options.css` 删除 `.webdav-*` 手维护规则。不要运行 `sync-all.mjs`，因为没有 composer、pilot 或 `@generated:ui-themes` 变更。

### Step 6：删除实现文件和退役测试

- 删除 `webdav.js`。
- 删除 `tests/webdav-tests.html`，包括用户已授权丢弃的未提交修改。
- 从 `.qa-scan/run-test.mjs` 删除该 suite 注册。
- 从 `tests/settings-persist-tests.html` 删除所有已退役的 WebDAV UI、布局、凭据路由、导出和 pull 断言；保留并改写 E7b 的“旧字段忽略、其他字段恢复”用例。
- 把高亮清洗测试中的 `webdavPass` 样例换成仍存在的 secret 字段，避免用已退役功能承担通用测试语义。
- 从 `tests/ui-contract-tests.mjs` 删除读取已删除文件及全部正向 WebDAV 契约，保留 Step 1 的负向移除契约和清理迁移契约。
- 删除 `tests/background-active-tab-tests.html` 的旧自动推送 alarm 测试。
- 更新 `tests/md-convert-tests.html` 的过时注释。
- 更新 runner 结果数：
  - `tests/background-active-tab-tests.html`: `31`；
  - `tests/settings-persist-tests.html`: `263`；
  - 删除 `tests/webdav-tests.html` 项。

### Step 7：运行核心验证

Run:

```bash
node --check "background.js"
node --check "shared.js"
node --check "options.js"
node --check "options-backup.js"
node ".qa-scan/run-test.mjs" "tests/background-active-tab-tests.html"
node ".qa-scan/run-test.mjs" "tests/settings-persist-tests.html"
node "tests/ui-contract-tests.mjs"
test ! -e "webdav.js"
test ! -e "tests/webdav-tests.html"
git diff --check
```

Expected: PASS。

### Step 8：提交核心删除

先核对暂存区只包含本任务文件，再提交：

```bash
git add "background.js" "shared.js" "options-backup.js" \
  "options.html" "options.css" "options.js" \
  "tests/background-active-tab-tests.html" "tests/settings-persist-tests.html" \
  "tests/ui-contract-tests.mjs" "tests/md-convert-tests.html" \
  ".qa-scan/run-test.mjs" "webdav.js" "tests/webdav-tests.html"
git diff --cached --check
git commit -m "fix(webdav): remove unreliable settings backup"
```

---

## Task 2：删除九语种 WebDAV 文案

**Files:**

- Modify: `_locales/en/messages.json:912-1144`
- Modify: `_locales/zh_CN/messages.json:912-1144`
- Modify: `_locales/zh_HK/messages.json:912-1144`
- Modify: `_locales/zh_TW/messages.json:912-1144`
- Modify: `_locales/ja/messages.json:912-1144`
- Modify: `_locales/de/messages.json:912-1144`
- Modify: `_locales/fr/messages.json:912-1144`
- Modify: `_locales/pl/messages.json:912-1144`
- Modify: `_locales/ru/messages.json:912-1144`
- Modify: `tests/i18n-parity-tests.html:27-80`
- Modify: `.qa-scan/run-test.mjs:50-68`

### Step 1：用本地化契约替换退役功能契约

使用 `content-l10n`；README/普通 UI 文案按 functional 模式，隐私文案留到 Task 3 按 controlled 模式处理。当前 canonical fact 是：备份仅指用户主动导出的手工 JSON 文件。

在 `tests/i18n-parity-tests.html`：

- 删除 9 个 locale 的 WebDAV 正向存在检查、placeholder shape 检查和日语路径检查，共 11 个结果行；
- 新增 1 个跨 locale 负向检查，确认没有 key 以 `webdav` 开头；
- 将 runner 的 `i18n-parity` 结果数从 `209` 改为 `199`。

先运行：

```bash
node ".qa-scan/run-test.mjs" "tests/i18n-parity-tests.html"
```

Expected: FAIL，因为 9 个 locale 仍含 WebDAV key。

### Step 2：删除 locale key 并收紧备份提示

每个 locale：

- 删除全部 64 个 `webdav*` message；
- 保留 `backupIncludeHighlightsLabel`；
- 将 `backupIncludeHighlightsHint` 改为只说明备份会包含页面 URL、标题、选中文本、笔记、颜色和时间戳，API key 不会包含；
- 核对 `options.html` 中英文 fallback 已在 Task 1 同步更新。

目标语言必须各自自然重写，不做繁简机械转换；不得增减字段、默认状态或隐私承诺。

### Step 3：验证 JSON、结构和语言契约

Run:

```bash
for file in "_locales/en/messages.json" "_locales/zh_CN/messages.json" \
  "_locales/zh_HK/messages.json" "_locales/zh_TW/messages.json" \
  "_locales/ja/messages.json" "_locales/de/messages.json" \
  "_locales/fr/messages.json" "_locales/pl/messages.json" \
  "_locales/ru/messages.json"; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$file"
done
node ".qa-scan/run-test.mjs" "tests/i18n-parity-tests.html"
rg -n -i "webdav" "_locales" "options.html"
git diff --check
```

Expected: JSON 与测试 PASS；`rg` 无输出。

### Step 4：提交本地化清理

```bash
git add "_locales" "tests/i18n-parity-tests.html" ".qa-scan/run-test.mjs"
git diff --cached --check
git commit -m "chore(i18n): remove WebDAV messages"
```

---

## Task 3：同步 README、隐私披露和维护备忘

**Files:**

- Modify: `README.md:45`
- Modify: `README.zh-CN.md:45`
- Modify: `README.zh-HK.md:45`
- Modify: `README.zh-TW.md:45`
- Modify: `README.ja.md:45`
- Modify: `README.de.md:45`
- Modify: `README.fr.md:45`
- Modify: `README.pl.md:45`
- Modify: `README.ru.md:45`
- Modify: `docs/privacy.md:6-130`
- Modify: `docs/cws-assets/privacy-tab-copy.md:3-50`
- Modify: `CLAUDE.md:199-200`

### Step 1：更新 README ×9

使用 `content-l10n`，并按项目要求对英文/中文分别用 `humanizer` / `humanizer-zh` 自查。

九份 README 的同一 feature 行都只保留“将设置导出为文件”，不暗示自动备份、云端恢复或跨设备同步。保持既有 heading、列表顺序和每种语言的标点策略。

### Step 2：更新隐私政策与 CWS 文案

`docs/privacy.md` 使用 controlled 模式：

- 更新 `Last updated` 为 `2026-07-24`；
- 从摘要、设置同步、手工备份、CWS 数据类别删除 WebDAV 地址、用户名和密码；
- 从 Network requests 删除 WebDAV item，并把后续编号连续前移；
- 修正 Embed 图片段落对后续 item 的交叉引用；
- 从 HTTPS/loopback 规则中删除 WebDAV，但保留 AI/Webhook；
- 从 `alarms` 和 optional-host 权限用途删除 WebDAV；
- 从 Third-party services 删除 WebDAV server；
- 不删除 `alarms` 或 wildcard 声明，也不弱化其他网络出口披露。

`docs/cws-assets/privacy-tab-copy.md`：

- 更新同步日期与变更摘要；
- 从 related features、storage、alarms、host justification 删除 WebDAV；
- 保留其他 alarm 和 exact-origin 用途。

隐私文本属于高风险文案，只能声明为项目维护者审核后的草案，不声称法律审查或认证。

### Step 3：更新 `CLAUDE.md` 临时迁移备忘

- 从网络端点不变量删除 WebDAV。
- 删除 2026-07-23 的旧布局迁移备忘。
- 新增：

```md
- **WebDAV 移除清理临时代码（引入 2026-07-24；最早清理 2026-08-24）**：...
```

备忘必须明确：到期后先确认旧配置、密码、同步状态和 `webdav-push` alarm 已完成清理，再删除 `background.js` 清理函数、对应测试和本备忘；不得按日期自动删除。

### Step 4：运行文档与静态审计

Run:

```bash
node "scripts/docs-lint.mjs"
rg -n -i "webdav|webdav-push|_webdav" \
  "README.md" "README.zh-CN.md" "README.zh-HK.md" "README.zh-TW.md" \
  "README.ja.md" "README.de.md" "README.fr.md" "README.pl.md" "README.ru.md" \
  "docs/privacy.md" "docs/cws-assets/privacy-tab-copy.md"
git diff --check
```

Expected: docs lint PASS；用户文档扫描无输出。

检查 `docs/index.md`：当前不含 WebDAV，因此不做无意义修改。

### Step 5：提交文档同步

```bash
git add "README.md" "README.zh-CN.md" "README.zh-HK.md" "README.zh-TW.md" \
  "README.ja.md" "README.de.md" "README.fr.md" "README.pl.md" "README.ru.md" \
  "docs/privacy.md" "docs/cws-assets/privacy-tab-copy.md" "CLAUDE.md"
git diff --cached --check
git commit -m "docs(webdav): remove backup feature references"
```

---

## Task 4：全量验收

**Files:**

- Verify only unless a defect is found.

### Step 1：静态残留扫描

Run:

```bash
rg -n -i "webdav|webdav-push|_webdav" \
  --glob '!docs/superpowers/**' \
  --glob '!release/**' \
  --glob '!DESIGN-IS-2026-07-22/**' .
```

Expected: 只允许以下三类：

1. `background.js` 的临时清理迁移；
2. 清理迁移和旧备份兼容测试；
3. `CLAUDE.md` 的 2026-08-24 清理备忘。

任何 UI、网络请求、locale、README、隐私文档或退役实现残留都必须删除。

再运行：

```bash
git ls-files -- "webdav.js" "tests/webdav-tests.html"
rg -n "webdav\\.js" "background.js" "options.html" "manifest.json"
```

Expected: 均无输出。

### Step 2：运行完整验证

```bash
sh "scripts/verify.sh"
```

Expected: PASS，包括全部浏览器测试、JavaScript 语法、UI contract、README ×9、文档 lint，以及 13 套主题的 diff/token/cascade/override/hand-edit 检查。

### Step 3：核对提交和工作区

```bash
git status --short
git log -4 --oneline
```

Expected:

- 运行时、i18n、文档分别形成三笔 Conventional Commits；
- 不存在未提交的 WebDAV 代码或测试；
- 没有 theme factory 生成产物漂移；
- 计划文档是否提交按用户确认执行。

如全量验证暴露本计划范围内的小缺口，用最小修复处理并单独提交：

```bash
git commit -m "fix(webdav): complete removal audit"
```

不要 amend 已完成提交，不要 `--no-verify`。
