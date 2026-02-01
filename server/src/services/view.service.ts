/**
 * View service -- Workers-compatible version.
 *
 * Provides folder/path browsing functionality.
 * Replaces PostgreSQL substring regex with SQLite string functions.
 * No NestJS, no BaseService.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import { mapAsset, AssetResponseDto } from 'src/dtos/asset-response.dto';
import type { ServiceContext } from 'src/context';
import { sql } from 'kysely';

export class ViewService {
  private get db() {
    return this.ctx.db;
  }

  constructor(private ctx: ServiceContext) {}

  /**
   * Get unique folder paths for the user's assets.
   * Uses SQLite string functions instead of PostgreSQL substring regex.
   */
  async getUniqueOriginalPaths(auth: AuthDto): Promise<string[]> {
    // In SQLite we extract the directory part using rtrim + replace pattern
    // For a path like "upload/user/2024/photo.jpg", extract "upload/user/2024/"
    // SQLite: substr(path, 1, length(path) - length(replace(ltrim(path, replace(path, '/', '')), '/', '')) + ...)
    // Simplified: we use a raw approach -- get all paths and extract directories in JS

    const rows = await this.db
      .selectFrom('asset')
      .select('asset.originalPath')
      .distinct()
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.deletedAt', 'is', null)
      .execute();

    const paths = new Set<string>();
    for (const row of rows) {
      const lastSlash = row.originalPath.lastIndexOf('/');
      if (lastSlash >= 0) {
        paths.add(row.originalPath.substring(0, lastSlash + 1));
      }
    }

    return [...paths].sort();
  }

  /**
   * Get assets in a specific folder path.
   */
  async getAssetsByOriginalPath(auth: AuthDto, path: string): Promise<AssetResponseDto[]> {
    // Normalize path: ensure it ends with /
    const normalizedPath = path.endsWith('/') ? path : `${path}/`;

    const assets = await this.db
      .selectFrom('asset')
      .selectAll()
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.deletedAt', 'is', null)
      .where('asset.originalPath', 'like', `${normalizedPath}%`)
      // Exclude assets in subdirectories (only direct children)
      .where(
        this.db.fn<string>('replace', [
          this.db.fn<string>('substr', [
            'asset.originalPath',
            sql.val(normalizedPath.length + 1),
          ]),
          sql.val('/'),
          sql.val(''),
        ]),
        '=',
        this.db.fn<string>('substr', [
          'asset.originalPath',
          sql.val(normalizedPath.length + 1),
        ]),
      )
      .orderBy('asset.fileCreatedAt', 'desc')
      .execute();

    return assets.map((a: any) => mapAsset(a, { auth }));
  }
}
