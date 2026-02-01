/**
 * Session service — Workers-compatible version.
 *
 * Manages session CRUD operations.
 * No NestJS decorators, no BaseService, no job system.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import type {
  SessionCreateDto,
  SessionCreateResponseDto,
  SessionResponseDto,
  SessionUpdateDto,
} from 'src/dtos/session.dto';
import { Permission } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { SessionRepository } from 'src/repositories/session.repository';
import { requireAccess } from 'src/utils/access';
import { AccessRepository } from 'src/repositories/access.repository';

export class SessionService {
  private get db() {
    return this.ctx.db;
  }
  private get crypto() {
    return this.ctx.crypto;
  }
  private sessionRepo: SessionRepository;
  private accessRepo: AccessRepository;

  constructor(private ctx: ServiceContext) {
    this.sessionRepo = new SessionRepository(ctx.db);
    this.accessRepo = new AccessRepository(ctx.db);
  }

  async create(
    auth: AuthDto,
    dto: SessionCreateDto,
  ): Promise<SessionCreateResponseDto> {
    if (!auth.session) {
      throw new ServiceError(
        400,
        'This endpoint can only be used with a session token',
      );
    }

    const token = this.crypto.randomBytesAsText(32);
    const tokenHashed = await this.crypto.hashSha256(token);

    let expiresAt: string | null = null;
    if (dto.duration) {
      expiresAt = new Date(Date.now() + dto.duration * 1000).toISOString();
    }

    const session = await this.sessionRepo.create({
      id: this.crypto.randomUUID(),
      parentId: auth.session.id,
      userId: auth.user.id,
      expiresAt,
      deviceType: dto.deviceType || '',
      deviceOS: dto.deviceOS || '',
      token: tokenHashed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updateId: this.crypto.randomUUID(),
    });

    return { ...this.mapSession(session, auth.session.id), token };
  }

  async getAll(auth: AuthDto): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionRepo.getByUserId(auth.user.id);
    return sessions.map((session) =>
      this.mapSession(session, auth.session?.id),
    );
  }

  async update(
    auth: AuthDto,
    id: string,
    dto: SessionUpdateDto,
  ): Promise<SessionResponseDto> {
    await requireAccess(this.accessRepo, {
      auth,
      permission: Permission.SessionUpdate,
      ids: [id],
    });

    if (
      Object.values(dto).filter((prop) => prop !== undefined).length === 0
    ) {
      throw new ServiceError(400, 'No fields to update');
    }

    const session = await this.sessionRepo.update(id, {
      isPendingSyncReset: dto.isPendingSyncReset ? 1 : undefined,
    });

    return this.mapSession(session);
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await requireAccess(this.accessRepo, {
      auth,
      permission: Permission.AuthDeviceDelete,
      ids: [id],
    });
    await this.sessionRepo.delete(id);
  }

  async deleteAll(auth: AuthDto): Promise<void> {
    const userId = auth.user.id;
    const currentSessionId = auth.session?.id;
    await this.sessionRepo.invalidate({
      userId,
      excludeId: currentSessionId,
    });
  }

  async lock(auth: AuthDto, id: string): Promise<void> {
    await requireAccess(this.accessRepo, {
      auth,
      permission: Permission.SessionLock,
      ids: [id],
    });
    await this.sessionRepo.update(id, { pinExpiresAt: null });
  }

  async handleCleanup(): Promise<void> {
    const sessions = await this.sessionRepo.cleanup();
    // In Workers we don't have a logger, but the cleanup still happens
    console.log(`Deleted ${sessions.length} expired session tokens`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mapSession(
    entity: Record<string, unknown>,
    currentId?: string,
  ): SessionResponseDto {
    return {
      id: entity.id as string,
      createdAt: entity.createdAt as string,
      updatedAt: entity.updatedAt as string,
      expiresAt: (entity.expiresAt as string) || undefined,
      current: currentId === entity.id,
      appVersion: (entity.appVersion as string) || null,
      deviceOS: (entity.deviceOS as string) || '',
      deviceType: (entity.deviceType as string) || '',
      isPendingSyncReset: Boolean(entity.isPendingSyncReset),
    };
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
