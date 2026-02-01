/**
 * Album repository -- Workers/D1-compatible version.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No jsonArrayFrom/jsonObjectFrom from kysely/helpers/postgres
 * - No LATERAL JOIN -- use separate queries or correlated subqueries
 * - No RETURNING with expression builders -- use separate select after insert/update
 * - No @Injectable, @InjectKysely, @GenerateSql, @Chunked decorators
 * - No ::uuid casts
 * - Timestamps stored as ISO 8601 TEXT strings
 * - Booleans stored as INTEGER (0/1)
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import { sql } from 'kysely';
import type { DB, AlbumTable } from 'src/schema';

const CHUNK_SIZE = 500;

export interface AlbumAssetCount {
  albumId: string;
  assetCount: number;
  startDate: string | null;
  endDate: string | null;
  lastModifiedAssetTimestamp: string | null;
}

export interface AlbumInfoOptions {
  withAssets: boolean;
}

export class AlbumRepository {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string, options: AlbumInfoOptions) {
    const album = await this.db
      .selectFrom('album')
      .selectAll('album')
      .where('album.id', '=', id)
      .where('album.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!album) {
      return undefined;
    }

    const owner = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.id', '=', album.ownerId)
      .executeTakeFirst();

    const albumUsers = await this.db
      .selectFrom('album_user')
      .selectAll('album_user')
      .where('album_user.albumId', '=', id)
      .execute();

    const albumUsersWithUser = await Promise.all(
      albumUsers.map(async (au) => {
        const user = await this.db
          .selectFrom('user')
          .selectAll()
          .where('user.id', '=', au.userId)
          .executeTakeFirst();
        return { ...au, user };
      }),
    );

    const sharedLinks = await this.db
      .selectFrom('shared_link')
      .selectAll()
      .where('shared_link.albumId', '=', id)
      .execute();

    let assets: any[] | undefined;
    if (options.withAssets) {
      assets = await this.db
        .selectFrom('asset')
        .selectAll('asset')
        .innerJoin('album_asset', 'album_asset.assetId', 'asset.id')
        .where('album_asset.albumId', '=', id)
        .where('asset.deletedAt', 'is', null)
        .where('asset.visibility', '!=', 'hidden')
        .orderBy('asset.fileCreatedAt', 'desc')
        .execute();
    }

    return {
      ...album,
      owner,
      albumUsers: albumUsersWithUser,
      sharedLinks,
      assets: assets ?? [],
    };
  }

  async getByAssetId(ownerId: string, assetId: string) {
    const albums = await this.db
      .selectFrom('album')
      .selectAll('album')
      .innerJoin('album_asset', 'album_asset.albumId', 'album.id')
      .where((eb) =>
        eb.or([
          eb('album.ownerId', '=', ownerId),
          eb.exists(
            eb
              .selectFrom('album_user')
              .select(sql`1`.as('one'))
              .whereRef('album_user.albumId', '=', 'album.id')
              .where('album_user.userId', '=', ownerId),
          ),
        ]),
      )
      .where('album_asset.assetId', '=', assetId)
      .where('album.deletedAt', 'is', null)
      .orderBy('album.createdAt', 'desc')
      .execute();

    return this.enrichAlbums(albums);
  }

  async getMetadataForIds(ids: string[]): Promise<AlbumAssetCount[]> {
    if (ids.length === 0) {
      return [];
    }

    const results: AlbumAssetCount[] = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const rows = await this.db
        .selectFrom('asset')
        .innerJoin('album_asset', 'album_asset.assetId', 'asset.id')
        .select('album_asset.albumId as albumId')
        .select((eb) => eb.fn.min('asset.localDateTime').as('startDate'))
        .select((eb) => eb.fn.max('asset.localDateTime').as('endDate'))
        .select((eb) => eb.fn.max('asset.updatedAt').as('lastModifiedAssetTimestamp'))
        .select((eb) => eb.fn.count('asset.id').as('assetCount'))
        .where('album_asset.albumId', 'in', chunk)
        .where('asset.deletedAt', 'is', null)
        .where('asset.visibility', '!=', 'hidden')
        .groupBy('album_asset.albumId')
        .execute();

      for (const row of rows) {
        results.push({
          albumId: row.albumId,
          assetCount: Number(row.assetCount),
          startDate: row.startDate as string | null,
          endDate: row.endDate as string | null,
          lastModifiedAssetTimestamp: row.lastModifiedAssetTimestamp as string | null,
        });
      }
    }

    return results;
  }

  async getOwned(ownerId: string) {
    const albums = await this.db
      .selectFrom('album')
      .selectAll('album')
      .where('album.ownerId', '=', ownerId)
      .where('album.deletedAt', 'is', null)
      .orderBy('album.createdAt', 'desc')
      .execute();

    return this.enrichAlbums(albums);
  }

  async getShared(ownerId: string) {
    const albums = await this.db
      .selectFrom('album')
      .selectAll('album')
      .where((eb) =>
        eb.or([
          eb.exists(
            eb
              .selectFrom('album_user')
              .select(sql`1`.as('one'))
              .whereRef('album_user.albumId', '=', 'album.id')
              .where((eb2) =>
                eb2.or([
                  eb2('album.ownerId', '=', ownerId),
                  eb2('album_user.userId', '=', ownerId),
                ]),
              ),
          ),
          eb.exists(
            eb
              .selectFrom('shared_link')
              .select(sql`1`.as('one'))
              .whereRef('shared_link.albumId', '=', 'album.id')
              .where('shared_link.userId', '=', ownerId),
          ),
        ]),
      )
      .where('album.deletedAt', 'is', null)
      .orderBy('album.createdAt', 'desc')
      .execute();

    return this.enrichAlbums(albums);
  }

  async getNotShared(ownerId: string) {
    const albums = await this.db
      .selectFrom('album')
      .selectAll('album')
      .where('album.ownerId', '=', ownerId)
      .where('album.deletedAt', 'is', null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb.selectFrom('album_user').select(sql`1`.as('one')).whereRef('album_user.albumId', '=', 'album.id'),
          ),
        ),
      )
      .where((eb) =>
        eb.not(
          eb.exists(
            eb.selectFrom('shared_link').select(sql`1`.as('one')).whereRef('shared_link.albumId', '=', 'album.id'),
          ),
        ),
      )
      .orderBy('album.createdAt', 'desc')
      .execute();

    return this.enrichAlbums(albums);
  }

  async restoreAll(userId: string): Promise<void> {
    await this.db
      .updateTable('album')
      .set({ deletedAt: null })
      .where('ownerId', '=', userId)
      .execute();
  }

  async softDeleteAll(userId: string): Promise<void> {
    await this.db
      .updateTable('album')
      .set({ deletedAt: new Date().toISOString() })
      .where('ownerId', '=', userId)
      .execute();
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.deleteFrom('album').where('ownerId', '=', userId).execute();
  }

  async removeAssetsFromAll(assetIds: string[]): Promise<void> {
    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      await this.db
        .deleteFrom('album_asset')
        .where('album_asset.assetId', 'in', chunk)
        .execute();
    }
  }

  async removeAssetIds(albumId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      await this.db
        .deleteFrom('album_asset')
        .where('album_asset.albumId', '=', albumId)
        .where('album_asset.assetId', 'in', chunk)
        .execute();
    }
  }

  async getAssetIds(albumId: string, assetIds: string[]): Promise<Set<string>> {
    if (assetIds.length === 0) {
      return new Set();
    }

    const allResults: string[] = [];
    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      const results = await this.db
        .selectFrom('album_asset')
        .select('album_asset.assetId')
        .where('album_asset.albumId', '=', albumId)
        .where('album_asset.assetId', 'in', chunk)
        .execute();
      for (const r of results) {
        allResults.push(r.assetId);
      }
    }

    return new Set(allResults);
  }

  async addAssetIds(albumId: string, assetIds: string[]): Promise<void> {
    await this.addAssets(this.db, albumId, assetIds);
  }

  async create(
    album: Insertable<AlbumTable>,
    assetIds: string[],
    albumUsers: Array<{ userId: string; role?: string }>,
  ) {
    // D1 does not support transactions via kysely-d1, so use sequential inserts.
    const newAlbumId = album.id || crypto.randomUUID();
    await this.db
      .insertInto('album')
      .values({ ...album, id: newAlbumId })
      .execute();

    if (assetIds.length > 0) {
      await this.addAssets(this.db, newAlbumId, assetIds);
    }

    if (albumUsers.length > 0) {
      await this.db
        .insertInto('album_user')
        .values(
          albumUsers.map((au) => ({
            albumId: newAlbumId,
            userId: au.userId,
            role: au.role || 'viewer',
          })),
        )
        .execute();
    }

    // Fetch the created album with relations
    const createdAlbum = await this.db
      .selectFrom('album')
      .selectAll()
      .where('id', '=', newAlbumId)
      .executeTakeFirstOrThrow();

    return createdAlbum;
  }

  async update(id: string, album: Updateable<AlbumTable>) {
    await this.db
      .updateTable('album')
      .set(album)
      .where('id', '=', id)
      .execute();

    // Fetch updated album with relations
    const updated = await this.db
      .selectFrom('album')
      .selectAll('album')
      .where('album.id', '=', id)
      .executeTakeFirstOrThrow();

    const owner = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.id', '=', updated.ownerId)
      .executeTakeFirst();

    const albumUsers = await this.db
      .selectFrom('album_user')
      .selectAll('album_user')
      .where('album_user.albumId', '=', id)
      .execute();

    const albumUsersWithUser = await Promise.all(
      albumUsers.map(async (au) => {
        const user = await this.db
          .selectFrom('user')
          .selectAll()
          .where('user.id', '=', au.userId)
          .executeTakeFirst();
        return { ...au, user };
      }),
    );

    const sharedLinks = await this.db
      .selectFrom('shared_link')
      .selectAll()
      .where('shared_link.albumId', '=', id)
      .execute();

    return {
      ...updated,
      owner,
      albumUsers: albumUsersWithUser,
      sharedLinks,
    };
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('album').where('id', '=', id).execute();
  }

  async updateThumbnails(): Promise<number | undefined> {
    // Simplified thumbnail update for D1:
    // Set thumbnail for albums that have assets but no thumbnail.
    // Uses simple joins + WHERE clauses (D1/SQLite-compatible).
    const albumsNeedingThumbnail = await this.db
      .selectFrom('album')
      .select('album.id')
      .where('album.albumThumbnailAssetId', 'is', null)
      .where('album.deletedAt', 'is', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('album_asset')
            .select(sql`1`.as('one'))
            .innerJoin('asset', 'album_asset.assetId', 'asset.id')
            .whereRef('album_asset.albumId', '=', 'album.id')
            .where('asset.deletedAt', 'is', null),
        ),
      )
      .execute();

    let count = 0;
    for (const album of albumsNeedingThumbnail) {
      const latestAsset = await this.db
        .selectFrom('album_asset')
        .innerJoin('asset', 'album_asset.assetId', 'asset.id')
        .select('album_asset.assetId')
        .where('album_asset.albumId', '=', album.id)
        .where('asset.deletedAt', 'is', null)
        .orderBy('asset.fileCreatedAt', 'desc')
        .limit(1)
        .executeTakeFirst();

      if (latestAsset) {
        await this.db
          .updateTable('album')
          .set({ albumThumbnailAssetId: latestAsset.assetId })
          .where('id', '=', album.id)
          .execute();
        count++;
      }
    }

    // Also fix invalid thumbnails (asset no longer in album)
    const albumsWithInvalidThumbnail = await this.db
      .selectFrom('album')
      .select(['album.id', 'album.albumThumbnailAssetId'])
      .where('album.albumThumbnailAssetId', 'is not', null)
      .where('album.deletedAt', 'is', null)
      .execute();

    for (const album of albumsWithInvalidThumbnail) {
      const exists = await this.db
        .selectFrom('album_asset')
        .innerJoin('asset', 'album_asset.assetId', 'asset.id')
        .select('album_asset.assetId')
        .where('album_asset.albumId', '=', album.id)
        .where('album_asset.assetId', '=', album.albumThumbnailAssetId!)
        .where('asset.deletedAt', 'is', null)
        .executeTakeFirst();

      if (!exists) {
        const latestAsset = await this.db
          .selectFrom('album_asset')
          .innerJoin('asset', 'album_asset.assetId', 'asset.id')
          .select('album_asset.assetId')
          .where('album_asset.albumId', '=', album.id)
          .where('asset.deletedAt', 'is', null)
          .orderBy('asset.fileCreatedAt', 'desc')
          .limit(1)
          .executeTakeFirst();

        await this.db
          .updateTable('album')
          .set({ albumThumbnailAssetId: latestAsset?.assetId ?? null })
          .where('id', '=', album.id)
          .execute();
        count++;
      }
    }

    return count;
  }

  getContributorCounts(id: string) {
    return this.db
      .selectFrom('album_asset')
      .innerJoin('asset', 'asset.id', 'album_asset.assetId')
      .where('asset.deletedAt', 'is', null)
      .where('album_asset.albumId', '=', id)
      .select('asset.ownerId as userId')
      .select((eb) => eb.fn.count('asset.id').as('assetCount'))
      .groupBy('asset.ownerId')
      .orderBy('assetCount', 'desc')
      .execute();
  }

  async addAssetIdsToAlbums(values: { albumId: string; assetId: string }[]): Promise<void> {
    if (values.length === 0) {
      return;
    }

    for (let i = 0; i < values.length; i += CHUNK_SIZE) {
      const chunk = values.slice(i, i + CHUNK_SIZE);
      await this.db.insertInto('album_asset').values(chunk).execute();
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async addAssets(db: Kysely<DB>, albumId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    for (let i = 0; i < assetIds.length; i += CHUNK_SIZE) {
      const chunk = assetIds.slice(i, i + CHUNK_SIZE);
      await db
        .insertInto('album_asset')
        .values(chunk.map((assetId) => ({ albumId, assetId })))
        .execute();
    }
  }

  private async enrichAlbums(albums: any[]) {
    return Promise.all(
      albums.map(async (album) => {
        const owner = await this.db
          .selectFrom('user')
          .selectAll()
          .where('user.id', '=', album.ownerId)
          .executeTakeFirst();

        const albumUsers = await this.db
          .selectFrom('album_user')
          .selectAll('album_user')
          .where('album_user.albumId', '=', album.id)
          .execute();

        const albumUsersWithUser = await Promise.all(
          albumUsers.map(async (au) => {
            const user = await this.db
              .selectFrom('user')
              .selectAll()
              .where('user.id', '=', au.userId)
              .executeTakeFirst();
            return { ...au, user };
          }),
        );

        const sharedLinks = await this.db
          .selectFrom('shared_link')
          .selectAll()
          .where('shared_link.albumId', '=', album.id)
          .execute();

        return {
          ...album,
          owner,
          albumUsers: albumUsersWithUser,
          sharedLinks,
        };
      }),
    );
  }
}
