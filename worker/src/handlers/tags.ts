import type { Context } from 'hono';
import type { Env } from '../types';
import { MetadataService, type ImageDeletionTarget } from '../services/metadata';
import { CacheService, CacheKeys, CACHE_TTL } from '../services/cache';
import { dispatchImageDeletions, toDeletionTarget } from '../services/deletion';
import { successResponse, errorResponse } from '../utils/response';
import { isValidUUID, sanitizeTagName } from '../utils/validation';

const MAX_BATCH_IMAGE_IDS = 500;
const MAX_BATCH_TAGS = 50;

function normalizeTagRouteParam(raw: string | undefined): string | null {
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  const normalized = sanitizeTagName(decoded);
  if (!normalized) return null;

  const expected = decoded.toLowerCase().trim();
  if (expected !== normalized) return null;

  return normalized;
}

// GET /api/tags - Get all tags
export async function tagsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const cache = new CacheService(c.env.CACHE_KV);
    const cacheKey = CacheKeys.tagsList();

    // Try to get from cache
    interface TagsCacheData { tags: { name: string; count: number }[] }
    const cached = await cache.get<TagsCacheData>(cacheKey);
    if (cached) {
      return successResponse(cached);
    }

    const metadata = new MetadataService(c.env.DB);
    const tags = await metadata.getAllTags();

    const responseData: TagsCacheData = { tags };

    // Store in cache
    await cache.set(cacheKey, responseData, CACHE_TTL.TAGS_LIST);

    return successResponse(responseData);

  } catch (err) {
    console.error('Tags handler error:', err);
    return errorResponse('获取标签列表失败');
  }
}

// POST /api/tags - Create new tag
export async function createTagHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json();
    const name = sanitizeTagName(body.name || '');

    if (!name) {
      return errorResponse('标签名称不能为空');
    }

    const metadata = new MetadataService(c.env.DB);
    await metadata.createTag(name);

    // Invalidate tags cache
    const cache = new CacheService(c.env.CACHE_KV);
    await cache.invalidateTagsList();

    return successResponse({
      tag: { name, count: 0 }
    });

  } catch (err) {
    console.error('Create tag handler error:', err);
    return errorResponse('创建标签失败');
  }
}

// PUT /api/tags/:name - Rename tag
export async function renameTagHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const oldName = normalizeTagRouteParam(c.req.param('name'));
    const body = await c.req.json();
    const newName = sanitizeTagName(body.newName || '');

    if (!oldName) {
      return errorResponse('标签名称无效');
    }

    if (!newName) {
      return errorResponse('新标签名称不能为空');
    }

    if (oldName === newName) {
      return errorResponse('新名称不能与旧名称相同');
    }

    const metadata = new MetadataService(c.env.DB);
    const affectedCount = await metadata.renameTag(oldName, newName);

    // Invalidate caches (tag rename affects image list filtering)
    const cache = new CacheService(c.env.CACHE_KV);
    await cache.invalidateAfterTagChange();

    // Get updated count
    const tags = await metadata.getAllTags();
    const tag = tags.find(t => t.name === newName);

    return successResponse({
      tag: tag || { name: newName, count: affectedCount }
    });

  } catch (err) {
    console.error('Rename tag handler error:', err);
    return errorResponse('重命名标签失败');
  }
}

// DELETE /api/tags/:name - Delete tag and associated images
// D1 删除和缓存失效是同步的，R2 文件删除根据 USE_QUEUE 配置走 Queue 异步或同步处理
export async function deleteTagHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const name = normalizeTagRouteParam(c.req.param('name'));
    if (!name) {
      return errorResponse('标签名称无效');
    }
    console.log(`[deleteTag] start: name=${name}`);

    const metadata = new MetadataService(c.env.DB);

    // 1. 获取关联图片（一次查询，保存路径供队列使用）
    let images: Array<{
      id: string;
      paths: { original: string; webp: string | null; avif: string | null };
    }>;
    try {
      images = await metadata.getImagePathsByTag(name);
    } catch (err) {
      console.error(`[deleteTag] getImagePathsByTag failed: name=${name}`, err);
      throw err;
    }
    const imagePaths: ImageDeletionTarget[] = images.map(img => (
      toDeletionTarget(img.id, {
        original: img.paths.original,
        webp: img.paths.webp || undefined,
        avif: img.paths.avif || undefined,
      })
    ));
    console.log(`[deleteTag] images matched: name=${name} count=${imagePaths.length}`);

    // 2. 同步删除 D1 中的标签和图片元数据，并持久化 R2 删除任务
    let deletedImages: number;
    try {
      ({ deletedImages } = await metadata.deleteTagWithImages(name, imagePaths));
    } catch (err) {
      console.error(`[deleteTag] deleteTagWithImages failed: name=${name}`, err);
      throw err;
    }
    console.log(`[deleteTag] D1 delete completed: name=${name} deletedImages=${deletedImages}`);

    // 3. 同步失效 KV 缓存
    const cache = new CacheService(c.env.CACHE_KV);
    try {
      await Promise.all([
        cache.invalidateAfterTagChange(),
        cache.invalidateImageDetails(imagePaths.map((image) => image.id)),
      ]);
    } catch (err) {
      console.error(`[deleteTag] cache invalidation failed: name=${name}`, err);
      throw err;
    }

    // 4. 删除 R2 文件。失败会保留 deletion_jobs 供 cron/cleanup 重试
    if (imagePaths.length > 0) {
      c.executionCtx.waitUntil(
        dispatchImageDeletions(c.env, imagePaths, name)
          .catch((err) => console.error(`[deleteTag] background R2 deletion failed: name=${name}`, err))
      );
    }

    return successResponse({
      message: '标签及关联图片已删除',
      deletedImages
    });

  } catch (err) {
    console.error('Delete tag handler error:', err);
    return errorResponse('删除标签失败');
  }
}

// POST /api/tags/batch - Batch add/remove tags from images
export async function batchTagsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json();
    const { imageIds, addTags, removeTags } = body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return errorResponse('图片ID列表不能为空');
    }

    const stringImageIds = imageIds.filter((id: unknown): id is string => typeof id === 'string');

    if (stringImageIds.length !== imageIds.length || !stringImageIds.every(isValidUUID)) {
      return errorResponse('图片ID格式无效');
    }

    const normalizedImageIds = Array.from(new Set(stringImageIds));

    if (normalizedImageIds.length > MAX_BATCH_IMAGE_IDS) {
      return errorResponse(`一次最多更新 ${MAX_BATCH_IMAGE_IDS} 张图片`, 413);
    }

    const sanitizedAddTags = Array.from(new Set(
      (Array.isArray(addTags) ? addTags : [])
        .map((tag: unknown) => sanitizeTagName(typeof tag === 'string' ? tag : String(tag)))
        .filter(Boolean)
    ));
    const sanitizedRemoveTags = Array.from(new Set(
      (Array.isArray(removeTags) ? removeTags : [])
        .map((tag: unknown) => sanitizeTagName(typeof tag === 'string' ? tag : String(tag)))
        .filter(Boolean)
    ));

    if (sanitizedAddTags.length > MAX_BATCH_TAGS || sanitizedRemoveTags.length > MAX_BATCH_TAGS) {
      return errorResponse(`一次最多添加或删除 ${MAX_BATCH_TAGS} 个标签`, 413);
    }

    if (sanitizedAddTags.length === 0 && sanitizedRemoveTags.length === 0) {
      return errorResponse('必须提供要添加或删除的标签');
    }

    const metadata = new MetadataService(c.env.DB);
    const updatedCount = await metadata.batchUpdateTags(normalizedImageIds, sanitizedAddTags, sanitizedRemoveTags);

    // Invalidate caches
    const cache = new CacheService(c.env.CACHE_KV);
    await Promise.all([
      cache.invalidateAfterTagChange(),
      cache.invalidateImageDetails(normalizedImageIds),
    ]);

    return successResponse({ updatedCount });

  } catch (err) {
    console.error('Batch tags handler error:', err);
    return errorResponse('更新标签失败');
  }
}
