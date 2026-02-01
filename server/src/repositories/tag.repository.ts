/**
 * Tag repository -- Workers/D1-compatible version.
 *
 * No @Injectable, @InjectKysely, @GenerateSql, @Chunked decorators.
 * No LoggingRepository dependency.
 * No ::uuid casts. Plain Kysely with D1 dialect.
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import { sql } from 'kysely';
import type { DB, TagTable, TagAssetTable } from 'src/schema';

const CHUNK_SIZE = 500;

export class TagRepository {
  constructor(private db: Kysely<DB>) {}

  get(id: string) {
    return this.db
      .selectFrom('tag')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  getByValue(userId: string, value: string) {
    return this.db
      .selectFrom('tag')
      .selectAll()
      .where('userId', '=', userId)
      .where('value', '=', value)
      .executeTakeFirst();
  }

  async upsertValue({ userId, value, parentId: _parentId }: { userId: string; value: string; parentId?: string }) {
    const parentId = _parentId ?? null;
    return this.db.transaction().execute(async (tx) => {
      // Insert or update tag
      const existing = await tx
        .selectFrom('tag')
        .selectAll()
        .where('userId', '=', userId)
        .where('value', '=', value)
        .executeTakeFirst();

      let tag: any;
      if (existing) {
        await tx
          .updateTable('tag')
          .set({ parentId })
          .where('id', '=', existing.id)
          .execute();
        tag = { ...existing, parentId };
      } else {
        await tx
          .insertInto('tag')
          .values({ userId, value, parentId })
          .execute();
        tag = await tx
          .selectFrom('tag')
          .selectAll()
          .where('userId', '=', userId)
          .where('value', '=', value)
          .executeTakeFirstOrThrow();
      }

      // Update closure table -- self-reference
      const selfExists = await tx
        .selectFrom('tag_closure')
        .selectAll()
        .where('id_ancestor', '=', tag.id)
        .where('id_descendant', '=', tag.id)
        .executeTakeFirst();

      if (!selfExists) {
        await tx
          .insertInto('tag_closure')
          .values({ id_ancestor: tag.id, id_descendant: tag.id })
          .execute();
      }

      if (parentId) {
        // Add ancestor closures
        const ancestors = await tx
          .selectFrom('tag_closure')
          .select('id_ancestor')
          .where('id_descendant', '=', parentId)
          .execute();

        for (const ancestor of ancestors) {
          const alreadyExists = await tx
            .selectFrom('tag_closure')
            .selectAll()
            .where('id_ancestor', '=', ancestor.id_ancestor)
            .where('id_descendant', '=', tag.id)
            .executeTakeFirst();

          if (!alreadyExists) {
            await tx
              .insertInto('tag_closure')
              .values({ id_ancestor: ancestor.id_ancestor, id_descendant: tag.id })
              .execute();
          }
        }
      }

      return tag;
    });
  }

  /**
   * Upsert multiple tags from an array of tag value strings.
   * Creates parent tags automatically for hierarchical values like "parent/child".
   */
  async upsertTags({ userId, tags }: { userId: string; tags: string[] }) {
    const results: any[] = [];
    for (const tagValue of tags) {
      const parts = tagValue.split('/');
      let parentId: string | undefined;

      for (let i = 0; i < parts.length; i++) {
        const value = parts.slice(0, i + 1).join('/');
        const tag = await this.upsertValue({ userId, value, parentId });
        parentId = tag.id;

        if (i === parts.length - 1) {
          results.push(tag);
        }
      }
    }
    return results;
  }

  getAll(userId: string) {
    return this.db
      .selectFrom('tag')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('value')
      .execute();
  }

  async create(tag: Insertable<TagTable>) {
    await this.db.insertInto('tag').values(tag).execute();
    return this.db
      .selectFrom('tag')
      .selectAll()
      .where('userId', '=', tag.userId)
      .where('value', '=', tag.value)
      .executeTakeFirstOrThrow();
  }

  async update(id: string, dto: Updateable<TagTable>) {
    await this.db.updateTable('tag').set(dto).where('id', '=', id).execute();
    return this.db
      .selectFrom('tag')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  }

  async delete(id: string) {
    await this.db.deleteFrom('tag').where('id', '=', id).execute();
  }

  async getAssetIds(tagId: string, assetIds: string[]): Promise<Set<string>> {
    if (assetIds.length === 0) {
      return new Set();
    }

    const allResults: string[] = [];
    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      const results = await this.db
        .selectFrom('tag_asset')
        .select('assetId')
        .where('tagId', '=', tagId)
        .where('assetId', 'in', chunk)
        .execute();
      for (const r of results) {
        allResults.push(r.assetId);
      }
    }

    return new Set(allResults);
  }

  async addAssetIds(tagId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      await this.db
        .insertInto('tag_asset')
        .values(chunk.map((assetId) => ({ tagId, assetId })))
        .execute();
    }
  }

  async removeAssetIds(tagId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      await this.db
        .deleteFrom('tag_asset')
        .where('tagId', '=', tagId)
        .where('assetId', 'in', chunk)
        .execute();
    }
  }

  async upsertAssetIds(items: Insertable<TagAssetTable>[]) {
    if (items.length === 0) {
      return [];
    }

    const results: any[] = [];
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      // SQLite: INSERT OR IGNORE for upsert on conflict do nothing
      for (const item of chunk) {
        const existing = await this.db
          .selectFrom('tag_asset')
          .selectAll()
          .where('tagId', '=', item.tagId)
          .where('assetId', '=', item.assetId)
          .executeTakeFirst();

        if (!existing) {
          await this.db.insertInto('tag_asset').values(item).execute();
          results.push(item);
        }
      }
    }

    return results;
  }
}
