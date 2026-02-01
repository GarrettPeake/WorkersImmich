/**
 * Partner repository -- Workers/D1-compatible version.
 *
 * Converted from PostgreSQL to D1/SQLite-compatible Kysely queries.
 * Key changes:
 * - No jsonObjectFrom from kysely/helpers/postgres
 * - No @Injectable, @InjectKysely, @GenerateSql decorators
 * - Separate queries to load user relations
 */

import type { Insertable, Kysely, Updateable } from 'kysely';
import type { DB, PartnerTable } from 'src/schema';

export interface PartnerIds {
  sharedById: string;
  sharedWithId: string;
}

export class PartnerRepository {
  constructor(private db: Kysely<DB>) {}

  async getAll(userId: string) {
    const partners = await this.db
      .selectFrom('partner')
      .innerJoin('user as sharedBy', (join) =>
        join.onRef('partner.sharedById', '=', 'sharedBy.id').on('sharedBy.deletedAt', 'is', null),
      )
      .innerJoin('user as sharedWith', (join) =>
        join.onRef('partner.sharedWithId', '=', 'sharedWith.id').on('sharedWith.deletedAt', 'is', null),
      )
      .selectAll('partner')
      .where((eb) =>
        eb.or([eb('sharedWithId', '=', userId), eb('sharedById', '=', userId)]),
      )
      .execute();

    return this.enrichPartners(partners);
  }

  async get({ sharedWithId, sharedById }: PartnerIds) {
    const partner = await this.db
      .selectFrom('partner')
      .innerJoin('user as sharedBy', (join) =>
        join.onRef('partner.sharedById', '=', 'sharedBy.id').on('sharedBy.deletedAt', 'is', null),
      )
      .innerJoin('user as sharedWith', (join) =>
        join.onRef('partner.sharedWithId', '=', 'sharedWith.id').on('sharedWith.deletedAt', 'is', null),
      )
      .selectAll('partner')
      .where('sharedWithId', '=', sharedWithId)
      .where('sharedById', '=', sharedById)
      .executeTakeFirst();

    if (!partner) return undefined;

    const [sharedBy, sharedWith] = await Promise.all([
      this.db.selectFrom('user').selectAll().where('id', '=', partner.sharedById).executeTakeFirst(),
      this.db.selectFrom('user').selectAll().where('id', '=', partner.sharedWithId).executeTakeFirst(),
    ]);

    return { ...partner, sharedBy, sharedWith };
  }

  async create(values: Insertable<PartnerTable>) {
    await this.db.insertInto('partner').values(values).execute();

    const partner = await this.db
      .selectFrom('partner')
      .selectAll()
      .where('sharedById', '=', values.sharedById)
      .where('sharedWithId', '=', values.sharedWithId)
      .executeTakeFirstOrThrow();

    const [sharedBy, sharedWith] = await Promise.all([
      this.db.selectFrom('user').selectAll().where('id', '=', partner.sharedById).executeTakeFirst(),
      this.db.selectFrom('user').selectAll().where('id', '=', partner.sharedWithId).executeTakeFirst(),
    ]);

    return { ...partner, sharedBy, sharedWith };
  }

  async update({ sharedWithId, sharedById }: PartnerIds, values: Updateable<PartnerTable>) {
    await this.db
      .updateTable('partner')
      .set(values)
      .where('sharedWithId', '=', sharedWithId)
      .where('sharedById', '=', sharedById)
      .execute();

    const partner = await this.db
      .selectFrom('partner')
      .selectAll()
      .where('sharedWithId', '=', sharedWithId)
      .where('sharedById', '=', sharedById)
      .executeTakeFirstOrThrow();

    const [sharedBy, sharedWith] = await Promise.all([
      this.db.selectFrom('user').selectAll().where('id', '=', partner.sharedById).executeTakeFirst(),
      this.db.selectFrom('user').selectAll().where('id', '=', partner.sharedWithId).executeTakeFirst(),
    ]);

    return { ...partner, sharedBy, sharedWith };
  }

  async remove({ sharedWithId, sharedById }: PartnerIds) {
    await this.db
      .deleteFrom('partner')
      .where('sharedWithId', '=', sharedWithId)
      .where('sharedById', '=', sharedById)
      .execute();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async enrichPartners(partners: any[]) {
    return Promise.all(
      partners.map(async (partner) => {
        const [sharedBy, sharedWith] = await Promise.all([
          this.db.selectFrom('user').selectAll().where('id', '=', partner.sharedById).executeTakeFirst(),
          this.db.selectFrom('user').selectAll().where('id', '=', partner.sharedWithId).executeTakeFirst(),
        ]);
        return { ...partner, sharedBy, sharedWith };
      }),
    );
  }
}
