/**
 * Domain types used across the application.
 * These are the "materialized" types returned by DB queries,
 * distinct from the raw Kysely table types in schema.ts.
 */

import {
  AssetFileType,
  AssetType,
  AssetVisibility,
  Permission,
  UserAvatarColor,
  UserStatus,
} from 'src/enum';
import { UserMetadataItem } from 'src/types';

// ---------------------------------------------------------------------------
// Auth-related types (used by AuthDto, middleware, services)
// ---------------------------------------------------------------------------

export type AuthUser = {
  id: string;
  isAdmin: boolean;
  name: string;
  email: string;
  quotaUsageInBytes: number;
  quotaSizeInBytes: number | null;
};

export type AuthSession = {
  id: string;
  hasElevatedPermission: boolean;
};

export type AuthApiKey = {
  id: string;
  permissions: Permission[];
};

export type AuthSharedLink = {
  id: string;
  expiresAt: string | null; // ISO 8601 string (D1/SQLite stores timestamps as TEXT)
  userId: string;
  showExif: boolean;
  allowUpload: boolean;
  allowDownload: boolean;
  password: string | null;
};

// ---------------------------------------------------------------------------
// User types
// ---------------------------------------------------------------------------

export type User = {
  id: string;
  name: string;
  email: string;
  avatarColor: UserAvatarColor | null;
  profileImagePath: string;
  profileChangedAt: string; // ISO 8601 string
};

export type UserAdmin = User & {
  storageLabel: string | null;
  shouldChangePassword: boolean;
  isAdmin: boolean;
  createdAt: string; // ISO 8601 string
  updatedAt: string;
  deletedAt: string | null;
  oauthId: string;
  quotaSizeInBytes: number | null;
  quotaUsageInBytes: number;
  status: string;
  metadata: UserMetadataItem[];
  password?: string | null;
  pinCode?: string | null;
};

// ---------------------------------------------------------------------------
// Session type (full session row, not auth session)
// ---------------------------------------------------------------------------

export type Session = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  deviceOS: string;
  deviceType: string;
  appVersion: string | null;
  pinExpiresAt: string | null;
  isPendingSyncReset: boolean;
};

// ---------------------------------------------------------------------------
// API Key type
// ---------------------------------------------------------------------------

export type ApiKey = {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  permissions: Permission[];
};

// ---------------------------------------------------------------------------
// Asset-related types (needed by src/types.ts and other modules)
// ---------------------------------------------------------------------------

export type AssetFile = {
  id: string;
  type: AssetFileType;
  path: string;
  isEdited: boolean;
};

export type Asset = {
  id: string;
  checksum: Uint8Array;
  deviceAssetId: string;
  deviceId: string;
  fileCreatedAt: string;
  fileModifiedAt: string;
  isExternal: boolean;
  visibility: AssetVisibility;
  libraryId: string | null;
  livePhotoVideoId: string | null;
  localDateTime: string;
  originalFileName: string;
  originalPath: string;
  ownerId: string;
  type: AssetType;
};

// ---------------------------------------------------------------------------
// Column selections for Kysely queries
// ---------------------------------------------------------------------------

export const columns = {
  authUser: [
    'user.id',
    'user.name',
    'user.email',
    'user.isAdmin',
    'user.quotaUsageInBytes',
    'user.quotaSizeInBytes',
  ] as const,
  authApiKey: ['api_key.id', 'api_key.permissions'] as const,
  authSession: [
    'session.id',
    'session.updatedAt',
    'session.pinExpiresAt',
    'session.appVersion',
  ] as const,
  apiKey: [
    'api_key.id',
    'api_key.name',
    'api_key.userId',
    'api_key.createdAt',
    'api_key.updatedAt',
    'api_key.permissions',
  ] as const,
} as const;
