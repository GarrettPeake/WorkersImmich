/**
 * Asset repository — Workers/D1-compatible version.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No ::uuid casts — UUIDs are TEXT in D1
 * - No PostgreSQL array syntax (any(), unnest())
 * - No DISTINCT ON — use ROW_NUMBER() OVER (PARTITION BY ...) where needed
 * - No AT TIME ZONE — timestamps stored as UTC strings
 * - No array_agg() — use json_group_array()
 * - No LATERAL JOIN — use correlated subqueries
 * - No @Injectable, @InjectKysely, @GenerateSql decorators
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import { sql } from 'kysely';
import {
  AssetFileType,
  AssetOrder,
  AssetStatus,
  AssetType,
  AssetVisibility,
} from 'src/enum';
import type {
  DB,
  AssetTable,
  AssetExifTable,
  AssetFileTable,
  AssetMetadataTable,
} from 'src/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetStats = Record<AssetType, number>;

export interface AssetStatsOptions {
  isFavorite?: boolean;
  isTrashed?: boolean;
  visibility?: AssetVisibility;
}

export interface GetByIdsRelations {
  exifInfo?: boolean;
  faces?: { person?: boolean; withDeleted?: boolean };
  files?: boolean;
  library?: boolean;
  owner?: boolean;
  stack?: { assets?: boolean };
  tags?: boolean;
  edits?: boolean;
}

export interface TimeBucketOptions {
  isFavorite?: boolean;
  isTrashed?: boolean;
  isDuplicate?: boolean;
  albumId?: string;
  tagId?: string;
  personId?: string;
  userIds?: string[];
  withStacked?: boolean;
  exifInfo?: boolean;
  status?: AssetStatus;
  assetType?: AssetType;
  visibility?: AssetVisibility;
  withCoordinates?: boolean;
  order?: AssetOrder;
}

export interface TimeBucketItem {
  timeBucket: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 500;

/** Remove undefined values from an object. */
function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result = {} as Partial<T>;
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/** Apply default visibility filter (not Hidden). */
function withDefaultVisibility<T extends { where: (...args: any[]) => T }>(qb: T): T {
  return qb.where('asset.visibility', '!=', AssetVisibility.Hidden);
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class AssetRepository {
  constructor(private db: Kysely<DB>) {}

  // -------------------------------------------------------------------------
  // EXIF
  // -------------------------------------------------------------------------

  async upsertExif(
    exif: Insertable<AssetExifTable>,
    { lockedPropertiesBehavior }: { lockedPropertiesBehavior: 'override' | 'append' | 'skip' },
  ): Promise<void> {
    // For D1/SQLite, lockedProperties is a JSON array string.
    // 'append' mode merges existing + new; 'override' replaces; 'skip' preserves.
    const definedExif = removeUndefined(exif as Record<string, unknown>) as Insertable<AssetExifTable>;

    await this.db
      .insertInto('asset_exif')
      .values(definedExif)
      .onConflict((oc) =>
        oc.column('assetId').doUpdateSet((eb) => {
          const result: Record<string, any> = {};
          const columns: Array<keyof AssetExifTable> = [
            'description', 'exifImageWidth', 'exifImageHeight', 'fileSizeInByte',
            'orientation', 'dateTimeOriginal', 'modifyDate', 'timeZone',
            'latitude', 'longitude', 'projectionType', 'city', 'livePhotoCID',
            'autoStackId', 'state', 'country', 'make', 'model', 'lensModel',
            'fNumber', 'focalLength', 'iso', 'exposureTime', 'profileDescription',
            'colorspace', 'bitsPerSample', 'rating', 'fps', 'tags',
          ];

          for (const col of columns) {
            if ((exif as any)[col] !== undefined) {
              if (lockedPropertiesBehavior === 'skip') {
                // Keep existing if the property is locked
                result[col] = sql`
                  CASE WHEN json_array_length(COALESCE("asset_exif"."lockedProperties", '[]')) > 0
                    AND EXISTS (
                      SELECT 1 FROM json_each(COALESCE("asset_exif"."lockedProperties", '[]'))
                      WHERE json_each.value = ${col}
                    )
                  THEN "asset_exif".${sql.ref(col as string)}
                  ELSE "excluded".${sql.ref(col as string)}
                  END`;
              } else {
                result[col] = eb.ref(`excluded.${col}` as any);
              }
            }
          }

          // Handle lockedProperties merging
          if (lockedPropertiesBehavior === 'append' && exif.lockedProperties) {
            // Merge existing + new, deduplicate via JSON
            result.lockedProperties = sql`(
              SELECT json_group_array(DISTINCT prop.value)
              FROM (
                SELECT value FROM json_each(COALESCE("asset_exif"."lockedProperties", '[]'))
                UNION
                SELECT value FROM json_each(${exif.lockedProperties})
              ) AS prop
              WHERE prop.value IS NOT NULL
            )`;
          } else if (lockedPropertiesBehavior !== 'append') {
            if ((exif as any).lockedProperties !== undefined) {
              result.lockedProperties = eb.ref('excluded.lockedProperties' as any);
            }
          }

          return result;
        }),
      )
      .execute();
  }

  async updateAllExif(ids: string[], options: Updateable<AssetExifTable>): Promise<void> {
    if (ids.length === 0) return;

    // Chunk to avoid SQLite parameter limits
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const lockedKeys = JSON.stringify(Object.keys(options));
      await this.db
        .updateTable('asset_exif')
        .set({
          ...options,
          lockedProperties: sql`(
            SELECT json_group_array(DISTINCT prop.value)
            FROM (
              SELECT value FROM json_each(COALESCE("asset_exif"."lockedProperties", '[]'))
              UNION
              SELECT value FROM json_each(${lockedKeys})
            ) AS prop
            WHERE prop.value IS NOT NULL
          )`,
        })
        .where('assetId', 'in', chunk)
        .execute();
    }
  }

  async updateDateTimeOriginal(ids: string[], delta?: number, timeZone?: string) {
    if (ids.length === 0) return [];

    const results: Array<{ assetId: string; dateTimeOriginal: string | null; timeZone: string | null }> = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const minutesDelta = delta ?? 0;
      const rows = await this.db
        .updateTable('asset_exif')
        .set((eb) => ({
          dateTimeOriginal: sql`datetime("dateTimeOriginal", ${`+${minutesDelta} minutes`})`,
          ...(timeZone !== undefined ? { timeZone } : {}),
          lockedProperties: sql`(
            SELECT json_group_array(DISTINCT prop.value)
            FROM (
              SELECT value FROM json_each(COALESCE("asset_exif"."lockedProperties", '[]'))
              UNION SELECT 'dateTimeOriginal'
              UNION SELECT 'timeZone'
            ) AS prop
            WHERE prop.value IS NOT NULL
          )`,
        }))
        .where('assetId', 'in', chunk)
        .returning(['assetId', 'dateTimeOriginal', 'timeZone'])
        .execute();
      results.push(...rows);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Asset Metadata (key-value)
  // -------------------------------------------------------------------------

  getMetadata(assetId: string) {
    return this.db
      .selectFrom('asset_metadata')
      .select(['key', 'value', 'updatedAt'])
      .where('assetId', '=', assetId)
      .execute();
  }

  upsertMetadata(id: string, items: Array<{ key: string; value: object }>) {
    if (items.length === 0) return Promise.resolve([]);

    return this.db
      .insertInto('asset_metadata')
      .values(items.map((item) => ({
        assetId: id,
        key: item.key,
        value: JSON.stringify(item.value),
      })))
      .onConflict((oc) =>
        oc
          .columns(['assetId', 'key'])
          .doUpdateSet((eb) => ({
            key: eb.ref('excluded.key'),
            value: eb.ref('excluded.value'),
          })),
      )
      .returning(['key', 'value', 'updatedAt'])
      .execute();
  }

  upsertBulkMetadata(items: Insertable<AssetMetadataTable>[]) {
    if (items.length === 0) return Promise.resolve([]);

    const values = items.map((item) => ({
      ...item,
      value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value),
    }));

    return this.db
      .insertInto('asset_metadata')
      .values(values)
      .onConflict((oc) =>
        oc
          .columns(['assetId', 'key'])
          .doUpdateSet((eb) => ({
            key: eb.ref('excluded.key'),
            value: eb.ref('excluded.value'),
          })),
      )
      .returning(['assetId', 'key', 'value', 'updatedAt'])
      .execute();
  }

  getMetadataByKey(assetId: string, key: string) {
    return this.db
      .selectFrom('asset_metadata')
      .select(['key', 'value', 'updatedAt'])
      .where('assetId', '=', assetId)
      .where('key', '=', key)
      .executeTakeFirst();
  }

  async deleteMetadataByKey(id: string, key: string) {
    await this.db.deleteFrom('asset_metadata').where('assetId', '=', id).where('key', '=', key).execute();
  }

  async deleteBulkMetadata(items: Array<{ assetId: string; key: string }>) {
    if (items.length === 0) return;

    // Use a transaction for atomicity
    await this.db.transaction().execute(async (tx) => {
      for (const { assetId, key } of items) {
        await tx.deleteFrom('asset_metadata').where('assetId', '=', assetId).where('key', '=', key).execute();
      }
    });
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  create(asset: Insertable<AssetTable>) {
    return this.db.insertInto('asset').values(asset).returningAll().executeTakeFirstOrThrow();
  }

  createAll(assets: Insertable<AssetTable>[]) {
    return this.db.insertInto('asset').values(assets).returningAll().execute();
  }

  async getById(
    id: string,
    { exifInfo, faces, files, library, owner, stack, tags, edits }: GetByIdsRelations = {},
  ) {
    let query = this.db
      .selectFrom('asset')
      .selectAll('asset')
      .where('asset.id', '=', id);

    if (exifInfo) {
      query = query
        .leftJoin('asset_exif', 'asset.id', 'asset_exif.assetId')
        .select((eb) => [sql`json_object(
          'assetId', asset_exif."assetId",
          'make', asset_exif.make,
          'model', asset_exif.model,
          'exifImageWidth', asset_exif."exifImageWidth",
          'exifImageHeight', asset_exif."exifImageHeight",
          'fileSizeInByte', asset_exif."fileSizeInByte",
          'orientation', asset_exif.orientation,
          'dateTimeOriginal', asset_exif."dateTimeOriginal",
          'modifyDate', asset_exif."modifyDate",
          'lensModel', asset_exif."lensModel",
          'fNumber', asset_exif."fNumber",
          'focalLength', asset_exif."focalLength",
          'iso', asset_exif.iso,
          'latitude', asset_exif.latitude,
          'longitude', asset_exif.longitude,
          'city', asset_exif.city,
          'state', asset_exif.state,
          'country', asset_exif.country,
          'description', asset_exif.description,
          'fps', asset_exif.fps,
          'exposureTime', asset_exif."exposureTime",
          'livePhotoCID', asset_exif."livePhotoCID",
          'timeZone', asset_exif."timeZone",
          'projectionType', asset_exif."projectionType",
          'profileDescription', asset_exif."profileDescription",
          'colorspace', asset_exif.colorspace,
          'bitsPerSample', asset_exif."bitsPerSample",
          'autoStackId', asset_exif."autoStackId",
          'rating', asset_exif.rating,
          'tags', asset_exif.tags,
          'lockedProperties', asset_exif."lockedProperties"
        )`.as('exifInfo')]);
    }

    if (owner) {
      // Subquery for owner
      query = query.select((eb) => [
        eb.selectFrom('user')
          .select(sql`json_object('id', "user".id, 'name', "user".name, 'email', "user".email, 'isAdmin', "user"."isAdmin", 'profileImagePath', "user"."profileImagePath", 'avatarColor', "user"."avatarColor")`.as('val'))
          .whereRef('user.id', '=', 'asset.ownerId')
          .limit(1)
          .as('owner'),
      ]);
    }

    if (files) {
      query = query.select((eb) => [
        eb.selectFrom('asset_file')
          .select(sql`json_group_array(json_object('id', asset_file.id, 'assetId', asset_file."assetId", 'type', asset_file.type, 'path', asset_file.path, 'isEdited', asset_file."isEdited", 'isProgressive', asset_file."isProgressive"))`.as('val'))
          .whereRef('asset_file.assetId', '=', 'asset.id')
          .as('files'),
      ]);
    }

    if (tags) {
      query = query.select((eb) => [
        eb.selectFrom('tag')
          .innerJoin('tag_asset', 'tag.id', 'tag_asset.tagId')
          .select(sql`json_group_array(json_object('id', tag.id, 'value', tag.value, 'color', tag.color, 'parentId', tag."parentId"))`.as('val'))
          .whereRef('tag_asset.assetId', '=', 'asset.id')
          .as('tags'),
      ]);
    }

    if (edits) {
      query = query.select((eb) => [
        eb.selectFrom('asset_edit')
          .select(sql`json_group_array(json_object('id', asset_edit.id, 'action', asset_edit.action, 'parameters', asset_edit.parameters, 'sequence', asset_edit.sequence))`.as('val'))
          .whereRef('asset_edit.assetId', '=', 'asset.id')
          .orderBy('asset_edit.sequence', 'asc')
          .as('edits'),
      ]);
    }

    if (stack) {
      query = query
        .leftJoin('stack', 'stack.id', 'asset.stackId')
        .select((eb) => {
          if (stack.assets) {
            return [sql`CASE WHEN stack.id IS NOT NULL THEN json_object(
              'id', stack.id,
              'primaryAssetId', stack."primaryAssetId",
              'ownerId', stack."ownerId",
              'assetCount', (SELECT COUNT(*) FROM asset AS stacked WHERE stacked."stackId" = stack.id AND stacked."deletedAt" IS NULL),
              'assets', (SELECT json_group_array(json_object('id', stacked.id)) FROM asset AS stacked WHERE stacked."stackId" = stack.id AND stacked.id != stack."primaryAssetId" AND stacked."deletedAt" IS NULL AND stacked.visibility = ${AssetVisibility.Timeline})
            ) ELSE NULL END`.as('stack')];
          }
          return [sql`CASE WHEN stack.id IS NOT NULL THEN json_object(
            'id', stack.id,
            'primaryAssetId', stack."primaryAssetId",
            'ownerId', stack."ownerId",
            'assetCount', (SELECT COUNT(*) FROM asset AS stacked WHERE stacked."stackId" = stack.id AND stacked."deletedAt" IS NULL)
          ) ELSE NULL END`.as('stack')];
        });
    }

    // Faces and people -- asset_face table is not available in D1 (machine learning
    // features are not supported in the Workers build).  Return an empty array.
    if (faces) {
      query = query.select(sql`'[]'`.as('faces'));
    }

    const result = await query.limit(1).executeTakeFirst();

    if (!result) return undefined;

    // Parse JSON subquery results
    return this.parseAssetRelations(result);
  }

  async getByIds(ids: string[]) {
    if (ids.length === 0) return [];

    const results = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const rows = await this.db
        .selectFrom('asset')
        .selectAll('asset')
        .where('asset.id', 'in', chunk)
        .execute();
      results.push(...rows);
    }
    return results;
  }

  async deleteAll(ownerId: string): Promise<void> {
    await this.db.deleteFrom('asset').where('ownerId', '=', ownerId).execute();
  }

  async getByDeviceIds(ownerId: string, deviceId: string, deviceAssetIds: string[]): Promise<string[]> {
    if (deviceAssetIds.length === 0) return [];

    const results: string[] = [];
    for (let i = 0; i < deviceAssetIds.length; i += CHUNK_SIZE) {
      const chunk = deviceAssetIds.slice(i, i + CHUNK_SIZE);
      const assets = await this.db
        .selectFrom('asset')
        .select(['deviceAssetId'])
        .where('deviceAssetId', 'in', chunk)
        .where('deviceId', '=', deviceId)
        .where('ownerId', '=', ownerId)
        .execute();
      results.push(...assets.map((a) => a.deviceAssetId));
    }
    return results;
  }

  async getAllByDeviceId(ownerId: string, deviceId: string): Promise<string[]> {
    const items = await this.db
      .selectFrom('asset')
      .select(['deviceAssetId'])
      .where('ownerId', '=', ownerId)
      .where('deviceId', '=', deviceId)
      .where('visibility', '!=', AssetVisibility.Hidden)
      .where('deletedAt', 'is', null)
      .execute();

    return items.map((asset) => asset.deviceAssetId);
  }

  async getLivePhotoCount(motionId: string): Promise<number> {
    const result = await this.db
      .selectFrom('asset')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('livePhotoVideoId', '=', motionId)
      .executeTakeFirst();
    return result?.count ?? 0;
  }

  getForCopy(id: string) {
    return this.db
      .selectFrom('asset')
      .select(['id', 'stackId', 'originalPath', 'isFavorite'])
      .select((eb) => [
        eb.selectFrom('asset_file')
          .select(sql`json_group_array(json_object('id', asset_file.id, 'assetId', asset_file."assetId", 'type', asset_file.type, 'path', asset_file.path, 'isEdited', asset_file."isEdited"))`.as('val'))
          .whereRef('asset_file.assetId', '=', 'asset.id')
          .as('files'),
      ])
      .where('id', '=', id)
      .limit(1)
      .executeTakeFirst()
      .then((result) => {
        if (!result) return undefined;
        return {
          ...result,
          files: this.parseJsonArray(result.files),
        };
      });
  }

  async updateAll(ids: string[], options: Updateable<AssetTable>): Promise<void> {
    if (ids.length === 0) return;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      await this.db.updateTable('asset').set(options).where('id', 'in', chunk).execute();
    }
  }

  async update(asset: Updateable<AssetTable> & { id: string }) {
    const { id, ...value } = removeUndefined(asset as Record<string, unknown>) as any;
    if (Object.keys(value).length === 0) {
      return this.getById(id, { exifInfo: true, edits: true });
    }

    await this.db
      .updateTable('asset')
      .set(value)
      .where('id', '=', id)
      .execute();

    return this.getById(id, { exifInfo: true, edits: true });
  }

  async remove(asset: { id: string }): Promise<void> {
    await this.db.deleteFrom('asset').where('id', '=', asset.id).execute();
  }

  getByChecksum({ ownerId, libraryId, checksum }: { ownerId: string; libraryId?: string | null; checksum: Uint8Array }) {
    let query = this.db
      .selectFrom('asset')
      .selectAll('asset')
      .where('ownerId', '=', ownerId)
      .where('checksum', '=', checksum);

    if (libraryId) {
      query = query.where('libraryId', '=', libraryId);
    } else {
      query = query.where('libraryId', 'is', null);
    }

    return query.limit(1).executeTakeFirst();
  }

  async getByChecksums(userId: string, checksums: Uint8Array[]) {
    if (checksums.length === 0) return [];

    const results = [];
    for (let i = 0; i < checksums.length; i += CHUNK_SIZE) {
      const chunk = checksums.slice(i, i + CHUNK_SIZE);
      const rows = await this.db
        .selectFrom('asset')
        .select(['id', 'checksum', 'deletedAt'])
        .where('ownerId', '=', userId)
        .where('checksum', 'in', chunk)
        .execute();
      results.push(...rows);
    }
    return results;
  }

  async getUploadAssetIdByChecksum(ownerId: string, checksum: Uint8Array): Promise<string | undefined> {
    const asset = await this.db
      .selectFrom('asset')
      .select('id')
      .where('ownerId', '=', ownerId)
      .where('checksum', '=', checksum)
      .where('libraryId', 'is', null)
      .limit(1)
      .executeTakeFirst();

    return asset?.id;
  }

  getStatistics(ownerId: string, { visibility, isFavorite, isTrashed }: AssetStatsOptions): Promise<AssetStats> {
    let query = this.db
      .selectFrom('asset')
      .select((eb) => [
        eb.fn.countAll<number>().filterWhere('type', '=', AssetType.Audio).as(AssetType.Audio),
        eb.fn.countAll<number>().filterWhere('type', '=', AssetType.Image).as(AssetType.Image),
        eb.fn.countAll<number>().filterWhere('type', '=', AssetType.Video).as(AssetType.Video),
        eb.fn.countAll<number>().filterWhere('type', '=', AssetType.Other).as(AssetType.Other),
      ])
      .where('ownerId', '=', ownerId);

    if (visibility === undefined) {
      query = withDefaultVisibility(query);
    } else {
      query = query.where('asset.visibility', '=', visibility);
    }

    if (isFavorite !== undefined) {
      query = query.where('isFavorite', '=', isFavorite ? 1 : 0);
    }

    if (isTrashed) {
      query = query.where('asset.status', '!=', AssetStatus.Deleted);
    }

    query = query.where('deletedAt', isTrashed ? 'is not' : 'is', null);

    return query.executeTakeFirstOrThrow() as Promise<AssetStats>;
  }

  async getRandom(userIds: string[], take: number) {
    if (userIds.length === 0) return [];

    const query = this.db
      .selectFrom('asset')
      .selectAll('asset')
      .leftJoin('asset_exif', 'asset.id', 'asset_exif.assetId')
      .select((eb) => [sql`json_object(
        'assetId', asset_exif."assetId",
        'make', asset_exif.make,
        'model', asset_exif.model,
        'exifImageWidth', asset_exif."exifImageWidth",
        'exifImageHeight', asset_exif."exifImageHeight",
        'fileSizeInByte', asset_exif."fileSizeInByte",
        'orientation', asset_exif.orientation,
        'dateTimeOriginal', asset_exif."dateTimeOriginal",
        'modifyDate', asset_exif."modifyDate",
        'lensModel', asset_exif."lensModel",
        'fNumber', asset_exif."fNumber",
        'focalLength', asset_exif."focalLength",
        'iso', asset_exif.iso,
        'latitude', asset_exif.latitude,
        'longitude', asset_exif.longitude,
        'city', asset_exif.city,
        'state', asset_exif.state,
        'country', asset_exif.country,
        'description', asset_exif.description,
        'fps', asset_exif.fps,
        'exposureTime', asset_exif."exposureTime",
        'livePhotoCID', asset_exif."livePhotoCID",
        'timeZone', asset_exif."timeZone",
        'projectionType', asset_exif."projectionType",
        'profileDescription', asset_exif."profileDescription",
        'colorspace', asset_exif.colorspace,
        'bitsPerSample', asset_exif."bitsPerSample",
        'rating', asset_exif.rating,
        'tags', asset_exif.tags,
        'lockedProperties', asset_exif."lockedProperties"
      )`.as('exifInfo')])
      .where('asset.visibility', '!=', AssetVisibility.Hidden)
      .where('asset.ownerId', 'in', userIds)
      .where('asset.deletedAt', 'is', null)
      .orderBy(sql`RANDOM()`)
      .limit(take);

    const results = await query.execute();
    return results.map((r) => this.parseAssetRelations(r));
  }

  // -------------------------------------------------------------------------
  // Asset files
  // -------------------------------------------------------------------------

  async upsertFile(
    file: Pick<Insertable<AssetFileTable>, 'assetId' | 'path' | 'type' | 'isEdited' | 'isProgressive'>,
  ): Promise<void> {
    await this.db
      .insertInto('asset_file')
      .values({ id: crypto.randomUUID(), ...file })
      .onConflict((oc) =>
        oc.columns(['assetId', 'type', 'isEdited']).doUpdateSet((eb) => ({
          path: eb.ref('excluded.path'),
        })),
      )
      .execute();
  }

  async upsertFiles(
    files: Pick<Insertable<AssetFileTable>, 'assetId' | 'path' | 'type' | 'isEdited' | 'isProgressive'>[],
  ): Promise<void> {
    if (files.length === 0) return;

    await this.db
      .insertInto('asset_file')
      .values(files.map((f) => ({ id: crypto.randomUUID(), ...f })))
      .onConflict((oc) =>
        oc.columns(['assetId', 'type', 'isEdited']).doUpdateSet((eb) => ({
          path: eb.ref('excluded.path'),
          isProgressive: eb.ref('excluded.isProgressive'),
        })),
      )
      .execute();
  }

  async deleteFile({ assetId, type }: { assetId: string; type: AssetFileType }): Promise<void> {
    await this.db
      .deleteFrom('asset_file')
      .where('assetId', '=', assetId)
      .where('type', '=', type)
      .execute();
  }

  // -------------------------------------------------------------------------
  // Media query helpers
  // -------------------------------------------------------------------------

  async getForOriginal(id: string, isEdited: boolean) {
    let query = this.db
      .selectFrom('asset')
      .select(['originalFileName', 'originalPath'])
      .where('asset.id', '=', id);

    if (isEdited) {
      query = query
        .leftJoin('asset_file', (join) =>
          join
            .onRef('asset.id', '=', 'asset_file.assetId')
            .on('asset_file.isEdited', '=', 1)
            .on('asset_file.type', '=', AssetFileType.FullSize),
        )
        .select('asset_file.path as editedPath');
    }

    return query.executeTakeFirstOrThrow();
  }

  async getForThumbnail(id: string, type: AssetFileType, isEdited: boolean) {
    return this.db
      .selectFrom('asset')
      .where('asset.id', '=', id)
      .leftJoin('asset_file', (join) =>
        join.onRef('asset.id', '=', 'asset_file.assetId').on('asset_file.type', '=', type),
      )
      .select(['asset.originalPath', 'asset.originalFileName', 'asset_file.path as path'])
      .orderBy('asset_file.isEdited', isEdited ? 'desc' : 'asc')
      .executeTakeFirstOrThrow();
  }

  async getForVideo(id: string) {
    return this.db
      .selectFrom('asset')
      .select(['asset.encodedVideoPath', 'asset.originalPath'])
      .where('asset.id', '=', id)
      .where('asset.type', '=', AssetType.Video)
      .executeTakeFirst();
  }

  findLivePhotoMatch(options: {
    ownerId: string;
    libraryId?: string | null;
    livePhotoCID: string;
    otherAssetId: string;
    type: AssetType;
  }) {
    const { ownerId, otherAssetId, livePhotoCID, type } = options;
    return this.db
      .selectFrom('asset')
      .select(['asset.id', 'asset.ownerId'])
      .innerJoin('asset_exif', 'asset.id', 'asset_exif.assetId')
      .where('asset.id', '!=', otherAssetId)
      .where('asset.ownerId', '=', ownerId)
      .where('asset.type', '=', type)
      .where('asset_exif.livePhotoCID', '=', livePhotoCID)
      .limit(1)
      .executeTakeFirst();
  }

  async getLibraryAssetCount(libraryId: string): Promise<number> {
    const { count } = await this.db
      .selectFrom('asset')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('libraryId', '=', libraryId)
      .executeTakeFirstOrThrow();

    return count;
  }

  // -------------------------------------------------------------------------
  // Job status
  // -------------------------------------------------------------------------

  async upsertJobStatus(...jobStatus: Insertable<any>[]): Promise<void> {
    if (jobStatus.length === 0) return;

    await this.db
      .insertInto('asset_job_status' as any)
      .values(jobStatus)
      .onConflict((oc) =>
        oc.column('assetId').doUpdateSet((eb) => {
          const result: Record<string, any> = {};
          const cols = ['duplicatesDetectedAt', 'facesRecognizedAt', 'metadataExtractedAt', 'ocrAt'];
          for (const col of cols) {
            if ((jobStatus[0] as any)[col] !== undefined) {
              result[col] = eb.ref(`excluded.${col}` as any);
            }
          }
          return result;
        }),
      )
      .execute();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private parseJsonArray(val: unknown): any[] {
    if (!val) return [];
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed.filter((x: any) => x !== null) : [];
      } catch {
        return [];
      }
    }
    if (Array.isArray(val)) return val;
    return [];
  }

  private parseJsonObject(val: unknown): any | null {
    if (!val) return null;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    }
    return val;
  }

  private parseAssetRelations(result: any) {
    const parsed = { ...result };

    // Normalize SQLite integer booleans to JS booleans
    if ('isFavorite' in parsed) parsed.isFavorite = Boolean(parsed.isFavorite);
    if ('isArchived' in parsed) parsed.isArchived = Boolean(parsed.isArchived);
    if ('isReadOnly' in parsed) parsed.isReadOnly = Boolean(parsed.isReadOnly);
    if ('isExternal' in parsed) parsed.isExternal = Boolean(parsed.isExternal);
    if ('isOffline' in parsed) parsed.isOffline = Boolean(parsed.isOffline);

    if ('exifInfo' in parsed) {
      parsed.exifInfo = this.parseJsonObject(parsed.exifInfo);
    }
    if ('owner' in parsed) {
      parsed.owner = this.parseJsonObject(parsed.owner);
    }
    if ('files' in parsed) {
      parsed.files = this.parseJsonArray(parsed.files);
    }
    if ('tags' in parsed) {
      parsed.tags = this.parseJsonArray(parsed.tags);
    }
    if ('edits' in parsed) {
      const edits = this.parseJsonArray(parsed.edits);
      parsed.edits = edits.map((e: any) => ({
        ...e,
        parameters: typeof e.parameters === 'string' ? JSON.parse(e.parameters) : e.parameters,
      }));
    }
    if ('stack' in parsed) {
      const stack = this.parseJsonObject(parsed.stack);
      if (stack && stack.assets && typeof stack.assets === 'string') {
        stack.assets = JSON.parse(stack.assets);
      }
      parsed.stack = stack;
    }
    if ('faces' in parsed) {
      const faces = this.parseJsonArray(parsed.faces);
      parsed.faces = faces.map((f: any) => ({
        ...f,
        person: typeof f.person === 'string' ? JSON.parse(f.person) : f.person,
      }));
    }

    return parsed;
  }
}
