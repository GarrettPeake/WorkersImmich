/**
 * Admin User routes -- Hono sub-app for admin user management.
 *
 * Mounts on `/api/admin/users` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../hono';
import { authMiddleware } from '../../middleware/auth';
import { Permission } from '../../enum';

const app = new Hono<AppEnv>();

// GET /api/admin/users -- Search users
app.get(
  '/',
  authMiddleware({ permission: Permission.AdminUserRead, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.query('id');
    const withDeleted = c.req.query('withDeleted');
    const dto = {
      id,
      withDeleted: withDeleted === 'true' ? true : undefined,
    };
    const result = await services.userAdmin.search(auth, dto);
    return c.json(result);
  },
);

// POST /api/admin/users -- Create user
app.post(
  '/',
  authMiddleware({ permission: Permission.AdminUserCreate, admin: true }),
  async (c) => {
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.userAdmin.create(body);
    return c.json(result);
  },
);

// GET /api/admin/users/:id -- Get user
app.get(
  '/:id',
  authMiddleware({ permission: Permission.AdminUserRead, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.userAdmin.get(auth, id);
    return c.json(result);
  },
);

// PUT /api/admin/users/:id -- Update user
app.put(
  '/:id',
  authMiddleware({ permission: Permission.AdminUserUpdate, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.userAdmin.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/admin/users/:id -- Delete user
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.AdminUserDelete, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.userAdmin.delete(auth, id, body);
    return c.json(result);
  },
);

// GET /api/admin/users/:id/sessions -- Get user sessions
app.get(
  '/:id/sessions',
  authMiddleware({ permission: Permission.AdminSessionRead, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.userAdmin.getSessions(auth, id);
    return c.json(result);
  },
);

// GET /api/admin/users/:id/statistics -- Get user statistics
app.get(
  '/:id/statistics',
  authMiddleware({ permission: Permission.AdminUserRead, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const visibility = c.req.query('visibility');
    const isFavorite = c.req.query('isFavorite');
    const isTrashed = c.req.query('isTrashed');
    const dto = {
      visibility: visibility || undefined,
      isFavorite: isFavorite === 'true' ? true : isFavorite === 'false' ? false : undefined,
      isTrashed: isTrashed === 'true' ? true : isTrashed === 'false' ? false : undefined,
    };
    const result = await services.userAdmin.getStatistics(auth, id, dto);
    return c.json(result);
  },
);

// GET /api/admin/users/:id/preferences -- Get user preferences
app.get(
  '/:id/preferences',
  authMiddleware({ permission: Permission.AdminUserRead, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.userAdmin.getPreferences(auth, id);
    return c.json(result);
  },
);

// PUT /api/admin/users/:id/preferences -- Update user preferences
app.put(
  '/:id/preferences',
  authMiddleware({ permission: Permission.AdminUserUpdate, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.userAdmin.updatePreferences(auth, id, body);
    return c.json(result);
  },
);

// POST /api/admin/users/:id/restore -- Restore deleted user
app.post(
  '/:id/restore',
  authMiddleware({ permission: Permission.AdminUserDelete, admin: true }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.userAdmin.restore(auth, id);
    return c.json(result);
  },
);

export default app;
