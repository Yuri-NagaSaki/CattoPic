# CattoPic Deployment Guide

[中文](../DEPLOYMENT.md)

## Architecture

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
                                │ ┌──▼───┐   ┌───▼──┐   ┌────┐   │
                                │ │  R2  │   │  D1  │   │ KV │   │
                                │ │Bucket│   │  DB  │   │    │   │
                                │ └──────┘   └──────┘   └────┘   │
                                └─────────────────────────────────┘
```

| Component | Platform | Purpose |
|-----------|----------|---------|
| Frontend | Vercel | Next.js frontend application |
| API | Cloudflare Worker | Backend API service (Hono) |
| Storage | Cloudflare R2 | Image file storage |
| Database | Cloudflare D1 | SQLite database (metadata, API keys) |
| Cache | Cloudflare KV | Caching layer |
| Queue | Cloudflare Queues | Async tasks (file deletion) |

---

## Prerequisites

- [Node.js](https://nodejs.org/) >= 24
- [pnpm](https://pnpm.io/) package manager
- [Cloudflare account](https://dash.cloudflare.com/)
- [Vercel account](https://vercel.com/)

---

## 1. Cloudflare Resource Setup

### 1.1 Login to Wrangler CLI

```bash
cd worker
pnpm install
pnpm wrangler login
```

### 1.2 Create R2 Bucket

```bash
pnpm wrangler r2 bucket create cattopic-r2 --location=apac
```

> `--location=apac` deploys the bucket in Asia-Pacific for lower latency

### 1.3 Create D1 Database

```bash
pnpm wrangler d1 create CattoPic-D1 --location=apac
```

Example output:
```
✅ Successfully created DB 'CattoPic-D1' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "CattoPic-D1"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Note this ID
```

### 1.4 Create KV Namespace

```bash
pnpm wrangler kv namespace create CACHE_KV
```

Example output:
```
🌀 Creating namespace with title "cattopic-worker-CACHE_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "CACHE_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # Note this ID
```

### 1.5 Create Queue

```bash
pnpm wrangler queues create cattopic-delete-queue
```

### 1.6 Initialize Database Schema

```bash
pnpm wrangler d1 execute CattoPic-D1 --remote --file=schema.sql
```

Existing deployments do not require manual migration commands; the Worker automatically creates the new deletion job table through the D1 binding.

The deploy workflow syncs the GitHub Actions Secret `CATTOPIC_API_KEY` as a Worker Secret, then persists it to D1 on first use.

### 1.7 Configure wrangler.toml

Copy the template configuration file:

```bash
cp wrangler.example.toml wrangler.toml
```

Edit `worker/wrangler.toml` with your resource IDs:

```toml
name = 'cattopic-worker'
main = 'src/index.ts'
compatibility_date = '2025-12-10'
compatibility_flags = ['nodejs_compat']

[vars]
ENVIRONMENT = 'production'
R2_PUBLIC_URL = 'https://your-r2-domain.com'  # Your R2 public access domain

[images]
binding = "IMAGES"

[[r2_buckets]]
binding = 'R2_BUCKET'
bucket_name = 'cattopic-r2'  # Your R2 bucket name

[[d1_databases]]
binding = 'DB'
database_name = 'CattoPic-D1'
database_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'  # Replace with your D1 database_id

[[kv_namespaces]]
binding = "CACHE_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # Replace with your KV namespace id

[[queues.producers]]
queue = "cattopic-delete-queue"
binding = "DELETE_QUEUE"

[[queues.consumers]]
queue = "cattopic-delete-queue"
max_batch_size = 10
max_batch_timeout = 5

[triggers]
crons = ['0 * * * *']  # Cleanup expired images hourly

[dev]
port = 8787
local_protocol = 'http'
```

---

## 2. Deploy Cloudflare Worker

### 2.1 Deploy Worker

```bash
cd worker
pnpm wrangler deploy
```

Example output on success:
```
Uploaded cattopic-worker
Deployed cattopic-worker triggers
  https://cattopic-worker.<your-subdomain>.workers.dev
```

### 2.2 Add API Key

```bash
pnpm wrangler d1 execute CattoPic-D1 --remote --command "
INSERT INTO api_keys (key, created_at) VALUES ('your-api-key-here', datetime('now'));
"
```

> Tip: Use a strong random string as API Key, e.g.: `openssl rand -hex 32`

### 2.3 Verify Deployment

```bash
# Test authentication
curl -X POST \
  -H "Authorization: Bearer your-api-key-here" \
  https://cattopic-worker.<your-subdomain>.workers.dev/api/validate-api-key

# Expected response
{"success":true,"data":{"valid":true}}
```

---

## 3. R2 Public Access Configuration (Optional)

If you need a custom domain for accessing R2 stored images:

### 3.1 Configure in Cloudflare Dashboard

1. Go to R2 bucket settings
2. Enable public access in the "Public access" section
3. Configure custom domain (e.g., `r2.yourdomain.com`)

### 3.2 Update wrangler.toml

```toml
[vars]
R2_PUBLIC_URL = 'https://r2.yourdomain.com'
```

Redeploy:

```bash
pnpm wrangler deploy
```

---

## 4. Deploy to Vercel

### 4.1 Create Project on Vercel

1. Visit [vercel.com/new](https://vercel.com/new)
2. Import GitHub repository
3. Select `Next.js` as Framework Preset

### 4.2 Configure Environment Variables

Add in Vercel project settings:

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://cattopic-worker.xxx.workers.dev` | Worker API URL |

### 4.3 Deploy

Click "Deploy" button and wait for completion.

---

## 5. Local Development

### 5.1 Start Worker (Local)

```bash
cd worker
pnpm dev
# Running at http://localhost:8787
```

### 5.2 Start Frontend (Local)

```bash
pnpm dev
# Running at http://localhost:3000
```

### 5.3 Local Environment Variables

Create `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8787
```

---

## 6. API Reference

### Authentication

Protected APIs require the following header:

```
Authorization: Bearer <your-api-key>
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/random` | No | Get random image |
| GET | `/r2/*` | No | Access image files |
| POST | `/api/validate-api-key` | Yes | Validate API Key |
| POST | `/api/upload/single` | Yes | Upload image |
| GET | `/api/images` | Yes | List images |
| GET | `/api/images/:id` | Yes | Get image details |
| PUT | `/api/images/:id` | Yes | Update image metadata |
| DELETE | `/api/images/:id` | Yes | Delete image |
| GET | `/api/tags` | Yes | List tags |
| POST | `/api/tags` | Yes | Create tag |
| PUT | `/api/tags/:name` | Yes | Rename tag |
| DELETE | `/api/tags/:name` | Yes | Delete tag and associated images |
| POST | `/api/tags/batch` | Yes | Batch tag operations |

For detailed API documentation, see [API_EN.md](./API_EN.md).

---

## 7. FAQ

### Q1: 401 Unauthorized Error

Check if API Key has been added to database:

```bash
pnpm wrangler d1 execute CattoPic-D1 --remote --command "SELECT * FROM api_keys;"
```

### Q2: How to Add New API Key

```bash
pnpm wrangler d1 execute CattoPic-D1 --remote --command "
INSERT INTO api_keys (key, created_at) VALUES ('new-api-key', datetime('now'));
"
```

### Q3: How to Delete API Key

```bash
pnpm wrangler d1 execute CattoPic-D1 --remote --command "
DELETE FROM api_keys WHERE key = 'old-api-key';
"
```

### Q4: How to View All Resource IDs

```bash
# View D1 databases
pnpm wrangler d1 list

# View KV namespaces
pnpm wrangler kv namespace list

# View R2 buckets
pnpm wrangler r2 bucket list

# View queues
pnpm wrangler queues list
```

### Q5: Images Not Accessible After Upload

1. Check if `R2_PUBLIC_URL` is configured correctly
2. Confirm R2 bucket has public access enabled
3. Check if custom domain DNS has propagated

---

## 8. Updating Deployment

### Worker Update

```bash
cd worker
pnpm wrangler deploy
```

### Frontend Update

Push code to GitHub, Vercel will auto-deploy.
