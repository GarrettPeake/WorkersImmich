/**
 * Shared Link routes -- Hono sub-app for shared link CRUD.
 *
 * Mounts on `/api/shared-links` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/shared-links -- List all shared links
app.get(
  '/',
  authMiddleware({ permission: Permission.SharedLinkRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.query('id');
    const albumId = c.req.query('albumId');
    const dto = { id, albumId };
    const result = await services.sharedLink.getAll(auth, dto);
    return c.json(result);
  },
);

// GET /api/shared-links/me -- Get current shared link
app.get(
  '/me',
  authMiddleware({ sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const password = c.req.query('password');
    const token = c.req.query('token');
    const dto = { password, token };
    const result = await services.sharedLink.getMine(auth, dto);
    return c.json(result);
  },
);

// GET /api/shared-links/:id -- Get shared link
app.get(
  '/:id',
  authMiddleware({ permission: Permission.SharedLinkRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.sharedLink.get(auth, id);
    return c.json(result);
  },
);

// POST /api/shared-links -- Create shared link
app.post(
  '/',
  authMiddleware({ permission: Permission.SharedLinkCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.sharedLink.create(auth, body);
    return c.json(result);
  },
);

// PATCH /api/shared-links/:id -- Update shared link
app.patch(
  '/:id',
  authMiddleware({ permission: Permission.SharedLinkUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.sharedLink.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/shared-links/:id -- Delete shared link
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.SharedLinkDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.sharedLink.remove(auth, id);
    return c.body(null, 204);
  },
);

// PUT /api/shared-links/:id/assets -- Add assets to shared link
app.put(
  '/:id/assets',
  authMiddleware({ sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.sharedLink.addAssets(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/shared-links/:id/assets -- Remove assets from shared link
app.delete(
  '/:id/assets',
  authMiddleware({ sharedLink: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.sharedLink.removeAssets(auth, id, body);
    return c.json(result);
  },
);

export default app;
