# ImageFlow 部署指南

## 项目架构

```
┌─────────────────────┐         ┌─────────────────────────────────┐
│                     │         │          Cloudflare             │
│   Vercel            │         │                                 │
│   ┌─────────────┐   │  HTTPS  │   ┌─────────────┐               │
│   │  Next.js    │   │ ──────► │   │   Worker    │               │
│   │  Frontend   │   │         │   │   (Hono)    │               │
│   └─────────────┘   │         │   └──────┬──────┘               │
│                     │         │          │                      │
└─────────────────────┘         │    ┌─────┴─────┐                │
                                │    │           │                │
                                │ ┌──▼───┐   ┌───▼──┐             │
                                │ │  R2  │   │  D1  │             │
                                │ │Bucket│   │  DB  │             │
                                │ └──────┘   └──────┘             │
                                └─────────────────────────────────┘
```

| 组件 | 平台 | 用途 |
|------|------|------|
| Frontend | Vercel | Next.js 前端应用 |
| API | Cloudflare Worker | 后端 API 服务 (Hono) |
| Storage | Cloudflare R2 | 图片文件存储 |
| Database | Cloudflare D1 | SQLite 数据库（元数据、API Key） |

---

## 前置条件

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) 包管理器
- [Cloudflare 账户](https://dash.cloudflare.com/)
- [Vercel 账户](https://vercel.com/)

---

## 一、Cloudflare 资源配置

### 1.1 登录 Wrangler CLI

```bash
cd worker
pnpm install
pnpm wrangler login
```

### 1.2 创建 R2 Bucket

```bash
pnpm wrangler r2 bucket create imageflow-bucket --location=apac
```

### 1.3 创建 D1 数据库

```bash
pnpm wrangler d1 create imageflow-db --location=apac
# 记录返回的 database_id
```

> `--location=apac` 将数据库部署在亚太区域以获得更低延迟

### 1.4 初始化数据库表结构

```bash
pnpm wrangler d1 execute imageflow-db --remote --file=schema.sql
```

### 1.5 配置 wrangler.toml

编辑 `worker/wrangler.toml`，填入上一步获取的 ID：

```toml
name = "imageflow-worker"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "production"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "imageflow-bucket"

[[d1_databases]]
binding = "DB"
database_name = "imageflow-db"
database_id = "<your-d1-database-id>"
```

---

## 二、Cloudflare Worker 部署

### 2.1 部署 Worker

```bash
cd worker
pnpm wrangler deploy
```

部署成功后输出示例：
```
Uploaded imageflow-worker
Deployed imageflow-worker triggers
  https://imageflow-worker.<your-subdomain>.workers.dev
```

### 2.2 添加 API Key

```bash
pnpm wrangler d1 execute imageflow-db --remote --command "
INSERT INTO api_keys (key, created_at) VALUES ('your-api-key-here', datetime('now'));
"
```

### 2.3 验证部署

```bash
# 测试认证
curl -X POST \
  -H "Authorization: Bearer your-api-key-here" \
  https://imageflow-worker.<your-subdomain>.workers.dev/api/validate-api-key

# 预期返回
{"success":true,"message":"API key is valid"}
```

---

## 三、Vercel 部署

### 3.1 在 Vercel 创建项目

1. 访问 [vercel.com/new](https://vercel.com/new)
2. 导入 GitHub 仓库
3. Framework Preset 选择 `Next.js`

### 3.2 配置环境变量

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NEXT_PUBLIC_WORKER_URL` | `https://imageflow-worker.xxx.workers.dev` | Worker API 地址 |

### 3.3 部署

点击 "Deploy" 按钮，等待部署完成。

---

## 四、本地开发

### 4.1 启动 Worker（本地）

```bash
cd worker
pnpm dev
# 运行在 http://localhost:8787
```

### 4.2 启动前端（本地）

```bash
pnpm dev
# 运行在 http://localhost:3000
```

### 4.3 本地环境变量

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_WORKER_URL=http://localhost:8787
```

---

## 五、API 参考

### 认证方式

受保护的 API 需要在请求头中添加：

```
Authorization: Bearer <your-api-key>
```

### API 端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/random` | ❌ | 随机获取图片 |
| GET | `/r2/*` | ❌ | 访问图片文件 |
| POST | `/api/validate-api-key` | ✅ | 验证 API Key |
| POST | `/api/upload` | ✅ | 上传图片 |
| GET | `/api/images` | ✅ | 获取图片列表 |
| GET | `/api/images/:id` | ✅ | 获取图片详情 |
| PUT | `/api/images/:id` | ✅ | 更新图片信息 |
| DELETE | `/api/images/:id` | ✅ | 删除图片 |
| GET | `/api/tags` | ✅ | 获取标签列表 |
| POST | `/api/tags` | ✅ | 创建标签 |
| PUT | `/api/tags/:name` | ✅ | 重命名标签 |
| DELETE | `/api/tags/:name` | ✅ | 删除标签 |

---

## 六、常见问题

### Q1: 401 Unauthorized 错误

检查 API Key 是否已添加到数据库：

```bash
pnpm wrangler d1 execute imageflow-db --remote --command "SELECT * FROM api_keys;"
```

### Q2: 如何添加新的 API Key

```bash
pnpm wrangler d1 execute imageflow-db --remote --command "
INSERT INTO api_keys (key, created_at) VALUES ('new-api-key', datetime('now'));
"
```

### Q3: 如何删除 API Key

```bash
pnpm wrangler d1 execute imageflow-db --remote --command "
DELETE FROM api_keys WHERE key = 'old-api-key';
"
```

---

## 七、部署检查清单

- [ ] Cloudflare R2 Bucket 已创建
- [ ] Cloudflare D1 Database 已创建
- [ ] D1 数据库表结构已初始化
- [ ] wrangler.toml 配置正确
- [ ] Worker 已部署
- [ ] API Key 已添加
- [ ] Vercel 项目已创建
- [ ] Vercel 环境变量已配置
- [ ] 部署验证通过

---

## 更新部署

### 更新 Worker

```bash
cd worker
pnpm wrangler deploy
```

### 更新前端

推送代码到 GitHub，Vercel 会自动部署。
