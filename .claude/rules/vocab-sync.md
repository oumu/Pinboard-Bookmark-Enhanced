---
paths:
  - "vocab-store.js"
  - "vocab-gdrive.js"
  - "options-vocab.js"
  - "library-vocab.js"
  - "anki-connect.js"
  - "eudic-sync.js"
---

# 生词库与 Google Drive 同步深水区

## 生词同步不变量

- `vocab-store.js` 是 `pbp-vocab` IDB（schema v2）的唯一写入口。每次本地 mutation 在同一 IDB transaction 中核验 owner，并原子更新 word 或 tombstone、版本向量和 coalesced outbox；删除保留 tombstone，不自动 GC。
- 远端批次用 owner hash 隔离，vector dominance 与稳定 dot 决定收敛；并发删除遇到新修改时 live 胜出并留下持久 notice，用户再次删除后 tombstone 才支配。
- 每个网络 await 和 IDB commit 前都重核验 Pinboard owner 与 Drive `permissionId`，变化时不得推进游标或上传旧账号数据。

## 错误码与指引契约

`auth`（Google 令牌失败）、`pinboard_auth`（无 Pinboard 账号，发生在任何 Google 调用之前，不写 preflight）、`not_connected`（本机未连接，**不渲染成错误**）、`permission`、`corrupt`（远端批次不合法）、`local_store`（本机 IndexedDB 写失败，与 `corrupt` 严格分开）、`entry_too_large`、`network`、`remote`。`applyRemotePage` 只返回 `invalid_remote_page`，必须显式认领。**每个 blocked 状态都要点名一个当前屏幕上可见的按钮**：已连接指向「断开此设备」，未连接指向「连接 Google Drive」，重连救不了的指向「立即同步」（`force` 是唯一能清除 blocked 的入口）。仍在退避的状态只显示下次重试时间，不给指令。按钮名称逐字复用该 locale 已发布的按钮文案，不另造叫法。

## Google Drive OAuth 构建契约

源码开发公钥、开发扩展 ID、开发 OAuth client 和生产 OAuth client 均使用已注册的真实公开值；manifest 声明可选 `identity` 与唯一 scope `drive.appdata`。release 必须同时替换公钥和 OAuth client，并核验 ZIP 的 CWS ID/client。两个真实 client 对同一 Google 账号 `appDataFolder` 的双向可见性须发布前实测；若不互通，开发版使用独立测试数据，生产双设备验收改用同一 CWS build。严禁占位 client ID 或 client secret。

## Drive 权限与断开语义

只有「连接 Google Drive」这一直接用户动作可申请 `identity` 和精确 Google API origin；后台同步只做 `permissions.contains`，SW 启动不得弹 OAuth。断开本设备时移除 token cache 与可选权限，但保留本地生词、outbox、tombstone 和远端 `appDataFolder` 文件。Drive 中保存的是当前 owner 生词的明文应用私有副本，不是端到端加密。`getAuthToken` 硬依赖已登录 Chrome。

## 生词 owner、选择与刷新不变量（UI 层）

- 生词列表、筛选、选择、单删、批删与加组都限定当前非秘密 Pinboard owner；账号切换先清空旧 owner 的可见行，再读取新 owner，失败时保持 fail-closed。
- UI 选择只影响批量删除和添加分组；TSV 与 Anki 始终处理当前 owner 的全部生词，欧路词典始终从当前 owner 全量中只发送 `en/fr/de/es`。
- 每次 mutation 在用户确认时取得刷新代际，旧 IDB 快照不得晚写覆盖新状态；最新 mutation 即使失败也要重读真实 IDB。事务内逐条 owner 校验不得移到 UI 层或省略。

## 测试夹具（本子系统的原始事故现场）

`driveFile()` 曾用写入侧 `pbpVocabDriveMetadata()` 造「远端文件」（硬编码创建期别名 `parents:["appDataFolder"]`，而 Drive 读取实际返回不透明 folder ID）——60 条断言全绿、一碰真机就 corrupt，把同一回归注入 runner 后套件**仍然全绿**。通用铁律（服务端形状手写、`=== undefined` 判定等）见根文件《测试与夹具》。
