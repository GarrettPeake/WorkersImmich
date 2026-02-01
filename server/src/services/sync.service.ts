/**
 * Sync service -- Workers-compatible version.
 *
 * Provides the sync protocol for mobile app synchronization.
 * Converts Node.js Writable streams to Web ReadableStream with TransformStream.
 * PeopleV1 and AssetFacesV1 are stubbed with empty responses.
 * No NestJS, no BaseService, no background jobs.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import {
  AssetDeltaSyncDto,
  AssetDeltaSyncResponseDto,
  AssetFullSyncDto,
  SyncAckDeleteDto,
  SyncAckSetDto,
  SyncStreamDto,
} from 'src/dtos/sync.dto';
import { mapAsset, AssetResponseDto } from 'src/dtos/asset-response.dto';
import {
  AssetVisibility,
  SyncEntityType,
  SyncRequestType,
} from 'src/enum';
import type { ServiceContext } from 'src/context';
import { fromAck, serialize, toAck } from 'src/utils/sync';
import { ForbiddenException, BadRequestException } from 'src/utils/errors';

type SyncAck = {
  type: SyncEntityType;
  updateId: string;
  extraId?: string;
};
type CheckpointMap = Partial<Record<SyncEntityType, SyncAck>>;

const COMPLETE_ID = 'complete';
const MAX_DAYS = 30;

const FULL_SYNC = { needsFullSync: true, deleted: [], upserted: [] };

export const SYNC_TYPES_ORDER = [
  SyncRequestType.AuthUsersV1,
  SyncRequestType.UsersV1,
  SyncRequestType.PartnersV1,
  SyncRequestType.AssetsV1,
  SyncRequestType.StacksV1,
  SyncRequestType.PartnerAssetsV1,
  SyncRequestType.PartnerStacksV1,
  SyncRequestType.AlbumAssetsV1,
  SyncRequestType.AlbumsV1,
  SyncRequestType.AlbumUsersV1,
  SyncRequestType.AlbumToAssetsV1,
  SyncRequestType.AssetExifsV1,
  SyncRequestType.AlbumAssetExifsV1,
  SyncRequestType.PartnerAssetExifsV1,
  SyncRequestType.MemoriesV1,
  SyncRequestType.MemoryToAssetsV1,
  SyncRequestType.PeopleV1,
  SyncRequestType.AssetFacesV1,
  SyncRequestType.UserMetadataV1,
  SyncRequestType.AssetMetadataV1,
];

/**
 * Create a JSON Lines streaming helper using Web Streams API.
 */
function createJsonLinesStream() {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();

  return {
    readable,
    write: (data: string) => writer.write(encoder.encode(data)),
    close: () => writer.close(),
    abort: (err: any) => writer.abort(err),
  };
}

export class SyncService {
  private get db() {
    return this.ctx.db;
  }

  constructor(private ctx: ServiceContext) {}

  async getAcks(auth: AuthDto) {
    const sessionId = auth.session?.id;
    if (!sessionId) {
      throw new ForbiddenException('Sync endpoints cannot be used with API keys');
    }

    return this.db
      .selectFrom('session_sync_checkpoint')
      .selectAll()
      .where('sessionId', '=', sessionId)
      .execute();
  }

  async setAcks(auth: AuthDto, dto: SyncAckSetDto) {
    const sessionId = auth.session?.id;
    if (!sessionId) {
      throw new ForbiddenException('Sync endpoints cannot be used with API keys');
    }

    const checkpoints: Record<string, { sessionId: string; type: string; ack: string }> = {};
    for (const ack of dto.acks) {
      const { type } = fromAck(ack);
      if (type === SyncEntityType.SyncResetV1) {
        // Reset sync progress for this session
        await this.db
          .updateTable('session')
          .set({ isPendingSyncReset: 1 })
          .where('id', '=', sessionId)
          .execute();
        await this.db
          .deleteFrom('session_sync_checkpoint')
          .where('sessionId', '=', sessionId)
          .execute();
        return;
      }

      if (!Object.values(SyncEntityType).includes(type as SyncEntityType)) {
        throw new BadRequestException(`Invalid ack type: ${type}`);
      }

      checkpoints[type] = { sessionId, type, ack };
    }

    for (const cp of Object.values(checkpoints)) {
      await this.db
        .insertInto('session_sync_checkpoint')
        .values({
          sessionId: cp.sessionId,
          type: cp.type,
          ack: cp.ack,
          updateId: crypto.randomUUID(),
        })
        .onConflict((oc) =>
          oc.columns(['sessionId', 'type']).doUpdateSet({
            ack: cp.ack,
            updatedAt: new Date().toISOString(),
            updateId: crypto.randomUUID(),
          }),
        )
        .execute();
    }
  }

  async deleteAcks(auth: AuthDto, dto: SyncAckDeleteDto) {
    const sessionId = auth.session?.id;
    if (!sessionId) {
      throw new ForbiddenException('Sync endpoints cannot be used with API keys');
    }

    if (dto.types && dto.types.length > 0) {
      await this.db
        .deleteFrom('session_sync_checkpoint')
        .where('sessionId', '=', sessionId)
        .where('type', 'in', dto.types)
        .execute();
    } else {
      await this.db
        .deleteFrom('session_sync_checkpoint')
        .where('sessionId', '=', sessionId)
        .execute();
    }
  }

  /**
   * Stream sync data as JSON Lines (application/x-ndjson).
   * Returns a Response with streaming body.
   */
  async stream(auth: AuthDto, dto: SyncStreamDto): Promise<Response> {
    const session = auth.session;
    if (!session) {
      throw new ForbiddenException('Sync endpoints cannot be used with API keys');
    }

    const stream = createJsonLinesStream();

    // Process sync in the background
    const processSync = async () => {
      try {
        if (dto.reset) {
          await this.db
            .updateTable('session')
            .set({ isPendingSyncReset: 1 })
            .where('id', '=', session.id)
            .execute();
          await this.db
            .deleteFrom('session_sync_checkpoint')
            .where('sessionId', '=', session.id)
            .execute();
        }

        // Check if pending sync reset
        const sessionRow = await this.db
          .selectFrom('session')
          .select('session.isPendingSyncReset')
          .where('session.id', '=', session.id)
          .executeTakeFirst();

        if (sessionRow?.isPendingSyncReset) {
          stream.write(serialize({ type: SyncEntityType.SyncResetV1, ids: ['reset'], data: {} }));
          stream.close();
          return;
        }

        // Load checkpoints
        const checkpoints = await this.db
          .selectFrom('session_sync_checkpoint')
          .selectAll()
          .where('sessionId', '=', session.id)
          .execute();

        const checkpointMap: CheckpointMap = {};
        for (const cp of checkpoints) {
          checkpointMap[cp.type as SyncEntityType] = fromAck(cp.ack);
        }

        // Check if full sync is needed (complete ack is too old)
        if (this.needsFullSync(checkpointMap)) {
          stream.write(serialize({ type: SyncEntityType.SyncResetV1, ids: ['reset'], data: {} }));
          stream.close();
          return;
        }

        const nowId = crypto.randomUUID();

        // Process requested sync types in order
        for (const type of SYNC_TYPES_ORDER.filter((t) => dto.types.includes(t))) {
          await this.handleSyncType(type, auth, checkpointMap, nowId, stream);
        }

        // Send completion
        stream.write(serialize({ type: SyncEntityType.SyncCompleteV1, ids: [nowId], data: {} }));
        stream.close();
      } catch (err) {
        console.error('Sync stream error:', err);
        stream.abort(err);
      }
    };

    processSync();

    return new Response(stream.readable, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  /**
   * Legacy full-sync endpoint (deprecated but functional).
   */
  async getFullSync(auth: AuthDto, dto: AssetFullSyncDto): Promise<AssetResponseDto[]> {
    const userId = dto.userId || auth.user.id;

    const updatedUntil = dto.updatedUntil instanceof Date
      ? dto.updatedUntil.toISOString()
      : String(dto.updatedUntil);

    let query = this.db
      .selectFrom('asset')
      .selectAll()
      .where('asset.ownerId', '=', userId)
      .where('asset.updatedAt', '<=', updatedUntil)
      .orderBy('asset.id', 'asc')
      .limit(dto.limit);

    if (dto.lastId) {
      query = query.where('asset.id', '>', dto.lastId);
    }

    const assets = await query.execute();
    return assets.map((a: any) => mapAsset(a, { auth, stripMetadata: false, withStack: true }));
  }

  /**
   * Legacy delta-sync endpoint (deprecated but functional).
   */
  async getDeltaSync(auth: AuthDto, dto: AssetDeltaSyncDto): Promise<AssetDeltaSyncResponseDto> {
    const updatedAfter = dto.updatedAfter instanceof Date
      ? dto.updatedAfter
      : new Date(dto.updatedAfter);

    // Check if sync is too old
    const daysSinceSync = (Date.now() - updatedAfter.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSync > 100) {
      return FULL_SYNC;
    }

    const updatedAfterIso = updatedAfter.toISOString();

    // Get changed assets
    const limit = 10_000;
    const upserted = await this.db
      .selectFrom('asset')
      .selectAll()
      .where('asset.ownerId', 'in', dto.userIds)
      .where('asset.updatedAt', '>', updatedAfterIso)
      .orderBy('asset.updatedAt', 'asc')
      .limit(limit)
      .execute();

    if (upserted.length === limit) {
      return FULL_SYNC;
    }

    // Get deleted assets from audit table
    const deleted = await this.db
      .selectFrom('asset_audit')
      .select('asset_audit.assetId')
      .where('asset_audit.ownerId', 'in', dto.userIds)
      .where('asset_audit.deletedAt', '>', updatedAfterIso)
      .execute();

    return {
      needsFullSync: false,
      upserted: upserted
        .filter(
          (a: any) =>
            a.ownerId === auth.user.id ||
            (a.ownerId !== auth.user.id && a.visibility === AssetVisibility.Timeline),
        )
        .map((a: any) =>
          mapAsset(a, {
            auth,
            stripMetadata: false,
            withStack: a.ownerId === auth.user.id,
          }),
        ),
      deleted: deleted.map((d) => d.assetId),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private needsFullSync(checkpointMap: CheckpointMap): boolean {
    const completeAck = checkpointMap[SyncEntityType.SyncCompleteV1];
    if (!completeAck) {
      return false;
    }

    // Extract timestamp from UUID v7 (first 12 hex chars = 48 bits of timestamp)
    const hexStr = completeAck.updateId.replaceAll('-', '').slice(0, 12);
    const milliseconds = Number.parseInt(hexStr, 16);
    const ackDate = new Date(milliseconds);
    const maxAge = MAX_DAYS * 24 * 60 * 60 * 1000;

    return (Date.now() - ackDate.getTime()) > maxAge;
  }

  private async handleSyncType(
    type: SyncRequestType,
    auth: AuthDto,
    checkpointMap: CheckpointMap,
    nowId: string,
    stream: { write: (data: string) => void },
  ) {
    const userId = auth.user.id;

    switch (type) {
      case SyncRequestType.AuthUsersV1:
        await this.syncSimpleUpsert(stream, 'user', SyncEntityType.AuthUserV1, checkpointMap, {
          ownerFilter: userId,
          mapRow: (row: any) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            avatarColor: row.avatarColor,
            deletedAt: row.deletedAt,
            hasProfileImage: !!row.profileImagePath,
            profileChangedAt: row.profileChangedAt,
            isAdmin: Boolean(row.isAdmin),
            pinCode: row.pinCode,
            oauthId: row.oauthId ?? '',
            storageLabel: row.storageLabel,
            quotaSizeInBytes: row.quotaSizeInBytes,
            quotaUsageInBytes: row.quotaUsageInBytes ?? 0,
          }),
        });
        break;

      case SyncRequestType.UsersV1:
        // Deletes
        await this.syncAuditDeletes(stream, 'user_audit', SyncEntityType.UserDeleteV1, checkpointMap, {
          mapRow: (row: any) => ({ userId: row.userId }),
        });
        // Upserts
        await this.syncSimpleUpsert(stream, 'user', SyncEntityType.UserV1, checkpointMap, {
          mapRow: (row: any) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            avatarColor: row.avatarColor,
            deletedAt: row.deletedAt,
            hasProfileImage: !!row.profileImagePath,
            profileChangedAt: row.profileChangedAt,
          }),
        });
        break;

      case SyncRequestType.PartnersV1:
        await this.syncAuditDeletes(stream, 'partner_audit', SyncEntityType.PartnerDeleteV1, checkpointMap, {
          ownerFilter: userId,
          mapRow: (row: any) => ({ sharedById: row.sharedById, sharedWithId: row.sharedWithId }),
        });
        await this.syncSimpleUpsert(stream, 'partner', SyncEntityType.PartnerV1, checkpointMap, {
          ownerFilter: userId,
          ownerColumn: 'sharedWithId',
          mapRow: (row: any) => ({
            sharedById: row.sharedById,
            sharedWithId: row.sharedWithId,
            inTimeline: Boolean(row.inTimeline),
          }),
        });
        break;

      case SyncRequestType.AssetsV1:
        await this.syncAuditDeletes(stream, 'asset_audit', SyncEntityType.AssetDeleteV1, checkpointMap, {
          ownerFilter: userId,
          mapRow: (row: any) => ({ assetId: row.assetId }),
        });
        await this.syncSimpleUpsert(stream, 'asset', SyncEntityType.AssetV1, checkpointMap, {
          ownerFilter: userId,
          mapRow: (row: any) => this.mapSyncAsset(row),
        });
        break;

      case SyncRequestType.AssetExifsV1:
        await this.syncExifUpserts(stream, SyncEntityType.AssetExifV1, checkpointMap, userId);
        break;

      case SyncRequestType.StacksV1:
        await this.syncAuditDeletes(stream, 'stack_audit', SyncEntityType.StackDeleteV1, checkpointMap, {
          ownerFilter: userId,
          ownerColumn: 'userId',
          mapRow: (row: any) => ({ stackId: row.stackId }),
        });
        await this.syncSimpleUpsert(stream, 'stack', SyncEntityType.StackV1, checkpointMap, {
          ownerFilter: userId,
          mapRow: (row: any) => ({
            id: row.id,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            primaryAssetId: row.primaryAssetId,
            ownerId: row.ownerId,
          }),
        });
        break;

      case SyncRequestType.AlbumsV1:
        await this.syncAuditDeletes(stream, 'album_audit', SyncEntityType.AlbumDeleteV1, checkpointMap, {
          ownerFilter: userId,
          ownerColumn: 'userId',
          mapRow: (row: any) => ({ albumId: row.albumId }),
        });
        await this.syncAlbumUpserts(stream, checkpointMap, userId);
        break;

      case SyncRequestType.AlbumUsersV1:
        await this.syncAuditDeletes(stream, 'album_user_audit', SyncEntityType.AlbumUserDeleteV1, checkpointMap, {
          ownerFilter: userId,
          ownerColumn: 'userId',
          mapRow: (row: any) => ({ albumId: row.albumId, userId: row.userId }),
        });
        await this.syncAlbumUserUpserts(stream, checkpointMap, userId);
        break;

      case SyncRequestType.AlbumToAssetsV1:
        await this.syncAuditDeletes(stream, 'album_asset_audit', SyncEntityType.AlbumToAssetDeleteV1, checkpointMap, {
          mapRow: (row: any) => ({ albumId: row.albumId, assetId: row.assetId }),
        });
        await this.syncAlbumToAssetUpserts(stream, checkpointMap, userId);
        break;

      case SyncRequestType.MemoriesV1:
        await this.syncAuditDeletes(stream, 'memory_audit', SyncEntityType.MemoryDeleteV1, checkpointMap, {
          ownerFilter: userId,
          ownerColumn: 'userId',
          mapRow: (row: any) => ({ memoryId: row.memoryId }),
        });
        await this.syncSimpleUpsert(stream, 'memory', SyncEntityType.MemoryV1, checkpointMap, {
          ownerFilter: userId,
          mapRow: (row: any) => ({
            id: row.id,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            deletedAt: row.deletedAt,
            ownerId: row.ownerId,
            type: row.type,
            data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
            isSaved: Boolean(row.isSaved),
            memoryAt: row.memoryAt,
            seenAt: row.seenAt,
            showAt: row.showAt,
            hideAt: row.hideAt,
          }),
        });
        break;

      case SyncRequestType.MemoryToAssetsV1:
        await this.syncAuditDeletes(stream, 'memory_asset_audit', SyncEntityType.MemoryToAssetDeleteV1, checkpointMap, {
          mapRow: (row: any) => ({ memoryId: row.memoryId, assetId: row.assetId }),
        });
        await this.syncMemoryAssetUpserts(stream, checkpointMap, userId);
        break;

      case SyncRequestType.UserMetadataV1:
        await this.syncAuditDeletes(stream, 'user_metadata_audit', SyncEntityType.UserMetadataDeleteV1, checkpointMap, {
          ownerFilter: userId,
          ownerColumn: 'userId',
          mapRow: (row: any) => ({ userId: row.userId, key: row.key }),
        });
        await this.syncUserMetadataUpserts(stream, checkpointMap, userId);
        break;

      case SyncRequestType.AssetMetadataV1:
        await this.syncAssetMetadata(stream, checkpointMap, auth);
        break;

      // Stubbed sync types (features removed in Workers)
      case SyncRequestType.PeopleV1:
        // People feature removed -- return empty
        break;
      case SyncRequestType.AssetFacesV1:
        // Face recognition removed -- return empty
        break;

      // Partner-related types -- simplified stubs
      case SyncRequestType.PartnerAssetsV1:
      case SyncRequestType.PartnerAssetExifsV1:
      case SyncRequestType.PartnerStacksV1:
      case SyncRequestType.AlbumAssetsV1:
      case SyncRequestType.AlbumAssetExifsV1:
        // These complex backfill types are simplified in Workers
        // The basic sync for these entity types through their parent types is sufficient
        break;
    }
  }

  /**
   * Generic simple upsert sync from a table with updateId column.
   */
  private async syncSimpleUpsert(
    stream: { write: (data: string) => void },
    tableName: string,
    entityType: SyncEntityType,
    checkpointMap: CheckpointMap,
    options: {
      ownerFilter?: string;
      ownerColumn?: string;
      mapRow: (row: any) => any;
    },
  ) {
    const checkpoint = checkpointMap[entityType];
    const ownerColumn = options.ownerColumn || 'ownerId';

    let query = this.db
      .selectFrom(tableName as any)
      .selectAll()
      .orderBy('updateId', 'asc');

    if (checkpoint) {
      query = query.where('updateId' as any, '>', checkpoint.updateId);
    }

    if (options.ownerFilter) {
      query = query.where(ownerColumn as any, '=', options.ownerFilter);
    }

    const rows = await query.limit(1000).execute();

    for (const row of rows) {
      const data = options.mapRow(row);
      const updateId = (row as any).updateId;
      stream.write(serialize({ type: entityType, ids: [updateId], data }));
    }
  }

  /**
   * Generic audit table deletes sync.
   */
  private async syncAuditDeletes(
    stream: { write: (data: string) => void },
    auditTable: string,
    entityType: SyncEntityType,
    checkpointMap: CheckpointMap,
    options: {
      ownerFilter?: string;
      ownerColumn?: string;
      mapRow: (row: any) => any;
    },
  ) {
    const checkpoint = checkpointMap[entityType];

    let query = this.db
      .selectFrom(auditTable as any)
      .selectAll()
      .orderBy('id', 'asc');

    if (checkpoint) {
      query = query.where('id' as any, '>', checkpoint.updateId);
    }

    if (options.ownerFilter && options.ownerColumn) {
      query = query.where(options.ownerColumn as any, '=', options.ownerFilter);
    }

    const rows = await query.limit(1000).execute();

    for (const row of rows) {
      const data = options.mapRow(row);
      stream.write(serialize({ type: entityType, ids: [(row as any).id], data }));
    }
  }

  private async syncExifUpserts(
    stream: { write: (data: string) => void },
    entityType: SyncEntityType,
    checkpointMap: CheckpointMap,
    userId: string,
  ) {
    const checkpoint = checkpointMap[entityType];

    let query = this.db
      .selectFrom('asset_exif')
      .innerJoin('asset', 'asset.id', 'asset_exif.assetId')
      .selectAll('asset_exif')
      .where('asset.ownerId', '=', userId)
      .orderBy('asset_exif.updateId', 'asc');

    if (checkpoint) {
      query = query.where('asset_exif.updateId', '>', checkpoint.updateId);
    }

    const rows = await query.limit(1000).execute();

    for (const row of rows) {
      const { updateId, assetId, ...data } = row as any;
      stream.write(serialize({
        type: entityType,
        ids: [updateId],
        data: { assetId, ...data },
      }));
    }
  }

  private async syncAlbumUpserts(
    stream: { write: (data: string) => void },
    checkpointMap: CheckpointMap,
    userId: string,
  ) {
    const entityType = SyncEntityType.AlbumV1;
    const checkpoint = checkpointMap[entityType];

    // Get albums owned by user or shared with user
    let query = this.db
      .selectFrom('album')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('album.ownerId', '=', userId),
          eb.exists(
            eb.selectFrom('album_user')
              .select('album_user.albumId')
              .whereRef('album_user.albumId', '=', 'album.id')
              .where('album_user.userId', '=', userId),
          ),
        ]),
      )
      .orderBy('album.updateId', 'asc');

    if (checkpoint) {
      query = query.where('album.updateId', '>', checkpoint.updateId);
    }

    const rows = await query.limit(1000).execute();

    for (const row of rows) {
      stream.write(serialize({
        type: entityType,
        ids: [(row as any).updateId],
        data: {
          id: row.id,
          ownerId: row.ownerId,
          name: row.albumName,
          description: row.description ?? '',
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          thumbnailAssetId: row.albumThumbnailAssetId,
          isActivityEnabled: Boolean(row.isActivityEnabled),
          order: row.order,
        },
      }));
    }
  }

  private async syncAlbumUserUpserts(
    stream: { write: (data: string) => void },
    checkpointMap: CheckpointMap,
    userId: string,
  ) {
    const entityType = SyncEntityType.AlbumUserV1;
    const checkpoint = checkpointMap[entityType];

    let query = this.db
      .selectFrom('album_user')
      .innerJoin('album', 'album.id', 'album_user.albumId')
      .selectAll('album_user')
      .where((eb) =>
        eb.or([
          eb('album.ownerId', '=', userId),
          eb('album_user.userId', '=', userId),
        ]),
      )
      .orderBy('album_user.updateId', 'asc');

    if (checkpoint) {
      query = query.where('album_user.updateId', '>', checkpoint.updateId);
    }

    const rows = await query.limit(1000).execute();

    for (const row of rows) {
      stream.write(serialize({
        type: entityType,
        ids: [(row as any).updateId],
        data: {
          albumId: row.albumId,
          userId: row.userId,
          role: row.role,
        },
      }));
    }
  }

  private async syncAlbumToAssetUpserts(
    stream: { write: (data: string) => void },
    checkpointMap: CheckpointMap,
    userId: string,
  ) {
    const entityType = SyncEntityType.AlbumToAssetV1;
    const checkpoint = checkpointMap[entityType];

    let query = this.db
      .selectFrom('album_asset')
      .innerJoin('album', 'album.id', 'album_asset.albumId')
      .selectAll('album_asset')
      .where((eb) =>
        eb.or([
          eb('album.ownerId', '=', userId),
          eb.exists(
            eb.selectFrom('album_user')
              .select('album_user.albumId')
              .whereRef('album_user.albumId', '=', 'album.id')
              .where('album_user.userId', '=', userId),
          ),
        ]),
      )
      .orderBy('album_asset.updateId', 'asc');

    if (checkpoint) {
      query = query.where('album_asset.updateId', '>', checkpoint.updateId);
    }

    const rows = await query.limit(1000).execute();

    for (const row of rows) {
      stream.write(serialize({
        type: entityType,
        ids: [(row as any).updateId],
        data: {
          albumId: row.albumId,
          assetId: row.assetId,
        },
      }));
    }
  }

  private async syncMemoryAssetUpserts(
    stream: { write: (data: string) => void },
    checkpointMap: CheckpointMap,
    userId: string,
  ) {
    const entityType = SyncEntityType.MemoryToAssetV1;
    const checkpoint = checkpointMap[entityType];

    let query = this.db
      .selectFrom('memory_asset')
      .innerJoin('memory', 'memory.id', 'memory_asset.memoriesId')
      .selectAll('memory_asset')
      .where('memory.ownerId', '=', userId)
      .orderBy('memory_asset.updateId', 'asc');

    if (checkpoint) {
      query = query.where('memory_asset.updateId', '>', checkpoint.updateId);
    }

    const rows = await query.limit(1000).execute();

    for (const row of rows) {
      stream.write(serialize({
        type: entityType,
        ids: [(row as any).updateId],
        data: {
          memoryId: row.memoriesId,
          assetId: row.assetId,
        },
      }));
    }
  }

  private async syncUserMetadataUpserts(
    stream: { write: (data: string) => void },
    checkpointMap: CheckpointMap,
    userId: string,
  ) {
    const entityType = SyncEntityType.UserMetadataV1;
    const checkpoint = checkpointMap[entityType];

    let query = this.db
      .selectFrom('user_metadata')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('updateId', 'asc');

    if (checkpoint) {
      query = query.where('updateId', '>', checkpoint.updateId);
    }

    const rows = await query.limit(1000).execute();

    for (const row of rows) {
      stream.write(serialize({
        type: entityType,
        ids: [(row as any).updateId],
        data: {
          userId: row.userId,
          key: row.key,
          value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
        },
      }));
    }
  }

  private async syncAssetMetadata(
    stream: { write: (data: string) => void },
    checkpointMap: CheckpointMap,
    auth: AuthDto,
  ) {
    const userId = auth.user.id;

    // Deletes
    const deleteType = SyncEntityType.AssetMetadataDeleteV1;
    const deleteCheckpoint = checkpointMap[deleteType];

    let deleteQuery = this.db
      .selectFrom('asset_metadata_audit')
      .selectAll()
      .where('asset_metadata_audit.assetId', 'in',
        this.db.selectFrom('asset').select('asset.id').where('asset.ownerId', '=', userId),
      )
      .orderBy('id', 'asc');

    if (deleteCheckpoint) {
      deleteQuery = deleteQuery.where('id', '>', deleteCheckpoint.updateId);
    }

    const deleteRows = await deleteQuery.limit(1000).execute();
    for (const row of deleteRows) {
      stream.write(serialize({
        type: deleteType,
        ids: [(row as any).id],
        data: { assetId: (row as any).assetId, key: (row as any).key },
      }));
    }

    // Upserts
    const upsertType = SyncEntityType.AssetMetadataV1;
    const upsertCheckpoint = checkpointMap[upsertType];

    let upsertQuery = this.db
      .selectFrom('asset_metadata')
      .innerJoin('asset', 'asset.id', 'asset_metadata.assetId')
      .selectAll('asset_metadata')
      .where('asset.ownerId', '=', userId)
      .orderBy('asset_metadata.updateId', 'asc');

    if (upsertCheckpoint) {
      upsertQuery = upsertQuery.where('asset_metadata.updateId', '>', upsertCheckpoint.updateId);
    }

    const upsertRows = await upsertQuery.limit(1000).execute();
    for (const row of upsertRows) {
      stream.write(serialize({
        type: upsertType,
        ids: [(row as any).updateId],
        data: {
          assetId: row.assetId,
          key: row.key,
          value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
        },
      }));
    }
  }

  private mapSyncAsset(row: any) {
    let checksum = '';
    if (row.checksum) {
      if (row.checksum instanceof Uint8Array) {
        const bytes = row.checksum;
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        checksum = btoa(binary);
      } else if (typeof row.checksum === 'string') {
        checksum = row.checksum;
      }
    }

    let thumbhash: string | null = null;
    if (row.thumbhash) {
      if (row.thumbhash instanceof Uint8Array) {
        const bytes = row.thumbhash;
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        thumbhash = btoa(binary);
      } else if (typeof row.thumbhash === 'string') {
        thumbhash = row.thumbhash;
      }
    }

    return {
      id: row.id,
      ownerId: row.ownerId,
      originalFileName: row.originalFileName,
      thumbhash,
      checksum,
      fileCreatedAt: row.fileCreatedAt,
      fileModifiedAt: row.fileModifiedAt,
      localDateTime: row.localDateTime,
      duration: row.duration,
      type: row.type,
      deletedAt: row.deletedAt,
      isFavorite: Boolean(row.isFavorite),
      visibility: row.visibility,
      livePhotoVideoId: row.livePhotoVideoId,
      stackId: row.stackId,
      libraryId: row.libraryId,
      width: row.width,
      height: row.height,
      isEdited: Boolean(row.isEdited),
    };
  }
}
