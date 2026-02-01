/**
 * Trash service -- Workers-compatible version.
 *
 * Manages trashed asset operations: empty trash (hard delete), restore all, restore specific.
 * No NestJS, no background jobs. Empty trash immediately hard-deletes assets and R2 objects.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import type { TrashResponseDto } from 'src/dtos/trash.dto';
import { AssetStatus } from 'src/enum';
import type { ServiceContext } from 'src/context';

export class TrashService {
  private get db() {
    return this.ctx.db;
  }

  private get bucket() {
    return this.ctx.bucket;
  }

  constructor(private ctx: ServiceContext) {}

  /**
   * Empty trash: hard-delete all trashed assets and their R2 objects.
   * In Workers there is no background job -- this runs inline.
   */
  async empty(auth: AuthDto): Promise<TrashResponseDto> {
    const trashedAssets = await this.db
      .selectFrom('asset')
      .select(['asset.id', 'asset.originalPath'])
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.status', '=', AssetStatus.Trashed)
      .execute();

    if (trashedAssets.length === 0) {
      return { count: 0 };
    }

    const assetIds = trashedAssets.map((a) => a.id);

    // Delete R2 objects for each asset
    const r2Deletions: Promise<void>[] = [];
    for (const asset of trashedAssets) {
      if (asset.originalPath) {
        r2Deletions.push(this.bucket.delete(asset.originalPath).catch(() => {}));
      }
    }

    // Also delete thumbnail/preview files from R2
    const assetFiles = await this.db
      .selectFrom('asset_file')
      .select(['asset_file.path'])
      .where('asset_file.assetId', 'in', assetIds)
      .execute();

    for (const file of assetFiles) {
      if (file.path) {
        r2Deletions.push(this.bucket.delete(file.path).catch(() => {}));
      }
    }

    await Promise.allSettled(r2Deletions);

    // Hard-delete from database (child tables first)
    await this.db.deleteFrom('asset_file').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('asset_exif').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('asset_metadata').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('asset_edit').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('tag_asset').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('album_asset').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('shared_link_asset').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('memory_asset').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('activity').where('assetId', 'in', assetIds).execute();
    await this.db.deleteFrom('asset').where('id', 'in', assetIds).execute();

    return { count: trashedAssets.length };
  }

  /**
   * Restore all trashed assets for the current user.
   */
  async restoreAll(auth: AuthDto): Promise<TrashResponseDto> {
    const result = await this.db
      .updateTable('asset')
      .set({
        deletedAt: null,
        status: AssetStatus.Active,
      })
      .where('ownerId', '=', auth.user.id)
      .where('status', '=', AssetStatus.Trashed)
      .execute();

    const count = result.reduce((sum, r) => sum + Number(r.numUpdatedRows ?? 0), 0);
    return { count };
  }

  /**
   * Restore specific trashed assets.
   */
  async restore(auth: AuthDto, dto: { ids: string[] }): Promise<TrashResponseDto> {
    if (!dto.ids || dto.ids.length === 0) {
      return { count: 0 };
    }

    const assets = await this.db
      .selectFrom('asset')
      .select(['asset.id'])
      .where('asset.id', 'in', dto.ids)
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.status', '=', AssetStatus.Trashed)
      .execute();

    if (assets.length === 0) {
      return { count: 0 };
    }

    const validIds = assets.map((a) => a.id);

    await this.db
      .updateTable('asset')
      .set({
        deletedAt: null,
        status: AssetStatus.Active,
      })
      .where('id', 'in', validIds)
      .execute();

    return { count: validIds.length };
  }
}
