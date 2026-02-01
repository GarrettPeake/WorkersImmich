/**
 * Hono auth middleware — replaces the NestJS AuthGuard.
 *
 * Extracts credentials from headers/cookies/query params,
 * validates them against D1 via Kysely, and sets `c.var.auth` on the context.
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { parse as parseCookies } from 'cookie';
import type { Kysely } from 'kysely';
import type { DB } from 'src/schema';
import type { AuthDto } from 'src/dtos/auth.dto';
import type { AuthUser, AuthSharedLink } from 'src/database';
import { ImmichCookie, ImmichHeader, ImmichQuery, Permission } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { isGranted } from 'src/utils/access';
import { getUserAgentDetails } from 'src/utils/request';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthOptions {
  /** Permission required for this route. `false` means any auth, string is specific permission. */
  permission?: Permission | false;
  /** Route requires admin privileges. */
  admin?: boolean;
  /** Route supports shared link access. */
  sharedLink?: boolean;
}

export type LoginDetails = {
  isSecure: boolean;
  clientIp: string;
  deviceType: string;
  deviceOS: string;
  appVersion: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cryptoRepo = new CryptoRepository();

function getBearerToken(headers: Headers): string | null {
  const authHeader = headers.get('authorization') || '';
  const [type, token] = authHeader.split(' ');
  if (type?.toLowerCase() === 'bearer' && token) {
    return token;
  }
  return null;
}

function getCookieValue(headers: Headers, name: string): string | null {
  const cookieHeader = headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  return cookies[name] || null;
}

// ---------------------------------------------------------------------------
// Validate session token against D1
// ---------------------------------------------------------------------------

async function validateSession(
  db: Kysely<DB>,
  tokenValue: string,
  headers: Headers,
): Promise<AuthDto> {
  const hashedToken = await cryptoRepo.hashSha256(tokenValue);

  const session = await db
    .selectFrom('session')
    .select([
      'session.id',
      'session.updatedAt',
      'session.pinExpiresAt',
      'session.appVersion',
      'session.userId',
    ])
    .where('session.token', '=', hashedToken)
    .where((eb) =>
      eb.or([
        eb('session.expiresAt', 'is', null),
        eb('session.expiresAt', '>', new Date().toISOString()),
      ]),
    )
    .executeTakeFirst();

  if (!session) {
    throw new HTTPException(401, { message: 'Invalid user token' });
  }

  const user = await db
    .selectFrom('user')
    .select([
      'user.id',
      'user.name',
      'user.email',
      'user.isAdmin',
      'user.quotaUsageInBytes',
      'user.quotaSizeInBytes',
    ])
    .where('user.id', '=', session.userId)
    .where('user.deletedAt', 'is', null)
    .executeTakeFirst();

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid user token' });
  }

  // Update session metadata if stale (>1 hour) or app version changed
  const { appVersion, deviceOS, deviceType } = getUserAgentDetails(headers);
  const now = Date.now();
  const updatedAt = new Date(session.updatedAt).getTime();
  const hourMs = 3_600_000;

  if (now - updatedAt > hourMs || appVersion !== session.appVersion) {
    // Fire-and-forget update (don't block the request)
    db.updateTable('session')
      .set({
        updatedAt: new Date().toISOString(),
        appVersion,
        deviceOS,
        deviceType,
      })
      .where('session.id', '=', session.id)
      .execute()
      .catch(() => {});
  }

  // Pin/elevated permission check
  let hasElevatedPermission = false;
  if (session.pinExpiresAt) {
    const pinExpiresAt = new Date(session.pinExpiresAt).getTime();
    hasElevatedPermission = pinExpiresAt > now;

    // Extend pin expiry if within 5 minutes of expiring
    if (hasElevatedPermission && now + 5 * 60_000 > pinExpiresAt) {
      const newExpiry = new Date(now + 5 * 60_000).toISOString();
      db.updateTable('session')
        .set({ pinExpiresAt: newExpiry })
        .where('session.id', '=', session.id)
        .execute()
        .catch(() => {});
    }
  }

  return {
    user: {
      id: user.id,
      isAdmin: Boolean(user.isAdmin),
      name: user.name,
      email: user.email,
      quotaUsageInBytes: user.quotaUsageInBytes ?? 0,
      quotaSizeInBytes: user.quotaSizeInBytes,
    },
    session: {
      id: session.id,
      hasElevatedPermission,
    },
  };
}

// ---------------------------------------------------------------------------
// Validate API key against D1
// ---------------------------------------------------------------------------

async function validateApiKey(db: Kysely<DB>, key: string): Promise<AuthDto> {
  const hashedKey = await cryptoRepo.hashSha256(key);

  const apiKey = await db
    .selectFrom('api_key')
    .select(['api_key.id', 'api_key.permissions', 'api_key.userId'])
    .where('api_key.key', '=', hashedKey)
    .executeTakeFirst();

  if (!apiKey) {
    throw new HTTPException(401, { message: 'Invalid API key' });
  }

  const user = await db
    .selectFrom('user')
    .select([
      'user.id',
      'user.name',
      'user.email',
      'user.isAdmin',
      'user.quotaUsageInBytes',
      'user.quotaSizeInBytes',
    ])
    .where('user.id', '=', apiKey.userId)
    .where('user.deletedAt', 'is', null)
    .executeTakeFirst();

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid API key' });
  }

  // Parse permissions from JSON string
  let permissions: Permission[];
  if (typeof apiKey.permissions === 'string') {
    try {
      permissions = JSON.parse(apiKey.permissions) as Permission[];
    } catch {
      permissions = [];
    }
  } else {
    permissions = apiKey.permissions as unknown as Permission[];
  }

  return {
    user: {
      id: user.id,
      isAdmin: Boolean(user.isAdmin),
      name: user.name,
      email: user.email,
      quotaUsageInBytes: user.quotaUsageInBytes ?? 0,
      quotaSizeInBytes: user.quotaSizeInBytes,
    },
    apiKey: {
      id: apiKey.id,
      permissions,
    },
  };
}

// ---------------------------------------------------------------------------
// Validate shared link key against D1
// ---------------------------------------------------------------------------

async function validateSharedLinkKey(
  db: Kysely<DB>,
  key: string,
): Promise<AuthDto> {
  // Convert key to bytes for comparison
  let keyBytes: Uint8Array;
  if (key.length === 100) {
    // hex encoded
    keyBytes = new Uint8Array(key.length / 2);
    for (let i = 0; i < key.length; i += 2) {
      keyBytes[i / 2] = Number.parseInt(key.slice(i, i + 2), 16);
    }
  } else {
    // base64url encoded
    const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    keyBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      keyBytes[i] = binaryString.charCodeAt(i);
    }
  }

  const sharedLink = await db
    .selectFrom('shared_link')
    .select([
      'shared_link.id',
      'shared_link.expiresAt',
      'shared_link.userId',
      'shared_link.showExif',
      'shared_link.allowUpload',
      'shared_link.allowDownload',
      'shared_link.password',
    ])
    .where('shared_link.key', '=', keyBytes)
    .executeTakeFirst();

  if (!sharedLink) {
    throw new HTTPException(401, { message: 'Invalid share key' });
  }

  // Check expiry
  if (sharedLink.expiresAt && new Date(sharedLink.expiresAt) <= new Date()) {
    throw new HTTPException(401, { message: 'Invalid share key' });
  }

  const user = await db
    .selectFrom('user')
    .select([
      'user.id',
      'user.name',
      'user.email',
      'user.isAdmin',
      'user.quotaUsageInBytes',
      'user.quotaSizeInBytes',
    ])
    .where('user.id', '=', sharedLink.userId)
    .where('user.deletedAt', 'is', null)
    .executeTakeFirst();

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid share key' });
  }

  return {
    user: {
      id: user.id,
      isAdmin: Boolean(user.isAdmin),
      name: user.name,
      email: user.email,
      quotaUsageInBytes: user.quotaUsageInBytes ?? 0,
      quotaSizeInBytes: user.quotaSizeInBytes,
    },
    sharedLink: {
      id: sharedLink.id,
      expiresAt: sharedLink.expiresAt,
      userId: sharedLink.userId,
      showExif: Boolean(sharedLink.showExif),
      allowUpload: Boolean(sharedLink.allowUpload),
      allowDownload: Boolean(sharedLink.allowDownload),
      password: sharedLink.password,
    },
  };
}

// ---------------------------------------------------------------------------
// Validate shared link slug against D1
// ---------------------------------------------------------------------------

async function validateSharedLinkSlug(
  db: Kysely<DB>,
  slug: string,
): Promise<AuthDto> {
  const sharedLink = await db
    .selectFrom('shared_link')
    .select([
      'shared_link.id',
      'shared_link.expiresAt',
      'shared_link.userId',
      'shared_link.showExif',
      'shared_link.allowUpload',
      'shared_link.allowDownload',
      'shared_link.password',
    ])
    .where('shared_link.slug', '=', slug)
    .executeTakeFirst();

  if (!sharedLink) {
    throw new HTTPException(401, { message: 'Invalid share slug' });
  }

  if (sharedLink.expiresAt && new Date(sharedLink.expiresAt) <= new Date()) {
    throw new HTTPException(401, { message: 'Invalid share slug' });
  }

  const user = await db
    .selectFrom('user')
    .select([
      'user.id',
      'user.name',
      'user.email',
      'user.isAdmin',
      'user.quotaUsageInBytes',
      'user.quotaSizeInBytes',
    ])
    .where('user.id', '=', sharedLink.userId)
    .where('user.deletedAt', 'is', null)
    .executeTakeFirst();

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid share slug' });
  }

  return {
    user: {
      id: user.id,
      isAdmin: Boolean(user.isAdmin),
      name: user.name,
      email: user.email,
      quotaUsageInBytes: user.quotaUsageInBytes ?? 0,
      quotaSizeInBytes: user.quotaSizeInBytes,
    },
    sharedLink: {
      id: sharedLink.id,
      expiresAt: sharedLink.expiresAt,
      userId: sharedLink.userId,
      showExif: Boolean(sharedLink.showExif),
      allowUpload: Boolean(sharedLink.allowUpload),
      allowDownload: Boolean(sharedLink.allowDownload),
      password: sharedLink.password,
    },
  };
}

// ---------------------------------------------------------------------------
// Core validation — resolves credentials to an AuthDto
// ---------------------------------------------------------------------------

async function validate(
  db: Kysely<DB>,
  headers: Headers,
  queryParams: Record<string, string>,
): Promise<AuthDto> {
  // 1. Check for shared link key
  const shareKey =
    headers.get(ImmichHeader.SharedLinkKey) ||
    queryParams[ImmichQuery.SharedLinkKey];
  if (shareKey) {
    return validateSharedLinkKey(db, shareKey);
  }

  // 2. Check for shared link slug
  const shareSlug =
    headers.get(ImmichHeader.SharedLinkSlug) ||
    queryParams[ImmichQuery.SharedLinkSlug];
  if (shareSlug) {
    return validateSharedLinkSlug(db, shareSlug);
  }

  // 3. Check for session token (multiple sources)
  const sessionToken =
    (headers.get(ImmichHeader.UserToken) as string) ||
    (headers.get(ImmichHeader.SessionToken) as string) ||
    queryParams[ImmichQuery.SessionKey] ||
    getBearerToken(headers) ||
    getCookieValue(headers, ImmichCookie.AccessToken);
  if (sessionToken) {
    return validateSession(db, sessionToken, headers);
  }

  // 4. Check for API key
  const apiKey =
    headers.get(ImmichHeader.ApiKey) || queryParams[ImmichQuery.ApiKey];
  if (apiKey) {
    return validateApiKey(db, apiKey);
  }

  throw new HTTPException(401, { message: 'Authentication required' });
}

// ---------------------------------------------------------------------------
// Hono middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates an authentication middleware for Hono routes.
 *
 * Usage:
 * ```ts
 * app.get('/api/assets', authMiddleware(), (c) => { ... });
 * app.get('/api/admin/users', authMiddleware({ admin: true }), (c) => { ... });
 * app.get('/api/shared/:key', authMiddleware({ sharedLink: true }), (c) => { ... });
 * ```
 *
 * The middleware expects `c.env.DB` to be a D1 binding and uses Kysely for queries.
 * After successful auth, `c.get('auth')` returns the `AuthDto`.
 */
export function authMiddleware(options: AuthOptions = {}) {
  const {
    admin: adminRoute = false,
    sharedLink: sharedLinkRoute = false,
    permission,
  } = options;

  return createMiddleware(async (c, next) => {
    // Get the ServiceContext set by the context middleware in index.ts
    const svcCtx = c.get('ctx') as ServiceContext | undefined;
    if (!svcCtx) {
      throw new HTTPException(500, { message: 'ServiceContext not configured' });
    }
    const db = svcCtx.db;

    const headers = c.req.raw.headers;
    const url = new URL(c.req.url);
    const queryParams: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      queryParams[key] = value;
    }

    const authDto = await validate(db, headers, queryParams);

    // Admin route check
    if (!authDto.user.isAdmin && adminRoute) {
      throw new HTTPException(403, { message: 'Forbidden' });
    }

    // Shared link on non-shared route check
    if (authDto.sharedLink && !sharedLinkRoute) {
      throw new HTTPException(403, { message: 'Forbidden' });
    }

    // API key permission check
    const requestedPermission = permission ?? Permission.All;
    if (
      authDto.apiKey &&
      requestedPermission !== false &&
      !isGranted({
        requested: [requestedPermission as Permission],
        current: authDto.apiKey.permissions,
      })
    ) {
      throw new HTTPException(403, {
        message: `Missing required permission: ${requestedPermission}`,
      });
    }

    // Store auth on context for route handlers
    c.set('auth', authDto);

    await next();
  });
}

/**
 * Helper to extract auth from Hono context in route handlers.
 * Throws if auth is not set (middleware not applied).
 */
export function getAuth(c: { get: (key: string) => unknown }): AuthDto {
  const auth = c.get('auth') as AuthDto | undefined;
  if (!auth) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }
  return auth;
}

/**
 * Helper to extract login details from a Hono request context.
 */
export function getLoginDetails(c: {
  req: { raw: Request };
}): LoginDetails {
  const headers = c.req.raw.headers;
  const { deviceType, deviceOS, appVersion } = getUserAgentDetails(headers);
  const clientIp = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for') || '';
  const isSecure = new URL(c.req.raw.url).protocol === 'https:';

  return {
    clientIp,
    isSecure,
    deviceType,
    deviceOS,
    appVersion,
  };
}
