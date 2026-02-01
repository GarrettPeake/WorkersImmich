import { z } from 'zod';
import { AssetResponseDto } from 'src/dtos/asset-response.dto';
import {
  AlbumUserRole,
  AssetOrder,
  AssetType,
  AssetVisibility,
  MemoryType,
  SyncEntityType,
  SyncRequestType,
  UserAvatarColor,
  UserMetadataKey,
} from 'src/enum';
import { UserMetadata } from 'src/types';
import { optionalBooleanQuery } from 'src/validation';

// --- Request Schemas ---

export const AssetFullSyncSchema = z.object({
  lastId: z.string().uuid().optional(),
  updatedUntil: z.coerce.date(),
  limit: z.number().int().positive(),
  userId: z.string().uuid().optional(),
});
export type AssetFullSyncDto = z.infer<typeof AssetFullSyncSchema>;

export const AssetDeltaSyncSchema = z.object({
  updatedAfter: z.coerce.date(),
  userIds: z.array(z.string().uuid()).min(1),
});
export type AssetDeltaSyncDto = z.infer<typeof AssetDeltaSyncSchema>;

export const SyncStreamSchema = z.object({
  types: z.array(z.nativeEnum(SyncRequestType)).min(1),
  reset: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});
export type SyncStreamDto = z.infer<typeof SyncStreamSchema>;

export const SyncAckSchema = z.object({
  type: z.nativeEnum(SyncEntityType),
  ack: z.string().min(1),
});
export type SyncAckDto = z.infer<typeof SyncAckSchema>;

export const SyncAckSetSchema = z.object({
  acks: z.array(z.string()).max(1000).min(1),
});
export type SyncAckSetDto = z.infer<typeof SyncAckSetSchema>;

export const SyncAckDeleteSchema = z.object({
  types: z.array(z.nativeEnum(SyncEntityType)).optional(),
});
export type SyncAckDeleteDto = z.infer<typeof SyncAckDeleteSchema>;

// --- Response DTOs (plain interfaces) ---

export interface AssetDeltaSyncResponseDto {
  needsFullSync: boolean;
  upserted: AssetResponseDto[];
  deleted: string[];
}

// --- Sync Entity Types (plain interfaces, used for sync protocol responses) ---

export interface SyncUserV1 {
  id: string;
  name: string;
  email: string;
  avatarColor: UserAvatarColor | null;
  deletedAt: Date | null;
  hasProfileImage: boolean;
  profileChangedAt: Date;
}

export interface SyncAuthUserV1 extends SyncUserV1 {
  isAdmin: boolean;
  pinCode: string | null;
  oauthId: string;
  storageLabel: string | null;
  quotaSizeInBytes: number | null;
  quotaUsageInBytes: number;
}

export interface SyncUserDeleteV1 {
  userId: string;
}

export interface SyncPartnerV1 {
  sharedById: string;
  sharedWithId: string;
  inTimeline: boolean;
}

export interface SyncPartnerDeleteV1 {
  sharedById: string;
  sharedWithId: string;
}

export interface SyncAssetV1 {
  id: string;
  ownerId: string;
  originalFileName: string;
  thumbhash: string | null;
  checksum: string;
  fileCreatedAt: Date | null;
  fileModifiedAt: Date | null;
  localDateTime: Date | null;
  duration: string | null;
  type: AssetType;
  deletedAt: Date | null;
  isFavorite: boolean;
  visibility: AssetVisibility;
  livePhotoVideoId: string | null;
  stackId: string | null;
  libraryId: string | null;
  width: number | null;
  height: number | null;
  isEdited: boolean;
}

export interface SyncAssetDeleteV1 {
  assetId: string;
}

export interface SyncAssetExifV1 {
  assetId: string;
  description: string | null;
  exifImageWidth: number | null;
  exifImageHeight: number | null;
  fileSizeInByte: number | null;
  orientation: string | null;
  dateTimeOriginal: Date | null;
  modifyDate: Date | null;
  timeZone: string | null;
  latitude: number | null;
  longitude: number | null;
  projectionType: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  make: string | null;
  model: string | null;
  lensModel: string | null;
  fNumber: number | null;
  focalLength: number | null;
  iso: number | null;
  exposureTime: string | null;
  profileDescription: string | null;
  rating: number | null;
  fps: number | null;
}

export interface SyncAssetMetadataV1 {
  assetId: string;
  key: string;
  value: object;
}

export interface SyncAssetMetadataDeleteV1 {
  assetId: string;
  key: string;
}

export interface SyncAlbumDeleteV1 {
  albumId: string;
}

export interface SyncAlbumUserDeleteV1 {
  albumId: string;
  userId: string;
}

export interface SyncAlbumUserV1 {
  albumId: string;
  userId: string;
  role: AlbumUserRole;
}

export interface SyncAlbumV1 {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  thumbnailAssetId: string | null;
  isActivityEnabled: boolean;
  order: AssetOrder;
}

export interface SyncAlbumToAssetV1 {
  albumId: string;
  assetId: string;
}

export interface SyncAlbumToAssetDeleteV1 {
  albumId: string;
  assetId: string;
}

export interface SyncMemoryV1 {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  ownerId: string;
  type: MemoryType;
  data: object;
  isSaved: boolean;
  memoryAt: Date;
  seenAt: Date | null;
  showAt: Date | null;
  hideAt: Date | null;
}

export interface SyncMemoryDeleteV1 {
  memoryId: string;
}

export interface SyncMemoryAssetV1 {
  memoryId: string;
  assetId: string;
}

export interface SyncMemoryAssetDeleteV1 {
  memoryId: string;
  assetId: string;
}

export interface SyncStackV1 {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  primaryAssetId: string;
  ownerId: string;
}

export interface SyncStackDeleteV1 {
  stackId: string;
}

export interface SyncPersonV1 {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  name: string;
  birthDate: Date | null;
  isHidden: boolean;
  isFavorite: boolean;
  color: string | null;
  faceAssetId: string | null;
}

export interface SyncPersonDeleteV1 {
  personId: string;
}

export interface SyncAssetFaceV1 {
  id: string;
  assetId: string;
  personId: string | null;
  imageWidth: number;
  imageHeight: number;
  boundingBoxX1: number;
  boundingBoxY1: number;
  boundingBoxX2: number;
  boundingBoxY2: number;
  sourceType: string;
}

export interface SyncAssetFaceDeleteV1 {
  assetFaceId: string;
}

export interface SyncUserMetadataV1 {
  userId: string;
  key: UserMetadataKey;
  value: UserMetadata[UserMetadataKey];
}

export interface SyncUserMetadataDeleteV1 {
  userId: string;
  key: UserMetadataKey;
}

export interface SyncAckV1 {}
export interface SyncResetV1 {}
export interface SyncCompleteV1 {}

export type SyncItem = {
  [SyncEntityType.AuthUserV1]: SyncAuthUserV1;
  [SyncEntityType.UserV1]: SyncUserV1;
  [SyncEntityType.UserDeleteV1]: SyncUserDeleteV1;
  [SyncEntityType.PartnerV1]: SyncPartnerV1;
  [SyncEntityType.PartnerDeleteV1]: SyncPartnerDeleteV1;
  [SyncEntityType.AssetV1]: SyncAssetV1;
  [SyncEntityType.AssetDeleteV1]: SyncAssetDeleteV1;
  [SyncEntityType.AssetMetadataV1]: SyncAssetMetadataV1;
  [SyncEntityType.AssetMetadataDeleteV1]: SyncAssetMetadataDeleteV1;
  [SyncEntityType.AssetExifV1]: SyncAssetExifV1;
  [SyncEntityType.PartnerAssetV1]: SyncAssetV1;
  [SyncEntityType.PartnerAssetBackfillV1]: SyncAssetV1;
  [SyncEntityType.PartnerAssetDeleteV1]: SyncAssetDeleteV1;
  [SyncEntityType.PartnerAssetExifV1]: SyncAssetExifV1;
  [SyncEntityType.PartnerAssetExifBackfillV1]: SyncAssetExifV1;
  [SyncEntityType.AlbumV1]: SyncAlbumV1;
  [SyncEntityType.AlbumDeleteV1]: SyncAlbumDeleteV1;
  [SyncEntityType.AlbumUserV1]: SyncAlbumUserV1;
  [SyncEntityType.AlbumUserBackfillV1]: SyncAlbumUserV1;
  [SyncEntityType.AlbumUserDeleteV1]: SyncAlbumUserDeleteV1;
  [SyncEntityType.AlbumAssetCreateV1]: SyncAssetV1;
  [SyncEntityType.AlbumAssetUpdateV1]: SyncAssetV1;
  [SyncEntityType.AlbumAssetBackfillV1]: SyncAssetV1;
  [SyncEntityType.AlbumAssetExifCreateV1]: SyncAssetExifV1;
  [SyncEntityType.AlbumAssetExifUpdateV1]: SyncAssetExifV1;
  [SyncEntityType.AlbumAssetExifBackfillV1]: SyncAssetExifV1;
  [SyncEntityType.AlbumToAssetV1]: SyncAlbumToAssetV1;
  [SyncEntityType.AlbumToAssetBackfillV1]: SyncAlbumToAssetV1;
  [SyncEntityType.AlbumToAssetDeleteV1]: SyncAlbumToAssetDeleteV1;
  [SyncEntityType.MemoryV1]: SyncMemoryV1;
  [SyncEntityType.MemoryDeleteV1]: SyncMemoryDeleteV1;
  [SyncEntityType.MemoryToAssetV1]: SyncMemoryAssetV1;
  [SyncEntityType.MemoryToAssetDeleteV1]: SyncMemoryAssetDeleteV1;
  [SyncEntityType.StackV1]: SyncStackV1;
  [SyncEntityType.StackDeleteV1]: SyncStackDeleteV1;
  [SyncEntityType.PartnerStackBackfillV1]: SyncStackV1;
  [SyncEntityType.PartnerStackDeleteV1]: SyncStackDeleteV1;
  [SyncEntityType.PartnerStackV1]: SyncStackV1;
  [SyncEntityType.PersonV1]: SyncPersonV1;
  [SyncEntityType.PersonDeleteV1]: SyncPersonDeleteV1;
  [SyncEntityType.AssetFaceV1]: SyncAssetFaceV1;
  [SyncEntityType.AssetFaceDeleteV1]: SyncAssetFaceDeleteV1;
  [SyncEntityType.UserMetadataV1]: SyncUserMetadataV1;
  [SyncEntityType.UserMetadataDeleteV1]: SyncUserMetadataDeleteV1;
  [SyncEntityType.SyncAckV1]: SyncAckV1;
  [SyncEntityType.SyncCompleteV1]: SyncCompleteV1;
  [SyncEntityType.SyncResetV1]: SyncResetV1;
};
