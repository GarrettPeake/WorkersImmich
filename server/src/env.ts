export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  KV: KVNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}
