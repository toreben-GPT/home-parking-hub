export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  ACCESS_CODE: string;
  SESSION_SECRET: string;
  SESSION_MAX_AGE_DAYS?: string;
}
