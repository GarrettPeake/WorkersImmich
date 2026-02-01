/**
 * Stack repository -- Workers/D1-compatible version.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No jsonArrayFrom from kysely/helpers/postgres
 * - No LATERAL JOIN
 * - No @Injectable, @InjectKysely, @GenerateSql decorators
 * - No ::uuid casts (asUuid removed)
 * - Separate queries instead of complex nested json builders
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import type { DB, StackTable } from 'src/schema';

export interface StackSearch {
  ownerId: string;
  primaryAssetId?: string;
}

export class StackRepository {
  constructor(private db: Kysely<DB>) {}

  async search(query: StackSearch) {
    let q = this.db
      .selectFrom('stack')
      .selectAll('stack')
      .where('stack.ownerId', '=', query.ownerId);

    if (query.primaryAssetId) {
      q = q.where('stack.primaryAssetId', '=', query.primaryAssetId);
    }

    const stacks = await q.execute();
    return this.enrichStacks(stacks);
  }

  async create(entity: Omit<Insertable<StackTable>, 'primaryAssetId'>, assetIds: string[]) {
    return this.db.transaction().execute(async (tx) => {
      // Find existing stacks that will be merged
      const stacks = await tx
        .selectFrom('stack')
        .where('stack.ownerId', '=', entity.ownerId)
        .where('stack.primaryAssetId', 'in', assetIds)
        .select('stack.id')
        .execute();

      const uniqueIds = new Set<string>(assetIds);

      // Collect children from existing stacks
      for (const stack of stacks) {
        const childAssets = await tx
          .selectFrom('asset')
          .select('asset.id')
          .where('asset.stackId', '=', stack.id)
          .where('asset.deletedAt', 'is', null)
          .execute();

        for (const asset of childAssets) {
          uniqueIds.add(asset.id);
        }
      }

      // Delete old stacks
      if (stacks.length > 0) {
        await tx
          .deleteFrom('stack')
          .where(
            'id',
            'in',
            stacks.map((s) => s.id),
          )
          .execute();
      }

      // Create new stack
      const rows = await tx
        .insertInto('stack')
        .values({ ...entity, primaryAssetId: assetIds[0] })
        .returning('id')
        .execute();

      const newId = rows[0]?.id;
      if (!newId) {
        throw new Error('Failed to create stack');
      }

      // Assign assets to new stack
      await tx
        .updateTable('asset')
        .set({
          stackId: newId,
          updatedAt: new Date().toISOString(),
        })
        .where('id', 'in', [...uniqueIds])
        .execute();

      // Fetch and return the new stack with assets
      const newStack = await tx
        .selectFrom('stack')
        .selectAll('stack')
        .where('id', '=', newId)
        .executeTakeFirstOrThrow();

      const assets = await tx
        .selectFrom('asset')
        .selectAll('asset')
        .where('asset.stackId', '=', newId)
        .where('asset.deletedAt', 'is', null)
        .where('asset.visibility', '!=', 'hidden')
        .execute();

      return { ...newStack, assets };
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('stack').where('id', '=', id).execute();
  }

  async deleteAll(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.deleteFrom('stack').where('id', 'in', ids).execute();
  }

  async update(id: string, entity: Updateable<StackTable>) {
    await this.db
      .updateTable('stack')
      .set(entity)
      .where('id', '=', id)
      .execute();

    const stack = await this.db
      .selectFrom('stack')
      .selectAll('stack')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    const assets = await this.db
      .selectFrom('asset')
      .selectAll('asset')
      .where('asset.stackId', '=', id)
      .where('asset.deletedAt', 'is', null)
      .where('asset.visibility', '!=', 'hidden')
      .execute();

    return { ...stack, assets };
  }

  async getById(id: string) {
    const stack = await this.db
      .selectFrom('stack')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!stack) {
      return undefined;
    }

    const assets = await this.db
      .selectFrom('asset')
      .selectAll('asset')
      .where('asset.stackId', '=', id)
      .where('asset.deletedAt', 'is', null)
      .where('asset.visibility', '!=', 'hidden')
      .execute();

    return { ...stack, assets };
  }

  getForAssetRemoval(assetId: string) {
    return this.db
      .selectFrom('asset')
      .leftJoin('stack', 'stack.id', 'asset.stackId')
      .select(['asset.stackId as id', 'stack.primaryAssetId'])
      .where('asset.id', '=', assetId)
      .executeTakeFirst();
  }

  merge({ sourceId, targetId }: { sourceId: string; targetId: string }) {
    return this.db
      .updateTable('asset')
      .set({ stackId: targetId })
      .where('asset.stackId', '=', sourceId)
      .execute();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async enrichStacks(stacks: any[]) {
    return Promise.all(
      stacks.map(async (stack) => {
        const assets = await this.db
          .selectFrom('asset')
          .selectAll('asset')
          .where('asset.stackId', '=', stack.id)
          .where('asset.deletedAt', 'is', null)
          .where('asset.visibility', '!=', 'hidden')
          .execute();

        return { ...stack, assets };
      }),
    );
  }
}
