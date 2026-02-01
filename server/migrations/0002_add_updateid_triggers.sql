-- Migration: Add SQLite triggers to auto-generate time-sortable updateId values.
--
-- In PostgreSQL Immich, database triggers auto-set updateId (UUID v7) on every
-- INSERT/UPDATE. The D1/Workers version was missing these triggers, causing
-- updateId to remain '' (empty string) for all rows. This breaks the sync
-- protocol which uses WHERE updateId > checkpoint for pagination.
--
-- The generated updateId format is: 12-char hex millisecond timestamp + 20-char
-- random hex. This is time-sortable (for sync's > comparison) and compatible
-- with the needsFullSync() UUID v7 timestamp extraction.
--
-- Note: SQLite's PRAGMA recursive_triggers is OFF by default, so the UPDATE
-- inside AFTER triggers will not cause infinite recursion.

-- =========================================================================
-- asset
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_asset_insert_updateid
AFTER INSERT ON "asset"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "asset"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

CREATE TRIGGER IF NOT EXISTS trg_asset_update_updateid
AFTER UPDATE ON "asset"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "asset"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

-- =========================================================================
-- asset_exif
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_asset_exif_insert_updateid
AFTER INSERT ON "asset_exif"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "asset_exif"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "assetId" = NEW."assetId";
END;

CREATE TRIGGER IF NOT EXISTS trg_asset_exif_update_updateid
AFTER UPDATE ON "asset_exif"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "asset_exif"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "assetId" = NEW."assetId";
END;

-- =========================================================================
-- asset_metadata
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_asset_metadata_insert_updateid
AFTER INSERT ON "asset_metadata"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "asset_metadata"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "assetId" = NEW."assetId" AND "key" = NEW."key";
END;

CREATE TRIGGER IF NOT EXISTS trg_asset_metadata_update_updateid
AFTER UPDATE ON "asset_metadata"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "asset_metadata"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "assetId" = NEW."assetId" AND "key" = NEW."key";
END;

-- =========================================================================
-- album
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_album_insert_updateid
AFTER INSERT ON "album"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "album"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

CREATE TRIGGER IF NOT EXISTS trg_album_update_updateid
AFTER UPDATE ON "album"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "album"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

-- =========================================================================
-- album_asset
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_album_asset_insert_updateid
AFTER INSERT ON "album_asset"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "album_asset"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "albumId" = NEW."albumId" AND "assetId" = NEW."assetId";
END;

CREATE TRIGGER IF NOT EXISTS trg_album_asset_update_updateid
AFTER UPDATE ON "album_asset"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "album_asset"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "albumId" = NEW."albumId" AND "assetId" = NEW."assetId";
END;

-- =========================================================================
-- album_user
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_album_user_insert_updateid
AFTER INSERT ON "album_user"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "album_user"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "albumId" = NEW."albumId" AND "userId" = NEW."userId";
END;

CREATE TRIGGER IF NOT EXISTS trg_album_user_update_updateid
AFTER UPDATE ON "album_user"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "album_user"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "albumId" = NEW."albumId" AND "userId" = NEW."userId";
END;

-- =========================================================================
-- memory
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_memory_insert_updateid
AFTER INSERT ON "memory"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "memory"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

CREATE TRIGGER IF NOT EXISTS trg_memory_update_updateid
AFTER UPDATE ON "memory"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "memory"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

-- =========================================================================
-- memory_asset
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_memory_asset_insert_updateid
AFTER INSERT ON "memory_asset"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "memory_asset"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "memoriesId" = NEW."memoriesId" AND "assetId" = NEW."assetId";
END;

CREATE TRIGGER IF NOT EXISTS trg_memory_asset_update_updateid
AFTER UPDATE ON "memory_asset"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "memory_asset"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "memoriesId" = NEW."memoriesId" AND "assetId" = NEW."assetId";
END;

-- =========================================================================
-- partner
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_partner_insert_updateid
AFTER INSERT ON "partner"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "partner"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "sharedById" = NEW."sharedById" AND "sharedWithId" = NEW."sharedWithId";
END;

CREATE TRIGGER IF NOT EXISTS trg_partner_update_updateid
AFTER UPDATE ON "partner"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "partner"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "sharedById" = NEW."sharedById" AND "sharedWithId" = NEW."sharedWithId";
END;

-- =========================================================================
-- stack
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_stack_insert_updateid
AFTER INSERT ON "stack"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "stack"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

CREATE TRIGGER IF NOT EXISTS trg_stack_update_updateid
AFTER UPDATE ON "stack"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "stack"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

-- =========================================================================
-- user
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_user_insert_updateid
AFTER INSERT ON "user"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "user"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

CREATE TRIGGER IF NOT EXISTS trg_user_update_updateid
AFTER UPDATE ON "user"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "user"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

-- =========================================================================
-- user_metadata
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_user_metadata_insert_updateid
AFTER INSERT ON "user_metadata"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "user_metadata"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "userId" = NEW."userId" AND "key" = NEW."key";
END;

CREATE TRIGGER IF NOT EXISTS trg_user_metadata_update_updateid
AFTER UPDATE ON "user_metadata"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "user_metadata"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "userId" = NEW."userId" AND "key" = NEW."key";
END;

-- =========================================================================
-- session
-- =========================================================================
CREATE TRIGGER IF NOT EXISTS trg_session_insert_updateid
AFTER INSERT ON "session"
FOR EACH ROW
WHEN NEW."updateId" = '' OR NEW."updateId" IS NULL
BEGIN
  UPDATE "session"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

CREATE TRIGGER IF NOT EXISTS trg_session_update_updateid
AFTER UPDATE ON "session"
FOR EACH ROW
WHEN NEW."updateId" = OLD."updateId"
BEGIN
  UPDATE "session"
  SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10)))
  WHERE "id" = NEW."id";
END;

-- =========================================================================
-- Backfill existing rows that have empty updateId
-- =========================================================================
-- Each UPDATE here will NOT re-trigger the AFTER UPDATE triggers because
-- the WHEN condition checks NEW.updateId = OLD.updateId, and here we're
-- explicitly changing updateId to a new value.

UPDATE "asset" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "asset_exif" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "asset_metadata" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "album" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "album_asset" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "album_user" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "memory" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "memory_asset" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "partner" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "stack" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "user" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "user_metadata" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
UPDATE "session" SET "updateId" = lower(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))) || lower(hex(randomblob(10))) WHERE "updateId" = '';
