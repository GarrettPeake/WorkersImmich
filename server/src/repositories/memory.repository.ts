/**
 * Memory repository -- Workers/D1-compatible version.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No jsonArrayFrom from kysely/helpers/postgres
 * - No luxon DateTime -- use plain Date/string
 * - No @Injectable, @InjectKysely, @GenerateSql, @Chunked decorators
 * - Separate queries for assets instead of nested json builders
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import { sql } from 'kysely';
import type { DB, MemoryTable } from 'src/schema';

const CHUNK_SIZE = 500;

export class MemoryRepository {
  constructor(private db: Kysely<DB>) {}

  async search(ownerId: string, dto: any) {
    let query = this.db
      .selectFrom('memory')
      .selectAll('memory')
      .where('ownerId', '=', ownerId);

    if (dto.isSaved !== undefined) {
      query = query.where('isSaved', '=', dto.isSaved ? 1 : 0);
    }
    if (dto.type !== undefined) {
      query = query.where('type', '=', dto.type);
    }
    if (dto.for !== undefined) {
      query = query
        .where((eb) => eb.or([eb('showAt', 'is', null), eb('showAt', '<=', dto.for)]))
        .where((eb) => eb.or([eb('hideAt', 'is', null), eb('hideAt', '>=', dto.for)]));
    }

    const isTrashed = dto.isTrashed ?? false;
    if (isTrashed) {
      query = query.where('deletedAt', 'is not', null);
    } else {
      query = query.where('deletedAt', 'is', null);
    }

    if (dto.order === 'random') {
      query = query.orderBy(sql`RANDOM()`);
    } else {
      query = query.orderBy('memoryAt', dto.order?.toLowerCase() || 'desc');
    }

    if (dto.size !== undefined) {
      query = query.limit(dto.size);
    }

    const memories = await query.execute();
    return this.enrichMemories(memories);
  }

  async statistics(ownerId: string, dto: any) {
    let query = this.db
      .selectFrom('memory')
      .where('ownerId', '=', ownerId);

    if (dto.isSaved !== undefined) {
      query = query.where('isSaved', '=', dto.isSaved ? 1 : 0);
    }
    if (dto.type !== undefined) {
      query = query.where('type', '=', dto.type);
    }
    if (dto.for !== undefined) {
      query = query
        .where((eb) => eb.or([eb('showAt', 'is', null), eb('showAt', '<=', dto.for)]))
        .where((eb) => eb.or([eb('hideAt', 'is', null), eb('hideAt', '>=', dto.for)]));
    }

    const isTrashed = dto.isTrashed ?? false;
    if (isTrashed) {
      query = query.where('deletedAt', 'is not', null);
    } else {
      query = query.where('deletedAt', 'is', null);
    }

    const result = await query
      .select((eb) => eb.fn.count('id').as('total'))
      .executeTakeFirstOrThrow();

    return { total: Number(result.total) };
  }

  async get(id: string) {
    const memory = await this.db
      .selectFrom('memory')
      .selectAll('memory')
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!memory) {
      return undefined;
    }

    const assets = await this.db
      .selectFrom('asset')
      .selectAll('asset')
      .innerJoin('memory_asset', 'asset.id', 'memory_asset.assetId')
      .where('memory_asset.memoriesId', '=', id)
      .where('asset.visibility', '=', 'timeline')
      .where('asset.deletedAt', 'is', null)
      .orderBy('asset.fileCreatedAt', 'asc')
      .execute();

    return { ...memory, assets };
  }

  async create(memory: Insertable<MemoryTable>, assetIds: string[] | Set<string>) {
    const assetIdArray = assetIds instanceof Set ? [...assetIds] : assetIds;

    return this.db.transaction().execute(async (tx) => {
      const rows = await tx
        .insertInto('memory')
        .values(memory)
        .returning('id')
        .execute();

      const id = rows[0]?.id;
      if (!id) {
        throw new Error('Failed to create memory');
      }

      if (assetIdArray.length > 0) {
        const values = assetIdArray.map((assetId) => ({ memoriesId: id, assetId }));
        await tx.insertInto('memory_asset').values(values).execute();
      }

      // Fetch the created memory with assets
      const created = await tx
        .selectFrom('memory')
        .selectAll('memory')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();

      const assets = await tx
        .selectFrom('asset')
        .selectAll('asset')
        .innerJoin('memory_asset', 'asset.id', 'memory_asset.assetId')
        .where('memory_asset.memoriesId', '=', id)
        .where('asset.visibility', '=', 'timeline')
        .where('asset.deletedAt', 'is', null)
        .orderBy('asset.fileCreatedAt', 'asc')
        .execute();

      return { ...created, assets };
    });
  }

  async update(id: string, memory: Updateable<MemoryTable>) {
    await this.db.updateTable('memory').set(memory).where('id', '=', id).execute();

    const updated = await this.db
      .selectFrom('memory')
      .selectAll('memory')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    const assets = await this.db
      .selectFrom('asset')
      .selectAll('asset')
      .innerJoin('memory_asset', 'asset.id', 'memory_asset.assetId')
      .where('memory_asset.memoriesId', '=', id)
      .where('asset.visibility', '=', 'timeline')
      .where('asset.deletedAt', 'is', null)
      .orderBy('asset.fileCreatedAt', 'asc')
      .execute();

    return { ...updated, assets };
  }

  async delete(id: string) {
    await this.db.deleteFrom('memory').where('id', '=', id).execute();
  }

  async getAssetIds(id: string, assetIds: string[]): Promise<Set<string>> {
    if (assetIds.length === 0) {
      return new Set<string>();
    }

    const allResults: string[] = [];
    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      const results = await this.db
        .selectFrom('memory_asset')
        .select('assetId')
        .where('memoriesId', '=', id)
        .where('assetId', 'in', chunk)
        .execute();
      for (const r of results) {
        allResults.push(r.assetId);
      }
    }

    return new Set(allResults);
  }

  async addAssetIds(id: string, assetIds: string[]) {
    if (assetIds.length === 0) {
      return;
    }

    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      await this.db
        .insertInto('memory_asset')
        .values(chunk.map((assetId) => ({ memoriesId: id, assetId })))
        .execute();
    }
  }

  async removeAssetIds(id: string, assetIds: string[]) {
    if (assetIds.length === 0) {
      return;
    }

    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      await this.db
        .deleteFrom('memory_asset')
        .where('memoriesId', '=', id)
        .where('assetId', 'in', chunk)
        .execute();
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async enrichMemories(memories: any[]) {
    return Promise.all(
      memories.map(async (memory) => {
        const assets = await this.db
          .selectFrom('asset')
          .selectAll('asset')
          .innerJoin('memory_asset', 'asset.id', 'memory_asset.assetId')
          .where('memory_asset.memoriesId', '=', memory.id)
          .where('asset.visibility', '=', 'timeline')
          .where('asset.deletedAt', 'is', null)
          .orderBy('asset.fileCreatedAt', 'asc')
          .execute();

        return { ...memory, assets };
      }),
    );
  }
}
