/**
 * SQLite/D1-compatible Kysely helpers.
 *
 * These replace PostgreSQL-specific helpers from `kysely/helpers/postgres`
 * and PostgreSQL-specific functions used in the original Immich codebase.
 *
 * `jsonArrayFrom` and `jsonObjectFrom` are re-exported from Kysely's built-in
 * SQLite helpers, which correctly use `json_group_array()` + `json_object()`
 * with explicit column key-value pairs (NOT `json_object(*)`, which is invalid
 * SQLite syntax).
 *
 * IMPORTANT: When using these with Cloudflare D1, you must also use Kysely's
 * `ParseJSONResultsPlugin` because D1 returns JSON aggregation results as
 * strings rather than parsed JavaScript objects.
 */

export { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/sqlite';

/**
 * Set `updatedAt` to the current ISO 8601 timestamp.
 *
 * In the PostgreSQL schema, this was handled by the `updated_at` trigger.
 * In D1/SQLite, we set it explicitly before every UPDATE.
 *
 * Usage:
 * ```ts
 * await db.updateTable('asset')
 *   .set({ ...changes, ...withUpdatedAt() })
 *   .where('id', '=', assetId)
 *   .execute();
 * ```
 */
export function withUpdatedAt(): { updatedAt: string } {
  return { updatedAt: new Date().toISOString() };
}

/**
 * Set both `updatedAt` and `updateId` for tables that have the updateId column.
 *
 * In the PostgreSQL schema, the `updated_at` trigger also set `updateId`
 * to a new UUIDv7. In D1/SQLite we do this explicitly.
 *
 * @param generateId - A function that generates a UUIDv7 string
 */
export function withUpdateTracking(generateId: () => string): { updatedAt: string; updateId: string } {
  return {
    updatedAt: new Date().toISOString(),
    updateId: generateId(),
  };
}

/**
 * SQLite-compatible replacement for PostgreSQL's `any('{...}'::uuid[])`.
 * For use in `WHERE column IN (...)` queries.
 */
export function inUuids(ids: string[]) {
  return ids;
}

/**
 * In PostgreSQL, `asUuid` casts a string to uuid type.
 * In SQLite, UUIDs are just TEXT, so this is a no-op passthrough.
 */
export function asUuid(id: string): string {
  return id;
}
