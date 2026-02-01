import { z } from 'zod';
import { AssetVisibility } from 'src/enum';
import { optionalBooleanQuery } from 'src/validation';

export enum AssetMediaSize {
  Original = 'original',
  FULLSIZE = 'fullsize',
  PREVIEW = 'preview',
  THUMBNAIL = 'thumbnail',
}

export enum UploadFieldName {
  ASSET_DATA = 'assetData',
  SIDECAR_DATA = 'sidecarData',
  PROFILE_DATA = 'file',
}

// --- Request Schemas ---

export const AssetMediaOptionsSchema = z.object({
  size: z.nativeEnum(AssetMediaSize).optional(),
  edited: optionalBooleanQuery,
});
export type AssetMediaOptionsDto = z.infer<typeof AssetMediaOptionsSchema>;

export const AssetMediaBaseSchema = z.object({
  deviceAssetId: z.string().min(1),
  deviceId: z.string().min(1),
  fileCreatedAt: z.coerce.date(),
  fileModifiedAt: z.coerce.date(),
  duration: z.string().optional(),
  filename: z.string().optional(),
});

export const AssetMediaCreateSchema = AssetMediaBaseSchema.extend({
  isFavorite: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  visibility: z.nativeEnum(AssetVisibility).optional(),
  livePhotoVideoId: z.string().uuid().optional(),
  metadata: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        const json = JSON.parse(val);
        return Array.isArray(json) ? json : [json];
      } catch {
        return undefined;
      }
    }
    return val;
  }, z.array(z.object({
    key: z.string().min(1),
    value: z.record(z.unknown()),
  })).optional()),
});
export type AssetMediaCreateDto = z.infer<typeof AssetMediaCreateSchema>;

export const AssetMediaReplaceSchema = AssetMediaBaseSchema;
export type AssetMediaReplaceDto = z.infer<typeof AssetMediaReplaceSchema>;

export const AssetBulkUploadCheckItemSchema = z.object({
  id: z.string().min(1),
  checksum: z.string().min(1),
});

export const AssetBulkUploadCheckSchema = z.object({
  assets: z.array(AssetBulkUploadCheckItemSchema).min(1),
});
export type AssetBulkUploadCheckDto = z.infer<typeof AssetBulkUploadCheckSchema>;

export const CheckExistingAssetsSchema = z.object({
  deviceAssetIds: z.array(z.string().min(1)).min(1),
  deviceId: z.string().min(1),
});
export type CheckExistingAssetsDto = z.infer<typeof CheckExistingAssetsSchema>;
