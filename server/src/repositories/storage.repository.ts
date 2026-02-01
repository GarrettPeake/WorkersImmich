/**
 * StorageRepository — R2-based storage operations.
 *
 * Replaces the original filesystem-based repository with Cloudflare R2 operations.
 * All methods are async and work with R2 keys (forward-slash separated paths).
 * No node:fs, node:path, or node:stream imports.
 */

export class StorageRepository {
  constructor(private bucket: R2Bucket) {}

  async readFile(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key);
  }

  async writeFile(
    key: string,
    body: ReadableStream | ArrayBuffer | Uint8Array,
    options?: {
      contentType?: string;
      customMetadata?: Record<string, string>;
    },
  ): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
      customMetadata: options?.customMetadata,
    });
  }

  async deleteFile(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async deleteFiles(keys: string[]): Promise<void> {
    // R2 supports batch delete of up to 1000 keys
    const BATCH_SIZE = 1000;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      await this.bucket.delete(batch);
    }
  }

  async fileExists(key: string): Promise<boolean> {
    const head = await this.bucket.head(key);
    return head !== null;
  }

  async getFileInfo(key: string): Promise<R2Object | null> {
    return this.bucket.head(key);
  }

  async listFiles(
    prefix: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{
    objects: R2Object[];
    cursor?: string;
    truncated: boolean;
  }> {
    const result = await this.bucket.list({
      prefix,
      limit: options?.limit || 1000,
      cursor: options?.cursor,
    });
    return {
      objects: result.objects,
      cursor: result.truncated ? result.cursor : undefined,
      truncated: result.truncated,
    };
  }

  async copyFile(sourceKey: string, destKey: string): Promise<void> {
    const source = await this.bucket.get(sourceKey);
    if (!source) {
      throw new Error(`Source not found: ${sourceKey}`);
    }
    await this.bucket.put(destKey, source.body, {
      httpMetadata: source.httpMetadata,
      customMetadata: source.customMetadata,
    });
  }

  async moveFile(sourceKey: string, destKey: string): Promise<void> {
    await this.copyFile(sourceKey, destKey);
    await this.bucket.delete(sourceKey);
  }
}
