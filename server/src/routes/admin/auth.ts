/**
 * Admin auth routes -- Hono sub-app for admin auth operations.
 *
 * Mounts on `/api/admin/auth` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../hono';
import { authMiddleware } from '../../middleware/auth';
import { Permission } from '../../enum';

const app = new Hono<AppEnv>();

// POST /api/admin/auth/unlink-all -- Unlink all OAuth accounts
app.post(
  '/unlink-all',
  authMiddleware({ admin: true, permission: Permission.AdminAuthUnlinkAll }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    await services.authAdmin.unlinkAll(auth);
    return c.body(null, 204);
  },
);

export default app;
