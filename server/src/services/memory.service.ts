/**
 * Memory service -- Workers-compatible version.
 *
 * Core business logic for memory CRUD operations.
 * No NestJS decorators, no BaseService, no job queues.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import { Permission } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { AccessRepository } from 'src/repositories/access.repository';
import { MemoryRepository } from 'src/repositories/memory.repository';
import { requireAccess, checkAccess } from 'src/utils/access';

export class MemoryService {
  private memoryRepository: MemoryRepository;
  private accessRepository: AccessRepository;

  constructor(private ctx: ServiceContext) {
    this.memoryRepository = new MemoryRepository(ctx.db);
    this.accessRepository = new AccessRepository(ctx.db);
  }

  async search(auth: AuthDto, dto: any) {
    const memories = await this.memoryRepository.search(auth.user.id, dto);
    return memories;
  }

  statistics(auth: AuthDto, dto: any) {
    return this.memoryRepository.statistics(auth.user.id, dto);
  }

  async get(auth: AuthDto, id: string) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.MemoryRead,
      ids: [id],
    });
    const memory = await this.findOrFail(id);
    return memory;
  }

  async create(auth: AuthDto, dto: any) {
    const assetIds = dto.assetIds || [];
    const allowedAssetIds = await checkAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetShare,
      ids: assetIds,
    });

    const memory = await this.memoryRepository.create(
      {
        ownerId: auth.user.id,
        type: dto.type,
        data: JSON.stringify(dto.data || {}),
        isSaved: dto.isSaved ? 1 : 0,
        memoryAt: dto.memoryAt,
        seenAt: dto.seenAt,
      },
      allowedAssetIds,
    );

    return memory;
  }

  async update(auth: AuthDto, id: string, dto: any) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.MemoryUpdate,
      ids: [id],
    });

    const memory = await this.memoryRepository.update(id, {
      isSaved: dto.isSaved !== undefined ? (dto.isSaved ? 1 : 0) : undefined,
      memoryAt: dto.memoryAt,
      seenAt: dto.seenAt,
    });

    return memory;
  }

  async remove(auth: AuthDto, id: string): Promise<void> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.MemoryDelete,
      ids: [id],
    });
    await this.memoryRepository.delete(id);
  }

  async addAssets(auth: AuthDto, id: string, dto: { ids: string[] }) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.MemoryRead,
      ids: [id],
    });

    const allowedAssetIds = await checkAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetShare,
      ids: dto.ids,
    });

    const existingAssetIds = await this.memoryRepository.getAssetIds(id, dto.ids);
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    const toAdd: string[] = [];

    for (const assetId of dto.ids) {
      if (existingAssetIds.has(assetId)) {
        results.push({ id: assetId, success: false, error: 'duplicate' });
      } else if (!allowedAssetIds.has(assetId)) {
        results.push({ id: assetId, success: false, error: 'no_permission' });
      } else {
        results.push({ id: assetId, success: true });
        toAdd.push(assetId);
      }
    }

    if (toAdd.length > 0) {
      await this.memoryRepository.addAssetIds(id, toAdd);
      await this.memoryRepository.update(id, { updatedAt: new Date().toISOString() });
    }

    return results;
  }

  async removeAssets(auth: AuthDto, id: string, dto: { ids: string[] }) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.MemoryUpdate,
      ids: [id],
    });

    const existingAssetIds = await this.memoryRepository.getAssetIds(id, dto.ids);
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    const toRemove: string[] = [];

    for (const assetId of dto.ids) {
      if (!existingAssetIds.has(assetId)) {
        results.push({ id: assetId, success: false, error: 'not_found' });
      } else {
        results.push({ id: assetId, success: true });
        toRemove.push(assetId);
      }
    }

    if (toRemove.length > 0) {
      await this.memoryRepository.removeAssetIds(id, toRemove);
      await this.memoryRepository.update(id, { updatedAt: new Date().toISOString() });
    }

    return results;
  }

  private async findOrFail(id: string) {
    const memory = await this.memoryRepository.get(id);
    if (!memory) {
      throw new Error('Memory not found');
    }
    return memory;
  }
}
