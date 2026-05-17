# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Durable R2 deletion jobs** - Add a D1-backed `deletion_jobs` retry table so image metadata can be removed immediately while failed R2 cleanup remains recoverable by Queue/Cron/manual cleanup.
- **Optional Cloudflare Queues** - R2 file deletion no longer requires Cloudflare Queues. Set `USE_QUEUE = 'true'` in wrangler.toml to use async queue-based deletion, or `'false'` for synchronous deletion (no paid Queue feature required).
- **ZIP Batch Upload** - Upload images in bulk via ZIP archive
  - Browser-side extraction using JSZip
  - Batch processing (50 images per batch) to prevent memory overflow
  - Real-time extraction and upload progress display
  - Unified tag setting for all images
  - Auto-skip non-image files and files over 70MB

### Changed

- API base URL resolution now uses a shared runtime `/api/config` helper for requests, API key validation, and URL construction.
- Expired image cleanup now records durable R2 deletion jobs and runs file deletion in the background, with retry support from Cron/manual cleanup.
- Worker deployment workflow now uses pnpm 10.24.0 to match the Worker package manager and lockfile generation.
- Worker deployment now runs the D1 `deletion_jobs` migration automatically and can upsert the production API key from a GitHub Actions secret.
- Use Cloudflare Transform Images URL (`/cdn-cgi/image/...`) as a fallback WebP/AVIF delivery method when stored variants are missing (e.g. uploads over 10MB).
- `/api/random` now redirects (302) to the selected image URL instead of proxying the image bytes (more reliable for transformed variants).
- Disable Next.js image optimization since images are already delivered as transformed URLs.
- Transform-URL parameters now follow the configured settings (no extra flags; no forced AVIF resize unless a max size is specified).
- Virtualize the Manage page masonry gallery with TanStack Virtual to keep DOM size stable for large libraries.
- Virtualize Upload sidebars (preview + results) with TanStack Virtual to keep scrolling smooth for large batches.
- Request resized thumbnail URLs via `/cdn-cgi/image/width=...` for UI grids to reduce bandwidth/decode cost.
- Add server-side `format` filtering to `/api/images` (`all|gif|webp|avif|original`) to reduce client-side work for large libraries.
- Increase Manage page page size from 24 to 60 to reduce request churn while scrolling.
- Increase default `maxUploadCount` to 50 and use concurrency=5 for uploads (including AVIF).

### Deprecated

### Removed

### Fixed

- Fix clearing an image expiry time with `expiryMinutes: 0` in `PUT /api/images/:id`.
- Hide expired images from list, detail, random-image, and tag-count reads before the scheduled cleanup physically deletes them.
- Avoid stale image detail caches after batch tag edits, tag deletion, and expired-image cleanup.
- Bound and chunk batch tag updates to avoid D1 SQL variable/statement limits.
- Stop turning every protected read request into a D1 write; API key `last_used_at` is now updated only when validating the key.
- Fix Chinese API docs to use `/api/upload/single`, and align deployment docs with the Worker compatibility date.
- Fix Dependabot lockfile drift that made Vercel frozen installs fail when the root `dotenv` manifest specifier did not match `pnpm-lock.yaml`.
- Validate missing or malformed image/tag route parameters before Worker handlers call metadata/cache services.
- Fix orientation detection for WebP and AVIF images - now correctly reads actual image dimensions instead of defaulting to 1920x1080.
- Fix deleted images not disappearing from Upload/Manage pages without a hard refresh (TanStack Query cache + recent uploads list).
- Fix Manage page Random API generator to resolve the real API base URL (via `/api/config`) instead of the placeholder `https://your-worker.workers.dev`.
- Clamp `/api/images` pagination parameters and normalize/sanitize tag updates in `/api/images/:id`.
- Avoid fetching protected image data before an API key is available on the Manage page.
- Fix a production-only React render-loop crash (#301) in the Manage page virtual masonry.
- Fix `/favicon.ico` returning 404 by redirecting to `/static/favicon.ico`.
- Avoid sending `Authorization: Bearer null` when no API key is set.
- Normalize and validate tag route params for tag rename/delete endpoints.
- Accept multipart uploads using either `image` or `file` field names.

### Security

- Update vulnerable transitive dependency lockfile entries for `ajv`, `brace-expansion`, `flatted`, `minimatch`, `picomatch`, `postcss`, and Worker-side `undici`.
- Tighten tag sanitization to avoid unexpected characters in tag management endpoints.
