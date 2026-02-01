/**
 * User routes -- Hono sub-app for user endpoints.
 *
 * Mounts on `/api/users` in the main app.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { Permission } from '../enum';

const app = new Hono<AppEnv>();

// GET /api/users -- Get all users
app.get(
  '/',
  authMiddleware({ permission: Permission.UserRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.user.search(auth);
    return c.json(result);
  },
);

// GET /api/users/me -- Get current user
app.get(
  '/me',
  authMiddleware({ permission: Permission.UserRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.user.getMe(auth);
    return c.json(result);
  },
);

// PUT /api/users/me -- Update current user
app.put(
  '/me',
  authMiddleware({ permission: Permission.UserUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.user.updateMe(auth, body);
    return c.json(result);
  },
);

// GET /api/users/me/preferences -- Get my preferences
app.get(
  '/me/preferences',
  authMiddleware({ permission: Permission.UserPreferenceRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.user.getMyPreferences(auth);
    return c.json(result);
  },
);

// PUT /api/users/me/preferences -- Update my preferences
app.put(
  '/me/preferences',
  authMiddleware({ permission: Permission.UserPreferenceUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.user.updateMyPreferences(auth, body);
    return c.json(result);
  },
);

// GET /api/users/me/license -- Get user license
app.get(
  '/me/license',
  authMiddleware({ permission: Permission.UserLicenseRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.user.getLicense(auth);
    return c.json(result);
  },
);

// PUT /api/users/me/license -- Set user license
app.put(
  '/me/license',
  authMiddleware({ permission: Permission.UserLicenseUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.user.setLicense(auth, body);
    return c.json(result);
  },
);

// DELETE /api/users/me/license -- Delete user license
app.delete(
  '/me/license',
  authMiddleware({ permission: Permission.UserLicenseDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    await services.user.deleteLicense(auth);
    return c.body(null, 204);
  },
);

// GET /api/users/me/onboarding -- Get onboarding status
app.get(
  '/me/onboarding',
  authMiddleware({ permission: Permission.UserOnboardingRead }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.user.getOnboarding(auth);
    return c.json(result);
  },
);

// PUT /api/users/me/onboarding -- Set onboarding status
app.put(
  '/me/onboarding',
  authMiddleware({ permission: Permission.UserOnboardingUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.user.setOnboarding(auth, body);
    return c.json(result);
  },
);

// DELETE /api/users/me/onboarding -- Delete onboarding status
app.delete(
  '/me/onboarding',
  authMiddleware({ permission: Permission.UserOnboardingDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    await services.user.deleteOnboarding(auth);
    return c.body(null, 204);
  },
);

// POST /api/users/profile-image -- Upload profile image
app.post(
  '/profile-image',
  authMiddleware({ permission: Permission.UserProfileImageUpdate }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');

    const body = await c.req.parseBody({ all: true });
    const file = body['file'];
    if (!file || !(file instanceof File)) {
      return c.json({ message: 'Missing file' }, 400);
    }

    const fileData = await file.arrayBuffer();
    const result = await services.user.createProfileImage(auth, fileData, file.name);
    return c.json(result);
  },
);

// DELETE /api/users/profile-image -- Delete profile image
app.delete(
  '/profile-image',
  authMiddleware({ permission: Permission.UserProfileImageDelete }),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    await services.user.deleteProfileImage(auth);
    return c.body(null, 204);
  },
);

// GET /api/users/:id -- Get a user
app.get(
  '/:id',
  authMiddleware({ permission: Permission.UserRead }),
  async (c) => {
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.user.get(id);
    return c.json(result);
  },
);

// GET /api/users/:id/profile-image -- Get profile image
app.get(
  '/:id/profile-image',
  authMiddleware({ permission: Permission.UserProfileImageRead }),
  async (c) => {
    const services = c.get('services');
    const id = c.req.param('id');
    const result = await services.user.getProfileImage(id);

    if (!result.body) {
      return c.json({ message: 'Profile image not found' }, 404);
    }

    c.header('Content-Type', result.contentType);
    if (result.size) {
      c.header('Content-Length', String(result.size));
    }
    c.header('Cache-Control', 'private, max-age=86400, immutable');

    return new Response(result.body, {
      headers: c.res.headers,
    });
  },
);

export default app;
