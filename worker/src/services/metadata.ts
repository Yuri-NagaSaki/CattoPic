import type { ImageMetadata, ImageFilters, Tag, ImageRow } from '../types';
import type { ImagePaths } from '../types/queue';

export interface ImageDeletionTarget {
  id: string;
  paths: ImagePaths;
}

export interface DeletionJob extends ImageDeletionTarget {
  attempts: number;
  lastError?: string;
}

interface ImageUpdateFields {
  tags?: string[];
  expiryTime?: string | null;
}

const D1_BATCH_CHUNK_SIZE = 80;

// D1 Metadata Service
export class MetadataService {
  constructor(private db: D1Database) {}

  private async ensureDeletionJobsSchema(): Promise<void> {
    await this.db.batch([
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS deletion_jobs (
          id TEXT PRIMARY KEY,
          image_id TEXT NOT NULL UNIQUE,
          paths_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        )
      `),
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_deletion_jobs_created_at
        ON deletion_jobs(attempts, created_at)
      `),
    ]);
  }

  // === Image CRUD ===

  async saveImage(metadata: ImageMetadata): Promise<void> {
    const statements: D1PreparedStatement[] = [];

    // 1. Insert image record
    statements.push(
      this.db.prepare(`
        INSERT INTO images (
          id, original_name, upload_time, expiry_time, orientation,
          format, width, height, path_original, path_webp, path_avif,
          size_original, size_webp, size_avif
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        metadata.id,
        metadata.originalName,
        metadata.uploadTime,
        metadata.expiryTime || null,
        metadata.orientation,
        metadata.format,
        metadata.width,
        metadata.height,
        metadata.paths.original,
        metadata.paths.webp || null,
        metadata.paths.avif || null,
        metadata.sizes.original,
        metadata.sizes.webp,
        metadata.sizes.avif
      )
    );

    // 2. Ensure tags exist and create associations
    for (const tag of metadata.tags) {
      statements.push(
        this.db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).bind(tag)
      );
      statements.push(
        this.db.prepare(`
          INSERT INTO image_tags (image_id, tag_id)
          SELECT ?, id FROM tags WHERE name = ?
        `).bind(metadata.id, tag)
      );
    }

    await this.db.batch(statements);
  }

  async getImage(id: string): Promise<ImageMetadata | null> {
    const now = new Date().toISOString();

    // Batch: execute image and tags queries in parallel
    const [imageResult, tagsResult] = await this.db.batch([
      this.db.prepare(`
        SELECT * FROM images
        WHERE id = ? AND (expiry_time IS NULL OR expiry_time > ?)
      `).bind(id, now),
      this.db.prepare(`
        SELECT t.name FROM tags t
        JOIN image_tags it ON t.id = it.tag_id
        WHERE it.image_id = ?
      `).bind(id)
    ]);

    const image = (imageResult as D1Result<ImageRow>).results?.[0];
    if (!image) return null;

    const tags = ((tagsResult as D1Result<{ name: string }>).results || []).map(t => t.name);
    return this.rowToMetadata(image, tags);
  }

  async updateImage(id: string, updates: ImageUpdateFields): Promise<ImageMetadata | null> {
    const now = new Date().toISOString();

    // Batch: get image and tags in parallel (avoid separate getImage call)
    const [imageResult, tagsResult] = await this.db.batch([
      this.db.prepare(`
        SELECT * FROM images
        WHERE id = ? AND (expiry_time IS NULL OR expiry_time > ?)
      `).bind(id, now),
      this.db.prepare(`
        SELECT t.name FROM tags t
        JOIN image_tags it ON t.id = it.tag_id
        WHERE it.image_id = ?
      `).bind(id)
    ]);

    const image = (imageResult as D1Result<ImageRow>).results?.[0];
    if (!image) return null;

    const currentTags = ((tagsResult as D1Result<{ name: string }>).results || []).map(t => t.name);
    const statements: D1PreparedStatement[] = [];
    let finalTags = currentTags;
    let finalExpiryTime = image.expiry_time;

    // Handle tag changes
    if (updates.tags !== undefined) {
      const oldTags = new Set(currentTags);
      const newTags = new Set(updates.tags);
      finalTags = updates.tags;

      // Remove old tag associations
      for (const tag of oldTags) {
        if (!newTags.has(tag)) {
          statements.push(
            this.db.prepare(`
              DELETE FROM image_tags WHERE image_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)
            `).bind(id, tag)
          );
        }
      }

      // Add new tag associations
      for (const tag of newTags) {
        if (!oldTags.has(tag)) {
          statements.push(
            this.db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).bind(tag)
          );
          statements.push(
            this.db.prepare(`
              INSERT OR IGNORE INTO image_tags (image_id, tag_id)
              SELECT ?, id FROM tags WHERE name = ?
            `).bind(id, tag)
          );
        }
      }
    }

    // Update expiry time
    if (updates.expiryTime !== undefined) {
      finalExpiryTime = updates.expiryTime;
      statements.push(
        this.db.prepare(`UPDATE images SET expiry_time = ? WHERE id = ?`)
          .bind(finalExpiryTime, id)
      );
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }

    // Return constructed metadata without re-reading from database
    return this.rowToMetadata({ ...image, expiry_time: finalExpiryTime }, finalTags);
  }

  async deleteImage(id: string): Promise<boolean> {
    const result = await this.db.prepare(`
      DELETE FROM images WHERE id = ?
    `).bind(id).run();

    // ON DELETE CASCADE handles image_tags cleanup
    return result.success && (result.meta?.changes || 0) > 0;
  }

  async deleteImagesWithDeletionJobs(targets: ImageDeletionTarget[]): Promise<number> {
    if (targets.length === 0) return 0;

    await this.ensureDeletionJobsSchema();

    const createdAt = new Date().toISOString();
    let deletedCount = 0;

    for (let i = 0; i < targets.length; i += D1_BATCH_CHUNK_SIZE) {
      const chunk = targets.slice(i, i + D1_BATCH_CHUNK_SIZE);
      const ids = chunk.map((target) => target.id);
      const placeholders = ids.map(() => '?').join(',');
      const statements: D1PreparedStatement[] = chunk.map((target) =>
        this.db.prepare(`
          INSERT OR IGNORE INTO deletion_jobs (
            id, image_id, paths_json, created_at, attempts, last_error
          ) VALUES (?, ?, ?, ?, 0, NULL)
        `).bind(
          crypto.randomUUID(),
          target.id,
          JSON.stringify(target.paths),
          createdAt
        )
      );

      statements.push(
        this.db.prepare(`
          DELETE FROM images WHERE id IN (${placeholders})
        `).bind(...ids)
      );

      const results = await this.db.batch(statements);
      const deleteResult = results[results.length - 1] as D1Result;
      deletedCount += deleteResult.meta?.changes || 0;
    }

    return deletedCount;
  }

  async completeDeletionJobsForImages(imageIds: string[]): Promise<void> {
    if (imageIds.length === 0) return;

    await this.ensureDeletionJobsSchema();

    for (let i = 0; i < imageIds.length; i += D1_BATCH_CHUNK_SIZE) {
      const chunk = imageIds.slice(i, i + D1_BATCH_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      await this.db.prepare(`
        DELETE FROM deletion_jobs WHERE image_id IN (${placeholders})
      `).bind(...chunk).run();
    }
  }

  async recordDeletionJobFailureForImages(imageIds: string[], error: string): Promise<void> {
    if (imageIds.length === 0) return;

    await this.ensureDeletionJobsSchema();

    const failedAt = new Date().toISOString();
    const lastError = error.slice(0, 500);
    for (let i = 0; i < imageIds.length; i += D1_BATCH_CHUNK_SIZE) {
      const chunk = imageIds.slice(i, i + D1_BATCH_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      await this.db.prepare(`
        UPDATE deletion_jobs
        SET attempts = attempts + 1,
            last_error = ?,
            updated_at = ?
        WHERE image_id IN (${placeholders})
      `).bind(lastError, failedAt, ...chunk).run();
    }
  }

  async getPendingDeletionJobs(limit = 100): Promise<DeletionJob[]> {
    await this.ensureDeletionJobsSchema();

    const result = await this.db.prepare(`
      SELECT image_id, paths_json, attempts, last_error
      FROM deletion_jobs
      ORDER BY attempts ASC, created_at ASC
      LIMIT ?
    `).bind(Math.max(1, Math.min(500, Math.trunc(limit)))).all<{
      image_id: string;
      paths_json: string;
      attempts: number;
      last_error: string | null;
    }>();

    const jobs: DeletionJob[] = [];
    for (const row of result.results || []) {
      try {
        const paths = JSON.parse(row.paths_json) as ImagePaths;
        if (!paths.original) continue;
        jobs.push({
          id: row.image_id,
          paths,
          attempts: row.attempts,
          lastError: row.last_error || undefined,
        });
      } catch (err) {
        console.error('Invalid deletion job payload:', row.image_id, err);
      }
    }

    return jobs;
  }

  // === Image Queries ===

  async getImageIds(orientation?: string): Promise<string[]> {
    let query = 'SELECT id FROM images WHERE (expiry_time IS NULL OR expiry_time > ?)';
    const params: string[] = [new Date().toISOString()];

    if (orientation) {
      query += ' AND orientation = ?';
      params.push(orientation);
    }

    query += ' ORDER BY upload_time DESC';

    const result = await this.db.prepare(query).bind(...params).all<{ id: string }>();
    return result.results?.map(r => r.id) || [];
  }

  async getImages(filters: ImageFilters): Promise<{ images: ImageMetadata[]; total: number }> {
    const { page = 1, limit = 12, tag, orientation, format } = filters;
    const offset = (page - 1) * limit;

    let baseQuery = 'FROM images i';
    const whereConditions: string[] = ['(i.expiry_time IS NULL OR i.expiry_time > ?)'];
    const params: (string | number)[] = [new Date().toISOString()];

    if (tag) {
      baseQuery += ' JOIN image_tags it ON i.id = it.image_id JOIN tags t ON it.tag_id = t.id';
      whereConditions.push('t.name = ?');
      params.push(tag);
    }

    if (orientation) {
      whereConditions.push('i.orientation = ?');
      params.push(orientation);
    }

    if (format && format !== 'all') {
      switch (format) {
        case 'gif':
          whereConditions.push('i.format = ?');
          params.push('gif');
          break;
        case 'webp':
          whereConditions.push('(i.format = ? OR i.path_webp IS NOT NULL)');
          params.push('webp');
          break;
        case 'avif':
          whereConditions.push('(i.format = ? OR i.path_avif IS NOT NULL)');
          params.push('avif');
          break;
        case 'original':
          whereConditions.push('i.path_webp IS NULL AND i.path_avif IS NULL');
          break;
      }
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Get total count
    const countResult = await this.db.prepare(
      `SELECT COUNT(DISTINCT i.id) as count ${baseQuery} ${whereClause}`
    ).bind(...params).first<{ count: number }>();

    const total = countResult?.count || 0;

    // Get paginated data
    const imagesResult = await this.db.prepare(`
      SELECT DISTINCT i.* ${baseQuery} ${whereClause}
      ORDER BY i.upload_time DESC LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<ImageRow>();

    const images = await this.enrichWithTags(imagesResult.results || []);

    return { images, total };
  }

  async getRandomImage(filters?: {
    tags?: string[];
    exclude?: string[];
    orientation?: string;
  }): Promise<ImageMetadata | null> {
    // Build base query and conditions
    const hasTagFilter = filters?.tags?.length;
    const hasExcludeFilter = filters?.exclude?.length;
    const joinClause = hasTagFilter
      ? 'JOIN image_tags it ON i.id = it.image_id JOIN tags t ON it.tag_id = t.id'
      : '';

    const whereConditions: string[] = ['(i.expiry_time IS NULL OR i.expiry_time > ?)'];
    const params: (string | number)[] = [new Date().toISOString()];

    // Tag filter (AND logic)
    if (hasTagFilter) {
      const placeholders = filters.tags!.map(() => '?').join(',');
      whereConditions.push(`t.name IN (${placeholders})`);
      params.push(...filters.tags!);
    }

    // Exclude tags
    if (hasExcludeFilter) {
      const placeholders = filters.exclude!.map(() => '?').join(',');
      whereConditions.push(`i.id NOT IN (
        SELECT it2.image_id FROM image_tags it2
        JOIN tags t2 ON it2.tag_id = t2.id
        WHERE t2.name IN (${placeholders})
      )`);
      params.push(...filters.exclude!);
    }

    // Orientation filter
    if (filters?.orientation) {
      whereConditions.push('i.orientation = ?');
      params.push(filters.orientation);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // For AND logic on tags, need GROUP BY and HAVING
    let groupClause = '';
    if (hasTagFilter) {
      groupClause = ` GROUP BY i.id HAVING COUNT(DISTINCT t.name) = ?`;
      params.push(filters.tags!.length);
    }

    // 优化：使用 ORDER BY RANDOM() 一次查询完成，避免 3 次 DB 往返
    // 对于中小规模数据集（< 10000），这比 COUNT + OFFSET 方案更高效
    const result = await this.db.prepare(`
      SELECT i.* FROM images i ${joinClause} ${whereClause} ${groupClause}
      ORDER BY RANDOM()
      LIMIT 1
    `).bind(...params).first<ImageRow>();

    if (!result) return null;

    // 使用 enrichWithTags 获取标签（单次额外查询）
    const enriched = await this.enrichWithTags([result]);
    return enriched[0] || null;
  }

  // === Tag Management ===

  async getAllTags(options?: { limit?: number }): Promise<Tag[]> {
    const limit = options?.limit ?? 1000; // Sensible default to prevent unbounded queries
    const now = new Date().toISOString();

    const result = await this.db.prepare(`
      SELECT t.name, COUNT(i.id) as count
      FROM tags t
      LEFT JOIN image_tags it ON t.id = it.tag_id
      LEFT JOIN images i ON it.image_id = i.id
        AND (i.expiry_time IS NULL OR i.expiry_time > ?)
      GROUP BY t.id, t.name
      ORDER BY t.name
      LIMIT ?
    `).bind(now, limit).all<{ name: string; count: number }>();

    return result.results || [];
  }

  async createTag(name: string): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO tags (name) VALUES (?)
    `).bind(name).run();
  }

  async renameTag(oldName: string, newName: string): Promise<number> {
    const now = new Date().toISOString();

    // Get count of affected images
    const countResult = await this.db.prepare(`
      SELECT COUNT(i.id) as count FROM image_tags it
      JOIN tags t ON it.tag_id = t.id
      JOIN images i ON it.image_id = i.id
      WHERE t.name = ? AND (i.expiry_time IS NULL OR i.expiry_time > ?)
    `).bind(oldName, now).first<{ count: number }>();

    // Rename the tag
    await this.db.prepare(`
      UPDATE tags SET name = ? WHERE name = ?
    `).bind(newName, oldName).run();

    return countResult?.count || 0;
  }

  async deleteTag(name: string): Promise<number> {
    // Get count of affected images
    const countResult = await this.db.prepare(`
      SELECT COUNT(*) as count FROM image_tags it
      JOIN tags t ON it.tag_id = t.id WHERE t.name = ?
    `).bind(name).first<{ count: number }>();

    // Delete the tag (ON DELETE CASCADE handles image_tags)
    await this.db.prepare(`
      DELETE FROM tags WHERE name = ?
    `).bind(name).run();

    return countResult?.count || 0;
  }

  async getImagesByTag(tagName: string): Promise<ImageMetadata[]> {
    const now = new Date().toISOString();

    const result = await this.db.prepare(`
      SELECT i.* FROM images i
      JOIN image_tags it ON i.id = it.image_id
      JOIN tags t ON it.tag_id = t.id
      WHERE t.name = ? AND (i.expiry_time IS NULL OR i.expiry_time > ?)
    `).bind(tagName, now).all<ImageRow>();

    return this.enrichWithTags(result.results || []);
  }

  /**
   * Get minimal image info needed for deleting files, without loading tag lists.
   * This avoids large IN(...) placeholder lists which can exceed D1's variable limit.
   */
  async getImagePathsByTag(tagName: string): Promise<Array<{
    id: string;
    paths: { original: string; webp: string | null; avif: string | null };
  }>> {
    const result = await this.db.prepare(`
      SELECT DISTINCT
        i.id,
        i.path_original,
        i.path_webp,
        i.path_avif
      FROM images i
      JOIN image_tags it ON i.id = it.image_id
      JOIN tags t ON it.tag_id = t.id
      WHERE t.name = ?
    `).bind(tagName).all<{
      id: string;
      path_original: string;
      path_webp: string | null;
      path_avif: string | null;
    }>();

    return (result.results || []).map((row) => ({
      id: row.id,
      paths: {
        original: row.path_original,
        webp: row.path_webp,
        avif: row.path_avif,
      },
    }));
  }

  /**
   * Delete a tag and all images associated with it.
   * Uses subqueries to avoid exceeding SQLite/D1 variable limits.
   */
  async deleteTagWithImages(
    name: string,
    targets: ImageDeletionTarget[]
  ): Promise<{ deletedImages: number }> {
    const deletedImages = await this.deleteImagesWithDeletionJobs(targets);

    // Delete the tag itself (CASCADE cleans up any remaining image_tags).
    await this.db.prepare(`
      DELETE FROM tags WHERE name = ?
    `).bind(name).run();

    return { deletedImages };
  }

  async batchUpdateTags(imageIds: string[], addTags: string[], removeTags: string[]): Promise<number> {
    if (imageIds.length === 0) return 0;

    const statements: D1PreparedStatement[] = [];

    // 1. Ensure all new tags exist (small fixed cost)
    for (const tag of addTags) {
      statements.push(
        this.db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).bind(tag)
      );
    }

    // Execute tag creation first if needed
    if (statements.length > 0) {
      await this.db.batch(statements);
    }

    for (let i = 0; i < imageIds.length; i += D1_BATCH_CHUNK_SIZE) {
      const chunk = imageIds.slice(i, i + D1_BATCH_CHUNK_SIZE);

      // 2. Bulk remove within D1 variable limits.
      if (removeTags.length > 0) {
        const imgPlaceholders = chunk.map(() => '?').join(',');
        const tagPlaceholders = removeTags.map(() => '?').join(',');
        await this.db.prepare(`
          DELETE FROM image_tags
          WHERE image_id IN (${imgPlaceholders})
          AND tag_id IN (SELECT id FROM tags WHERE name IN (${tagPlaceholders}))
        `).bind(...chunk, ...removeTags).run();
      }

      // 3. Bulk add: one INSERT per tag and image chunk.
      if (addTags.length > 0) {
        const addStatements: D1PreparedStatement[] = [];
        const imageUnion = `SELECT ? AS image_id ${chunk.slice(1).map(() => 'UNION ALL SELECT ?').join(' ')}`;
        for (const tag of addTags) {
          addStatements.push(
            this.db.prepare(`
              INSERT OR IGNORE INTO image_tags (image_id, tag_id)
              SELECT image_id, (SELECT id FROM tags WHERE name = ?)
              FROM (${imageUnion})
            `).bind(tag, ...chunk)
          );
        }
        await this.db.batch(addStatements);
      }
    }

    return imageIds.length;
  }

  // === Cleanup ===

  async getExpiredImages(limit = 100): Promise<ImageMetadata[]> {
    const now = new Date().toISOString();

    const result = await this.db.prepare(`
      SELECT * FROM images WHERE expiry_time IS NOT NULL AND expiry_time < ?
      ORDER BY expiry_time ASC
      LIMIT ?
    `).bind(now, Math.max(1, Math.min(500, Math.trunc(limit)))).all<ImageRow>();

    return this.enrichWithTags(result.results || []);
  }

  // === Private Helper Methods ===

  private rowToMetadata(row: ImageRow, tags: string[]): ImageMetadata {
    return {
      id: row.id,
      originalName: row.original_name,
      uploadTime: row.upload_time,
      expiryTime: row.expiry_time || undefined,
      orientation: row.orientation as 'landscape' | 'portrait',
      tags,
      format: row.format,
      width: row.width,
      height: row.height,
      paths: {
        original: row.path_original,
        webp: row.path_webp || '',
        avif: row.path_avif || ''
      },
      sizes: {
        original: row.size_original,
        webp: row.size_webp,
        avif: row.size_avif
      }
    };
  }

  private async enrichWithTags(rows: ImageRow[]): Promise<ImageMetadata[]> {
    if (rows.length === 0) return [];

    const imageIds = rows.map(r => r.id);
    const tagMap = new Map<string, string[]>();

    // D1/SQLite has a limit on the number of bound variables per statement.
    // Chunk to avoid `too many SQL variables` for large tag/image sets.
    const chunkSize = 90;

    for (let i = 0; i < imageIds.length; i += chunkSize) {
      const chunk = imageIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');

      const tagsResult = await this.db.prepare(`
        SELECT it.image_id, t.name FROM image_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE it.image_id IN (${placeholders})
      `).bind(...chunk).all<{ image_id: string; name: string }>();

      for (const row of tagsResult.results || []) {
        if (!tagMap.has(row.image_id)) {
          tagMap.set(row.image_id, []);
        }
        tagMap.get(row.image_id)!.push(row.name);
      }
    }

    return rows.map(row => this.rowToMetadata(row, tagMap.get(row.id) || []));
  }
}
