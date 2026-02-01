/**
 * Activity repository -- Workers/D1-compatible version.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No jsonObjectFrom from kysely/helpers/postgres
 * - No LATERAL JOIN -- use separate queries
 * - No RETURNING with expression builders -- use separate select
 * - No @Injectable, @InjectKysely, @GenerateSql decorators
 * - No ::uuid casts (asUuid removed)
 * - filterWhere replaced with CASE WHEN SUM pattern for SQLite
 */

import type { Insertable, Kysely } from 'kysely';
import { sql } from 'kysely';
import type { DB, ActivityTable } from 'src/schema';

export interface ActivitySearch {
  albumId?: string;
  assetId?: string | null;
  userId?: string;
  isLiked?: boolean;
}

export class ActivityRepository {
  constructor(private db: Kysely<DB>) {}

  async search(options: ActivitySearch) {
    const { userId, assetId, albumId, isLiked } = options;

    let query = this.db
      .selectFrom('activity')
      .selectAll('activity')
      .innerJoin('user', (join) =>
        join.onRef('user.id', '=', 'activity.userId').on('user.deletedAt', 'is', null),
      )
      .leftJoin('asset', 'asset.id', 'activity.assetId');

    if (userId) {
      query = query.where('activity.userId', '=', userId);
    }
    if (assetId === null) {
      query = query.where('activity.assetId', 'is', null);
    } else if (assetId) {
      query = query.where('activity.assetId', '=', assetId);
    }
    if (albumId) {
      query = query.where('activity.albumId', '=', albumId);
    }
    if (isLiked !== undefined) {
      query = query.where('activity.isLiked', '=', isLiked ? 1 : 0);
    }

    const activities = await query
      .where((eb) =>
        eb.or([
          eb('asset.deletedAt', 'is', null),
          eb('asset.id', 'is', null),
        ]),
      )
      .orderBy('activity.createdAt', 'asc')
      .execute();

    // Enrich with user objects
    return Promise.all(
      activities.map(async (activity) => {
        const user = await this.db
          .selectFrom('user')
          .selectAll()
          .where('user.id', '=', activity.userId)
          .executeTakeFirst();
        return { ...activity, user };
      }),
    );
  }

  async create(activity: Insertable<ActivityTable>) {
    await this.db.insertInto('activity').values(activity).execute();

    // D1 doesn't support RETURNING with expressions, so fetch separately
    const created = await this.db
      .selectFrom('activity')
      .selectAll()
      .where('activity.userId', '=', activity.userId)
      .where('activity.albumId', '=', activity.albumId)
      .orderBy('activity.createdAt', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow();

    const user = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.id', '=', created.userId)
      .executeTakeFirst();

    return { ...created, user };
  }

  async delete(id: string) {
    await this.db.deleteFrom('activity').where('id', '=', id).execute();
  }

  async getStatistics({
    albumId,
    assetId,
  }: {
    albumId: string;
    assetId?: string;
  }): Promise<{ comments: number; likes: number }> {
    let query = this.db
      .selectFrom('activity')
      .innerJoin('user', (join) =>
        join.onRef('user.id', '=', 'activity.userId').on('user.deletedAt', 'is', null),
      )
      .leftJoin('asset', 'asset.id', 'activity.assetId')
      .where('activity.albumId', '=', albumId)
      .where((eb) =>
        eb.or([
          eb.and([
            eb('asset.deletedAt', 'is', null),
            eb('asset.visibility', '!=', 'locked'),
          ]),
          eb('asset.id', 'is', null),
        ]),
      );

    if (assetId) {
      query = query.where('activity.assetId', '=', assetId);
    }

    // SQLite doesn't support filterWhere, use CASE WHEN SUM
    const result = await query
      .select(
        sql<number>`COALESCE(SUM(CASE WHEN activity."isLiked" = 0 THEN 1 ELSE 0 END), 0)`.as('comments'),
      )
      .select(
        sql<number>`COALESCE(SUM(CASE WHEN activity."isLiked" = 1 THEN 1 ELSE 0 END), 0)`.as('likes'),
      )
      .executeTakeFirstOrThrow();

    return {
      comments: Number(result.comments),
      likes: Number(result.likes),
    };
  }
}
