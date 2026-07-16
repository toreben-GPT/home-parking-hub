import { HttpError } from "./http";

export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 10 * 60;

interface LoginRateLimitRow {
  failed_count: number;
  window_started_at: number;
}

interface LoginRateLimitStatus {
  blocked: boolean;
  retryAfterSeconds: number;
}

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashLoginClient(request: Request, secret: string): Promise<string> {
  const connectingIp = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`home-parking-hub-login:${connectingIp}`),
  );
  return toHex(new Uint8Array(digest));
}

export function getLoginRateLimitStatus(
  row: LoginRateLimitRow | null,
  nowSeconds: number,
): LoginRateLimitStatus {
  if (!row) return { blocked: false, retryAfterSeconds: 0 };
  const retryAfterSeconds = Math.max(
    0,
    row.window_started_at + LOGIN_FAILURE_WINDOW_SECONDS - nowSeconds,
  );
  return {
    blocked: row.failed_count >= LOGIN_FAILURE_LIMIT && retryAfterSeconds > 0,
    retryAfterSeconds,
  };
}

function rateLimitError(status: LoginRateLimitStatus): HttpError {
  const minutes = Math.max(1, Math.ceil(status.retryAfterSeconds / 60));
  return new HttpError(
    429,
    `ログイン試行が多すぎます。${minutes}分ほど待ってから、もう一度お試しください。`,
  );
}

export async function assertLoginAttemptAllowed(
  db: D1Database,
  clientHash: string,
  nowSeconds: number,
): Promise<void> {
  const row = await db
    .prepare(
      "SELECT failed_count, window_started_at FROM login_rate_limits WHERE client_hash = ?",
    )
    .bind(clientHash)
    .first<LoginRateLimitRow>();
  const status = getLoginRateLimitStatus(row, nowSeconds);
  if (status.blocked) throw rateLimitError(status);
}

export async function recordFailedLogin(
  db: D1Database,
  clientHash: string,
  nowSeconds: number,
): Promise<void> {
  const resetBefore = nowSeconds - LOGIN_FAILURE_WINDOW_SECONDS;
  await db
    .prepare("DELETE FROM login_rate_limits WHERE window_started_at <= ?")
    .bind(resetBefore)
    .run();

  const row = await db
    .prepare(
      `INSERT INTO login_rate_limits (
        client_hash, failed_count, window_started_at, updated_at
      ) VALUES (?, 1, ?, ?)
      ON CONFLICT(client_hash) DO UPDATE SET
        failed_count = login_rate_limits.failed_count + 1,
        updated_at = excluded.updated_at
      RETURNING failed_count, window_started_at`,
    )
    .bind(clientHash, nowSeconds, nowSeconds)
    .first<LoginRateLimitRow>();

  if (!row) throw new Error("Failed to record login rate limit state");
  const status = getLoginRateLimitStatus(row, nowSeconds);
  if (status.blocked) throw rateLimitError(status);
}

export async function clearLoginFailures(db: D1Database, clientHash: string): Promise<void> {
  await db.prepare("DELETE FROM login_rate_limits WHERE client_hash = ?").bind(clientHash).run();
}
