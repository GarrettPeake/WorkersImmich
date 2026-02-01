/**
 * Stack routes -- Hono sub-app for stack CRUD.
 *
 * Mounts on `/api/stacks` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/stacks -- Search stacks
app.get(
  '/',
  authMiddleware({ permission: Permission.StackRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const primaryAssetId = c.req.query('primaryAssetId');
    const dto = { primaryAssetId };
    const result = await services.stack.search(auth, dto);
    return c.json(result);
  },
);

// POST /api/stacks -- Create stack
app.post(
  '/',
  authMiddleware({ permission: Permission.StackCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.stack.create(auth, body);
    return c.json(result);
  },
);

// DELETE /api/stacks -- Delete multiple stacks
app.delete(
  '/',
  authMiddleware({ permission: Permission.StackDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    await services.stack.deleteAll(auth, body);
    return c.body(null, 204);
  },
);

// GET /api/stacks/:id -- Get stack
app.get(
  '/:id',
  authMiddleware({ permission: Permission.StackRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.stack.get(auth, id);
    return c.json(result);
  },
);

// PUT /api/stacks/:id -- Update stack
app.put(
  '/:id',
  authMiddleware({ permission: Permission.StackUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.stack.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/stacks/:id -- Delete stack
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.StackDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.stack.delete(auth, id);
    return c.body(null, 204);
  },
);

// DELETE /api/stacks/:id/assets/:assetId -- Remove asset from stack
app.delete(
  '/:id/assets/:assetId',
  authMiddleware({ permission: Permission.StackUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const assetId = c.req.param('assetId');
    await services.stack.removeAsset(auth, { id, assetId });
    return c.body(null, 204);
  },
);

export default app;
