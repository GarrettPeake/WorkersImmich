# Immich Cloudflare Workers Conversion: Implementation Plan

This document is the step-by-step implementation guide for converting the Immich photo hosting server from NestJS/PostgreSQL/Node.js to Cloudflare Workers with Hono/D1/KV/R2. It references actual file paths, function names, and specific conversion strategies.

---

## Table of Contents

- [A. Code Removal Plan](#a-code-removal-plan)
- [B. Conversion Points (Ordered)](#b-conversion-points-ordered)
- [C. API Route Preservation](#c-api-route-preservation)
- [D. Code to Remove (Complete File List)](#d-code-to-remove-complete-file-list)
- [E. Testing Plan](#e-testing-plan)
- [F. Key Architecture Decisions](#f-key-architecture-decisions)

---

## A. Code Removal Plan

Code removal is the **first implementation step**. We strip everything out-of-scope before converting what remains, which dramatically reduces the surface area for conversion.

### Removal Categories

#### 1. ML/AI Features (facial recognition, smart search, OCR, duplicates)
These features depend on machine learning models, vector databases, and native binaries that cannot run on Workers.

#### 2. Background Job Infrastructure (BullMQ, microservices worker, cron)
Workers are request-driven. All background job processing, queue management, and scheduled tasks are removed. Any work that was done by background jobs (thumbnail generation, metadata extraction) either happens inline during the request or is deferred.

#### 3. External Library Imports
File-system watching and crawling (chokidar, fast-glob) cannot work on Workers.

#### 4. Map/Geospatial Features
Depends on PostgreSQL `cube`/`earthdistance` extensions and geodata tables. Removed entirely EXCEPT: basic lat/lng storage in EXIF data is preserved, and a Haversine formula utility is provided in application code for any future distance calculations.

#### 5. Video Transcoding
FFmpeg cannot run on Workers. Original videos are served as-is. Video thumbnails are left as a TODO stub.

#### 6. Email/Notifications
nodemailer and React Email templates cannot run on Workers. Notification system removed.

#### 7. OAuth (Simplified)
The full `openid-client` flow is removed. OAuth controller is removed. Authentication is simplified to password + API key + shared links. OAuth can be re-added later using `jose` directly with Workers-compatible OIDC flows.

#### 8. Plugin/Workflow System
The Extism-based plugin system and workflow engine are removed.

#### 9. ~~Sync Protocol~~ — KEPT
The device sync protocol is **kept and converted** (see CP-16.5). It is the mobile app's primary sync mechanism and is critical for mobile compatibility. The Node.js `Writable` streaming is converted to Web `ReadableStream`, and the audit table cleanup background job is handled via Cloudflare Cron Triggers or inline cleanup.

#### 10. Telemetry/OpenTelemetry
All OpenTelemetry packages and telemetry reporting are removed.

#### 11. CLI Commands
nest-commander CLI commands are removed (server runs as a Worker, not a CLI app).

#### 12. Maintenance Mode
The separate maintenance worker and health check system is removed.

#### 13. Database Backup
Database backup controller/service removed (D1 has its own backup mechanism).

#### 14. WebSocket/Real-time
Socket.IO, Redis pub/sub adapter, and real-time events are removed.

#### 15. ~~Views~~ — KEPT
The view/folder browsing feature is **kept and converted** (see CP-17.5). It is a simple "browse by folder" feature with only 2 endpoints and ~100 lines of code.

---

## B. Conversion Points (Ordered)

Each conversion point builds on the previous ones. Implement them in this order.

---

### CP-1: Project Scaffolding

**What:** Create the Cloudflare Workers project structure with wrangler.toml, package.json, and the Hono entry point.

**How:**

1. Create `wrangler.toml` at project root:
```toml
name = "immich-workers"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./web"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/.well-known/*", "/custom.css"]

[[d1_databases]]
binding = "DB"
database_name = "immich-db"
database_id = "<to-be-created>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "immich-storage"

[[kv_namespaces]]
binding = "KV"
id = "<to-be-created>"

[vars]
ENVIRONMENT = "production"
```

2. Create `package.json` with dependencies:
   - `hono` (framework)
   - `kysely` + `kysely-d1` (query builder with D1 dialect)
   - `zod` (validation)
   - `jose` (JWT handling)
   - `bcryptjs` (password hashing, pure JS)
   - `cookie` (cookie parsing)
   - `luxon` (date/time)
   - `uuid` (UUID generation)
   - `sanitize-filename` (filename sanitization)
   - `thumbhash` (visual hashing)
   - `fflate` (ZIP creation for downloads)
   - `exifreader` (pure JS EXIF parsing)
   - `ua-parser-js` (user agent parsing)

3. Create `src/index.ts` as the Hono entry point:
```typescript
import { Hono } from 'hono';
import { Env } from './env';
// ... route imports

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', errorHandler());
app.use('/api/*', authMiddleware());

// Route groups
app.route('/api/activities', activityRoutes);
app.route('/api/albums', albumRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/view', viewRoutes);
// ... etc

// Well-known and custom CSS (non-API routes)
app.get('/.well-known/immich', (c) => c.json({ api: { endpoint: '/api' } }));
app.get('/custom.css', customCssHandler);

// Fallback to static assets
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
```

**Dependencies:** None (first step)
**Estimated complexity:** S

---

### CP-2: Code Removal

**What:** Remove all out-of-scope files identified in Section A and Section D.

**How:**
1. Delete all files listed in Section D below
2. Remove all import references to deleted files from remaining code
3. Strip NestJS decorators, module definitions, and DI infrastructure from remaining files
4. Remove all `*.spec.ts` test files (tests will be rewritten for Workers)
5. Remove `server/src/app.module.ts`, `server/src/main.ts`, `server/src/workers/`

**Dependencies:** CP-1
**Estimated complexity:** M (mechanical but extensive)

---

### CP-3: Environment & Configuration

**What:** Replace `process.env` config, NestJS ConfigRepository, and the module-level config caching with Workers environment bindings and KV-backed config cache.

**How:**

1. Create `src/env.ts` defining the Workers environment type:
```typescript
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  KV: KVNamespace;
  ASSETS: Fetcher;
  IMAGES: any; // Cloudflare Images binding
  ENVIRONMENT: string;
}
```

2. Create `src/config.ts` replacing `server/src/repositories/config.repository.ts` and `server/src/utils/config.ts`:
   - System config is loaded from D1 `system_metadata` table
   - Cached in KV with a 60-second TTL for cross-request persistence
   - `getConfig(env)` reads from KV first, falls back to D1
   - `updateConfig(env, newConfig)` writes to D1 and invalidates KV cache

3. Remove `server/src/repositories/config.repository.ts` (reads process.env)
4. Remove `server/src/constants.ts` and inline necessary constants

**Files to convert:**
- `server/src/repositories/config.repository.ts` -> `src/config.ts`
- `server/src/utils/config.ts` -> merged into `src/config.ts`
- `server/src/constants.ts` -> `src/constants.ts` (simplified)

**Dependencies:** CP-1
**Estimated complexity:** M

---

### CP-4: Database Schema (D1)

**What:** Create a single initial D1/SQLite schema from the existing PostgreSQL schema, covering all in-scope tables.

**How:**

1. Create `migrations/0001_initial.sql` with SQLite-compatible DDL for these tables:

**Core tables to include:**
- `users` (from `server/src/schema/tables/user.table.ts`)
- `user_metadata` (from `server/src/schema/tables/user-metadata.table.ts`)
- `sessions` (from `server/src/schema/tables/session.table.ts`)
- `api_keys` (from `server/src/schema/tables/api-key.table.ts`)
- `assets` (from `server/src/schema/tables/asset.table.ts`)
- `asset_exif` (from `server/src/schema/tables/asset-exif.table.ts`)
- `asset_files` (from `server/src/schema/tables/asset-file.table.ts`)
- `asset_metadata` (from `server/src/schema/tables/asset-metadata.table.ts`)
- `asset_edits` (from `server/src/schema/tables/asset-edit.table.ts`)
- `albums` (from `server/src/schema/tables/album.table.ts`)
- `album_assets` (from `server/src/schema/tables/album-asset.table.ts`)
- `album_users` (from `server/src/schema/tables/album-user.table.ts`)
- `activities` (from `server/src/schema/tables/activity.table.ts`)
- `tags` (from `server/src/schema/tables/tag.table.ts`)
- `tag_assets` (from `server/src/schema/tables/tag-asset.table.ts`)
- `tag_closure` (from `server/src/schema/tables/tag-closure.table.ts`)
- `stacks` (from `server/src/schema/tables/stack.table.ts`)
- `shared_links` (from `server/src/schema/tables/shared-link.table.ts`)
- `shared_link_assets` (from `server/src/schema/tables/shared-link-asset.table.ts`)
- `memories` (from `server/src/schema/tables/memory.table.ts`)
- `memory_assets` (from `server/src/schema/tables/memory-asset.table.ts`)
- `partners` (from `server/src/schema/tables/partner.table.ts`)
- `system_metadata` (from `server/src/schema/tables/system-metadata.table.ts`)
- `version_history` (from `server/src/schema/tables/version-history.table.ts`)
- `session_sync_checkpoint` (from `server/src/schema/tables/sync-checkpoint.table.ts`) — used by sync protocol
- `audit` (from `server/src/schema/tables/audit.table.ts`) — general audit table used by sync
- `asset_audit` — sync depends on this for asset change tracking
- `album_audit` — sync depends on this for album change tracking
- `partner_audit` — sync depends on this for partner change tracking
- `stack_audit` — sync depends on this for stack change tracking
- `album_user_audit` — sync depends on this for album user change tracking
- `album_asset_audit` — sync depends on this for album asset change tracking
- `memory_audit` — sync depends on this for memory change tracking
- `memory_asset_audit` — sync depends on this for memory asset change tracking
- `user_audit` — sync depends on this for user change tracking
- `user_metadata_audit` — sync depends on this for user metadata change tracking
- `asset_metadata_audit` — sync depends on this for asset metadata change tracking

**Key SQLite conversions:**
- PostgreSQL `uuid` type -> `TEXT` (store as string)
- `bytea` -> `BLOB`
- Custom enums (`assets_status_enum`, etc.) -> `TEXT` with `CHECK` constraints
- `timestamptz` -> `TEXT` (ISO 8601 strings)
- `bigint` -> `INTEGER`
- `jsonb` -> `TEXT` (JSON stored as string)
- No `DEFAULT immich_uuid_v7()` -> UUIDs generated in application code
- No triggers -> `updatedAt` set in application code before each UPDATE

2. Create `src/db.ts` setting up Kysely with D1 dialect:
```typescript
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';

export function createDb(d1: D1Database) {
  return new Kysely<DB>({
    dialect: new D1Dialect({ database: d1 }),
  });
}
```

3. Create `src/schema.ts` with the `DB` interface (TypeScript types for all tables).

4. Replace `jsonArrayFrom`/`jsonObjectFrom` from `kysely/helpers/postgres` with SQLite equivalents using `json_group_array()` and `json_object()`.

5. Create a UUIDv7 generator in application code:
```typescript
// src/utils/uuid.ts
export function generateUUIDv7(): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  // Embed timestamp in the UUID for time-ordering
  const hex = timestamp.toString(16).padStart(12, '0');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-7${uuid.slice(15)}`;
}
```

**Dependencies:** CP-1, CP-2
**Estimated complexity:** L (many tables, many SQL syntax conversions)

---

### CP-5: Crypto & Utilities

**What:** Replace Node.js `crypto`, `bcrypt`, and `jsonwebtoken` with Workers-compatible alternatives.

**How:**

1. Create `src/repositories/crypto.repository.ts` replacing `server/src/repositories/crypto.repository.ts`:
   - `hashBcrypt(password, rounds)` -> use `bcryptjs.hash()`
   - `compareBcrypt(password, hash)` -> use `bcryptjs.compare()`
   - `hashSha256(value)` -> `crypto.subtle.digest('SHA-256', ...)`; return base64
   - `hashSha1(data)` -> `crypto.subtle.digest('SHA-1', ...)`; return Buffer
   - `randomUUID()` -> `crypto.randomUUID()`
   - `randomBytes(size)` -> `crypto.getRandomValues(new Uint8Array(size))`
   - `newPassword(size)` -> generate random string from randomBytes
   - JWT sign/verify -> use `jose` library (`SignJWT`, `jwtVerify`)
   - License verification (`createPublicKey`, `createVerify`) -> `crypto.subtle.importKey()` + `crypto.subtle.verify()`

2. Create `src/utils/path.ts` replacing Node.js `path` usage:
   - `basename(path)` -> `path.split('/').pop()`
   - `extname(path)` -> last `.` segment extraction
   - `join(...parts)` -> `parts.filter(Boolean).join('/')`
   - `parse(path)` -> manual split into `{ name, ext, dir }`

3. Create `src/utils/stream.ts` for stream utilities:
   - Replace Node.js `Readable`/`Writable` with Web Streams API
   - Replace `PassThrough` with `TransformStream`

**Files to convert:**
- `server/src/repositories/crypto.repository.ts` -> `src/repositories/crypto.repository.ts`
- Various `node:path` usages across all remaining files

**Dependencies:** CP-1
**Estimated complexity:** M

---

### CP-6: Validation Layer (Zod)

**What:** Replace all `class-validator`/`class-transformer` DTO decorators with Zod schemas.

**How:**

1. For each DTO file in `server/src/dtos/`, create a corresponding Zod schema:

```typescript
// Example: server/src/dtos/activity.dto.ts uses @IsString(), @IsOptional(), etc.
// Becomes:
import { z } from 'zod';

export const ActivitySearchSchema = z.object({
  albumId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  type: z.enum(['comment', 'like']).optional(),
});
export type ActivitySearchDto = z.infer<typeof ActivitySearchSchema>;

export const ActivityCreateSchema = z.object({
  albumId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  type: z.enum(['comment', 'like']),
  comment: z.string().optional(),
});
export type ActivityCreateDto = z.infer<typeof ActivityCreateSchema>;
```

2. Create a Hono middleware helper for validation:
```typescript
// src/middleware/validate.ts
import { zValidator } from '@hono/zod-validator';
// Use zValidator('json', schema) for body, zValidator('query', schema) for query params
```

3. DTOs to convert (in-scope only):
   - `server/src/dtos/activity.dto.ts` -> `src/dtos/activity.dto.ts`
   - `server/src/dtos/album.dto.ts` -> `src/dtos/album.dto.ts`
   - `server/src/dtos/api-key.dto.ts` -> `src/dtos/api-key.dto.ts`
   - `server/src/dtos/asset.dto.ts` -> `src/dtos/asset.dto.ts`
   - `server/src/dtos/asset-media.dto.ts` -> `src/dtos/asset-media.dto.ts`
   - `server/src/dtos/asset-media-response.dto.ts` -> `src/dtos/asset-media-response.dto.ts`
   - `server/src/dtos/asset-response.dto.ts` -> `src/dtos/asset-response.dto.ts`
   - `server/src/dtos/asset-ids.response.dto.ts` -> `src/dtos/asset-ids-response.dto.ts`
   - `server/src/dtos/auth.dto.ts` -> `src/dtos/auth.dto.ts`
   - `server/src/dtos/download.dto.ts` -> `src/dtos/download.dto.ts`
   - `server/src/dtos/editing.dto.ts` -> `src/dtos/editing.dto.ts`
   - `server/src/dtos/exif.dto.ts` -> `src/dtos/exif.dto.ts`
   - `server/src/dtos/license.dto.ts` -> `src/dtos/license.dto.ts`
   - `server/src/dtos/memory.dto.ts` -> `src/dtos/memory.dto.ts`
   - `server/src/dtos/onboarding.dto.ts` -> `src/dtos/onboarding.dto.ts`
   - `server/src/dtos/partner.dto.ts` -> `src/dtos/partner.dto.ts`
   - `server/src/dtos/server.dto.ts` -> `src/dtos/server.dto.ts`
   - `server/src/dtos/session.dto.ts` -> `src/dtos/session.dto.ts`
   - `server/src/dtos/shared-link.dto.ts` -> `src/dtos/shared-link.dto.ts`
   - `server/src/dtos/stack.dto.ts` -> `src/dtos/stack.dto.ts`
   - `server/src/dtos/sync.dto.ts` -> `src/dtos/sync.dto.ts`
   - `server/src/dtos/system-config.dto.ts` -> `src/dtos/system-config.dto.ts` (simplified)
   - `server/src/dtos/tag.dto.ts` -> `src/dtos/tag.dto.ts`
   - `server/src/dtos/time-bucket.dto.ts` -> `src/dtos/time-bucket.dto.ts`
   - `server/src/dtos/trash.dto.ts` -> `src/dtos/trash.dto.ts`
   - `server/src/dtos/user.dto.ts` -> `src/dtos/user.dto.ts`
   - `server/src/dtos/user-preferences.dto.ts` -> `src/dtos/user-preferences.dto.ts`
   - `server/src/dtos/user-profile.dto.ts` -> `src/dtos/user-profile.dto.ts`

4. Replace `server/src/validation.ts` (custom validators like `UUIDParamDto`, `FileNotEmptyValidator`) with Zod schemas:
```typescript
export const UUIDParamSchema = z.object({ id: z.string().uuid() });
```

**Dependencies:** CP-1
**Estimated complexity:** L (many DTO files to convert)

---

### CP-7: Auth System

**What:** Convert the auth guard, session management, API key authentication, and shared link authentication from NestJS to Hono middleware.

**How:**

1. Create `src/middleware/auth.ts` replacing `server/src/middleware/auth.guard.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import { Env } from '../env';

interface AuthOptions {
  permission?: Permission | false;
  admin?: boolean;
  sharedLink?: boolean;
}

export function authMiddleware(options: AuthOptions = {}) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const auth = await authenticate(c, options);
    c.set('auth', auth);
    await next();
  });
}
```

2. Convert `server/src/services/auth.service.ts` authenticate() method:
   - Extract token from:
     - `Authorization: Bearer <token>` header
     - `x-api-key: <key>` header
     - Cookie: `immich_access_token`
     - Query param: `key` (for shared links)
   - Hash token with SHA-256
   - Look up in `sessions` table (for bearer tokens) or `api_keys` table (for API keys)
   - For shared links, look up in `shared_links` table by key or slug
   - Validate permissions against the `AuthenticatedOptions`
   - Set `c.set('auth', authDto)` on context

3. Convert login flow:
   - `AuthService.login()` -> compare bcrypt password, create session token, store SHA-256 hash in D1
   - `AuthService.logout()` -> delete session from D1
   - Cookie handling via Hono's `setCookie`/`deleteCookie` helpers

4. Convert `server/src/services/session.service.ts` for session CRUD
5. Convert `server/src/services/api-key.service.ts` for API key CRUD
6. Convert `server/src/repositories/session.repository.ts` -> D1 queries
7. Convert `server/src/repositories/api-key.repository.ts` -> D1 queries

**Key files to convert:**
- `server/src/middleware/auth.guard.ts` -> `src/middleware/auth.ts`
- `server/src/services/auth.service.ts` -> `src/services/auth.service.ts`
- `server/src/services/session.service.ts` -> `src/services/session.service.ts`
- `server/src/services/api-key.service.ts` -> `src/services/api-key.service.ts`
- `server/src/repositories/session.repository.ts` -> `src/repositories/session.repository.ts`
- `server/src/repositories/api-key.repository.ts` -> `src/repositories/api-key.repository.ts`
- `server/src/repositories/access.repository.ts` -> `src/repositories/access.repository.ts`
- `server/src/utils/access.ts` -> `src/utils/access.ts`

**Dependencies:** CP-3, CP-4, CP-5, CP-6
**Estimated complexity:** L (auth is critical path, must be thorough)

---

### CP-8: Service Wiring (Replace BaseService DI)

**What:** Replace the NestJS `BaseService` "god class" dependency injection pattern with a simple context-based wiring approach.

**How:**

1. Create `src/context.ts` defining a service container:
```typescript
import { Kysely } from 'kysely';
import { DB } from './schema';
import { Env } from './env';

export interface ServiceContext {
  db: Kysely<DB>;
  bucket: R2Bucket;
  kv: KVNamespace;
  env: Env;
}

export function createContext(env: Env): ServiceContext {
  return {
    db: createDb(env.DB),
    bucket: env.BUCKET,
    kv: env.KV,
    env,
  };
}
```

2. Each service receives a `ServiceContext` instead of 50+ injected repositories:
```typescript
// Instead of extending BaseService with 50+ constructor params:
export class AlbumService {
  constructor(private ctx: ServiceContext) {}

  async getAll(auth: AuthDto, query: GetAlbumsDto) {
    // Direct Kysely queries against ctx.db
  }
}
```

3. Repository classes become thin wrappers or are inlined into services:
   - Simple CRUD repositories (activity, album, tag, stack, memory, partner) -> inline queries in service
   - Complex repositories (asset, access) -> keep as separate classes instantiated from context

4. Create the context once per request in middleware:
```typescript
app.use('*', async (c, next) => {
  c.set('ctx', createContext(c.env));
  await next();
});
```

**Dependencies:** CP-4
**Estimated complexity:** M

---

### CP-9: Storage Layer (R2)

**What:** Replace the filesystem-based `StorageRepository` and `StorageCore` with R2 operations.

**How:**

1. Create `src/repositories/storage.repository.ts` replacing `server/src/repositories/storage.repository.ts`:

```typescript
export class StorageRepository {
  constructor(private bucket: R2Bucket) {}

  async readFile(key: string): Promise<ReadableStream | null> {
    const object = await this.bucket.get(key);
    return object?.body ?? null;
  }

  async writeFile(key: string, body: ReadableStream | ArrayBuffer, metadata?: Record<string, string>): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: metadata ? { contentType: metadata.contentType } : undefined,
    });
  }

  async deleteFile(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async fileExists(key: string): Promise<boolean> {
    const head = await this.bucket.head(key);
    return head !== null;
  }

  async getFileInfo(key: string): Promise<R2Object | null> {
    return this.bucket.head(key);
  }
}
```

2. Create `src/cores/storage.core.ts` replacing `server/src/cores/storage.core.ts`:
   - Replace filesystem path generation with R2 key generation
   - Key structure: `assets/{userId}/{assetId}/original.{ext}`
   - Thumbnails: `assets/{userId}/{assetId}/thumbnail.webp`
   - Previews: `assets/{userId}/{assetId}/preview.webp`
   - Profile images: `profiles/{userId}/{uuid}.{ext}`

3. Create helper for serving R2 objects as HTTP responses:
```typescript
export function r2Response(object: R2ObjectBody, filename?: string): Response {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  if (filename) {
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  }
  return new Response(object.body, { headers });
}
```

**Files to convert:**
- `server/src/repositories/storage.repository.ts` -> `src/repositories/storage.repository.ts`
- `server/src/cores/storage.core.ts` -> `src/cores/storage.core.ts`
- `server/src/utils/file.ts` -> `src/utils/file.ts` (simplified)

**Dependencies:** CP-1
**Estimated complexity:** M

---

### CP-10: Image Processing (Cloudflare Images)

**What:** Replace Sharp-based thumbnail/preview generation with Cloudflare Images transforms. Replace ExifTool with a pure-JS EXIF parser.

**How:**

1. Create `src/repositories/media.repository.ts` replacing `server/src/repositories/media.repository.ts`:

```typescript
export class MediaRepository {
  constructor(private env: Env, private bucket: R2Bucket) {}

  async generateThumbnail(r2Key: string, options: { width: number; height: number; format: string; quality: number }): Promise<ReadableStream> {
    const original = await this.bucket.get(r2Key);
    if (!original) throw new Error('Original not found');

    // Use Cloudflare Images transform binding
    const transformed = await this.env.IMAGES.transform(original.body, {
      width: options.width,
      height: options.height,
      fit: 'outside',
      format: options.format as any,
      quality: options.quality,
    });

    return transformed.body;
  }

  async generateThumbhash(r2Key: string): Promise<Uint8Array> {
    const original = await this.bucket.get(r2Key);
    if (!original) throw new Error('Original not found');

    // Resize to 100x100 using CF Images, get raw pixels
    const tiny = await this.env.IMAGES.transform(original.body, {
      width: 100,
      height: 100,
      fit: 'inside',
      format: 'raw', // or use PNG and decode
    });

    // TODO: Decode to RGBA and pass to thumbhash library
    // The thumbhash library (rgbaToThumbHash) is pure JS and Workers-compatible
    return new Uint8Array(); // placeholder
  }

  async extractExif(r2Key: string): Promise<ExifData> {
    const original = await this.bucket.get(r2Key);
    if (!original) throw new Error('Original not found');

    // Use exifreader (pure JS) to parse EXIF
    const buffer = await original.arrayBuffer();
    const tags = ExifReader.load(buffer);
    return mapExifTags(tags);
  }
}
```

2. Variant generation strategy:
   - **On upload**: Generate `thumbnail` (250x250, WebP, q80) and `preview` (1440px longest edge, WebP, q80) immediately
   - Store variants in R2 at `assets/{userId}/{assetId}/thumbnail.webp` and `assets/{userId}/{assetId}/preview.webp`
   - **Original is always preserved** at `assets/{userId}/{assetId}/original.{ext}` so "download original" works

3. RAW file support:
   - Leave a TODO comment in the upload flow:
   ```typescript
   // TODO: RAW file support - when implemented, use a WASM-based RAW decoder
   // or extract embedded JPEG preview. For now, RAW files are stored but
   // thumbnail/preview generation may fail. The original is always preserved.
   if (isRawFormat(mimeType)) {
     // TODO: Extract embedded JPEG from RAW file for thumbnail generation
     logger.warn('RAW file uploaded - thumbnail generation not yet supported');
   }
   ```

4. Video thumbnails:
   - Leave a TODO comment:
   ```typescript
   // TODO: Video thumbnail generation - requires a video processing service
   // (e.g., Cloudflare Stream or an external API). For now, videos are stored
   // without thumbnails. The original video is always preserved and playable.
   if (isVideoFormat(mimeType)) {
     // TODO: Generate video thumbnail frame
     logger.warn('Video uploaded - thumbnail generation not yet supported');
   }
   ```

5. Image edits: Only support what Cloudflare Images provides natively:
   - **Supported**: resize (width/height/fit), format conversion (webp/jpeg/avif), rotation (90/180/270), quality adjustment
   - **Not supported**: arbitrary crop coordinates, affine transforms, flip/flop (unless via rotation)
   - The `server/src/dtos/editing.dto.ts` edit actions should be simplified to only include supported transforms

**Files to convert:**
- `server/src/repositories/media.repository.ts` -> `src/repositories/media.repository.ts`
- `server/src/repositories/metadata.repository.ts` -> `src/repositories/metadata.repository.ts` (EXIF only, pure JS)
- `server/src/services/asset-media.service.ts` -> inline thumbnail generation at upload time

**Dependencies:** CP-9
**Estimated complexity:** L

---

### CP-11: Asset CRUD Routes

**What:** Convert the asset controller and service to Hono routes with D1 queries.

**How:**

1. Create `src/routes/assets.ts`:
   - Convert `AssetController` (`server/src/controllers/asset.controller.ts`) routes
   - Convert `AssetMediaController` (`server/src/controllers/asset-media.controller.ts`) routes

2. Convert upload flow (currently `server/src/services/asset-media.service.ts`):
   - Parse multipart using Hono's `c.req.parseBody()` for the `assetData` and `sidecarFile` fields
   - Compute SHA1 checksum from the file ArrayBuffer using `crypto.subtle.digest('SHA-1', buffer)`
   - Check for duplicates by comparing checksum against existing assets in D1
   - Upload original to R2
   - Generate thumbnail and preview using CF Images (CP-10)
   - Store asset record in D1
   - Extract EXIF metadata using pure-JS parser and store in `asset_exif` table

3. Convert asset viewing/download:
   - Thumbnail: Look up R2 key for thumbnail variant, return with cache headers
   - Original download: Look up R2 key for original, stream response
   - Video playback: Look up R2 key for original video, support Range header for seeking

4. Convert `server/src/repositories/asset.repository.ts` -> `src/repositories/asset.repository.ts`:
   - Rewrite all PostgreSQL-specific queries for SQLite/D1
   - `AT TIME ZONE 'UTC'` -> use `datetime()` SQLite function or store as UTC strings
   - `DISTINCT ON` -> rewrite with window functions: `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`
   - `array_agg()` -> `json_group_array()`
   - `LATERAL JOIN` -> correlated subqueries
   - `unnest()` -> application-level iteration or JSON expansion
   - `generate_series()` -> recursive CTE or application-level loop
   - `bytea` encoding/decoding -> application-level using `btoa()`/`atob()` or hex conversion
   - `date_trunc('MONTH', ...)` -> `strftime('%Y-%m-01', ...)`
   - `extract(epoch from ...)` -> `strftime('%s', ...)`
   - `interval` arithmetic -> `datetime(col, '+5 minutes')`
   - `::uuid` casts -> remove (UUIDs are TEXT in D1)

5. Convert `server/src/services/asset.service.ts` -> `src/services/asset.service.ts`
6. Convert `server/src/services/asset-media.service.ts` -> `src/services/asset-media.service.ts`

**Key routes (see Section C for full list):**
- `POST /api/assets` - upload
- `GET /api/assets/:id` - get info
- `PUT /api/assets/:id` - update
- `DELETE /api/assets` - bulk delete
- `GET /api/assets/:id/original` - download original
- `GET /api/assets/:id/thumbnail` - view thumbnail
- `GET /api/assets/:id/video/playback` - stream video

**Dependencies:** CP-4, CP-7, CP-8, CP-9, CP-10
**Estimated complexity:** L (largest single conversion)

---

### CP-12: Album CRUD Routes

**What:** Convert album controller, service, and repository to Hono routes with D1.

**How:**

1. Create `src/routes/albums.ts` from `server/src/controllers/album.controller.ts`
2. Convert `server/src/services/album.service.ts` -> `src/services/album.service.ts`
3. Convert `server/src/repositories/album.repository.ts` -> `src/repositories/album.repository.ts`:
   - Rewrite `DISTINCT ON` queries
   - Convert `json_agg()`/`to_json()` to SQLite JSON functions
   - Rewrite `array_agg()` to `json_group_array()`
4. Convert `server/src/repositories/album-user.repository.ts` -> `src/repositories/album-user.repository.ts`

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** M

---

### CP-13: Activity CRUD Routes

**What:** Convert activity controller, service, and repository.

**How:**

1. Create `src/routes/activities.ts` from `server/src/controllers/activity.controller.ts`
2. Convert `server/src/services/activity.service.ts` -> `src/services/activity.service.ts`
3. Convert `server/src/repositories/activity.repository.ts` -> `src/repositories/activity.repository.ts`

This is a straightforward CRUD conversion with simple D1 queries.

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** S

---

### CP-14: Tag CRUD Routes

**What:** Convert tag controller, service, and repository (including hierarchical tag closure table).

**How:**

1. Create `src/routes/tags.ts` from `server/src/controllers/tag.controller.ts`
2. Convert `server/src/services/tag.service.ts` -> `src/services/tag.service.ts`
3. Convert `server/src/repositories/tag.repository.ts` -> `src/repositories/tag.repository.ts`:
   - The `tag_closure` table for hierarchical tags uses recursive CTEs which SQLite supports
   - Ensure closure table maintenance (insert/delete ancestors) works with D1

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** M

---

### CP-15: Stack CRUD Routes

**What:** Convert stack controller, service, and repository.

**How:**

1. Create `src/routes/stacks.ts` from `server/src/controllers/stack.controller.ts`
2. Convert `server/src/services/stack.service.ts` -> `src/services/stack.service.ts`
3. Convert `server/src/repositories/stack.repository.ts` -> `src/repositories/stack.repository.ts`

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** S

---

### CP-16: Memory CRUD Routes

**What:** Convert memory controller, service, and repository.

**How:**

1. Create `src/routes/memories.ts` from `server/src/controllers/memory.controller.ts`
2. Convert `server/src/services/memory.service.ts` -> `src/services/memory.service.ts`
3. Convert `server/src/repositories/memory.repository.ts` -> `src/repositories/memory.repository.ts`

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** S

---

### CP-16.5: Sync Protocol Routes

**What:** Convert the sync protocol (~2,200 lines across 6 files) that the mobile app relies on as its primary sync mechanism. This covers 20 entity types streamed via JSON Lines format.

**How:**

1. Create `src/routes/sync.ts` from `server/src/controllers/sync.controller.ts`:
   - `POST /sync/stream` — the primary endpoint; client sends a list of sync types with checkpoints, server streams back changed entities
   - `POST /sync/full-sync` — deprecated but still functional legacy endpoint
   - `POST /sync/delta-sync` — deprecated but still functional legacy endpoint
   - `GET /sync/ack` — get current sync acknowledgements
   - `POST /sync/ack` — set sync acknowledgement
   - `DELETE /sync/ack` — clear sync acknowledgements

2. Convert streaming from Node.js `Writable` to Web `ReadableStream`:
```typescript
// Old: uses Node.js Writable stream for JSON Lines output
// New: use ReadableStream with a TransformStream for JSON Lines
function createJsonLinesStream(): { readable: ReadableStream; write: (data: any) => void; close: () => void } {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  return {
    readable,
    write: (data: any) => writer.write(encoder.encode(JSON.stringify(data) + '\n')),
    close: () => writer.close(),
  };
}
```

3. Convert `server/src/services/sync.service.ts` -> `src/services/sync.service.ts`:
   - Rewrite entity sync handlers to use D1/SQLite queries via Kysely
   - Stub out sync types for removed features with empty responses:
     - `PeopleV1` -> return empty array (people feature removed)
     - `AssetFacesV1` -> return empty array (face recognition removed)
   - Keep all other sync types: users, partners, assets, asset exif, albums, album assets, album users, memories, memory assets, stacks, tags, tag assets, shared links, shared link assets, sessions, asset metadata, user metadata

4. Convert `server/src/repositories/sync.repository.ts` -> `src/repositories/sync.repository.ts`:
   - Rewrite PostgreSQL Kysely queries to D1/SQLite syntax
   - Audit table queries use `>` comparisons on timestamps — ensure ISO 8601 text comparisons work correctly in SQLite

5. Convert `server/src/repositories/sync-checkpoint.repository.ts` -> `src/repositories/sync-checkpoint.repository.ts`:
   - Simple CRUD on `session_sync_checkpoint` table

6. Convert `server/src/dtos/sync.dto.ts` -> `src/dtos/sync.dto.ts`:
   - Replace class-validator decorators with Zod schemas

7. Convert `server/src/utils/sync.ts` -> `src/utils/sync.ts`:
   - Sync utility functions

8. Keep audit tables that sync depends on (these are NOT removed):
   - `asset_audit`, `album_audit`, `partner_audit`, `stack_audit`
   - `album_user_audit`, `album_asset_audit`
   - `memory_audit`, `memory_asset_audit`
   - `user_audit`, `user_metadata_audit`, `asset_metadata_audit`
   - Remove only: `person_audit`, `asset_face_audit` (dropped features)

9. Audit table cleanup (originally a background job):
   - Option A: Use Cloudflare Cron Trigger to run cleanup periodically (add to `wrangler.toml` `[triggers]`)
   - Option B: Inline cleanup during sync requests — delete audit records older than 24h after responding

**Files to convert:**
- `server/src/controllers/sync.controller.ts` -> `src/routes/sync.ts`
- `server/src/services/sync.service.ts` -> `src/services/sync.service.ts`
- `server/src/repositories/sync.repository.ts` -> `src/repositories/sync.repository.ts`
- `server/src/repositories/sync-checkpoint.repository.ts` -> `src/repositories/sync-checkpoint.repository.ts`
- `server/src/dtos/sync.dto.ts` -> `src/dtos/sync.dto.ts`
- `server/src/utils/sync.ts` -> `src/utils/sync.ts`

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** L (streaming conversion, 20 entity types, audit table dependencies)

---

### CP-17.5: View/Folder Routes

**What:** Convert the view/folder browsing feature (2 endpoints, ~100 lines of code).

**How:**

1. Create `src/routes/views.ts` from `server/src/controllers/view.controller.ts`:
   - `GET /view/folder/unique-paths` — returns unique folder paths for the user's assets
   - `GET /view/folder` — returns assets within a specific folder path

2. Convert `server/src/services/view.service.ts` -> `src/services/view.service.ts`

3. Convert `server/src/repositories/view-repository.ts` -> `src/repositories/view.repository.ts`:
   - Replace PostgreSQL `substring(path from '...')` regex with SQLite equivalent
   - Use `instr()` and `substr()` for path extraction, or store folder paths as a separate indexed column
   - Example: `substring("originalPath" from '^(.*/)') ` -> `substr("originalPath", 1, instr("originalPath", replace("originalPath", rtrim("originalPath", replace("originalPath", '/', '')), '')))`
   - Alternatively, maintain a computed `folderPath` column populated on asset insert/update

**Files to convert:**
- `server/src/controllers/view.controller.ts` -> `src/routes/views.ts`
- `server/src/services/view.service.ts` -> `src/services/view.service.ts`
- `server/src/repositories/view-repository.ts` -> `src/repositories/view.repository.ts`

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** S

---

### CP-17: Partner CRUD Routes

**What:** Convert partner controller, service, and repository.

**How:**

1. Create `src/routes/partners.ts` from `server/src/controllers/partner.controller.ts`
2. Convert `server/src/services/partner.service.ts` -> `src/services/partner.service.ts`
3. Convert `server/src/repositories/partner.repository.ts` -> `src/repositories/partner.repository.ts`

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** S

---

### CP-18: User & Server Info Routes

**What:** Convert user controller, user-admin controller, and server controller.

**How:**

1. Create `src/routes/users.ts` from `server/src/controllers/user.controller.ts`:
   - Profile image upload/download uses R2 (CP-9)
   - License, onboarding, preferences are simple D1 CRUD

2. Create `src/routes/admin/users.ts` from `server/src/controllers/user-admin.controller.ts`

3. Create `src/routes/server.ts` from `server/src/controllers/server.controller.ts`:
   - `GET /api/server/ping` -> static response
   - `GET /api/server/version` -> return version from constants
   - `GET /api/server/features` -> return simplified feature flags
   - `GET /api/server/config` -> return config from D1/KV
   - `GET /api/server/about` -> return static server info
   - `GET /api/server/storage` -> query R2 usage (or return simplified stats)
   - `GET /api/server/statistics` -> query D1 for asset/user counts
   - `GET /api/server/media-types` -> return static media type list

4. Convert `server/src/services/user.service.ts` -> `src/services/user.service.ts`
5. Convert `server/src/services/user-admin.service.ts` -> `src/services/user-admin.service.ts`
6. Convert `server/src/services/server.service.ts` -> `src/services/server.service.ts`
7. Convert `server/src/repositories/user.repository.ts` -> `src/repositories/user.repository.ts`

**Dependencies:** CP-4, CP-7, CP-8, CP-9
**Estimated complexity:** M

---

### CP-19: Shared Links

**What:** Convert shared link controller, service, and repository.

**How:**

1. Create `src/routes/shared-links.ts` from `server/src/controllers/shared-link.controller.ts`
2. Convert `server/src/services/shared-link.service.ts` -> `src/services/shared-link.service.ts`
3. Convert `server/src/repositories/shared-link.repository.ts` -> `src/repositories/shared-link.repository.ts`
4. Convert `server/src/repositories/shared-link-asset.repository.ts` -> `src/repositories/shared-link-asset.repository.ts`

Shared link auth is handled in CP-7. This step covers the CRUD management of shared links.

**Dependencies:** CP-4, CP-7, CP-8
**Estimated complexity:** M

---

### CP-20: Trash Management

**What:** Convert trash controller and service.

**How:**

1. Create `src/routes/trash.ts` from `server/src/controllers/trash.controller.ts`
2. Convert `server/src/services/trash.service.ts` -> `src/services/trash.service.ts`
3. Convert `server/src/repositories/trash.repository.ts` -> `src/repositories/trash.repository.ts`

Trash operates by updating asset `deletedAt` and `status` fields. In the original, a background job permanently deletes assets. In Workers, `POST /api/trash/empty` will immediately hard-delete assets and their R2 objects.

**Dependencies:** CP-4, CP-7, CP-8, CP-9
**Estimated complexity:** S

---

### CP-21: Download/Archive Functionality

**What:** Replace `archiver` (Node.js streams) with `fflate` for in-memory ZIP creation.

**How:**

1. Create `src/services/download.service.ts` from `server/src/services/download.service.ts`:
   - `getDownloadInfo()` -> same logic but queries D1 instead of PG
   - `downloadArchive()` -> replaced implementation:

```typescript
import { Zip, ZipPassThrough } from 'fflate';

async downloadArchive(auth: AuthDto, dto: AssetIdsDto): Promise<Response> {
  await this.requireAccess({ auth, permission: Permission.AssetDownload, ids: dto.assetIds });

  const assets = await this.assetRepository.getByIds(dto.assetIds);

  // Create a streaming ZIP using fflate
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const zip = new Zip((err, data, final) => {
    if (err) { writer.abort(err); return; }
    writer.write(data);
    if (final) writer.close();
  });

  // Process each asset
  (async () => {
    for (const asset of assets) {
      const r2Key = getOriginalR2Key(asset);
      const object = await this.ctx.bucket.get(r2Key);
      if (!object) continue;

      const file = new ZipPassThrough(asset.originalFileName);
      zip.add(file);

      const reader = object.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) { file.push(new Uint8Array(0), true); break; }
        file.push(value);
      }
    }
    zip.end();
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="immich-download.zip"',
    },
  });
}
```

2. Convert `server/src/repositories/download.repository.ts` -> `src/repositories/download.repository.ts`

**Dependencies:** CP-4, CP-7, CP-8, CP-9
**Estimated complexity:** M

---

### CP-22: Timeline Routes

**What:** Convert the timeline controller for time bucket queries.

**How:**

1. Create `src/routes/timeline.ts` from `server/src/controllers/timeline.controller.ts`
2. Convert `server/src/services/timeline.service.ts` -> `src/services/timeline.service.ts`
3. The time bucket queries in `server/src/repositories/asset.repository.ts` use heavy PostgreSQL features:
   - `date_trunc('MONTH', "localDateTime")` -> `strftime('%Y-%m-01', localDateTime)`
   - `generate_series()` for day-of-year -> recursive CTE or application-level generation
   - `LATERAL JOIN` for stacked assets -> correlated subqueries
   - `DISTINCT ON` -> window function with `ROW_NUMBER()`
   - `array_agg()`/`json_agg()` -> `json_group_array()`/`json_object()`

**Dependencies:** CP-4, CP-7, CP-8, CP-11
**Estimated complexity:** M (complex SQL rewrites)

---

### CP-23: Search (Metadata Only)

**What:** Keep metadata-based search (not smart/ML search). Convert the metadata search endpoint.

**How:**

1. Create `src/routes/search.ts` with only the metadata search endpoints:
   - `POST /api/search/metadata` -> keep, convert to D1 queries
   - `POST /api/search/statistics` -> keep, convert to D1 queries
   - `POST /api/search/random` -> keep
   - `POST /api/search/large-assets` -> keep
   - `GET /api/search/suggestions` -> keep (simplified)
   - Remove: `POST /api/search/smart`, `GET /api/search/explore`, `GET /api/search/person`, `GET /api/search/places`, `GET /api/search/cities`

2. Convert search queries to use SQLite FTS5 for text search (replacing `pg_trgm` trigram search):
```sql
-- Create FTS5 virtual table for filename search
CREATE VIRTUAL TABLE asset_fts USING fts5(originalFileName, content='assets', content_rowid='rowid');
```

3. Geospatial search (lat/lng based) is simplified:
   - Instead of PostgreSQL `cube`/`earthdistance`, use a Haversine formula in application code:
   ```typescript
   function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
     const R = 6371; // Earth radius in km
     const dLat = (lat2 - lat1) * Math.PI / 180;
     const dLon = (lon2 - lon1) * Math.PI / 180;
     const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon/2) * Math.sin(dLon/2);
     return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
   }
   ```
   - For bounding-box queries, filter by lat/lng ranges in SQL: `WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`

**Dependencies:** CP-4, CP-7, CP-8, CP-11
**Estimated complexity:** M

---

### CP-24: System Config Routes (Simplified)

**What:** Keep a simplified system config admin interface.

**How:**

1. Create `src/routes/admin/system-config.ts` from `server/src/controllers/system-config.controller.ts`:
   - `GET /api/system-config` -> read from D1 `system_metadata`
   - `GET /api/system-config/defaults` -> return hardcoded defaults
   - `PUT /api/system-config` -> update D1 + invalidate KV cache
   - Remove: `GET /api/system-config/storage-template-options` (storage templates are not applicable to R2)

2. Convert `server/src/services/system-config.service.ts` -> `src/services/system-config.service.ts` (simplified)

**Dependencies:** CP-3, CP-4, CP-7
**Estimated complexity:** S

---

### CP-25: API Key Routes

**What:** Convert API key controller and service (already partially done in CP-7).

**How:**

1. Create `src/routes/api-keys.ts` from `server/src/controllers/api-key.controller.ts`
2. API key service conversion done in CP-7; this step wires routes

**Dependencies:** CP-7
**Estimated complexity:** S

---

### CP-26: Static Frontend Serving

**What:** Configure Cloudflare Workers Static Assets to serve the SvelteKit web frontend.

**How:**

1. The `wrangler.toml` `[assets]` section (created in CP-1) handles this:
```toml
[assets]
directory = "./web"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/.well-known/*", "/custom.css"]
```

2. Build the existing Immich web frontend (SvelteKit) for static adapter:
   - The frontend is in the `web/` directory of the Immich repo
   - Build with `adapter-static` instead of `adapter-node`
   - Output goes to `./web` directory referenced in wrangler.toml

3. Configuration:
   - `not_found_handling = "single-page-application"` ensures all unmatched paths return `index.html` (SvelteKit client-side routing)
   - `run_worker_first` ensures `/api/*` requests hit the Worker code, not static assets
   - Immutable assets (`/_app/immutable/*`) are automatically cached by Cloudflare's CDN

4. The well-known endpoint and custom CSS are handled by the Worker (non-API routes):
```typescript
// In src/index.ts
app.get('/.well-known/immich', (c) => c.json({ api: { endpoint: '/api' } }));
app.get('/custom.css', async (c) => {
  const config = await getConfig(c.env);
  c.header('Content-Type', 'text/css');
  return c.text(config.theme?.customCss ?? '');
});
```

5. Fallback handler in the Worker:
```typescript
// Catch-all for non-API routes that aren't static assets
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});
```

**Dependencies:** CP-1
**Estimated complexity:** S

---

### CP-27: Logging & Error Handling

**What:** Replace NestJS logging, exception filters, and interceptors with Hono equivalents.

**How:**

1. Create `src/middleware/error-handler.ts`:
```typescript
app.onError((err, c) => {
  if (err instanceof HttpException) {
    return c.json({ message: err.message, statusCode: err.status }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ message: 'Internal server error', statusCode: 500 }, 500);
});
```

2. Create `src/utils/errors.ts` with typed HTTP exceptions:
```typescript
export class HttpException extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class BadRequestException extends HttpException {
  constructor(message: string) { super(400, message); }
}
export class UnauthorizedException extends HttpException {
  constructor(message: string) { super(401, message); }
}
export class ForbiddenException extends HttpException {
  constructor(message: string) { super(403, message); }
}
export class NotFoundException extends HttpException {
  constructor(message: string) { super(404, message); }
}
```

3. Replace `LoggingRepository` with simple `console.log`/`console.error` (Workers supports console logging to real-time logs).

4. Replace `server/src/middleware/logging.interceptor.ts` with Hono timing middleware:
```typescript
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
});
```

**Dependencies:** CP-1
**Estimated complexity:** S

---

### CP-28: Integration Testing

**What:** Create a testing harness and implement route-by-route API tests.

See Section E for full testing plan.

**Dependencies:** All previous CPs
**Estimated complexity:** L

---

## C. API Route Preservation

The following routes MUST be maintained exactly as-is so the existing frontend works as a drop-in. The `api` prefix is configured globally. All routes below are relative to `/api/`.

### Auth Routes (`/api/auth/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/auth/login` | `AuthController.login()` | None |
| `POST` | `/auth/admin-sign-up` | `AuthController.signUpAdmin()` | None |
| `POST` | `/auth/validateToken` | `AuthController.validateAccessToken()` | `false` (any auth) |
| `POST` | `/auth/change-password` | `AuthController.changePassword()` | `Permission.AuthChangePassword` |
| `POST` | `/auth/logout` | `AuthController.logout()` | Any auth |
| `GET` | `/auth/status` | `AuthController.getAuthStatus()` | Any auth |
| `POST` | `/auth/pin-code` | `AuthController.setupPinCode()` | `Permission.PinCodeCreate` |
| `PUT` | `/auth/pin-code` | `AuthController.changePinCode()` | `Permission.PinCodeUpdate` |
| `DELETE` | `/auth/pin-code` | `AuthController.resetPinCode()` | `Permission.PinCodeDelete` |
| `POST` | `/auth/session/unlock` | `AuthController.unlockAuthSession()` | Any auth |
| `POST` | `/auth/session/lock` | `AuthController.lockAuthSession()` | Any auth |

### Admin Auth Routes (`/api/admin/auth/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/admin/auth/unlink-all` | `AuthAdminController.unlinkAllOAuthAccountsAdmin()` | `Permission.AdminAuthUnlinkAll` (admin) |

### Asset Routes (`/api/assets/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/assets` | `AssetMediaController.uploadAsset()` | `Permission.AssetUpload` (sharedLink) |
| `GET` | `/assets/random` | `AssetController.getRandom()` | `Permission.AssetRead` |
| `GET` | `/assets/device/:deviceId` | `AssetController.getAllUserAssetsByDeviceId()` | Any auth |
| `GET` | `/assets/statistics` | `AssetController.getAssetStatistics()` | `Permission.AssetStatistics` |
| `POST` | `/assets/jobs` | `AssetController.runAssetJobs()` | `Permission.JobCreate` |
| `PUT` | `/assets` | `AssetController.updateAssets()` | `Permission.AssetUpdate` |
| `DELETE` | `/assets` | `AssetController.deleteAssets()` | `Permission.AssetDelete` |
| `PUT` | `/assets/copy` | `AssetController.copyAsset()` | `Permission.AssetCopy` |
| `PUT` | `/assets/metadata` | `AssetController.updateBulkAssetMetadata()` | `Permission.AssetUpdate` |
| `DELETE` | `/assets/metadata` | `AssetController.deleteBulkAssetMetadata()` | `Permission.AssetUpdate` |
| `GET` | `/assets/:id` | `AssetController.getAssetInfo()` | `Permission.AssetRead` (sharedLink) |
| `PUT` | `/assets/:id` | `AssetController.updateAsset()` | `Permission.AssetUpdate` |
| `GET` | `/assets/:id/original` | `AssetMediaController.downloadAsset()` | `Permission.AssetDownload` (sharedLink) |
| `PUT` | `/assets/:id/original` | `AssetMediaController.replaceAsset()` | `Permission.AssetReplace` (sharedLink) |
| `GET` | `/assets/:id/thumbnail` | `AssetMediaController.viewAsset()` | `Permission.AssetView` (sharedLink) |
| `GET` | `/assets/:id/video/playback` | `AssetMediaController.playAssetVideo()` | `Permission.AssetView` (sharedLink) |
| `POST` | `/assets/exist` | `AssetMediaController.checkExistingAssets()` | `Permission.AssetUpload` |
| `POST` | `/assets/bulk-upload-check` | `AssetMediaController.checkBulkUpload()` | `Permission.AssetUpload` |
| `GET` | `/assets/:id/metadata` | `AssetController.getAssetMetadata()` | `Permission.AssetRead` |
| `PUT` | `/assets/:id/metadata` | `AssetController.updateAssetMetadata()` | `Permission.AssetUpdate` |
| `GET` | `/assets/:id/metadata/:key` | `AssetController.getAssetMetadataByKey()` | `Permission.AssetRead` |
| `DELETE` | `/assets/:id/metadata/:key` | `AssetController.deleteAssetMetadata()` | `Permission.AssetUpdate` |
| `GET` | `/assets/:id/edits` | `AssetController.getAssetEdits()` | `Permission.AssetEditGet` |
| `PUT` | `/assets/:id/edits` | `AssetController.editAsset()` | `Permission.AssetEditCreate` |
| `DELETE` | `/assets/:id/edits` | `AssetController.removeAssetEdits()` | `Permission.AssetEditDelete` |

### Album Routes (`/api/albums/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/albums` | `AlbumController.getAllAlbums()` | `Permission.AlbumRead` |
| `POST` | `/albums` | `AlbumController.createAlbum()` | `Permission.AlbumCreate` |
| `GET` | `/albums/statistics` | `AlbumController.getAlbumStatistics()` | `Permission.AlbumStatistics` |
| `GET` | `/albums/:id` | `AlbumController.getAlbumInfo()` | `Permission.AlbumRead` (sharedLink) |
| `PATCH` | `/albums/:id` | `AlbumController.updateAlbumInfo()` | `Permission.AlbumUpdate` |
| `DELETE` | `/albums/:id` | `AlbumController.deleteAlbum()` | `Permission.AlbumDelete` |
| `PUT` | `/albums/:id/assets` | `AlbumController.addAssetsToAlbum()` | `Permission.AlbumAssetCreate` (sharedLink) |
| `PUT` | `/albums/assets` | `AlbumController.addAssetsToAlbums()` | `Permission.AlbumAssetCreate` (sharedLink) |
| `DELETE` | `/albums/:id/assets` | `AlbumController.removeAssetFromAlbum()` | `Permission.AlbumAssetDelete` |
| `PUT` | `/albums/:id/users` | `AlbumController.addUsersToAlbum()` | `Permission.AlbumUserCreate` |
| `PUT` | `/albums/:id/user/:userId` | `AlbumController.updateAlbumUser()` | `Permission.AlbumUserUpdate` |
| `DELETE` | `/albums/:id/user/:userId` | `AlbumController.removeUserFromAlbum()` | `Permission.AlbumUserDelete` |

### Activity Routes (`/api/activities/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/activities` | `ActivityController.getActivities()` | `Permission.ActivityRead` |
| `POST` | `/activities` | `ActivityController.createActivity()` | `Permission.ActivityCreate` |
| `GET` | `/activities/statistics` | `ActivityController.getActivityStatistics()` | `Permission.ActivityStatistics` |
| `DELETE` | `/activities/:id` | `ActivityController.deleteActivity()` | `Permission.ActivityDelete` |

### Tag Routes (`/api/tags/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/tags` | `TagController.createTag()` | `Permission.TagCreate` |
| `GET` | `/tags` | `TagController.getAllTags()` | `Permission.TagRead` |
| `PUT` | `/tags` | `TagController.upsertTags()` | `Permission.TagCreate` |
| `PUT` | `/tags/assets` | `TagController.bulkTagAssets()` | `Permission.TagAsset` |
| `GET` | `/tags/:id` | `TagController.getTagById()` | `Permission.TagRead` |
| `PUT` | `/tags/:id` | `TagController.updateTag()` | `Permission.TagUpdate` |
| `DELETE` | `/tags/:id` | `TagController.deleteTag()` | `Permission.TagDelete` |
| `PUT` | `/tags/:id/assets` | `TagController.tagAssets()` | `Permission.TagAsset` |
| `DELETE` | `/tags/:id/assets` | `TagController.untagAssets()` | `Permission.TagAsset` |

### Stack Routes (`/api/stacks/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/stacks` | `StackController.searchStacks()` | `Permission.StackRead` |
| `POST` | `/stacks` | `StackController.createStack()` | `Permission.StackCreate` |
| `DELETE` | `/stacks` | `StackController.deleteStacks()` | `Permission.StackDelete` |
| `GET` | `/stacks/:id` | `StackController.getStack()` | `Permission.StackRead` |
| `PUT` | `/stacks/:id` | `StackController.updateStack()` | `Permission.StackUpdate` |
| `DELETE` | `/stacks/:id` | `StackController.deleteStack()` | `Permission.StackDelete` |
| `DELETE` | `/stacks/:id/assets/:assetId` | `StackController.removeAssetFromStack()` | `Permission.StackUpdate` |

### Memory Routes (`/api/memories/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/memories` | `MemoryController.searchMemories()` | `Permission.MemoryRead` |
| `POST` | `/memories` | `MemoryController.createMemory()` | `Permission.MemoryCreate` |
| `GET` | `/memories/statistics` | `MemoryController.memoriesStatistics()` | `Permission.MemoryStatistics` |
| `GET` | `/memories/:id` | `MemoryController.getMemory()` | `Permission.MemoryRead` |
| `PUT` | `/memories/:id` | `MemoryController.updateMemory()` | `Permission.MemoryUpdate` |
| `DELETE` | `/memories/:id` | `MemoryController.deleteMemory()` | `Permission.MemoryDelete` |
| `PUT` | `/memories/:id/assets` | `MemoryController.addMemoryAssets()` | `Permission.MemoryAssetCreate` |
| `DELETE` | `/memories/:id/assets` | `MemoryController.removeMemoryAssets()` | `Permission.MemoryAssetDelete` |

### Partner Routes (`/api/partners/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/partners` | `PartnerController.getPartners()` | `Permission.PartnerRead` |
| `POST` | `/partners` | `PartnerController.createPartner()` | `Permission.PartnerCreate` |
| `POST` | `/partners/:id` | `PartnerController.createPartnerDeprecated()` | `Permission.PartnerCreate` (deprecated) |
| `PUT` | `/partners/:id` | `PartnerController.updatePartner()` | `Permission.PartnerUpdate` |
| `DELETE` | `/partners/:id` | `PartnerController.removePartner()` | `Permission.PartnerDelete` |

### Session Routes (`/api/sessions/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/sessions` | `SessionController.createSession()` | `Permission.SessionCreate` |
| `GET` | `/sessions` | `SessionController.getSessions()` | `Permission.SessionRead` |
| `DELETE` | `/sessions` | `SessionController.deleteAllSessions()` | `Permission.SessionDelete` |
| `PUT` | `/sessions/:id` | `SessionController.updateSession()` | `Permission.SessionUpdate` |
| `DELETE` | `/sessions/:id` | `SessionController.deleteSession()` | `Permission.SessionDelete` |
| `POST` | `/sessions/:id/lock` | `SessionController.lockSession()` | `Permission.SessionLock` |

### User Routes (`/api/users/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/users` | `UserController.searchUsers()` | `Permission.UserRead` |
| `GET` | `/users/me` | `UserController.getMyUser()` | `Permission.UserRead` |
| `PUT` | `/users/me` | `UserController.updateMyUser()` | `Permission.UserUpdate` |
| `GET` | `/users/me/preferences` | `UserController.getMyPreferences()` | `Permission.UserPreferenceRead` |
| `PUT` | `/users/me/preferences` | `UserController.updateMyPreferences()` | `Permission.UserPreferenceUpdate` |
| `GET` | `/users/me/license` | `UserController.getUserLicense()` | `Permission.UserLicenseRead` |
| `PUT` | `/users/me/license` | `UserController.setUserLicense()` | `Permission.UserLicenseUpdate` |
| `DELETE` | `/users/me/license` | `UserController.deleteUserLicense()` | `Permission.UserLicenseDelete` |
| `GET` | `/users/me/onboarding` | `UserController.getUserOnboarding()` | `Permission.UserOnboardingRead` |
| `PUT` | `/users/me/onboarding` | `UserController.setUserOnboarding()` | `Permission.UserOnboardingUpdate` |
| `DELETE` | `/users/me/onboarding` | `UserController.deleteUserOnboarding()` | `Permission.UserOnboardingDelete` |
| `GET` | `/users/:id` | `UserController.getUser()` | `Permission.UserRead` |
| `POST` | `/users/profile-image` | `UserController.createProfileImage()` | `Permission.UserProfileImageUpdate` |
| `DELETE` | `/users/profile-image` | `UserController.deleteProfileImage()` | `Permission.UserProfileImageDelete` |
| `GET` | `/users/:id/profile-image` | `UserController.getProfileImage()` | `Permission.UserProfileImageRead` |

### Admin User Routes (`/api/admin/users/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/admin/users` | `UserAdminController.searchUsersAdmin()` | `Permission.AdminUserRead` (admin) |
| `POST` | `/admin/users` | `UserAdminController.createUserAdmin()` | `Permission.AdminUserCreate` (admin) |
| `GET` | `/admin/users/:id` | `UserAdminController.getUserAdmin()` | `Permission.AdminUserRead` (admin) |
| `PUT` | `/admin/users/:id` | `UserAdminController.updateUserAdmin()` | `Permission.AdminUserUpdate` (admin) |
| `DELETE` | `/admin/users/:id` | `UserAdminController.deleteUserAdmin()` | `Permission.AdminUserDelete` (admin) |
| `GET` | `/admin/users/:id/sessions` | `UserAdminController.getUserSessionsAdmin()` | `Permission.AdminSessionRead` (admin) |
| `GET` | `/admin/users/:id/statistics` | `UserAdminController.getUserStatisticsAdmin()` | `Permission.AdminUserRead` (admin) |
| `GET` | `/admin/users/:id/preferences` | `UserAdminController.getUserPreferencesAdmin()` | `Permission.AdminUserRead` (admin) |
| `PUT` | `/admin/users/:id/preferences` | `UserAdminController.updateUserPreferencesAdmin()` | `Permission.AdminUserUpdate` (admin) |
| `POST` | `/admin/users/:id/restore` | `UserAdminController.restoreUserAdmin()` | `Permission.AdminUserDelete` (admin) |

### Shared Link Routes (`/api/shared-links/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/shared-links` | `SharedLinkController.getAllSharedLinks()` | `Permission.SharedLinkRead` |
| `GET` | `/shared-links/me` | `SharedLinkController.getMySharedLink()` | sharedLink auth |
| `GET` | `/shared-links/:id` | `SharedLinkController.getSharedLinkById()` | `Permission.SharedLinkRead` |
| `POST` | `/shared-links` | `SharedLinkController.createSharedLink()` | `Permission.SharedLinkCreate` |
| `PATCH` | `/shared-links/:id` | `SharedLinkController.updateSharedLink()` | `Permission.SharedLinkUpdate` |
| `DELETE` | `/shared-links/:id` | `SharedLinkController.removeSharedLink()` | `Permission.SharedLinkDelete` |
| `PUT` | `/shared-links/:id/assets` | `SharedLinkController.addSharedLinkAssets()` | sharedLink auth |
| `DELETE` | `/shared-links/:id/assets` | `SharedLinkController.removeSharedLinkAssets()` | sharedLink auth |

### Download Routes (`/api/download/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/download/info` | `DownloadController.getDownloadInfo()` | `Permission.AssetDownload` (sharedLink) |
| `POST` | `/download/archive` | `DownloadController.downloadArchive()` | `Permission.AssetDownload` (sharedLink) |

### Server Routes (`/api/server/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/server/about` | `ServerController.getAboutInfo()` | `Permission.ServerAbout` |
| `GET` | `/server/apk-links` | `ServerController.getApkLinks()` | `Permission.ServerApkLinks` |
| `GET` | `/server/storage` | `ServerController.getStorage()` | `Permission.ServerStorage` |
| `GET` | `/server/ping` | `ServerController.pingServer()` | None |
| `GET` | `/server/version` | `ServerController.getServerVersion()` | None |
| `GET` | `/server/version-history` | `ServerController.getVersionHistory()` | None |
| `GET` | `/server/features` | `ServerController.getServerFeatures()` | None |
| `GET` | `/server/theme` | `ServerController.getTheme()` | None |
| `GET` | `/server/config` | `ServerController.getServerConfig()` | None |
| `GET` | `/server/statistics` | `ServerController.getServerStatistics()` | `Permission.ServerStatistics` (admin) |
| `GET` | `/server/media-types` | `ServerController.getSupportedMediaTypes()` | None |
| `GET` | `/server/license` | `ServerController.getServerLicense()` | `Permission.ServerLicenseRead` (admin) |
| `PUT` | `/server/license` | `ServerController.setServerLicense()` | `Permission.ServerLicenseUpdate` (admin) |
| `DELETE` | `/server/license` | `ServerController.deleteServerLicense()` | `Permission.ServerLicenseDelete` (admin) |
| `GET` | `/server/version-check` | `ServerController.getVersionCheck()` | `Permission.ServerVersionCheck` |

### Timeline Routes (`/api/timeline/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/timeline/buckets` | `TimelineController.getTimeBuckets()` | `Permission.AssetRead` (sharedLink) |
| `GET` | `/timeline/bucket` | `TimelineController.getTimeBucket()` | `Permission.AssetRead` (sharedLink) |

### Trash Routes (`/api/trash/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/trash/empty` | `TrashController.emptyTrash()` | `Permission.AssetDelete` |
| `POST` | `/trash/restore` | `TrashController.restoreTrash()` | `Permission.AssetDelete` |
| `POST` | `/trash/restore/assets` | `TrashController.restoreAssets()` | `Permission.AssetDelete` |

### API Key Routes (`/api/api-keys/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/api-keys` | `ApiKeyController.createApiKey()` | `Permission.ApiKeyCreate` |
| `GET` | `/api-keys` | `ApiKeyController.getApiKeys()` | `Permission.ApiKeyRead` |
| `GET` | `/api-keys/me` | `ApiKeyController.getMyApiKey()` | `false` (any auth) |
| `GET` | `/api-keys/:id` | `ApiKeyController.getApiKey()` | `Permission.ApiKeyRead` |
| `PUT` | `/api-keys/:id` | `ApiKeyController.updateApiKey()` | `Permission.ApiKeyUpdate` |
| `DELETE` | `/api-keys/:id` | `ApiKeyController.deleteApiKey()` | `Permission.ApiKeyDelete` |

### Search Routes (`/api/search/*`) - Simplified
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/search/metadata` | `SearchController.searchAssets()` | `Permission.AssetRead` |
| `POST` | `/search/statistics` | `SearchController.searchAssetStatistics()` | `Permission.AssetStatistics` |
| `POST` | `/search/random` | `SearchController.searchRandom()` | `Permission.AssetRead` |
| `POST` | `/search/large-assets` | `SearchController.searchLargeAssets()` | `Permission.AssetRead` |
| `GET` | `/search/suggestions` | `SearchController.getSearchSuggestions()` | `Permission.AssetRead` |

### Sync Routes (`/api/sync/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `POST` | `/sync/full-sync` | `SyncController.fullSync()` | Any auth (deprecated but functional) |
| `POST` | `/sync/delta-sync` | `SyncController.deltaSync()` | Any auth (deprecated but functional) |
| `POST` | `/sync/stream` | `SyncController.stream()` | Any auth |
| `GET` | `/sync/ack` | `SyncController.getAcks()` | Any auth |
| `POST` | `/sync/ack` | `SyncController.setAcks()` | Any auth |
| `DELETE` | `/sync/ack` | `SyncController.deleteAcks()` | Any auth |

### View Routes (`/api/view/*`)
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/view/folder/unique-paths` | `ViewController.getUniqueOriginalPaths()` | `Permission.AssetRead` |
| `GET` | `/view/folder` | `ViewController.getAssetsByOriginalPath()` | `Permission.AssetRead` |

### System Config Routes (`/api/system-config/*`) - Simplified
| Method | Path | Controller Method | Permission |
|--------|------|-------------------|------------|
| `GET` | `/system-config` | `SystemConfigController.getConfig()` | `Permission.SystemConfigRead` (admin) |
| `GET` | `/system-config/defaults` | `SystemConfigController.getConfigDefaults()` | `Permission.SystemConfigRead` (admin) |
| `PUT` | `/system-config` | `SystemConfigController.updateConfig()` | `Permission.SystemConfigUpdate` (admin) |

### Non-API Routes
| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| `GET` | `/.well-known/immich` | `AppController.getImmichWellKnown()` | Returns API endpoint info |
| `GET` | `/custom.css` | `AppController.getCustomCss()` | Returns custom CSS from config |
| `*` | `/*` | Static asset handler | Serves web frontend via Workers Static Assets |

---

## D. Code to Remove (Complete File List)

### Controllers to Remove
- `server/src/controllers/database-backup.controller.ts`
- `server/src/controllers/duplicate.controller.ts`
- `server/src/controllers/face.controller.ts`
- `server/src/controllers/job.controller.ts`
- `server/src/controllers/library.controller.ts`
- `server/src/controllers/maintenance.controller.ts` (+ `.spec.ts`)
- `server/src/controllers/map.controller.ts`
- `server/src/controllers/notification.controller.ts` (+ `.spec.ts`)
- `server/src/controllers/notification-admin.controller.ts`
- `server/src/controllers/oauth.controller.ts`
- `server/src/controllers/person.controller.ts` (+ `.spec.ts`)
- `server/src/controllers/plugin.controller.ts`
- `server/src/controllers/queue.controller.ts`
- `server/src/controllers/system-metadata.controller.ts`
- `server/src/controllers/workflow.controller.ts`

### Services to Remove
- `server/src/services/api.service.ts`
- `server/src/services/audit.service.ts` (+ `.spec.ts`)
- `server/src/services/backup.service.ts` (+ `.spec.ts`)
- `server/src/services/cli.service.ts` (+ `.spec.ts`)
- `server/src/services/database.service.ts` (+ `.spec.ts`)
- `server/src/services/database-backup.service.ts` (+ `.spec.ts`)
- `server/src/services/duplicate.service.ts` (+ `.spec.ts`)
- `server/src/services/job.service.ts` (+ `.spec.ts`)
- `server/src/services/library.service.ts` (+ `.spec.ts`)
- `server/src/services/maintenance.service.ts` (+ `.spec.ts`)
- `server/src/services/map.service.ts` (+ `.spec.ts`)
- `server/src/services/media.service.ts` (+ `.spec.ts`)
- `server/src/services/metadata.service.ts` (+ `.spec.ts`)
- `server/src/services/notification.service.ts` (+ `.spec.ts`)
- `server/src/services/notification-admin.service.ts` (+ `.spec.ts`)
- `server/src/services/ocr.service.ts` (+ `.spec.ts`)
- `server/src/services/person.service.ts` (+ `.spec.ts`)
- `server/src/services/plugin.service.ts`
- `server/src/services/plugin-host.functions.ts`
- `server/src/services/queue.service.ts` (+ `.spec.ts`)
- `server/src/services/search.service.ts` (+ `.spec.ts`) -- will be rewritten from scratch (simplified)
- `server/src/services/smart-info.service.ts` (+ `.spec.ts`)
- `server/src/services/storage.service.ts` (+ `.spec.ts`)
- `server/src/services/storage-template.service.ts` (+ `.spec.ts`)
- `server/src/services/system-metadata.service.ts` (+ `.spec.ts`) -- functionality merged into config
- `server/src/services/telemetry.service.ts`
- `server/src/services/version.service.ts` (+ `.spec.ts`) -- simplified inline
- `server/src/services/workflow.service.ts`

### Repositories to Remove
- `server/src/repositories/app.repository.ts`
- `server/src/repositories/cron.repository.ts`
- `server/src/repositories/database.repository.ts`
- `server/src/repositories/duplicate.repository.ts`
- `server/src/repositories/email.repository.ts` (+ `.spec.ts`)
- `server/src/repositories/event.repository.ts`
- `server/src/repositories/job.repository.ts`
- `server/src/repositories/library.repository.ts`
- `server/src/repositories/machine-learning.repository.ts`
- `server/src/repositories/map.repository.ts`
- `server/src/repositories/move.repository.ts`
- `server/src/repositories/notification.repository.ts`
- `server/src/repositories/oauth.repository.ts`
- `server/src/repositories/ocr.repository.ts`
- `server/src/repositories/person.repository.ts`
- `server/src/repositories/plugin.repository.ts`
- `server/src/repositories/process.repository.ts` (+ `.spec.ts`)
- `server/src/repositories/search.repository.ts` -- will be rewritten from scratch
- `server/src/repositories/server-info.repository.ts` -- simplified inline
- `server/src/repositories/telemetry.repository.ts`
- `server/src/repositories/version-history.repository.ts` -- simplified inline
- `server/src/repositories/websocket.repository.ts`
- `server/src/repositories/workflow.repository.ts`

### DTOs to Remove
- `server/src/dtos/database-backup.dto.ts`
- `server/src/dtos/duplicate.dto.ts`
- `server/src/dtos/env.dto.ts`
- `server/src/dtos/job.dto.ts`
- `server/src/dtos/library.dto.ts`
- `server/src/dtos/maintenance.dto.ts`
- `server/src/dtos/map.dto.ts`
- `server/src/dtos/model-config.dto.ts`
- `server/src/dtos/notification.dto.ts`
- `server/src/dtos/ocr.dto.ts`
- `server/src/dtos/person.dto.ts`
- `server/src/dtos/plugin.dto.ts`
- `server/src/dtos/plugin-manifest.dto.ts`
- `server/src/dtos/queue.dto.ts`
- `server/src/dtos/queue-legacy.dto.ts`
- `server/src/dtos/search.dto.ts` -- will be rewritten (simplified)
- `server/src/dtos/system-metadata.dto.ts` -- merged into config
- `server/src/dtos/workflow.dto.ts`

### Schema Tables to Remove
- `server/src/schema/tables/asset-face.table.ts`
- `server/src/schema/tables/asset-face-audit.table.ts`
- `server/src/schema/tables/asset-job-status.table.ts`
- `server/src/schema/tables/asset-ocr.table.ts`
- `server/src/schema/tables/face-search.table.ts`
- `server/src/schema/tables/geodata-places.table.ts`
- `server/src/schema/tables/library.table.ts`
- `server/src/schema/tables/move.table.ts`
- `server/src/schema/tables/natural-earth-countries.table.ts`
- `server/src/schema/tables/notification.table.ts`
- `server/src/schema/tables/ocr-search.table.ts`
- `server/src/schema/tables/person.table.ts`
- `server/src/schema/tables/person-audit.table.ts`
- `server/src/schema/tables/plugin.table.ts`
- `server/src/schema/tables/smart-search.table.ts`
- `server/src/schema/tables/workflow.table.ts`

### Entire Directories to Remove
- `server/src/workers/` -- Node.js worker thread entry points
- `server/src/commands/` -- CLI commands (nest-commander)
- `server/src/maintenance/` -- Maintenance mode controllers/services
- `server/src/emails/` -- React Email templates
- `server/src/sql-tools/` -- Custom schema diffing/generation tooling
- `server/src/queries/` -- Pre-built SQL query files (will be rewritten)
- `server/src/schema/migrations/` -- PostgreSQL migrations (replaced by D1 migrations)

### Middleware to Remove
- `server/src/middleware/asset-upload.interceptor.ts` -- replaced by Hono multipart
- `server/src/middleware/file-upload.interceptor.ts` -- replaced by Hono multipart
- `server/src/middleware/error.interceptor.ts` -- replaced by Hono error handler
- `server/src/middleware/logging.interceptor.ts` -- replaced by Hono middleware
- `server/src/middleware/global-exception.filter.ts` -- replaced by Hono error handler
- `server/src/middleware/websocket.adapter.ts` -- WebSocket removed

### Utilities to Remove
- `server/src/utils/database-backups.ts`
- `server/src/utils/maintenance.ts`

### Root Files to Remove
- `server/src/app.module.ts` -- NestJS module definition
- `server/src/app.common.ts` -- Express configuration
- `server/src/main.ts` -- NestJS bootstrap
- `server/src/decorators.ts` -- NestJS custom decorators (Endpoint, HistoryBuilder)
- `server/src/plugins.ts` -- Plugin system
- `server/src/database.ts` -- PostgreSQL Kysely setup (replaced by D1 setup)

### All Test Files (`.spec.ts`)
All `*.spec.ts` files across all directories will be removed. Tests will be rewritten for the Workers environment in CP-28.

---

## E. Testing Plan

Testing is implemented as the **final step** after all conversion points are complete.

### Testing Infrastructure

**Framework:** Vitest + Miniflare (Cloudflare's local Workers simulator)

**Setup:**
```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          r2Buckets: ['BUCKET'],
          kvNamespaces: ['KV'],
        },
      },
    },
  },
});
```

### Test Categories

#### 1. Auth Flow Testing
- Login with valid/invalid credentials
- Session token validation (Bearer header, cookie)
- API key authentication
- Shared link authentication (query param, cookie)
- Permission checking (admin routes, specific permissions)
- Session management (create, list, delete, lock/unlock)
- PIN code setup/change/reset
- Logout and session invalidation

#### 2. Asset Upload/Download Testing
- Multipart upload of image file
- Duplicate detection via SHA1 checksum
- Checksum header pre-check
- Bulk upload check
- Download original file
- View thumbnail (correct variant returned)
- Video playback with Range header
- Replace asset
- Check existing assets by device ID

#### 3. Asset CRUD Testing
- Get asset info
- Update asset metadata
- Bulk update assets
- Delete assets (soft delete)
- Get asset statistics
- Copy asset metadata
- Asset edits (create, get, delete)
- Asset metadata key-value CRUD

#### 4. Album CRUD Testing
- Create album (with initial assets and users)
- List albums (with filtering)
- Get album info (with asset count)
- Update album
- Delete album
- Add/remove assets
- Add/remove/update users
- Album statistics

#### 5. Activity CRUD Testing
- Create comment/like
- List activities for album/asset
- Get activity statistics
- Delete activity
- Duplicate like handling (returns 200)

#### 6. Tag/Stack/Memory/Partner CRUD Testing
- Full CRUD lifecycle for each entity
- Tag hierarchy (closure table)
- Bulk tag operations
- Stack asset management
- Memory asset management

#### 7. Shared Link Testing
- Create shared link (album type, individual type)
- Access shared link with password
- Add/remove assets from shared link
- Shared link expiration

#### 8. Download/Archive Testing
- Get download info (chunked archives)
- Download ZIP archive
- Large archive handling

#### 9. User Management Testing
- Get current user
- Update user profile
- Profile image upload/download/delete
- User preferences
- License management
- Onboarding status
- Admin user CRUD

#### 10. Server Info Testing
- Ping, version, features, config, media-types (unauthenticated)
- Statistics, storage (admin only)
- License management (admin)
- Theme/custom CSS

#### 11. Timeline Testing
- Get time buckets
- Get time bucket contents

#### 12. Trash Testing
- Empty trash
- Restore all
- Restore specific assets

#### 13. Sync Protocol Testing
- POST /sync/stream with various sync types
- Verify JSON Lines streaming format
- Verify checkpoint persistence (GET/POST/DELETE /sync/ack)
- Verify stubbed sync types (PeopleV1, AssetFacesV1) return empty responses
- Legacy endpoints (full-sync, delta-sync) still functional
- Audit table cleanup runs without errors

#### 14. View/Folder Testing
- GET /view/folder/unique-paths returns correct folder list
- GET /view/folder returns assets for a given path

### Test Execution

**Local development:**
```bash
npx wrangler dev        # Start local dev server
npx vitest              # Run tests against local Miniflare
```

**CI/CD:**
```bash
npx vitest run          # Run all tests in CI
```

### Test Data Strategy
- Each test suite seeds its own test data via D1 queries
- Use `beforeEach` to reset database state
- Upload test images (small JPEG files) to R2 for file-related tests
- Use deterministic UUIDs for predictable test assertions

---

## F. Key Architecture Decisions

### 1. DI/Service Wiring Without NestJS

**Decision:** Replace the `BaseService` god-class pattern with a `ServiceContext` object passed to each service.

**Rationale:** NestJS's DI container with 50+ repository injections is overkill for Workers. The `BaseService` pattern (`server/src/services/base.service.ts`) injects every repository into every service regardless of need. Instead:

- A `ServiceContext` contains shared resources: `db` (Kysely), `bucket` (R2), `kv` (KV), `env` (bindings)
- Services are instantiated per-request or as singletons within a request
- Repository methods are either inlined into services (for simple CRUD) or kept as thin classes receiving the Kysely instance
- Access checking (`server/src/utils/access.ts`) is kept as a utility function receiving the db instance

**Example:**
```typescript
// Old: class AlbumService extends BaseService (inherits 50+ repos)
// New:
class AlbumService {
  constructor(private ctx: ServiceContext) {}
  async getAll(auth: AuthDto, query: GetAlbumsDto) {
    return this.ctx.db.selectFrom('albums').where(...).execute();
  }
}
```

### 2. Auth Middleware in Hono

**Decision:** Use Hono `createMiddleware()` with route-level options, replacing NestJS `@Authenticated()` decorator and `AuthGuard`.

**Rationale:** The NestJS `AuthGuard` (`server/src/middleware/auth.guard.ts`) uses `Reflector` to read metadata set by the `@Authenticated()` decorator. In Hono, middleware is applied directly to routes with explicit options.

**Implementation:**
```typescript
// Each route explicitly declares its auth requirements
app.get('/api/albums', auth({ permission: Permission.AlbumRead }), handler);
app.get('/api/albums/:id', auth({ permission: Permission.AlbumRead, sharedLink: true }), handler);
app.get('/api/server/ping', handler); // No auth middleware = public
```

The auth middleware:
1. Extracts credentials from headers/cookies/query params (same logic as `AuthService.authenticate()`)
2. Validates session/API key/shared link
3. Checks permissions
4. Sets `c.set('auth', authDto)` on the Hono context

### 3. File Uploads Without Multer

**Decision:** Use Hono's built-in `c.req.parseBody()` for multipart parsing, with files going directly to R2.

**Rationale:** Multer (`server/src/middleware/file-upload.interceptor.ts`) writes files to disk then moves them. Workers have no disk. Instead:

1. `c.req.parseBody({ all: true })` parses multipart form data
2. The `assetData` field gives us a `File` object (Blob with name/type)
3. We compute SHA1 from the ArrayBuffer: `crypto.subtle.digest('SHA-1', await file.arrayBuffer())`
4. Write directly to R2: `env.BUCKET.put(key, file.stream())`
5. For large files (>100MB), use R2 multipart upload API

**Memory considerations:** Workers have a 128MB memory limit. For files larger than ~100MB, we must use R2's multipart upload API to stream chunks rather than buffering the entire file.

### 4. D1 Schema vs PostgreSQL Schema

**Decision:** Create a single initial D1/SQLite schema that covers all in-scope tables, collapsing all 55 PostgreSQL migrations.

**Key differences from PostgreSQL:**

| Aspect | PostgreSQL | D1/SQLite |
|--------|-----------|-----------|
| UUIDs | `uuid` type + `immich_uuid_v7()` default | `TEXT` + app-level UUIDv7 |
| Timestamps | `timestamptz` | `TEXT` (ISO 8601) |
| Enums | Custom enum types | `TEXT` with `CHECK` constraints |
| Binary data | `bytea` | `BLOB` |
| JSON | `jsonb` | `TEXT` (JSON string) |
| Triggers | `BEFORE UPDATE` triggers for `updatedAt` | App-level: set `updatedAt` before each UPDATE |
| Audit triggers | `AFTER DELETE` triggers | App-level: insert audit record in service code |
| Full-text search | `pg_trgm` + `gin` indexes | FTS5 virtual tables |
| Geospatial | `cube` + `earthdistance` | Haversine formula in app code |
| Advisory locks | `pg_try_advisory_lock()` | Not needed (Workers are single-request) |
| Sequences | `SERIAL` / `GENERATED ALWAYS` | `INTEGER PRIMARY KEY AUTOINCREMENT` |

### 5. Cloudflare Images Integration

**Decision:** Use the Cloudflare Images binding (`env.IMAGES.transform()`) for on-upload thumbnail/preview generation, storing variants in R2.

**Rationale:** Sharp is a native binary that cannot run in Workers. Cloudflare Images provides:
- Resize (width, height, fit modes)
- Format conversion (WebP, AVIF, JPEG)
- Rotation (90/180/270 degrees)
- Quality adjustment
- Automatic EXIF orientation correction

**Variant strategy:**
- `thumbnail`: 250x250, `fit: outside`, WebP, quality 80
- `preview`: 1440px longest edge, `fit: inside`, WebP, quality 80
- Variants stored in R2 alongside originals: `assets/{userId}/{assetId}/thumbnail.webp`

**What we lose vs Sharp:**
- Arbitrary crop coordinates (only supported via CF Images URL params, not binding)
- Affine transforms
- ICC profile manipulation
- RAW file decoding (TODO)
- Video frame extraction (TODO)

### 6. Static Asset Serving

**Decision:** Use Cloudflare Workers Static Assets (the `[assets]` section in wrangler.toml) with SPA fallback mode.

**Rationale:** This is Cloudflare's modern replacement for Workers Sites (KV-based). Benefits:
- Zero-config: just point to the build output directory
- Automatic CDN caching with tiered cache
- SPA mode returns `index.html` for unmatched paths (SvelteKit client-side routing)
- `run_worker_first` ensures API requests hit the Worker, not static files
- Immutable assets (`/_app/immutable/*`) get long cache headers automatically

**How it works:**
1. The SvelteKit frontend is built with `adapter-static`
2. Build output placed in `./web/` directory
3. `wrangler.toml` `[assets]` section points to this directory
4. For requests matching `run_worker_first` patterns (`/api/*`, `/.well-known/*`), the Worker runs first
5. For all other requests, Cloudflare serves static files directly, falling back to `index.html` for SPA routing
6. The Worker's catch-all handler (`app.all('*', ...)`) delegates to `env.ASSETS.fetch()` for any non-API requests that reach the Worker

### 7. KV Usage (System Config Only)

**Decision:** KV is used ONLY for caching system configuration. No rate limiting, no session caching.

**Rationale:**
- Session caching in KV has consistency issues (eventually consistent reads could serve stale sessions)
- Rate limiting on KV counters is imprecise due to eventual consistency
- System config changes are rare and brief staleness is acceptable

**Implementation:**
```typescript
const CONFIG_KEY = 'system:config';
const CONFIG_TTL = 60; // seconds

async function getConfig(env: Env): Promise<SystemConfig> {
  const cached = await env.KV.get(CONFIG_KEY, 'json');
  if (cached) return cached as SystemConfig;

  const config = await loadConfigFromD1(env.DB);
  await env.KV.put(CONFIG_KEY, JSON.stringify(config), { expirationTtl: CONFIG_TTL });
  return config;
}
```

### 8. ZIP Downloads Strategy

**Decision:** Use `fflate` for streaming ZIP creation within the Worker.

**Rationale:** `archiver` (`server/src/repositories/storage.repository.ts`) depends on Node.js streams. `fflate` is a pure JavaScript/WASM zip library that works in Workers. We use the streaming API (`Zip` class) to avoid buffering the entire archive in memory:

1. Create a `TransformStream` for the response body
2. Use `fflate`'s `Zip` class to process files one at a time
3. For each file, stream from R2 and pipe through the ZIP compressor
4. Client receives a streaming ZIP download

**Memory management:** Each file is streamed from R2, so we only hold one file's chunks in memory at a time. The `ZipPassThrough` mode (store, no compression) is preferred for already-compressed formats (JPEG, WebP, PNG) to minimize CPU usage within the Worker's time limits.

### 9. Geospatial/Maps Without PostgreSQL Extensions

**Decision:** Maintain basic lat/lng storage in EXIF data. Provide a Haversine formula utility for distance calculations. Bounding-box queries use simple SQL range comparisons.

**Rationale:** The PostgreSQL `cube` + `earthdistance` extensions enable efficient geospatial indexing and queries. In SQLite/D1, we cannot use these. However:
- The frontend map feature needs lat/lng coordinates from asset EXIF data -- this is just stored as `REAL` columns
- Distance-based queries (e.g., "find assets near this location") use the Haversine formula in application code or a bounding-box pre-filter in SQL
- For the initial version, map display works by querying assets with non-null lat/lng and letting the frontend handle clustering

### 10. Sync Protocol Streaming (Node.js Writable -> Web ReadableStream)

**Decision:** Convert the sync protocol's Node.js `Writable` stream-based JSON Lines output to Web `ReadableStream` using `TransformStream`.

**Rationale:** The sync protocol (`POST /sync/stream`) is the mobile app's primary data sync mechanism. It streams entity updates as JSON Lines (one JSON object per line). The original implementation uses Node.js `Writable` streams, which are not available in Workers. The Web Streams API (`ReadableStream` + `TransformStream`) provides equivalent functionality:

```typescript
// Create a JSON Lines streaming response
const { readable, writable } = new TransformStream();
const writer = writable.getWriter();
const encoder = new TextEncoder();

// Write each entity as a JSON line
for (const entity of entities) {
  await writer.write(encoder.encode(JSON.stringify(entity) + '\n'));
}
await writer.close();

return new Response(readable, {
  headers: { 'Content-Type': 'application/x-ndjson' },
});
```

**Audit table cleanup:** The original uses a background job to clean up old audit records. In Workers, this is handled via:
- **Preferred:** Cloudflare Cron Trigger (add `[triggers] crons = ["0 * * * *"]` to `wrangler.toml`) that deletes audit records older than 24 hours
- **Fallback:** Inline cleanup after sync response — fire-and-forget deletion of stale audit records using `ctx.waitUntil()`

**Stubbed sync types:** Sync types for removed features (`PeopleV1`, `AssetFacesV1`) return empty responses, allowing the mobile app to handle them gracefully without errors.

### 11. Original Artifact Preservation in R2

**Decision:** Always store the original uploaded file in R2. Thumbnails and previews are generated variants stored alongside, never replacing the original.

**R2 key structure:**
```
assets/{userId}/{assetId}/original.{ext}     # ALWAYS preserved
assets/{userId}/{assetId}/thumbnail.webp     # Generated variant
assets/{userId}/{assetId}/preview.webp       # Generated variant
profiles/{userId}/{uuid}.{ext}               # Profile images
```

**Rationale:** "Download original" is a core feature. Users must always be able to retrieve the exact file they uploaded, including full EXIF data, original resolution, and original format. Variants are an optimization layer on top.
