/**
 * Asset service — Workers-compatible version.
 *
 * Core business logic for asset CRUD operations.
 * No NestJS decorators, no BaseService, no job queues, no node: imports.
 */

import { AssetResponseDto, SanitizedAssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import {
  AssetBulkDeleteDto,
  AssetBulkUpdateDto,
  AssetCopyDto,
  AssetJobsDto,
  AssetMetadataBulkDeleteDto,
  AssetMetadataBulkResponseDto,
  AssetMetadataBulkUpsertDto,
  AssetMetadataResponseDto,
  AssetMetadataUpsertDto,
  AssetStatsDto,
  UpdateAssetDto,
  mapStats,
} from 'src/dtos/asset.dto';
import type { AuthDto } from 'src/dtos/auth.dto';
import { AssetEditAction, type AssetEditActionCrop, type AssetEditActionListDto, type AssetEditsDto } from 'src/dtos/editing.dto';
import { AssetFileType, AssetStatus, AssetType, AssetVisibility, Permission } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { AssetRepository } from 'src/repositories/asset.repository';
import { AccessRepository } from 'src/repositories/access.repository';
import { requireAccess, requireElevatedPermission } from 'src/utils/access';

// ---------------------------------------------------------------------------
// Helper: omit undefined values from an object
// ---------------------------------------------------------------------------

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result = {} as Partial<T>;
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AssetService {
  private assetRepository: AssetRepository;
  private accessRepository: AccessRepository;

  private get db() {
    return this.ctx.db;
  }

  constructor(private ctx: ServiceContext) {
    this.assetRepository = new AssetRepository(ctx.db);
    this.accessRepository = new AccessRepository(ctx.db);
  }

  async getStatistics(auth: AuthDto, dto: AssetStatsDto) {
    if (dto.visibility === AssetVisibility.Locked) {
      requireElevatedPermission(auth);
    }

    const stats = await this.assetRepository.getStatistics(auth.user.id, dto);
    return mapStats(stats);
  }

  async getRandom(auth: AuthDto, count: number): Promise<AssetResponseDto[]> {
    // For now, just use the user's own assets (partner access can be added later)
    const userIds = [auth.user.id];
    const assets = await this.assetRepository.getRandom(userIds, count);
    return assets.map((a: any) => mapAsset(a, { auth }));
  }

  async getUserAssetsByDeviceId(auth: AuthDto, deviceId: string) {
    return this.assetRepository.getAllByDeviceId(auth.user.id, deviceId);
  }

  async get(auth: AuthDto, id: string): Promise<AssetResponseDto | SanitizedAssetResponseDto> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetRead,
      ids: [id],
    });

    const asset = await this.assetRepository.getById(id, {
      exifInfo: true,
      owner: true,
      faces: { person: true },
      stack: { assets: true },
      edits: true,
      tags: true,
    });

    if (!asset) {
      throw new Error('Asset not found');
    }

    if (auth.sharedLink && !auth.sharedLink.showExif) {
      return mapAsset(asset as any, { stripMetadata: true, withStack: true, auth });
    }

    const data = mapAsset(asset as any, { withStack: true, auth });

    if (auth.sharedLink) {
      delete data.owner;
    }

    if (data.ownerId !== auth.user.id || auth.sharedLink) {
      data.people = [];
    }

    return data;
  }

  async update(auth: AuthDto, id: string, dto: UpdateAssetDto): Promise<AssetResponseDto> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids: [id],
    });

    const { description, dateTimeOriginal, latitude, longitude, rating, ...rest } = dto;

    await this.updateExif({ id, description, dateTimeOriginal, latitude, longitude, rating });

    const asset = await this.assetRepository.update({ id, ...rest });

    if (!asset) {
      throw new Error('Asset not found');
    }

    return mapAsset(asset as any, { auth });
  }

  async updateAll(auth: AuthDto, dto: AssetBulkUpdateDto): Promise<void> {
    const {
      ids,
      isFavorite,
      visibility,
      dateTimeOriginal,
      latitude,
      longitude,
      rating,
      description,
      duplicateId,
      dateTimeRelative,
      timeZone,
    } = dto;

    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids,
    });

    const assetDto = omitUndefined({ isFavorite, visibility, duplicateId } as Record<string, unknown>);
    const exifDto = omitUndefined({
      latitude,
      longitude,
      rating,
      description,
      dateTimeOriginal,
    } as Record<string, unknown>);

    if (Object.keys(exifDto).length > 0) {
      await this.assetRepository.updateAllExif(ids, exifDto as any);
    }

    // Handle relative date/time changes
    if (
      (dateTimeRelative !== undefined && dateTimeRelative !== 0) ||
      timeZone !== undefined
    ) {
      await this.assetRepository.updateDateTimeOriginal(ids, dateTimeRelative, timeZone);
    }

    if (Object.keys(assetDto).length > 0) {
      await this.assetRepository.updateAll(ids, assetDto as any);
    }

    // If setting to locked, remove from albums
    if (visibility === AssetVisibility.Locked) {
      // Album removal would be handled by album repository — simplified here
      // TODO: wire album repository when available
    }
  }

  async copy(
    auth: AuthDto,
    {
      sourceId,
      targetId,
      albums = true,
      sidecar = true,
      sharedLinks = true,
      stack = true,
      favorite = true,
    }: AssetCopyDto,
  ) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetCopy,
      ids: [sourceId, targetId],
    });

    const sourceAsset = await this.assetRepository.getForCopy(sourceId);
    const targetAsset = await this.assetRepository.getForCopy(targetId);

    if (!sourceAsset || !targetAsset) {
      throw new Error('Both assets must exist');
    }

    if (sourceId === targetId) {
      throw new Error('Source and target id must be distinct');
    }

    // Albums, shared links, and sidecar copy are simplified stubs for Workers
    // Full implementation would wire additional repositories

    if (favorite) {
      await this.assetRepository.update({ id: targetId, isFavorite: sourceAsset.isFavorite });
    }
  }

  async deleteAll(auth: AuthDto, dto: AssetBulkDeleteDto): Promise<void> {
    const { ids, force } = dto;

    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetDelete,
      ids,
    });

    await this.assetRepository.updateAll(ids, {
      deletedAt: new Date().toISOString(),
      status: force ? AssetStatus.Deleted : AssetStatus.Trashed,
    });
  }

  async getMetadata(auth: AuthDto, id: string): Promise<AssetMetadataResponseDto[]> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetRead,
      ids: [id],
    });
    return this.assetRepository.getMetadata(id);
  }

  async upsertBulkMetadata(auth: AuthDto, dto: AssetMetadataBulkUpsertDto): Promise<AssetMetadataBulkResponseDto[]> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids: dto.items.map((item) => item.assetId),
    });

    const uniqueKeys = new Set<string>();
    for (const item of dto.items) {
      const key = `(${item.assetId}, ${item.key})`;
      if (uniqueKeys.has(key)) {
        throw new Error(`Duplicate items are not allowed: "${key}"`);
      }
      uniqueKeys.add(key);
    }

    return this.assetRepository.upsertBulkMetadata(dto.items);
  }

  async upsertMetadata(auth: AuthDto, id: string, dto: AssetMetadataUpsertDto): Promise<AssetMetadataResponseDto[]> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids: [id],
    });

    const uniqueKeys = new Set<string>();
    for (const { key } of dto.items) {
      if (uniqueKeys.has(key)) {
        throw new Error(`Duplicate items are not allowed: "${key}"`);
      }
      uniqueKeys.add(key);
    }

    return this.assetRepository.upsertMetadata(id, dto.items);
  }

  async getMetadataByKey(auth: AuthDto, id: string, key: string): Promise<AssetMetadataResponseDto> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetRead,
      ids: [id],
    });

    const item = await this.assetRepository.getMetadataByKey(id, key);
    if (!item) {
      throw new Error(`Metadata with key "${key}" not found for asset with id "${id}"`);
    }
    return item;
  }

  async deleteMetadataByKey(auth: AuthDto, id: string, key: string): Promise<void> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids: [id],
    });
    return this.assetRepository.deleteMetadataByKey(id, key);
  }

  async deleteBulkMetadata(auth: AuthDto, dto: AssetMetadataBulkDeleteDto) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids: dto.items.map((item) => item.assetId),
    });
    await this.assetRepository.deleteBulkMetadata(dto.items);
  }

  async run(auth: AuthDto, dto: AssetJobsDto) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids: dto.assetIds,
    });

    // Job queue is not available in Workers — this is a stub.
    // Individual job actions (refresh metadata, regenerate thumbnails, etc.)
    // would need to be implemented as durable object tasks or queue consumers.
    console.warn('Asset jobs are not fully supported in Workers environment. Job:', dto.name, 'for', dto.assetIds.length, 'assets');
  }

  async getAssetEdits(auth: AuthDto, id: string): Promise<AssetEditsDto> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetRead,
      ids: [id],
    });

    const edits = await this.db
      .selectFrom('asset_edit')
      .selectAll()
      .where('assetId', '=', id)
      .orderBy('sequence', 'asc')
      .execute();

    return {
      assetId: id,
      edits: edits.map((e) => ({
        action: e.action as any,
        parameters: typeof e.parameters === 'string' ? JSON.parse(e.parameters) : e.parameters,
      })),
    };
  }

  async editAsset(auth: AuthDto, id: string, dto: AssetEditActionListDto): Promise<AssetEditsDto> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetEditCreate,
      ids: [id],
    });

    const asset = await this.assetRepository.getById(id, { exifInfo: true });
    if (!asset) {
      throw new Error('Asset not found');
    }

    if ((asset as any).type !== AssetType.Image) {
      throw new Error('Only images can be edited');
    }

    if ((asset as any).livePhotoVideoId) {
      throw new Error('Editing live photos is not supported');
    }

    if ((asset as any).originalPath?.toLowerCase().endsWith('.gif')) {
      throw new Error('Editing GIF images is not supported');
    }

    if ((asset as any).originalPath?.toLowerCase().endsWith('.svg')) {
      throw new Error('Editing SVG images is not supported');
    }

    const cropIndex = dto.edits.findIndex((e) => e.action === AssetEditAction.Crop);
    if (cropIndex > 0) {
      throw new Error('Crop action must be the first edit action');
    }

    const crop = cropIndex === -1 ? null : (dto.edits[cropIndex] as AssetEditActionCrop);
    if (crop && (asset as any).exifInfo) {
      const exif = (asset as any).exifInfo;
      const assetWidth = exif.exifImageWidth ?? 0;
      const assetHeight = exif.exifImageHeight ?? 0;

      if (!assetWidth || !assetHeight) {
        throw new Error('Asset dimensions are not available for editing');
      }

      const { x, y, width, height } = crop.parameters;
      if (x + width > assetWidth || y + height > assetHeight) {
        throw new Error('Crop parameters are out of bounds');
      }
    }

    // Replace all edits in a transaction
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('asset_edit').where('assetId', '=', id).execute();
      for (let i = 0; i < dto.edits.length; i++) {
        const edit = dto.edits[i];
        await tx.insertInto('asset_edit').values({
          id: crypto.randomUUID(),
          assetId: id,
          action: edit.action,
          parameters: JSON.stringify(edit.parameters),
          sequence: i,
        }).execute();
      }
    });

    return {
      assetId: id,
      edits: dto.edits,
    };
  }

  async removeAssetEdits(auth: AuthDto, id: string): Promise<void> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetEditDelete,
      ids: [id],
    });

    const asset = await this.assetRepository.getById(id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    await this.db.deleteFrom('asset_edit').where('assetId', '=', id).execute();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async updateExif(dto: {
    id: string;
    description?: string;
    dateTimeOriginal?: string;
    latitude?: number;
    longitude?: number;
    rating?: number;
  }) {
    const { id, description, dateTimeOriginal, latitude, longitude, rating } = dto;
    const writes = omitUndefined({
      description,
      dateTimeOriginal,
      latitude,
      longitude,
      rating,
    } as Record<string, unknown>);

    if (Object.keys(writes).length > 0) {
      // Build lockedProperties from the keys we're writing
      const lockedKeys = JSON.stringify(Object.keys(writes));
      await this.assetRepository.upsertExif(
        {
          assetId: id,
          ...writes,
          lockedProperties: lockedKeys,
        } as any,
        { lockedPropertiesBehavior: 'append' },
      );
    }
  }
}
