/**
 * Asset media service — Workers-compatible version.
 *
 * Handles upload, download, thumbnail viewing, video playback, and
 * duplicate checking for asset media files.
 *
 * No NestJS decorators, no BaseService, no node: imports, no Express.
 * Uses R2 for storage, crypto.subtle for checksums.
 */

import { StorageCore } from 'src/cores/storage.core';
import {
  AssetBulkUploadCheckResponseDto,
  AssetMediaResponseDto,
  AssetMediaStatus,
  AssetRejectReason,
  AssetUploadAction,
  CheckExistingAssetsResponseDto,
} from 'src/dtos/asset-media-response.dto';
import {
  AssetBulkUploadCheckDto,
  AssetMediaCreateDto,
  AssetMediaOptionsDto,
  AssetMediaReplaceDto,
  AssetMediaSize,
  CheckExistingAssetsDto,
} from 'src/dtos/asset-media.dto';
import { AssetDownloadOriginalDto } from 'src/dtos/asset.dto';
import type { AuthDto } from 'src/dtos/auth.dto';
import {
  AssetFileType,
  AssetStatus,
  AssetVisibility,
  Permission,
} from 'src/enum';
import type { ServiceContext } from 'src/context';
import { AssetRepository } from 'src/repositories/asset.repository';
import { AccessRepository } from 'src/repositories/access.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { MediaRepository } from 'src/repositories/media.repository';
import { requireAccess, requireUploadAccess } from 'src/utils/access';
import { extname } from 'src/utils/path';
import { mimeTypes } from 'src/utils/mime-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetMediaRedirectResponse {
  targetSize: AssetMediaSize | 'original';
}

/**
 * Represents an uploaded file in the Workers environment.
 * File data comes from Hono's parseBody() as a File (web standard).
 */
export interface WorkerUploadFile {
  /** The file data as an ArrayBuffer */
  data: ArrayBuffer;
  /** Original filename */
  originalName: string;
  /** File size in bytes */
  size: number;
  /** SHA-1 checksum as Uint8Array */
  checksum: Uint8Array;
  /** Content type */
  contentType: string;
  /** R2 key where the file is stored */
  r2Key: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute SHA-1 hash of an ArrayBuffer. Returns Uint8Array. */
async function computeSha1(data: ArrayBuffer): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return new Uint8Array(hashBuffer);
}

/** Convert Uint8Array to hex string. */
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert hex string to Uint8Array. */
function hexToUint8Array(hex: string): Uint8Array {
  // Handle '\\x' prefix from PostgreSQL-style hex
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Convert base64 checksum to Uint8Array. */
function fromChecksum(checksum: string): Uint8Array {
  // If it looks like hex
  if (/^[0-9a-f]+$/i.test(checksum) && checksum.length === 40) {
    return hexToUint8Array(checksum);
  }
  // Otherwise treat as base64
  const binaryString = atob(checksum);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function getFileNameWithoutExtension(filename: string): string {
  const ext = extname(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

function getFilenameExtension(path: string): string {
  return extname(path);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AssetMediaService {
  private assetRepository: AssetRepository;
  private accessRepository: AccessRepository;
  private storageRepository: StorageRepository;
  private mediaRepository: MediaRepository;

  constructor(private ctx: ServiceContext) {
    this.assetRepository = new AssetRepository(ctx.db);
    this.accessRepository = new AccessRepository(ctx.db);
    this.storageRepository = new StorageRepository(ctx.bucket);
    this.mediaRepository = new MediaRepository(
      ctx.bucket,
      '', // Image Resizing URL -- empty means fallback to original in dev/test
    );
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  async uploadAsset(
    auth: AuthDto,
    dto: AssetMediaCreateDto,
    fileData: ArrayBuffer,
    originalName: string,
    sidecarData?: ArrayBuffer,
    sidecarName?: string,
  ): Promise<AssetMediaResponseDto> {
    try {
      requireUploadAccess(auth);

      const fileSize = fileData.byteLength;
      this.requireQuota(auth, fileSize);

      // Compute checksum
      const checksum = await computeSha1(fileData);

      // Check for duplicates
      const existingId = await this.assetRepository.getUploadAssetIdByChecksum(auth.user.id, checksum);
      if (existingId) {
        return { id: existingId, status: AssetMediaStatus.DUPLICATE };
      }

      // Generate asset ID and determine extension
      const assetId = crypto.randomUUID();
      const ext = extname(dto.filename || originalName);
      const r2Key = StorageCore.getAssetOriginalKey(auth.user.id, assetId, ext);

      // Upload original to R2
      const contentType = mimeTypes.lookup(originalName) || 'application/octet-stream';
      await this.storageRepository.writeFile(r2Key, fileData, { contentType });

      // Create asset record in D1
      const asset = await this.assetRepository.create({
        id: assetId,
        ownerId: auth.user.id,
        libraryId: null,
        checksum,
        originalPath: r2Key,
        deviceAssetId: dto.deviceAssetId,
        deviceId: dto.deviceId,
        fileCreatedAt: dto.fileCreatedAt ? new Date(dto.fileCreatedAt).toISOString() : new Date().toISOString(),
        fileModifiedAt: dto.fileModifiedAt ? new Date(dto.fileModifiedAt).toISOString() : new Date().toISOString(),
        localDateTime: dto.fileCreatedAt ? new Date(dto.fileCreatedAt).toISOString() : new Date().toISOString(),
        type: mimeTypes.assetType(originalName),
        isFavorite: dto.isFavorite ? 1 : 0,
        duration: dto.duration || null,
        visibility: dto.visibility ?? AssetVisibility.Timeline,
        originalFileName: dto.filename || originalName,
      });

      // Store metadata if provided
      if (dto.metadata?.length) {
        await this.assetRepository.upsertMetadata(asset.id, dto.metadata);
      }

      // Extract EXIF and store
      try {
        const exifData = await this.mediaRepository.extractExif(fileData);
        await this.assetRepository.upsertExif(
          {
            assetId: asset.id,
            fileSizeInByte: fileSize,
            ...exifData,
          },
          { lockedPropertiesBehavior: 'override' },
        );
      } catch (exifErr) {
        // EXIF extraction failure is non-fatal — just store the file size
        console.warn('EXIF extraction failed:', exifErr);
        await this.assetRepository.upsertExif(
          { assetId: asset.id, fileSizeInByte: fileSize },
          { lockedPropertiesBehavior: 'override' },
        );
      }

      // Generate thumbnail and preview (non-blocking for images)
      if (mimeTypes.isImage(originalName)) {
        try {
          const thumbnailKey = await this.mediaRepository.generateThumbnail(
            auth.user.id, asset.id, r2Key,
            { width: 250, height: 250 },
          );
          await this.assetRepository.upsertFile({
            assetId: asset.id, path: thumbnailKey,
            type: AssetFileType.Thumbnail, isEdited: 0,
          });

          const previewKey = await this.mediaRepository.generatePreview(
            auth.user.id, asset.id, r2Key,
          );
          await this.assetRepository.upsertFile({
            assetId: asset.id, path: previewKey,
            type: AssetFileType.Preview, isEdited: 0,
          });
        } catch (thumbErr) {
          console.warn('Thumbnail generation failed:', thumbErr);
        }
      }

      // Handle sidecar file
      if (sidecarData && sidecarName) {
        const sidecarKey = StorageCore.getAssetSidecarKey(auth.user.id, asset.id);
        await this.storageRepository.writeFile(sidecarKey, sidecarData, {
          contentType: 'application/xml',
        });
        await this.assetRepository.upsertFile({
          assetId: asset.id,
          path: sidecarKey,
          type: AssetFileType.Sidecar,
          isEdited: 0,
        });
      }

      // Update user usage
      await this.ctx.db
        .updateTable('user')
        .set((eb) => ({
          quotaUsageInBytes: eb('quotaUsageInBytes', '+', fileSize),
        }))
        .where('id', '=', auth.user.id)
        .execute();

      return { id: asset.id, status: AssetMediaStatus.CREATED };
    } catch (error: any) {
      // Check for duplicate constraint violation
      if (error?.message?.includes('UNIQUE constraint') && error?.message?.includes('checksum')) {
        const checksum = await computeSha1(fileData);
        const duplicateId = await this.assetRepository.getUploadAssetIdByChecksum(auth.user.id, checksum);
        if (duplicateId) {
          return { status: AssetMediaStatus.DUPLICATE, id: duplicateId };
        }
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Replace
  // -------------------------------------------------------------------------

  async replaceAsset(
    auth: AuthDto,
    id: string,
    dto: AssetMediaReplaceDto,
    fileData: ArrayBuffer,
    originalName: string,
  ): Promise<AssetMediaResponseDto> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids: [id],
    });

    const asset = await this.assetRepository.getById(id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    this.requireQuota(auth, fileData.byteLength);

    const checksum = await computeSha1(fileData);
    const ext = extname(originalName);
    const r2Key = StorageCore.getAssetOriginalKey(auth.user.id, id, ext);

    // Upload new file
    const contentType = mimeTypes.lookup(originalName) || 'application/octet-stream';
    await this.storageRepository.writeFile(r2Key, fileData, { contentType });

    // Update asset record
    await this.assetRepository.update({
      id,
      checksum,
      originalPath: r2Key,
      type: mimeTypes.assetType(originalName),
      originalFileName: originalName,
      deviceAssetId: dto.deviceAssetId,
      deviceId: dto.deviceId,
      fileCreatedAt: dto.fileCreatedAt ? new Date(dto.fileCreatedAt).toISOString() : undefined,
      fileModifiedAt: dto.fileModifiedAt ? new Date(dto.fileModifiedAt).toISOString() : undefined,
      localDateTime: dto.fileCreatedAt ? new Date(dto.fileCreatedAt).toISOString() : undefined,
      duration: dto.duration || null,
      livePhotoVideoId: null,
    });

    // Update exif
    await this.assetRepository.upsertExif(
      { assetId: id, fileSizeInByte: fileData.byteLength },
      { lockedPropertiesBehavior: 'override' },
    );

    // Update user usage
    await this.ctx.db
      .updateTable('user')
      .set((eb) => ({
        quotaUsageInBytes: eb('quotaUsageInBytes', '+', fileData.byteLength),
      }))
      .where('id', '=', auth.user.id)
      .execute();

    return { status: AssetMediaStatus.REPLACED, id };
  }

  // -------------------------------------------------------------------------
  // Download original
  // -------------------------------------------------------------------------

  async downloadOriginal(
    auth: AuthDto,
    id: string,
    dto: AssetDownloadOriginalDto,
  ): Promise<{ body: ReadableStream | null; contentType: string; fileName: string; size: number }> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetDownload,
      ids: [id],
    });

    if (auth.sharedLink) {
      dto.edited = true;
    }

    const { originalPath, originalFileName, editedPath } = await this.assetRepository.getForOriginal(
      id,
      dto.edited ?? false,
    );

    const path = (editedPath as string | undefined) ?? originalPath!;
    const r2Object = await this.storageRepository.readFile(path);

    if (!r2Object) {
      throw new Error('Asset file not found in storage');
    }

    const fileName = getFileNameWithoutExtension(originalFileName) + getFilenameExtension(path);
    const contentType = mimeTypes.lookup(path) || 'application/octet-stream';

    return {
      body: r2Object.body,
      contentType,
      fileName,
      size: r2Object.size,
    };
  }

  // -------------------------------------------------------------------------
  // View thumbnail
  // -------------------------------------------------------------------------

  async viewThumbnail(
    auth: AuthDto,
    id: string,
    dto: AssetMediaOptionsDto,
  ): Promise<{ body: ReadableStream | null; contentType: string; fileName: string; size: number } | AssetMediaRedirectResponse> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetView,
      ids: [id],
    });

    if (dto.size === AssetMediaSize.Original) {
      throw new Error('May not request original file');
    }

    if (auth.sharedLink) {
      dto.edited = true;
    }

    const size = (dto.size ?? AssetMediaSize.THUMBNAIL) as unknown as AssetFileType;
    const { originalPath, originalFileName, path } = await this.assetRepository.getForThumbnail(
      id,
      size,
      dto.edited ?? false,
    );

    if (size === AssetFileType.FullSize && mimeTypes.isWebSupportedImage(originalPath) && !dto.edited) {
      return { targetSize: 'original' };
    }

    if (dto.size === AssetMediaSize.FULLSIZE && !path) {
      return { targetSize: AssetMediaSize.PREVIEW };
    }

    if (!path) {
      throw new Error('Asset media not found');
    }

    const r2Object = await this.storageRepository.readFile(path);
    if (!r2Object) {
      throw new Error('Thumbnail file not found in storage');
    }

    const fileName = `${getFileNameWithoutExtension(originalFileName)}_${size}${getFilenameExtension(path)}`;
    const contentType = mimeTypes.lookup(path) || 'image/webp';

    return {
      body: r2Object.body,
      contentType,
      fileName,
      size: r2Object.size,
    };
  }

  // -------------------------------------------------------------------------
  // Video playback
  // -------------------------------------------------------------------------

  async playbackVideo(
    auth: AuthDto,
    id: string,
  ): Promise<{ body: ReadableStream | null; contentType: string; size: number; path: string }> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetView,
      ids: [id],
    });

    const asset = await this.assetRepository.getForVideo(id);
    if (!asset) {
      throw new Error('Asset not found or asset is not a video');
    }

    const filepath = asset.encodedVideoPath || asset.originalPath;
    const r2Object = await this.storageRepository.readFile(filepath);

    if (!r2Object) {
      throw new Error('Video file not found in storage');
    }

    const contentType = mimeTypes.lookup(filepath) || 'video/mp4';

    return {
      body: r2Object.body,
      contentType,
      size: r2Object.size,
      path: filepath,
    };
  }

  // -------------------------------------------------------------------------
  // Existence checks
  // -------------------------------------------------------------------------

  async checkExistingAssets(
    auth: AuthDto,
    checkExistingAssetsDto: CheckExistingAssetsDto,
  ): Promise<CheckExistingAssetsResponseDto> {
    const existingIds = await this.assetRepository.getByDeviceIds(
      auth.user.id,
      checkExistingAssetsDto.deviceId,
      checkExistingAssetsDto.deviceAssetIds,
    );
    return { existingIds };
  }

  async bulkUploadCheck(auth: AuthDto, dto: AssetBulkUploadCheckDto): Promise<AssetBulkUploadCheckResponseDto> {
    const checksums: Uint8Array[] = dto.assets.map((asset) => fromChecksum(asset.checksum));
    const results = await this.assetRepository.getByChecksums(auth.user.id, checksums);
    const checksumMap: Record<string, { id: string; isTrashed: boolean }> = {};

    for (const { id, deletedAt, checksum } of results) {
      const hex = checksum instanceof Uint8Array
        ? uint8ArrayToHex(checksum)
        : typeof checksum === 'string'
          ? checksum
          : '';
      checksumMap[hex] = { id, isTrashed: !!deletedAt };
    }

    return {
      results: dto.assets.map(({ id, checksum }) => {
        const inputHex = uint8ArrayToHex(fromChecksum(checksum));
        const duplicate = checksumMap[inputHex];
        if (duplicate) {
          return {
            id,
            action: AssetUploadAction.REJECT,
            reason: AssetRejectReason.DUPLICATE,
            assetId: duplicate.id,
            isTrashed: duplicate.isTrashed,
          };
        }

        return {
          id,
          action: AssetUploadAction.ACCEPT,
        };
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async getUploadAssetIdByChecksum(auth: AuthDto, checksum?: string): Promise<AssetMediaResponseDto | undefined> {
    if (!checksum) return;

    const assetId = await this.assetRepository.getUploadAssetIdByChecksum(auth.user.id, fromChecksum(checksum));
    if (!assetId) return;

    return { id: assetId, status: AssetMediaStatus.DUPLICATE };
  }

  private requireQuota(auth: AuthDto, size: number) {
    if (auth.user.quotaSizeInBytes !== null && auth.user.quotaSizeInBytes < auth.user.quotaUsageInBytes + size) {
      throw new Error('Quota has been exceeded!');
    }
  }
}
