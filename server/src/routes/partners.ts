/**
 * Partner routes -- Hono sub-app for partner CRUD.
 *
 * Mounts on `/api/partners` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/partners -- List partners
app.get(
  '/',
  authMiddleware({ permission: Permission.PartnerRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const direction = c.req.query('direction');
    const result = await services.partner.search(auth, { direction: direction as any });
    return c.json(result);
  },
);

// POST /api/partners -- Create partner
app.post(
  '/',
  authMiddleware({ permission: Permission.PartnerCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.partner.create(auth, body);
    return c.json(result);
  },
);

// POST /api/partners/:id -- Create partner (deprecated)
app.post(
  '/:id',
  authMiddleware({ permission: Permission.PartnerCreate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.partner.create(auth, { sharedWithId: id });
    return c.json(result);
  },
);

// PUT /api/partners/:id -- Update partner
app.put(
  '/:id',
  authMiddleware({ permission: Permission.PartnerUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await services.partner.update(auth, id, body);
    return c.json(result);
  },
);

// DELETE /api/partners/:id -- Remove partner
app.delete(
  '/:id',
  authMiddleware({ permission: Permission.PartnerDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const id = c.req.param('id');
    await services.partner.remove(auth, id);
    return c.body(null, 204);
  },
);

export default app;
