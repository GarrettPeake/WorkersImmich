/**
 * Trash routes -- Hono sub-app for trash management.
 *
 * Mounts on `/api/trash` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<AppEnv>();

// POST /api/trash/empty -- Empty trash (hard delete assets + R2 objects)
app.post(
  '/empty',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.trash.empty(auth);
    return c.json(result);
  },
);

// POST /api/trash/restore -- Restore all trashed assets
app.post(
  '/restore',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.trash.restoreAll(auth);
    return c.json(result);
  },
);

// POST /api/trash/restore/assets -- Restore specific assets
app.post(
  '/restore/assets',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.trash.restore(auth, body);
    return c.json(result);
  },
);

export default app;
