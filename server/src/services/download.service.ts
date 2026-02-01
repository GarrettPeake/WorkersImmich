/**
 * Download service -- Workers-compatible version.
 *
 * Provides download info and streaming ZIP archive creation using fflate.
 * No NestJS, no Node.js streams, no archiver.
 */

import { Zip, ZipPassThrough } from 'fflate';
import type { AuthDto } from 'src/dtos/auth.dto';
import type { DownloadInfoDto, DownloadResponseDto, DownloadArchiveInfo } from 'src/dtos/download.dto';
import type { ServiceContext } from 'src/context';
import { AccessRepository } from 'src/repositories/access.repository';
import { requireAccess } from 'src/utils/access';
import { Permission } from 'src/enum';
import { BadRequestException } from 'src/utils/errors';

const GiB = 1024 * 1024 * 1024;

export class DownloadService {
  private accessRepository: AccessRepository;

  private get db() {
    return this.ctx.db;
  }

  private get bucket() {
    return this.ctx.bucket;
  }

  constructor(private ctx: ServiceContext) {
    this.accessRepository = new AccessRepository(ctx.db);
  }

  async getDownloadInfo(auth: AuthDto, dto: DownloadInfoDto): Promise<DownloadResponseDto> {
    let assets: Array<{ id: string; fileSizeInByte: number | null; livePhotoVideoId: string | null }>;

    if (dto.assetIds && dto.assetIds.length > 0) {
      await requireAccess(this.accessRepository, {
        auth,
        permission: Permission.AssetDownload,
        ids: dto.assetIds,
      });

      assets = await this.db
        .selectFrom('asset')
        .innerJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
        .select(['asset.id', 'asset_exif.fileSizeInByte', 'asset.livePhotoVideoId'])
        .where('asset.id', 'in', dto.assetIds)
        .execute();
    } else if (dto.albumId) {
      await requireAccess(this.accessRepository, {
        auth,
        permission: Permission.AlbumDownload,
        ids: [dto.albumId],
      });

      assets = await this.db
        .selectFrom('album_asset')
        .innerJoin('asset', 'asset.id', 'album_asset.assetId')
        .innerJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
        .select(['asset.id', 'asset_exif.fileSizeInByte', 'asset.livePhotoVideoId'])
        .where('album_asset.albumId', '=', dto.albumId)
        .execute();
    } else if (dto.userId) {
      await requireAccess(this.accessRepository, {
        auth,
        permission: Permission.TimelineDownload,
        ids: [dto.userId],
      });

      assets = await this.db
        .selectFrom('asset')
        .innerJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
        .select(['asset.id', 'asset_exif.fileSizeInByte', 'asset.livePhotoVideoId'])
        .where('asset.ownerId', '=', dto.userId)
        .where('asset.deletedAt', 'is', null)
        .execute();
    } else {
      throw new BadRequestException('assetIds, albumId, or userId is required');
    }

    const targetSize = dto.archiveSize || GiB * 4;
    const archives: DownloadArchiveInfo[] = [];
    let archive: DownloadArchiveInfo = { size: 0, assetIds: [] };

    for (const asset of assets) {
      archive.assetIds.push(asset.id);
      archive.size += Number(asset.fileSizeInByte || 0);

      if (archive.size > targetSize) {
        archives.push(archive);
        archive = { size: 0, assetIds: [] };
      }
    }

    if (archive.assetIds.length > 0) {
      archives.push(archive);
    }

    let totalSize = 0;
    for (const a of archives) {
      totalSize += a.size;
    }

    return { totalSize, archives };
  }

  /**
   * Download a ZIP archive of assets using fflate streaming.
   * Returns a Response with a streaming body.
   */
  async downloadArchive(auth: AuthDto, dto: { assetIds: string[] }): Promise<Response> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetDownload,
      ids: dto.assetIds,
    });

    const assets = await this.db
      .selectFrom('asset')
      .select(['asset.id', 'asset.originalPath', 'asset.originalFileName'])
      .where('asset.id', 'in', dto.assetIds)
      .execute();

    // Create a streaming ZIP using fflate
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    const zip = new Zip((err, data, final) => {
      if (err) {
        writer.abort(err);
        return;
      }
      writer.write(data);
      if (final) {
        writer.close();
      }
    });

    // Process each asset in the background
    const processAssets = async () => {
      const paths: Record<string, number> = {};

      for (const asset of assets) {
        const r2Key = asset.originalPath;
        const object = await this.bucket.get(r2Key);
        if (!object) {
          continue;
        }

        // Handle duplicate filenames
        let filename = asset.originalFileName;
        const count = paths[filename] || 0;
        paths[filename] = count + 1;
        if (count !== 0) {
          const lastDot = filename.lastIndexOf('.');
          if (lastDot > 0) {
            filename = `${filename.slice(0, lastDot)}+${count}${filename.slice(lastDot)}`;
          } else {
            filename = `${filename}+${count}`;
          }
        }

        // Use ZipPassThrough (store, no compression) for already-compressed formats
        const file = new ZipPassThrough(filename);
        zip.add(file);

        const reader = object.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          file.push(value, false);
        }
        file.push(new Uint8Array(0), true);
      }

      zip.end();
    };

    // Start processing without awaiting -- the readable stream will be consumed by the client
    processAssets().catch((err) => {
      console.error('Error creating ZIP archive:', err);
      writer.abort(err).catch(() => {});
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="immich-download.zip"',
      },
    });
  }
}
