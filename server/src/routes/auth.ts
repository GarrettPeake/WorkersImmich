/**
 * Auth routes -- Hono sub-app for authentication operations.
 *
 * Mounts on `/api/auth` in the main app.
 */

import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../hono';
import { authMiddleware } from '../middleware/auth';
import { AuthType, ImmichCookie } from '../enum';

const app = new Hono<AppEnv>();

// POST /api/auth/login -- Login with email/password
app.post('/login', async (c) => {
  const services = c.get('services');
  const body = await c.req.json();

  const isSecure = c.req.url.startsWith('https');
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '0.0.0.0';
  const userAgent = c.req.header('user-agent') || '';

  const loginDetails = {
    isSecure,
    clientIp,
    deviceType: userAgent,
    deviceOS: '',
    appVersion: null,
  };

  const result = await services.auth.login(body, loginDetails);

  // Set auth cookies so the frontend knows the user is authenticated
  const maxAge = 400 * 24 * 60 * 60; // 400 days in seconds
  const cookieDefaults = {
    path: '/',
    sameSite: 'Lax' as const,
    httpOnly: true,
    secure: isSecure,
    maxAge,
  };

  setCookie(c, ImmichCookie.AccessToken, result.accessToken, cookieDefaults);
  setCookie(c, ImmichCookie.AuthType, AuthType.Password, cookieDefaults);
  setCookie(c, ImmichCookie.IsAuthenticated, 'true', {
    ...cookieDefaults,
    httpOnly: false, // must be readable by client JS
  });

  return c.json(result);
});

// POST /api/auth/logout -- Logout
app.post(
  '/logout',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');

    const result = await services.auth.logout(auth, 'password' as any);

    // Clear auth cookies
    deleteCookie(c, ImmichCookie.AccessToken, { path: '/' });
    deleteCookie(c, ImmichCookie.AuthType, { path: '/' });
    deleteCookie(c, ImmichCookie.IsAuthenticated, { path: '/' });

    return c.json(result);
  },
);

// POST /api/auth/change-password -- Change password
app.post(
  '/change-password',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const body = await c.req.json();
    const result = await services.auth.changePassword(auth, body);
    return c.json(result);
  },
);

// POST /api/auth/validateToken -- Validate auth token
app.post(
  '/validateToken',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.auth.validateToken(auth);
    return c.json(result);
  },
);

// POST /api/auth/admin-sign-up -- Admin sign up (first user)
app.post('/admin-sign-up', async (c) => {
  const services = c.get('services');
  const body = await c.req.json();
  const result = await services.auth.adminSignUp(body);
  return c.json(result, 201);
});

// GET /api/auth/status -- Get auth status
app.get(
  '/status',
  authMiddleware(),
  async (c) => {
    const auth = c.get('auth');
    const services = c.get('services');
    const result = await services.auth.getAuthStatus(auth);
    return c.json(result);
  },
);

export default app;
