/**
 * Activity service -- Workers-compatible version.
 *
 * Core business logic for activity CRUD operations.
 * No NestJS decorators, no BaseService, no job queues.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import { Permission } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { AccessRepository } from 'src/repositories/access.repository';
import { ActivityRepository } from 'src/repositories/activity.repository';
import { requireAccess } from 'src/utils/access';

export class ActivityService {
  private activityRepository: ActivityRepository;
  private accessRepository: AccessRepository;

  constructor(private ctx: ServiceContext) {
    this.activityRepository = new ActivityRepository(ctx.db);
    this.accessRepository = new AccessRepository(ctx.db);
  }

  async getAll(auth: AuthDto, dto: any) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AlbumRead,
      ids: [dto.albumId],
    });

    const activities = await this.activityRepository.search({
      userId: dto.userId,
      albumId: dto.albumId,
      assetId: dto.level === 'album' ? null : dto.assetId,
      isLiked: dto.type === 'like' ? true : undefined,
    });

    return activities.map((activity: any) => ({
      id: activity.id,
      createdAt: activity.createdAt,
      type: activity.isLiked ? 'like' : 'comment',
      comment: activity.comment,
      user: activity.user,
      assetId: activity.assetId,
      albumId: activity.albumId,
    }));
  }

  async getStatistics(auth: AuthDto, dto: any) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.AlbumRead,
      ids: [dto.albumId],
    });
    return this.activityRepository.getStatistics({
      albumId: dto.albumId,
      assetId: dto.assetId,
    });
  }

  async create(auth: AuthDto, dto: any) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.ActivityCreate,
      ids: [dto.albumId],
    });

    const common = {
      userId: auth.user.id,
      assetId: dto.assetId,
      albumId: dto.albumId,
    };

    let activity: any;
    let duplicate = false;

    if (dto.type === 'like') {
      delete dto.comment;
      const results = await this.activityRepository.search({
        ...common,
        assetId: dto.assetId ?? null,
        isLiked: true,
      });
      activity = results[0];
      duplicate = !!activity;
    }

    if (!activity) {
      activity = await this.activityRepository.create({
        ...common,
        isLiked: dto.type === 'like',
        comment: dto.comment,
      });
    }

    const value = {
      id: activity.id,
      createdAt: activity.createdAt,
      type: activity.isLiked ? 'like' : 'comment',
      comment: activity.comment,
      user: activity.user,
      assetId: activity.assetId,
      albumId: activity.albumId,
    };

    return { duplicate, value };
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.ActivityDelete,
      ids: [id],
    });
    await this.activityRepository.delete(id);
  }
}
