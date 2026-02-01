import { Selectable } from 'kysely';
import { AssetFile, Exif, Stack, Tag, User } from 'src/database';
import { AuthDto } from 'src/dtos/auth.dto';
import { ExifResponseDto, mapExif } from 'src/dtos/exif.dto';
import { TagResponseDto, mapTag } from 'src/dtos/tag.dto';
import { UserResponseDto, mapUser } from 'src/dtos/user.dto';
import { AssetStatus, AssetType, AssetVisibility } from 'src/enum';
import { hexOrBufferToBase64 } from 'src/utils/bytes';
import { mimeTypes } from 'src/utils/mime-types';

// --- Response DTOs (plain interfaces) ---

export interface SanitizedAssetResponseDto {
  id: string;
  type: AssetType;
  thumbhash: string | null;
  originalMimeType?: string;
  localDateTime: Date;
  duration: string;
  livePhotoVideoId?: string | null;
  hasMetadata: boolean;
  width: number | null;
  height: number | null;
}

export interface AssetResponseDto extends SanitizedAssetResponseDto {
  createdAt: Date;
  deviceAssetId: string;
  deviceId: string;
  ownerId: string;
  owner?: UserResponseDto;
  libraryId?: string | null;
  originalPath: string;
  originalFileName: string;
  fileCreatedAt: Date;
  fileModifiedAt: Date;
  updatedAt: Date;
  isFavorite: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  isOffline: boolean;
  visibility: AssetVisibility;
  exifInfo?: ExifResponseDto;
  tags?: TagResponseDto[];
  checksum: string;
  stack?: AssetStackResponseDto | null;
  duplicateId?: string | null;
  resized?: boolean;
  isEdited: boolean;
}

export type MapAsset = {
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  id: string;
  updateId: string;
  status: AssetStatus;
  checksum: Buffer<ArrayBufferLike>;
  deviceAssetId: string;
  deviceId: string;
  duplicateId: string | null;
  duration: string | null;
  encodedVideoPath: string | null;
  exifInfo?: Selectable<Exif> | null;
  fileCreatedAt: Date;
  fileModifiedAt: Date;
  files?: AssetFile[];
  isExternal: boolean;
  isFavorite: boolean;
  isOffline: boolean;
  visibility: AssetVisibility;
  libraryId: string | null;
  livePhotoVideoId: string | null;
  localDateTime: Date;
  originalFileName: string;
  originalPath: string;
  owner?: User | null;
  ownerId: string;
  stack?: Stack | null;
  stackId: string | null;
  tags?: Tag[];
  thumbhash: Buffer<ArrayBufferLike> | null;
  type: AssetType;
  width: number | null;
  height: number | null;
  isEdited: boolean;
};

export interface AssetStackResponseDto {
  id: string;
  primaryAssetId: string;
  assetCount: number;
}

export type AssetMapOptions = {
  stripMetadata?: boolean;
  withStack?: boolean;
  auth?: AuthDto;
};

const mapStack = (entity: { stack?: Stack | null }) => {
  if (!entity.stack) {
    return null;
  }

  return {
    id: entity.stack.id,
    primaryAssetId: entity.stack.primaryAssetId,
    assetCount: entity.stack.assetCount ?? entity.stack.assets.length + 1,
  };
};

export function mapAsset(entity: MapAsset, options: AssetMapOptions = {}): AssetResponseDto {
  const { stripMetadata = false, withStack = false } = options;

  if (stripMetadata) {
    const sanitizedAssetResponse: SanitizedAssetResponseDto = {
      id: entity.id,
      type: entity.type,
      originalMimeType: mimeTypes.lookup(entity.originalFileName),
      thumbhash: entity.thumbhash ? hexOrBufferToBase64(entity.thumbhash) : null,
      localDateTime: entity.localDateTime,
      duration: entity.duration ?? '0:00:00.00000',
      livePhotoVideoId: entity.livePhotoVideoId,
      hasMetadata: false,
      width: entity.width,
      height: entity.height,
    };
    return sanitizedAssetResponse as AssetResponseDto;
  }

  return {
    id: entity.id,
    createdAt: entity.createdAt,
    deviceAssetId: entity.deviceAssetId,
    ownerId: entity.ownerId,
    owner: entity.owner ? mapUser(entity.owner) : undefined,
    deviceId: entity.deviceId,
    libraryId: entity.libraryId,
    type: entity.type,
    originalPath: entity.originalPath,
    originalFileName: entity.originalFileName,
    originalMimeType: mimeTypes.lookup(entity.originalFileName),
    thumbhash: entity.thumbhash ? hexOrBufferToBase64(entity.thumbhash) : null,
    fileCreatedAt: entity.fileCreatedAt,
    fileModifiedAt: entity.fileModifiedAt,
    localDateTime: entity.localDateTime,
    updatedAt: entity.updatedAt,
    isFavorite: options.auth?.user.id === entity.ownerId && entity.isFavorite,
    isArchived: entity.visibility === AssetVisibility.Archive,
    isTrashed: !!entity.deletedAt,
    visibility: entity.visibility,
    duration: entity.duration ?? '0:00:00.00000',
    exifInfo: entity.exifInfo ? mapExif(entity.exifInfo) : undefined,
    livePhotoVideoId: entity.livePhotoVideoId,
    tags: entity.tags?.map((tag) => mapTag(tag)),
    checksum: hexOrBufferToBase64(entity.checksum)!,
    stack: withStack ? mapStack(entity) : undefined,
    isOffline: entity.isOffline,
    hasMetadata: true,
    duplicateId: entity.duplicateId,
    resized: true,
    width: entity.width,
    height: entity.height,
    isEdited: entity.isEdited,
  };
}
