-- Immich D1/SQLite Initial Schema Migration
-- Converted from PostgreSQL schema (server/src/schema/tables/)
--
-- Conversion notes:
--   uuid          -> TEXT NOT NULL (UUIDs stored as strings, generated in app code)
--   timestamptz   -> TEXT (ISO 8601 strings)
--   bytea         -> BLOB
--   bigint        -> INTEGER
--   boolean       -> INTEGER (0/1)
--   jsonb/json    -> TEXT (JSON stored as string)
--   PG enums      -> TEXT with CHECK constraints
--   serial        -> INTEGER PRIMARY KEY AUTOINCREMENT
--   PG arrays     -> TEXT (JSON array stored as string)
--   No triggers   -> updatedAt / audit logic handled in application code
--   No immich_uuid_v7() default -> app generates UUIDs before insert

PRAGMA foreign_keys = ON;

-- ============================================================================
-- users
-- ============================================================================
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL DEFAULT '',
  "pinCode" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "profileImagePath" TEXT NOT NULL DEFAULT '',
  "isAdmin" INTEGER NOT NULL DEFAULT 0,
  "shouldChangePassword" INTEGER NOT NULL DEFAULT 1,
  "avatarColor" TEXT CHECK ("avatarColor" IN ('primary','pink','red','yellow','blue','green','purple','orange','gray','amber')),
  "deletedAt" TEXT,
  "oauthId" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "storageLabel" TEXT UNIQUE,
  "name" TEXT NOT NULL DEFAULT '',
  "quotaSizeInBytes" INTEGER,
  "quotaUsageInBytes" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','removing','deleted')),
  "profileChangedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_user_updatedAt_id" ON "user" ("updatedAt", "id");
CREATE INDEX IF NOT EXISTS "IDX_user_updateId" ON "user" ("updateId");

-- ============================================================================
-- user_metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS "user_metadata" (
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updateId" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("userId", "key"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_user_metadata_update_id" ON "user_metadata" ("updateId");
CREATE INDEX IF NOT EXISTS "IDX_user_metadata_updated_at" ON "user_metadata" ("updatedAt");

-- ============================================================================
-- session
-- ============================================================================
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "expiresAt" TEXT,
  "userId" TEXT NOT NULL,
  "parentId" TEXT,
  "deviceType" TEXT NOT NULL DEFAULT '',
  "deviceOS" TEXT NOT NULL DEFAULT '',
  "appVersion" TEXT,
  "updateId" TEXT NOT NULL DEFAULT '',
  "isPendingSyncReset" INTEGER NOT NULL DEFAULT 0,
  "pinExpiresAt" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("parentId") REFERENCES "session" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_session_updateId" ON "session" ("updateId");

-- ============================================================================
-- api_key
-- ============================================================================
CREATE TABLE IF NOT EXISTS "api_key" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "permissions" TEXT NOT NULL,  -- JSON array of permission strings
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_api_key_updateId" ON "api_key" ("updateId");

-- ============================================================================
-- stack
-- ============================================================================
-- Created before asset since asset references stack
CREATE TABLE IF NOT EXISTS "stack" (
  "id" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updateId" TEXT NOT NULL DEFAULT '',
  "primaryAssetId" TEXT NOT NULL UNIQUE,
  "ownerId" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE
  -- FK to asset added after asset table creation
);

-- ============================================================================
-- asset
-- ============================================================================
CREATE TABLE IF NOT EXISTS "asset" (
  "id" TEXT NOT NULL,
  "deviceAssetId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('IMAGE','VIDEO','AUDIO','OTHER')),
  "originalPath" TEXT NOT NULL,
  "fileCreatedAt" TEXT NOT NULL,
  "fileModifiedAt" TEXT NOT NULL,
  "isFavorite" INTEGER NOT NULL DEFAULT 0,
  "duration" TEXT,
  "encodedVideoPath" TEXT DEFAULT '',
  "checksum" BLOB NOT NULL,
  "livePhotoVideoId" TEXT,
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "originalFileName" TEXT NOT NULL,
  "thumbhash" BLOB,
  "isOffline" INTEGER NOT NULL DEFAULT 0,
  "libraryId" TEXT,
  "isExternal" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TEXT,
  "localDateTime" TEXT NOT NULL,
  "stackId" TEXT,
  "duplicateId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','trashed','deleted')),
  "updateId" TEXT NOT NULL DEFAULT '',
  "visibility" TEXT NOT NULL DEFAULT 'timeline' CHECK ("visibility" IN ('archive','timeline','hidden','locked')),
  "width" INTEGER,
  "height" INTEGER,
  "isEdited" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("livePhotoVideoId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY ("stackId") REFERENCES "stack" ("id") ON UPDATE CASCADE ON DELETE SET NULL
);

-- Add the deferred FK from stack -> asset now that asset exists
-- Note: SQLite doesn't support ALTER TABLE ADD CONSTRAINT for FK, so we rely on
-- the stack.primaryAssetId being enforced at the application level.
-- The FK relationship is: stack.primaryAssetId -> asset.id

CREATE INDEX IF NOT EXISTS "IDX_asset_fileCreatedAt" ON "asset" ("fileCreatedAt");
CREATE INDEX IF NOT EXISTS "IDX_asset_checksum" ON "asset" ("checksum");
CREATE INDEX IF NOT EXISTS "IDX_asset_originalFileName" ON "asset" ("originalFileName");
CREATE INDEX IF NOT EXISTS "IDX_asset_duplicateId" ON "asset" ("duplicateId");
CREATE INDEX IF NOT EXISTS "IDX_asset_updateId" ON "asset" ("updateId");
CREATE INDEX IF NOT EXISTS "IDX_asset_originalPath_libraryId" ON "asset" ("originalPath", "libraryId");
CREATE INDEX IF NOT EXISTS "IDX_asset_id_stackId" ON "asset" ("id", "stackId");
-- Unique constraint: checksum per user for non-library assets
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_asset_owner_checksum_no_library" ON "asset" ("ownerId", "checksum") WHERE ("libraryId" IS NULL);
-- Unique constraint: checksum per user+library for library assets
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_asset_owner_library_checksum" ON "asset" ("ownerId", "libraryId", "checksum") WHERE ("libraryId" IS NOT NULL);

-- ============================================================================
-- asset_exif
-- ============================================================================
CREATE TABLE IF NOT EXISTS "asset_exif" (
  "assetId" TEXT NOT NULL,
  "make" TEXT,
  "model" TEXT,
  "exifImageWidth" INTEGER,
  "exifImageHeight" INTEGER,
  "fileSizeInByte" INTEGER,
  "orientation" TEXT,
  "dateTimeOriginal" TEXT,
  "modifyDate" TEXT,
  "lensModel" TEXT,
  "fNumber" REAL,
  "focalLength" REAL,
  "iso" INTEGER,
  "latitude" REAL,
  "longitude" REAL,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "fps" REAL,
  "exposureTime" TEXT,
  "livePhotoCID" TEXT,
  "timeZone" TEXT,
  "projectionType" TEXT,
  "profileDescription" TEXT,
  "colorspace" TEXT,
  "bitsPerSample" INTEGER,
  "autoStackId" TEXT,
  "rating" INTEGER,
  "tags" TEXT,            -- JSON array of strings (PostgreSQL varchar[])
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updateId" TEXT NOT NULL DEFAULT '',
  "lockedProperties" TEXT, -- JSON array of strings (PostgreSQL varchar[])
  PRIMARY KEY ("assetId"),
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_asset_exif_city" ON "asset_exif" ("city");
CREATE INDEX IF NOT EXISTS "IDX_asset_exif_livePhotoCID" ON "asset_exif" ("livePhotoCID");
CREATE INDEX IF NOT EXISTS "IDX_asset_exif_autoStackId" ON "asset_exif" ("autoStackId");
CREATE INDEX IF NOT EXISTS "IDX_asset_exif_updateId" ON "asset_exif" ("updateId");

-- ============================================================================
-- asset_file
-- ============================================================================
CREATE TABLE IF NOT EXISTS "asset_file" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "type" TEXT NOT NULL CHECK ("type" IN ('fullsize','preview','thumbnail','sidecar')),
  "path" TEXT NOT NULL,
  "updateId" TEXT NOT NULL DEFAULT '',
  "isEdited" INTEGER NOT NULL DEFAULT 0,
  "isProgressive" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE ("assetId", "type", "isEdited")
);

CREATE INDEX IF NOT EXISTS "IDX_asset_file_updateId" ON "asset_file" ("updateId");

-- ============================================================================
-- asset_metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS "asset_metadata" (
  "assetId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,  -- JSON
  "updateId" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("assetId", "key"),
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_asset_metadata_updateId" ON "asset_metadata" ("updateId");
CREATE INDEX IF NOT EXISTS "IDX_asset_metadata_updatedAt" ON "asset_metadata" ("updatedAt");

-- ============================================================================
-- asset_edit
-- ============================================================================
CREATE TABLE IF NOT EXISTS "asset_edit" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "parameters" TEXT NOT NULL,  -- JSON
  "sequence" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE ("assetId", "sequence")
);

-- ============================================================================
-- album
-- ============================================================================
CREATE TABLE IF NOT EXISTS "album" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "albumName" TEXT NOT NULL DEFAULT 'Untitled Album',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "albumThumbnailAssetId" TEXT,
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "description" TEXT NOT NULL DEFAULT '',
  "deletedAt" TEXT,
  "isActivityEnabled" INTEGER NOT NULL DEFAULT 1,
  "order" TEXT NOT NULL DEFAULT 'desc' CHECK ("order" IN ('asc','desc')),
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("id"),
  FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("albumThumbnailAssetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_album_updateId" ON "album" ("updateId");

-- ============================================================================
-- album_asset
-- ============================================================================
CREATE TABLE IF NOT EXISTS "album_asset" (
  "albumId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("albumId", "assetId"),
  FOREIGN KEY ("albumId") REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_album_asset_updateId" ON "album_asset" ("updateId");

-- ============================================================================
-- album_user
-- ============================================================================
CREATE TABLE IF NOT EXISTS "album_user" (
  "albumId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'editor' CHECK ("role" IN ('editor','viewer')),
  "createId" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updateId" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("albumId", "userId"),
  FOREIGN KEY ("albumId") REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_album_user_createId" ON "album_user" ("createId");
CREATE INDEX IF NOT EXISTS "IDX_album_user_updateId" ON "album_user" ("updateId");

-- ============================================================================
-- activity
-- ============================================================================
CREATE TABLE IF NOT EXISTS "activity" (
  "id" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "albumId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assetId" TEXT,
  "comment" TEXT,
  "isLiked" INTEGER NOT NULL DEFAULT 0,
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("id"),
  FOREIGN KEY ("albumId") REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  -- Compound FK: activity must reference an existing album_asset pair
  FOREIGN KEY ("albumId", "assetId") REFERENCES "album_asset" ("albumId", "assetId") ON DELETE CASCADE,
  -- A user can only like once per asset+album combination
  CHECK (("comment" IS NULL AND "isLiked" = 1) OR ("comment" IS NOT NULL AND "isLiked" = 0))
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_activity_like" ON "activity" ("assetId", "userId", "albumId") WHERE ("isLiked" = 1);
CREATE INDEX IF NOT EXISTS "IDX_activity_updateId" ON "activity" ("updateId");

-- ============================================================================
-- tag
-- ============================================================================
CREATE TABLE IF NOT EXISTS "tag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "color" TEXT,
  "parentId" TEXT,
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("parentId") REFERENCES "tag" ("id") ON DELETE CASCADE,
  UNIQUE ("userId", "value")
);

CREATE INDEX IF NOT EXISTS "IDX_tag_updateId" ON "tag" ("updateId");

-- ============================================================================
-- tag_asset
-- ============================================================================
CREATE TABLE IF NOT EXISTS "tag_asset" (
  "assetId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  PRIMARY KEY ("assetId", "tagId"),
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("tagId") REFERENCES "tag" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_tag_asset_assetId" ON "tag_asset" ("assetId");
CREATE INDEX IF NOT EXISTS "IDX_tag_asset_tagId" ON "tag_asset" ("tagId");
CREATE INDEX IF NOT EXISTS "IDX_tag_asset_assetId_tagId" ON "tag_asset" ("assetId", "tagId");

-- ============================================================================
-- tag_closure (for hierarchical tag relationships)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "tag_closure" (
  "id_ancestor" TEXT NOT NULL,
  "id_descendant" TEXT NOT NULL,
  PRIMARY KEY ("id_ancestor", "id_descendant"),
  FOREIGN KEY ("id_ancestor") REFERENCES "tag" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY ("id_descendant") REFERENCES "tag" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_tag_closure_ancestor" ON "tag_closure" ("id_ancestor");
CREATE INDEX IF NOT EXISTS "IDX_tag_closure_descendant" ON "tag_closure" ("id_descendant");

-- ============================================================================
-- shared_link
-- ============================================================================
CREATE TABLE IF NOT EXISTS "shared_link" (
  "id" TEXT NOT NULL,
  "description" TEXT,
  "userId" TEXT NOT NULL,
  "key" BLOB NOT NULL UNIQUE,
  "type" TEXT NOT NULL CHECK ("type" IN ('ALBUM','INDIVIDUAL')),
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "expiresAt" TEXT,
  "allowUpload" INTEGER NOT NULL DEFAULT 0,
  "albumId" TEXT,
  "allowDownload" INTEGER NOT NULL DEFAULT 1,
  "showExif" INTEGER NOT NULL DEFAULT 1,
  "password" TEXT,
  "slug" TEXT UNIQUE,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("albumId") REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_shared_link_key" ON "shared_link" ("key");

-- ============================================================================
-- shared_link_asset
-- ============================================================================
CREATE TABLE IF NOT EXISTS "shared_link_asset" (
  "assetId" TEXT NOT NULL,
  "sharedLinkId" TEXT NOT NULL,
  PRIMARY KEY ("assetId", "sharedLinkId"),
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("sharedLinkId") REFERENCES "shared_link" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

-- ============================================================================
-- memory
-- ============================================================================
CREATE TABLE IF NOT EXISTS "memory" (
  "id" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "deletedAt" TEXT,
  "ownerId" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('on_this_day')),
  "data" TEXT NOT NULL,  -- JSON
  "isSaved" INTEGER NOT NULL DEFAULT 0,
  "memoryAt" TEXT NOT NULL,
  "seenAt" TEXT,
  "showAt" TEXT,
  "hideAt" TEXT,
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("id"),
  FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_memory_updateId" ON "memory" ("updateId");

-- ============================================================================
-- memory_asset
-- ============================================================================
CREATE TABLE IF NOT EXISTS "memory_asset" (
  "memoriesId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("memoriesId", "assetId"),
  FOREIGN KEY ("memoriesId") REFERENCES "memory" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_memory_asset_updateId" ON "memory_asset" ("updateId");

-- ============================================================================
-- partner
-- ============================================================================
CREATE TABLE IF NOT EXISTS "partner" (
  "sharedById" TEXT NOT NULL,
  "sharedWithId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "createId" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "inTimeline" INTEGER NOT NULL DEFAULT 0,
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("sharedById", "sharedWithId"),
  FOREIGN KEY ("sharedById") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("sharedWithId") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_partner_createId" ON "partner" ("createId");
CREATE INDEX IF NOT EXISTS "IDX_partner_updateId" ON "partner" ("updateId");

-- ============================================================================
-- system_metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS "system_metadata" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,  -- JSON
  PRIMARY KEY ("key")
);

-- ============================================================================
-- version_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS "version_history" (
  "id" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "version" TEXT NOT NULL,
  PRIMARY KEY ("id")
);

-- ============================================================================
-- session_sync_checkpoint
-- ============================================================================
CREATE TABLE IF NOT EXISTS "session_sync_checkpoint" (
  "sessionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "ack" TEXT NOT NULL,
  "updateId" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("sessionId", "type"),
  FOREIGN KEY ("sessionId") REFERENCES "session" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_session_sync_checkpoint_updateId" ON "session_sync_checkpoint" ("updateId");

-- ============================================================================
-- audit (general audit table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "audit" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "entityType" TEXT NOT NULL CHECK ("entityType" IN ('ASSET','ALBUM')),
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('CREATE','UPDATE','DELETE')),
  "ownerId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "IDX_audit_ownerId_createdAt" ON "audit" ("ownerId", "createdAt");

-- ============================================================================
-- Audit tables for sync (no triggers in SQLite - populated by application code)
-- ============================================================================

-- asset_audit
CREATE TABLE IF NOT EXISTS "asset_audit" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_asset_audit_assetId" ON "asset_audit" ("assetId");
CREATE INDEX IF NOT EXISTS "IDX_asset_audit_ownerId" ON "asset_audit" ("ownerId");
CREATE INDEX IF NOT EXISTS "IDX_asset_audit_deletedAt" ON "asset_audit" ("deletedAt");

-- album_audit
CREATE TABLE IF NOT EXISTS "album_audit" (
  "id" TEXT NOT NULL,
  "albumId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_album_audit_albumId" ON "album_audit" ("albumId");
CREATE INDEX IF NOT EXISTS "IDX_album_audit_userId" ON "album_audit" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_album_audit_deletedAt" ON "album_audit" ("deletedAt");

-- partner_audit
CREATE TABLE IF NOT EXISTS "partner_audit" (
  "id" TEXT NOT NULL,
  "sharedById" TEXT NOT NULL,
  "sharedWithId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_partner_audit_sharedById" ON "partner_audit" ("sharedById");
CREATE INDEX IF NOT EXISTS "IDX_partner_audit_sharedWithId" ON "partner_audit" ("sharedWithId");
CREATE INDEX IF NOT EXISTS "IDX_partner_audit_deletedAt" ON "partner_audit" ("deletedAt");

-- stack_audit
CREATE TABLE IF NOT EXISTS "stack_audit" (
  "id" TEXT NOT NULL,
  "stackId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_stack_audit_deletedAt" ON "stack_audit" ("deletedAt");

-- album_user_audit
CREATE TABLE IF NOT EXISTS "album_user_audit" (
  "id" TEXT NOT NULL,
  "albumId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_album_user_audit_albumId" ON "album_user_audit" ("albumId");
CREATE INDEX IF NOT EXISTS "IDX_album_user_audit_userId" ON "album_user_audit" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_album_user_audit_deletedAt" ON "album_user_audit" ("deletedAt");

-- album_asset_audit
CREATE TABLE IF NOT EXISTS "album_asset_audit" (
  "id" TEXT NOT NULL,
  "albumId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("albumId") REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_album_asset_audit_assetId" ON "album_asset_audit" ("assetId");
CREATE INDEX IF NOT EXISTS "IDX_album_asset_audit_deletedAt" ON "album_asset_audit" ("deletedAt");

-- memory_audit
CREATE TABLE IF NOT EXISTS "memory_audit" (
  "id" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_memory_audit_memoryId" ON "memory_audit" ("memoryId");
CREATE INDEX IF NOT EXISTS "IDX_memory_audit_userId" ON "memory_audit" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_memory_audit_deletedAt" ON "memory_audit" ("deletedAt");

-- memory_asset_audit
CREATE TABLE IF NOT EXISTS "memory_asset_audit" (
  "id" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("memoryId") REFERENCES "memory" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_memory_asset_audit_assetId" ON "memory_asset_audit" ("assetId");
CREATE INDEX IF NOT EXISTS "IDX_memory_asset_audit_deletedAt" ON "memory_asset_audit" ("deletedAt");

-- user_audit
CREATE TABLE IF NOT EXISTS "user_audit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_user_audit_deletedAt" ON "user_audit" ("deletedAt");

-- user_metadata_audit
CREATE TABLE IF NOT EXISTS "user_metadata_audit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_user_metadata_audit_user_id" ON "user_metadata_audit" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_user_metadata_audit_key" ON "user_metadata_audit" ("key");
CREATE INDEX IF NOT EXISTS "IDX_user_metadata_audit_deleted_at" ON "user_metadata_audit" ("deletedAt");

-- asset_metadata_audit
CREATE TABLE IF NOT EXISTS "asset_metadata_audit" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "deletedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_asset_metadata_audit_assetId" ON "asset_metadata_audit" ("assetId");
CREATE INDEX IF NOT EXISTS "IDX_asset_metadata_audit_key" ON "asset_metadata_audit" ("key");
CREATE INDEX IF NOT EXISTS "IDX_asset_metadata_audit_deletedAt" ON "asset_metadata_audit" ("deletedAt");

-- ============================================================================
-- FTS5 virtual table for filename search
-- (Replaces PostgreSQL gin_trgm_ops trigram index on originalFileName)
-- ============================================================================
CREATE VIRTUAL TABLE IF NOT EXISTS "asset_fts" USING fts5(
  "originalFileName",
  content='asset',
  content_rowid='rowid'
);
