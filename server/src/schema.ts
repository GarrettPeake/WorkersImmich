/**
 * D1/SQLite database schema types for Kysely.
 *
 * These types map directly to the tables defined in migrations/0001_initial.sql.
 * Column types use SQLite-compatible representations:
 *   - UUIDs are stored as TEXT strings
 *   - Timestamps are ISO 8601 TEXT strings
 *   - Booleans are INTEGER (0/1)
 *   - JSON values are TEXT (serialized JSON)
 *   - Binary data (checksums, keys) is stored as BLOB (Uint8Array)
 *   - PostgreSQL arrays are stored as TEXT (JSON arrays)
 */

import type { ColumnType, Generated } from 'kysely';

// ---------------------------------------------------------------------------
// Helper type aliases
// ---------------------------------------------------------------------------

/** Columns with a DEFAULT in the schema -- Kysely makes them optional on insert */
type Timestamp = string;

/** Boolean stored as 0/1 in SQLite */
type SqliteBool = number;

// ---------------------------------------------------------------------------
// user
// ---------------------------------------------------------------------------
export interface UserTable {
  id: string;
  email: string;
  password: Generated<string>;
  pinCode: string | null;
  createdAt: Generated<Timestamp>;
  profileImagePath: Generated<string>;
  isAdmin: Generated<SqliteBool>;
  shouldChangePassword: Generated<SqliteBool>;
  avatarColor: string | null;
  deletedAt: Timestamp | null;
  oauthId: Generated<string>;
  updatedAt: Generated<Timestamp>;
  storageLabel: string | null;
  name: Generated<string>;
  quotaSizeInBytes: number | null;
  quotaUsageInBytes: Generated<number>;
  status: Generated<string>;
  profileChangedAt: Generated<Timestamp>;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// user_metadata
// ---------------------------------------------------------------------------
export interface UserMetadataTable {
  userId: string;
  key: string;
  value: string; // JSON
  updateId: Generated<string>;
  updatedAt: Generated<Timestamp>;
}

// ---------------------------------------------------------------------------
// session
// ---------------------------------------------------------------------------
export interface SessionTable {
  id: string;
  token: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  expiresAt: Timestamp | null;
  userId: string;
  parentId: string | null;
  deviceType: Generated<string>;
  deviceOS: Generated<string>;
  appVersion: string | null;
  updateId: Generated<string>;
  isPendingSyncReset: Generated<SqliteBool>;
  pinExpiresAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// api_key
// ---------------------------------------------------------------------------
export interface ApiKeyTable {
  id: string;
  name: string;
  key: string;
  userId: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  permissions: string; // JSON array of permission strings
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// stack
// ---------------------------------------------------------------------------
export interface StackTable {
  id: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  updateId: Generated<string>;
  primaryAssetId: string;
  ownerId: string;
}

// ---------------------------------------------------------------------------
// asset
// ---------------------------------------------------------------------------
export interface AssetTable {
  id: string;
  deviceAssetId: string;
  ownerId: string;
  deviceId: string;
  type: string;
  originalPath: string;
  fileCreatedAt: Timestamp;
  fileModifiedAt: Timestamp;
  isFavorite: Generated<SqliteBool>;
  duration: string | null;
  encodedVideoPath: Generated<string | null>;
  checksum: Uint8Array; // BLOB - sha1 checksum
  livePhotoVideoId: string | null;
  updatedAt: Generated<Timestamp>;
  createdAt: Generated<Timestamp>;
  originalFileName: string;
  thumbhash: Uint8Array | null; // BLOB
  isOffline: Generated<SqliteBool>;
  libraryId: string | null;
  isExternal: Generated<SqliteBool>;
  deletedAt: Timestamp | null;
  localDateTime: Timestamp;
  stackId: string | null;
  duplicateId: string | null;
  status: Generated<string>;
  updateId: Generated<string>;
  visibility: Generated<string>;
  width: number | null;
  height: number | null;
  isEdited: Generated<SqliteBool>;
}

// ---------------------------------------------------------------------------
// asset_exif
// ---------------------------------------------------------------------------
export interface AssetExifTable {
  assetId: string;
  make: string | null;
  model: string | null;
  exifImageWidth: number | null;
  exifImageHeight: number | null;
  fileSizeInByte: number | null;
  orientation: string | null;
  dateTimeOriginal: Timestamp | null;
  modifyDate: Timestamp | null;
  lensModel: string | null;
  fNumber: number | null;
  focalLength: number | null;
  iso: number | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: Generated<string>;
  fps: number | null;
  exposureTime: string | null;
  livePhotoCID: string | null;
  timeZone: string | null;
  projectionType: string | null;
  profileDescription: string | null;
  colorspace: string | null;
  bitsPerSample: number | null;
  autoStackId: string | null;
  rating: number | null;
  tags: string | null;             // JSON array (PostgreSQL varchar[])
  updatedAt: Generated<Timestamp>;
  updateId: Generated<string>;
  lockedProperties: string | null; // JSON array (PostgreSQL varchar[])
}

// ---------------------------------------------------------------------------
// asset_file
// ---------------------------------------------------------------------------
export interface AssetFileTable {
  id: string;
  assetId: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  type: string;
  path: string;
  updateId: Generated<string>;
  isEdited: Generated<SqliteBool>;
  isProgressive: Generated<SqliteBool>;
}

// ---------------------------------------------------------------------------
// asset_metadata
// ---------------------------------------------------------------------------
export interface AssetMetadataTable {
  assetId: string;
  key: string;
  value: string; // JSON
  updateId: Generated<string>;
  updatedAt: Generated<Timestamp>;
}

// ---------------------------------------------------------------------------
// asset_edit
// ---------------------------------------------------------------------------
export interface AssetEditTable {
  id: string;
  assetId: string;
  action: string;
  parameters: string; // JSON
  sequence: number;
}

// ---------------------------------------------------------------------------
// album
// ---------------------------------------------------------------------------
export interface AlbumTable {
  id: string;
  ownerId: string;
  albumName: Generated<string>;
  createdAt: Generated<Timestamp>;
  albumThumbnailAssetId: string | null;
  updatedAt: Generated<Timestamp>;
  description: Generated<string>;
  deletedAt: Timestamp | null;
  isActivityEnabled: Generated<SqliteBool>;
  order: Generated<string>;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// album_asset
// ---------------------------------------------------------------------------
export interface AlbumAssetTable {
  albumId: string;
  assetId: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// album_user
// ---------------------------------------------------------------------------
export interface AlbumUserTable {
  albumId: string;
  userId: string;
  role: Generated<string>;
  createId: Generated<string>;
  createdAt: Generated<Timestamp>;
  updateId: Generated<string>;
  updatedAt: Generated<Timestamp>;
}

// ---------------------------------------------------------------------------
// activity
// ---------------------------------------------------------------------------
export interface ActivityTable {
  id: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  albumId: string;
  userId: string;
  assetId: string | null;
  comment: string | null;
  isLiked: Generated<SqliteBool>;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// tag
// ---------------------------------------------------------------------------
export interface TagTable {
  id: string;
  userId: string;
  value: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  color: string | null;
  parentId: string | null;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// tag_asset
// ---------------------------------------------------------------------------
export interface TagAssetTable {
  assetId: string;
  tagId: string;
}

// ---------------------------------------------------------------------------
// tag_closure
// ---------------------------------------------------------------------------
export interface TagClosureTable {
  id_ancestor: string;
  id_descendant: string;
}

// ---------------------------------------------------------------------------
// shared_link
// ---------------------------------------------------------------------------
export interface SharedLinkTable {
  id: string;
  description: string | null;
  userId: string;
  key: Uint8Array; // BLOB
  type: string;
  createdAt: Generated<Timestamp>;
  expiresAt: Timestamp | null;
  allowUpload: Generated<SqliteBool>;
  albumId: string | null;
  allowDownload: Generated<SqliteBool>;
  showExif: Generated<SqliteBool>;
  password: string | null;
  slug: string | null;
}

// ---------------------------------------------------------------------------
// shared_link_asset
// ---------------------------------------------------------------------------
export interface SharedLinkAssetTable {
  assetId: string;
  sharedLinkId: string;
}

// ---------------------------------------------------------------------------
// memory
// ---------------------------------------------------------------------------
export interface MemoryTable {
  id: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  deletedAt: Timestamp | null;
  ownerId: string;
  type: string;
  data: string; // JSON
  isSaved: Generated<SqliteBool>;
  memoryAt: Timestamp;
  seenAt: Timestamp | null;
  showAt: Timestamp | null;
  hideAt: Timestamp | null;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// memory_asset
// ---------------------------------------------------------------------------
export interface MemoryAssetTable {
  memoriesId: string;
  assetId: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// partner
// ---------------------------------------------------------------------------
export interface PartnerTable {
  sharedById: string;
  sharedWithId: string;
  createdAt: Generated<Timestamp>;
  createId: Generated<string>;
  updatedAt: Generated<Timestamp>;
  inTimeline: Generated<SqliteBool>;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// system_metadata
// ---------------------------------------------------------------------------
export interface SystemMetadataTable {
  key: string;
  value: string; // JSON
}

// ---------------------------------------------------------------------------
// version_history
// ---------------------------------------------------------------------------
export interface VersionHistoryTable {
  id: string;
  createdAt: Generated<Timestamp>;
  version: string;
}

// ---------------------------------------------------------------------------
// session_sync_checkpoint
// ---------------------------------------------------------------------------
export interface SessionSyncCheckpointTable {
  sessionId: string;
  type: string;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  ack: string;
  updateId: Generated<string>;
}

// ---------------------------------------------------------------------------
// audit (general)
// ---------------------------------------------------------------------------
export interface AuditTable {
  id: Generated<number>; // AUTOINCREMENT
  entityType: string;
  entityId: string;
  action: string;
  ownerId: string;
  createdAt: Generated<Timestamp>;
}

// ---------------------------------------------------------------------------
// Sync audit tables
// ---------------------------------------------------------------------------
export interface AssetAuditTable {
  id: string;
  assetId: string;
  ownerId: string;
  deletedAt: Generated<Timestamp>;
}

export interface AlbumAuditTable {
  id: string;
  albumId: string;
  userId: string;
  deletedAt: Generated<Timestamp>;
}

export interface PartnerAuditTable {
  id: string;
  sharedById: string;
  sharedWithId: string;
  deletedAt: Generated<Timestamp>;
}

export interface StackAuditTable {
  id: string;
  stackId: string;
  userId: string;
  deletedAt: Generated<Timestamp>;
}

export interface AlbumUserAuditTable {
  id: string;
  albumId: string;
  userId: string;
  deletedAt: Generated<Timestamp>;
}

export interface AlbumAssetAuditTable {
  id: string;
  albumId: string;
  assetId: string;
  deletedAt: Generated<Timestamp>;
}

export interface MemoryAuditTable {
  id: string;
  memoryId: string;
  userId: string;
  deletedAt: Generated<Timestamp>;
}

export interface MemoryAssetAuditTable {
  id: string;
  memoryId: string;
  assetId: string;
  deletedAt: Generated<Timestamp>;
}

export interface UserAuditTable {
  id: string;
  userId: string;
  deletedAt: Generated<Timestamp>;
}

export interface UserMetadataAuditTable {
  id: string;
  userId: string;
  key: string;
  deletedAt: Generated<Timestamp>;
}

export interface AssetMetadataAuditTable {
  id: string;
  assetId: string;
  key: string;
  deletedAt: Generated<Timestamp>;
}

// ---------------------------------------------------------------------------
// DB interface — maps SQL table names to their TypeScript row types
// ---------------------------------------------------------------------------
export interface DB {
  // Core tables (names match the SQL table names exactly)
  user: UserTable;
  user_metadata: UserMetadataTable;
  session: SessionTable;
  api_key: ApiKeyTable;
  asset: AssetTable;
  asset_exif: AssetExifTable;
  asset_file: AssetFileTable;
  asset_metadata: AssetMetadataTable;
  asset_edit: AssetEditTable;
  album: AlbumTable;
  album_asset: AlbumAssetTable;
  album_user: AlbumUserTable;
  activity: ActivityTable;
  tag: TagTable;
  tag_asset: TagAssetTable;
  tag_closure: TagClosureTable;
  stack: StackTable;
  shared_link: SharedLinkTable;
  shared_link_asset: SharedLinkAssetTable;
  memory: MemoryTable;
  memory_asset: MemoryAssetTable;
  partner: PartnerTable;
  system_metadata: SystemMetadataTable;
  version_history: VersionHistoryTable;
  session_sync_checkpoint: SessionSyncCheckpointTable;

  // General audit
  audit: AuditTable;

  // Sync audit tables
  asset_audit: AssetAuditTable;
  album_audit: AlbumAuditTable;
  partner_audit: PartnerAuditTable;
  stack_audit: StackAuditTable;
  album_user_audit: AlbumUserAuditTable;
  album_asset_audit: AlbumAssetAuditTable;
  memory_audit: MemoryAuditTable;
  memory_asset_audit: MemoryAssetAuditTable;
  user_audit: UserAuditTable;
  user_metadata_audit: UserMetadataAuditTable;
  asset_metadata_audit: AssetMetadataAuditTable;
}
