import type { Context } from 'hono';
import type { Env } from '../types';
import { MetadataService } from '../services/metadata';
import { StorageService } from '../services/storage';
import { CacheService, CacheKeys, CACHE_TTL } from '../services/cache';
import { successResponse, errorResponse } from '../utils/response';
import { sanitizeTagName } from '../utils/validation';

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
    let images;
    try {
      images = await metadata.getImagePathsByTag(name);
    } catch (err) {
      console.error(`[deleteTag] getImagePathsByTag failed: name=${name}`, err);
      throw err;
    }
    const imagePaths = images.map(img => ({
      id: img.id,
      paths: {
        original: img.paths.original,
        webp: img.paths.webp || undefined,
        avif: img.paths.avif || undefined,
      },
    }));
    console.log(`[deleteTag] images matched: name=${name} count=${imagePaths.length}`);

    // 2. 同步删除 D1 中的标签和图片元数据
    let deletedImages: number;
    try {
      ({ deletedImages } = await metadata.deleteTagWithImages(name));
    } catch (err) {
      console.error(`[deleteTag] deleteTagWithImages failed: name=${name}`, err);
      throw err;
    }
    console.log(`[deleteTag] D1 delete completed: name=${name} deletedImages=${deletedImages}`);

    // 3. 同步失效 KV 缓存
    const cache = new CacheService(c.env.CACHE_KV);
    try {
      await cache.invalidateAfterTagChange();
    } catch (err) {
      console.error(`[deleteTag] cache invalidation failed: name=${name}`, err);
      throw err;
    }

    // 4. 删除 R2 文件
    if (imagePaths.length > 0) {
      if (c.env.USE_QUEUE === 'true' && c.env.DELETE_QUEUE) {
        // Async via Queue (chunked)
        const chunkSize = 50;
        for (let i = 0; i < imagePaths.length; i += chunkSize) {
          const chunk = imagePaths.slice(i, i + chunkSize);
          try {
            await c.env.DELETE_QUEUE.send({
              type: 'delete_tag_images',
              tagName: name,
              imagePaths: chunk,
            });
          } catch (err) {
            console.error(`[deleteTag] queue send failed: name=${name} chunk=${i}-${i + chunk.length - 1}`, err);
            throw err;
          }
        }
        console.log(`[deleteTag] queued R2 deletions: name=${name} chunks=${Math.ceil(imagePaths.length / chunkSize)}`);
      } else {
        // Sync direct R2 deletion
        const storage = new StorageService(c.env.R2_BUCKET);
        await Promise.all(imagePaths.map(img => storage.deleteImageFiles(img.paths)));
        console.log(`[deleteTag] sync R2 deletions completed: name=${name} count=${imagePaths.length}`);
      }
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

    const sanitizedAddTags = (addTags || []).map(sanitizeTagName).filter(Boolean);
    const sanitizedRemoveTags = (removeTags || []).map(sanitizeTagName).filter(Boolean);

    if (sanitizedAddTags.length === 0 && sanitizedRemoveTags.length === 0) {
      return errorResponse('必须提供要添加或删除的标签');
    }

    const metadata = new MetadataService(c.env.DB);
    const updatedCount = await metadata.batchUpdateTags(imageIds, sanitizedAddTags, sanitizedRemoveTags);

    // Invalidate caches
    const cache = new CacheService(c.env.CACHE_KV);
    await cache.invalidateAfterTagChange();

    return successResponse({ updatedCount });

  } catch (err) {
    console.error('Batch tags handler error:', err);
    return errorResponse('更新标签失败');
  }
}
