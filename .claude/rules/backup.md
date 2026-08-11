---
paths:
  - "options-backup.js"
---

# 手工备份 schema v3 深水区

- 导出前 flush 待保存设置，payload 通过与导入相同的 preflight；备份含 `_backup` 元数据、设置/主题和可选的当前 owner 高亮/生词，只含运行时 word 字段。导入必须先预览，再由用户分项选择；生词按 100 条通过 store primitive 合并，并在每批前后重核验 owner。OAuth、Drive 账号、vector、dot、outbox、tombstone 和 batch 一律不进入备份。
- **凭据是 opt-in，两端都 fail-closed**：默认导出不含任何凭据（三道过滤：`EXPORTABLE_KEYS` 白名单、`pbpBuildBackupSnapshot` 内部的 `API_KEY_FIELDS` 过滤、export-target registry 的 secret 删除）。勾选后导出全部 `API_KEY_FIELDS` 与 export-target 的 token/URL，文件名带 `with credentials`，`_backup.includesSecrets=true`（`pbpSanitizeBackupMetadata` 必须同步接受该字段，否则自己导不回来）。
- 导入侧凭据是独立 section：`pbpApplyBackupPayload` 的 `selected.secrets` **只认显式 `=== true`**，不随「其余默认全开」继承——备份文件是不可信输入，任何文件都可能被手工塞进凭据字段，静默覆盖本机可用凭据是攻击面（`tests/settings-persist-tests.html` 的 E7b 正反两条断言钉死此边界）。预览的 checkbox 在 enabled 时也保持不勾选。
- 凭据经 `persistSettings` 写入，由其 `pbpSplitSecretBatch` 自行路由存储区；secrets 分支必须排在 settings 分支**之后**（settings 会用无凭据副本重建 exportTargets）。
