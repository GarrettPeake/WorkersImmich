# Immich Server: Cloudflare Workers Conversion - Technology Analysis

This document catalogs every technology conversion required to port the Immich server (`server/`) from its current NestJS/PostgreSQL/Node.js stack to Cloudflare Workers with Hono/D1/KV/R2.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [NestJS to Hono](#2-nestjs-to-hono)
3. [PostgreSQL/Kysely to D1](#3-postgresqlkysely-to-d1)
4. [Redis to KV](#4-redis-to-kv)
5. [Filesystem to R2](#5-filesystem-to-r2)
6. [Sharp to Cloudflare Images](#6-sharp-to-cloudflare-images)
7. [Node.js APIs to Workers-Compatible Alternatives](#7-nodejs-apis-to-workers-compatible-alternatives)
8. [Dependencies: Keep, Replace, or Remove](#8-dependencies-keep-replace-or-remove)
9. [Features/Code to Remove Entirely](#9-featurescode-to-remove-entirely)
10. [In-Scope Feature Mapping](#10-in-scope-feature-mapping)

---

## 1. Architecture Overview

### Current Structure

The server (`server/src/`) is organized as a NestJS monolith with these key directories:

| Directory | Purpose |
|---|---|
| `controllers/` | 40+ NestJS controllers (HTTP route handlers) |
| `services/` | 40+ service classes containing business logic |
| `repositories/` | 50+ repository classes (data access layer) |
| `schema/` | Database schema definitions (tables, migrations, functions, enums) |
| `schema/migrations/` | 55 Kysely migration files |
| `schema/tables/` | ~50 table definition files using custom decorators |
| `cores/` | Core utilities (e.g., `storage.core.ts`) |
| `dtos/` | Data Transfer Objects for request/response validation |
| `middleware/` | Auth guards, interceptors, filters, websocket adapter |
| `sql-tools/` | Custom schema diffing/generation tooling |
| `utils/` | Utility functions (database helpers, file utils, etc.) |
| `workers/` | Worker thread entry points (API, microservices) |
| `maintenance/` | Maintenance mode controllers/services |
| `emails/` | React Email templates |
| `commands/` | CLI commands (nest-commander) |

### Current Worker Architecture

The application starts in `server/src/main.ts` using Node.js `child_process.fork()` and `worker_threads.Worker` to spawn separate processes:
- **API worker** - Serves HTTP API via Express/NestJS
- **Microservices worker** - Processes background jobs via BullMQ
- **Maintenance worker** - Health checks during maintenance mode

### Dependency Injection Pattern

All services extend `BaseService` (`server/src/services/base.service.ts`) which injects **every repository** (50+) via NestJS constructor injection. This "god class" pattern means every service has access to every repository. Key repositories injected:

```
LoggingRepository, AccessRepository, ActivityRepository, AlbumRepository,
AlbumUserRepository, ApiKeyRepository, AssetRepository, AuditRepository,
ConfigRepository, CryptoRepository, DatabaseRepository, DownloadRepository,
EventRepository, JobRepository, MediaRepository, MemoryRepository,
MetadataRepository, SessionRepository, SharedLinkRepository, StorageRepository,
SystemMetadataRepository, TagRepository, UserRepository, ...
```

---

## 2. NestJS to Hono

### What Currently Exists

**Framework Core:**
- `@nestjs/common` (v11), `@nestjs/core`, `@nestjs/platform-express` (Express 5)
- Entry: `server/src/app.module.ts` defines `ApiModule`, `MicroservicesModule`, `MaintenanceModule`
- Server setup: `server/src/app.common.ts` configures Express middleware (cookie-parser, body-parser, compression, sirv for static files)

**Controllers (40+ files in `server/src/controllers/`):**
Each controller uses NestJS decorators:
```typescript
@Controller('activities')        // Route prefix
@ApiTags(ApiTag.Activities)      // Swagger
@Get(), @Post(), @Put(), @Patch(), @Delete()  // HTTP methods
@Authenticated({ permission: Permission.ActivityRead })  // Auth guard
@Body(), @Param(), @Query(), @Req(), @Res()  // Parameter extraction
@UseInterceptors(FileUploadInterceptor)  // File upload handling
```

**Key Controllers for In-Scope Features:**
- `server/src/controllers/activity.controller.ts` - Activity CRUD
- `server/src/controllers/album.controller.ts` - Album CRUD
- `server/src/controllers/asset.controller.ts` - Asset CRUD (metadata, bulk operations)
- `server/src/controllers/asset-media.controller.ts` - Asset upload/download/thumbnail/video
- `server/src/controllers/auth.controller.ts` - Authentication
- `server/src/controllers/auth-admin.controller.ts` - Admin auth (signup)
- `server/src/controllers/download.controller.ts` - Archive downloads
- `server/src/controllers/session.controller.ts` - Session management
- `server/src/controllers/user.controller.ts` - User profile
- `server/src/controllers/user-admin.controller.ts` - User administration
- `server/src/controllers/shared-link.controller.ts` - Shared links
- `server/src/controllers/server.controller.ts` - Server info
- `server/src/controllers/tag.controller.ts` - Tag CRUD
- `server/src/controllers/stack.controller.ts` - Stack CRUD

**Middleware / Guards / Interceptors:**
- `server/src/middleware/auth.guard.ts` - `AuthGuard` implements `CanActivate`, uses NestJS `Reflector` to read `@Authenticated()` metadata. The `@Auth()` decorator extracts authenticated user from `request.user`.
- `server/src/middleware/file-upload.interceptor.ts` - Uses `multer` with `diskStorage` for file uploads. Computes SHA1 checksums during upload stream.
- `server/src/middleware/asset-upload.interceptor.ts` - Validates upload before processing.
- `server/src/middleware/error.interceptor.ts` - Transforms errors.
- `server/src/middleware/logging.interceptor.ts` - Request logging.
- `server/src/middleware/global-exception.filter.ts` - Global exception handling.

**Validation:**
- Uses `class-validator` and `class-transformer` with NestJS `ValidationPipe({ transform: true, whitelist: true })`
- DTOs in `server/src/dtos/` use decorators like `@IsString()`, `@IsOptional()`, `@Transform()`, etc.
- `server/src/validation.ts` has custom validators like `UUIDParamDto`, `FileNotEmptyValidator`

**Swagger/OpenAPI:**
- `@nestjs/swagger` decorators throughout all controllers
- This can be dropped entirely for Workers

### What It Needs to Become (Hono)

**Routing:**
Replace NestJS controller decorators with Hono route definitions:
```typescript
// NestJS:
@Controller('activities')
@Get()
@Authenticated({ permission: Permission.ActivityRead })
getActivities(@Auth() auth: AuthDto, @Query() dto: ActivitySearchDto) {}

// Hono:
app.get('/api/activities', authMiddleware(Permission.ActivityRead), async (c) => {
  const auth = c.get('auth');
  const dto = c.req.query();
  return c.json(await activityService.getAll(auth, dto));
});
```

**Middleware:**
- Auth guard becomes Hono middleware that sets `c.set('auth', authDto)`
- Validation needs a replacement for class-validator (use Zod or manual validation)
- Error handling becomes Hono `app.onError()` handler

**File Uploads:**
- Multer (disk-based) must be replaced with in-memory multipart parsing
- Hono has built-in `c.req.parseBody()` for multipart
- Files go directly to R2 instead of disk

**Static File Serving:**
- `sirv` serves the web frontend from `server/src/app.common.ts`
- In Workers, serve web assets from Workers Sites (KV) or R2

**Key Challenges:**
1. The `BaseService` "god class" pattern needs restructuring - either keep as-is with manual instantiation, or break into smaller focused services
2. NestJS `Reflector` and metadata-based decorator patterns (used heavily for auth, jobs, events) need full reimplementation
3. `class-validator`/`class-transformer` DTOs need conversion to a Workers-compatible validation library
4. The `@Authenticated()` decorator with permission-based access control needs careful reimplementation
5. Express `Request`/`Response` types used throughout need replacement with Hono's `Context`

---

## 3. PostgreSQL/Kysely to D1

### What Currently Exists

**Database Configuration:**
- `server/src/utils/database.ts` - `getKyselyConfig()` creates a Kysely instance with `PostgresJSDialect` (via `kysely-postgres-js` and `postgres` driver)
- Connection configured from env vars: `DB_URL` or `DB_HOSTNAME`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`DB_DATABASE_NAME`
- Connection pool: `max: 10`
- Custom type serializers for `date` (to/from ISO strings) and `bigint`

**Schema Definition:**
- `server/src/schema/index.ts` - `ImmichDatabase` class lists all tables, functions, enums
- `server/src/schema/tables/` - 50+ table files using custom `@Table`, `@Column`, `@Index`, `@ForeignKeyColumn` decorators from `sql-tools`
- `DB` interface in `server/src/schema/index.ts` maps table names to table types for Kysely type safety

**PostgreSQL Extensions Required:**
- `uuid-ossp` - UUID generation
- `unaccent` - Text search
- `cube` + `earthdistance` - Geospatial (maps feature - OUT OF SCOPE)
- `pg_trgm` - Trigram text search (filename search)
- `plpgsql` - Stored procedures/triggers

**PostgreSQL-Specific Features Used Heavily:**

1. **Custom Functions (server/src/schema/functions.ts):**
   - `immich_uuid_v7()` - Generates UUIDv7 (time-ordered) using `gen_random_uuid()`, `uuid_send()`, `set_bit()`, `int8send()`, `extract(epoch...)`
   - `updated_at()` - Trigger function for auto-updating `updatedAt`/`updateId` columns
   - `f_concat_ws()` - Immutable concat helper
   - `f_unaccent()` - Unaccent wrapper
   - 10+ audit trigger functions (`user_delete_audit`, `asset_delete_audit`, etc.)

2. **PostgreSQL-Only SQL in Repositories:**
   - `AT TIME ZONE 'UTC'` - Used extensively in asset.repository.ts for time bucket queries
   - `::date`, `::text`, `::int`, `::uuid` - Type casting (dozens of occurrences)
   - `generate_series()` - Memory/day-of-year queries
   - `array_agg()`, `json_agg()` - Aggregation in time bucket queries
   - `jsonb_agg()`, `to_json()` - JSON building
   - `LATERAL JOIN` / `innerJoinLateral` / `leftJoinLateral` - Used in asset repository for stacked assets, time buckets
   - `distinctOn()` / `DISTINCT ON` - Used in album, asset repositories
   - `unnest()` - Array expansion (custom helper in database utils)
   - `pg_try_advisory_lock()` / `pg_advisory_unlock()` - Database-level locking (main.ts)
   - `array_to_string()`, `array[]` constructors
   - Custom enum types: `assets_status_enum`, `asset_visibility_enum`, `sourcetype`
   - `bytea` columns for checksums and thumbhashes
   - `gin` indexes with `gin_trgm_ops` for text search
   - `TRIGGER` functions (BEFORE UPDATE, AFTER DELETE)
   - `nullif(array(...), '{}')` - Array manipulation patterns
   - `encode(..., 'hex')::uuid`, `encode(..., 'base64')` - Encoding
   - `extract(epoch from ...)` - Timestamp extraction
   - `date_trunc('MONTH', ...)` - Date truncation
   - `make_date()` - Date construction
   - `interval` arithmetic (e.g., `+ '5 minute'::interval`)

3. **Kysely-Specific Patterns:**
   - `@InjectKysely()` decorator from `nestjs-kysely`
   - `KyselyModule.forRoot()` in app module
   - Helper functions: `jsonArrayFrom()`, `jsonObjectFrom()` from `kysely/helpers/postgres`
   - `sql` template tag for raw SQL
   - `$if()` for conditional query building
   - `eb.fn()` for function calls
   - `.with()` for CTEs (Common Table Expressions)
   - `.onConflict()` for upserts

4. **Migrations:**
   - 55 migration files in `server/src/schema/migrations/`
   - Starting from `1744910873969-InitialMigration.ts`
   - Use Kysely migration format with `up()` and `down()` methods

**Key Tables for In-Scope Features:**
- `asset` - Core asset table (photos/videos)
- `asset_exif` - EXIF metadata
- `asset_file` - File paths (thumbnails, previews, etc.)
- `asset_metadata` - Key-value metadata
- `asset_job_status` - Job processing status
- `album`, `album_asset`, `album_user` - Album tables
- `activity` - Activity (likes/comments)
- `user`, `user_metadata` - User tables
- `session` - Auth sessions
- `api_key` - API keys
- `shared_link`, `shared_link_asset` - Shared links
- `tag`, `tag_asset`, `tag_closure` - Tags (hierarchical)
- `stack` - Asset stacks
- `system_metadata` - System configuration
- `notification` - Notifications

### What It Needs to Become (D1/SQLite)

**Critical Incompatibilities:**

1. **No Extensions:** D1/SQLite has no `uuid-ossp`, `pg_trgm`, `cube`, `earthdistance`, `plpgsql`, `unaccent`
   - UUIDv7 generation must move to application code (use `crypto.randomUUID()` + timestamp prefix)
   - Trigram search needs alternative (SQLite FTS5 or application-level)
   - Geospatial features are OUT OF SCOPE (removed)

2. **No Stored Procedures/Triggers:** All trigger functions (`updated_at`, audit triggers) must become application-level logic
   - `updatedAt` must be set in application code before every update
   - Audit trail inserts must happen in service/repository code

3. **SQL Syntax Differences:**
   - `AT TIME ZONE` -> Use application-level timezone conversion
   - `::type` casting -> Use SQLite `CAST(x AS type)` or handle in application
   - `LATERAL JOIN` -> Rewrite as subqueries or multiple queries
   - `DISTINCT ON` -> Rewrite with `GROUP BY` + aggregate or window functions
   - `array_agg()` -> Use `GROUP_CONCAT()` or `json_group_array()`
   - `json_agg()` / `to_json()` -> Use `json_group_array()` / `json_object()`
   - `generate_series()` -> Application-level loop or recursive CTE
   - `bytea` -> `BLOB`
   - Custom enums -> `TEXT` with CHECK constraints
   - `interval` arithmetic -> Application-level date math
   - `make_date()` -> String concatenation or `date()`
   - `extract(epoch from ...)` -> `strftime('%s', ...)`
   - `date_trunc()` -> `strftime()` patterns
   - `unnest()` -> Application-level or JSON expansion
   - `gin` indexes -> Regular indexes or FTS5
   - `nullif(array(...))` -> Application-level
   - `encode/decode` -> Application-level hex/base64

4. **Kysely D1 Dialect:**
   - Replace `kysely-postgres-js` + `PostgresJSDialect` with `kysely` D1 dialect (community package `kysely-d1` or Cloudflare's official dialect)
   - Replace `jsonArrayFrom`/`jsonObjectFrom` from `kysely/helpers/postgres` with SQLite equivalents
   - Many raw `sql` template literals need rewriting for SQLite syntax

5. **Migrations:**
   - All 55 PostgreSQL migrations need to be collapsed into a single SQLite-compatible initial schema
   - Future migrations use D1 migration format

6. **Transaction Differences:**
   - D1 supports transactions but with limitations (no nested transactions, no advisory locks)
   - `pg_try_advisory_lock` must be replaced with application-level locking (KV-based)

**Approach:**
- Create a single initial D1 schema covering all in-scope tables
- Rewrite repository methods to use SQLite-compatible SQL
- Move all trigger logic to application code
- Generate UUIDs in application code
- Handle type casting in application code

---

## 4. Redis to KV

### What Currently Exists

Redis is used in a **very limited** capacity:

1. **WebSocket Pub/Sub Adapter** (`server/src/middleware/websocket.adapter.ts`):
   - Uses `ioredis` + `@socket.io/redis-adapter` to sync Socket.IO across multiple Node.js processes
   - Redis pub/sub enables broadcasting events between API and microservices workers

2. **App Restart Communication** (`server/src/repositories/app.repository.ts`):
   - Creates temporary Redis pub/sub clients to send restart signals across workers

3. **BullMQ Job Queue** (`server/src/repositories/job.repository.ts`):
   - Uses `bullmq` (which depends on Redis) for background job processing
   - Queue names defined in `QueueName` enum
   - This is the primary Redis usage and it is **entirely out of scope** (background jobs are removed)

4. **Configuration** (`server/src/repositories/config.repository.ts`):
   - Redis connection config from env vars: `REDIS_HOSTNAME`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_URL`
   - Fed into BullMQ and Socket.IO adapter

5. **System Config Caching** (`server/src/utils/config.ts`):
   - System configuration from `system_metadata` table is cached in-memory (not Redis)
   - Uses a simple module-level variable with TTL

### What It Needs to Become (KV)

Since Redis is used primarily for BullMQ (removed) and WebSocket pub/sub (removed), **KV replaces Redis for only a few remaining needs:**

1. **Session caching (optional performance optimization):**
   - Session validation currently hits the database on every request
   - KV can cache session data with TTL for faster lookups

2. **System configuration caching:**
   - Currently in-memory; KV provides persistent cross-request caching in Workers (since Workers have no persistent memory)

3. **Rate limiting (if needed):**
   - KV can store rate limit counters

**Key KV Limitations:**
- Eventually consistent (not suitable for strict session invalidation)
- No pub/sub (WebSocket features removed anyway)
- 25 MiB max value size
- Read-after-write may have brief inconsistency

---

## 5. Filesystem to R2

### What Currently Exists

**Storage Repository** (`server/src/repositories/storage.repository.ts`):
Heavy use of Node.js filesystem APIs:
- `fs.writeFile()`, `fs.readFile()`, `fs.readdir()`, `fs.stat()`, `fs.unlink()`, `fs.rename()`, `fs.copyFile()`, `fs.access()`, `fs.rm()`, `fs.rmdir()`, `fs.utimes()`, `fs.realpath()`, `fs.lstat()`, `fs.open()`
- `createReadStream()`, `createWriteStream()` - Streaming reads/writes
- `mkdirSync()`, `existsSync()` - Synchronous directory operations
- `archiver` - ZIP stream creation for downloads
- `chokidar` - File system watching (library imports)
- `fast-glob` - File crawling (library imports)
- `createGzip()`, `createGunzip()` - Compression streams

**Storage Core** (`server/src/cores/storage.core.ts`):
Manages file paths using a hierarchical folder structure:
```
{mediaLocation}/
  upload/{userId}/{xx}/{yy}/        # Upload staging
  library/{storageLabel|userId}/    # Original files (template-based)
  thumbs/{userId}/{xx}/{yy}/        # Thumbnails/previews
  encoded-video/{userId}/{xx}/{yy}/ # Transcoded videos
  profile/{userId}/                 # Profile pictures
```
Path generation: `StorageCore.getNestedPath(folder, ownerId, filename)` creates `{base}/{ownerId}/{first2chars}/{next2chars}/{filename}`.

**File Upload Flow** (`server/src/middleware/file-upload.interceptor.ts`):
1. `multer` with `diskStorage` receives multipart upload
2. File written to `upload/{userId}/{uuid_prefix}/` staging directory
3. SHA1 hash computed during upload stream
4. On success, file moved to permanent storage location
5. On error, staging file queued for deletion via job

**File Serving** (`server/src/utils/file.ts`):
- `sendFile()` uses Express `res.sendFile()` to serve files from disk
- Sets `Cache-Control`, `Content-Type`, `Content-Disposition` headers
- Checks file accessibility with `fs.access()`

**Download/Archive** (`server/src/services/download.service.ts`):
- Creates ZIP archives using `archiver` for multi-asset downloads
- Adds files from disk paths: `zip.addFile(realpath, filename)`
- Returns streaming response

### What It Needs to Become (R2)

**R2 Key Structure:**
Replace filesystem paths with R2 object keys:
```
assets/{userId}/{assetId}/original.{ext}     # Original file
assets/{userId}/{assetId}/preview.{format}   # Preview (generated by CF Images)
assets/{userId}/{assetId}/thumbnail.{format} # Thumbnail (generated by CF Images)
assets/{userId}/{assetId}/sidecar.xmp        # Sidecar file
profiles/{userId}/{uuid}.{ext}               # Profile pictures
```

**Upload Flow Conversion:**
1. Parse multipart in Hono (in-memory, no disk)
2. Compute SHA1 hash from buffer (`crypto.subtle.digest()`)
3. Put object directly to R2: `bucket.put(key, body, { httpMetadata: { contentType } })`
4. Store R2 key in database instead of filesystem path

**File Serving Conversion:**
1. Get R2 key from database
2. `const object = await bucket.get(key)`
3. Return `new Response(object.body, { headers })` with appropriate cache headers
4. For thumbnails/previews, use Cloudflare Images (see section 6)

**Download/Archive Conversion:**
- ZIP creation must happen in-memory or use streaming
- Workers have a 128MB memory limit, large archives need chunking
- Consider using `CompressionStream` API or a lightweight JS zip library
- Alternative: generate signed URLs for individual files instead of archives

**Key Challenges:**
1. No `rename()` equivalent in R2 - must copy + delete
2. No directory listing in R2 (flat namespace) - rely on database for file inventory
3. `chokidar` file watching is removed (library imports feature removed)
4. `fast-glob` crawling is removed (library imports feature removed)
5. Streaming uploads: R2 supports streaming puts, but multipart parsing in Workers is memory-constrained
6. Large files: Workers have CPU time limits (30s on paid plan); large uploads/downloads may need to use R2 multipart upload API
7. `archiver` library uses Node.js streams extensively - needs replacement

---

## 6. Sharp to Cloudflare Images

### What Currently Exists

**Media Repository** (`server/src/repositories/media.repository.ts`):

**Sharp Usage:**
```typescript
import sharp from 'sharp';
sharp.concurrency(0);
sharp.cache({ files: 0 });
```

Key operations:
- `generateThumbnail(input, options, output)` - Resizes images, converts format (JPEG/WebP), sets quality, writes to file
- `generateThumbhash(input, options)` - Creates tiny visual hash (100x100 resize, then `rgbaToThumbHash`)
- `getImageDimensions(input)` - Gets width/height via `sharp(input).metadata()`
- `decodeImage(input, options)` - Decodes to raw buffer with colorspace conversion
- `getImageDecodingPipeline()` - Builds Sharp pipeline with rotation, flip, colorspace, resize, edits (crop, affine transforms)

**Sharp Pipeline Details:**
- Orientation correction: EXIF-based rotation/flip/flop
- Colorspace: sRGB or RGB16
- ICC profile embedding
- Format conversion: JPEG, WebP with quality settings
- Chroma subsampling: 4:4:4 for quality >= 80, else 4:2:0
- Progressive JPEG support
- Image edits: crop, affine transforms (rotation, flip)

**Thumbnail Generation Flow:**
Currently driven by background jobs (microservices worker):
1. `MetadataService` extracts EXIF, triggers thumbnail job
2. `MediaService.handleGeneratePreview()` / `handleGenerateThumbnail()` calls `MediaRepository.generateThumbnail()`
3. Output written to disk, path stored in `asset_file` table

**ExifTool Usage** (`server/src/repositories/media.repository.ts` and `metadata.repository.ts`):
- `exiftool-vendored` - Reads EXIF metadata, extracts embedded JPEGs from RAW files
- `exiftool.extractBinaryTagToBuffer()` - Extracts preview images from RAW files
- `exiftool.write()` - Writes EXIF tags back to images
- This is a native binary that CANNOT run in Workers

**FFmpeg Usage:**
- `fluent-ffmpeg` - Video transcoding, probing
- `ffmpeg.ffprobe()` - Gets video metadata (duration, streams, codecs)
- `transcode()` - Video transcoding (single/two-pass)
- Entirely removed per spec (serve original videos)

### What It Needs to Become (Cloudflare Images)

**On-Upload Processing:**
1. Upload original to R2
2. Use Cloudflare Images (via worker binding) to generate thumbnails on-demand or at upload time
3. Store generated variants in R2 for caching

**Cloudflare Images Integration:**
```typescript
// Via worker binding (images binding in wrangler.toml)
const transformed = await env.IMAGES.transform(originalR2Object, {
  width: 250,
  height: 250,
  fit: 'outside',
  format: 'webp',
  quality: 80,
});
// Cache the result in R2
await env.BUCKET.put(`assets/${userId}/${assetId}/thumbnail.webp`, transformed.body);
```

**Variant Strategy:**
- `thumbnail` - 250x250, WebP, quality 80
- `preview` - 1440px longest edge, WebP, quality 80
- `fullsize` - Original dimensions, WebP (optional)
- Cache variants in R2 so they only need to be generated once

**Thumbhash Generation:**
- The `thumbhash` library is pure JavaScript and can run in Workers
- Need to decode image to raw RGBA first - can use Cloudflare Images to resize to 100x100 and return raw pixels, or use a WASM-based decoder

**Key Challenges:**
1. **EXIF extraction:** `exiftool-vendored` is a native binary. Must use a pure JS EXIF parser (e.g., `exif-reader`, `exifreader`) or extract EXIF from R2 object metadata
2. **RAW file handling:** Cannot extract embedded JPEGs from RAW files without ExifTool. Options: (a) require users to upload processed formats, (b) use a WASM-based extractor, (c) skip RAW support initially
3. **Image edits (crop, rotate, affine):** Cloudflare Images supports basic transforms (fit, width, height, rotate) but not arbitrary affine transforms. Complex edits may need a WASM image processing library
4. **Orientation correction:** Cloudflare Images handles EXIF orientation automatically
5. **Format conversion:** Cloudflare Images supports WebP, AVIF, JPEG output
6. **No video thumbnails:** FFmpeg cannot run in Workers. Video thumbnails would require an external service or simply not be generated

---

## 7. Node.js APIs to Workers-Compatible Alternatives

### `node:crypto`

**Used in:** `server/src/repositories/crypto.repository.ts`, `server/src/middleware/file-upload.interceptor.ts`, `server/src/sql-tools/helpers.ts`, `server/src/cores/storage.core.ts`

| Node.js API | Usage | Workers Alternative |
|---|---|---|
| `randomUUID()` | Generate asset/session IDs | `crypto.randomUUID()` (available in Workers) |
| `randomBytes(size)` | Generate session tokens | `crypto.getRandomValues(new Uint8Array(size))` |
| `createHash('sha256').update(val).digest('base64')` | Hash API keys, sessions | `crypto.subtle.digest('SHA-256', data)` then base64 encode |
| `createHash('sha1').update(val).digest()` | Checksum files during upload | `crypto.subtle.digest('SHA-1', data)` |
| `createReadStream` (for hashing) | Stream file hash | Hash from ArrayBuffer in memory |
| `createPublicKey`, `createVerify` | License verification | `crypto.subtle.importKey()` + `crypto.subtle.verify()` |

**`bcrypt` (native module):**
- Used in `crypto.repository.ts` for password hashing: `hash()`, `compareSync()`
- **Cannot run in Workers** (native C++ addon)
- Replace with `bcryptjs` (pure JS) or use Web Crypto `PBKDF2`/`Argon2` via WASM

**`jsonwebtoken`:**
- Used for JWT sign/verify in `crypto.repository.ts`
- Replace with `jose` (already a dependency, Workers-compatible) or use Web Crypto directly

### `node:fs` and `node:fs/promises`

**Used in:** `server/src/repositories/storage.repository.ts`, `server/src/app.common.ts`, `server/src/constants.ts`, `server/src/services/api.service.ts`, multiple services

All filesystem operations replaced by R2 (see section 5). Summary:

| Node.js API | Workers Alternative |
|---|---|
| `readFile`, `writeFile` | R2 `get()`, `put()` |
| `createReadStream`, `createWriteStream` | R2 streaming body |
| `stat`, `access` | R2 `head()` |
| `unlink`, `rm` | R2 `delete()` |
| `rename` | R2 `put()` + `delete()` |
| `copyFile` | R2 `put()` with source body |
| `mkdir`, `mkdirSync` | Not needed (R2 is flat namespace) |
| `readdir` | R2 `list()` |
| `existsSync` | R2 `head()` |
| `readFileSync` | Not available; use KV or embed at build time |

### `node:path`

**Used extensively** in storage paths, file naming, URL construction.

| Node.js API | Workers Alternative |
|---|---|
| `join()` | Simple string concatenation with `/` |
| `dirname()`, `basename()`, `extname()` | Simple string manipulation or polyfill |
| `resolve()`, `isAbsolute()` | Not needed for R2 keys |
| `parse()` | Simple string split |

### `node:stream`

**Used in:** `server/src/repositories/storage.repository.ts`, `server/src/services/download.service.ts`, `server/src/services/sync.service.ts`

| Node.js API | Workers Alternative |
|---|---|
| `Readable`, `Writable` | Web Streams API (`ReadableStream`, `WritableStream`) |
| `PassThrough` | `TransformStream` |
| `createReadStream` | R2 object body (already a `ReadableStream`) |

### `node:http`

**Used for:** `IncomingHttpHeaders` type in auth service

Replace with Hono's `Context` header access: `c.req.header('authorization')` etc.

### `node:child_process` and `node:worker_threads`

**Used in:** `server/src/main.ts` (worker spawning), `server/src/maintenance/maintenance-health.repository.ts`

**Entirely removed.** Workers are single-threaded. No child processes, no worker threads.

### `node:zlib`

**Used in:** `server/src/repositories/storage.repository.ts` (`createGzip`, `createGunzip`)

Replace with Web `CompressionStream` / `DecompressionStream` APIs (available in Workers).

### `node:timers/promises`

**Used in:** `server/src/repositories/job.repository.ts` (`setTimeout`)

Not needed (job processing removed). If needed elsewhere, use `scheduler.wait()` or `new Promise(r => setTimeout(r, ms))`.

### `node:util`

**Used in:** `server/src/utils/file.ts` (`promisify`)

Not needed - use native Promises.

### `process.env`

**Used extensively** in `server/src/repositories/config.repository.ts`.

Replace with Cloudflare Worker environment bindings (`env.DB`, `env.BUCKET`, `env.KV`, `env.IMAGES`) and wrangler.toml configuration.

---

## 8. Dependencies: Keep, Replace, or Remove

### REMOVE (NestJS/Express ecosystem)
| Package | Reason |
|---|---|
| `@nestjs/*` (all 9 packages) | Replaced by Hono |
| `@nestjs/bullmq`, `bullmq` | Job queue removed |
| `@nestjs/platform-express`, `express` | Replaced by Hono |
| `@nestjs/platform-socket.io`, `@nestjs/websockets`, `socket.io` | WebSocket removed |
| `@nestjs/schedule`, `cron` | Scheduled jobs removed |
| `@nestjs/swagger` | API docs removed (or use Hono OpenAPI) |
| `nestjs-cls` | Request context removed |
| `nestjs-kysely` | Direct Kysely usage |
| `nestjs-otel` | Telemetry removed |
| `nest-commander` | CLI removed |
| `body-parser` | Hono has built-in parsing |
| `compression` | Workers handles compression |
| `cookie-parser` | Parse cookies manually or use Hono middleware |
| `multer` | Use Hono multipart or manual parsing |
| `sirv` | Workers serves static assets differently |
| `reflect-metadata` | NestJS dependency |
| `rxjs` | NestJS dependency |
| `class-transformer`, `class-validator` | Replace with Zod or manual validation |

### REMOVE (native/incompatible)
| Package | Reason |
|---|---|
| `sharp` | Replaced by Cloudflare Images |
| `bcrypt` | Native addon; replace with `bcryptjs` or WASM |
| `exiftool-vendored` | Native binary; replace with JS EXIF parser |
| `fluent-ffmpeg` | FFmpeg removed |
| `pg`, `pg-connection-string`, `postgres` | PostgreSQL removed |
| `kysely-postgres-js` | Replace with D1 dialect |
| `archiver` | Node.js streams; replace with JS zip library |
| `chokidar` | File watching removed |
| `fast-glob` | File crawling removed |
| `nodemailer` | Email sending removed or use external service |
| `@socket.io/redis-adapter`, `ioredis` | Redis removed |
| `@opentelemetry/*` (all packages) | Telemetry removed |
| `async-lock` | Use D1 transactions or KV |
| `geo-tz` | Geospatial removed |
| `i18n-iso-countries` | Map feature removed |
| `openid-client` | OAuth can use `jose` directly |
| `@extism/extism` | Plugin system removed |

### REMOVE (feature-specific)
| Package | Reason |
|---|---|
| `@react-email/components`, `@react-email/render`, `react`, `react-dom`, `react-email` | Email templates removed |
| `tailwindcss-preset-email` | Email templates removed |
| `handlebars` | Template removed |
| `mnemonist` | Data structures for ML features |

### KEEP (compatible with Workers)
| Package | Usage | Notes |
|---|---|---|
| `kysely` | Query builder | Use with D1 dialect |
| `jose` | JWT handling | Already Workers-compatible |
| `cookie` | Cookie parsing | Pure JS |
| `luxon` | Date/time handling | Pure JS |
| `lodash` | Utilities | Pure JS (consider tree-shaking) |
| `uuid` | UUID generation | Pure JS |
| `semver` | Version comparison | Pure JS |
| `sanitize-filename` | Filename sanitization | Pure JS |
| `sanitize-html` | HTML sanitization | Pure JS |
| `thumbhash` | Visual hashing | Pure JS |
| `transformation-matrix` | Image transform math | Pure JS |
| `ua-parser-js` | User agent parsing | Pure JS |
| `validator` | String validation | Pure JS |
| `picomatch` | Glob matching | Pure JS |
| `js-yaml` | YAML parsing | Pure JS (for config files) |
| `ajv` | JSON schema validation | Pure JS |

### REPLACE
| Package | Current Usage | Replacement |
|---|---|---|
| `bcrypt` | Password hashing | `bcryptjs` (pure JS) |
| `jsonwebtoken` | JWT sign/verify | `jose` (already imported) |
| `kysely-postgres-js` | Kysely PG dialect | `kysely-d1` or similar |
| `archiver` | ZIP creation | `fflate` or `client-zip` (Workers-compatible) |

---

## 9. Features/Code to Remove Entirely

### Controllers to Remove
| Controller | Feature |
|---|---|
| `job.controller.ts` | Background job management |
| `queue.controller.ts` | Queue management |
| `library.controller.ts` | External library imports |
| `person.controller.ts` | Facial recognition |
| `face.controller.ts` | Face management |
| `duplicate.controller.ts` | Duplicate detection |
| `search.controller.ts` | Smart search (ML-based) |
| `map.controller.ts` | Map/geospatial |
| `sync.controller.ts` | Device sync protocol |
| `database-backup.controller.ts` | Database backup |
| `system-config.controller.ts` | Most system config (simplify) |
| `system-metadata.controller.ts` | System metadata admin |
| `notification-admin.controller.ts` | Notification admin |
| `notification.controller.ts` | Notifications |
| `oauth.controller.ts` | OAuth (simplify auth) |
| `plugin.controller.ts` | Plugin system |
| `workflow.controller.ts` | Workflow automation |
| `view.controller.ts` | Views |
| `timeline.controller.ts` | Timeline (can keep as simplified version) |
| `maintenance.controller.ts` | Maintenance mode |

### Services to Remove
All corresponding services for the above controllers, plus:
- `media.service.ts` - Thumbnail/transcode orchestration (replaced by CF Images)
- `metadata.service.ts` - EXIF extraction jobs (simplified)
- `smart-info.service.ts` - ML embeddings
- `ocr.service.ts` - OCR processing
- `library.service.ts` - External library management
- `person.service.ts` - Facial recognition
- `duplicate.service.ts` - Duplicate detection
- `backup.service.ts` - Database backup
- `database-backup.service.ts` - Database backup
- `cli.service.ts` - CLI commands
- `telemetry.service.ts` - Telemetry
- `queue.service.ts` - Queue management
- `storage-template.service.ts` - Storage template migration
- `plugin.service.ts` - Plugin system
- `workflow.service.ts` - Workflows
- `notification.service.ts` / `notification-admin.service.ts` - Notifications
- `database.service.ts` - Database management/migrations (handled differently)

### Repositories to Remove
- `machine-learning.repository.ts` - ML inference
- `job.repository.ts` - BullMQ job queue
- `cron.repository.ts` - Scheduled tasks
- `map.repository.ts` - Geospatial queries
- `search.repository.ts` - Vector/smart search
- `duplicate.repository.ts` - Duplicate detection
- `ocr.repository.ts` - OCR
- `email.repository.ts` - Email sending
- `notification.repository.ts` - Notifications
- `websocket.repository.ts` - WebSocket (or drastically simplify)
- `telemetry.repository.ts` - Telemetry
- `process.repository.ts` - Process management
- `app.repository.ts` - App restart/process management
- `plugin.repository.ts` - Plugins
- `workflow.repository.ts` - Workflows
- `library.repository.ts` - External libraries
- `person.repository.ts` - Facial recognition
- `metadata.repository.ts` - ExifTool (rewrite as pure-JS EXIF reader)

### Database Tables to Remove
- `face_search`, `asset_face`, `asset_face_audit` - Facial recognition
- `smart_search` - ML embeddings
- `asset_ocr`, `ocr_search` - OCR
- `geodata_places`, `naturalearth_countries` - Maps
- `library` - External libraries
- `person`, `person_audit` - People/faces
- `duplicate` - Duplicate detection
- `plugin`, `plugin_filter`, `plugin_action` - Plugins
- `workflow`, `workflow_filter`, `workflow_action` - Workflows
- `notification` - Notifications (unless keeping basic notifications)
- `move_history` - File moves (R2 doesn't need move tracking)
- `audit` - Audit log (or simplify)
- `asset_job_status` - Job tracking

### Entire Directories to Remove
- `server/src/workers/` - Node.js worker threads
- `server/src/commands/` - CLI commands
- `server/src/maintenance/` - Maintenance mode
- `server/src/emails/` - Email templates
- `server/src/sql-tools/` - Schema diffing tools (or keep for development)

---

## 10. In-Scope Feature Mapping

### Asset CRUD

**Current Flow:**
1. Upload: `AssetMediaController.uploadAsset()` -> `AssetMediaService.uploadAsset()` -> multer writes to disk -> SHA1 hash -> create DB record -> queue metadata extraction job
2. View: `AssetMediaController.viewAsset()` -> `AssetMediaService.viewThumbnail()` -> reads file from disk via `sendFile()`
3. Download: `AssetMediaController.downloadAsset()` -> `AssetMediaService.downloadOriginal()` -> streams file from disk
4. Delete: `AssetController.deleteAssets()` -> `AssetService.deleteAssets()` -> soft-delete in DB -> queue file deletion job

**New Flow:**
1. Upload: Hono multipart parse -> SHA1 hash in memory -> R2 put -> create D1 record -> trigger CF Images thumbnail generation (inline or via queue)
2. View: Get R2 key from D1 -> serve CF Images variant (or cached R2 thumbnail)
3. Download: Get R2 key from D1 -> R2 get -> stream response
4. Delete: Soft-delete in D1 -> R2 delete (can be deferred)

**Key Files:**
- `server/src/controllers/asset-media.controller.ts`
- `server/src/controllers/asset.controller.ts`
- `server/src/services/asset-media.service.ts`
- `server/src/services/asset.service.ts`
- `server/src/repositories/asset.repository.ts`

### Album CRUD

**Current Flow:** Standard CRUD via `AlbumController` -> `AlbumService` -> `AlbumRepository` (Kysely queries)

**New Flow:** Same pattern with Hono routes, D1 queries. Relatively straightforward conversion since album operations are mostly database CRUD.

**Key Files:**
- `server/src/controllers/album.controller.ts`
- `server/src/services/album.service.ts`
- `server/src/repositories/album.repository.ts`
- `server/src/repositories/album-user.repository.ts`

### Activity CRUD

**Current Flow:** `ActivityController` -> `ActivityService` -> `ActivityRepository`. Simple likes/comments on albums/assets.

**New Flow:** Direct conversion. Simple CRUD with access control checks.

**Key Files:**
- `server/src/controllers/activity.controller.ts`
- `server/src/services/activity.service.ts`
- `server/src/repositories/activity.repository.ts`

### Metadata CRUD

**Current Flow:**
- EXIF extracted by background job using `exiftool-vendored`
- Stored in `asset_exif` table
- Additional key-value metadata in `asset_metadata` table
- Tags via `tag`/`tag_asset`/`tag_closure` tables

**New Flow:**
- Basic EXIF extraction at upload time using pure-JS library (limited compared to ExifTool)
- Key-value metadata CRUD unchanged (simple DB operations)
- Tag CRUD unchanged

**Key Files:**
- `server/src/repositories/asset.repository.ts` (upsertExif, getMetadata, upsertMetadata, etc.)
- `server/src/controllers/tag.controller.ts`
- `server/src/services/tag.service.ts`

### Auth CRUD

**Current Flow:**
1. Login: `AuthController.login()` -> `AuthService.login()` -> bcrypt compare password -> create session token (random bytes) -> SHA256 hash -> store in `session` table
2. Validate: `AuthGuard.canActivate()` -> `AuthService.authenticate()` -> extract token from header/cookie/query -> SHA256 hash -> lookup in `session` table
3. API Key: SHA256 hash of key -> lookup in `api_key` table
4. Shared Links: lookup by key bytes or slug in `shared_link` table

**New Flow:**
- Same logic with Workers-compatible crypto (`crypto.subtle`)
- bcrypt replaced with `bcryptjs`
- Session storage in D1 (with optional KV caching)
- Same token-based auth model

**Key Files:**
- `server/src/controllers/auth.controller.ts`
- `server/src/controllers/auth-admin.controller.ts`
- `server/src/services/auth.service.ts`
- `server/src/middleware/auth.guard.ts`
- `server/src/repositories/crypto.repository.ts`
- `server/src/repositories/session.repository.ts`
- `server/src/repositories/api-key.repository.ts`
- `server/src/repositories/shared-link.repository.ts`

---

## Summary of Conversion Effort by Area

| Area | Effort | Risk | Notes |
|---|---|---|---|
| NestJS -> Hono routing | Medium | Low | Mechanical conversion of 15-20 controllers |
| DI/BaseService pattern | Medium | Medium | Need to restructure dependency wiring |
| Auth middleware | Low | Low | Straightforward middleware conversion |
| Validation (class-validator -> Zod/manual) | Medium | Medium | Many DTOs to convert |
| PostgreSQL -> D1 schema | High | High | Major SQL syntax differences, many rewriting needed |
| Kysely queries -> D1 compatible | High | High | PostgreSQL-specific SQL throughout repositories |
| Triggers -> app logic | Medium | Medium | updatedAt, audit triggers |
| Redis -> KV | Low | Low | Minimal Redis usage |
| Filesystem -> R2 | Medium | Medium | Well-isolated in storage repository |
| File upload flow | Medium | Medium | Multer -> in-memory multipart |
| Sharp -> CF Images | Medium | Medium | Thumbnail generation strategy change |
| ExifTool -> pure JS | Medium | High | Significant capability reduction |
| FFmpeg removal | Low | Low | Just remove video processing |
| bcrypt -> bcryptjs | Low | Low | Drop-in pure JS replacement |
| Node.js crypto -> Web Crypto | Low | Low | Standard Web Crypto APIs |
| Feature removal | Medium | Low | Remove ~60% of codebase |
| Streaming/downloads | Medium | Medium | Node streams -> Web streams, ZIP generation |
