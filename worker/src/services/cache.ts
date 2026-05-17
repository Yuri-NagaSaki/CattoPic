// Cache TTL constants (seconds)
export const CACHE_TTL = {
  IMAGES_LIST: 3600,     // 1 hour (主动失效为主)
  IMAGE_DETAIL: 3600,    // 1 hour
  TAGS_LIST: 3600,       // 1 hour
  CONFIG: 86400,         // 1 day
} as const;

// Cache key generators
export const CacheKeys = {
  // Use empty string instead of 'all' to avoid collision with actual 'all' tag/orientation
  imagesList: (page: number, limit: number, tag?: string, orientation?: string, format?: string) =>
    `images:list:${page}:${limit}:${tag ?? ''}:${orientation ?? ''}:${format ?? ''}`,

  imageDetail: (id: string) => `images:detail:${id}`,

  tagsList: () => 'tags:list',

  config: () => 'config',

  // Prefix for batch invalidation
  imagesListPrefix: () => 'images:list:',
};

export class CacheService {
  constructor(private kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.kv.get(key, 'json');
      return cached as T | null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.kv.put(key, JSON.stringify(value), {
        expirationTtl: ttlSeconds,
      });
    } catch (err) {
      console.error('Cache set error:', err);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch (err) {
      console.error('Cache delete error:', err);
    }
  }

  // Invalidate all keys with a given prefix
  async invalidateByPrefix(prefix: string): Promise<void> {
    try {
      const list = await this.kv.list({ prefix });
      const deletePromises = list.keys.map(k => this.kv.delete(k.name));
      await Promise.all(deletePromises);
    } catch (err) {
      console.error('Cache invalidateByPrefix error:', err);
    }
  }

  // Convenience method: invalidate all image list caches
  async invalidateImagesList(): Promise<void> {
    await this.invalidateByPrefix(CacheKeys.imagesListPrefix());
  }

  // Convenience method: invalidate single image detail cache
  async invalidateImageDetail(id: string): Promise<void> {
    await this.delete(CacheKeys.imageDetail(id));
  }

  async invalidateImageDetails(ids: string[]): Promise<void> {
    const chunkSize = 100;
    for (let i = 0; i < ids.length; i += chunkSize) {
      await Promise.all(
        ids.slice(i, i + chunkSize).map((id) => this.invalidateImageDetail(id))
      );
    }
  }

  // Convenience method: invalidate tags list cache
  async invalidateTagsList(): Promise<void> {
    await this.delete(CacheKeys.tagsList());
  }

  // Convenience method: invalidate all related caches after image operations
  async invalidateAfterImageChange(imageId?: string): Promise<void> {
    const promises: Promise<void>[] = [this.invalidateImagesList()];
    if (imageId) {
      promises.push(this.invalidateImageDetail(imageId));
    }
    await Promise.all(promises);
  }

  // Convenience method: invalidate all related caches after tag operations
  async invalidateAfterTagChange(): Promise<void> {
    await Promise.all([
      this.invalidateTagsList(),
      this.invalidateImagesList(), // Tag changes may affect image list filtering
    ]);
  }
}
