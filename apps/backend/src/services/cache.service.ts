import sqlite3 from 'sqlite3';
import path from 'path';

const { Database } = sqlite3;

export class CacheService {
  private db: sqlite3.Database;

  constructor(dbPath: string = './cache.db') {
    // Use absolute path to ensure the database file is created in the right location
    const absolutePath = path.resolve(process.cwd(), dbPath);
    this.db = new Database(absolutePath);

    // Ensure the database is ready before proceeding
    this.initDatabase();
  }

  private initDatabase(): void {
    // Ensure the table exists - synchronous approach for constructor
    this.db.serialize(() => {
      // Create cache table if it doesn't exist
      this.db.run(`
        CREATE TABLE IF NOT EXISTS cache (
          key TEXT PRIMARY KEY,
          value TEXT,
          expires_at INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Create index on expires_at for efficient cleanup
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache (expires_at)
      `);
    });

    // Clean up expired entries periodically
    this.scheduleCleanup();
  }

  private scheduleCleanup(): void {
    // Clean up expired entries every 10 minutes
    setInterval(() => {
      this.cleanupExpired();
    }, 10 * 60 * 1000); // 10 minutes
  }

  private cleanupExpired(): void {
    const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
    this.db.run('DELETE FROM cache WHERE expires_at < ?', [now]);
  }

  async get(key: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT value FROM cache WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)',
        [key, Math.floor(Date.now() / 1000)],
        (err, row: { value: string } | undefined) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? JSON.parse(row.value) : null);
          }
        }
      );
    });
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds 
      ? Math.floor(Date.now() / 1000) + ttlSeconds 
      : null;
      
    const serializedValue = JSON.stringify(value);

    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)',
        [key, serializedValue, expiresAt],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async delete(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM cache WHERE key = ?', [key], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM cache', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}