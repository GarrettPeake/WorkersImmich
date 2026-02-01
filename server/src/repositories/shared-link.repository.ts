/**
 * Shared Link repository -- Workers/D1-compatible version.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No jsonObjectFrom/jsonArrayFrom from kysely/helpers/postgres
 * - No LATERAL JOIN -- use separate queries
 * - No DISTINCT ON -- use ORDER BY + GROUP BY or separate logic
 * - No @Injectable, @InjectKysely, @GenerateSql decorators
 * - No lodash dependency
 * - Separate queries to build complex objects
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import type { DB, SharedLinkTable } from 'src/schema';
import { SharedLinkType } from 'src/enum';

export type SharedLinkSearchOptions = {
  userId: string;
  id?: string;
  albumId?: string;
};

export class SharedLinkRepository {
  constructor(private db: Kysely<DB>) {}

  async get(userId: string, id: string) {
    const link = await this.db
      .selectFrom('shared_link')
      .selectAll('shared_link')
      .where('shared_link.id', '=', id)
      .where('shared_link.userId', '=', userId)
      .executeTakeFirst();

    if (!link) return undefined;

    // Get assets for individual links
    const assets = await this.db
      .selectFrom('shared_link_asset')
      .innerJoin('asset', 'asset.id', 'shared_link_asset.assetId')
      .selectAll('asset')
      .where('shared_link_asset.sharedLinkId', '=', id)
      .where('asset.deletedAt', 'is', null)
      .orderBy('asset.fileCreatedAt', 'asc')
      .execute();

    // Get album if it's an album link
    let album: any = null;
    if (link.albumId) {
      album = await this.db
        .selectFrom('album')
        .selectAll('album')
        .where('album.id', '=', link.albumId)
        .where('album.deletedAt', 'is', null)
        .executeTakeFirst();

      if (album) {
        // Get album owner
        const owner = await this.db
          .selectFrom('user')
          .selectAll()
          .where('user.id', '=', album.ownerId)
          .where('user.deletedAt', 'is', null)
          .executeTakeFirst();

        // Get album assets
        const albumAssets = await this.db
          .selectFrom('asset')
          .selectAll('asset')
          .innerJoin('album_asset', 'album_asset.assetId', 'asset.id')
          .where('album_asset.albumId', '=', link.albumId!)
          .where('asset.deletedAt', 'is', null)
          .orderBy('asset.fileCreatedAt', 'asc')
          .execute();

        album = { ...album, owner, assets: albumAssets };
      }
    }

    // Filter: for album links, album must exist
    if (link.type !== SharedLinkType.Individual && !album) {
      return undefined;
    }

    return { ...link, assets, album };
  }

  async getAll({ userId, id, albumId }: SharedLinkSearchOptions) {
    let query = this.db
      .selectFrom('shared_link')
      .selectAll('shared_link')
      .where('shared_link.userId', '=', userId);

    if (id) {
      query = query.where('shared_link.id', '=', id);
    }
    if (albumId) {
      query = query.where('shared_link.albumId', '=', albumId);
    }

    const links = await query
      .orderBy('shared_link.createdAt', 'desc')
      .execute();

    // Enrich each link
    const results = await Promise.all(
      links.map(async (link) => {
        // Get individual assets
        const assets = await this.db
          .selectFrom('shared_link_asset')
          .innerJoin('asset', 'asset.id', 'shared_link_asset.assetId')
          .selectAll('asset')
          .where('shared_link_asset.sharedLinkId', '=', link.id)
          .where('asset.deletedAt', 'is', null)
          .execute();

        // Get album
        let album: any = null;
        if (link.albumId) {
          album = await this.db
            .selectFrom('album')
            .selectAll('album')
            .where('album.id', '=', link.albumId)
            .where('album.deletedAt', 'is', null)
            .executeTakeFirst();

          if (album) {
            const owner = await this.db
              .selectFrom('user')
              .selectAll()
              .where('user.id', '=', album.ownerId)
              .where('user.deletedAt', 'is', null)
              .executeTakeFirst();
            album = { ...album, owner };
          }
        }

        // Filter: for album links, album must exist
        if (link.type !== SharedLinkType.Individual && !album) {
          return null;
        }

        return { ...link, assets, album };
      }),
    );

    return results.filter(Boolean);
  }

  async getByKey(key: Uint8Array) {
    return this.authBuilder().where('shared_link.key', '=', key).executeTakeFirst();
  }

  async getBySlug(slug: string) {
    return this.authBuilder().where('shared_link.slug', '=', slug).executeTakeFirst();
  }

  async create(entity: Insertable<SharedLinkTable> & { assetIds?: string[] }) {
    const { assetIds, ...linkData } = entity as any;

    await this.db.insertInto('shared_link').values(linkData).execute();

    // Get the created link (order by createdAt desc to get the latest)
    const created = await this.db
      .selectFrom('shared_link')
      .selectAll()
      .where('shared_link.userId', '=', linkData.userId)
      .where('shared_link.key', '=', linkData.key)
      .executeTakeFirstOrThrow();

    if (assetIds && assetIds.length > 0) {
      await this.db
        .insertInto('shared_link_asset')
        .values(assetIds.map((assetId: string) => ({ assetId, sharedLinkId: created.id })))
        .execute();
    }

    return this.getSharedLinkById(created.id);
  }

  async update(entity: Updateable<SharedLinkTable> & { id: string; assetIds?: string[] }) {
    const { assetIds, assets, album, ...linkData } = entity as any;

    await this.db
      .updateTable('shared_link')
      .set(linkData)
      .where('shared_link.id', '=', entity.id!)
      .execute();

    if (assetIds && assetIds.length > 0) {
      await this.db
        .insertInto('shared_link_asset')
        .values(assetIds.map((assetId: string) => ({ assetId, sharedLinkId: entity.id })))
        .execute();
    }

    return this.getSharedLinkById(entity.id!);
  }

  async remove(id: string): Promise<void> {
    await this.db.deleteFrom('shared_link').where('shared_link.id', '=', id).execute();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private authBuilder() {
    return this.db
      .selectFrom('shared_link')
      .leftJoin('album', 'album.id', 'shared_link.albumId')
      .selectAll('shared_link')
      .where((eb) =>
        eb.or([
          eb('shared_link.type', '=', SharedLinkType.Individual),
          eb.and([
            eb('album.id', 'is not', null),
            eb('album.deletedAt', 'is', null),
          ]),
        ]),
      );
  }

  private async getSharedLinkById(id: string) {
    const link = await this.db
      .selectFrom('shared_link')
      .selectAll('shared_link')
      .where('shared_link.id', '=', id)
      .executeTakeFirstOrThrow();

    const assets = await this.db
      .selectFrom('shared_link_asset')
      .innerJoin('asset', 'asset.id', 'shared_link_asset.assetId')
      .selectAll('asset')
      .where('shared_link_asset.sharedLinkId', '=', id)
      .where('asset.deletedAt', 'is', null)
      .execute();

    return { ...link, assets };
  }
}
