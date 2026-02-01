/**
 * Hono type helpers for route handlers.
 *
 * Provides strongly-typed access to context variables (auth, ServiceContext,
 * Services) that are set by middleware in index.ts.
 */

import type { Context } from 'hono';
import type { Env } from './env';
import type { ServiceContext } from './context';
import type { Services } from './services';
import type { AuthDto } from './dtos/auth.dto';

// ---------------------------------------------------------------------------
// Hono variable types
// ---------------------------------------------------------------------------

export type Variables = {
  /** Set by auth middleware after successful authentication. */
  auth: AuthDto;
  /** Set by context middleware — raw bindings + db + crypto. */
  ctx: ServiceContext;
  /** Set by context middleware — all service instances. */
  services: Services;
};

// ---------------------------------------------------------------------------
// App-level Hono type (use when creating the Hono app or sub-routers)
// ---------------------------------------------------------------------------

export type AppEnv = { Bindings: Env; Variables: Variables };

export type AppContext = Context<AppEnv>;

// ---------------------------------------------------------------------------
// Typed helpers for route handlers
// ---------------------------------------------------------------------------

/** Get the Services container from a Hono context. */
export function getServices(c: AppContext): Services {
  return c.get('services');
}

/** Get the raw ServiceContext from a Hono context. */
export function getCtx(c: AppContext): ServiceContext {
  return c.get('ctx');
}

/** Get the authenticated user/session/apiKey from a Hono context. */
export function getAuth(c: AppContext): AuthDto {
  return c.get('auth');
}
