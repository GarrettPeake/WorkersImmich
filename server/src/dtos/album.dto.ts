import { z } from 'zod';
import _ from 'lodash';
import { AlbumUser, AuthSharedLink, User } from 'src/database';
import { BulkIdErrorReason } from 'src/dtos/asset-ids.response.dto';
import { AssetResponseDto, MapAsset, mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { UserResponseDto, mapUser } from 'src/dtos/user.dto';
import { AlbumUserRole, AssetOrder } from 'src/enum';
import { optionalBooleanQuery } from 'src/validation';

// --- Request Schemas ---

export const AlbumInfoSchema = z.object({
  withoutAssets: optionalBooleanQuery,
});
export type AlbumInfoDto = z.infer<typeof AlbumInfoSchema>;

export const AlbumUserAddSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(AlbumUserRole).optional().default(AlbumUserRole.Editor),
});
export type AlbumUserAddDto = z.infer<typeof AlbumUserAddSchema>;

export const AddUsersSchema = z.object({
  albumUsers: z.array(AlbumUserAddSchema).min(1),
});
export type AddUsersDto = z.infer<typeof AddUsersSchema>;

export const AlbumUserCreateSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(AlbumUserRole),
});
export type AlbumUserCreateDto = z.infer<typeof AlbumUserCreateSchema>;

export const CreateAlbumSchema = z.object({
  albumName: z.string().min(1),
  description: z.string().optional(),
  albumUsers: z.array(AlbumUserCreateSchema).optional(),
  assetIds: z.array(z.string().uuid()).optional(),
});
export type CreateAlbumDto = z.infer<typeof CreateAlbumSchema>;

export const AlbumsAddAssetsSchema = z.object({
  albumIds: z.array(z.string().uuid()).min(1),
  assetIds: z.array(z.string().uuid()).min(1),
});
export type AlbumsAddAssetsDto = z.infer<typeof AlbumsAddAssetsSchema>;

export const UpdateAlbumSchema = z.object({
  albumName: z.string().min(1).optional(),
  description: z.string().optional(),
  albumThumbnailAssetId: z.string().uuid().optional(),
  isActivityEnabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  order: z.nativeEnum(AssetOrder).optional(),
});
export type UpdateAlbumDto = z.infer<typeof UpdateAlbumSchema>;

export const GetAlbumsSchema = z.object({
  shared: optionalBooleanQuery,
  assetId: z.string().uuid().optional(),
});
export type GetAlbumsDto = z.infer<typeof GetAlbumsSchema>;

export const UpdateAlbumUserSchema = z.object({
  role: z.nativeEnum(AlbumUserRole),
});
export type UpdateAlbumUserDto = z.infer<typeof UpdateAlbumUserSchema>;

// --- Response DTOs (plain interfaces) ---

export interface AlbumsAddAssetsResponseDto {
  success: boolean;
  error?: BulkIdErrorReason;
}

export interface AlbumStatisticsResponseDto {
  owned: number;
  shared: number;
  notShared: number;
}

export interface AlbumUserResponseDto {
  user: UserResponseDto;
  role: AlbumUserRole;
}

export interface ContributorCountResponseDto {
  userId: string;
  assetCount: number;
}

export interface AlbumResponseDto {
  id: string;
  ownerId: string;
  albumName: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  albumThumbnailAssetId: string | null;
  shared: boolean;
  albumUsers: AlbumUserResponseDto[];
  hasSharedLink: boolean;
  assets: AssetResponseDto[];
  owner: UserResponseDto;
  assetCount: number;
  lastModifiedAssetTimestamp?: Date;
  startDate?: Date;
  endDate?: Date;
  isActivityEnabled: boolean;
  order?: AssetOrder;
  contributorCounts?: ContributorCountResponseDto[];
}

export type MapAlbumDto = {
  albumUsers?: AlbumUser[];
  assets?: MapAsset[];
  sharedLinks?: AuthSharedLink[];
  albumName: string;
  description: string;
  albumThumbnailAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
  id: string;
  ownerId: string;
  owner: User;
  isActivityEnabled: boolean;
  order: AssetOrder;
};

// --- Mappers ---

export const mapAlbum = (entity: MapAlbumDto, withAssets: boolean, auth?: AuthDto): AlbumResponseDto => {
  const albumUsers: AlbumUserResponseDto[] = [];

  if (entity.albumUsers) {
    for (const albumUser of entity.albumUsers) {
      const user = mapUser(albumUser.user);
      albumUsers.push({
        user,
        role: albumUser.role,
      });
    }
  }

  const albumUsersSorted = _.orderBy(albumUsers, ['role', 'user.name']);

  const assets = entity.assets || [];

  const hasSharedLink = !!entity.sharedLinks && entity.sharedLinks.length > 0;
  const hasSharedUser = albumUsers.length > 0;

  let startDate = assets.at(0)?.localDateTime;
  let endDate = assets.at(-1)?.localDateTime;
  if (startDate && endDate && startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  return {
    albumName: entity.albumName,
    description: entity.description,
    albumThumbnailAssetId: entity.albumThumbnailAssetId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    id: entity.id,
    ownerId: entity.ownerId,
    owner: mapUser(entity.owner),
    albumUsers: albumUsersSorted,
    shared: hasSharedUser || hasSharedLink,
    hasSharedLink,
    startDate,
    endDate,
    assets: (withAssets ? assets : []).map((asset) => mapAsset(asset, { auth })),
    assetCount: entity.assets?.length || 0,
    isActivityEnabled: entity.isActivityEnabled,
    order: entity.order,
  };
};

export const mapAlbumWithAssets = (entity: MapAlbumDto) => mapAlbum(entity, true);
export const mapAlbumWithoutAssets = (entity: MapAlbumDto) => mapAlbum(entity, false);
