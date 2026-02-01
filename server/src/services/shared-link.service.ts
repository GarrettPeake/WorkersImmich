/**
 * Shared Link service -- Workers-compatible version.
 *
 * Core business logic for shared link CRUD operations.
 * No NestJS decorators, no BaseService, no job queues.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import { Permission, SharedLinkType } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { AccessRepository } from 'src/repositories/access.repository';
import { SharedLinkRepository } from 'src/repositories/shared-link.repository';
import { SharedLinkAssetRepository } from 'src/repositories/shared-link-asset.repository';
import { requireAccess, checkAccess } from 'src/utils/access';

export class SharedLinkService {
  private sharedLinkRepository: SharedLinkRepository;
  private sharedLinkAssetRepository: SharedLinkAssetRepository;
  private accessRepository: AccessRepository;

  constructor(private ctx: ServiceContext) {
    this.sharedLinkRepository = new SharedLinkRepository(ctx.db);
    this.sharedLinkAssetRepository = new SharedLinkAssetRepository(ctx.db);
    this.accessRepository = new AccessRepository(ctx.db);
  }

  async getAll(auth: AuthDto, dto: { id?: string; albumId?: string }) {
    const links = await this.sharedLinkRepository.getAll({
      userId: auth.user.id,
      id: dto.id,
      albumId: dto.albumId,
    });
    return links;
  }

  async getMine(auth: AuthDto, dto: { password?: string; token?: string }) {
    if (!auth.sharedLink) {
      throw new Error('Forbidden');
    }

    const sharedLink = await this.findOrFail(auth.sharedLink.userId, auth.sharedLink.id);

    if (sharedLink.password) {
      const token = this.validateAndRefreshToken(sharedLink, dto);
      return { ...sharedLink, token };
    }

    return sharedLink;
  }

  async get(auth: AuthDto, id: string) {
    return this.findOrFail(auth.user.id, id);
  }

  async create(auth: AuthDto, dto: any) {
    switch (dto.type) {
      case SharedLinkType.Album: {
        if (!dto.albumId) {
          throw new Error('Invalid albumId');
        }
        await requireAccess(this.accessRepository, {
          auth,
          permission: Permission.AlbumShare,
          ids: [dto.albumId],
        });
        break;
      }
      case SharedLinkType.Individual: {
        if (!dto.assetIds || dto.assetIds.length === 0) {
          throw new Error('Invalid assetIds');
        }
        await requireAccess(this.accessRepository, {
          auth,
          permission: Permission.AssetShare,
          ids: dto.assetIds,
        });
        break;
      }
    }

    const keyBytes = crypto.getRandomValues(new Uint8Array(50));

    const sharedLink = await this.sharedLinkRepository.create({
      key: keyBytes,
      userId: auth.user.id,
      type: dto.type,
      albumId: dto.albumId || null,
      assetIds: dto.assetIds,
      description: dto.description || null,
      password: dto.password || null,
      expiresAt: dto.expiresAt || null,
      allowUpload: dto.allowUpload ?? 1,
      allowDownload: dto.showMetadata === false ? 0 : (dto.allowDownload ?? 1),
      showExif: dto.showMetadata ?? 1,
      slug: dto.slug || null,
    });

    return sharedLink;
  }

  async update(auth: AuthDto, id: string, dto: any) {
    await this.findOrFail(auth.user.id, id);

    const sharedLink = await this.sharedLinkRepository.update({
      id,
      userId: auth.user.id,
      description: dto.description,
      password: dto.password,
      expiresAt: dto.changeExpiryTime && !dto.expiresAt ? null : dto.expiresAt,
      allowUpload: dto.allowUpload,
      allowDownload: dto.allowDownload,
      showExif: dto.showMetadata,
      slug: dto.slug || null,
    });

    return sharedLink;
  }

  async remove(auth: AuthDto, id: string): Promise<void> {
    await this.findOrFail(auth.user.id, id);
    await this.sharedLinkRepository.remove(id);
  }

  async addAssets(auth: AuthDto, id: string, dto: { assetIds: string[] }) {
    const sharedLink = await this.findOrFail(auth.user.id, id);

    if (sharedLink.type !== SharedLinkType.Individual) {
      throw new Error('Invalid shared link type');
    }

    const existingAssetIds = new Set(
      (sharedLink.assets || []).map((asset: any) => asset.id),
    );
    const notPresentAssetIds = dto.assetIds.filter(
      (assetId) => !existingAssetIds.has(assetId),
    );
    const allowedAssetIds = await checkAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetShare,
      ids: notPresentAssetIds,
    });

    const results: Array<{ assetId: string; success: boolean; error?: string }> = [];
    const toAdd: string[] = [];

    for (const assetId of dto.assetIds) {
      if (existingAssetIds.has(assetId)) {
        results.push({ assetId, success: false, error: 'duplicate' });
      } else if (!allowedAssetIds.has(assetId)) {
        results.push({ assetId, success: false, error: 'no_permission' });
      } else {
        results.push({ assetId, success: true });
        toAdd.push(assetId);
      }
    }

    if (toAdd.length > 0) {
      await this.sharedLinkRepository.update({
        ...sharedLink,
        assetIds: toAdd,
      });
    }

    return results;
  }

  async removeAssets(auth: AuthDto, id: string, dto: { assetIds: string[] }) {
    const sharedLink = await this.findOrFail(auth.user.id, id);

    if (sharedLink.type !== SharedLinkType.Individual) {
      throw new Error('Invalid shared link type');
    }

    const removedAssetIds = await this.sharedLinkAssetRepository.remove(id, dto.assetIds);
    const removedSet = new Set(removedAssetIds);

    const results: Array<{ assetId: string; success: boolean; error?: string }> = [];

    for (const assetId of dto.assetIds) {
      if (!removedSet.has(assetId)) {
        results.push({ assetId, success: false, error: 'not_found' });
      } else {
        results.push({ assetId, success: true });
      }
    }

    return results;
  }

  private async findOrFail(userId: string, id: string) {
    const sharedLink = await this.sharedLinkRepository.get(userId, id);
    if (!sharedLink) {
      throw new Error('Shared link not found');
    }
    return sharedLink;
  }

  private validateAndRefreshToken(
    sharedLink: any,
    dto: { password?: string; token?: string },
  ): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${sharedLink.id}-${sharedLink.password}`);
    // Use a simple hash for token validation in Workers
    const hashHex = Array.from(new Uint8Array(data))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const token = hashHex;

    const sharedLinkTokens = dto.token?.split(',') || [];
    if (sharedLink.password !== dto.password && !sharedLinkTokens.includes(token)) {
      throw new Error('Invalid password');
    }

    if (!sharedLinkTokens.includes(token)) {
      sharedLinkTokens.push(token);
    }
    return sharedLinkTokens.join(',');
  }
}
