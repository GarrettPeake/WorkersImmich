/**
 * System metadata routes -- Hono sub-app for system metadata.
 *
 * Mounts on `/api/system-metadata` in the main app.
 *
 * Endpoints:
 *   GET  /admin-onboarding         - Get admin onboarding status
 *   POST /admin-onboarding         - Update admin onboarding status
 *   GET  /reverse-geocoding-state  - Get reverse geocoding state
 *   GET  /version-check-state      - Get version check state
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/system-metadata/admin-onboarding
app.get(
  '/admin-onboarding',
  authMiddleware({ admin: true, permission: Permission.SystemMetadataRead }),
  async (c) => {
    const ctx = c.get('ctx');
    const row = await ctx.db
      .selectFrom('system_metadata')
      .select('value')
      .where('key', '=', 'admin-onboarding')
      .executeTakeFirst();

    if (!row) {
      return c.json({ isOnboarded: false });
    }

    const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return c.json({ isOnboarded: Boolean(value.isOnboarded) });
  },
);

// POST /api/system-metadata/admin-onboarding
app.post(
  '/admin-onboarding',
  authMiddleware({ admin: true, permission: Permission.SystemMetadataUpdate }),
  async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json<{ isOnboarded: boolean }>();

    const data = JSON.stringify({ isOnboarded: Boolean(body.isOnboarded) });

    // Upsert into system_metadata
    await ctx.db
      .insertInto('system_metadata')
      .values({ key: 'admin-onboarding', value: data })
      .onConflict((oc) => oc.columns(['key']).doUpdateSet({ value: data }))
      .execute();

    return c.body(null, 204);
  },
);

// GET /api/system-metadata/reverse-geocoding-state
app.get(
  '/reverse-geocoding-state',
  authMiddleware({ admin: true, permission: Permission.SystemMetadataRead }),
  async (c) => {
    const ctx = c.get('ctx');
    const row = await ctx.db
      .selectFrom('system_metadata')
      .select('value')
      .where('key', '=', 'reverse-geocoding-state')
      .executeTakeFirst();

    if (!row) {
      return c.json({ lastUpdate: null, lastImportFileName: null });
    }

    const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return c.json(value);
  },
);

// GET /api/system-metadata/version-check-state
app.get(
  '/version-check-state',
  authMiddleware({ admin: true, permission: Permission.SystemMetadataRead }),
  async (c) => {
    const ctx = c.get('ctx');
    const row = await ctx.db
      .selectFrom('system_metadata')
      .select('value')
      .where('key', '=', 'version-check-state')
      .executeTakeFirst();

    if (!row) {
      return c.json({ checkedAt: null, releaseVersion: null });
    }

    const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return c.json(value);
  },
);

export default app;
