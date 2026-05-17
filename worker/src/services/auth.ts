// D1 Authentication Service
export class AuthService {
  constructor(private db: D1Database) {}

  static timingSafeEqual(a: string, b: string | undefined): boolean {
    if (!b) return false;

    const encoder = new TextEncoder();
    const aBytes = encoder.encode(a);
    const bBytes = encoder.encode(b);
    const length = Math.max(aBytes.length, bBytes.length);
    let diff = aBytes.length ^ bBytes.length;

    for (let i = 0; i < length; i++) {
      diff |= (aBytes[i] || 0) ^ (bBytes[i] || 0);
    }

    return diff === 0;
  }

  async validateApiKey(key: string): Promise<boolean> {
    if (!key) return false;

    const result = await this.db.prepare(`
      SELECT id FROM api_keys WHERE key = ? LIMIT 1
    `).bind(key).first<{ id: number }>();

    return result !== null;
  }

  async recordApiKeyUsage(key: string): Promise<void> {
    if (!key) return;

    await this.db.prepare(`
      UPDATE api_keys SET last_used_at = ? WHERE key = ?
    `).bind(new Date().toISOString(), key).run();
  }

  async addApiKey(key: string): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO api_keys (key, created_at) VALUES (?, ?)
    `).bind(key, new Date().toISOString()).run();
  }

  async removeApiKey(key: string): Promise<void> {
    await this.db.prepare(`
      DELETE FROM api_keys WHERE key = ?
    `).bind(key).run();
  }

  async listApiKeys(): Promise<string[]> {
    const result = await this.db.prepare(`
      SELECT key FROM api_keys ORDER BY created_at DESC
    `).all<{ key: string }>();
    return result.results?.map(r => r.key) || [];
  }

  // Extract API key from Authorization header
  static extractApiKey(authHeader: string | null): string | null {
    if (!authHeader) return null;

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
  }
}
