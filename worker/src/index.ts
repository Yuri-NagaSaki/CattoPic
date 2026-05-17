import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { AuthService } from './services/auth';
import { corsResponse, unauthorizedResponse } from './utils/response';
import { MetadataService } from './services/metadata';
import { CacheService } from './services/cache';
import { dispatchImageDeletions, processPendingDeletionJobs, toDeletionTarget } from './services/deletion';

// Import handlers
import { uploadSingleHandler } from './handlers/upload';
import { imagesHandler, imageDetailHandler, updateImageHandler, deleteImageHandler } from './handlers/images';
import { randomHandler } from './handlers/random';
import { faviconHandler } from './handlers/favicon';
import { tagsHandler, createTagHandler, renameTagHandler, deleteTagHandler, batchTagsHandler } from './handlers/tags';
import { validateApiKeyHandler, configHandler, cleanupHandler } from './handlers/system';
import { handleQueueBatch } from './handlers/queue';
import type { QueueMessage } from './types/queue';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// Handle preflight requests
app.options('*', () => corsResponse());

// Auth middleware for protected routes
const authMiddleware = async (c: Context<{ Bindings: Env }>, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = AuthService.extractApiKey(authHeader ?? null);

  if (!apiKey) {
    return unauthorizedResponse();
  }

  const authService = new AuthService(c.env.DB);
  let isValid = await authService.validateApiKey(apiKey);

  if (!isValid && AuthService.timingSafeEqual(apiKey, c.env.CATTOPIC_API_KEY)) {
    isValid = true;
    c.executionCtx.waitUntil(
      authService.addApiKey(apiKey)
        .then(() => authService.recordApiKeyUsage(apiKey))
        .catch((err) => console.error('Failed to persist bootstrap API key:', err))
    );
  }

  if (!isValid) {
    return unauthorizedResponse();
  }

  if (new URL(c.req.url).pathname === '/api/validate-api-key') {
    c.executionCtx.waitUntil(
      authService.recordApiKeyUsage(apiKey)
        .catch((err) => console.error('Failed to record API key usage:', err))
    );
  }

  await next();
};

// === Public Routes ===

// Favicon for browser requests hitting API endpoints directly
app.get('/favicon.ico', faviconHandler);
app.get('/favicon.svg', faviconHandler);

// Random image (public, no auth required)
app.get('/api/random', randomHandler);

// === Protected Routes ===

// Auth
app.post('/api/validate-api-key', authMiddleware, validateApiKeyHandler);

// Upload (single file per request - Cloudflare Worker best practice)
app.post('/api/upload/single', authMiddleware, uploadSingleHandler);

// Images CRUD
app.get('/api/images', authMiddleware, imagesHandler);
app.get('/api/images/:id', authMiddleware, imageDetailHandler);
app.put('/api/images/:id', authMiddleware, updateImageHandler);
app.delete('/api/images/:id', authMiddleware, deleteImageHandler);

// Tags CRUD
app.get('/api/tags', authMiddleware, tagsHandler);
app.post('/api/tags', authMiddleware, createTagHandler);
app.put('/api/tags/:name', authMiddleware, renameTagHandler);
app.delete('/api/tags/:name', authMiddleware, deleteTagHandler);
app.post('/api/tags/batch', authMiddleware, batchTagsHandler);

// System
app.get('/api/config', authMiddleware, configHandler);
app.post('/api/cleanup', authMiddleware, cleanupHandler);

// 404 handler - ensure CORS headers are included
app.notFound(() => {
  return new Response(
    JSON.stringify({ success: false, error: 'Not found' }),
    {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  );
});

// Error handler - ensure CORS headers are included
app.onError((err) => {
  console.error('Error:', err);
  return new Response(
    JSON.stringify({ success: false, error: 'Internal server error' }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  );
});

// Scheduled handler for cron jobs - cleanup expired images
async function scheduledHandler(
  _event: ScheduledEvent,
  env: Env,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: ExecutionContext
): Promise<void> {
  console.log('Cron job started: cleaning up expired images');

  const metadata = new MetadataService(env.DB);
  const cache = new CacheService(env.CACHE_KV);

  try {
    const retriedDeletionJobs = await processPendingDeletionJobs(env);
    if (retriedDeletionJobs > 0) {
      console.log(`Retried ${retriedDeletionJobs} pending deletion jobs`);
    }

    const expiredImages = await metadata.getExpiredImages();
    console.log(`Found ${expiredImages.length} expired images`);

    const deletionTargets = expiredImages.map((image) =>
      toDeletionTarget(image.id, {
        original: image.paths.original,
        webp: image.paths.webp || undefined,
        avif: image.paths.avif || undefined,
      })
    );

    const deletedCount = await metadata.deleteImagesWithDeletionJobs(deletionTargets);

    if (deletedCount > 0) {
      await Promise.all([
        cache.invalidateImagesList(),
        cache.invalidateTagsList(),
        cache.invalidateImageDetails(deletionTargets.map((target) => target.id)),
      ]);

      await dispatchImageDeletions(env, deletionTargets, 'expired');
    }

    console.log(`Cron job completed: deleted ${deletedCount} expired images`);
  } catch (err) {
    console.error('Cron job failed:', err);
  }
}

// Queue handler for async R2 deletion
async function queueHandler(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  await handleQueueBatch(batch, env);
}

const handlers = {
  fetch: app.fetch,
  scheduled: scheduledHandler,
  queue: queueHandler,
};

export default handlers;
