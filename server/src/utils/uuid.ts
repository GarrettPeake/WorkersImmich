/**
 * UUIDv7 generator for application-level UUID generation.
 *
 * In the PostgreSQL schema, `immich_uuid_v7()` was a database function that
 * generated time-ordered UUIDs. In D1/SQLite, we generate them in application
 * code instead.
 *
 * UUIDv7 embeds a Unix timestamp (milliseconds) in the first 48 bits, providing
 * time-ordered uniqueness. The remaining bits come from `crypto.randomUUID()`.
 *
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 *   - First 48 bits: Unix timestamp in milliseconds
 *   - Version nibble: 7 (UUIDv7)
 *   - Remaining bits: random (from crypto.randomUUID)
 */
export function generateUUIDv7(): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();

  // Embed timestamp in the first 48 bits (12 hex chars) for time-ordering
  const hex = timestamp.toString(16).padStart(12, '0');

  // Format: 8-4-4-4-12
  // Replace first 12 hex chars with timestamp, set version nibble to 7
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${uuid.slice(15)}`;
}
