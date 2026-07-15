import { SESSION_MAX_AGE_DAYS } from "../src/shared/constants";
import type { Env } from "./env";
import { HttpError } from "./http";

export const SESSION_COOKIE_NAME = "__Host-home-parking-hub-session";
export const LOCAL_SESSION_COOKIE_NAME = "home-parking-hub-local-session";

interface SessionPayload {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let mismatch = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function verifyAccessCode(provided: string, expected: string): Promise<boolean> {
  const [providedDigest, expectedDigest] = await Promise.all([sha256(provided), sha256(expected)]);
  return constantTimeBytesEqual(providedDigest, expectedDigest);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export function getSessionMaxAgeSeconds(env: Env): number {
  const raw = env.SESSION_MAX_AGE_DAYS ?? String(SESSION_MAX_AGE_DAYS);
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new HttpError(500, "セッション有効期限の設定が正しくありません。");
  }
  return days * 24 * 60 * 60;
}

export function assertAuthConfiguration(env: Env): void {
  if (typeof env.ACCESS_CODE !== "string" || env.ACCESS_CODE.length < 20 || env.ACCESS_CODE.length > 256) {
    throw new HttpError(500, "アクセスコードは20文字以上で設定してください。");
  }
  if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) {
    throw new HttpError(500, "セッション署名用の秘密情報が正しく設定されていません。");
  }
  getSessionMaxAgeSeconds(env);
}

export async function createSessionToken(
  secret: string,
  maxAgeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: SessionPayload = {
    v: 1,
    iat: nowSeconds,
    exp: nowSeconds + maxAgeSeconds,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = toBase64Url(await hmac(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  maxAgeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encodedPayload, encodedSignature] = parts;
  const signature = fromBase64Url(encodedSignature);
  if (!signature) return false;

  const expectedSignature = await hmac(encodedPayload, secret);
  if (!constantTimeBytesEqual(signature, expectedSignature)) return false;

  const payloadBytes = fromBase64Url(encodedPayload);
  if (!payloadBytes) return false;
  try {
    const payload = JSON.parse(decoder.decode(payloadBytes)) as Partial<SessionPayload>;
    return (
      payload.v === 1 &&
      Number.isInteger(payload.iat) &&
      Number.isInteger(payload.exp) &&
      typeof payload.iat === "number" &&
      typeof payload.exp === "number" &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 16 &&
      payload.iat <= nowSeconds + 300 &&
      payload.exp > nowSeconds &&
      payload.exp > payload.iat &&
      payload.exp - payload.iat <= maxAgeSeconds
    );
  } catch {
    return false;
  }
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure = true): string {
  const values = [
    `${secure ? SESSION_COOKIE_NAME : LOCAL_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) values.push("Secure");
  return values.join("; ");
}

export function clearSessionCookie(secure = true): string {
  const values = [
    `${secure ? SESSION_COOKIE_NAME : LOCAL_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) values.push("Secure");
  return values.join("; ");
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  assertAuthConfiguration(env);
  const secure = new URL(request.url).protocol === "https:";
  const token = getCookie(request, secure ? SESSION_COOKIE_NAME : LOCAL_SESSION_COOKIE_NAME);
  if (!token) return false;
  return verifySessionToken(token, env.SESSION_SECRET, getSessionMaxAgeSeconds(env));
}
