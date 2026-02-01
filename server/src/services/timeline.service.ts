/**
 * Timeline service -- Workers-compatible version.
 *
 * Provides time bucket queries for the timeline view.
 * Uses SQLite-compatible date functions instead of PostgreSQL date_trunc.
 * No NestJS, no BaseService.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import type { TimeBucketDto, TimeBucketAssetDto, TimeBucketsResponseDto, TimeBucketAssetResponseDto } from 'src/dtos/time-bucket.dto';
import { AssetOrder, AssetType, AssetVisibility, Permission } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { sql } from 'kysely';
import { AccessRepository } from 'src/repositories/access.repository';
import { requireAccess, requireElevatedPermission } from 'src/utils/access';
import { BadRequestException } from 'src/utils/errors';

export class TimelineService {
  private accessRepository: AccessRepository;

  private get db() {
    return this.ctx.db;
  }

  constructor(private ctx: ServiceContext) {
    this.accessRepository = new AccessRepository(ctx.db);
  }

  async getTimeBuckets(auth: AuthDto, dto: TimeBucketDto): Promise<TimeBucketsResponseDto[]> {
    await this.timeBucketChecks(auth, dto);
    const { userIds, albumId, tagId, isFavorite, visibility, order } = this.buildOptions(auth, dto);

    // SQLite: strftime('%Y-%m-01', col) instead of date_trunc('MONTH', col)
    let query = this.db
      .selectFrom('asset')
      .select([
        this.db.fn<string>('strftime', [sql.val('%Y-%m-01'), 'asset.localDateTime']).as('timeBucket'),
      ])
      .select((eb) => eb.fn.countAll().as('count'))
      .where('asset.deletedAt', 'is', null);

    if (userIds && userIds.length > 0) {
      query = query.where('asset.ownerId', 'in', userIds);
    }

    if (albumId) {
      query = query
        .innerJoin('album_asset', 'album_asset.assetId', 'asset.id')
        .where('album_asset.albumId', '=', albumId);
    }

    if (tagId) {
      query = query
        .innerJoin('tag_asset', 'tag_asset.assetId', 'asset.id')
        .where('tag_asset.tagId', '=', tagId);
    }

    if (isFavorite !== undefined) {
      query = query.where('asset.isFavorite', '=', isFavorite ? 1 : 0);
    }

    if (visibility === AssetVisibility.Archive) {
      query = query.where('asset.visibility', '=', AssetVisibility.Archive);
    } else if (visibility === AssetVisibility.Locked) {
      query = query.where('asset.visibility', '=', AssetVisibility.Locked);
    } else {
      query = query.where('asset.visibility', '=', AssetVisibility.Timeline);
    }

    query = query
      .groupBy(this.db.fn('strftime', [sql.val('%Y-%m-01'), 'asset.localDateTime']))
      .orderBy(this.db.fn('strftime', [sql.val('%Y-%m-01'), 'asset.localDateTime']),
        order === AssetOrder.Asc ? 'asc' : 'desc');

    const rows = await query.execute();

    return rows.map((row) => ({
      timeBucket: row.timeBucket as string,
      count: Number(row.count),
    }));
  }

  async getTimeBucket(auth: AuthDto, dto: TimeBucketAssetDto): Promise<TimeBucketAssetResponseDto> {
    await this.timeBucketChecks(auth, dto);
    const { userIds, albumId, tagId, isFavorite, visibility, order } = this.buildOptions(auth, dto);

    let query = this.db
      .selectFrom('asset')
      .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
      .select([
        'asset.id',
        'asset.ownerId',
        'asset.type',
        'asset.isFavorite',
        'asset.visibility',
        'asset.deletedAt',
        'asset.thumbhash',
        'asset.fileCreatedAt',
        'asset.localDateTime',
        'asset.duration',
        'asset.livePhotoVideoId',
        'asset.stackId',
        'asset.width',
        'asset.height',
        'asset_exif.projectionType',
        'asset_exif.city',
        'asset_exif.country',
        'asset_exif.latitude',
        'asset_exif.longitude',
        'asset_exif.timeZone',
      ])
      .where('asset.deletedAt', 'is', null)
      .where(
        this.db.fn<string>('strftime', [sql.val('%Y-%m-01'), 'asset.localDateTime']),
        '=',
        dto.timeBucket,
      );

    if (userIds && userIds.length > 0) {
      query = query.where('asset.ownerId', 'in', userIds);
    }

    if (albumId) {
      query = query
        .innerJoin('album_asset', 'album_asset.assetId', 'asset.id')
        .where('album_asset.albumId', '=', albumId);
    }

    if (tagId) {
      query = query
        .innerJoin('tag_asset', 'tag_asset.assetId', 'asset.id')
        .where('tag_asset.tagId', '=', tagId);
    }

    if (isFavorite !== undefined) {
      query = query.where('asset.isFavorite', '=', isFavorite ? 1 : 0);
    }

    if (visibility === AssetVisibility.Archive) {
      query = query.where('asset.visibility', '=', AssetVisibility.Archive);
    } else if (visibility === AssetVisibility.Locked) {
      query = query.where('asset.visibility', '=', AssetVisibility.Locked);
    } else {
      query = query.where('asset.visibility', '=', AssetVisibility.Timeline);
    }

    query = query.orderBy('asset.localDateTime', order === AssetOrder.Asc ? 'asc' : 'desc');

    const rows = await query.execute();

    // Build columnar response
    const result: TimeBucketAssetResponseDto = {
      id: [],
      ownerId: [],
      ratio: [],
      isFavorite: [],
      visibility: [],
      isTrashed: [],
      isImage: [],
      thumbhash: [],
      fileCreatedAt: [],
      localOffsetHours: [],
      duration: [],
      projectionType: [],
      livePhotoVideoId: [],
      city: [],
      country: [],
      latitude: [],
      longitude: [],
    };

    for (const row of rows) {
      result.id.push(row.id);
      result.ownerId.push(row.ownerId);

      const w = row.width ?? 1;
      const h = row.height ?? 1;
      result.ratio.push(h > 0 ? w / h : 1);

      result.isFavorite.push(Boolean(row.isFavorite));
      result.visibility.push(row.visibility as AssetVisibility);
      result.isTrashed.push(row.deletedAt !== null);
      result.isImage.push(row.type === AssetType.Image);

      // thumbhash: convert BLOB to base64
      if (row.thumbhash && row.thumbhash instanceof Uint8Array) {
        const bytes = row.thumbhash;
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        result.thumbhash.push(btoa(binary));
      } else {
        result.thumbhash.push(null);
      }

      result.fileCreatedAt.push(row.fileCreatedAt ?? '');

      // Calculate local offset hours from timezone
      let offsetHours = 0;
      if (row.timeZone && row.localDateTime && row.fileCreatedAt) {
        const local = new Date(row.localDateTime).getTime();
        const utc = new Date(row.fileCreatedAt).getTime();
        offsetHours = (local - utc) / (1000 * 60 * 60);
      }
      result.localOffsetHours.push(offsetHours);

      result.duration.push(row.duration ?? null);
      result.projectionType.push(row.projectionType ?? null);
      result.livePhotoVideoId.push(row.livePhotoVideoId ?? null);
      result.city.push(row.city ?? null);
      result.country.push(row.country ?? null);
      result.latitude.push(row.latitude ?? 0);
      result.longitude.push(row.longitude ?? 0);
    }

    return result;
  }

  private buildOptions(auth: AuthDto, dto: TimeBucketDto) {
    let userIds: string[] | undefined;
    if (dto.userId) {
      userIds = [dto.userId];
    }

    return {
      userIds,
      albumId: dto.albumId,
      tagId: dto.tagId,
      isFavorite: dto.isFavorite,
      visibility: dto.visibility,
      order: dto.order ?? AssetOrder.Desc,
    };
  }

  private async timeBucketChecks(auth: AuthDto, dto: TimeBucketDto) {
    if (dto.visibility === AssetVisibility.Locked) {
      requireElevatedPermission(auth);
    }

    if (dto.albumId) {
      await requireAccess(this.accessRepository, { auth, permission: Permission.AlbumRead, ids: [dto.albumId] });
    } else {
      dto.userId = dto.userId || auth.user.id;
    }

    if (dto.userId) {
      await requireAccess(this.accessRepository, { auth, permission: Permission.TimelineRead, ids: [dto.userId] });
      if (dto.visibility === AssetVisibility.Archive) {
        await requireAccess(this.accessRepository, { auth, permission: Permission.ArchiveRead, ids: [dto.userId] });
      }
    }

    if (dto.tagId) {
      await requireAccess(this.accessRepository, { auth, permission: Permission.TagRead, ids: [dto.tagId] });
    }

    if (dto.withPartners) {
      const requestedArchived = dto.visibility === AssetVisibility.Archive || dto.visibility === undefined;
      const requestedFavorite = dto.isFavorite === true || dto.isFavorite === false;
      const requestedTrash = dto.isTrashed === true;

      if (requestedArchived || requestedFavorite || requestedTrash) {
        throw new BadRequestException(
          'withPartners is only supported for non-archived, non-trashed, non-favorited assets',
        );
      }
    }
  }
}
