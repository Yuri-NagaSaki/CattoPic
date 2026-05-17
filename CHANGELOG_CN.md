# 更新日志

此项目的所有重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [未发布]

### 新增

- **持久化 R2 删除任务** - 新增 D1 `deletion_jobs` 重试表，图片元数据可以立即删除，R2 清理失败后仍可由 Queue/Cron/手动清理恢复。
- **Cloudflare Queues 可选化** - R2 文件删除不再强制依赖 Cloudflare Queues。在 wrangler.toml 中设置 `USE_QUEUE = 'true'` 使用异步队列删除，设置为 `'false'` 则使用同步删除（无需付费 Queue 功能）。
- **ZIP 批量上传** - 支持通过 ZIP 压缩包批量上传图片
  - 使用 JSZip 在浏览器端解压
  - 分批处理（每批 50 张）防止内存溢出
  - 实时显示解压和上传进度
  - 支持为所有图片设置统一标签
  - 自动跳过非图片文件和超过 70MB 的文件

### 变更

- API Base URL 解析改为统一复用运行时 `/api/config` helper，覆盖普通请求、API Key 校验和 URL 拼接。
- 过期图片清理会先写入持久化 R2 删除任务，再在后台删除文件，并支持 Cron/手动清理重试。
- Worker 部署 workflow 改用 pnpm 10.24.0，与 Worker package manager 和 lockfile 生成版本保持一致。
- Worker 部署流程会自动执行 D1 `deletion_jobs` 迁移，并可从 GitHub Actions Secret 自动 upsert 正式 API Key。
- Worker 部署流程改用 Node.js 24，以兼容当前 Wrangler/Undici 工具链。
- 当 WebP/AVIF 文件未生成/缺失时（例如超过 10MB 的上传），改用 Cloudflare Transform Images URL（`/cdn-cgi/image/...`）作为兜底输出方式。
- `/api/random` 改为 302 重定向到实际图片 URL（不再由 Worker 代理回源返回图片字节，Transform-URL 场景更稳定）。
- 关闭 Next.js 图片优化（图片已使用 Transform-URL 输出，无需再二次优化）。
- Transform-URL 参数改为严格按配置输出（不再附加额外参数；未设置最大尺寸时不强制 AVIF 缩放）。
- 管理页瀑布流列表引入 TanStack Virtual 虚拟渲染，保持大图库场景下 DOM 数量稳定。
- 上传页侧边栏（预览/结果）引入 TanStack Virtual 虚拟渲染，提升大批量场景下的滚动流畅度。
- UI 列表/网格统一使用 `/cdn-cgi/image/width=...` 请求缩略图，降低带宽与解码开销。
- `/api/images` 新增 `format` 后端筛选（`all|gif|webp|avif|original`），减少大图库场景下前端筛选与处理开销。
- 管理页单页加载数量从 24 提升到 60，减少滚动过程中的请求次数与抖动。
- 默认 `maxUploadCount` 调整为 50，并发上传数量统一调整为 5（含 AVIF）。

### 废弃

### 移除

### 修复

- 修复 `PUT /api/images/:id` 中 `expiryMinutes: 0` 无法清除图片过期时间的问题。
- 在定时清理真正删除过期图片前，列表、详情、随机图和标签计数读取都会先隐藏已过期图片。
- 修复批量改标签、删除标签和过期清理后 image detail KV 缓存可能返回旧数据的问题。
- 批量标签更新增加数量上限和 D1 分片执行，避免触发 SQL 变量数/语句长度限制。
- API Key 鉴权不再把每个受保护读请求都变成 D1 写入；`last_used_at` 仅在校验 API Key 时更新。
- 修复中文 API 文档仍使用 `/api/upload` 的问题，并统一部署文档中的 Worker compatibility date。
- 修复 Dependabot lockfile 漂移导致 Vercel frozen install 失败的问题：根目录 `dotenv` 的 manifest specifier 现在与 `pnpm-lock.yaml` 保持一致。
- Worker 处理器在调用元数据/缓存服务前，会先校验缺失或格式错误的图片/标签路由参数。
- 修复 WebP 和 AVIF 图片的方向检测 - 现在会正确读取图片实际尺寸，而不是默认返回 1920x1080。
- 修复删除图片后上传页/管理页未及时刷新（TanStack Query 缓存 + recent uploads 列表导致需强刷）。
- 修复管理页「随机图 API 生成器」未能正确解析真实 API Base URL（改为从 `/api/config` 获取），仍输出占位链接 `https://your-worker.workers.dev` 的问题。
- 修复 `/api/images` 分页参数无边界问题，并统一对 `/api/images/:id` 的标签更新进行清洗/归一化处理。
- 修复管理页在未提供 API Key 时仍发起受保护接口请求的问题。
- 修复管理页虚拟瀑布流在生产构建中出现 React #301 无限重渲染崩溃的问题。
- 修复 `/favicon.ico` 请求返回 404（改为重定向到 `/static/favicon.ico`）。
- 修复未设置 API Key 时仍发送 `Authorization: Bearer null` 的问题。
- 统一清洗并校验标签路由参数（重命名/删除标签），拒绝非法标签名。
- 上传接口支持 multipart 使用 `image` 或 `file` 作为文件字段名。

### 安全

- 更新存在安全风险的传递依赖 lockfile 条目：`ajv`、`brace-expansion`、`flatted`、`minimatch`、`picomatch`、`postcss` 以及 Worker 侧的 `undici`。
- 收紧标签清洗规则，避免标签管理相关接口出现意外字符输入。
