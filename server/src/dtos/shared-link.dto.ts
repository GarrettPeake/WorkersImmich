import { z } from 'zod';
import { SharedLink } from 'src/database';
import { AlbumResponseDto, mapAlbumWithoutAssets } from 'src/dtos/album.dto';
import { AssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import { SharedLinkType } from 'src/enum';
import { optionalBooleanQuery } from 'src/validation';

// --- Request Schemas ---

export const SharedLinkSearchSchema = z.object({
  albumId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});
export type SharedLinkSearchDto = z.infer<typeof SharedLinkSearchSchema>;

export const SharedLinkCreateSchema = z.object({
  type: z.nativeEnum(SharedLinkType),
  assetIds: z.array(z.string().uuid()).optional(),
  albumId: z.string().uuid().optional(),
  description: z.string().nullable().optional().transform((v) => (v === '' ? null : v)),
  password: z.string().nullable().optional().transform((v) => (v === '' ? null : v)),
  slug: z.string().nullable().optional().transform((v) => (v === '' ? null : v)),
  expiresAt: z.coerce.date().nullable().optional().default(null),
  allowUpload: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  allowDownload: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional().default(true)),
  showMetadata: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional().default(true)),
});
export type SharedLinkCreateDto = z.infer<typeof SharedLinkCreateSchema>;

export const SharedLinkEditSchema = z.object({
  description: z.string().nullable().optional().transform((v) => (v === '' ? null : v)),
  password: z.string().nullable().optional().transform((v) => (v === '' ? null : v)),
  slug: z.string().nullable().optional().transform((v) => (v === '' ? null : v)),
  expiresAt: z.coerce.date().nullable().optional(),
  allowUpload: optionalBooleanQuery,
  allowDownload: optionalBooleanQuery,
  showMetadata: optionalBooleanQuery,
  changeExpiryTime: optionalBooleanQuery,
});
export type SharedLinkEditDto = z.infer<typeof SharedLinkEditSchema>;

export const SharedLinkPasswordSchema = z.object({
  password: z.string().optional(),
  token: z.string().optional(),
});
export type SharedLinkPasswordDto = z.infer<typeof SharedLinkPasswordSchema>;

// --- Response DTOs (plain interfaces) ---

export interface SharedLinkResponseDto {
  id: string;
  description: string | null;
  password: string | null;
  token?: string | null;
  userId: string;
  key: string;
  type: SharedLinkType;
  createdAt: Date;
  expiresAt: Date | null;
  assets: AssetResponseDto[];
  album?: AlbumResponseDto;
  allowUpload: boolean;
  allowDownload: boolean;
  showMetadata: boolean;
  slug: string | null;
}

// --- Mapper ---

export function mapSharedLink(sharedLink: SharedLink, options: { stripAssetMetadata: boolean }): SharedLinkResponseDto {
  const assets = sharedLink.assets || [];

  const response = {
    id: sharedLink.id,
    description: sharedLink.description,
    password: sharedLink.password,
    userId: sharedLink.userId,
    key: sharedLink.key.toString('base64url'),
    type: sharedLink.type,
    createdAt: sharedLink.createdAt,
    expiresAt: sharedLink.expiresAt,
    assets: assets.map((asset) => mapAsset(asset, { stripMetadata: options.stripAssetMetadata })),
    album: sharedLink.album ? mapAlbumWithoutAssets(sharedLink.album) : undefined,
    allowUpload: sharedLink.allowUpload,
    allowDownload: sharedLink.allowDownload,
    showMetadata: sharedLink.showExif,
    slug: sharedLink.slug,
  };

  // unless we select sharedLink.album.sharedLinks this will be wrong
  if (response.album) {
    response.album.hasSharedLink = true;
    response.album.shared = true;
  }

  return response;
}
