import { describe, expect, it } from "vitest";
import {
  assertLoginAttemptAllowed,
  clearLoginFailures,
  hashLoginClient,
  LOGIN_FAILURE_LIMIT,
  LOGIN_FAILURE_WINDOW_SECONDS,
  recordFailedLogin,
} from "./login-rate-limit";

interface StoredRateLimitRow {
  failed_count: number;
  window_started_at: number;
  updated_at: number;
}

function createFakeD1(): D1Database {
  const rows = new Map<string, StoredRateLimitRow>();

  return {
    prepare(sql: string) {
      let values: unknown[] = [];
      const normalized = sql.replace(/\s+/gu, " ").trim();
      const statement = {
        bind(...boundValues: unknown[]) {
          values = boundValues;
          return statement;
        },
        async first<T>() {
          if (normalized.startsWith("SELECT failed_count")) {
            return (rows.get(String(values[0])) ?? null) as T | null;
          }
          if (normalized.startsWith("INSERT INTO login_rate_limits")) {
            const clientHash = String(values[0]);
            const nowSeconds = Number(values[1]);
            const current = rows.get(clientHash);
            const next: StoredRateLimitRow = {
              failed_count: (current?.failed_count ?? 0) + 1,
              window_started_at: current?.window_started_at ?? nowSeconds,
              updated_at: Number(values[2]),
            };
            rows.set(clientHash, next);
            return next as T;
          }
          throw new Error(`Unexpected first() query: ${normalized}`);
        },
        async run() {
          if (normalized === "DELETE FROM login_rate_limits WHERE window_started_at <= ?") {
            const cutoff = Number(values[0]);
            for (const [clientHash, row] of rows) {
              if (row.window_started_at <= cutoff) rows.delete(clientHash);
            }
          } else if (normalized === "DELETE FROM login_rate_limits WHERE client_hash = ?") {
            rows.delete(String(values[0]));
          } else {
            throw new Error(`Unexpected run() query: ${normalized}`);
          }
          return { success: true } as D1Result;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  } as D1Database;
}

describe("D1 login rate limit", () => {
  it("stores an HMAC of CF-Connecting-IP instead of the raw address", async () => {
    const secret = "s".repeat(32);
    const first = await hashLoginClient(
      new Request("https://example.com", { headers: { "CF-Connecting-IP": "203.0.113.8" } }),
      secret,
    );
    const same = await hashLoginClient(
      new Request("https://example.com", { headers: { "CF-Connecting-IP": "203.0.113.8" } }),
      secret,
    );
    const different = await hashLoginClient(
      new Request("https://example.com", { headers: { "CF-Connecting-IP": "203.0.113.9" } }),
      secret,
    );

    expect(first).toHaveLength(64);
    expect(first).not.toContain("203.0.113.8");
    expect(same).toBe(first);
    expect(different).not.toBe(first);
  });

  it("returns 429 on the fifth failure and clears failures after a success", async () => {
    const db = createFakeD1();
    const clientHash = "a".repeat(64);
    const nowSeconds = 10_000;

    await expect(assertLoginAttemptAllowed(db, clientHash, nowSeconds)).resolves.toBeUndefined();
    for (let attempt = 1; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      await expect(recordFailedLogin(db, clientHash, nowSeconds)).resolves.toBeUndefined();
    }
    await expect(recordFailedLogin(db, clientHash, nowSeconds)).rejects.toMatchObject({ status: 429 });
    await expect(assertLoginAttemptAllowed(db, clientHash, nowSeconds)).rejects.toMatchObject({ status: 429 });

    await clearLoginFailures(db, clientHash);
    await expect(assertLoginAttemptAllowed(db, clientHash, nowSeconds)).resolves.toBeUndefined();
  });

  it("starts a fresh window after ten minutes", async () => {
    const db = createFakeD1();
    const clientHash = "b".repeat(64);
    const nowSeconds = 20_000;

    for (let attempt = 1; attempt <= LOGIN_FAILURE_LIMIT; attempt += 1) {
      try {
        await recordFailedLogin(db, clientHash, nowSeconds);
      } catch {
        // The fifth failure intentionally returns 429 after recording the attempt.
      }
    }

    const nextWindow = nowSeconds + LOGIN_FAILURE_WINDOW_SECONDS;
    await expect(assertLoginAttemptAllowed(db, clientHash, nextWindow)).resolves.toBeUndefined();
    await expect(recordFailedLogin(db, clientHash, nextWindow)).resolves.toBeUndefined();
  });
});
