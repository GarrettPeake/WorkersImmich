/**
 * API Key routes -- Hono sub-app for API key CRUD.
 *
 * Mounts on `/api/api-keys` in the main app.
 * Wires to the existing ApiKeyService from CP-7.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// POST /api/api-keys -- Create API key
app.post(
  '/',
  authMiddleware({ permission: Permission.ApiKeyCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.apiKey.create(auth, body);
    return c.json(result, 201);
  },
);

// GET /api/api-keys -- List all API keys
app.get(
  '/',
  authMiddleware({ permission: Permission.ApiKeyRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.apiKey.getAll(auth);
    return c.json(result);
  },
);

// GET /api/api-keys/me -- Get current key info
app.get(
  '/me',
  authMiddleware({ permission: Permission.ApiKeyRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.apiKey.getMine(auth);
    return c.json(result);
  },
);

// GET /api/api-keys/:id -- Get by id
app.get(
  '/:id',
  authMiddleware({ permission: Permission.ApiKeyRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.apiKey.getById(auth, id);
    return c.json(result);
  },
);

// PUT /api/api-keys/:id -- Update
app.put(
  '/:id',
  authMiddleware({ permission: Permission.ApiKeyUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.apiKey.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/api-keys/:id -- Delete
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.ApiKeyDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.apiKey.delete(auth, id);
    return c.body(null, 204);
  },
);

export default app;
