/**
 * Session routes -- Hono sub-app for session management.
 *
 * Mounts on `/api/sessions` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// POST /api/sessions -- Create a new session
app.post(
  '/',
  authMiddleware({ permission: Permission.SessionCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.session.create(auth, body);
    return c.json(result, 201);
  },
);

// GET /api/sessions -- List all sessions
app.get(
  '/',
  authMiddleware({ permission: Permission.SessionRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.session.getAll(auth);
    return c.json(result);
  },
);

// PUT /api/sessions/:id -- Update a session
app.put(
  '/:id',
  authMiddleware({ permission: Permission.SessionUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.session.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/sessions -- Delete all sessions (except current)
app.delete(
  '/',
  authMiddleware({ permission: Permission.SessionDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    await services.session.deleteAll(auth);
    return c.body(null, 204);
  },
);

// DELETE /api/sessions/:id -- Delete a specific session
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.SessionDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.session.delete(auth, id);
    return c.body(null, 204);
  },
);

// POST /api/sessions/:id/lock -- Lock a session
app.post(
  '/:id/lock',
  authMiddleware({ permission: Permission.SessionLock }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.session.lock(auth, id);
    return c.body(null, 204);
  },
);

export default app;
