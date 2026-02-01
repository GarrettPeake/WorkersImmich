/**
 * Access repository — Workers/D1-compatible version.
 *
 * Permission checking layer that determines if a user/shared-link
 * can access a specific resource.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No ::uuid casts
 * - No PostgreSQL array syntax (any(), unnest())
 * - No jsonObjectFrom (PostgreSQL helper)
 * - Uses `IN (...)` instead of `= any(array[...]::uuid[])`
 * - Uses `sql.lit()` for enum comparisons where needed
 */

import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { AlbumUserRole, AssetVisibility } from 'src/enum';
import type { DB } from 'src/schema';

// ---------------------------------------------------------------------------
// Helper: chunk large sets to avoid SQLite parameter limits
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 500;

async function chunkedCheck<T>(
  ids: Set<string>,
  fn: (chunk: Set<string>) => Promise<Set<T>>,
): Promise<Set<T>> {
  if (ids.size <= CHUNK_SIZE) {
    return fn(ids);
  }

  const result = new Set<T>();
  const arr = [...ids];
  for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
    const chunk = new Set(arr.slice(i, i + CHUNK_SIZE));
    const partial = await fn(chunk);
    for (const id of partial) {
      result.add(id);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Access sub-classes
// ---------------------------------------------------------------------------

class ActivityAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, activityIds: Set<string>) {
    if (activityIds.size === 0) return new Set<string>();

    return chunkedCheck(activityIds, async (ids) =>
      this.db
        .selectFrom('activity')
        .select('activity.id')
        .where('activity.id', 'in', [...ids])
        .where('activity.userId', '=', userId)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }

  async checkAlbumOwnerAccess(userId: string, activityIds: Set<string>) {
    if (activityIds.size === 0) return new Set<string>();

    return chunkedCheck(activityIds, async (ids) =>
      this.db
        .selectFrom('activity')
        .select('activity.id')
        .leftJoin('album', (join) =>
          join
            .onRef('activity.albumId', '=', 'album.id')
            .on('album.deletedAt', 'is', null),
        )
        .where('activity.id', 'in', [...ids])
        .where('album.ownerId', '=', userId)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }

  async checkCreateAccess(userId: string, albumIds: Set<string>) {
    if (albumIds.size === 0) return new Set<string>();

    return chunkedCheck(albumIds, async (ids) =>
      this.db
        .selectFrom('album')
        .select('album.id')
        .leftJoin('album_user as albumUsers', 'albumUsers.albumId', 'album.id')
        .leftJoin('user', (join) =>
          join
            .onRef('user.id', '=', 'albumUsers.userId')
            .on('user.deletedAt', 'is', null),
        )
        .where('album.id', 'in', [...ids])
        .where('album.isActivityEnabled', '=', 1)
        .where((eb) =>
          eb.or([
            eb('album.ownerId', '=', userId),
            eb('user.id', '=', userId),
          ]),
        )
        .where('album.deletedAt', 'is', null)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }
}

class AlbumAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, albumIds: Set<string>) {
    if (albumIds.size === 0) return new Set<string>();

    return chunkedCheck(albumIds, async (ids) =>
      this.db
        .selectFrom('album')
        .select('album.id')
        .where('album.id', 'in', [...ids])
        .where('album.ownerId', '=', userId)
        .where('album.deletedAt', 'is', null)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }

  async checkSharedAlbumAccess(
    userId: string,
    albumIds: Set<string>,
    access: AlbumUserRole,
  ) {
    if (albumIds.size === 0) return new Set<string>();

    const accessRole =
      access === AlbumUserRole.Editor
        ? [AlbumUserRole.Editor]
        : [AlbumUserRole.Editor, AlbumUserRole.Viewer];

    return chunkedCheck(albumIds, async (ids) =>
      this.db
        .selectFrom('album')
        .select('album.id')
        .leftJoin('album_user', 'album_user.albumId', 'album.id')
        .leftJoin('user', (join) =>
          join
            .onRef('user.id', '=', 'album_user.userId')
            .on('user.deletedAt', 'is', null),
        )
        .where('album.id', 'in', [...ids])
        .where('album.deletedAt', 'is', null)
        .where('user.id', '=', userId)
        .where('album_user.role', 'in', [...accessRole])
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }

  async checkSharedLinkAccess(sharedLinkId: string, albumIds: Set<string>) {
    if (albumIds.size === 0) return new Set<string>();

    return chunkedCheck(albumIds, async (ids) =>
      this.db
        .selectFrom('shared_link')
        .select('shared_link.albumId')
        .where('shared_link.id', '=', sharedLinkId)
        .where('shared_link.albumId', 'in', [...ids])
        .execute()
        .then(
          (rows) =>
            new Set(
              rows.flatMap((r) => (r.albumId ? [r.albumId] : [])),
            ),
        ),
    );
  }
}

class AssetAccess {
  constructor(private db: Kysely<DB>) {}

  async checkAlbumAccess(userId: string, assetIds: Set<string>) {
    if (assetIds.size === 0) return new Set<string>();

    return chunkedCheck(assetIds, async (ids) => {
      const idArray = [...ids];

      const rows = await this.db
        .selectFrom('album')
        .innerJoin(
          'album_asset as albumAssets',
          'album.id',
          'albumAssets.albumId',
        )
        .innerJoin('asset', (join) =>
          join
            .onRef('asset.id', '=', 'albumAssets.assetId')
            .on('asset.deletedAt', 'is', null),
        )
        .leftJoin(
          'album_user as albumUsers',
          'albumUsers.albumId',
          'album.id',
        )
        .leftJoin('user', (join) =>
          join
            .onRef('user.id', '=', 'albumUsers.userId')
            .on('user.deletedAt', 'is', null),
        )
        .select(['asset.id', 'asset.livePhotoVideoId'])
        .where((eb) =>
          eb.or([
            eb('asset.id', 'in', idArray),
            eb('asset.livePhotoVideoId', 'in', idArray),
          ]),
        )
        .where((eb) =>
          eb.or([
            eb('album.ownerId', '=', userId),
            eb('user.id', '=', userId),
          ]),
        )
        .where('album.deletedAt', 'is', null)
        .execute();

      const allowedIds = new Set<string>();
      for (const row of rows) {
        if (row.id && ids.has(row.id)) {
          allowedIds.add(row.id);
        }
        if (row.livePhotoVideoId && ids.has(row.livePhotoVideoId)) {
          allowedIds.add(row.livePhotoVideoId);
        }
      }
      return allowedIds;
    });
  }

  async checkOwnerAccess(
    userId: string,
    assetIds: Set<string>,
    hasElevatedPermission: boolean | undefined,
  ) {
    if (assetIds.size === 0) return new Set<string>();

    return chunkedCheck(assetIds, async (ids) =>
      this.db
        .selectFrom('asset')
        .select('asset.id')
        .where('asset.id', 'in', [...ids])
        .where('asset.ownerId', '=', userId)
        .$if(!hasElevatedPermission, (eb) =>
          eb.where('asset.visibility', '!=', AssetVisibility.Locked),
        )
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }

  async checkPartnerAccess(userId: string, assetIds: Set<string>) {
    if (assetIds.size === 0) return new Set<string>();

    return chunkedCheck(assetIds, async (ids) =>
      this.db
        .selectFrom('partner')
        .innerJoin('user as sharedBy', (join) =>
          join
            .onRef('sharedBy.id', '=', 'partner.sharedById')
            .on('sharedBy.deletedAt', 'is', null),
        )
        .innerJoin('asset', (join) =>
          join
            .onRef('asset.ownerId', '=', 'sharedBy.id')
            .on('asset.deletedAt', 'is', null),
        )
        .select('asset.id')
        .where('partner.sharedWithId', '=', userId)
        .where((eb) =>
          eb.or([
            eb('asset.visibility', '=', sql.lit(AssetVisibility.Timeline)),
            eb('asset.visibility', '=', sql.lit(AssetVisibility.Hidden)),
          ]),
        )
        .where('asset.id', 'in', [...ids])
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }

  async checkSharedLinkAccess(sharedLinkId: string, assetIds: Set<string>) {
    if (assetIds.size === 0) return new Set<string>();

    return chunkedCheck(assetIds, async (ids) => {
      const idArray = [...ids];

      const rows = await this.db
        .selectFrom('shared_link')
        .leftJoin('album', (join) =>
          join
            .onRef('album.id', '=', 'shared_link.albumId')
            .on('album.deletedAt', 'is', null),
        )
        .leftJoin(
          'shared_link_asset',
          'shared_link_asset.sharedLinkId',
          'shared_link.id',
        )
        .leftJoin('asset', (join) =>
          join
            .onRef('asset.id', '=', 'shared_link_asset.assetId')
            .on('asset.deletedAt', 'is', null),
        )
        .leftJoin('album_asset', 'album_asset.albumId', 'album.id')
        .leftJoin('asset as albumAssets', (join) =>
          join
            .onRef('albumAssets.id', '=', 'album_asset.assetId')
            .on('albumAssets.deletedAt', 'is', null),
        )
        .select([
          'asset.id as assetId',
          'asset.livePhotoVideoId as assetLivePhotoVideoId',
          'albumAssets.id as albumAssetId',
          'albumAssets.livePhotoVideoId as albumAssetLivePhotoVideoId',
        ])
        .where('shared_link.id', '=', sharedLinkId)
        .where((eb) =>
          eb.or([
            eb('asset.id', 'in', idArray),
            eb('asset.livePhotoVideoId', 'in', idArray),
            eb('albumAssets.id', 'in', idArray),
            eb('albumAssets.livePhotoVideoId', 'in', idArray),
          ]),
        )
        .execute();

      const allowedIds = new Set<string>();
      for (const row of rows) {
        if (row.assetId && ids.has(row.assetId)) {
          allowedIds.add(row.assetId);
        }
        if (
          row.assetLivePhotoVideoId &&
          ids.has(row.assetLivePhotoVideoId)
        ) {
          allowedIds.add(row.assetLivePhotoVideoId);
        }
        if (row.albumAssetId && ids.has(row.albumAssetId)) {
          allowedIds.add(row.albumAssetId);
        }
        if (
          row.albumAssetLivePhotoVideoId &&
          ids.has(row.albumAssetLivePhotoVideoId)
        ) {
          allowedIds.add(row.albumAssetLivePhotoVideoId);
        }
      }
      return allowedIds;
    });
  }
}

class AuthDeviceAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, deviceIds: Set<string>) {
    if (deviceIds.size === 0) return new Set<string>();

    return chunkedCheck(deviceIds, async (ids) =>
      this.db
        .selectFrom('session')
        .select('session.id')
        .where('session.userId', '=', userId)
        .where('session.id', 'in', [...ids])
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }
}

class NotificationAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, notificationIds: Set<string>) {
    if (notificationIds.size === 0) return new Set<string>();

    return chunkedCheck(notificationIds, async (ids) =>
      this.db
        .selectFrom('notification' as any)
        .select('notification.id' as any)
        .where('notification.id' as any, 'in', [...ids])
        .where('notification.userId' as any, '=', userId)
        .execute()
        .then((rows: any[]) => new Set(rows.map((r: any) => r.id as string))),
    );
  }
}

class SessionAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, sessionIds: Set<string>) {
    if (sessionIds.size === 0) return new Set<string>();

    return chunkedCheck(sessionIds, async (ids) =>
      this.db
        .selectFrom('session')
        .select('session.id')
        .where('session.id', 'in', [...ids])
        .where('session.userId', '=', userId)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }
}

class StackAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, stackIds: Set<string>) {
    if (stackIds.size === 0) return new Set<string>();

    return chunkedCheck(stackIds, async (ids) =>
      this.db
        .selectFrom('stack')
        .select('stack.id')
        .where('stack.id', 'in', [...ids])
        .where('stack.ownerId', '=', userId)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }
}

class TimelineAccess {
  constructor(private db: Kysely<DB>) {}

  async checkPartnerAccess(userId: string, partnerIds: Set<string>) {
    if (partnerIds.size === 0) return new Set<string>();

    return chunkedCheck(partnerIds, async (ids) =>
      this.db
        .selectFrom('partner')
        .select('partner.sharedById')
        .where('partner.sharedById', 'in', [...ids])
        .where('partner.sharedWithId', '=', userId)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.sharedById))),
    );
  }
}

class MemoryAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, memoryIds: Set<string>) {
    if (memoryIds.size === 0) return new Set<string>();

    return chunkedCheck(memoryIds, async (ids) =>
      this.db
        .selectFrom('memory')
        .select('memory.id')
        .where('memory.id', 'in', [...ids])
        .where('memory.ownerId', '=', userId)
        .where('memory.deletedAt', 'is', null)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }
}

class PersonAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, personIds: Set<string>) {
    if (personIds.size === 0) return new Set<string>();

    // person table may not exist in D1 yet, use raw query with error handling
    return chunkedCheck(personIds, async (ids) => {
      try {
        const rows = await this.db
          .selectFrom('person' as any)
          .select('person.id' as any)
          .where('person.id' as any, 'in', [...ids])
          .where('person.ownerId' as any, '=', userId)
          .execute();
        return new Set((rows as any[]).map((r: any) => r.id as string));
      } catch {
        return new Set<string>();
      }
    });
  }

  async checkFaceOwnerAccess(userId: string, assetFaceIds: Set<string>) {
    if (assetFaceIds.size === 0) return new Set<string>();

    return chunkedCheck(assetFaceIds, async (ids) => {
      try {
        const rows = await this.db
          .selectFrom('asset_face' as any)
          .select('asset_face.id' as any)
          .leftJoin('asset', (join: any) =>
            join
              .onRef('asset.id', '=', 'asset_face.assetId')
              .on('asset.deletedAt', 'is', null),
          )
          .where('asset_face.id' as any, 'in', [...ids])
          .where('asset.ownerId', '=', userId)
          .execute();
        return new Set((rows as any[]).map((r: any) => r.id as string));
      } catch {
        return new Set<string>();
      }
    });
  }
}

class PartnerAccess {
  constructor(private db: Kysely<DB>) {}

  async checkUpdateAccess(userId: string, partnerIds: Set<string>) {
    if (partnerIds.size === 0) return new Set<string>();

    return chunkedCheck(partnerIds, async (ids) =>
      this.db
        .selectFrom('partner')
        .select('partner.sharedById')
        .where('partner.sharedById', 'in', [...ids])
        .where('partner.sharedWithId', '=', userId)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.sharedById))),
    );
  }
}

class TagAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, tagIds: Set<string>) {
    if (tagIds.size === 0) return new Set<string>();

    return chunkedCheck(tagIds, async (ids) =>
      this.db
        .selectFrom('tag')
        .select('tag.id')
        .where('tag.id', 'in', [...ids])
        .where('tag.userId', '=', userId)
        .execute()
        .then((rows) => new Set(rows.map((r) => r.id))),
    );
  }
}

class WorkflowAccess {
  constructor(private db: Kysely<DB>) {}

  async checkOwnerAccess(userId: string, workflowIds: Set<string>) {
    if (workflowIds.size === 0) return new Set<string>();

    // workflow table may not exist in D1 schema yet
    return chunkedCheck(workflowIds, async (ids) => {
      try {
        const rows = await this.db
          .selectFrom('workflow' as any)
          .select('workflow.id' as any)
          .where('workflow.id' as any, 'in', [...ids])
          .where('workflow.ownerId' as any, '=', userId)
          .execute();
        return new Set((rows as any[]).map((r: any) => r.id as string));
      } catch {
        return new Set<string>();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Main AccessRepository
// ---------------------------------------------------------------------------

export class AccessRepository {
  activity: ActivityAccess;
  album: AlbumAccess;
  asset: AssetAccess;
  authDevice: AuthDeviceAccess;
  memory: MemoryAccess;
  notification: NotificationAccess;
  person: PersonAccess;
  partner: PartnerAccess;
  session: SessionAccess;
  stack: StackAccess;
  tag: TagAccess;
  timeline: TimelineAccess;
  workflow: WorkflowAccess;

  constructor(db: Kysely<DB>) {
    this.activity = new ActivityAccess(db);
    this.album = new AlbumAccess(db);
    this.asset = new AssetAccess(db);
    this.authDevice = new AuthDeviceAccess(db);
    this.memory = new MemoryAccess(db);
    this.notification = new NotificationAccess(db);
    this.person = new PersonAccess(db);
    this.partner = new PartnerAccess(db);
    this.session = new SessionAccess(db);
    this.stack = new StackAccess(db);
    this.tag = new TagAccess(db);
    this.timeline = new TimelineAccess(db);
    this.workflow = new WorkflowAccess(db);
  }
}
