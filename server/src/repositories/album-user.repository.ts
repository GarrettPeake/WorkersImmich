/**
 * Album User repository -- Workers/D1-compatible version.
 *
 * No @Injectable, @InjectKysely, @GenerateSql decorators.
 * No ::uuid casts. Plain Kysely with D1 dialect.
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import type { DB, AlbumUserTable } from 'src/schema';

export type AlbumPermissionId = {
  albumId: string;
  userId: string;
};

export class AlbumUserRepository {
  constructor(private db: Kysely<DB>) {}

  async create(albumUser: Insertable<AlbumUserTable>) {
    await this.db.insertInto('album_user').values(albumUser).execute();

    return this.db
      .selectFrom('album_user')
      .select(['userId', 'albumId', 'role'])
      .where('userId', '=', albumUser.userId)
      .where('albumId', '=', albumUser.albumId)
      .executeTakeFirstOrThrow();
  }

  async update({ userId, albumId }: AlbumPermissionId, dto: Updateable<AlbumUserTable>) {
    await this.db
      .updateTable('album_user')
      .set(dto)
      .where('userId', '=', userId)
      .where('albumId', '=', albumId)
      .execute();

    return this.db
      .selectFrom('album_user')
      .selectAll()
      .where('userId', '=', userId)
      .where('albumId', '=', albumId)
      .executeTakeFirstOrThrow();
  }

  async delete({ userId, albumId }: AlbumPermissionId): Promise<void> {
    await this.db
      .deleteFrom('album_user')
      .where('userId', '=', userId)
      .where('albumId', '=', albumId)
      .execute();
  }
}
