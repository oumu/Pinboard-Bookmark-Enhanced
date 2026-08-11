---
paths:
  - "md-embed.js"
  - "background.js"
---

# 防盗链图片修复深水区（declarativeNetRequestWithHostAccess）

部分 CDN（实测 cdnfile.sspai.com）**只拒空 Referer**，而扩展页只能发空 Referer（且预览对图片强制 `no-referrer`——这对更常见的「封外站/放空」型防盗链是正确默认，勿改）。修复 = **SW 独占**的临时 DNR session rule（`pbpImgFixWithReferer`：页面向 SW 申请规则 → 带 Referer 重取）：

1. rule id 由 SW 在保留段 786001-786999 内分配，**页面绝不自行分配**（id 是扩展全局的，页面局部计数器必然跨 tab 冲突）。
2. install / remove / sweep **全部走同一条串行队列**，install 在临界区内用 `tabs.get` 重核验该 tab 仍是**同一预览文档**（否则规则会落到已导航走的普通网站 tab 上）。
3. 规则条件必须含 `initiatorDomains:[chrome.runtime.id]`——这是「普通网页请求不可能命中」的**结构性**保证，不是靠清扫抢时间。
4. tab 作用域取自 `sender.tab`；删除做 (tab, 文档) owner-check——但 owner 表是 SW 内存态，**SW 重启后降级为仅 tab 校验**（同 tab 跨文档的 id 复用在那个窗口内仍可能误删，属已知残留风险，非不变量）。
5. 清扫三路：tab 关闭 / 离开预览文档 / 预览页加载时自清（同 URL reload 不触发 `changeInfo.url`，靠第三路兜底）。
6. 重试取图必须 `cache:"reload"`——失败的 `<img>` 已把 403 写进 HTTP 缓存，`force-cache` 会直接复用它导致规则形同虚设。

自动修复只对**已授权 origin** 生效（`permissions.contains`，绝不 prompt）；批次在首个 await 前**冻结**（否则等待授权期间新入队的未授权 origin 会混进自动批次）。

`zip-install-smoke.mjs` 的 DNR ownership/lifecycle check 守护其中五条：跨 tab id 唯一、跨 tab 删除被拒、非预览 tab 拒装、规则带 `initiatorDomains`、离开预览即清扫（**不覆盖** SW 重启后的同 tab 跨文档删除）。
