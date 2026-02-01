/**
 * API Key repository — Workers/D1-compatible version.
 *
 * Uses Kysely with D1 dialect. No NestJS decorators, no PostgreSQL-specific features.
 * No jsonObjectFrom (PostgreSQL helper) — uses separate queries or joins instead.
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import type { DB, ApiKeyTable } from 'src/schema';

export class ApiKeyRepository {
  constructor(private db: Kysely<DB>) {}

  create(dto: Insertable<ApiKeyTable>) {
    return this.db
      .insertInto('api_key')
      .values(dto)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(userId: string, id: string, dto: Updateable<ApiKeyTable>) {
    return this.db
      .updateTable('api_key')
      .set(dto)
      .where('api_key.userId', '=', userId)
      .where('api_key.id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(userId: string, id: string) {
    await this.db
      .deleteFrom('api_key')
      .where('userId', '=', userId)
      .where('id', '=', id)
      .execute();
  }

  /**
   * Get an API key by its hashed token value, including the associated user.
   * Returns the API key fields + user fields, or undefined if not found.
   */
  async getKey(hashedToken: string) {
    const apiKey = await this.db
      .selectFrom('api_key')
      .select(['api_key.id', 'api_key.permissions', 'api_key.userId'])
      .where('api_key.key', '=', hashedToken)
      .executeTakeFirst();

    if (!apiKey) {
      return undefined;
    }

    const user = await this.db
      .selectFrom('user')
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.isAdmin',
        'user.quotaUsageInBytes',
        'user.quotaSizeInBytes',
      ])
      .where('user.id', '=', apiKey.userId)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!user) {
      return undefined;
    }

    return {
      ...apiKey,
      user: {
        id: user.id,
        isAdmin: Boolean(user.isAdmin),
        name: user.name,
        email: user.email,
        quotaUsageInBytes: user.quotaUsageInBytes ?? 0,
        quotaSizeInBytes: user.quotaSizeInBytes,
      },
    };
  }

  getById(userId: string, id: string) {
    return this.db
      .selectFrom('api_key')
      .selectAll()
      .where('api_key.id', '=', id)
      .where('api_key.userId', '=', userId)
      .executeTakeFirst();
  }

  getByUserId(userId: string) {
    return this.db
      .selectFrom('api_key')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('createdAt', 'desc')
      .execute();
  }
}
