/**
 * ServiceContext — central service container replacing NestJS DI.
 *
 * Created once per request (or cached where possible) and threaded through
 * all services and repositories.  Lightweight: only references to bindings
 * and a shared Kysely instance.
 */

import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { DB } from './schema';
import type { Env } from './env';
import { CryptoRepository } from './repositories/crypto.repository';

// ---------------------------------------------------------------------------
// ServiceContext interface
// ---------------------------------------------------------------------------

export interface ServiceContext {
  /** Kysely query builder wired to Cloudflare D1. */
  db: Kysely<DB>;
  /** Cloudflare R2 bucket for asset storage. */
  bucket: R2Bucket;
  /** Cloudflare KV namespace for caching / config. */
  kv: KVNamespace;
  /** Raw environment bindings. */
  env: Env;
  /** Workers-compatible crypto utilities. */
  crypto: CryptoRepository;
}

// ---------------------------------------------------------------------------
// Kysely instance cache
// ---------------------------------------------------------------------------

/**
 * Cache the Kysely instance across requests for the same D1 binding.
 * D1Dialect is lightweight and the Kysely instance is stateless, so
 * reusing it avoids unnecessary object creation on every request.
 *
 * WeakMap keyed on the D1Database binding object — when the binding is
 * garbage-collected (isolate recycle), the cached instance goes with it.
 */
const kyselyCache = new WeakMap<D1Database, Kysely<DB>>();

function getOrCreateDb(d1: D1Database): Kysely<DB> {
  let db = kyselyCache.get(d1);
  if (!db) {
    db = new Kysely<DB>({
      dialect: new D1Dialect({ database: d1 }),
    });
    kyselyCache.set(d1, db);
  }
  return db;
}

// ---------------------------------------------------------------------------
// Singleton crypto repository (stateless, safe to share)
// ---------------------------------------------------------------------------

const cryptoSingleton = new CryptoRepository();

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a ServiceContext from Cloudflare environment bindings.
 *
 * Cheap to call per request — the expensive parts (Kysely, CryptoRepository)
 * are cached / shared.
 */
export function createServiceContext(env: Env): ServiceContext {
  return {
    db: getOrCreateDb(env.DB),
    bucket: env.BUCKET,
    kv: env.KV,
    env,
    crypto: cryptoSingleton,
  };
}
