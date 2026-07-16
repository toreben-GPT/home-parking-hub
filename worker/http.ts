import type { ApiErrorPayload } from "../src/shared/types";

export class HttpError extends Error {
  readonly status: number;
  readonly details?: string;

  constructor(status: number, message: string, details?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}
export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function errorResponse(error: HttpError): Response {
  const payload: ApiErrorPayload = { error: error.message };
  if (error.details) payload.details = error.details;
  return jsonResponse(payload, { status: error.status });
}

export async function readJson(request: Request, maxBytes = 1024 * 1024): Promise<unknown> {
  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/plain")) {
    throw new HttpError(415, "JSON形式のデータを送信してください。");
  }

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, "送信データが大きすぎます。");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, "送信データが大きすぎます。");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "JSONの形式が正しくありません。");
  }
}

export function requireCsrfHeader(request: Request): void {
  if (request.headers.get("X-Requested-With") !== "home-parking-hub") {
    throw new HttpError(
      403,
      "安全確認用のヘッダーがありません。画面を再読み込みして、もう一度お試しください。",
    );
  }
}

export function methodNotAllowed(allowed: readonly string[]): Response {
  return jsonResponse(
    { error: "この操作方法には対応していません。" } satisfies ApiErrorPayload,
    { status: 405, headers: { Allow: allowed.join(", ") } },
  );
}
