# Immich on Cloudflare Workers

> **This is an experiment and is not meant for actual use.** It is a proof-of-concept exploring whether a complex photo management platform can run on Cloudflare's serverless edge infrastructure. Expect missing features, rough edges, and breaking changes.

This project is a fork of [Immich](https://github.com/immich-app/immich) that replaces the traditional Node.js/PostgreSQL backend with a serverless stack built on Cloudflare Workers. The original SvelteKit web frontend is preserved largely intact.

## Architecture

| Component | Original Immich | This Fork |
|-----------|----------------|-----------|
| Backend framework | NestJS | Hono |
| Database | PostgreSQL | Cloudflare D1 (SQLite) |
| Object storage | Local filesystem / S3 | Cloudflare R2 |
| Cache | Redis | Cloudflare KV |
| Runtime | Node.js | Cloudflare Workers |

## What works

- Photo upload, browsing, and download
- Album management
- User authentication (password + API key)
- Mobile app sync protocol
- Shared links
- Timeline and memories
- Search
- Tags and activities

## What was intentionally removed

- ML features (facial recognition, smart search, CLIP, OCR)
- Video transcoding
- Background job processing
- Real-time WebSocket events (stubbed)
- OAuth
- Email notifications
- Telemetry

## Project structure

```
server/          Cloudflare Workers backend (Hono)
  src/
    controllers/ API endpoint handlers
    services/    Business logic
    repositories/ Data access layer
    routes/      Hono route definitions
    middleware/  Auth, error handling
    dtos/        Request/response validation
    schema/      Database table types (Kysely)
  migrations/    D1 SQL migrations
  wrangler.toml  Workers configuration

web/             SvelteKit frontend (SPA)
  src/
    routes/      Page routes
    lib/         Components, stores, utilities

i18n/            Internationalization (80+ languages)
```

## Development

### Server

```sh
cd server
npm install
npm run dev    # starts wrangler dev on 0.0.0.0:8787
```

### Web

```sh
cd web
npm install
npm run dev    # starts vite dev on 0.0.0.0:3000
```

## Deployment

The server is deployed to Cloudflare Workers via `wrangler deploy`. The web frontend is built as a static SPA and served through the Workers assets binding. Required Cloudflare resources:

- **D1 database** for structured data
- **R2 bucket** (`immich-media`) for photo/video storage
- **KV namespace** for caching

## License

GNU Affero General Public License v3 (inherited from upstream Immich).
