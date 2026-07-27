# Google Drive 生词同步与备份加固设计

日期：2026-07-24
状态：设计与实现已完成复核；真实 Google Drive 验收待执行

实施进度：

- 已完成存储层抽取、确定性收敛、mutation 元数据、不可变 Drive batch、Drive 客户端、
  同步编排、设置页状态、手工备份 schema v3，以及 Chrome Sync 大字段与 local
  fallback 加固。
- 已配置并核验固定开发公钥、开发扩展 ID、开发 OAuth client 和生产 OAuth
  client；源码与 Release ZIP 使用各自注册的身份。
- 两个真实 OAuth client 对同一 Google 账号的 `appDataFolder` 双向可见性测试尚未
  运行。这不是“已共享”或“不共享”的结论。
- Google Drive runtime、设置页和 release 集成边界已激活；发布前仍须完成真机
  OAuth、双向同步和账号切换验收。

## 1. 背景

项目目前有三类持久化数据：

1. 普通设置与可选凭据，经 `chrome.storage.local` / `chrome.storage.sync`
   分层保存；
2. 高亮、笔记、生词、缓存和任务状态等本地数据；
3. 用户主动导出的 JSON、TSV 等离线文件。

WebDAV 设置备份因服务端差异、路径语义、条件写兼容和多设备冲突长期造成不可靠
体验，已于 2026-07-24 从运行时完整移除。Chrome Sync 可以同步体积较小的设置，
但单项约 8 KiB、总量约 100 KiB，不适合保存无数量上限、带上下文摘录的生词库。
手工备份能完成迁移和灾备，却不能自动跨设备收敛。

本设计只为生词增加 Google Drive 同步，并同时补齐现有设置同步与手工备份中已经
识别的可靠性缺口。Google Drive 不接管设置、凭据、高亮、缓存或任务队列。

## 2. 调研依据

### 2.1 Google Drive 与 Chrome 官方能力

- Google Drive `appDataFolder` 是按用户、按应用隔离的隐藏空间，其他 Drive
  应用和普通 Drive UI 不能访问；所需 `drive.appdata` 属于非敏感 scope：
  <https://developers.google.com/workspace/drive/api/guides/appdata>
- `changes.list` 可限定 `spaces=appDataFolder`；`nextPageToken` 和
  `newStartPageToken` 不过期：
  <https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list>
- `files.generateIds` 支持 `space=appDataFolder`。使用预生成 ID 创建文件后，
  对同一 ID 的重试返回 `409`，不会重复创建：
  <https://developers.google.com/workspace/drive/api/guides/create-file>
- 小于等于 5 MiB 的文件可用 multipart upload 一次提交元数据和内容：
  <https://developers.google.com/workspace/drive/api/guides/manage-uploads>
- `about.get` 在 `drive.appdata` scope 下可返回 Drive 用户的
  `permissionId`、邮箱和显示名：
  <https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get>
- Drive 对网络错误、`429` 和 `5xx` 建议使用带抖动的指数退避：
  <https://developers.google.com/workspace/drive/api/guides/handle-errors>
- Chrome `identity.getAuthToken()` 使用 manifest 中的 OAuth client 和 scope，
  token 由浏览器缓存并处理过期；OAuth client 与扩展 ID 绑定：
  <https://developer.chrome.com/docs/extensions/reference/api/identity>
  <https://developer.chrome.com/docs/extensions/how-to/integrate/oauth>

### 2.2 开源实现的可借鉴点与限制

#### Reddit Enhancement Suite

RES 在 `appDataFolder` 中维护一个设置 JSON，适合作为单文件备份参考，但没有
多设备并发合并协议：

<https://github.com/honestbleeps/Reddit-Enhancement-Suite/blob/a12cc4e7c045bfb4dc1120687abd6bd0975ff9ba/lib/modules/backupAndRestore/providers/GoogleDrive.js>

#### Tab Session Manager

Tab Session Manager 为每个 session 建文件，并用 `lastEditedTime` 决定上传或下载。
其同步锁和延迟触发依赖内存变量与 `setTimeout`，且时间戳覆盖会受设备时钟影响，
不能用于本项目的 MV3 生词同步：

<https://github.com/sienori/Tab-Session-Manager/blob/113b272d6b5a2159f50181d1771163c20381ad6c/src/background/cloudSync.js>

#### Freed

Freed 使用 Automerge 单文件、下载—合并—条件覆盖，但该项目仍记录了自写回读、
无变化重复上传和 ETag 缺失时静默失去乐观锁等问题：

- <https://github.com/freed-project/freed/blob/dev/packages/sync/src/cloud/gdrive.ts>
- <https://github.com/freed-project/freed/blob/dev/docs/stability-tasks/P1-03-gdrive-self-write-filter.md>

本项目保持零依赖，不引入 Automerge、Yjs 或其他 CRDT 库；也不把 Google Drive
未明确写入 v3 REST 契约的 ETag 行为作为同步正确性的根基。

## 3. 目标

1. 当前 Pinboard 账号的全部生词可通过用户自己的 Google Drive 自动跨设备同步。
2. 生词数量不受 Chrome Sync 配额或应用级条数上限限制。
3. 离线、多设备并发、Service Worker 重启和响应丢失不得造成静默覆盖或重复数据。
4. 删除、分组、上下文与词典字段最终收敛；并发删除不得静默抹掉另一设备的新修改。
5. Chrome 设置同步、Google Drive 生词同步和手工备份职责互斥，不相互争夺同一份
   自动同步数据。
6. Google OAuth token、同步游标、设备 ID、outbox 和 tombstone 不进入 Chrome
   Sync 或手工备份。
7. CWS 版与本地开发版仍可同时安装，并能分别使用正确的 OAuth client。
8. 设置页持续显示实际同步健康状态，不能只在短暂 toast 或 hover 中暴露失败。

## 4. 非目标

- 不恢复 WebDAV。
- 不支持 S3、Dropbox、OneDrive、iCloud 或通用 provider 接口。
- 不同步设置、API key、高亮、笔记、翻译缓存、离线词典包或离线队列到 Drive。
- 不实现端到端加密、用户自定义 Drive 文件夹或可见文件。
- 不实现 Google Drive push webhook；该能力要求公开 HTTPS 接收服务。
- 不实现远端日志压缩、自动垃圾回收或历史版本浏览。
- 不新增框架、构建系统、第三方同步依赖或后台服务。

## 5. 三套持久化机制的职责

| 数据 | Chrome Sync | Google Drive | 手工 JSON |
|---|---|---|---|
| 普通设置 | 用户按设备启用 | 否 | 是 |
| API key / token | 受 `syncApiKeys` 控制 | 否 | 否 |
| 当前账号生词 | 否 | 用户逐设备连接后启用 | 可选包含 |
| 高亮 / 笔记 | 否 | 否 | 沿用现有可选包含 |
| 自定义主题 / overlay | 现有 chunk / local fallback | 否 | 是 |
| 同步游标 / outbox / tombstone | 否 | 作为协议内容或仅本地状态 | 否 |
| 缓存 / 队列 | 否 | 否 | 否 |

规则：

1. `optSyncEnabled` 与 Google Drive 连接状态都按设备保存在 local，互不联动。
2. 开启或关闭 Chrome 设置同步不会启用、停用或重置 Google Drive 生词同步。
3. 手工导入设置后，普通设置按现有路由写入 local 或 sync；生词导入走生词事务，
   进入 Google Drive outbox。
4. 不存在全局“最近一次同步”状态。设置页必须分别显示 Chrome 设置同步和
   Google Drive 生词同步的健康状态。

## 6. 文件与组件边界

### 6.1 `vocab-store.js`

从 `md-dict.js` 抽出当前 `pbp-vocab` IndexedDB 存储层，并集中负责：

- DB 打开、升级和 `versionchange` 连接关闭；
- 当前 owner 的查询；
- 单条保存、单删、批删、批量加组；
- 本地版本向量、tombstone 和 outbox；
- 远端事件校验、合并和原子应用；
- 手工备份导入。

所有生词 mutation 必须通过这里的 store-level primitive。`md-dict.js`、
`options-vocab.js` 和后续同步代码不得直接写 `words` store。

### 6.2 `vocab-gdrive.js`

仅由 Service Worker 加载，负责：

- Chrome Identity token 获取与失效重试；
- Drive 账号识别；
- `appDataFolder` 扫描、Changes 游标、批次下载和上传；
- 指数退避、同步状态与 alarm 调度；
- 接收 options / md-preview 发来的同步消息。

它只能通过 `vocab-store.js` 暴露的边界读写本地生词状态，不直接拼装 UI。

### 6.3 现有调用者

- `md-dict.js`：保留词典与“存入生词”交互，改用 `vocab-store.js`。
- `options-vocab.js`：保留查询、筛选、排序、批删、加组、TSV/Anki/欧路，
  并增加 Drive 状态渲染和消息调用。
- `background.js`：顶层 `importScripts` 新模块；顶层同步注册 alarm、message
  和 storage listener。
- `options-backup.js`：升级 schema、导入预览和可选生词备份。

不创建单实现 provider factory。

## 7. IndexedDB 数据模型

`pbp-vocab` 从 version 1 升到 version 2。

### 7.1 `words` store

保持现有 `keyPath: "id"`、`owner` 和 `updatedAt` 索引。运行时记录格式保持兼容：

```js
{
  id,
  owner,
  term,
  lemma,
  language,
  gloss,
  ipa,
  sourceUrl,
  license,
  contexts,
  groups,
  note,
  status,
  createdAt,
  updatedAt
}
```

### 7.2 `sync` store

新增一个 `keyPath: "key"` 的通用同步 store，避免为少量状态建立多个 object store。
键空间如下：

```text
meta
account:<drivePermissionId>:<ownerHash>
record:<owner>:<recordKey>
outbox:<owner>:<recordKey>
batch:<drivePermissionId>:<ownerHash>:<driveFileId>
notice:<owner>:<recordKey>
```

关键记录：

```js
// meta
{
  key: "meta",
  deviceId,        // crypto.randomUUID()
  counter          // 本设备全局递增整数
}

// record metadata
{
  key,
  owner,
  recordKey,       // "<primary-language>|<normalized-term>"
  vector,          // { [deviceId]: positiveInteger }
  dot,             // { deviceId, counter }
  deleted
}

// coalesced outbox
{
  key,
  owner,
  recordKey,
  event            // 该词条当前完整状态或 tombstone
}

// frozen upload
{
  key,
  drivePermissionId,
  ownerHash,
  driveFileId,
  body,             // 已冻结的精确 JSON 文本
  createdAt
}
```

约束：

1. `deviceId`、counter、游标、错误、pending batch 全部只保存在本地 IDB。
2. 单条 mutation 在同一个 readwrite transaction 中完成：
   - 重新读取并核验 owner；
   - 更新或删除 `words`；
   - counter 加一；
   - 更新 record metadata；
   - 按 recordKey 覆盖 outbox。
3. 批量 mutation 仍为全有或全无；任一记录缺失或 owner 不匹配就 abort。
4. 删除 `words` 后保留 record tombstone，不做自动 tombstone GC。
5. IndexedDB 升级失败或被其他页面阻塞时，UI 报错并保持旧数据，不自动重建 DB。

## 8. 远端身份与隐私

### 8.1 owner

远端文件不用明文 Pinboard 用户名：

```text
ownerHash = hex(SHA-256(current owner scope))
```

远端 `recordKey` 只包含语言和规范化词形，不包含本地 owner 前缀。本地应用时根据
已经重新核验的当前 owner 重建 `id` 和 `owner`。

### 8.2 Google Drive 账号

每次同步取得 token 后调用：

```http
GET https://www.googleapis.com/drive/v3/about
    ?fields=user(permissionId,emailAddress,displayName)
```

- `permissionId` 是本地 Drive 账号命名空间；
- email / displayName 仅用于设置页显示；
- Drive 账号信息只存 local；
- 若 permissionId 与当前游标绑定账号不同，必须切换到该账号自己的同步状态，
  不得复用旧游标。

Google 账号与 Pinboard owner 组成完整命名空间：

```text
drivePermissionId + ownerHash
```

### 8.3 远端明文披露

`appDataFolder` 对 Drive UI 和其他应用隐藏，但不是端到端加密。同步内容可能包含：

- 词语、释义、IPA；
- 分组和 note；
- 文章标题、来源 URL 和上下文摘录；
- 来源许可信息和时间戳。

连接前必须在设置页直接说明这些内容会以应用私有数据形式保存在用户的 Google
Drive 中。不得把提示藏在 hover。

## 9. 远端批次协议

### 9.1 Drive 文件元数据

每个文件都是不可变 JSON batch：

```js
{
  id: "<driveFileId>",
  name: "pbp-vocab-<driveFileId>.json",
  parents: ["appDataFolder"],
  mimeType: "application/json",
  appProperties: {
    pbpKind: "vocab-batch",
    schema: "1",
    owner: ownerHash,
    device: deviceId
  }
}
```

`id` 必须使用 `files.generateIds` 预生成的值，并随 `files.create` metadata
提交；文件名仅用于识别，不承担唯一性。只有 create 请求实际携带该 `id`，网络结果
不确定时以相同 ID 重试并将匹配的 `409 Conflict` 视为已成功才成立。

`appProperties` 只用于筛选和自写识别，不保存 token、邮箱或 Pinboard 用户名。
字段数量和每项 UTF-8 长度必须低于 Drive 限制。

### 9.2 batch body

```json
{
  "schema": 1,
  "ownerHash": "<sha256-hex>",
  "deviceId": "<uuid>",
  "createdAt": 0,
  "entries": [
    {
      "recordKey": "fr|défense",
      "vector": { "<device-id>": 4 },
      "dot": { "deviceId": "<device-id>", "counter": 4 },
      "deleted": false,
      "value": {
        "term": "Défense",
        "lemma": "défense",
        "language": "fr",
        "gloss": "...",
        "ipa": "...",
        "sourceUrl": "...",
        "license": "...",
        "contexts": [],
        "groups": [],
        "note": "",
        "status": "new",
        "createdAt": 0,
        "updatedAt": 0
      }
    }
  ]
}
```

`deleted=true` 时不得携带 `value`。

### 9.3 大小策略

- 用 `TextEncoder` 按 UTF-8 字节计算；
- 每个 multipart batch 上限 4 MiB，为 Drive 的 5 MiB 建议线保留协议头余量；
- 首次同步按 entry 边界拆分多个 batch；
- 不拆分单个 entry；
- 单条 entry 超过 4 MiB 时保留本地/outbox，显示永久可见的可操作错误，不截断
  用户数据。

这是首版的明确工程上限。只有真实数据出现单条超限后，才增加 resumable upload。

### 9.4 安全重试

上传流程：

1. 调用 `files.generateIds?count=1&space=appDataFolder`；
2. 在 IDB transaction 中冻结不超过 4 MiB 的 outbox 快照：
   - 写入带 `driveFileId` 和精确 body 的 pending batch；
   - 只删除本次读取到的 outbox 版本；
   - transaction 之后发生的新 mutation 会重新创建该 recordKey 的 outbox；
3. 使用预生成 ID 和 multipart upload 创建文件；
4. `200/201`：删除本地 pending batch；
5. 网络失败或 `5xx`：保留 batch，按同一 ID 重试；
6. `409`：GET 该文件元数据，核验 `pbpKind/schema/owner/device`；匹配则视为
   上一次创建已成功，否则进入不可自动恢复错误；
7. 其他 `4xx`：保留 batch，分类提示，不生成新文件 ID。

不依赖文件名唯一性。Drive 允许同名文件，唯一身份是预生成的 file ID。

## 10. 版本与合并协议

### 10.1 本地 mutation

每次 mutation：

1. 原子读取 `meta.counter`；
2. counter 加一；
3. 当前记录 vector 的本设备分量更新为 counter；
4. dot 设为 `{ deviceId, counter }`；
5. 写入完整记录事件或 tombstone；
6. 覆盖同一 recordKey 的 outbox。

多个尚未上传的连续修改只保留最终完整状态，避免为每次点击建立远端文件。

### 10.2 vector 比较

对本地 `L` 和远端 `R`：

- `R` 每个分量均不小于 `L`，且至少一个更大：远端支配，应用 `R`；
- `L` 支配 `R`：忽略远端；
- 完全相等：幂等跳过；
- 两者互不支配：并发合并。

设备时间只用于展示，不参与正确性。

### 10.3 并发合并

#### live 与 live

- `term`、`language`、recordKey 必须一致，否则拒绝整个 entry；
- `contexts` 使用现有 `articleUrl + quote` 去重合并；
- `groups` 规范化后取并集；
- `createdAt` 取最小值，`updatedAt` 取最大值，仅供显示；
- `note`：一边为空时保留非空；双方均非空且不同时使用稳定 winner；
- `lemma`、`gloss`、`ipa`、`status` 使用稳定 winner；
- `sourceUrl` 与 `license` 必须作为一个归属对从同一 winner 取得；
- winner 由 dot 的稳定总序确定，不使用墙上时钟；
- 新 vector 为逐分量最大值；
- 生成合并后的完整 live outbox，使其他设备最终收到收敛状态。

当前 UI 不编辑 `note/status`。若以后增加用户手工编辑释义或 note，必须在该功能设计
中重新评估字段级冲突，不能继续把自动词典字段规则无条件扩展到用户正文。

#### tombstone 与 tombstone

保留 tombstone，vector 取并集；必要时进入 outbox。

#### tombstone 与 live

并发时 live 胜出，避免另一设备的新上下文被静默删除：

- 保留 live；
- vector 取并集；
- 写入 outbox；
- 写一条 `notice:<owner>:<recordKey>`。

设置页显示：

> 另一台设备在删除期间更新了这个词，已保留。若仍要删除，请再次删除。

用户再次删除时，新 tombstone 的 vector 已包含双方历史，因此会支配旧 live 并在
所有设备删除。

### 10.4 相等 vector、内容不同

协议上相等 vector 必须表示相同状态。若内容不同，视为损坏或不兼容数据：

- 不自动选择；
- 不推进该页游标；
- 保留本地数据；
- 显示同步错误和 batch/file ID 的非敏感短标识；
- 不在日志中输出词条内容。

## 11. 首次连接与增量同步

### 11.1 首次连接

1. 用户点击连接，在同一手势中请求可选 `identity` 和精确 Google API origin 权限。
2. `getAuthToken({ interactive: true })`。
3. `about.get` 取得 Drive permissionId，并重新读取当前 Pinboard owner。
4. 为当前 owner 的无 sync metadata 旧词条分批建立初始 vector/outbox。每批最多
   100 条并在同一 transaction 内原子提交；中断后下次从仍无 metadata 的记录继续，
   不需要额外迁移游标。这是保守的数据保护策略：已有本地词条不会因远端 tombstone
   或旧副本被静默删除。
5. 调用 `changes.getStartPageToken`，保存临时起点 `T`，但暂不提交为稳定游标。
6. `files.list` 分页扫描：
   - `spaces=appDataFolder`；
   - `trashed=false`；
   - 查询当前 `pbpKind/schema/ownerHash`；
   - 每页下载、校验并原子应用；
7. 从 `T` 调用 `changes.list`，补齐 files.list 期间新建的批次；
8. 抵达末尾后保存 `newStartPageToken`；
9. 上传 pending batch 和合并后的 outbox；
10. 重新核验 Drive permissionId 与 Pinboard owner 后提交成功状态。

这套“先取 T、再全量列表、最后消费 T 之后变化”的顺序避免首次扫描竞态。

### 11.2 增量同步

1. 非交互取得 token；
2. `about.get` 核验账号；
3. 从稳定游标调用 `changes.list`，`pageSize` 不超过 1000；
4. 只处理当前 appProperties 协议和 ownerHash；
5. 当前 device 创建的变化在增量路径可按 appProperties 跳过下载；完整 bootstrap
   不跳过，以保留灾难恢复能力；
6. 每页全部 entry 在 IDB 成功提交后，才保存 `nextPageToken`；
7. 到末尾才保存 `newStartPageToken`；
8. 冻结并上传 outbox；
9. 重新核验 owner 和 Drive 账号后更新健康状态。

重复处理一页依靠 vector 幂等。游标绝不能在 IDB transaction 完成前前移。

### 11.3 远端文件被删除

`appDataFolder` 文件不能进入垃圾桶，但用户可以在 Google 账号中删除应用数据。
Changes API 出现 `removed` 时：

- 不把远端批次删除解释为本地生词删除；
- 当前 owner 的本地词条和 tombstone 保持不变；
- 标记远端历史可能不完整；
- 完成本轮剩余下载后，生成当前全部 live + tombstone 的完整 checkpoint batches；
- 不删除旧 batch。

任意 appData removal 都触发当前 owner checkpoint。当前扩展没有其他 Drive 数据，
所以首版不维护一份无限增长的远端 file-ID 索引。

## 12. MV3 调度

### 12.1 触发

- 生词 mutation transaction 完成后发送 `PBP_VOCAB_DIRTY`；
- Service Worker 建立/合并一个最早 30 秒后的单次 alarm；
- 连接状态下维持 15 分钟周期 alarm；
- 打开生词设置页时请求一次非交互同步；
- “立即同步”清除退避并立即运行；
- Service Worker 启动时只做非交互恢复，不弹 OAuth。

不用常驻 5 秒轮询，不用 `setTimeout` 保证任务执行。

### 12.2 单设备串行

Service Worker 内用现有 recovering promise tail 模式串行 sync runner。Chrome 在同一
扩展配置中只有一个 Service Worker 实例；outbox 和 pending batch 已持久化，因此
不引入跨上下文 Web Lock。

任何页面都不得直接调用 Drive API或自行运行同步循环。

### 12.3 owner 不变量

以下边界都重新读取并核验当前 Pinboard owner：

- runner 开始；
- Drive 账号确认后；
- 下载 batch 应用前；
- pending batch 上传前；
- 任一网络 await 之后准备提交状态时。

owner 变化立即停止旧 owner 路径，不推进游标、不上传、不把旧 owner 数据渲染到新
账号 UI。已冻结的旧 owner pending batch保留，切回该 owner 后继续。

## 13. OAuth、权限和双扩展 ID

### 13.1 最小权限

Manifest 声明可选 `identity`，并在 `oauth2` 中写入对应 build 已核验的真实 Chrome
Extension OAuth client ID。scope 只能是
`https://www.googleapis.com/auth/drive.appdata`。

`https://www.googleapis.com/*` 已被当前通用 `optional_host_permissions` 声明上限
覆盖，但只能在用户点击“连接 Google Drive”时请求该精确 origin。后台路径只做
`permissions.contains`，不得申请权限。

不申请 `identity.email`。连接账号显示来自 Drive `about.get`。

### 13.2 token

- token 只由 `chrome.identity` 获取和缓存；
- 不写 `chrome.storage`、IndexedDB、日志、错误对象或备份；
- `401` 时 `removeCachedAuthToken` 后非交互重取并重试一次；
- 后台非交互取 token 失败时标记“需要重新连接”，不得弹窗；
- “断开本设备”先移除当前 token cache，再移除可选 identity / host permission；
- 断开不删除本地生词、不删除远端文件、不清空 tombstone；
- 首版不实现“删除所有云端数据”，避免其他仍在线设备立即重建数据造成误导。

### 13.3 开发版与 CWS 版

当前发布 ID 方案是：

- 源码 `manifest.json` 写入公开开发公钥和开发 OAuth client，固定为开发 ID
  `feoognahlmfmbllpmgailahcnjppiegb`；
- `release.sh` 校验源码开发 ID/client 后，只在 Release ZIP 中替换为 CWS 公钥和
  生产 OAuth client，使 ZIP ID 固定为
  `pnjndmjhljjbdlbejeenkepdalokfooh`；
- smoke test 断言源码开发 ID/client、ZIP CWS ID/client、唯一
  `drive.appdata` scope 和可用的 Connect 操作。

OAuth client ID 和 manifest 公钥不是 secret，可以进入仓库；不得提交任何 client
secret。

### 13.4 发布前真实门禁

官方资料没有明确承诺“同一 Google Cloud 项目的两个 Chrome OAuth client 一定共享
同一个 appDataFolder 数据命名空间”。发布前必须用真实开发/生产 client 做：

1. 开发版创建一个测试 batch；
2. CWS-ID 测试构建使用同一 Google 账号列出并下载；
3. 反向再测一次；
4. 核验 Changes API 两边都能观察变化。

实际门禁结果（2026-07-27）：开发/生产注册和两个 build/client 组合已具备，真实
Google 账号测试尚未运行。不得从未运行状态推断共享或不共享。

若不共享：

- 生产功能仍使用 CWS client；
- 开发版只连接独立的测试 appData，不宣称能读取生产同步数据；
- 不改用宽泛 Drive scope，不通过可见文件夹绕过隔离；
- 集成测试改用两个相同构建 ID 的独立 Chrome profile。

## 14. 错误分类与退避

| 类型 | 行为 |
|---|---|
| 用户未连接 / 交互授权被拒 | 停止，显示需要连接 |
| 非交互取 token 失败 | 持久化指数退避——离线或 Chrome 账号登录失效都走这里，只有新 token 仍被 `401` 拒收才算撤销授权 |
| `401` | 清缓存 token，非交互重试一次 |
| `403 insufficientPermissions` | 停止自动重试，提示重新连接 |
| `403 accessNotConfigured` | 显示发布配置错误，不归咎于用户 |
| `403/429 rateLimit` | 持久化指数退避 |
| 网络错误 / timeout / `5xx` | 持久化指数退避 |
| `404` pending file 校验失败 | 保留 pending，重新检查生成/创建状态 |
| `409` 预生成 file ID | 核验元数据，匹配即成功 |
| JSON 无效 / schema 不支持 | 不应用、不推进游标、保留本地 |
| 本地 IndexedDB 写入失败 | 停止并单列 `local_store`，不与远端批次损坏共用提示，也不建议重连 |
| owner / Drive 账号变化 | 安静中止，不记网络错误 |
| 单条 entry > 4 MiB | 保留 outbox，持久错误提示 |

退避状态按 Drive permissionId + ownerHash 保存：

- 1、2、4、8、16、32、60 分钟上限；
- 每次加入随机抖动；
- 不在 Service Worker 中 sleep；
- 用 alarm 调度下一次；
- 成功同步或用户点击“立即同步”后清零；
- outbox 和 pending batch 在任何失败下都不清除。

每个 fetch 使用有限 timeout。该 timeout 是覆盖整个请求的墙钟，因此上传与下载单独
取元数据调用的 8 倍预算——batch 上限 4 MiB，套用元数据预算等于要求链路稳定在
140 KB/s 以上。日志只输出阶段、HTTP 状态、Google error reason 和非敏感短 ID，
不输出 token、邮箱、词语、上下文或 URL。

## 15. 设置页设计

生词 tab 新增独立 disclosure/card：

### 未连接

- 标题：“Google Drive 生词同步”；
- 一句话说明“仅同步当前 Pinboard 账号的生词，不同步设置或 API 密钥”；
- 明文数据披露；
- “连接 Google Drive”按钮。

### 已连接

- Google 账号 email / displayName；
- 当前 Pinboard owner label；
- 最近成功时间；
- 待上传词条数；
- 待上传 batch 数；
- 最近错误或“需要重新连接”；
- 并发删除 notice 数；
- “立即同步”；
- “断开本设备”。

同步状态必须持久化并在刷新后恢复。短暂按钮 spinner 和 toast 只能作为补充。

“已同步”只表示当前 owner 的 Drive outbox 为空、Changes 已读到稳定末尾且最近一次
runner 成功；不能同时代表 Chrome 设置、高亮、凭据或手工备份。

13 套主题的颜色适配走现有 options UI tokens / theme factory 生成区；布局间距留在
手维护区。不得手改 `pinboard-themes.js` 或生成区。

## 16. 手工备份 schema v3

### 16.1 导出

在现有 v2 基础上升级：

```json
{
  "_schemaVersion": 3,
  "_backup": {
    "createdAt": "2026-07-24T00:00:00.000Z",
    "extensionVersion": "2.97",
    "source": "manual"
  },
  "_vocabulary": {
    "owner": "pinboard-username",
    "records": []
  }
}
```

规则：

- “包含生词”默认开启；
- 只导出当前已认证 Pinboard owner；
- 无法可靠取得 owner 时不导出生词，并在导出前提示；
- records 使用现有运行时记录字段，保留 `id/owner` 供同账号恢复校验；
- 不导出 sync store、vector、dot、tombstone、outbox、batch、Drive 账号或 OAuth；
- `_vocabulary` 与 `_highlights` 分别可选；
- 文件名包含本地日期，例如：
  `Pinboard Bookmark Enhanced backup 2026-07-24.json`；
- UI 明确说明 JSON 是明文，可能含设置、高亮、网址、生词和上下文；不含 API key。

### 16.2 导入预览

选择文件后不得立即写 storage。先完成纯预检并显示：

- schema 版本、创建时间、扩展版本；
- 设置字段数；
- 自定义主题数；
- 高亮页面/条目数及 owner；
- 生词数、语言分布及 owner；
- 哪些部分因 owner 不匹配而不可导入；
- 当前设备开启 Chrome 设置同步时，“设置修改可能传播到其他 Chrome 设备”；
- 预计使用 local fallback 的大字段。

用户可选择导入设置、主题、高亮、生词；默认勾选备份中存在且允许导入的部分。

### 16.3 生词导入

- 备份 owner 必须等于当前 Pinboard owner；
- owner 不匹配时禁用生词复选框，不提供自动换绑；
- 默认按 recordKey 合并，不清空备份中未出现的本地词；
- contexts/groups 使用与同步相同的集合合并；
- 导入记录通过统一本地 mutation primitive，每 100 条一个 transaction，并显示
  进度；失败时准确报告已提交数量，后续重试依靠 recordKey 合并保持幂等；
- 每条导入成为当前设备的新 live 版本并进入 outbox；
- 远端存在旧 tombstone 时，新导入与 tombstone 并发，live 保留并传播；
- 任一批次 owner 校验失败时该批 transaction abort；
- 导入完成后重新读取真实 IDB，不能用导入前快照覆盖。

首版不提供“用备份完全替换当前生词库”。这是破坏性语义，且与自动同步交互复杂。

### 16.4 旧备份兼容

- v1 / v2 没有 `_vocabulary`：保持现有生词不变；
- 未知顶层字段继续按白名单忽略；
- 旧 `_highlights` owner 规则保持；
- 旧 WebDAV 字段继续作为未知字段忽略；
- 不因为新增 v3 而改变 secret 排除。

## 17. 现有同步与备份加固

这些改动与 Google Drive 生词同步同批设计，但不改变各自职责。

### 17.1 Chrome 大字段 chunk 清理

现有 large-setting generation 清理不能按 key 前缀删除所有“非当前 generation”，
因为另一设备可能刚写入一个本设备尚未观察到的新 generation。

修正规则：

- manifest 记录本次明确替换的 previous generation；
- 写入新 generation 成功、manifest 写入成功且回读仍指向该 generation 后，只删除
  manifest 明确记录的 previous generation；
- 不删除无法证明已被当前写入替换的其他 generation；
- 清理由幂等 orphan maintenance 后续处理，不能在用户保存主路径做前缀清扫。

### 17.2 local fallback 可见性

Chrome Sync quota 导致 overlay/themes 等落入 local fallback 时：

- 设置页持久显示“仅保存在此设备”；
- 手工导入结果必须报告 partial；
- 备份预览和导入结果不得把 local fallback 描述成已同步；
- 状态不依赖一次性 toast。

### 17.3 关闭凭据同步

`syncApiKeys` 从开切换到关会影响账号级云端 secret。确认文案必须说明：

- 本设备改用本地凭据；
- Chrome Sync 中旧凭据将被清理；
- 其他仍使用云端凭据的设备可能失去可用 key；
- 操作不影响 Google Drive OAuth token，因为 token 从不进入该机制。

### 17.4 备份完整性

- 导出前 flush options debounce；
- 生成后的 payload 必须经过与导入相同的 schema preflight；
- 导入 preview 后、正式 apply 前再次校验文件未被替换；
- 设置、主题、高亮和生词分别报告 applied / skipped / local-only / failed；
- 任一部分失败不得显示笼统“导入成功”；
- 文件内容与用户数据类型在导出前直接披露。

## 18. 隐私与文档

功能上线前同步更新：

- README ×9：区分 Chrome 设置同步、Google Drive 生词同步和手工备份；
- `docs/privacy.md`：
  - Network Requests：Google Drive API；
  - Permissions：可选 `identity` 和 Google API origin；
  - Third-Party：Google Drive；
  - 数据字段、触发时机、保留位置和断开语义；
- `docs/index.md`：用户可见功能说明；
- `docs/cws-assets/privacy-tab-copy.md`：CWS 数据使用披露；
- `CLAUDE.md`：
  - 三套持久化边界；
  - 生词 owner/vector/outbox/tombstone 不变量；
  - OAuth 双 ID 与 release manifest 替换；
  - appDataFolder 批次、游标提交和错误分类；
- release smoke 与发布前文档核查。

文案更新使用 `content-l10n`，9 个 locale 同一提交镜像；中文和英文再按项目既有
humanizer 规则检查。

## 19. 测试设计

### 19.1 纯函数

- vector equal / dominates / concurrent；
- vector join；
- live/live contexts 与 groups 去重；
- attribution pair 不混源；
- live/tombstone 并发保留 live 并生成 notice；
- 第二次删除支配旧 live；
- recordKey / ownerHash 规范化；
- batch UTF-8 分片边界；
- appProperties 与 batch schema 校验；
- 远端 value 不能注入 owner/id 或危险 URL。

### 19.2 IndexedDB

- v1 → v2 升级保留全部 words；
- 旧词条首次 seed；
- 单条 mutation 的 words/vector/outbox 原子性；
- 批删/加组 owner mismatch 全 transaction abort；
- mutation 发生在 batch freeze 之后时重新生成 outbox；
- 删除保留 tombstone；
- 远端 apply 失败不推进本地 cursor；
- mutation 后刷新代际不被旧快照回写。

### 19.3 Drive fetch fixture

- files.list 与 changes.list 多页；
- 先取得 `T`、全量扫描、再补 T 后变化；
- 仅在处理成功后推进 token；
- 预生成 ID 创建成功；
- 创建响应丢失后同 ID `409` 核验成功；
- `409` 元数据不匹配失败关闭；
- 自写变化增量跳过；
- bootstrap 不跳过本设备旧文件；
- appData removal 触发 checkpoint；
- `401` token cache 刷新一次；
- `403` 权限错误停止；
- `429/5xx` 持久退避；
- owner / Drive 账号在 await 后变化时停止提交；
- 单 entry 超限保留 outbox。

### 19.4 备份

- v3 metadata 与日期文件名；
- 生词开关开/关；
- 当前 owner 生词导出；
- owner mismatch 禁止导入；
- v1/v2 保持生词不变；
- settings / themes / highlights / vocab 分项结果；
- 不含 API key、OAuth、sync store、outbox、tombstone；
- Chrome Sync 开启时 preview 显示跨设备影响；
- large setting local fallback 显示 partial。

### 19.5 Manifest / release

- 源码固定开发 ID；
- Release ZIP CWS ID；
- 两个 build 的 OAuth client ID 分别正确；
- 只有 `drive.appdata` scope；
- `identity` 与 Google origin 为连接时可选权限；
- ZIP smoke 的 SW、popup、options 无 pageerror。

### 19.6 真机矩阵

至少覆盖：

1. 两个 Chrome profile、同一 Google / Pinboard 账号；
2. 开发版与 CWS-ID 测试构建的 appData 可见性门禁；
3. 两设备离线新增不同词；
4. 同词并发新增 context / group；
5. 删除与更新并发，再次删除；
6. 上传响应后立即重载扩展；
7. 同步中切换 Pinboard 账号；
8. 切换 Chrome Google 账号；
9. 5,000+ 生词首次同步；
10. 远端 appData 被删除后的 checkpoint 修复；
11. 手工备份导出、清本地测试 profile、导入并重新同步；
12. 中文简体、中文香港、英文界面下状态不回退语言设置。

## 20. 验收标准

1. Google Drive 只同步当前 Pinboard owner 的生词。
2. Chrome Sync payload 中没有生词、Drive token、游标、outbox 或 tombstone。
3. 两设备并发不会因时间戳或单文件覆盖丢失 contexts/groups。
4. 删除与并发更新不会静默丢词；再次删除可最终收敛。
5. 任意网络失败或 SW 重启后 pending batch 仍可安全重试。
6. 预生成 ID 的响应丢失不会产生重复远端文件。
7. 首次同步扫描期间的新批次不会漏取。
8. 游标只在对应远端数据成功提交 IDB 后前移。
9. Pinboard owner 或 Google Drive 账号变化时旧任务失败关闭。
10. 5,000+ 生词可完成首次同步；没有应用级生词总数上限。
11. 设置页能在刷新后显示待上传、最近成功和失败原因。
12. 手工备份 v3 可选包含当前 owner 生词，导入前有完整预览。
13. CWS 版与固定开发版 ID 不同，可同时安装。
14. 13 套主题、9 个 locale、隐私文档和 Release ZIP smoke 全部通过。

## 21. 施工分解建议

本 spec 可进入一个实施计划，但应按以下可独立验证的阶段施工：

1. OAuth 双 ID、Google Cloud client 和 appData 共享门禁；
2. `vocab-store.js` 抽取、DB v2 与统一 mutation；
3. vector、tombstone、outbox 与纯测试；
4. Drive 批次、预生成 ID、首次/增量同步；
5. MV3 alarm、账号核验、退避和状态；
6. options Google Drive UI；
7. 手工备份 v3、导入 preview 和既有备份加固；
8. 9 语种、隐私、README、CLAUDE 与 release smoke；
9. 双 profile / 大词库真机验收。

每阶段完成后单独验证并使用 Conventional Commit。任何阶段不得用 `--no-verify`。

## 22. 刻意保留的首版上限

- 不压缩 JSON batch；当实测网络或存储成本成为瓶颈时再用原生
  `CompressionStream`。
- 不自动删除历史 batch；当真实冷启动文件数或 Drive 配额成为问题时再设计
  checkpoint acknowledgement 与安全 GC。客户端目前只有 GET 与 multipart POST，
  没有任何删除动词，因此远端文件数只增不减：每台设备每轮有非空 outbox 的同步各
  留下一个永久文件，appData removal 触发的 checkpoint 还会写出一份全量快照，
  而新设备首次连接要下载并校验全部历史 batch。**复查触发条件：单账号 appData
  文件数超过 500。** 到达前不写代码；到达后先量首次连接耗时，再决定 GC 方案。
- 不支持单条超过 4 MiB 的生词记录；真实出现后再增加 resumable upload。
- 不提供云端数据删除 UI；先保证“断开不丢本地数据”的清晰语义。
- 不做字段级通用 CRDT；当前用户生成的关键集合字段用并集，自动词典字段用稳定
  winner。

这些限制均不能通过静默截断、静默覆盖或伪成功绕过。
