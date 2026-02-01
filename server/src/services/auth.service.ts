/**
 * Auth service — Workers-compatible version.
 *
 * Handles login, logout, password changes, session validation, admin signup.
 * No NestJS decorators, no node: imports.
 */

import { parse as parseCookies } from 'cookie';
import { LOGIN_URL, MOBILE_REDIRECT, SALT_ROUNDS } from 'src/constants';
import type { AuthSharedLink, AuthUser, UserAdmin } from 'src/database';
import type {
  AuthDto,
  AuthStatusResponseDto,
  ChangePasswordDto,
  LoginCredentialDto,
  LogoutResponseDto,
  SignUpDto,
} from 'src/dtos/auth.dto';
import { mapLoginResponse } from 'src/dtos/auth.dto';
import { mapUserAdmin, type UserAdminResponseDto } from 'src/dtos/user.dto';
import {
  AuthType,
  ImmichCookie,
  ImmichHeader,
  ImmichQuery,
  Permission,
} from 'src/enum';
import type { ServiceContext } from 'src/context';
import { isGranted } from 'src/utils/access';
import { getUserAgentDetails } from 'src/utils/request';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoginDetails {
  isSecure: boolean;
  clientIp: string;
  deviceType: string;
  deviceOS: string;
  appVersion: string | null;
}

export type ValidateRequest = {
  headers: Headers;
  queryParams: Record<string, string>;
  metadata: {
    sharedLinkRoute: boolean;
    adminRoute: boolean;
    permission?: Permission | false;
    uri: string;
  };
};

// ---------------------------------------------------------------------------
// Auth service class
// ---------------------------------------------------------------------------

export class AuthService {
  private get db() {
    return this.ctx.db;
  }
  private get crypto() {
    return this.ctx.crypto;
  }

  constructor(private ctx: ServiceContext) {}

  async login(dto: LoginCredentialDto, details: LoginDetails) {
    const userRow = await this.db
      .selectFrom('user')
      .select([
        'user.id',
        'user.email',
        'user.name',
        'user.isAdmin',
        'user.password',
        'user.shouldChangePassword',
        'user.profileImagePath',
        'user.storageLabel',
        'user.createdAt',
        'user.updatedAt',
        'user.deletedAt',
        'user.oauthId',
        'user.quotaSizeInBytes',
        'user.quotaUsageInBytes',
        'user.status',
        'user.avatarColor',
        'user.profileChangedAt',
      ])
      .where('user.email', '=', dto.email)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!userRow) {
      throw new AuthError(401, 'Incorrect email or password');
    }

    const isAuthenticated = this.validateSecret(dto.password, userRow.password);
    if (!isAuthenticated) {
      throw new AuthError(401, 'Incorrect email or password');
    }

    // Load metadata for login response
    const metadata = await this.db
      .selectFrom('user_metadata')
      .select(['key', 'value'])
      .where('userId', '=', userRow.id)
      .execute();

    const user = this.toUserAdmin(userRow, metadata);
    return this.createLoginResponse(user, details);
  }

  async logout(auth: AuthDto, authType: AuthType): Promise<LogoutResponseDto> {
    if (auth.session) {
      await this.db
        .deleteFrom('session')
        .where('id', '=', auth.session.id)
        .execute();
    }

    return {
      successful: true,
      redirectUri: LOGIN_URL,
    };
  }

  async changePassword(
    auth: AuthDto,
    dto: ChangePasswordDto,
  ): Promise<UserAdminResponseDto> {
    const { password, newPassword } = dto;

    const userRow = await this.db
      .selectFrom('user')
      .select(['user.id', 'user.password'])
      .where('user.id', '=', auth.user.id)
      .executeTakeFirst();

    if (!userRow) {
      throw new AuthError(400, 'User not found');
    }

    const valid = this.validateSecret(password, userRow.password);
    if (!valid) {
      throw new AuthError(400, 'Wrong password');
    }

    const hashedPassword = await this.crypto.hashBcrypt(
      newPassword,
      SALT_ROUNDS,
    );

    await this.db
      .updateTable('user')
      .set({ password: hashedPassword })
      .where('id', '=', userRow.id)
      .execute();

    // Invalidate other sessions if requested
    if (dto.invalidateSessions) {
      await this.db
        .deleteFrom('session')
        .where('userId', '=', userRow.id)
        .$if(!!auth.session, (qb) =>
          qb.where('id', '!=', auth.session!.id),
        )
        .execute();
    }

    // Return updated user
    const updatedRow = await this.db
      .selectFrom('user')
      .selectAll()
      .where('id', '=', userRow.id)
      .executeTakeFirstOrThrow();

    const metadata = await this.db
      .selectFrom('user_metadata')
      .select(['key', 'value'])
      .where('userId', '=', userRow.id)
      .execute();

    return mapUserAdmin(this.toUserAdmin(updatedRow, metadata));
  }

  async validateToken(auth: AuthDto): Promise<{ authStatus: boolean }> {
    return { authStatus: true };
  }

  async adminSignUp(dto: SignUpDto): Promise<UserAdminResponseDto> {
    // Check if admin already exists
    const existingAdmin = await this.db
      .selectFrom('user')
      .select('id')
      .where('isAdmin', '=', 1)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (existingAdmin) {
      throw new AuthError(400, 'The server already has an admin');
    }

    const hashedPassword = await this.crypto.hashBcrypt(
      dto.password,
      SALT_ROUNDS,
    );

    const id = this.crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .insertInto('user')
      .values({
        id,
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        isAdmin: 1,
        storageLabel: 'admin',
        createdAt: now,
        updatedAt: now,
        shouldChangePassword: 0,
        quotaUsageInBytes: 0,
        profileImagePath: '',
        oauthId: '',
        status: 'active',
        profileChangedAt: now,
        updateId: this.crypto.randomUUID(),
      })
      .execute();

    const userRow = await this.db
      .selectFrom('user')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    const metadata = await this.db
      .selectFrom('user_metadata')
      .select(['key', 'value'])
      .where('userId', '=', id)
      .execute();

    return mapUserAdmin(this.toUserAdmin(userRow, metadata));
  }

  async authenticate({
    headers,
    queryParams,
    metadata,
  }: ValidateRequest): Promise<AuthDto> {
    const authDto = await this.validate({ headers, queryParams });
    const { adminRoute, sharedLinkRoute, uri } = metadata;
    const requestedPermission = metadata.permission ?? Permission.All;

    if (!authDto.user.isAdmin && adminRoute) {
      throw new AuthError(403, 'Forbidden');
    }

    if (authDto.sharedLink && !sharedLinkRoute) {
      throw new AuthError(403, 'Forbidden');
    }

    if (
      authDto.apiKey &&
      requestedPermission !== false &&
      !isGranted({
        requested: [requestedPermission as Permission],
        current: authDto.apiKey.permissions,
      })
    ) {
      throw new AuthError(
        403,
        `Missing required permission: ${requestedPermission}`,
      );
    }

    return authDto;
  }

  async getAuthStatus(auth: AuthDto): Promise<AuthStatusResponseDto> {
    const user = await this.db
      .selectFrom('user')
      .select(['pinCode', 'password'])
      .where('id', '=', auth.user.id)
      .executeTakeFirst();

    if (!user) {
      throw new AuthError(401, 'Unauthorized');
    }

    let expiresAt: string | undefined;
    let pinExpiresAt: string | undefined;

    if (auth.session) {
      const session = await this.db
        .selectFrom('session')
        .select(['expiresAt', 'pinExpiresAt'])
        .where('id', '=', auth.session.id)
        .executeTakeFirst();

      expiresAt = session?.expiresAt ?? undefined;
      pinExpiresAt = session?.pinExpiresAt ?? undefined;
    }

    return {
      pinCode: !!user.pinCode,
      password: !!user.password,
      isElevated: !!auth.session?.hasElevatedPermission,
      expiresAt,
      pinExpiresAt,
    };
  }

  getMobileRedirect(url: string) {
    return `${MOBILE_REDIRECT}?${url.split('?')[1] || ''}`;
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private async validate({
    headers,
    queryParams,
  }: Omit<ValidateRequest, 'metadata'>): Promise<AuthDto> {
    const shareKey =
      headers.get(ImmichHeader.SharedLinkKey) ||
      queryParams[ImmichQuery.SharedLinkKey];
    const shareSlug =
      headers.get(ImmichHeader.SharedLinkSlug) ||
      queryParams[ImmichQuery.SharedLinkSlug];
    const session =
      headers.get(ImmichHeader.UserToken) ||
      headers.get(ImmichHeader.SessionToken) ||
      queryParams[ImmichQuery.SessionKey] ||
      this.getBearerToken(headers) ||
      this.getCookieToken(headers);
    const apiKey =
      headers.get(ImmichHeader.ApiKey) || queryParams[ImmichQuery.ApiKey];

    if (shareKey) {
      return this.validateSharedLinkKey(shareKey);
    }

    if (shareSlug) {
      return this.validateSharedLinkSlug(shareSlug);
    }

    if (session) {
      return this.validateSession(session, headers);
    }

    if (apiKey) {
      return this.validateApiKey(apiKey);
    }

    throw new AuthError(401, 'Authentication required');
  }

  private getBearerToken(headers: Headers): string | null {
    const [type, token] = (headers.get('authorization') || '').split(' ');
    if (type?.toLowerCase() === 'bearer') {
      return token || null;
    }
    return null;
  }

  private getCookieToken(headers: Headers): string | null {
    const cookies = parseCookies(headers.get('cookie') || '');
    return cookies[ImmichCookie.AccessToken] || null;
  }

  private async validateSharedLinkKey(key: string | string[]): Promise<AuthDto> {
    key = Array.isArray(key) ? key[0] : key;

    // Convert key to bytes
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

    const sharedLink = await this.db
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

    if (!sharedLink || (sharedLink.expiresAt && new Date(sharedLink.expiresAt) <= new Date())) {
      throw new AuthError(401, 'Invalid share key');
    }

    const user = await this.loadAuthUser(sharedLink.userId);
    if (!user) {
      throw new AuthError(401, 'Invalid share key');
    }

    return {
      user,
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

  private async validateSharedLinkSlug(slug: string | string[]): Promise<AuthDto> {
    slug = Array.isArray(slug) ? slug[0] : slug;

    const sharedLink = await this.db
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

    if (!sharedLink || (sharedLink.expiresAt && new Date(sharedLink.expiresAt) <= new Date())) {
      throw new AuthError(401, 'Invalid share slug');
    }

    const user = await this.loadAuthUser(sharedLink.userId);
    if (!user) {
      throw new AuthError(401, 'Invalid share slug');
    }

    return {
      user,
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

  private async validateApiKey(key: string): Promise<AuthDto> {
    const hashedKey = await this.crypto.hashSha256(key);

    const apiKey = await this.db
      .selectFrom('api_key')
      .select(['api_key.id', 'api_key.permissions', 'api_key.userId'])
      .where('api_key.key', '=', hashedKey)
      .executeTakeFirst();

    if (!apiKey) {
      throw new AuthError(401, 'Invalid API key');
    }

    const user = await this.loadAuthUser(apiKey.userId);
    if (!user) {
      throw new AuthError(401, 'Invalid API key');
    }

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
      user,
      apiKey: {
        id: apiKey.id,
        permissions,
      },
    };
  }

  private validateSecret(
    inputSecret: string,
    existingHash?: string | null,
  ): boolean {
    if (!existingHash) {
      return false;
    }
    return this.crypto.compareBcrypt(inputSecret, existingHash);
  }

  private async validateSession(
    tokenValue: string,
    headers: Headers,
  ): Promise<AuthDto> {
    const hashedToken = await this.crypto.hashSha256(tokenValue);

    const session = await this.db
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
      throw new AuthError(401, 'Invalid user token');
    }

    const user = await this.loadAuthUser(session.userId);
    if (!user) {
      throw new AuthError(401, 'Invalid user token');
    }

    // Update session metadata if stale
    const { appVersion, deviceOS, deviceType } = getUserAgentDetails(headers);
    const now = Date.now();
    const updatedAt = new Date(session.updatedAt).getTime();
    const hourMs = 3_600_000;

    if (now - updatedAt > hourMs || appVersion !== session.appVersion) {
      this.db
        .updateTable('session')
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

      if (hasElevatedPermission && now + 5 * 60_000 > pinExpiresAt) {
        const newExpiry = new Date(now + 5 * 60_000).toISOString();
        this.db
          .updateTable('session')
          .set({ pinExpiresAt: newExpiry })
          .where('session.id', '=', session.id)
          .execute()
          .catch(() => {});
      }
    }

    return {
      user,
      session: {
        id: session.id,
        hasElevatedPermission,
      },
    };
  }

  private async loadAuthUser(userId: string): Promise<AuthUser | null> {
    const row = await this.db
      .selectFrom('user')
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.isAdmin',
        'user.quotaUsageInBytes',
        'user.quotaSizeInBytes',
      ])
      .where('user.id', '=', userId)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      isAdmin: Boolean(row.isAdmin),
      name: row.name,
      email: row.email,
      quotaUsageInBytes: row.quotaUsageInBytes ?? 0,
      quotaSizeInBytes: row.quotaSizeInBytes,
    };
  }

  private async createLoginResponse(
    user: UserAdmin,
    loginDetails: LoginDetails,
  ) {
    const token = this.crypto.randomBytesAsText(32);
    const tokenHashed = await this.crypto.hashSha256(token);

    await this.db
      .insertInto('session')
      .values({
        id: this.crypto.randomUUID(),
        token: tokenHashed,
        deviceOS: loginDetails.deviceOS,
        deviceType: loginDetails.deviceType,
        appVersion: loginDetails.appVersion,
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updateId: this.crypto.randomUUID(),
      })
      .execute();

    return mapLoginResponse(user, token);
  }

  /**
   * Convert a raw DB row + metadata rows into a UserAdmin domain object.
   */
  private toUserAdmin(
    row: Record<string, unknown>,
    metadataRows: Array<{ key: string; value: string }>,
  ): UserAdmin {
    const metadata = metadataRows.map((m) => ({
      key: m.key,
      value: typeof m.value === 'string' ? JSON.parse(m.value) : m.value,
    }));

    return {
      id: row.id as string,
      email: row.email as string,
      name: (row.name as string) || '',
      avatarColor: (row.avatarColor as any) || null,
      profileImagePath: (row.profileImagePath as string) || '',
      profileChangedAt: (row.profileChangedAt as string) || '',
      storageLabel: (row.storageLabel as string) || null,
      shouldChangePassword: Boolean(row.shouldChangePassword),
      isAdmin: Boolean(row.isAdmin),
      createdAt: (row.createdAt as string) || '',
      updatedAt: (row.updatedAt as string) || '',
      deletedAt: (row.deletedAt as string) || null,
      oauthId: (row.oauthId as string) || '',
      quotaSizeInBytes: (row.quotaSizeInBytes as number) ?? null,
      quotaUsageInBytes: (row.quotaUsageInBytes as number) ?? 0,
      status: (row.status as string) || 'active',
      metadata,
      password: (row.password as string) || null,
      pinCode: (row.pinCode as string) || null,
    };
  }
}

// ---------------------------------------------------------------------------
// Error class for auth errors (maps to HTTP status codes)
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
