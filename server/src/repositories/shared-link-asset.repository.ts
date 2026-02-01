/**
 * Shared Link Asset repository -- Workers/D1-compatible version.
 *
 * No @InjectKysely, no decorators. Plain Kysely with D1 dialect.
 */

import type { Kysely } from 'kysely';
import type { DB } from 'src/schema';

export class SharedLinkAssetRepository {
  constructor(private db: Kysely<DB>) {}

  async remove(sharedLinkId: string, assetIds: string[]): Promise<string[]> {
    if (assetIds.length === 0) {
      return [];
    }

    // D1 doesn't reliably support RETURNING, so fetch first then delete
    const existing = await this.db
      .selectFrom('shared_link_asset')
      .select('assetId')
      .where('shared_link_asset.sharedLinkId', '=', sharedLinkId)
      .where('shared_link_asset.assetId', 'in', assetIds)
      .execute();

    const existingIds = existing.map((row) => row.assetId);

    if (existingIds.length > 0) {
      await this.db
        .deleteFrom('shared_link_asset')
        .where('shared_link_asset.sharedLinkId', '=', sharedLinkId)
        .where('shared_link_asset.assetId', 'in', existingIds)
        .execute();
    }

    return existingIds;
  }
}
