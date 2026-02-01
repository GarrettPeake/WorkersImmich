/**
 * Session repository — Workers/D1-compatible version.
 *
 * Uses Kysely with D1 dialect. No NestJS decorators, no PostgreSQL-specific features.
 * All timestamps are ISO 8601 strings (SQLite TEXT).
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import type { DB, SessionTable } from 'src/schema';

export class SessionRepository {
  constructor(private db: Kysely<DB>) {}

  async cleanup() {
    const ninetyDaysAgo = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const now = new Date().toISOString();

    return this.db
      .deleteFrom('session')
      .where((eb) =>
        eb.or([
          eb('updatedAt', '<=', ninetyDaysAgo),
          eb.and([
            eb('expiresAt', 'is not', null),
            eb('expiresAt', '<=', now),
          ]),
        ]),
      )
      .returning(['id', 'deviceOS', 'deviceType'])
      .execute();
  }

  get(id: string) {
    return this.db
      .selectFrom('session')
      .select(['id', 'expiresAt', 'pinExpiresAt'])
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async isPendingSyncReset(id: string) {
    const result = await this.db
      .selectFrom('session')
      .select(['isPendingSyncReset'])
      .where('id', '=', id)
      .executeTakeFirst();
    return result?.isPendingSyncReset ? true : false;
  }

  getByToken(token: string) {
    const now = new Date().toISOString();

    return this.db
      .selectFrom('session')
      .select([
        'session.id',
        'session.updatedAt',
        'session.pinExpiresAt',
        'session.appVersion',
        'session.userId',
      ])
      .where('session.token', '=', token)
      .where((eb) =>
        eb.or([
          eb('session.expiresAt', 'is', null),
          eb('session.expiresAt', '>', now),
        ]),
      )
      .executeTakeFirst();
  }

  getByUserId(userId: string) {
    const now = new Date().toISOString();

    return this.db
      .selectFrom('session')
      .innerJoin('user', (join) =>
        join
          .onRef('user.id', '=', 'session.userId')
          .on('user.deletedAt', 'is', null),
      )
      .selectAll('session')
      .where('session.userId', '=', userId)
      .where((eb) =>
        eb.or([
          eb('session.expiresAt', 'is', null),
          eb('session.expiresAt', '>', now),
        ]),
      )
      .orderBy('session.updatedAt', 'desc')
      .orderBy('session.createdAt', 'desc')
      .execute();
  }

  create(dto: Insertable<SessionTable>) {
    return this.db
      .insertInto('session')
      .values(dto)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  update(id: string, dto: Updateable<SessionTable>) {
    return this.db
      .updateTable('session')
      .set(dto)
      .where('session.id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string) {
    await this.db.deleteFrom('session').where('id', '=', id).execute();
  }

  async invalidate({
    userId,
    excludeId,
  }: {
    userId: string;
    excludeId?: string;
  }) {
    await this.db
      .deleteFrom('session')
      .where('userId', '=', userId)
      .$if(!!excludeId, (qb) => qb.where('id', '!=', excludeId!))
      .execute();
  }

  async lockAll(userId: string) {
    await this.db
      .updateTable('session')
      .set({ pinExpiresAt: null })
      .where('userId', '=', userId)
      .execute();
  }

  async resetSyncProgress(sessionId: string) {
    // D1 supports transactions via Kysely
    await this.db.transaction().execute((tx) => {
      return Promise.all([
        tx
          .updateTable('session')
          .set({ isPendingSyncReset: 0 })
          .where('id', '=', sessionId)
          .execute(),
        tx
          .deleteFrom('session_sync_checkpoint')
          .where('sessionId', '=', sessionId)
          .execute(),
      ]);
    });
  }
}
