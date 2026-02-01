/**
 * Download repository — Workers/D1-compatible version.
 *
 * Provides queries for fetching asset metadata needed by the download service.
 * Uses Kysely with D1 dialect. No NestJS decorators, no PostgreSQL-specific features.
 * Returns arrays instead of streams (D1 does not support streaming query results).
 */

import type { Kysely } from 'kysely';
import { AssetVisibility } from 'src/enum';
import type { DB } from 'src/schema';

const builder = (db: Kysely<DB>) =>
  db
    .selectFrom('asset')
    .innerJoin('asset_exif', 'assetId', 'id')
    .select(['asset.id', 'asset.livePhotoVideoId', 'asset_exif.fileSizeInByte as size'])
    .where('asset.deletedAt', 'is', null);

export class DownloadRepository {
  constructor(private db: Kysely<DB>) {}

  downloadAssetIds(ids: string[]) {
    return builder(this.db).where('asset.id', 'in', ids).execute();
  }

  downloadMotionAssetIds(ids: string[]) {
    return builder(this.db)
      .select(['asset.originalPath'])
      .where('asset.id', 'in', ids)
      .execute();
  }

  downloadAlbumId(albumId: string) {
    return builder(this.db)
      .innerJoin('album_asset', 'asset.id', 'album_asset.assetId')
      .where('album_asset.albumId', '=', albumId)
      .execute();
  }

  downloadUserId(userId: string) {
    return builder(this.db)
      .where('asset.ownerId', '=', userId)
      .where('asset.visibility', '!=', AssetVisibility.Hidden)
      .execute();
  }
}
