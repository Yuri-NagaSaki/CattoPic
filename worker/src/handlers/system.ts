import type { Context } from 'hono';
import type { Env, Config } from '../types';
import { MetadataService } from '../services/metadata';
import { CacheService, CacheKeys, CACHE_TTL } from '../services/cache';
import { dispatchImageDeletions, processPendingDeletionJobs, toDeletionTarget } from '../services/deletion';
import { successResponse, errorResponse } from '../utils/response';

// Default configuration
const DEFAULT_CONFIG: Config = {
  maxUploadCount: 50,
  maxFileSize: 70 * 1024 * 1024, // 70MB
  supportedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'avif'],
  imageQuality: 80
};

// POST /api/validate-api-key - Validate API key
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function validateApiKeyHandler(_c: Context<{ Bindings: Env }>): Promise<Response> {
  // If we reach here, the API key is already validated by middleware
  return successResponse({ valid: true });
}

// GET /api/config - Get configuration
export async function configHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const cache = new CacheService(c.env.CACHE_KV);
    const cacheKey = CacheKeys.config();

    // Try to get from cache
    const cached = await cache.get<{ config: Config }>(cacheKey);
    if (cached) {
      return successResponse(cached);
    }

    // Try to get custom config from D1
    const configResult = await c.env.DB.prepare(`
      SELECT key, value FROM config
    `).all<{ key: string; value: string }>();

    let responseData: { config: Config };

    if (configResult.results && configResult.results.length > 0) {
      const config: Record<string, number | string | string[]> = { ...DEFAULT_CONFIG };
      for (const row of configResult.results) {
        try {
          config[row.key] = JSON.parse(row.value);
        } catch {
          config[row.key] = row.value;
        }
      }
      responseData = { config: config as unknown as Config };
    } else {
      responseData = { config: DEFAULT_CONFIG };
    }

    // Store in cache
    await cache.set(cacheKey, responseData, CACHE_TTL.CONFIG);

    return successResponse(responseData);

  } catch (err) {
    console.error('Config handler error:', err);
    return successResponse({ config: DEFAULT_CONFIG });
  }
}

// POST /api/cleanup - Clean up expired images
export async function cleanupHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const metadata = new MetadataService(c.env.DB);
    const cache = new CacheService(c.env.CACHE_KV);

    c.executionCtx.waitUntil(
      processPendingDeletionJobs(c.env)
        .catch((err) => console.error('Pending deletion retry failed:', err))
    );

    // Get expired images
    const expiredImages = await metadata.getExpiredImages();
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

      c.executionCtx.waitUntil(
        dispatchImageDeletions(c.env, deletionTargets, 'expired')
          .catch((err) => console.error('Expired image deletion failed:', err))
      );
    }

    return successResponse({ deletedCount });

  } catch (err) {
    console.error('Cleanup handler error:', err);
    return errorResponse('Cleanup failed');
  }
}
