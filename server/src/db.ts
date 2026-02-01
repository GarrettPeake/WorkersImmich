import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { DB } from './schema';

export type { DB } from './schema';

/**
 * Create a Kysely instance backed by Cloudflare D1.
 * Call this once per request (or in the Hono app setup) with the D1 binding.
 */
export function createDb(d1: D1Database): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new D1Dialect({ database: d1 }),
  });
}
