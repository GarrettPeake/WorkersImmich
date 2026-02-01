import { BadRequestException, Injectable } from '@nestjs/common';
import { Insertable } from 'kysely';
import sanitize from 'sanitize-filename';
import { SystemConfig } from 'src/config';
import { SALT_ROUNDS } from 'src/constants';
import { StorageCore } from 'src/cores/storage.core';
import { UserAdmin } from 'src/database';
import { AccessRepository } from 'src/repositories/access.repository';
import { ActivityRepository } from 'src/repositories/activity.repository';
import { AlbumUserRepository } from 'src/repositories/album-user.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { ApiKeyRepository } from 'src/repositories/api-key.repository';
import { AssetEditRepository } from 'src/repositories/asset-edit.repository';
import { AssetJobRepository } from 'src/repositories/asset-job.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { AuditRepository } from 'src/repositories/audit.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { DownloadRepository } from 'src/repositories/download.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { MediaRepository } from 'src/repositories/media.repository';
import { MemoryRepository } from 'src/repositories/memory.repository';
import { MetadataRepository } from 'src/repositories/metadata.repository';
import { PartnerRepository } from 'src/repositories/partner.repository';
import { SessionRepository } from 'src/repositories/session.repository';
import { SharedLinkAssetRepository } from 'src/repositories/shared-link-asset.repository';
import { SharedLinkRepository } from 'src/repositories/shared-link.repository';
import { StackRepository } from 'src/repositories/stack.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { SyncCheckpointRepository } from 'src/repositories/sync-checkpoint.repository';
import { SyncRepository } from 'src/repositories/sync.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { TagRepository } from 'src/repositories/tag.repository';
import { TrashRepository } from 'src/repositories/trash.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { ViewRepository } from 'src/repositories/view-repository';
import { UserTable } from 'src/schema/tables/user.table';
import { AccessRequest, checkAccess, requireAccess } from 'src/utils/access';
import { getConfig, updateConfig } from 'src/utils/config';

export const BASE_SERVICE_DEPENDENCIES = [
  LoggingRepository,
  AccessRepository,
  ActivityRepository,
  AlbumRepository,
  AlbumUserRepository,
  ApiKeyRepository,
  AssetRepository,
  AssetEditRepository,
  AssetJobRepository,
  AuditRepository,
  ConfigRepository,
  CryptoRepository,
  DownloadRepository,
  MediaRepository,
  MemoryRepository,
  MetadataRepository,
  PartnerRepository,
  SessionRepository,
  SharedLinkRepository,
  SharedLinkAssetRepository,
  StackRepository,
  StorageRepository,
  SyncRepository,
  SyncCheckpointRepository,
  SystemMetadataRepository,
  TagRepository,
  TrashRepository,
  UserRepository,
  ViewRepository,
];

@Injectable()
export class BaseService {
  protected storageCore: StorageCore;

  constructor(
    protected logger: LoggingRepository,
    protected accessRepository: AccessRepository,
    protected activityRepository: ActivityRepository,
    protected albumRepository: AlbumRepository,
    protected albumUserRepository: AlbumUserRepository,
    protected apiKeyRepository: ApiKeyRepository,
    protected assetRepository: AssetRepository,
    protected assetEditRepository: AssetEditRepository,
    protected assetJobRepository: AssetJobRepository,
    protected auditRepository: AuditRepository,
    protected configRepository: ConfigRepository,
    protected cryptoRepository: CryptoRepository,
    protected downloadRepository: DownloadRepository,
    protected mediaRepository: MediaRepository,
    protected memoryRepository: MemoryRepository,
    protected metadataRepository: MetadataRepository,
    protected partnerRepository: PartnerRepository,
    protected sessionRepository: SessionRepository,
    protected sharedLinkRepository: SharedLinkRepository,
    protected sharedLinkAssetRepository: SharedLinkAssetRepository,
    protected stackRepository: StackRepository,
    protected storageRepository: StorageRepository,
    protected syncRepository: SyncRepository,
    protected syncCheckpointRepository: SyncCheckpointRepository,
    protected systemMetadataRepository: SystemMetadataRepository,
    protected tagRepository: TagRepository,
    protected trashRepository: TrashRepository,
    protected userRepository: UserRepository,
    protected viewRepository: ViewRepository,
  ) {
    this.logger.setContext(this.constructor.name);
    this.storageCore = new StorageCore();
  }

  get worker() {
    return this.configRepository.getWorker();
  }

  private get configRepos() {
    return {
      configRepo: this.configRepository,
      metadataRepo: this.systemMetadataRepository,
      logger: this.logger,
    };
  }

  getConfig(options: { withCache: boolean }) {
    return getConfig(this.configRepos, options);
  }

  updateConfig(newConfig: SystemConfig) {
    return updateConfig(this.configRepos, newConfig);
  }

  requireAccess(request: AccessRequest) {
    return requireAccess(this.accessRepository, request);
  }

  checkAccess(request: AccessRequest) {
    return checkAccess(this.accessRepository, request);
  }

  async createUser(dto: Insertable<UserTable> & { email: string }): Promise<UserAdmin> {
    const exists = await this.userRepository.getByEmail(dto.email);
    if (exists) {
      throw new BadRequestException('User exists');
    }

    if (!dto.isAdmin) {
      const localAdmin = await this.userRepository.getAdmin();
      if (!localAdmin) {
        throw new BadRequestException('The first registered account must the administrator.');
      }
    }

    const payload: Insertable<UserTable> = { ...dto };
    if (payload.password) {
      payload.password = await this.cryptoRepository.hashBcrypt(payload.password, SALT_ROUNDS);
    }
    if (payload.storageLabel) {
      payload.storageLabel = sanitize(payload.storageLabel.replaceAll('.', ''));
    }

    const user = await this.userRepository.create(payload);

    return user;
  }
}
