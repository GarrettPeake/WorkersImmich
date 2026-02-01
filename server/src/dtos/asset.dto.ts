import { z } from 'zod';
import { BulkIdsSchema } from 'src/dtos/asset-ids.response.dto';
import { AssetType, AssetVisibility } from 'src/enum';
import { AssetStats } from 'src/repositories/asset.repository';
import { optionalBooleanQuery } from 'src/validation';

// --- Request Schemas ---

export const DeviceIdSchema = z.object({
  deviceId: z.string().min(1),
});
export type DeviceIdDto = z.infer<typeof DeviceIdSchema>;

export const UpdateAssetBaseSchema = z.object({
  isFavorite: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  visibility: z.nativeEnum(AssetVisibility).optional(),
  dateTimeOriginal: z.string().datetime().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  rating: z.number().int().min(-1).max(5).optional(),
  description: z.string().optional(),
});
export type UpdateAssetBase = z.infer<typeof UpdateAssetBaseSchema>;

export const AssetBulkUpdateSchema = UpdateAssetBaseSchema.extend({
  ids: z.array(z.string().uuid()).min(1),
  duplicateId: z.string().nullable().optional(),
  dateTimeRelative: z.number().int().optional(),
  timeZone: z.string().optional(),
});
export type AssetBulkUpdateDto = z.infer<typeof AssetBulkUpdateSchema>;

export const UpdateAssetSchema = UpdateAssetBaseSchema.extend({
  livePhotoVideoId: z.string().uuid().nullable().optional(),
});
export type UpdateAssetDto = z.infer<typeof UpdateAssetSchema>;

export const RandomAssetsSchema = z.object({
  count: z.coerce.number().int().positive().optional(),
});
export type RandomAssetsDto = z.infer<typeof RandomAssetsSchema>;

export const AssetBulkDeleteSchema = BulkIdsSchema.extend({
  force: optionalBooleanQuery,
});
export type AssetBulkDeleteDto = z.infer<typeof AssetBulkDeleteSchema>;

export const AssetIdsSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1),
});
export type AssetIdsDto = z.infer<typeof AssetIdsSchema>;

export enum AssetJobName {
  REFRESH_FACES = 'refresh-faces',
  REFRESH_METADATA = 'refresh-metadata',
  REGENERATE_THUMBNAIL = 'regenerate-thumbnail',
  TRANSCODE_VIDEO = 'transcode-video',
}

export const AssetJobsSchema = AssetIdsSchema.extend({
  name: z.nativeEnum(AssetJobName),
});
export type AssetJobsDto = z.infer<typeof AssetJobsSchema>;

export const AssetStatsSchema = z.object({
  visibility: z.nativeEnum(AssetVisibility).optional(),
  isFavorite: optionalBooleanQuery,
  isTrashed: optionalBooleanQuery,
});
export type AssetStatsDto = z.infer<typeof AssetStatsSchema>;

export const AssetMetadataRouteParamsSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1),
});
export type AssetMetadataRouteParams = z.infer<typeof AssetMetadataRouteParamsSchema>;

export const AssetMetadataUpsertItemSchema = z.object({
  key: z.string().min(1),
  value: z.record(z.unknown()),
});
export type AssetMetadataUpsertItemDto = z.infer<typeof AssetMetadataUpsertItemSchema>;

export const AssetMetadataUpsertSchema = z.object({
  items: z.array(AssetMetadataUpsertItemSchema).min(1),
});
export type AssetMetadataUpsertDto = z.infer<typeof AssetMetadataUpsertSchema>;

export const AssetMetadataBulkUpsertItemSchema = z.object({
  assetId: z.string().uuid(),
  key: z.string().min(1),
  value: z.record(z.unknown()),
});
export type AssetMetadataBulkUpsertItemDto = z.infer<typeof AssetMetadataBulkUpsertItemSchema>;

export const AssetMetadataBulkUpsertSchema = z.object({
  items: z.array(AssetMetadataBulkUpsertItemSchema).min(1),
});
export type AssetMetadataBulkUpsertDto = z.infer<typeof AssetMetadataBulkUpsertSchema>;

export const AssetMetadataBulkDeleteItemSchema = z.object({
  assetId: z.string().uuid(),
  key: z.string().min(1),
});
export type AssetMetadataBulkDeleteItemDto = z.infer<typeof AssetMetadataBulkDeleteItemSchema>;

export const AssetMetadataBulkDeleteSchema = z.object({
  items: z.array(AssetMetadataBulkDeleteItemSchema).min(1),
});
export type AssetMetadataBulkDeleteDto = z.infer<typeof AssetMetadataBulkDeleteSchema>;

export const AssetCopySchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  sharedLinks: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  albums: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  sidecar: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  stack: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  favorite: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});
export type AssetCopyDto = z.infer<typeof AssetCopySchema>;

export const AssetDownloadOriginalSchema = z.object({
  edited: optionalBooleanQuery,
});
export type AssetDownloadOriginalDto = z.infer<typeof AssetDownloadOriginalSchema>;

// --- Response DTOs (plain interfaces) ---

export interface AssetStatsResponseDto {
  images: number;
  videos: number;
  total: number;
}

export interface AssetMetadataResponseDto {
  key: string;
  value: object;
  updatedAt: Date;
}

export interface AssetMetadataBulkResponseDto extends AssetMetadataResponseDto {
  assetId: string;
}

// --- Mapper ---

export const mapStats = (stats: AssetStats): AssetStatsResponseDto => {
  return {
    images: stats[AssetType.Image],
    videos: stats[AssetType.Video],
    total: Object.values(stats).reduce((total, value) => total + value, 0),
  };
};
