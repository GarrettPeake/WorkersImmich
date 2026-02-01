/**
 * Search service -- Workers-compatible version.
 *
 * Simplified metadata-only search that queries D1 directly.
 * No ML/smart search, no CLIP embeddings.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import { AssetType, AssetVisibility } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { mapAsset, AssetResponseDto } from 'src/dtos/asset-response.dto';

export class SearchService {
  private get db() {
    return this.ctx.db;
  }

  constructor(private ctx: ServiceContext) {}

  /**
   * Search assets by metadata (date, location, type, etc.)
   */
  async searchMetadata(auth: AuthDto, dto: {
    originalFileName?: string;
    city?: string;
    state?: string;
    country?: string;
    make?: string;
    model?: string;
    type?: string;
    isFavorite?: boolean;
    isVisible?: boolean;
    page?: number;
    size?: number;
  }) {
    const page = dto.page ?? 1;
    const size = dto.size ?? 250;
    const offset = (page - 1) * size;

    let query = this.db
      .selectFrom('asset')
      .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
      .selectAll('asset')
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.deletedAt', 'is', null);

    if (dto.originalFileName) {
      query = query.where('asset.originalFileName', 'like', `%${dto.originalFileName}%`);
    }

    if (dto.city) {
      query = query.where('asset_exif.city', 'like', `%${dto.city}%`);
    }

    if (dto.state) {
      query = query.where('asset_exif.state', 'like', `%${dto.state}%`);
    }

    if (dto.country) {
      query = query.where('asset_exif.country', 'like', `%${dto.country}%`);
    }

    if (dto.make) {
      query = query.where('asset_exif.make', 'like', `%${dto.make}%`);
    }

    if (dto.model) {
      query = query.where('asset_exif.model', 'like', `%${dto.model}%`);
    }

    if (dto.type) {
      query = query.where('asset.type', '=', dto.type);
    }

    if (dto.isFavorite !== undefined) {
      query = query.where('asset.isFavorite', '=', dto.isFavorite ? 1 : 0);
    }

    query = query
      .orderBy('asset.fileCreatedAt', 'desc')
      .limit(size)
      .offset(offset);

    const assets = await query.execute();
    return {
      assets: {
        total: assets.length,
        count: assets.length,
        items: assets.map((a: any) => mapAsset(a, { auth })),
        facets: [],
        nextPage: assets.length === size ? `${page + 1}` : null,
      },
    };
  }

  /**
   * Get search statistics (asset counts by type, visibility, etc.)
   */
  async getStatistics(auth: AuthDto) {
    const images = await this.db
      .selectFrom('asset')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.type', '=', AssetType.Image)
      .where('asset.deletedAt', 'is', null)
      .where('asset.visibility', '=', AssetVisibility.Timeline)
      .executeTakeFirst();

    const videos = await this.db
      .selectFrom('asset')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.type', '=', AssetType.Video)
      .where('asset.deletedAt', 'is', null)
      .where('asset.visibility', '=', AssetVisibility.Timeline)
      .executeTakeFirst();

    return {
      images: Number(images?.count ?? 0),
      videos: Number(videos?.count ?? 0),
      total: Number(images?.count ?? 0) + Number(videos?.count ?? 0),
    };
  }

  /**
   * Get random assets.
   */
  async getRandom(auth: AuthDto, dto: { count?: number }) {
    const count = dto.count ?? 1;

    const assets = await this.db
      .selectFrom('asset')
      .selectAll()
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.deletedAt', 'is', null)
      .where('asset.visibility', '=', AssetVisibility.Timeline)
      .orderBy(this.db.fn('random'))
      .limit(count)
      .execute();

    return assets.map((a: any) => mapAsset(a, { auth }));
  }

  /**
   * Find large assets by file size.
   */
  async getLargeAssets(auth: AuthDto, dto: { minSize?: number; page?: number; size?: number }) {
    const page = dto.page ?? 1;
    const size = dto.size ?? 250;
    const offset = (page - 1) * size;
    const minSize = dto.minSize ?? 0;

    const assets = await this.db
      .selectFrom('asset')
      .innerJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
      .selectAll('asset')
      .select('asset_exif.fileSizeInByte')
      .where('asset.ownerId', '=', auth.user.id)
      .where('asset.deletedAt', 'is', null)
      .where('asset_exif.fileSizeInByte', '>', minSize)
      .orderBy('asset_exif.fileSizeInByte', 'desc')
      .limit(size)
      .offset(offset)
      .execute();

    return assets.map((a: any) => mapAsset(a, { auth }));
  }

  /**
   * Get search suggestions (cities, countries, makes, models, etc.)
   */
  async getSuggestions(auth: AuthDto, dto: { type: string; query?: string }) {
    const { type, query: searchQuery } = dto;

    switch (type) {
      case 'city': {
        let q = this.db
          .selectFrom('asset_exif')
          .innerJoin('asset', 'asset.id', 'asset_exif.assetId')
          .select('asset_exif.city')
          .distinct()
          .where('asset.ownerId', '=', auth.user.id)
          .where('asset_exif.city', 'is not', null);

        if (searchQuery) {
          q = q.where('asset_exif.city', 'like', `%${searchQuery}%`);
        }

        const rows = await q.limit(20).execute();
        return rows.map((r) => r.city).filter(Boolean);
      }

      case 'country': {
        let q = this.db
          .selectFrom('asset_exif')
          .innerJoin('asset', 'asset.id', 'asset_exif.assetId')
          .select('asset_exif.country')
          .distinct()
          .where('asset.ownerId', '=', auth.user.id)
          .where('asset_exif.country', 'is not', null);

        if (searchQuery) {
          q = q.where('asset_exif.country', 'like', `%${searchQuery}%`);
        }

        const rows = await q.limit(20).execute();
        return rows.map((r) => r.country).filter(Boolean);
      }

      case 'camera-make': {
        let q = this.db
          .selectFrom('asset_exif')
          .innerJoin('asset', 'asset.id', 'asset_exif.assetId')
          .select('asset_exif.make')
          .distinct()
          .where('asset.ownerId', '=', auth.user.id)
          .where('asset_exif.make', 'is not', null);

        if (searchQuery) {
          q = q.where('asset_exif.make', 'like', `%${searchQuery}%`);
        }

        const rows = await q.limit(20).execute();
        return rows.map((r) => r.make).filter(Boolean);
      }

      case 'camera-model': {
        let q = this.db
          .selectFrom('asset_exif')
          .innerJoin('asset', 'asset.id', 'asset_exif.assetId')
          .select('asset_exif.model')
          .distinct()
          .where('asset.ownerId', '=', auth.user.id)
          .where('asset_exif.model', 'is not', null);

        if (searchQuery) {
          q = q.where('asset_exif.model', 'like', `%${searchQuery}%`);
        }

        const rows = await q.limit(20).execute();
        return rows.map((r) => r.model).filter(Boolean);
      }

      default:
        return [];
    }
  }
}
