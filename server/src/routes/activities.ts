/**
 * Activity routes -- Hono sub-app for activity CRUD.
 *
 * Mounts on `/api/activities` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/activities -- List activities
app.get(
  '/',
  authMiddleware({ permission: Permission.ActivityRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const dto = {
      albumId: c.req.query('albumId') || '',
      assetId: c.req.query('assetId'),
      userId: c.req.query('userId'),
      type: c.req.query('type'),
      level: c.req.query('level'),
    };
    const result = await services.activity.getAll(auth, dto);
    return c.json(result);
  },
);

// POST /api/activities -- Create activity
app.post(
  '/',
  authMiddleware({ permission: Permission.ActivityCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const { duplicate, value } = await services.activity.create(auth, body);
    if (duplicate) {
      return c.json(value, 200);
    }
    return c.json(value, 201);
  },
);

// GET /api/activities/statistics -- Activity statistics
app.get(
  '/statistics',
  authMiddleware({ permission: Permission.ActivityStatistics }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const dto = {
      albumId: c.req.query('albumId') || '',
      assetId: c.req.query('assetId'),
    };
    const result = await services.activity.getStatistics(auth, dto);
    return c.json(result);
  },
);

// DELETE /api/activities/:id -- Delete activity
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.ActivityDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.activity.delete(auth, id);
    return c.body(null, 204);
  },
);

export default app;
