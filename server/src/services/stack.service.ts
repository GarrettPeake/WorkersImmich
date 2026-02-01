/**
 * Stack service -- Workers-compatible version.
 *
 * Core business logic for stack CRUD operations.
 * No NestJS decorators, no BaseService, no job queues.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import { Permission } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { AccessRepository } from 'src/repositories/access.repository';
import { StackRepository } from 'src/repositories/stack.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { requireAccess } from 'src/utils/access';

export class StackService {
  private stackRepository: StackRepository;
  private accessRepository: AccessRepository;
  private assetRepository: AssetRepository;

  constructor(private ctx: ServiceContext) {
    this.stackRepository = new StackRepository(ctx.db);
    this.accessRepository = new AccessRepository(ctx.db);
    this.assetRepository = new AssetRepository(ctx.db);
  }

  async search(auth: AuthDto, dto: any) {
    const stacks = await this.stackRepository.search({
      ownerId: auth.user.id,
      primaryAssetId: dto.primaryAssetId,
    });
    return stacks;
  }

  async create(auth: AuthDto, dto: any) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AssetUpdate,
      ids: dto.assetIds,
    });

    const stack = await this.stackRepository.create({ ownerId: auth.user.id }, dto.assetIds);
    return stack;
  }

  async get(auth: AuthDto, id: string) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.StackRead,
      ids: [id],
    });
    const stack = await this.findOrFail(id);
    return stack;
  }

  async update(auth: AuthDto, id: string, dto: any) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.StackUpdate,
      ids: [id],
    });
    const stack = await this.findOrFail(id);
    if (dto.primaryAssetId && !stack.assets?.some((a: any) => a.id === dto.primaryAssetId)) {
      throw new Error('Primary asset must be in the stack');
    }

    const updatedStack = await this.stackRepository.update(id, { id, primaryAssetId: dto.primaryAssetId });
    return updatedStack;
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.StackDelete,
      ids: [id],
    });
    await this.stackRepository.delete(id);
  }

  async deleteAll(auth: AuthDto, dto: { ids: string[] }): Promise<void> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.StackDelete,
      ids: dto.ids,
    });
    await this.stackRepository.deleteAll(dto.ids);
  }

  async removeAsset(auth: AuthDto, dto: { id: string; assetId: string }): Promise<void> {
    const { id: stackId, assetId } = dto;
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.StackUpdate,
      ids: [stackId],
    });

    const stack = await this.stackRepository.getForAssetRemoval(assetId);

    if (!stack?.id || stack.id !== stackId) {
      throw new Error('Asset not in stack');
    }

    if (stack.primaryAssetId === assetId) {
      throw new Error("Cannot remove stack's primary asset");
    }

    await this.assetRepository.update({ id: assetId, stackId: null });
  }

  private async findOrFail(id: string) {
    const stack = await this.stackRepository.getById(id);
    if (!stack) {
      throw new Error('Asset stack not found');
    }
    return stack;
  }
}
