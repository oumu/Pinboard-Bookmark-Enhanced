# WebDAV 功能完整移除设计

日期：2026-07-24
状态：用户已确认

## 1. 背景与目标

现有 WebDAV 设置备份在真实使用中仍造成较高的配置、同步与冲突理解成本。此次不再继续迭代该功能，而是从扩展中完整移除 WebDAV 的运行能力和用户入口。

目标：

1. 删除 WebDAV 的上传、下载、自动推送、路径发现、迁移和冲突处理能力。
2. 删除设置页入口、运行时加载、后台 alarm、配置字段、凭据路由和用户可见文案。
3. 自动清理升级用户留存的 WebDAV 配置、密码、本地状态和 alarm。
4. 保持手工设置导出/导入与 Chrome 设置同步等其他备份机制正常工作。
5. 保留 `docs/superpowers/` 中既有研究、审计和施工资料，作为历史记录。

## 2. 删除范围

### 2.1 运行时

- 删除根目录 `webdav.js`。
- 从 `options.html` 和 `background.js` 删除 `webdav.js` 加载入口。
- 删除 `options.html` 中全部 WebDAV 设置 DOM。
- 删除 `options.css` 中 WebDAV 专用样式。
- 删除 `options.js` 中 WebDAV 表单加载、保存、验证、权限申请、测试、推送、拉取、冲突确认、迁移和清除逻辑。
- 删除 `background.js` 中 WebDAV 设置预热、自动推送周期、`webdav-push` alarm、storage change 接线和消息状态。

### 2.2 设置、凭据与备份边界

- 从 `SETTINGS_DEFAULTS` 删除：
  - `webdavUrl`
  - `webdavUser`
  - `webdavPass`
  - `webdavFolderMode`
  - `webdavRelativePath`
  - `webdavLayoutVersion`
- 从 `API_KEY_FIELDS` 删除 `webdavPass`。
- 删除 WebDAV payload、pull 过滤和传输字段专用辅助逻辑。
- 新的手工设置导出不再包含 WebDAV 字段。
- 导入旧手工备份时，仍按现有白名单应用已知字段；旧 WebDAV 字段作为未知字段忽略，不拒绝整份备份。
- Chrome 设置同步继续处理其他普通设置和凭据，不再读取或写入 WebDAV 字段。

### 2.3 用户界面与本地化

- 删除九个 locale 中全部 WebDAV 消息。
- 删除设置页 WebDAV 按钮、提示、状态、迁移卡和清除入口。
- 不保留隐藏字段、占位 UI 或“功能已移除”提示。
- README ×9 的“设置备份”只保留手工文件导出，不再描述 WebDAV。

### 2.4 测试

- 删除 `tests/webdav-tests.html` 及 `.qa-scan/run-test.mjs` 中的注册。
- 用户已确认：`tests/webdav-tests.html` 当前未提交修改随文件一并删除，不另行备份。
- 从共享测试中删除 WebDAV 专属断言，包括 settings persistence、background、i18n、UI contract 和 Markdown backup 相关检查。
- 保留并调整其他备份机制的测试，确保 Chrome Sync、手工导出/导入及高亮备份不受影响。

## 3. 临时升级清理迁移

功能代码删除后保留一段最小、无网络的临时清理迁移。

### 3.1 触发与生命周期

- Service Worker 启动时执行。
- 使用 `chrome.storage.session` 保存本次浏览器会话的完成标记，避免同一会话中每次 MV3 Worker 重启都重复清理。
- 浏览器重启后重新执行一次幂等检查，以清理可能由尚未升级的其他设备重新同步回来的旧字段。
- 只有 alarm、local 和 sync 清理均成功后才写 session 标记。
- 任一步失败均不写标记，下次 Service Worker 启动重试。

### 3.2 清理目标

从 `chrome.storage.local` 和 `chrome.storage.sync` 删除：

- `webdavUrl`
- `webdavUser`
- `webdavPass`
- `webdavFolderMode`
- `webdavRelativePath`
- `webdavLayoutVersion`

仅从 `chrome.storage.local` 删除：

- `webdavAutoPush`
- `_webdavAutoPushLocalV1`
- `_webdavSyncState`
- `_webdavEtagState`
- `webdavLastPush`

同时清除 `webdav-push` alarm。

### 3.3 安全边界

- 清理迁移不得调用 `fetch`。
- 不申请、查询或撤销 host 权限。
- 不访问、修改或删除任何远端备份、collection 或 `location.json`。
- 不撤销已授权 origin，因为同一 origin 可能同时供 AI、Webhook 或其他功能使用。
- 错误日志不得包含 URL、用户名、密码或 storage 值。

## 4. Manifest 与共用权限

以下 manifest 能力不能因 WebDAV 移除而删除：

- `alarms`：仍用于 Service Worker 预热、离线队列、缓存、未读计数和标签预热。
- `optional_host_permissions: *://*/*`：仍是 AI/Jina/Wayback/Gist/Webhook、Batch、图片修复、词典、AnkiConnect 和欧路词典等精确 origin 授权的声明上限。

移除 WebDAV 后需要更新隐私文档，明确这些权限剩余的实际用途。

## 5. 文档更新

- README ×9：设置备份只描述文件导出。
- `docs/privacy.md`：删除 WebDAV 的自动请求、凭据、网络端点、第三方、alarm 和权限说明。
- `docs/cws-assets/privacy-tab-copy.md`：同步删除 WebDAV 披露。
- `CLAUDE.md`：
  - 从网络端点不变量中删除 WebDAV。
  - 删除旧布局迁移备忘。
  - 新增临时清理迁移备忘：
    - WebDAV 功能移除日期：2026-07-24；
    - 清理迁移最早删除日期：2026-08-24；
    - 删除前确认升级用户的旧配置、密码、同步状态和 alarm 已完成清理；
    - 删除时同步删除清理测试和该备忘。
- `docs/superpowers/` 中既有 WebDAV 研究、审计、设计和计划保持不变。

## 6. 错误处理

- storage 或 alarm 清理失败时，保留 session 未完成状态并在下次启动重试。
- 单个存储区域失败不能被吞掉后误记为成功。
- 清理失败不影响扩展其他功能初始化。
- 仅输出不含用户数据的固定错误标签和错误对象类型。
- 旧手工备份含 WebDAV 字段时不显示错误；未知字段由白名单自然忽略。

## 7. 测试与验收

### 7.1 清理迁移

- local 和 sync 中的全部旧字段均被删除。
- `webdav-push` alarm 被清除。
- 全部成功后写入 session 完成标记。
- local、sync 或 alarm 任一步失败时不写完成标记。
- 同一浏览器会话重复启动时不重复清理。
- 清理路径没有 `fetch`、`permissions.request`、`permissions.remove` 或远端 URL。

### 7.2 备份兼容

- 新手工导出不含 WebDAV 字段。
- 导入旧备份时忽略 WebDAV 字段，其他设置仍正确应用。
- WebDAV 字段不会进入 Chrome Sync 的新设置快照。
- 高亮与笔记的手工备份行为保持不变。

### 7.3 静态与 UI

- 除临时清理迁移、`CLAUDE.md` 清理备忘和保留的 `docs/superpowers/` 历史资料外，运行时、UI、locale 和用户文档中不得出现 WebDAV。
- `webdav.js`、WebDAV 设置 DOM、专用 CSS 和测试文件不存在。
- release ZIP 不包含 WebDAV 运行时文件。
- 设置页不存在空分隔线、无标签控件或失效的 `data-i18n` 引用。

### 7.4 全量验证

运行：

```bash
sh scripts/verify.sh
```

必须通过：

- 全部剩余浏览器测试；
- JavaScript 语法检查；
- UI contract；
- README ×9 文档镜像检查；
- 13 套主题的生成完整性、token coverage、cascade、override 和 hand-edit 检查。

## 8. 验收标准

1. 扩展中不再存在可触发的 WebDAV UI、网络请求或后台任务。
2. 新安装用户不会创建任何 WebDAV 配置或状态。
3. 升级用户的旧 WebDAV 配置、密码、状态和 alarm 会被本地清理迁移移除。
4. 远端 WebDAV 文件保持不变。
5. 旧手工备份仍可导入，WebDAV 字段被忽略。
6. Chrome Sync、手工设置导出/导入及其他网络功能不受影响。
7. 用户文档与隐私披露不再宣称支持 WebDAV。
8. 临时清理迁移在 2026-08-24 之前不得删除；到期后必须另行验证和提交。
