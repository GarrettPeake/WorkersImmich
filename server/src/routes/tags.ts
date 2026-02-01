/**
 * Tag routes -- Hono sub-app for tag CRUD.
 *
 * Mounts on `/api/tags` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// POST /api/tags -- Create tag
app.post(
  '/',
  authMiddleware({ permission: Permission.TagCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.tag.create(auth, body);
    return c.json(result);
  },
);

// GET /api/tags -- List all tags
app.get(
  '/',
  authMiddleware({ permission: Permission.TagRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.tag.getAll(auth);
    return c.json(result);
  },
);

// PUT /api/tags -- Upsert tags
app.put(
  '/',
  authMiddleware({ permission: Permission.TagCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.tag.upsert(auth, body);
    return c.json(result);
  },
);

// PUT /api/tags/assets -- Bulk tag assets
app.put(
  '/assets',
  authMiddleware({ permission: Permission.TagAsset }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.tag.bulkTagAssets(auth, body);
    return c.json(result);
  },
);

// GET /api/tags/:id -- Get tag
app.get(
  '/:id',
  authMiddleware({ permission: Permission.TagRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.tag.get(auth, id);
    return c.json(result);
  },
);

// PUT /api/tags/:id -- Update tag
app.put(
  '/:id',
  authMiddleware({ permission: Permission.TagUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.tag.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/tags/:id -- Delete tag
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.TagDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.tag.remove(auth, id);
    return c.body(null, 204);
  },
);

// PUT /api/tags/:id/assets -- Tag assets
app.put(
  '/:id/assets',
  authMiddleware({ permission: Permission.TagAsset }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.tag.addAssets(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/tags/:id/assets -- Untag assets
app.delete(
  '/:id/assets',
  authMiddleware({ permission: Permission.TagAsset }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.tag.removeAssets(auth, id, body);
    return c.json(result);
  },
);

export default app;
