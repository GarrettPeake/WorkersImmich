/**
 * User repository -- Workers/D1-compatible version.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No jsonArrayFrom from kysely/helpers/postgres
 * - No @Injectable, @InjectKysely, @GenerateSql decorators
 * - No ::uuid casts (asUuid removed)
 * - No luxon DateTime -- use plain Date/string
 * - filterWhere replaced with CASE WHEN SUM pattern for SQLite
 * - Separate queries for metadata instead of nested json builders
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import { sql } from 'kysely';
import type { DB, UserTable } from 'src/schema';

export interface UserListFilter {
  id?: string;
  withDeleted?: boolean;
}

export interface UserStatsQueryResponse {
  userId: string;
  userName: string;
  photos: number;
  videos: number;
  usage: number;
  usagePhotos: number;
  usageVideos: number;
  quotaSizeInBytes: number | null;
}

export interface UserFindOptions {
  withDeleted?: boolean;
}

export class UserRepository {
  constructor(private db: Kysely<DB>) {}

  /**
   * Convert SQLite integer booleans (0/1) to JS booleans for user rows.
   */
  private normalizeBooleans<T extends Record<string, unknown>>(user: T): T {
    return {
      ...user,
      isAdmin: Boolean((user as any).isAdmin),
      shouldChangePassword: Boolean((user as any).shouldChangePassword),
    } as T;
  }

  async get(userId: string, options: UserFindOptions) {
    options = options || {};

    const user = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.id', '=', userId)
      .$if(!options.withDeleted, (eb) => eb.where('user.deletedAt', 'is', null))
      .executeTakeFirst();

    if (!user) return undefined;

    const metadata = await this.getMetadata(userId);
    return { ...this.normalizeBooleans(user), metadata };
  }

  getMetadata(userId: string) {
    return this.db
      .selectFrom('user_metadata')
      .select(['key', 'value'])
      .where('user_metadata.userId', '=', userId)
      .execute();
  }

  async getAdmin() {
    const user = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.isAdmin', '=', 1)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!user) return undefined;

    const metadata = await this.getMetadata(user.id);
    return { ...this.normalizeBooleans(user), metadata };
  }

  async hasAdmin(): Promise<boolean> {
    const admin = await this.db
      .selectFrom('user')
      .select('user.id')
      .where('user.isAdmin', '=', 1)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();

    return !!admin;
  }

  getForPinCode(id: string) {
    return this.db
      .selectFrom('user')
      .select(['user.pinCode', 'user.password'])
      .where('user.id', '=', id)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirstOrThrow();
  }

  getForChangePassword(id: string) {
    return this.db
      .selectFrom('user')
      .select(['user.id', 'user.password'])
      .where('user.id', '=', id)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirstOrThrow();
  }

  async getByEmail(email: string, options?: { withPassword?: boolean }) {
    let query = this.db
      .selectFrom('user')
      .selectAll()
      .where('email', '=', email)
      .where('user.deletedAt', 'is', null);

    const user = await query.executeTakeFirst();
    if (!user) return undefined;

    const metadata = await this.getMetadata(user.id);
    return { ...this.normalizeBooleans(user), metadata };
  }

  async getByStorageLabel(storageLabel: string) {
    return this.db
      .selectFrom('user')
      .selectAll()
      .where('user.storageLabel', '=', storageLabel)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async getByOAuthId(oauthId: string) {
    const user = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.oauthId', '=', oauthId)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!user) return undefined;

    const metadata = await this.getMetadata(user.id);
    return { ...this.normalizeBooleans(user), metadata };
  }

  async getList({ id, withDeleted }: UserListFilter = {}) {
    let query = this.db
      .selectFrom('user')
      .selectAll();

    if (!withDeleted) {
      query = query.where('user.deletedAt', 'is', null);
    }
    if (id) {
      query = query.where('user.id', '=', id);
    }

    const users = await query.orderBy('createdAt', 'desc').execute();

    return Promise.all(
      users.map(async (user) => {
        const metadata = await this.getMetadata(user.id);
        return { ...this.normalizeBooleans(user), metadata };
      }),
    );
  }

  async create(dto: Insertable<UserTable>) {
    await this.db.insertInto('user').values(dto).execute();

    // Fetch the created user
    const user = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.email', '=', dto.email)
      .executeTakeFirstOrThrow();

    const metadata = await this.getMetadata(user.id);
    return { ...this.normalizeBooleans(user), metadata };
  }

  async update(id: string, dto: Updateable<UserTable>) {
    await this.db
      .updateTable('user')
      .set(dto)
      .where('user.id', '=', id)
      .where('user.deletedAt', 'is', null)
      .execute();

    const user = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.id', '=', id)
      .executeTakeFirstOrThrow();

    const metadata = await this.getMetadata(user.id);
    return { ...this.normalizeBooleans(user), metadata };
  }

  async updateAll(dto: Updateable<UserTable>) {
    await this.db.updateTable('user').set(dto).execute();
  }

  async restore(id: string) {
    await this.db
      .updateTable('user')
      .set({ status: 'active', deletedAt: null })
      .where('user.id', '=', id)
      .execute();

    const user = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.id', '=', id)
      .executeTakeFirstOrThrow();

    const metadata = await this.getMetadata(user.id);
    return { ...this.normalizeBooleans(user), metadata };
  }

  async upsertMetadata(id: string, { key, value }: { key: string; value: string }) {
    const existing = await this.db
      .selectFrom('user_metadata')
      .select('key')
      .where('userId', '=', id)
      .where('key', '=', key)
      .executeTakeFirst();

    if (existing) {
      await this.db
        .updateTable('user_metadata')
        .set({ value })
        .where('userId', '=', id)
        .where('key', '=', key)
        .execute();
    } else {
      await this.db
        .insertInto('user_metadata')
        .values({ userId: id, key, value })
        .execute();
    }
  }

  async deleteMetadata(id: string, key: string) {
    await this.db
      .deleteFrom('user_metadata')
      .where('userId', '=', id)
      .where('key', '=', key)
      .execute();
  }

  delete(user: { id: string }, hard?: boolean) {
    return hard
      ? this.db.deleteFrom('user').where('id', '=', user.id).execute()
      : this.db
          .updateTable('user')
          .set({ deletedAt: new Date().toISOString() })
          .where('id', '=', user.id)
          .execute();
  }

  async getUserStats(): Promise<UserStatsQueryResponse[]> {
    const users = await this.db
      .selectFrom('user')
      .selectAll()
      .where('user.deletedAt', 'is', null)
      .orderBy('user.createdAt', 'asc')
      .execute();

    const stats: UserStatsQueryResponse[] = [];
    for (const user of users) {
      // Get photo count
      const photoResult = await this.db
        .selectFrom('asset')
        .select((eb) => eb.fn.count('asset.id').as('count'))
        .where('asset.ownerId', '=', user.id)
        .where('asset.deletedAt', 'is', null)
        .where('asset.type', '=', 'IMAGE')
        .where('asset.visibility', '!=', 'hidden')
        .executeTakeFirst();

      // Get video count
      const videoResult = await this.db
        .selectFrom('asset')
        .select((eb) => eb.fn.count('asset.id').as('count'))
        .where('asset.ownerId', '=', user.id)
        .where('asset.deletedAt', 'is', null)
        .where('asset.type', '=', 'VIDEO')
        .where('asset.visibility', '!=', 'hidden')
        .executeTakeFirst();

      // Get usage
      const usageResult = await this.db
        .selectFrom('asset')
        .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
        .select((eb) => eb.fn.coalesce(eb.fn.sum('asset_exif.fileSizeInByte'), sql`0`).as('usage'))
        .where('asset.ownerId', '=', user.id)
        .where('asset.deletedAt', 'is', null)
        .where('asset.libraryId', 'is', null)
        .executeTakeFirst();

      stats.push({
        userId: user.id,
        userName: user.name as string,
        photos: Number(photoResult?.count ?? 0),
        videos: Number(videoResult?.count ?? 0),
        usage: Number(usageResult?.usage ?? 0),
        usagePhotos: 0,
        usageVideos: 0,
        quotaSizeInBytes: user.quotaSizeInBytes,
      });
    }

    return stats;
  }

  async getCount(): Promise<number> {
    const result = await this.db
      .selectFrom('user')
      .select((eb) => eb.fn.count('user.id').as('count'))
      .where('user.deletedAt', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async updateUsage(id: string, delta: number): Promise<void> {
    await this.db
      .updateTable('user')
      .set({
        quotaUsageInBytes: sql`"quotaUsageInBytes" + ${delta}`,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', id)
      .where('user.deletedAt', 'is', null)
      .execute();
  }
}
