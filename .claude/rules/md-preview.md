---
paths:
  - "md-preview.html"
  - "md-preview.css"
  - "md-preview.js"
  - "md-ai-core.js"
  - "md-translate.js"
  - "md-ask.js"
  - "md-highlight.js"
  - "md-reader.js"
  - "md-skim.js"
  - "md-convert.js"
  - "md-epub.js"
  - "md-mermaid.js"
  - "md-export-send.js"
  - "md-video.js"
  - "bili-player-bridge.js"
---

# md-preview 阅读器深水区

## 全文翻译（md-translate.js）

block 切分 → `pbpAiShield` 占位符 `⟦C/L/I/M/T\d+⟧` 屏蔽代码/链接/图片/数学 → JSON `{translations:[{id,text}]}` 流式 → 块 hash 缓存。三条不变量勿破坏：

1. **占位符守恒门**（`pbpTrPlaceholdersConserved`，硬）+ 长度比（软）二者皆过才 fill；
2. glossary = 用户表 ∪ 自动抽取（**用户优先**）按批命中裁剪注入；
3. 抽取/缓存任何失败必须 **degrade 不阻断**翻译。

`md-translate.js` 顶段保持纯（无 DOM/chrome/fetch，供 `tests/md-ai-tests.html` file:// 加载）。

## 三态视图与单键契约

`v` 严格按原文 → 双语 → 仅译文 → 原文循环，不保存「上次非原文模式」；`t` 与翻译按钮共用启动路径，`d` 与 `e` 共用选区捕获，`h` 与 `1-5` 共用高亮路径。切换前记录逻辑块 `n`、阅读侧 `side` 与块内比例 `frac`，切换后以 `behavior:"instant"` 恢复对应位置；View Transition 只处理短暂透明度变化，不能驱动滚动。reduced-motion 或无 `startViewTransition` 时直接恢复，位置正确性不得依赖动画。

## explain-pop 会话与焦点

固定状态和拖动位置只在当前页面会话有效，不写 storage。只在 closed → open 时记录焦点来源，固定重入和动作切换不得覆盖；Esc 或关闭按钮仅在焦点仍位于弹层内时恢复到仍连接且可见的来源，并使用 `preventScroll`。来源失效时临时借用当前可见阅读块的 `tabindex="-1"`，blur 后清理；外部点击若已把焦点移到弹层外，不得抢回。

## 其他

- skim 要点层是设置 opt-in，默认**关**（生成花 token）；vocab-echo 生词再现（`dictEchoEnabled`）默认**开**（不花 token，CSS Custom Highlight 点状下划线）。
- md-highlight.js：五色划词高亮 + 笔记 + Notebook 面板；高亮必须在重渲染/翻译切换后按锚定恢复。
- md-epub.js 顶段是纯层（zip/OPF/nav/XML 转义，无 DOM/chrome，测试页可载）；运行时 XHTML 序列化与 DOM 派生目录在 `pbpBuildEpub`。
- 阅读视图**不提案 hover 触发的浮层交互**（用户真机反馈否决，历史上 tr 悬停气泡被点名全删）。
- **明暗解析模型**（2026-08-25）：`pbpResolveReaderScheme` = 页内覆盖（`pbp_color_scheme`，local、按设备，「Aa」面板第三行）＞ 视频默认深色（`mdVideoDarkScheme`，仅 video-mode）＞ 全局 `optTheme`；阅读器永不套 Pinboard 预设。`md-preview-theme-early.js` 是它的 verbatim twin，靠 `pp-theme` / `md-preview-scheme` / `md-preview-video-dark` 三个 localStorage 镜像 + opener 附加的 `video=1` URL 参数在首帧前解析——改任何一侧必须同步另一侧。settings 类 `storage.onChanged` 一律经 `pbpSettingsAreaName()` 过滤非本机路由的 area，并在 `optSyncEnabled` 切换时整组重读。
- `md-convert.js` 是 marked→DOMPurify 的单点 sanitize 中枢；导出与 frontmatter/byline 都走它。

## 视频面板（md-video.js）

- 纯层/运行时分界见文件头注释；纯层含注入 YouTube 标签页的页函数 `pbpYtDomTranscriptInPage`——`executeScript` 按源码序列化，它必须**闭包零引用**（只用页面全局与自身参数），并留在顶层供 `tests/md-video-tests.html` 在真实 DOM 上直接跑。
- YouTube 救援链顺序由 `pbp_video_tier_youtube` 缓存决定（上次成功层优先，`pbpVideoTierOrder`）；所有标签页注入经 `queueTabInjection` 串行，并持 90s tap lease；注入前后都要做 videoId 守卫（标签页可能已 SPA 导航到别的视频）。
- **`readyState=complete` 不等于 SPA 水合**（2026-08-26 真机：`ytd-watch-flexy` 比 complete 晚 20 余秒）。DOM 层先用 playerResponse 判有无字幕轨，再等 `ytd-watch-flexy` 出现（默认 20s）才找转录入口；三种 trace 语义分明：`video has no caption tracks` / `page not hydrated within Nms` / `no transcript entry in page`。取数标签页同视频内 `complete` 优先于 `loading`。
- 权限路径铁律在 CLAUDE.md「网络端点与 host 权限」；自动路径只 `permissions.contains`，首次申请只能来自用户点击。
