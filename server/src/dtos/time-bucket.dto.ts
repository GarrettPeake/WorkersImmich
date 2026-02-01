import { z } from 'zod';
import { AssetOrder, AssetVisibility } from 'src/enum';
import { optionalBooleanQuery } from 'src/validation';

// --- Request Schemas ---

export const TimeBucketSchema = z.object({
  userId: z.string().uuid().optional(),
  albumId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  isFavorite: optionalBooleanQuery,
  isTrashed: optionalBooleanQuery,
  withStacked: optionalBooleanQuery,
  withPartners: optionalBooleanQuery,
  order: z.nativeEnum(AssetOrder).optional(),
  visibility: z.nativeEnum(AssetVisibility).optional(),
  withCoordinates: optionalBooleanQuery,
});
export type TimeBucketDto = z.infer<typeof TimeBucketSchema>;

export const TimeBucketAssetSchema = TimeBucketSchema.extend({
  timeBucket: z.string().min(1),
});
export type TimeBucketAssetDto = z.infer<typeof TimeBucketAssetSchema>;

// --- Response DTOs (plain interfaces) ---

export interface TimeBucketAssetResponseDto {
  id: string[];
  ownerId: string[];
  ratio: number[];
  isFavorite: boolean[];
  visibility: AssetVisibility[];
  isTrashed: boolean[];
  isImage: boolean[];
  thumbhash: (string | null)[];
  fileCreatedAt: string[];
  localOffsetHours: number[];
  duration: (string | null)[];
  stack?: ([string, string] | null)[];
  projectionType: (string | null)[];
  livePhotoVideoId: (string | null)[];
  city: (string | null)[];
  country: (string | null)[];
  latitude: number[];
  longitude: number[];
}

export interface TimeBucketsResponseDto {
  timeBucket: string;
  count: number;
}
